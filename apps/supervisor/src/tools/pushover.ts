/**
 * Pushover notification tool for the Factory Supervisor.
 *
 * Sends a daily run digest via Pushover. This is best-effort: errors are
 * logged but never thrown so a notification failure never aborts a run.
 *
 * Required secrets: PUSHOVER_TOKEN, PUSHOVER_USER_KEY
 */

const PUSHOVER_API = 'https://api.pushover.net/1/messages.json';

export interface RunDigest {
  /** Total issues that matched a template */
  matched: number;
  /** Issues that had no matching template */
  noTemplate: number;
  /** Issues whose plan was approved since last run */
  approved: number;
  /** Any errors encountered during the run */
  errors: string[];
}

/**
 * Format a digest into a human-readable Pushover message body.
 * Kept short (< 512 chars) to fit Pushover limits cleanly.
 */
function formatDigestMessage(digest: RunDigest): string {
  const lines: string[] = [
    `Factory Supervisor — daily digest`,
    `✅ Matched: ${digest.matched}`,
    `🚫 No template: ${digest.noTemplate}`,
    `👍 Approved: ${digest.approved}`,
  ];

  if (digest.errors.length > 0) {
    lines.push(`⚠️ Errors: ${digest.errors.length}`);
    // Include first error truncated so the message stays readable
    const firstError = digest.errors[0] ?? '';
    lines.push(`  └ ${firstError.slice(0, 120)}`);
  }

  return lines.join('\n');
}

/**
 * Send a run digest notification via Pushover.
 *
 * Best-effort: catches all errors and logs them without re-throwing.
 * A Pushover failure must never abort or fail the supervisor run.
 */
export async function sendDigest(
  token: string,
  userKey: string,
  digest: RunDigest,
): Promise<void> {
  try {
    const message = formatDigestMessage(digest);

    const body = new URLSearchParams({
      token,
      user: userKey,
      message,
      title: 'Supervisor Run Complete',
      priority: digest.errors.length > 0 ? '0' : '-1',
    });

    const res = await fetch(PUSHOVER_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '(no body)');
      console.error(`[pushover] API error ${res.status}: ${text}`);
      return;
    }

    console.log('[pushover] digest sent successfully');
  } catch (err) {
    // Best-effort: log and swallow
    console.error('[pushover] failed to send digest (swallowed):', err);
  }
}
