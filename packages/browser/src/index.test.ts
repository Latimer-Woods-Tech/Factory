import { describe, expect, it, vi } from 'vitest';
import { ValidationError } from '@latimer-woods-tech/errors';
import { createBrowserClient, mintBrowserAgentIdToken } from './index.js';

function bytesToBase64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
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

  it('accepts a string-form service account key', async () => {
    const key = await createServiceAccountKey();
    const keyStr = JSON.stringify(key);
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id_token: 'str-token' }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }));
    const token = await mintBrowserAgentIdToken(keyStr, 'https://browser-agent.example.run.app', {
      fetch,
      now: () => 1_765_000_000_000,
    });
    expect(token).toBe('str-token');
  });

  it('uses a custom token_uri when provided in the key', async () => {
    const base = await createServiceAccountKey();
    const key = { ...base, token_uri: 'https://custom-token.example.com/token' };
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id_token: 'custom-tok' }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }));
    await mintBrowserAgentIdToken(key, 'https://browser-agent.example.run.app', { fetch, now: () => 1_765_000_000_000 });
    expect(fetch.mock.calls[0]![0]).toBe('https://custom-token.example.com/token');
  });

  it('throws InternalError when Google token exchange returns non-OK', async () => {
    const key = await createServiceAccountKey();
    const fetch = vi.fn().mockResolvedValue(new Response('Unauthorized', { status: 401 }));
    await expect(
      mintBrowserAgentIdToken(key, 'https://browser-agent.example.run.app', { fetch, now: () => 1_765_000_000_000 }),
    ).rejects.toThrow(/Google token exchange failed.*401/);
  });

  it('throws InternalError when response body has error field', async () => {
    const key = await createServiceAccountKey();
    const fetch = vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ error: 'access_denied' }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    ));
    await expect(
      mintBrowserAgentIdToken(key, 'https://browser-agent.example.run.app', { fetch, now: () => 1_765_000_000_000 }),
    ).rejects.toThrow(/Google token exchange failed.*access_denied/);
  });

  it('throws InternalError when response has neither id_token nor error', async () => {
    const key = await createServiceAccountKey();
    const fetch = vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ unexpected: 'value' }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    ));
    await expect(
      mintBrowserAgentIdToken(key, 'https://browser-agent.example.run.app', { fetch, now: () => 1_765_000_000_000 }),
    ).rejects.toThrow(/did not return id_token/);
  });

  it('throws ValidationError for invalid service account key object', async () => {
    await expect(
      mintBrowserAgentIdToken({ private_key: 'k' } as never, 'https://x.example.com', {}),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});

describe('createBrowserClient — screenshot', () => {
  it('calls the screenshot endpoint and returns result', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      url: 'https://example.com/',
      capturedAt: '2026-05-15T00:00:00.000Z',
      mimeType: 'image/png',
      dataBase64: 'abc123==',
    }), { status: 200, headers: { 'content-type': 'application/json' } }));
    const getIdToken = vi.fn().mockResolvedValue('id-token');
    const client = createBrowserClient({
      agentUrl: 'https://browser-agent.example.run.app',
      audience: 'https://browser-agent.example.run.app',
      serviceAccountKey: { client_email: 'x', private_key: 'y' },
    }, { fetch, getIdToken });

    const result = await client.screenshot('https://example.com');

    expect(result.dataBase64).toBe('abc123==');
    const [url, init] = fetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://browser-agent.example.run.app/screenshot');
    expect(JSON.parse(init.body as string)).toEqual({ url: 'https://example.com/' });
  });

  it('throws InternalError when browser agent returns non-OK on screenshot', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response('Not Found', { status: 404 }));
    const client = createBrowserClient({
      agentUrl: 'https://browser-agent.example.run.app',
      audience: 'https://browser-agent.example.run.app',
      serviceAccountKey: { client_email: 'x', private_key: 'y' },
    }, { fetch, getIdToken: () => Promise.resolve('id-token') });
    await expect(client.screenshot('https://example.com')).rejects.toThrow(/Browser Agent request failed.*404/);
  });
});

