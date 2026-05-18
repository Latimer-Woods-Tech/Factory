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
import { createLogger } from '@latimer-woods-tech/logger';
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
  // ── 0. Deduplication guard ────────────────────────────────────────────────
  // The cron fires twice daily. A Worker restart or retry within the same
  // half-day window must not send a duplicate email.
  const windowLabel = (() => {
    const now = new Date();
    const date = now.toISOString().slice(0, 10);
    const period = now.getUTCHours() < 12 ? 'am' : 'pm';
    return `${date}-${period}`;
  })();
  const dedupKey = `digest:sent:${windowLabel}`;
  const digestLogger = createLogger({ workerId: 'admin-studio-digest', requestId: dedupKey });

  if (env.MONITOR_KV) {
    const already = await env.MONITOR_KV.get(dedupKey);
    if (already) {
      digestLogger.info('digest_skip_duplicate', { event: 'digest.skip', window_label: windowLabel, request_id: dedupKey });
      return;
    }
  }

  digestLogger.info('digest_collection_start', { event: 'digest.collect.start', request_id: dedupKey });

  // ── 1. Collect ────────────────────────────────────────────────────────────
  const data = await collectAll(env);
  const label = digestLabel(data.collectedAt);
  digestLogger.info('digest_collection_complete', { event: 'digest.collect.done', label, request_id: dedupKey });

  // ── 2. Audio (best-effort) ────────────────────────────────────────────────
  // Render a plain-text summary first so audio can be generated before we
  // build the full HTML email.
  const { text: plainText } = renderDigest(data);
  const audioUrl = await generateAndUploadAudio(plainText, label, env);
  if (audioUrl) {
    digestLogger.info('digest_audio_uploaded', { event: 'digest.audio.uploaded', audio_url: audioUrl, request_id: dedupKey });
  } else {
    digestLogger.warn('digest_audio_skipped', { event: 'digest.audio.skipped', request_id: dedupKey });
  }

  // ── 3. Render ─────────────────────────────────────────────────────────────
  const rendered = renderDigest(data, audioUrl ?? undefined);

  // ── 4. Send ───────────────────────────────────────────────────────────────
  const outcome = await sendDigestEmail(rendered, env);
  if (outcome.ok) {
    digestLogger.info('digest_email_sent', {
      event: 'digest.email.sent',
      message_id: outcome.messageId,
      request_id: dedupKey,
    });
    // KV dedup write is intentionally AFTER confirmed delivery (outcome.ok === true).
    // If sendDigestEmail returns { ok: false }, this block is skipped entirely so the
    // KV key is never written — future cron retries will re-attempt delivery.
    // This prevents the failure mode where a suppression key is written before the
    // email is confirmed delivered, which would silently skip all future retries.
    if (env.MONITOR_KV) {
      await env.MONITOR_KV.put(dedupKey, '1', { expirationTtl: 86400 });
    }
  } else {
    digestLogger.error('digest_email_failed', { event: 'digest.email.failed', reason: outcome.reason, request_id: dedupKey });
  }
}
