import { describe, expect, it, vi } from 'vitest';

import {
  handleTelnyxWebhook,
  isWithinCallingHours,
  synthesize,
  transcribe,
  verifyTelnyxWebhook,
  VoiceSession,
  type CallProvider,
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
      const url =
        typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
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

// ─── WB-3 Helpers ────────────────────────────────────────────────────────────

/** Platform-safe base64 encode from Uint8Array (no Buffer / Node.js). */
function uint8ToBase64(bytes: Uint8Array): string {
  return btoa(Array.from(bytes, (b) => String.fromCharCode(b)).join(''));
}

// ─── isWithinCallingHours ─────────────────────────────────────────────────────

describe('isWithinCallingHours', () => {
  it('returns false for UTC 07:59 (before window)', () => {
    const date = new Date('2024-01-15T07:59:00Z');
    expect(isWithinCallingHours('UTC', date)).toBe(false);
  });

  it('returns true for UTC 08:00 (start of window)', () => {
    const date = new Date('2024-01-15T08:00:00Z');
    expect(isWithinCallingHours('UTC', date)).toBe(true);
  });

  it('returns true for UTC 21:00 (end of window, inclusive)', () => {
    const date = new Date('2024-01-15T21:00:00Z');
    expect(isWithinCallingHours('UTC', date)).toBe(true);
  });

  it('returns false for UTC 21:01 (after window)', () => {
    const date = new Date('2024-01-15T21:01:00Z');
    expect(isWithinCallingHours('UTC', date)).toBe(false);
  });

  it('returns true for 08:00 EST (13:00 UTC) — America/New_York winter', () => {
    // January — EST is UTC-5; 08:00 EST = 13:00 UTC
    const date = new Date('2024-01-15T13:00:00Z');
    expect(isWithinCallingHours('America/New_York', date)).toBe(true);
  });

  it('returns true for 09:00 EDT (13:00 UTC) — America/New_York summer', () => {
    // July — EDT is UTC-4; 13:00 UTC = 09:00 EDT
    const date = new Date('2024-07-15T13:00:00Z');
    expect(isWithinCallingHours('America/New_York', date)).toBe(true);
  });

  it('returns true for 08:00 PST (16:00 UTC) — America/Los_Angeles winter', () => {
    // January — PST is UTC-8; 08:00 PST = 16:00 UTC
    const date = new Date('2024-01-15T16:00:00Z');
    expect(isWithinCallingHours('America/Los_Angeles', date)).toBe(true);
  });

  it('returns true for 08:00 JST (23:00 UTC) — Asia/Tokyo', () => {
    // JST is UTC+9 year-round; 08:00 JST = 23:00 UTC (previous day)
    const date = new Date('2024-01-14T23:00:00Z');
    expect(isWithinCallingHours('Asia/Tokyo', date)).toBe(true);
  });

  it('returns true for 08:00 AEDT (21:00 UTC) — Australia/Sydney summer', () => {
    // January — AEDT is UTC+11; 08:00 AEDT = 21:00 UTC (previous day)
    const date = new Date('2024-01-14T21:00:00Z');
    expect(isWithinCallingHours('Australia/Sydney', date)).toBe(true);
  });

  it('handles DST boundary for America/New_York (2024-03-10 spring forward)', () => {
    // Before DST: 2024-03-10 07:00 UTC = 02:00 EST → outside window
    const beforeDST = new Date('2024-03-10T07:00:00Z');
    expect(isWithinCallingHours('America/New_York', beforeDST)).toBe(false);

    // After DST: 2024-03-10 12:00 UTC = 08:00 EDT → inside window
    const afterDST = new Date('2024-03-10T12:00:00Z');
    expect(isWithinCallingHours('America/New_York', afterDST)).toBe(true);
  });

  it('returns true for Europe/London midday', () => {
    // 14:00 UTC = 14:00 GMT in January
    const date = new Date('2024-01-15T14:00:00Z');
    expect(isWithinCallingHours('Europe/London', date)).toBe(true);
  });

  it('uses current time when nowUtc is omitted', () => {
    // Just verify it does not throw
    expect(() => isWithinCallingHours('UTC')).not.toThrow();
  });

  it('returns false for 07:00 UTC (before window)', () => {
    const date = new Date('2024-01-15T07:00:00Z');
    expect(isWithinCallingHours('UTC', date)).toBe(false);
  });

  it('returns false for 22:00 UTC (after window)', () => {
    const date = new Date('2024-01-15T22:00:00Z');
    expect(isWithinCallingHours('UTC', date)).toBe(false);
  });

  it('returns true for 12:00 noon UTC', () => {
    const date = new Date('2024-01-15T12:00:00Z');
    expect(isWithinCallingHours('UTC', date)).toBe(true);
  });
});

// ─── verifyTelnyxWebhook ──────────────────────────────────────────────────────

describe('verifyTelnyxWebhook', () => {
  it('returns false for invalid base64 signature', async () => {
    const result = await verifyTelnyxWebhook('payload', '!!!invalid!!!', 'aGVsbG8=');
    expect(result).toBe(false);
  });

  it('returns false for invalid base64 public key', async () => {
    const result = await verifyTelnyxWebhook('payload', 'aGVsbG8=', '!!!invalid!!!');
    expect(result).toBe(false);
  });

  it('returns false when signature does not match payload', async () => {
    const payload = 'test payload';
    const fakeSignature = uint8ToBase64(new Uint8Array(64));
    const fakePublicKey = uint8ToBase64(new Uint8Array(32));
    const result = await verifyTelnyxWebhook(payload, fakeSignature, fakePublicKey);
    expect(result).toBe(false);
  });

  it('returns false for malformed DER public key', async () => {
    const payload = 'test payload';
    const fakeSignature = uint8ToBase64(new Uint8Array(64));
    // A 32-byte raw key won't parse as SPKI DER
    const malformedKey = uint8ToBase64(new Uint8Array(32));
    const result = await verifyTelnyxWebhook(payload, fakeSignature, malformedKey);
    expect(result).toBe(false);
  });

  it('returns false for empty payload', async () => {
    const fakeSignature = uint8ToBase64(new Uint8Array(64));
    const fakePublicKey = uint8ToBase64(new Uint8Array(32));
    const result = await verifyTelnyxWebhook('', fakeSignature, fakePublicKey);
    expect(result).toBe(false);
  });

  it('handles base64 strings with whitespace without throwing', async () => {
    const payload = 'test payload';
    const signatureWithSpace = uint8ToBase64(new Uint8Array(64)).slice(0, 10) + ' ' + uint8ToBase64(new Uint8Array(64)).slice(10);
    const fakePublicKey = uint8ToBase64(new Uint8Array(32));
    // Should not throw; returns false because key is malformed
    const result = await verifyTelnyxWebhook(payload, signatureWithSpace, fakePublicKey);
    expect(typeof result).toBe('boolean');
  });
});

// ─── CallProvider type ────────────────────────────────────────────────────────

describe('CallProvider type', () => {
  it('accepts "telnyx" and "twilio" as valid values', () => {
    const providers: CallProvider[] = ['telnyx', 'twilio'];
    expect(providers).toHaveLength(2);
  });
});