describe('createBrowserClient — scrape error paths', () => {
  it('throws InternalError when browser agent returns non-OK on scrape', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response('Internal Server Error', { status: 500 }));
    const client = createBrowserClient({
      agentUrl: 'https://browser-agent.example.run.app',
      audience: 'https://browser-agent.example.run.app',
      serviceAccountKey: { client_email: 'x', private_key: 'y' },
    }, { fetch, getIdToken: () => Promise.resolve('id-token') });
    await expect(client.scrape('https://example.com', { title: 'h1' })).rejects.toThrow(/Browser Agent request failed.*500/);
  });

  it('validates the target url before calling the agent', async () => {
    const fetch = vi.fn();
    const client = createBrowserClient({
      agentUrl: 'https://browser-agent.example.run.app',
      audience: 'https://browser-agent.example.run.app',
      serviceAccountKey: { client_email: 'x', private_key: 'y' },
    }, { fetch, getIdToken: () => Promise.resolve('id-token') });
    await expect(client.scrape('', { title: 'h1' })).rejects.toBeInstanceOf(ValidationError);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('logs scrape and screenshot via logger when provided', async () => {
    const scrapeResp = { url: '', scrapedAt: '', results: {} };
    const screenshotResp = { url: '', capturedAt: '', mimeType: 'image/png', dataBase64: '' };
    const fetch = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(scrapeResp), { status: 200, headers: { 'content-type': 'application/json' } }))
      .mockResolvedValueOnce(new Response(JSON.stringify(screenshotResp), { status: 200, headers: { 'content-type': 'application/json' } }));
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };
    const getIdToken = vi.fn().mockResolvedValue('id-token');
    const client = createBrowserClient({
      agentUrl: 'https://browser-agent.example.run.app',
      audience: 'https://browser-agent.example.run.app',
      serviceAccountKey: { client_email: 'x', private_key: 'y' },
    }, { fetch, getIdToken, logger });

    await client.scrape('https://example.com', { title: 'h1' });
    await client.screenshot('https://example.com');

    expect(logger.info).toHaveBeenCalledWith('browser.scrape', expect.objectContaining({ url: expect.any(String) }));
    expect(logger.info).toHaveBeenCalledWith('browser.screenshot', expect.objectContaining({ url: expect.any(String) }));
  });
});

describe('createBrowserClient — config validation', () => {
  it('throws ValidationError for empty agentUrl', () => {
    expect(() => createBrowserClient({
      agentUrl: '',
      audience: 'https://x.example.com',
      serviceAccountKey: { client_email: 'x', private_key: 'y' },
    })).toThrow(ValidationError);
  });

  it('throws ValidationError for non-http agentUrl', () => {
    expect(() => createBrowserClient({
      agentUrl: 'ftp://x.example.com',
      audience: 'https://x.example.com',
      serviceAccountKey: { client_email: 'x', private_key: 'y' },
    })).toThrow(ValidationError);
  });

  it('throws ValidationError for empty audience', () => {
    expect(() => createBrowserClient({
      agentUrl: 'https://browser-agent.example.run.app',
      audience: '',
      serviceAccountKey: { client_email: 'x', private_key: 'y' },
    })).toThrow(ValidationError);
  });

  it('strips trailing slash from agentUrl', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ url: '', scrapedAt: '', results: {} }), {
      status: 200, headers: { 'content-type': 'application/json' },
    }));
    const client = createBrowserClient({
      agentUrl: 'https://browser-agent.example.run.app/',
      audience: 'https://browser-agent.example.run.app',
      serviceAccountKey: { client_email: 'x', private_key: 'y' },
    }, { fetch, getIdToken: () => Promise.resolve('token') });
    await client.scrape('https://example.com', { h: 'h1' });
    expect(fetch.mock.calls[0]![0]).toBe('https://browser-agent.example.run.app/scrape');
  });
});

describe('createBrowserClient — token caching', () => {
  it('reuses the cached token for multiple calls within the TTL window', async () => {
    const agentResponse = { url: '', scrapedAt: '', results: {} };
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify(agentResponse), {
      status: 200, headers: { 'content-type': 'application/json' },
    }));
    const getIdToken = vi.fn().mockResolvedValue('cached-token');
    let now = 0;
    const client = createBrowserClient({
      agentUrl: 'https://browser-agent.example.run.app',
      audience: 'https://browser-agent.example.run.app',
      serviceAccountKey: { client_email: 'x', private_key: 'y' },
    }, { fetch, getIdToken, now: () => now });

    await client.scrape('https://example.com', { h: 'h1' });
    now += 60_000; // advance 1 minute (still within 55-min TTL)
    await client.scrape('https://example.com', { h: 'h1' });

    expect(getIdToken).toHaveBeenCalledTimes(1);
  });

  it('refreshes the token after the TTL expires', async () => {
    const agentResponse = { url: '', scrapedAt: '', results: {} };
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify(agentResponse), {
      status: 200, headers: { 'content-type': 'application/json' },
    }));
    const getIdToken = vi.fn().mockResolvedValue('refreshed-token');
    let now = 0;
    const client = createBrowserClient({
      agentUrl: 'https://browser-agent.example.run.app',
      audience: 'https://browser-agent.example.run.app',
      serviceAccountKey: { client_email: 'x', private_key: 'y' },
    }, { fetch, getIdToken, now: () => now });

    await client.scrape('https://example.com', { h: 'h1' });
    now += 56 * 60 * 1000; // advance past 55-min TTL
    await client.scrape('https://example.com', { h: 'h1' });

    expect(getIdToken).toHaveBeenCalledTimes(2);
  });
});

