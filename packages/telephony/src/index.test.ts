import { describe, expect, it, vi } from 'vitest';

import {
  handleTelnyxWebhook,
  synthesize,
  transcribe,
  VoiceSession,
  type VoiceSessionConfig,
} from './index';

type FetchCall = [string, RequestInit];

function getCall(mock: { mock: { calls: unknown[][] } }, index: number): FetchCall {
  const calls = mock.mock.calls as unknown as FetchCall[];
  const call = calls[index];
  if (!call) {
    throw new Error(`fetch mock has no call at index ${String(index)}`);
  }
  return call;
}

function makeAudio(bytes = 4): ArrayBuffer {
  return new Uint8Array(bytes).fill(1).buffer;
}

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { 'content-type': 'application/json', ...(init.headers ?? {}) },
  });
}

const baseEnv = {
  TELNYX_API_KEY: 'tnx',
  DEEPGRAM_API_KEY: 'dg',
  ELEVENLABS_API_KEY: 'el',
  AI_GATEWAY_BASE_URL: 'https://gw.test',
      ANTHROPIC_API_KEY: 'an',
  
  GROQ_API_KEY: 'gq',
      VERTEX_ACCESS_TOKEN: 'vtest',
      VERTEX_PROJECT: 'p',
      VERTEX_LOCATION: 'us-central1',
} as const;

const baseConfig = (): VoiceSessionConfig => ({
  callId: 'call_1',
  direction: 'inbound',
  voiceId: 'voice_1',
  systemPrompt: 'You are a helpful agent.',
  env: { ...baseEnv },
});

describe('transcribe', () => {
  it('sends audio to Deepgram and returns the best transcript', async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(
        jsonResponse({
          results: { channels: [{ alternatives: [{ transcript: 'hello world' }] }] },
        }),
      ),
    );
    const out = await transcribe(makeAudio(), 'key', { language: 'es-ES', model: 'nova-3' }, { fetch: fetchMock });
    expect(out).toBe('hello world');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = getCall(fetchMock, 0);
    expect(url).toContain('api.deepgram.com/v1/listen');
    expect(url).toContain('language=es-ES');
    expect(url).toContain('model=nova-3');
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>).Authorization).toBe('Token key');
  });

  it('returns empty string when transcript missing', async () => {
    const fetchMock = vi.fn(() => Promise.resolve(jsonResponse({})));
    expect(await transcribe(makeAudio(), 'key', {}, { fetch: fetchMock })).toBe('');
  });

  it('throws when api key missing', async () => {
    await expect(transcribe(makeAudio(), '', {}, { fetch: vi.fn() })).rejects.toThrow(
      /API key is required/,
    );
  });

  it('throws when audio is empty', async () => {
    await expect(transcribe(new ArrayBuffer(0), 'key', {}, { fetch: vi.fn() })).rejects.toThrow(
      /must not be empty/,
    );
  });

  it('wraps network errors as TELEPHONY_STT_FAILED', async () => {
    const fetchMock = vi.fn(() => Promise.reject(new Error('boom')));
    await expect(transcribe(makeAudio(), 'key', {}, { fetch: fetchMock })).rejects.toMatchObject({
      code: 'TELEPHONY_STT_FAILED',
    });
  });

  it('throws when Deepgram returns non-2xx', async () => {
    const fetchMock = vi.fn(() => Promise.resolve(new Response('rate limited', { status: 429 })));
    await expect(transcribe(makeAudio(), 'key', {}, { fetch: fetchMock })).rejects.toMatchObject({
      code: 'TELEPHONY_STT_FAILED',
      context: { status: 429 },
    });
  });

  it('handles unreadable error bodies on failure', async () => {
    const broken = new Response(null, { status: 500 });
    Object.defineProperty(broken, 'text', { value: () => Promise.reject(new Error('drained')) });
    const fetchMock = vi.fn(() => Promise.resolve(broken));
    await expect(transcribe(makeAudio(), 'key', {}, { fetch: fetchMock })).rejects.toMatchObject({
      code: 'TELEPHONY_STT_FAILED',
    });
  });
});

