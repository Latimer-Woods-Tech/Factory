/**
 * Factory Digest — scheduled entry point.
 *
 * Called from the Worker `scheduled` handler twice daily:
 *   06:30 ET (10:30 UTC) and 18:30 ET (22:30 UTC).
 *
 * Pipeline:
 *   1. Collect data from GitHub, Sentry, Stripe, Supervisor.
 *   2. Generate ElevenLabs audio (best-effort; email proceeds on failure).
 *   3. Render HTML email + plain text.
 *   4. Send via Resend.
 *   5. Log outcome.
 */

import type { Env } from '../env.js';
import { collectAll } from './collect.js';
import { renderDigest } from './render.js';
import { generateAndUploadAudio } from './audio.js';
import { sendDigestEmail } from './send.js';

/**
 * Derives a short label for the audio filename: `2026-05-06-am` / `2026-05-06-pm`.
 */
function digestLabel(collectedAt: string): string {
  const dt = new Date(collectedAt);
  const date = dt.toISOString().slice(0, 10);
  const period = dt.getUTCHours() < 12 ? 'am' : 'pm';
  return `${date}-${period}`;
}

/**
 * Run the full digest pipeline.
 *
 * Exported so it can be unit-tested and called from the `scheduled` handler.
 */
export async function runDigest(env: Env): Promise<void> {
  console.log('[digest] starting collection');

  // ── 1. Collect ────────────────────────────────────────────────────────────
  const data = await collectAll(env);
  const label = digestLabel(data.collectedAt);
  console.log(`[digest] collection complete for ${label}`);

  // ── 2. Audio (best-effort) ────────────────────────────────────────────────
  // Render a plain-text summary first so audio can be generated before we
  // build the full HTML email.
  const { text: plainText } = renderDigest(data);
  const audioUrl = await generateAndUploadAudio(plainText, label, env);
  if (audioUrl) {
    console.log(`[digest] audio uploaded: ${audioUrl}`);
  } else {
    console.warn('[digest] audio generation skipped or failed — proceeding without audio link');
  }

  // ── 3. Render ─────────────────────────────────────────────────────────────
  const rendered = renderDigest(data, audioUrl ?? undefined);

  // ── 4. Send ───────────────────────────────────────────────────────────────
  const outcome = await sendDigestEmail(rendered, env);
  if (outcome.ok) {
    console.log(`[digest] email sent successfully, messageId=${outcome.messageId}`);
  } else {
    console.error(`[digest] email send failed: ${outcome.reason}`);
  }
}