describe('createBrowserClient — audit', () => {
  it('posts to /audit and returns result', async () => {
    const auditResult = {
      url: 'https://example.com/',
      auditedAt: '2026-06-07T00:00:00.000Z',
      consoleErrors: [],
      pageErrors: [],
      failedRequests: [],
      screenshotBase64: 'img==',
    };
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify(auditResult), {
      status: 200, headers: { 'content-type': 'application/json' },
    }));
    const client = createBrowserClient({
      agentUrl: 'https://browser-agent.example.run.app',
      audience: 'https://browser-agent.example.run.app',
      serviceAccountKey: { client_email: 'x', private_key: 'y' },
    }, { fetch, getIdToken: () => Promise.resolve('tok') });

    const result = await client.audit({ url: 'https://example.com', captureConsole: false, statusThreshold: 500 });

    expect(result.screenshotBase64).toBe('img==');
    const [url, init] = fetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://browser-agent.example.run.app/audit');
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(body['captureConsole']).toBe(false);
    expect(body['statusThreshold']).toBe(500);
  });

  it('omits optional fields when not provided', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ url: '', auditedAt: '', consoleErrors: [], pageErrors: [], failedRequests: [], screenshotBase64: '' }), {
      status: 200, headers: { 'content-type': 'application/json' },
    }));
    const client = createBrowserClient({
      agentUrl: 'https://browser-agent.example.run.app',
      audience: 'https://browser-agent.example.run.app',
      serviceAccountKey: { client_email: 'x', private_key: 'y' },
    }, { fetch, getIdToken: () => Promise.resolve('tok') });

    await client.audit({ url: 'https://example.com' });

    const [, init] = fetch.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect('steps' in body).toBe(false);
    expect('captureConsole' in body).toBe(false);
  });
});

describe('createBrowserClient — visualReview', () => {
  it('posts to /visual-review and returns result', async () => {
    const reviewResult = {
      url: 'https://example.com/',
      reviewedAt: '2026-06-07T00:00:00.000Z',
      viewports: [],
      consoleErrors: [],
      pageErrors: [],
      failedRequests: [],
      review: null,
      axeViolations: null,
    };
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify(reviewResult), {
      status: 200, headers: { 'content-type': 'application/json' },
    }));
    const client = createBrowserClient({
      agentUrl: 'https://browser-agent.example.run.app',
      audience: 'https://browser-agent.example.run.app',
      serviceAccountKey: { client_email: 'x', private_key: 'y' },
    }, { fetch, getIdToken: () => Promise.resolve('tok') });

    const result = await client.visualReview({ url: 'https://example.com', runAxe: true });

    expect(result.axeViolations).toBeNull();
    const [url, init] = fetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://browser-agent.example.run.app/visual-review');
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(body['runAxe']).toBe(true);
  });

  it('passes setCookies steps through to the agent', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      url: '', reviewedAt: '', viewports: [], consoleErrors: [], pageErrors: [], failedRequests: [], review: null, axeViolations: null,
    }), { status: 200, headers: { 'content-type': 'application/json' } }));
    const client = createBrowserClient({
      agentUrl: 'https://browser-agent.example.run.app',
      audience: 'https://browser-agent.example.run.app',
      serviceAccountKey: { client_email: 'x', private_key: 'y' },
    }, { fetch, getIdToken: () => Promise.resolve('tok') });

    await client.visualReview({
      url: 'https://capricast.com/feed',
      steps: [{ action: 'setCookies', cookies: [{ name: 'auth', value: 'jwt123', domain: '.capricast.com', secure: true }] }],
      skipFinalNavigation: false,
    });

    const [, init] = fetch.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    const steps = body['steps'] as Array<Record<string, unknown>>;
    expect(steps[0]?.['action']).toBe('setCookies');
  });
});

describe('createBrowserClient — runScenario', () => {
  it('posts to /run-scenario and returns result', async () => {
    const scenarioResult = { completedSteps: 2, videoKey: null, videoUrl: null, finishedAt: '2026-06-07T00:00:00.000Z' };
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify(scenarioResult), {
      status: 200, headers: { 'content-type': 'application/json' },
    }));
    const client = createBrowserClient({
      agentUrl: 'https://browser-agent.example.run.app',
      audience: 'https://browser-agent.example.run.app',
      serviceAccountKey: { client_email: 'x', private_key: 'y' },
    }, { fetch, getIdToken: () => Promise.resolve('tok') });

    const result = await client.runScenario([
      { action: 'goto', url: 'https://example.com' },
      { action: 'click', selector: 'button' },
    ]);

    expect(result.completedSteps).toBe(2);
    const [url] = fetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://browser-agent.example.run.app/run-scenario');
  });

  it('rejects empty steps before calling the agent', async () => {
    const fetch = vi.fn();
    const client = createBrowserClient({
      agentUrl: 'https://browser-agent.example.run.app',
      audience: 'https://browser-agent.example.run.app',
      serviceAccountKey: { client_email: 'x', private_key: 'y' },
    }, { fetch, getIdToken: () => Promise.resolve('tok') });

    await expect(client.runScenario([])).rejects.toBeInstanceOf(ValidationError);
    expect(fetch).not.toHaveBeenCalled();
  });
});