describe('synthesize', () => {
  it('sends text to ElevenLabs and returns audio buffer', async () => {
    const buf = new Uint8Array([1, 2, 3]).buffer;
    const fetchMock = vi.fn(() => Promise.resolve(new Response(buf, { status: 200 })));
    const out = await synthesize('hi', 'voice', 'key', { stability: 0.4, similarityBoost: 0.6 }, { fetch: fetchMock });
    expect(out.byteLength).toBe(3);
    const [url, init] = getCall(fetchMock, 0);
    expect(url).toContain('api.elevenlabs.io/v1/text-to-speech/voice');
    expect((init.headers as Record<string, string>)['xi-api-key']).toBe('key');
    const body = JSON.parse(init.body as string) as {
      text: string;
      voice_settings: { stability: number; similarity_boost: number };
    };
    expect(body.text).toBe('hi');
    expect(body.voice_settings.stability).toBe(0.4);
    expect(body.voice_settings.similarity_boost).toBe(0.6);
  });

  it('uses default voice settings when omitted', async () => {
    const fetchMock = vi.fn(() => Promise.resolve(new Response(new ArrayBuffer(1), { status: 200 })));
    await synthesize('hi', 'voice', 'key', {}, { fetch: fetchMock });
    const [, init] = getCall(fetchMock, 0);
    const body = JSON.parse(init.body as string) as {
      voice_settings: { stability: number; similarity_boost: number };
    };
    expect(body.voice_settings.stability).toBe(0.5);
    expect(body.voice_settings.similarity_boost).toBe(0.75);
  });

  it('throws on missing api key, voice id, or text', async () => {
    const fetchMock = vi.fn();
    await expect(synthesize('hi', 'v', '', {}, { fetch: fetchMock })).rejects.toThrow(/API key/);
    await expect(synthesize('hi', '', 'k', {}, { fetch: fetchMock })).rejects.toThrow(/voiceId/);
    await expect(synthesize('', 'v', 'k', {}, { fetch: fetchMock })).rejects.toThrow(/text/);
  });

  it('wraps network errors as TELEPHONY_TTS_FAILED', async () => {
    const fetchMock = vi.fn(() => Promise.reject(new Error('boom')));
    await expect(synthesize('hi', 'v', 'k', {}, { fetch: fetchMock })).rejects.toMatchObject({
      code: 'TELEPHONY_TTS_FAILED',
    });
  });

  it('throws when ElevenLabs returns non-2xx', async () => {
    const fetchMock = vi.fn(() => Promise.resolve(new Response('nope', { status: 500 })));
    await expect(synthesize('hi', 'v', 'k', {}, { fetch: fetchMock })).rejects.toMatchObject({
      code: 'TELEPHONY_TTS_FAILED',
      context: { status: 500 },
    });
  });
});

describe('handleTelnyxWebhook', () => {
  it('returns 200 with parsed event metadata', async () => {
    const req = new Request('https://example.test/webhook', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        data: { event_type: 'call.initiated', payload: { call_control_id: 'cc_1' } },
      }),
    });
    const res = await handleTelnyxWebhook(req, 'key');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; event: string; callControlId: string | null };
    expect(body).toEqual({ ok: true, event: 'call.initiated', callControlId: 'cc_1' });
  });

  it('returns 400 on invalid JSON', async () => {
    const req = new Request('https://example.test/webhook', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: 'not-json',
    });
    const res = await handleTelnyxWebhook(req, 'key');
    expect(res.status).toBe(400);
  });

  it('falls back to defaults when event payload incomplete', async () => {
    const req = new Request('https://example.test/webhook', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });
    const res = await handleTelnyxWebhook(req, 'key');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { event: string; callControlId: null };
    expect(body.event).toBe('unknown');
    expect(body.callControlId).toBeNull();
  });

  it('throws when api key missing', async () => {
    const req = new Request('https://example.test/webhook', { method: 'POST', body: '{}' });
    await expect(handleTelnyxWebhook(req, '')).rejects.toThrow(/API key/);
  });
});

