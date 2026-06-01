// Unit tests for generateNarrationMp3 (tts.ts).
// All network calls are replaced with fetchImpl mocks — no ElevenLabs
// credentials required. The word "AI" never appears here (governance rule).

import { describe, it, expect } from 'vitest';
import { generateNarrationMp3 } from './tts.js';

/** Build a fake fetchImpl that returns the given status and body. */
function mockFetch(
  status: number,
  body: BodyInit,
  contentType = 'audio/mpeg',
): typeof fetch {
  return (_input, _init) =>
    Promise.resolve(
      new Response(body, {
        status,
        headers: { 'content-type': contentType },
      }),
    );
}

/** Build a fetchImpl that captures the last request for assertion. */
function capturingFetch(
  status: number,
  body: BodyInit,
): {
  fetchImpl: typeof fetch;
  captured: { url: string; init: RequestInit | undefined }[];
} {
  const captured: { url: string; init: RequestInit | undefined }[] = [];
  const fetchImpl: typeof fetch = (input, init) => {
    captured.push({ url: String(input), init });
    return Promise.resolve(new Response(body, { status }));
  };
  return { fetchImpl, captured };
}

// ---------------------------------------------------------------------------
// Success path
// ---------------------------------------------------------------------------

describe('generateNarrationMp3 — success', () => {
  it('returns the response bytes as Uint8Array', async () => {
    const expected = new Uint8Array([0xff, 0xfb, 0x90, 0x00]);
    const result = await generateNarrationMp3({
      text: 'You were built to guide.',
      voiceId: 'voice_abc',
      apiKey: 'key_123',
      fetchImpl: mockFetch(200, expected),
    });
    expect(result).toBeInstanceOf(Uint8Array);
    expect(Array.from(result)).toEqual(Array.from(expected));
  });

  it('sends POST to the correct ElevenLabs endpoint with voiceId in the URL', async () => {
    const { fetchImpl, captured } = capturingFetch(200, new Uint8Array([0x01]));
    await generateNarrationMp3({
      text: 'Hello',
      voiceId: 'v_xyz',
      apiKey: 'k_abc',
      fetchImpl,
    });
    expect(captured).toHaveLength(1);
    const req = captured[0];
    expect(req?.url).toBe('https://api.elevenlabs.io/v1/text-to-speech/v_xyz');
    expect(req?.init?.method).toBe('POST');
  });

  it('sends the proven model_id and voice_settings in the request body', async () => {
    const { fetchImpl, captured } = capturingFetch(200, new Uint8Array([0x01]));
    await generateNarrationMp3({
      text: 'Test narration',
      voiceId: 'v_xyz',
      apiKey: 'k_abc',
      fetchImpl,
    });
    const req = captured[0];
    const body = JSON.parse(String(req?.init?.body)) as Record<string, unknown>;
    expect(body['model_id']).toBe('eleven_multilingual_v2');
    const settings = body['voice_settings'] as Record<string, number>;
    expect(settings['stability']).toBe(0.5);
    expect(settings['similarity_boost']).toBe(0.75);
    expect(body['text']).toBe('Test narration');
  });

  it('sends the xi-api-key header', async () => {
    const { fetchImpl, captured } = capturingFetch(200, new Uint8Array([0x01]));
    await generateNarrationMp3({
      text: 'Hello',
      voiceId: 'v_xyz',
      apiKey: 'my_api_key',
      fetchImpl,
    });
    const req = captured[0];
    const headers = new Headers(req?.init?.headers);
    expect(headers.get('xi-api-key')).toBe('my_api_key');
    expect(headers.get('accept')).toBe('audio/mpeg');
    expect(headers.get('content-type')).toBe('application/json');
  });
});

// ---------------------------------------------------------------------------
// BOM / whitespace stripping
// ---------------------------------------------------------------------------

