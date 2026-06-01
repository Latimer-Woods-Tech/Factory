// ---------------------------------------------------------------------------
// tts.ts — ElevenLabs text-to-speech narration generation.
//
// A thin, testable wrapper around the ElevenLabs v1 TTS API. Returns raw MP3
// bytes; the caller is responsible for writing or uploading them. The word
// "AI" never appears here (governance rule).
// ---------------------------------------------------------------------------

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
  return new Uint8Array(buffer);
}