describe('VoiceSession', () => {
  it('validates required config fields', () => {
    const cfg = baseConfig();
    expect(() => new VoiceSession({ ...cfg, callId: '' })).toThrow(/callId/);
    expect(() => new VoiceSession({ ...cfg, voiceId: '' })).toThrow(/voiceId/);
    expect(() => new VoiceSession({ ...cfg, systemPrompt: '' })).toThrow(/systemPrompt/);
  });

  it('start/end lifecycle returns transcripts', async () => {
    const session = new VoiceSession(baseConfig());
    const events: string[] = [];
    session.addEventListener('start', () => events.push('start'));
    session.addEventListener('end', () => events.push('end'));
    await session.start();
    const log = await session.end();
    expect(log).toEqual([]);
    expect(events).toEqual(['start', 'end']);
  });

  it('processAudio drives STT → LLM → TTS and emits events', async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      if (url.includes('deepgram')) {
        return Promise.resolve(
          jsonResponse({
            results: { channels: [{ alternatives: [{ transcript: 'hello' }] }] },
          }),
        );
      }
      if (url.includes('anthropic')) {
        return Promise.resolve(
          jsonResponse({
            content: [{ type: 'text', text: 'hi back' }],
            usage: { input_tokens: 1, output_tokens: 2 },
          }),
        );
      }
      if (url.includes('elevenlabs')) {
        return Promise.resolve(new Response(new Uint8Array([9, 9, 9]).buffer, { status: 200 }));
      }
      return Promise.resolve(new Response('unexpected', { status: 500 }));
    });

    const session = new VoiceSession(baseConfig(), { fetch: fetchMock as unknown as typeof fetch, now: () => 100 });
    const transcripts: Array<{ speaker: string; text: string }> = [];
    let audioEvent: ArrayBuffer | undefined;
    session.addEventListener('transcript', (ev) => {
      const detail = (ev as CustomEvent<{ speaker: string; text: string }>).detail;
      transcripts.push({ speaker: detail.speaker, text: detail.text });
    });
    session.addEventListener('audio', (ev) => {
      audioEvent = (ev as CustomEvent<ArrayBuffer>).detail;
    });

    await session.start();
    await session.processAudio(makeAudio());
    const log = await session.end();

    expect(transcripts).toEqual([
      { speaker: 'user', text: 'hello' },
      { speaker: 'agent', text: 'hi back' },
    ]);
    expect(audioEvent?.byteLength).toBe(3);
    expect(log).toHaveLength(2);
    expect(log[0]?.speaker).toBe('user');
    expect(log[1]?.speaker).toBe('agent');
  });

  it('skips LLM/TTS when transcription is empty', async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(jsonResponse({ results: { channels: [{ alternatives: [{ transcript: '' }] }] } })),
    );
    const session = new VoiceSession(baseConfig(), { fetch: fetchMock as unknown as typeof fetch });
    await session.start();
    await session.processAudio(makeAudio());
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(await session.end()).toEqual([]);
  });

  it('rejects processAudio when not started or already ended', async () => {
    const session = new VoiceSession(baseConfig(), { fetch: vi.fn() as unknown as typeof fetch });
    await expect(session.processAudio(makeAudio())).rejects.toMatchObject({
      code: 'TELEPHONY_SESSION_FAILED',
    });
    await session.start();
    await session.end();
    await expect(session.processAudio(makeAudio())).rejects.toMatchObject({
      code: 'TELEPHONY_SESSION_FAILED',
    });
    await expect(session.start()).rejects.toMatchObject({
      code: 'TELEPHONY_SESSION_FAILED',
    });
  });

  it('throws when LLM chain returns an error response', async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      if (url.includes('deepgram')) {
        return Promise.resolve(
          jsonResponse({ results: { channels: [{ alternatives: [{ transcript: 'hi' }] }] } }),
        );
      }
      // All three LLM providers fail with 500 (failover-eligible)
      return Promise.resolve(new Response('fail', { status: 500 }));
    });
    const session = new VoiceSession(baseConfig(), { fetch: fetchMock as unknown as typeof fetch });
    await session.start();
    await expect(session.processAudio(makeAudio())).rejects.toMatchObject({
      code: 'INTERNAL_ERROR',
    });
  });
});

