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
  env: Env;
}

export async function synthesizeAndStore(input: TtsInput): Promise<string | null> {
  const { text, dateLabel, env } = input;

  // Trim to ElevenLabs' safe limit (~4 500 chars) — the narration should be well under this
  const safeText = text.slice(0, 4_400);

  const audioBuffer = await synthesize(safeText, env.ELEVENLABS_VOICE_ID, env.ELEVENLABS_API_KEY, {
    stability: 0.55,
    similarityBoost: 0.75,
  });

  const key = `briefs/${dateLabel}-narration.mp3`;

  await env.AUDIO_BUCKET.put(key, audioBuffer, {
    httpMetadata: { contentType: 'audio/mpeg' },
    customMetadata: { generated: new Date().toISOString() },
  });

  return `${env.AUDIO_PUBLIC_BASE_URL}/${key}`;
}
