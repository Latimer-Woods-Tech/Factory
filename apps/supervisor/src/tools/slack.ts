/**
 * Slack Events API receiver for the Factory Supervisor.
 *
 * Receives Slack event subscriptions at POST /slack/events, verifies the
 * request signature using HMAC-SHA256 (Web Crypto API — no Node.js crypto),
 * and converts direct messages from the workspace owner into GitHub Issues
 * labelled `supervisor:approved-source` so the supervisor cron picks them up
 * on its next scheduled run.
 *
 * Security posture:
 *   - Slack signing secret verified via constant-time HMAC-SHA256 comparison.
 *   - Stale requests (>5 min clock skew) are rejected before signature check.
 *   - Only DMs from SLACK_OWNER_USER_ID create issues — all other events are acked and dropped.
 *   - GitHub issue creation runs in a detached ctx.waitUntil()-style task so
 *     Slack's 3-second acknowledgement window is never blocked.
 */

import type { Env } from '../index.js';
import { getInstallationToken } from './github-auth.js';

const SLACK_TIMESTAMP_TOLERANCE_SECONDS = 300; // 5 minutes
const GITHUB_API_TIMEOUT_MS = 10_000;
const GITHUB_REPO = 'Latimer-Woods-Tech/Factory';
const ISSUE_LABEL = 'supervisor:approved-source';

/**
 * Verify a Slack request signature.
 *
 * Slack computes: HMAC-SHA256(signingSecret, `v0:${timestamp}:${rawBody}`)
 * and sends it as `x-slack-signature: v0=<hex>`.
 */
async function verifySlackSignature(
  signingSecret: string,
  timestamp: string,
  rawBody: string,
  signature: string,
): Promise<boolean> {
  const baseString = `v0:${timestamp}:${rawBody}`;
  const encoder = new TextEncoder();

  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(signingSecret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );

  const mac = await crypto.subtle.sign('HMAC', key, encoder.encode(baseString));

  const computed =
    'v0=' +
    Array.from(new Uint8Array(mac))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');

  // Constant-time comparison — prevent timing side channels.
  if (computed.length !== signature.length) return false;
  let mismatch = 0;
  for (let i = 0; i < computed.length; i++) {
    mismatch |= computed.charCodeAt(i) ^ signature.charCodeAt(i);
  }
  return mismatch === 0;
}

/** Create a GitHub Issue via the GitHub App installation token. */
async function createGitHubIssue(env: Env, title: string, body: string): Promise<void> {
  const token = await getInstallationToken(
    env.FACTORY_APP_ID,
    env.FACTORY_APP_PRIVATE_KEY,
    env.FACTORY_APP_INSTALLATION_ID,
  );

  const resp = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/issues`, {
    method: 'POST',
    signal: AbortSignal.timeout(GITHUB_API_TIMEOUT_MS),
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
      'User-Agent': 'factory-supervisor/1.0',
    },
    body: JSON.stringify({ title, body, labels: [ISSUE_LABEL] }),
  });

  if (!resp.ok) {
    const text = await resp.text().catch(() => '(no body)');
    throw new Error(`GitHub issue creation failed: ${resp.status} ${text.slice(0, 200)}`);
  }
}

/**
 * Handle POST /slack/events — Slack Events API receiver.
 *
 * Responds with 200 immediately after verification to stay within Slack's
 * 3-second acknowledgement window. Issue creation happens asynchronously.
 */
export async function handleSlackEvents(request: Request, env: Env): Promise<Response> {
  const rawBody = await request.text();
  const timestamp = request.headers.get('x-slack-request-timestamp') ?? '';
  const signature = request.headers.get('x-slack-signature') ?? '';

  // Reject stale requests — prevents replay attacks.
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - Number(timestamp)) > SLACK_TIMESTAMP_TOLERANCE_SECONDS) {
    return new Response('Request too stale', { status: 400 });
  }

  const valid = await verifySlackSignature(env.SLACK_SIGNING_SECRET, timestamp, rawBody, signature);
  if (!valid) {
    return new Response('Invalid signature', { status: 401 });
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    return new Response('Invalid JSON', { status: 400 });
  }

  // Slack URL verification handshake (one-time on initial app configuration).
  if (payload['type'] === 'url_verification') {
    return Response.json({ challenge: payload['challenge'] });
  }

  // Process event_callback — only handle DMs from the workspace owner.
  if (payload['type'] === 'event_callback') {
    const event = payload['event'] as Record<string, unknown> | undefined;

    const isDm =
      event &&
      event['type'] === 'message' &&
      event['channel_type'] === 'im' &&
      !event['bot_id'] && // ignore bot echoes
      !event['subtype'] && // ignore edits, deletes, joins, etc.
      event['user'] === env.SLACK_OWNER_USER_ID;

    if (isDm) {
      const text = String(event['text'] ?? '').trim();
      if (text) {
        const lines = text.split('\n');
        const title = (lines[0] ?? '').slice(0, 120);
        const issueBody = `_Received via Slack DM · ${new Date().toISOString()}_\n\n${text}`;

        // Fire-and-forget — Slack requires a 200 within 3 seconds.
        void createGitHubIssue(env, title, issueBody).catch((err: unknown) => {
          console.error('[slack] GitHub issue creation failed:', err);
        });
      }
    }
  }

  return new Response('ok');
}