import { isWithinCallingHours, verifyTelnyxWebhook } from './index';

describe('isWithinCallingHours', () => {
  it('returns true when local hour is 8 (window start)', () => {
    // 13:00 UTC = 08:00 America/New_York (UTC-5 in winter)
    const winterMorning = new Date('2024-01-15T13:00:00Z');
    expect(isWithinCallingHours('America/New_York', winterMorning)).toBe(true);
  });

  it('returns true when local hour is 21 (window end)', () => {
    // 02:00 UTC next day = 21:00 America/New_York (UTC-5)
    const winterEvening = new Date('2024-01-16T02:00:00Z');
    expect(isWithinCallingHours('America/New_York', winterEvening)).toBe(true);
  });

  it('returns false when local hour is 7 (before window)', () => {
    // 12:00 UTC = 07:00 America/New_York (UTC-5)
    const beforeWindow = new Date('2024-01-15T12:00:00Z');
    expect(isWithinCallingHours('America/New_York', beforeWindow)).toBe(false);
  });

  it('returns false when local hour is 22 (after window)', () => {
    // 03:00 UTC next day = 22:00 America/New_York (UTC-5)
    const afterWindow = new Date('2024-01-16T03:00:00Z');
    expect(isWithinCallingHours('America/New_York', afterWindow)).toBe(false);
  });

  it('works with a Pacific timezone', () => {
    // 16:00 UTC = 08:00 America/Los_Angeles (UTC-8 in winter)
    const pacificMorning = new Date('2024-01-15T16:00:00Z');
    expect(isWithinCallingHours('America/Los_Angeles', pacificMorning)).toBe(true);
  });
});

describe('verifyTelnyxWebhook', () => {
  it('returns false for invalid base64 signature', async () => {
    expect(await verifyTelnyxWebhook('payload', '!!!not-base64!!!', 'validkey')).toBe(false);
  });

  it('returns false for invalid base64 public key', async () => {
    const validBase64 = btoa('some-bytes');
    expect(await verifyTelnyxWebhook('payload', validBase64, '!!!not-base64!!!')).toBe(false);
  });

  it('returns false for signature/key mismatch', async () => {
    // Generate a real key pair and verify with wrong payload
    const keyPair = await crypto.subtle.generateKey('Ed25519', true, ['sign', 'verify']);
    const publicKeyBuffer = await crypto.subtle.exportKey('spki', keyPair.publicKey);
    const signatureBuffer = await crypto.subtle.sign('Ed25519', keyPair.privateKey, new TextEncoder().encode('correct-payload'));
    const publicKeyB64 = btoa(String.fromCharCode(...new Uint8Array(publicKeyBuffer)));
    const signatureB64 = btoa(String.fromCharCode(...new Uint8Array(signatureBuffer)));
    expect(await verifyTelnyxWebhook('wrong-payload', signatureB64, publicKeyB64)).toBe(false);
  });

  it('returns true for valid Ed25519 signature', async () => {
    const keyPair = await crypto.subtle.generateKey('Ed25519', true, ['sign', 'verify']);
    const payload = 'test-webhook-payload';
    const publicKeyBuffer = await crypto.subtle.exportKey('spki', keyPair.publicKey);
    const signatureBuffer = await crypto.subtle.sign('Ed25519', keyPair.privateKey, new TextEncoder().encode(payload));
    const publicKeyB64 = btoa(String.fromCharCode(...new Uint8Array(publicKeyBuffer)));
    const signatureB64 = btoa(String.fromCharCode(...new Uint8Array(signatureBuffer)));
    expect(await verifyTelnyxWebhook(payload, signatureB64, publicKeyB64)).toBe(true);
  });
});
