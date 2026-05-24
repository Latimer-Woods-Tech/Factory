#!/usr/bin/env node
// =============================================================================
// pushover-notify.mjs — out-of-band alerting via Pushover.
//
// Defense Layer #2 from the governance-of-governance decision
// (docs/decisions/2026-05-23-governance-of-governance.md).
//
// Pushover is an EXTERNAL service. Its failure modes do not overlap with
// GitHub Actions, our workflow logic, or our own automation. That makes it
// the right channel for "the system is doing something — you should know."
//
// USAGE (as a library):
//   import { notify } from './pushover-notify.mjs';
//   await notify({
//     title: '[Factory · QUARANTINE] smoke-admin-studio (Tier-2)',
//     message: '10 consecutive failures since 2026-05-21',
//     url: 'https://github.com/.../actions/runs/12345',
//     priority: 1,
//   });
//
// USAGE (as a CLI for shell-only callers):
//   PUSHOVER_TITLE='...' PUSHOVER_MESSAGE='...' node pushover-notify.mjs
//
// SECRETS:
//   PUSHOVER_USER_KEY   — required (set per CODEOWNER; not present in dev)
//   PUSHOVER_APP_TOKEN  — required (set per CODEOWNER; not present in dev)
//
// NO-OP BEHAVIOR:
//   If EITHER secret is missing, notify() logs a warning and returns
//   { sent: false, reason: 'secrets-missing' }. This lets dev/test
//   environments run end-to-end automation without paging real devices.
//   Callers MUST NOT throw on { sent: false } — the notification is
//   advisory, never load-bearing.
//
// AUDIT TRAIL:
//   Every notification (sent or no-op'd) emits a single-line JSON log to
//   stdout with a stable schema. The monthly governance audit greps GH
//   Actions logs for `PUSHOVER_AUDIT:` to roll these up.
// =============================================================================

import { existsSync } from 'node:fs';

// Defense #1 — kill switch check. Inlined here (rather than imported from
// snapshot-pr-helper.mjs) because this helper may be installed on apps that
// don't have snapshot-pr-helper. Single-line, single-purpose, cannot drift
// from the canonical definition in snapshot-pr-helper.mjs since both just
// check file existence at the same path.
//
// TODO(post-#920-merge): if we end up with > 2 callers, extract to
// `.github/scripts/automation-paused.mjs` and have both files import it.
function isAutomationPaused(pausePath = '.github/automation-paused') {
  return existsSync(pausePath);
}

const PUSHOVER_API = 'https://api.pushover.net/1/messages.json';
const MAX_TITLE_LEN = 250;    // Pushover hard cap
const MAX_MESSAGE_LEN = 1024; // Pushover hard cap for messages
const MAX_URL_LEN = 512;      // Pushover hard cap for URLs

// ---------------------------------------------------------------------------
// Pure functions — testable in isolation, no I/O.
// ---------------------------------------------------------------------------

/**
 * Truncate a string to a max length with an ellipsis suffix when truncated.
 * Pure function — testable.
 */
export function truncate(s, max) {
  if (typeof s !== 'string') return '';
  if (s.length <= max) return s;
  return s.slice(0, max - 3) + '...';
}

/**
 * Build the URLSearchParams body Pushover expects. Pure — testable.
 * Returns a URLSearchParams instance (caller serializes to wire format).
 */
export function buildRequestBody({ userKey, appToken, title, message, url, priority }) {
  const params = new URLSearchParams();
  params.set('user', userKey);
  params.set('token', appToken);
  params.set('title', truncate(title, MAX_TITLE_LEN));
  params.set('message', truncate(message, MAX_MESSAGE_LEN));
  if (url) params.set('url', truncate(url, MAX_URL_LEN));
  // Priority: -2 lowest, -1 low, 0 normal (default), 1 high, 2 emergency
  // We clamp emergency (2) DOWN to high (1) to prevent any caller from
  // accidentally triggering the retry-until-acknowledged behavior that
  // priority 2 requires.
  const p = Math.max(-2, Math.min(1, Number(priority) || 0));
  if (p !== 0) params.set('priority', String(p));
  return params;
}

/**
 * Validate inputs. Returns { ok, reason } where reason is a structured code
 * suitable for logging in the audit trail. Pure — testable.
 */
export function validateInputs({ title, message, userKey, appToken }) {
  if (!userKey || !appToken) {
    return { ok: false, reason: 'secrets-missing' };
  }
  if (!title || !title.trim()) {
    return { ok: false, reason: 'title-empty' };
  }
  if (!message || !message.trim()) {
    return { ok: false, reason: 'message-empty' };
  }
  return { ok: true };
}

