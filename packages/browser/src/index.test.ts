import { describe, expect, it, vi } from 'vitest';
import { ValidationError } from '@latimer-woods-tech/errors';
import { createBrowserClient, mintBrowserAgentIdToken } from './index.js';

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

async function createServiceAccountKey(): Promise<{ client_email: string; private_key: string }> {
  const keyPair = await crypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true,
    ['sign', 'verify'],
  );
  const pkcs8 = new Uint8Array(await crypto.subtle.exportKey('pkcs8', keyPair.privateKey));
  return {
    client_email: 'browser-agent-sa@factory-495015.iam.gserviceaccount.com',
    private_key: `-----BEGIN PRIVATE KEY-----\n${bytesToBase64(pkcs8)}\n-----END PRIVATE KEY-----\n`,
  };
}

describe('createBrowserClient', () => {
  it('scrapes through the Browser Agent with a Google bearer token', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      url: 'https://example.com/',
      scrapedAt: '2026-05-15T00:00:00.000Z',
      results: { title: { selector: 'h1', text: ['Example'] } },
    }), { status: 200, headers: { 'content-type': 'application/json' } }));
    const getIdToken = vi.fn().mockResolvedValue('id-token');
    const client = createBrowserClient({
      agentUrl: 'https://browser-agent.example.run.app',
      audience: 'https://browser-agent.example.run.app',
      serviceAccountKey: { client_email: 'x', private_key: 'y' },
    }, { fetch, getIdToken });

    const result = await client.scrape('https://example.com', { title: 'h1' });

    expect(result.results['title']?.text).toEqual(['Example']);
    expect(getIdToken).toHaveBeenCalledWith('https://browser-agent.example.run.app/');
    const [url, init] = fetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://browser-agent.example.run.app/scrape');
    expect((init.headers as Record<string, string>)['Authorization']).toBe('Bearer id-token');
    expect(JSON.parse(init.body as string)).toEqual({ url: 'https://example.com/', selectors: { title: 'h1' } });
  });

  it('rejects empty selector maps before calling the agent', async () => {
    const fetch = vi.fn();
    const client = createBrowserClient({
      agentUrl: 'https://browser-agent.example.run.app',
      audience: 'https://browser-agent.example.run.app',
      serviceAccountKey: { client_email: 'x', private_key: 'y' },
    }, { fetch, getIdToken: () => Promise.resolve('id-token') });

    await expect(client.scrape('https://example.com', {})).rejects.toBeInstanceOf(ValidationError);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('posts a signed service-account JWT to Google token exchange', async () => {
    const key = await createServiceAccountKey();
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id_token: 'google-id-token' }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }));

    const token = await mintBrowserAgentIdToken(key, 'https://browser-agent.example.run.app', {
      fetch,
      now: () => 1_765_000_000_000,
    });

    expect(token).toBe('google-id-token');
    const [url, init] = fetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://oauth2.googleapis.com/token');
    const body = new URLSearchParams(init.body as string);
    expect(body.get('grant_type')).toBe('urn:ietf:params:oauth:grant-type:jwt-bearer');
    expect(body.get('assertion')?.split('.')).toHaveLength(3);
  });
});
