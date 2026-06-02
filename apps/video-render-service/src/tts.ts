// ---------------------------------------------------------------------------
// tts.ts — ElevenLabs text-to-speech narration generation.
//
// A thin, testable wrapper around the ElevenLabs v1 TTS API. Returns raw MP3
// bytes; the caller is responsible for writing or uploading them. The word
// "AI" never appears here (governance rule).
// ---------------------------------------------------------------------------

/**
 * Minimum acceptable byte length for a returned MP3 narration.
 *
 * At 128 kbps, a 75-second narration is ~1.2 MB. 50 KB is a very conservative
 * floor — a genuine full-length response is 20–25× larger. Anything below this
 * threshold is a corrupt or truncated response (e.g. ElevenLabs returning a
 * 9 KB stub that plays for 0.55 s) and must be rejected before writing to R2.
 *
 * Exported so tests can reference the constant without hardcoding the value.
 */
export const TTS_MIN_BYTES = 50_000;

/**
 * Thrown when ElevenLabs returns a response that is suspiciously small.
 *
 * A response under {@link TTS_MIN_BYTES} is treated as corrupt/truncated: it
 * would produce a film whose narration plays for under a second then goes
 * silent, which is worse than no audio at all. The pipeline's `try/catch` will
 * catch this error, log it, and gracefully-degrade to a silent render.
 */
export class TtsResponseTooShortError extends Error {
  /** Actual byte length received from ElevenLabs. */
  readonly actual: number;
  /** Minimum acceptable byte length ({@link TTS_MIN_BYTES}). */
  readonly minimumExpected: number;

  constructor(actual: number, minimumExpected: number) {
    super(
      `ElevenLabs narration too short: ${String(actual)}B (minimum ${String(minimumExpected)}B)`,
    );
    this.name = 'TtsResponseTooShortError';
    this.actual = actual;
    this.minimumExpected = minimumExpected;
  }
}

/**
 * Strip a leading UTF-8 BOM (`U+FEFF`) and trim surrounding whitespace from a
 * GCP Secret Manager value. GCP sometimes stores secrets with a BOM or trailing
 * newline depending on how they were created (`echo` vs `printf`). This matches
 * the documented BOM trap in `server.ts` and the render-video.yml runbook.
 *
 * @internal
 */
function sanitizeSecret(value: string): string {
  return (value.charCodeAt(0) === 0xfeff ? value.slice(1) : value).trim();
}

/**
 * Calls the ElevenLabs v1 TTS API and returns the narration as raw MP3 bytes.
 *
 * The proven parameters from `.github/workflows/render-video.yml` (step 4) are
 * used: `eleven_multilingual_v2` model, stability 0.5, similarity_boost 0.75.
 *
 * @param args.text - The narration script to synthesise.
 * @param args.voiceId - The ElevenLabs voice id (GCP secret
 *   `ELEVENLABS_VOICE_PRIME_SELF`). Leading BOM and trailing whitespace are
 *   stripped automatically (documented GCP BOM trap).
 * @param args.apiKey - The ElevenLabs API key (GCP secret
 *   `ELEVENLABS_API_KEY`). Same BOM/whitespace stripping applied.
 * @param args.fetchImpl - Optional fetch implementation; defaults to the
 *   global `fetch`. Inject a mock in unit tests.
 * @returns Raw MP3 bytes as a `Uint8Array`.
 * @throws {Error} When ElevenLabs returns a non-200 status. The error message
 *   includes the HTTP status code and up to 300 characters of the response
 *   body so failures are diagnosable from Cloud Run logs.
 * @throws {TtsResponseTooShortError} When the returned MP3 is under
 *   {@link TTS_MIN_BYTES} bytes — indicates a corrupt or truncated response.
 */
export async function generateNarrationMp3(args: {
  text: string;
  voiceId: string;
  apiKey: string;
  fetchImpl?: typeof fetch;
}): Promise<Uint8Array> {
  const fetchFn = args.fetchImpl ?? globalThis.fetch;
  const apiKey = sanitizeSecret(args.apiKey);
  const voiceId = sanitizeSecret(args.voiceId);

  const body = JSON.stringify({
    text: args.text,
    model_id: 'eleven_multilingual_v2',
    voice_settings: { stability: 0.5, similarity_boost: 0.75 },
  });

  let res: Response;
  try {
    res = await fetchFn(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
      {
        method: 'POST',
        headers: {
          'xi-api-key': apiKey,
          accept: 'audio/mpeg',
          'content-type': 'application/json',
        },
        body,
      },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`ElevenLabs TTS request failed: ${message}`);
  }

  if (!res.ok) {
    // Read up to 300 chars of the error body for diagnosis (it may be binary
    // garbage on a partial success, so truncate and sanitise).
    let snippet = '';
    try {
      const raw = await res.text();
      snippet = raw.slice(0, 300);
    } catch {
      // ignore — body read failure is non-fatal here
    }
    throw new Error(
      `ElevenLabs TTS returned HTTP ${String(res.status)}${snippet ? `: ${snippet}` : ''}`,
    );
  }

  const buffer = await res.arrayBuffer();
  const bytes = new Uint8Array(buffer);

  // Log the response size so operators can monitor for unexpectedly small
  // responses in Cloud Run logs even when the request technically succeeded.
  console.log(`[tts] ElevenLabs response: ${String(bytes.length)} bytes`);

  // Guard: reject responses that are suspiciously small. A 9 KB "narration"
  // plays for ~0.55 s then goes silent — worse than no audio. Only accept
  // responses that are at least TTS_MIN_BYTES (50 KB).
  if (bytes.length < TTS_MIN_BYTES) {
    console.error(
      `[tts] narration too short: ${String(bytes.length)}B (minimum ${String(TTS_MIN_BYTES)}B)`,
    );
    throw new TtsResponseTooShortError(bytes.length, TTS_MIN_BYTES);
  }

  return bytes;
}
