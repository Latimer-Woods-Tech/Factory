import { InternalError } from '@latimer-woods-tech/errors';

const RESEND_SEND_URL = 'https://api.resend.com/emails';

/**
 * Configuration for the Resend-backed email client.
 */
export interface EmailConfig {
  resendApiKey: string;
  /** Sender address, e.g. `'noreply@latwoodtech.com'`. */
  fromAddress: string;
  /** Display name shown alongside the sender address. */
  fromName: string;
}

/**
 * Options for transactional email sends.
 */
export interface SendTransactionalOpts {
  to: string;
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
}

/**
 * Options for enrolling a user in a drip sequence.
 */
export interface EnrollDripOpts {
  userId: string;
  email: string;
  sequence: string;
  data?: Record<string, unknown>;
}

/**
 * Email client returned by {@link createEmailClient}.
 */
export interface EmailClient {
  /**
   * Sends a one-off transactional email via Resend.
   * @returns The Resend message ID.
   */
  sendTransactional(opts: SendTransactionalOpts): Promise<{ id: string }>;

  /**
   * Enrolls the user in the named drip email sequence.
   * Sends the first email in the sequence immediately.
   */
  enrollDrip(opts: EnrollDripOpts): Promise<void>;

  /**
   * Unsubscribes the user from all email sequences.
   * Records suppression via a Resend contact tag.
   */
  unsubscribe(userId: string, email: string): Promise<void>;
}

/** @internal Looser fetch signature compatible with vi.fn mocks. */
type FetchFn = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

/** @internal Injected dependencies — primarily for testing. */
export interface EmailDeps {
  fetch?: FetchFn;
}

async function resendRequest(
  apiKey: string,
  path: string,
  body: Record<string, unknown>,
  fetchImpl: FetchFn,
): Promise<{ id: string }> {
  const res = await fetchImpl(`https://api.resend.com${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => String(res.status));
    throw new InternalError(`Resend request to ${path} failed (${String(res.status)}): ${text}`, {
      path,
      status: res.status,
    });
  }

  const json = (await res.json()) as { id?: string };
  return { id: json.id ?? '' };
}

/**
 * Creates a Resend-backed {@link EmailClient}.
 *
 * @example
 * ```ts
 * const email = createEmailClient({
 *   resendApiKey: env.RESEND_API_KEY,
 *   fromAddress: 'noreply@latwoodtech.com',
 *   fromName: 'Factory',
 * });
 * await email.sendTransactional({ to: 'user@example.com', subject: 'Welcome!', html: '<p>Hi</p>' });
 * ```
 */
export function createEmailClient(config: EmailConfig, deps: EmailDeps = {}): EmailClient {
  const fetchImpl: FetchFn = deps.fetch ?? fetch;
  const from = `${config.fromName} <${config.fromAddress}>`;

  return {
    async sendTransactional(opts) {
      return resendRequest(
        config.resendApiKey,
        '/emails',
        {
          from,
          to: opts.to,
          subject: opts.subject,
          html: opts.html,
          ...(opts.text ? { text: opts.text } : {}),
          ...(opts.replyTo ? { reply_to: opts.replyTo } : {}),
        },
        fetchImpl,
      );
    },

    async enrollDrip(opts) {
      // Send the first email in the drip sequence tagged with the sequence name.
      await resendRequest(
        config.resendApiKey,
        '/emails',
        {
          from,
          to: opts.email,
          subject: `You're enrolled in ${opts.sequence}`,
          html: `<p>You have been enrolled in the <strong>${opts.sequence}</strong> sequence.</p>`,
          tags: [
            { name: 'sequence', value: opts.sequence },
            { name: 'userId', value: opts.userId },
          ],
          ...(opts.data ? { metadata: opts.data } : {}),
        },
        fetchImpl,
      );
    },

    async unsubscribe(userId, email) {
      // Tag the contact as unsubscribed via the Resend contacts API.
      await resendRequest(
        config.resendApiKey,
        '/contacts',
        {
          email,
          unsubscribed: true,
          metadata: { userId },
        },
        fetchImpl,
      );
    },
  };
}

/** Re-export path used in tsup entry. */
export const RESEND_BASE_URL = RESEND_SEND_URL;
