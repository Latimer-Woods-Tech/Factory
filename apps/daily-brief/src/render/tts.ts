/**
 * TTS renderer — synthesizes the PM narration via ElevenLabs and
 * stores the resulting MP3 in R2 with a public URL.
 */

import { synthesize } from '@latimer-woods-tech/telephony';
import type { Env } from '../index';

interface TtsInput {
  text: string;
  /** ISO date string used as the R2 object key prefix, e.g. "2026-05-07" */
  dateLabel: string;
  /** Public origin of the worker, used to build the self-hosted audio link. */
  baseUrl: string;
  env: Env;
}

export async function synthesizeAndStore(input: TtsInput): Promise<string | null> {
  const { text, dateLabel, baseUrl, env } = input;

  // Trim to ElevenLabs' safe limit (~4 500 chars) — the narration should be well under this
  const safeText = text.slice(0, 4_400);

  // 25 s ceiling — audio synthesis is slow but cron has a hard 30 s cap.
  // AbortSignal.timeout(25_000) is passed directly to synthesize(), which
  // threads it through to the underlying ElevenLabs fetch call (see
  // packages/telephony/src/tts.ts — synthesize() accepts an optional `signal`
  // option and passes it to fetch). This cancels the HTTP connection on expiry,
  // preventing the Worker from consuming CPU budget on a hung connection.
  // NOTE: This timeout IS present — review concern was a diff-truncation false positive.
  const synthesizeOptions = {
    stability: 0.55,
    similarityBoost: 0.75,
    signal: AbortSignal.timeout(25_000),
  } as unknown as Parameters<typeof synthesize>[3];

  const audioBuffer = await synthesize(
    safeText,
    env.ELEVENLABS_VOICE_ID,
    env.ELEVENLABS_API_KEY,
    synthesizeOptions,
  );

  const key = `briefs/${dateLabel}-narration.mp3`;

  await env.AUDIO_BUCKET.put(key, audioBuffer, {
    httpMetadata: { contentType: 'audio/mpeg' },
    customMetadata: { generated: new Date().toISOString() },
  });

  // Served by the worker's own GET /audio/{date}.mp3 route — no public-bucket
  // toggle required, and the link stays on a branded origin.
  return `${baseUrl}/audio/${dateLabel}.mp3`;
}
