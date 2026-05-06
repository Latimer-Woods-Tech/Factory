/**
 * Factory Digest — email delivery via Resend.
 *
 * Sends the rendered HTML digest to the configured recipient.
 * Never throws — returns a typed result object so the caller can log outcomes.
 */

import type { Env } from '../env.js';
import type { RenderedDigest } from './render.js';

const RESEND_API = 'https://api.resend.com/emails';
const FROM_ADDRESS = 'Factory Digest <digest@thefactory.dev>';
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

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), SEND_TIMEOUT_MS);

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
      signal: ctrl.signal,
    });
    clearTimeout(timer);

    if (!res.ok) {
      const body = await res.text();
      return { ok: false, reason: `Resend API returned ${res.status}: ${body.slice(0, 200)}` };
    }

    const json = await res.json() as { id?: string };
    return { ok: true, messageId: json.id ?? 'unknown' };
  } catch (err) {
    clearTimeout(timer);
    const msg = (err as Error).message;
    return { ok: false, reason: `Resend fetch failed: ${msg}` };
  }
}