/**
 * Emit a structured audit log line. The monthly governance audit greps for
 * "PUSHOVER_AUDIT:" to roll these up. Stable schema — do not change field
 * names without bumping the audit script.
 */
export function logAudit({ sent, reason, title, priority }) {
  const entry = {
    ts: new Date().toISOString(),
    sent,
    reason: reason || null,
    title: truncate(title || '', 120),
    priority: priority ?? 0,
  };
  // Single-line JSON for easy grep + parse downstream.
  console.log(`PUSHOVER_AUDIT: ${JSON.stringify(entry)}`);
}

// ---------------------------------------------------------------------------
// Main API: notify()
// ---------------------------------------------------------------------------

/**
 * Send a Pushover notification. Idempotent in the sense that calling twice
 * with the same content results in two notifications (Pushover does not
 * dedup) — callers MUST dedup at their layer if needed.
 *
 * @param {Object} opts
 * @param {string} opts.title    — Required. Shown as the notification title.
 * @param {string} opts.message  — Required. Shown as the body.
 * @param {string} [opts.url]    — Optional. Tap-target URL.
 * @param {number} [opts.priority] — Optional. -2..1. (2 is clamped to 1.)
 * @param {string} [opts.userKey]  — Override env. For tests only.
 * @param {string} [opts.appToken] — Override env. For tests only.
 * @param {Function} [opts.fetchImpl] — Override global fetch. For tests.
 * @returns {Promise<{ sent: boolean, reason?: string, status?: number }>}
 */
export async function notify(opts = {}) {
  const {
    title,
    message,
    url,
    priority,
    userKey = process.env.PUSHOVER_USER_KEY,
    appToken = process.env.PUSHOVER_APP_TOKEN,
    fetchImpl = globalThis.fetch,
  } = opts;

  // Kill switch — Defense #1. If automation is paused, do not page.
  // Skip when PUSHOVER_USER_KEY isn't set anyway (avoids a meaningless
  // pause-check in dev where the kill switch isn't even reachable).
  if (userKey && appToken && isAutomationPaused()) {
    logAudit({ sent: false, reason: 'automation-paused', title, priority });
    return { sent: false, reason: 'automation-paused' };
  }

  const validation = validateInputs({ title, message, userKey, appToken });
  if (!validation.ok) {
    logAudit({ sent: false, reason: validation.reason, title, priority });
    if (validation.reason === 'secrets-missing') {
      console.warn(`pushover-notify: secrets missing; notification not sent (title="${title}")`);
    } else {
      console.error(`pushover-notify: invalid input — ${validation.reason}`);
    }
    return { sent: false, reason: validation.reason };
  }

  const body = buildRequestBody({ userKey, appToken, title, message, url, priority });

  try {
    const res = await fetchImpl(PUSHOVER_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });
    const status = res.status;
    if (status >= 200 && status < 300) {
      logAudit({ sent: true, reason: null, title, priority });
      return { sent: true, status };
    }
    let detail = '';
    try { detail = (await res.text()).slice(0, 200); } catch { /* swallow */ }
    logAudit({ sent: false, reason: `http-${status}`, title, priority });
    console.error(`pushover-notify: HTTP ${status} from Pushover API: ${detail}`);
    return { sent: false, reason: `http-${status}`, status };
  } catch (err) {
    logAudit({ sent: false, reason: 'network-error', title, priority });
    console.error(`pushover-notify: network error: ${err.message}`);
    return { sent: false, reason: 'network-error' };
  }
}

// ---------------------------------------------------------------------------
// CLI mode — for shell-only callers like bash workflow steps.
// ---------------------------------------------------------------------------
async function cliMain() {
  const result = await notify({
    title: process.env.PUSHOVER_TITLE,
    message: process.env.PUSHOVER_MESSAGE,
    url: process.env.PUSHOVER_URL,
    priority: process.env.PUSHOVER_PRIORITY ? Number(process.env.PUSHOVER_PRIORITY) : 0,
  });
  // Exit 0 on success OR on graceful no-op (secrets-missing, paused).
  // Exit 1 ONLY on actual delivery failure that callers should be aware of.
  if (!result.sent && !['secrets-missing', 'automation-paused'].includes(result.reason)) {
    process.exit(1);
  }
}

// Only execute CLI when invoked directly.
if (import.meta.url === `file://${process.argv[1]}` || import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/'))) {
  cliMain();
}