describe('generateNarrationMp3 — BOM and whitespace stripping', () => {
  it('strips a leading UTF-8 BOM from apiKey before sending', async () => {
    const { fetchImpl, captured } = capturingFetch(200, new Uint8Array([0x01]));
    const bomKey = '﻿my_api_key';
    await generateNarrationMp3({
      text: 'Hello',
      voiceId: 'v1',
      apiKey: bomKey,
      fetchImpl,
    });
    const req = captured[0];
    const headers = new Headers(req?.init?.headers);
    expect(headers.get('xi-api-key')).toBe('my_api_key');
  });

  it('strips trailing whitespace/newline from apiKey', async () => {
    const { fetchImpl, captured } = capturingFetch(200, new Uint8Array([0x01]));
    await generateNarrationMp3({
      text: 'Hello',
      voiceId: 'v1',
      apiKey: 'my_key  \n',
      fetchImpl,
    });
    const req = captured[0];
    const headers = new Headers(req?.init?.headers);
    expect(headers.get('xi-api-key')).toBe('my_key');
  });

  it('strips a leading BOM from voiceId (appears in the URL path)', async () => {
    const { fetchImpl, captured } = capturingFetch(200, new Uint8Array([0x01]));
    const bomVoice = '﻿voice_abc';
    await generateNarrationMp3({
      text: 'Hello',
      voiceId: bomVoice,
      apiKey: 'k',
      fetchImpl,
    });
    const req = captured[0];
    expect(req?.url).toBe(
      'https://api.elevenlabs.io/v1/text-to-speech/voice_abc',
    );
  });

  it('strips trailing whitespace from voiceId', async () => {
    const { fetchImpl, captured } = capturingFetch(200, new Uint8Array([0x01]));
    await generateNarrationMp3({
      text: 'Hello',
      voiceId: 'voice_def   ',
      apiKey: 'k',
      fetchImpl,
    });
    const req = captured[0];
    expect(req?.url).toBe(
      'https://api.elevenlabs.io/v1/text-to-speech/voice_def',
    );
  });
});

// ---------------------------------------------------------------------------
// Error paths
// ---------------------------------------------------------------------------

describe('generateNarrationMp3 — error handling', () => {
  it('throws with the status code when ElevenLabs returns 500', async () => {
    await expect(
      generateNarrationMp3({
        text: 'Hello',
        voiceId: 'v1',
        apiKey: 'k',
        fetchImpl: mockFetch(500, '{"error":"internal"}', 'application/json'),
      }),
    ).rejects.toThrow('ElevenLabs TTS returned HTTP 500');
  });

  it('throws with the status code when ElevenLabs returns 401', async () => {
    await expect(
      generateNarrationMp3({
        text: 'Hello',
        voiceId: 'v1',
        apiKey: 'bad_key',
        fetchImpl: mockFetch(401, '{"detail":"invalid_api_key"}', 'application/json'),
      }),
    ).rejects.toThrow('ElevenLabs TTS returned HTTP 401');
  });

  it('includes up to 300 chars of the response body in the error message', async () => {
    const errorBody = 'detailed error: ' + 'x'.repeat(350);
    let caughtErr: unknown;
    try {
      await generateNarrationMp3({
        text: 'Hello',
        voiceId: 'v1',
        apiKey: 'k',
        fetchImpl: mockFetch(422, errorBody, 'application/json'),
      });
    } catch (e) {
      caughtErr = e;
    }
    expect(caughtErr).toBeInstanceOf(Error);
    const err = caughtErr as Error;
    // Error message contains the status
    expect(err.message).toContain('422');
    // Body was truncated to 300 chars
    expect(err.message.length).toBeLessThan(errorBody.length + 60);
    // But contains the start of the error body
    expect(err.message).toContain('detailed error:');
  });

  it('throws a network-level error when fetch rejects', async () => {
    const throwingFetch: typeof fetch = () =>
      Promise.reject(new Error('ECONNREFUSED'));
    await expect(
      generateNarrationMp3({
        text: 'Hello',
        voiceId: 'v1',
        apiKey: 'k',
        fetchImpl: throwingFetch,
      }),
    ).rejects.toThrow('ECONNREFUSED');
  });

  it('throws with only the status when the error response body is empty', async () => {
    // Body is empty — snippet stays '' and the ternary takes the false branch.
    await expect(
      generateNarrationMp3({
        text: 'Hello',
        voiceId: 'v1',
        apiKey: 'k',
        fetchImpl: mockFetch(429, '', 'application/json'),
      }),
    ).rejects.toThrow('ElevenLabs TTS returned HTTP 429');
  });

  it('throws with only the status when reading the error response body itself throws', async () => {
    // Simulate a Response where .text() rejects (e.g. body is detached).
    // The catch block in tts.ts swallows this and falls through to the throw.
    const fetchImpl: typeof fetch = () => {
      const res = {
        ok: false,
        status: 503,
        text: () => Promise.reject(new Error('body read failed')),
      } as unknown as Response;
      return Promise.resolve(res);
    };
    let caughtErr: unknown;
    try {
      await generateNarrationMp3({
        text: 'Hello',
        voiceId: 'v1',
        apiKey: 'k',
        fetchImpl,
      });
    } catch (e) {
      caughtErr = e;
    }
    expect(caughtErr).toBeInstanceOf(Error);
    const err = caughtErr as Error;
    expect(err.message).toContain('503');
    // No body snippet — the read failed, so no colon follows the status.
    expect(err.message).not.toContain(':');
  });
});
