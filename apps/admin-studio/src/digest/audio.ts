/**
 * Factory Digest — ElevenLabs TTS + R2 upload.
 *
 * Best-effort: if ElevenLabs is unavailable or R2 is unconfigured the
 * function returns null and the email is sent without an audio link.
 *
 * Steps:
 *   1. Call ElevenLabs TTS API with the plain-text summary.
 *   2. Upload the MP3 to R2 under `digest/{label}.mp3`.
 *   3. Return the public URL (R2_PUBLIC_DOMAIN + key).
 */

import type { Env } from '../env.js';

const ELEVENLABS_API_BASE = 'https://api.elevenlabs.io/v1';
// 30-second wall-clock timeout for the ElevenLabs TTS round-trip.
// CF Workers CPU budget (free: 10ms, paid: 30ms) counts JavaScript *execution* only —
// awaiting fetch() I/O does NOT consume CPU time. The Worker is idle during the network wait.
// See: https://developers.cloudflare.com/workers/platform/limits/#cpu-time
const TTS_TIMEOUT_MS = 30_000;

/**
 * Truncates text to a safe length for TTS (ElevenLabs default limit ≤5 000 chars).
 * The digest renderer already targets ≤500 words; this is a safety net.
 */
function safeTruncate(text: string, maxChars = 4_500): string {
  if (text.length <= maxChars) return text;
  const truncated = text.slice(0, maxChars);
  const lastPeriod = truncated.lastIndexOf('.');
  return lastPeriod > maxChars - 200 ? truncated.slice(0, lastPeriod + 1) : truncated;
}

/**
 * Generates an MP3 from the plain-text digest summary via ElevenLabs TTS,
 * uploads it to R2, and returns the public URL.
 *
 * Returns null (never throws) if generation or upload fails.
 */
export async function generateAndUploadAudio(
  text: string,
  label: string,
  env: Env,
): Promise<string | null> {
  const apiKey = env.ELEVENLABS_API_KEY;
  const voiceId = env.ELEVENLABS_VOICE_DEFAULT;
  const r2Bucket = env.DIGEST_R2;
  const r2PublicDomain = env.R2_PUBLIC_DOMAIN;

  if (!apiKey || !voiceId) {
    console.warn('[digest/audio] ElevenLabs not configured — skipping audio generation');
    return null;
  }

  // Validate voice ID format before URL construction (ElevenLabs IDs are alphanumeric + _ -)
  if (!/^[a-zA-Z0-9_-]{1,64}$/.test(voiceId)) {
    console.warn('[digest/audio] ELEVENLABS_VOICE_DEFAULT has unexpected format — skipping');
    return null;
  }

  if (!r2Bucket || !r2PublicDomain) {
    console.warn('[digest/audio] R2 not configured (DIGEST_R2 binding or R2_PUBLIC_DOMAIN missing) — skipping upload');
    return null;
  }

  const safeText = safeTruncate(text);
  // Capture narrowed string values for use inside the async closure below.
  // TypeScript cannot narrow `const` variables declared as `string | undefined`
  // through an early-return guard when they are closed over by an inner async function.
  const narrowedApiKey: string = apiKey;
  const narrowedVoiceId: string = voiceId;

  // ── 1. Call ElevenLabs TTS ────────────────────────────────────────────────
  let mp3Buffer: ArrayBuffer;
  try {
    // Helper: one TTS attempt with AbortSignal.timeout for clean cancellation.
    // Returns null on timeout or network error; returns the Response otherwise.
    const attemptTts = async (): Promise<Response | null> => {
      try {
        return await fetch(
          `${ELEVENLABS_API_BASE}/text-to-speech/${encodeURIComponent(narrowedVoiceId)}`,
          {
            method: 'POST',
            headers: {
              'xi-api-key': narrowedApiKey,
              'Content-Type': 'application/json',
              Accept: 'audio/mpeg',
            },
            body: JSON.stringify({
              text: safeText,
              model_id: 'eleven_turbo_v2',
              voice_settings: {
                stability: 0.5,
                similarity_boost: 0.75,
              },
            }),
            signal: AbortSignal.timeout(TTS_TIMEOUT_MS),
          },
        );
      } catch (err) {
        const e = err as Error;
        if (e.name === 'AbortError') {
          console.warn(`[digest/audio] ElevenLabs TTS timed out after ${TTS_TIMEOUT_MS}ms`);
        } else {
          console.error('[digest/audio] ElevenLabs TTS fetch failed:', e.message);
        }
        return null;
      }
    };

    let ttsRes = await attemptTts();

    // Retry once on transient failures (429 rate limit, 5xx server errors).
    // AbortError (timeout) comes back as null from attemptTts() and is NOT retried.
    let attempt = 0;
    const MAX_TTS_RETRIES = 1;
    while (ttsRes && (ttsRes.status === 429 || ttsRes.status >= 500) && attempt < MAX_TTS_RETRIES) {
      const delayMs = Math.min(1_000 * 2 ** attempt, 30_000);
      console.warn(`[digest/audio] ElevenLabs TTS returned ${ttsRes.status} (attempt ${attempt + 1}) — retrying after ${delayMs}ms`);
      await new Promise<void>((resolve) => { setTimeout(resolve, delayMs); });
      ttsRes = await attemptTts();
      attempt++;
    }

    if (!ttsRes) {
      return null;
    }

    if (!ttsRes.ok) {
      const errBody = await ttsRes.text();
      console.error(`[digest/audio] ElevenLabs TTS returned ${ttsRes.status}: ${errBody.slice(0, 200)}`);
      return null;
    }

    mp3Buffer = await ttsRes.arrayBuffer();
  } catch (err) {
    console.error('[digest/audio] ElevenLabs TTS unexpected error:', (err as Error).message);
    return null;
  }

  // ── 2. Upload to R2 ───────────────────────────────────────────────────────
  const key = `digest/${label}.mp3`;
  try {
    await r2Bucket.put(key, mp3Buffer, {
      httpMetadata: {
        contentType: 'audio/mpeg',
        cacheControl: 'public, max-age=86400',
      },
    });
  } catch (err) {
    console.error('[digest/audio] R2 upload failed:', (err as Error).message);
    return null;
  }

  // ── 3. Build public URL ───────────────────────────────────────────────────
  const domain = r2PublicDomain.replace(/\/$/, '');
  return `${domain}/${key}`;
}
