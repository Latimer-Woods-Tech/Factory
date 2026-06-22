/**
 * Factory Digest — email delivery via Resend.
 *
 * Sends the rendered HTML digest to the configured recipient.
 * Never throws — returns a typed result object so the caller can log outcomes.
 */

import type { Env } from '../env.js';
import type { RenderedDigest } from './render.js';

const RESEND_API = 'https://api.resend.com/emails';
const FROM_ADDRESS = 'Factory Digest <digest@apunlimited.com>';
const SEND_TIMEOUT_MS = 15_000;

export interface SendResult {
  ok: true;
  messageId: string;
}

export interface SendFailure {
  ok: false;
  reason: string;
}

export type SendOutcome = SendResult | SendFailure;

/**
 * Delivers the digest email via Resend.
 *
 * Transaction ordering / KV dedup (see also `index.ts`):
 *   The caller (`runDigest` in index.ts) writes the dedup KV key
 *   (`digest:sent:{windowLabel}`) ONLY after this function returns `{ ok: true }`.
 *   If email delivery fails, the KV write never happens, so the next cron retry
 *   will attempt delivery again. There is no risk of KV suppression without a
 *   confirmed successful send.
 *
 * @param digest  - Rendered subject, HTML, and plain-text body.
 * @param env     - Worker bindings (needs RESEND_API_KEY + DIGEST_TO_EMAIL).
 */
export async function sendDigestEmail(
  digest: RenderedDigest,
  env: Env,
): Promise<SendOutcome> {
  const apiKey = env.RESEND_API_KEY;
  const toEmail = env.DIGEST_TO_EMAIL ?? 'adrper79@gmail.com';

  if (!apiKey) {
    return { ok: false, reason: 'RESEND_API_KEY not configured' };
  }

  // AbortSignal.timeout() is the Workers-native timeout pattern — no manual
  // AbortController + setTimeout needed. If the request exceeds SEND_TIMEOUT_MS,
  // the signal fires automatically and the catch block returns a typed failure.
  try {
    const res = await fetch(RESEND_API, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: FROM_ADDRESS,
        to: [toEmail],
        subject: digest.subject,
        html: digest.html,
        text: digest.text,
      }),
      signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
    });

    if (!res.ok) {
      const body = await res.text();
      return { ok: false, reason: `Resend API returned ${res.status}: ${body.slice(0, 200)}` };
    }

    const json = await res.json<{ id?: string }>();
    return { ok: true, messageId: json.id ?? 'unknown' };
  } catch (err) {
    const msg = (err as Error).message;
    return { ok: false, reason: `Resend fetch failed: ${msg}` };
  }
}
