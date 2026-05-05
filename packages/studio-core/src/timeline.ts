/**
 * Unified incident and audit timeline types.
 *
 * A TimelineEvent is a single entry in the merged view that combines:
 *   - Audit entries (operator actions from studio_audit_log)
 *   - Incidents (Sentry errors / unresolved issues)
 *   - Deploy events (workflow dispatches)
 *
 * Request correlation: events sharing a `requestId` or `sessionId` can be
 * linked across these sources so an operator can trace a failure from the
 * user-visible error all the way through the operator action and deploy that
 * introduced the regression.
 *
 * @see apps/admin-studio/src/routes/timeline.ts
 */

import type { Environment } from './env-context.js';

/**
 * Source category of a timeline event.
 * - `audit`    — operator action recorded in studio_audit_log
 * - `incident` — Sentry issue / unresolved error
 * - `deploy`   — workflow dispatch (GitHub Actions)
 */
export type TimelineEventKind = 'audit' | 'incident' | 'deploy';

/**
 * Normalised severity that spans all event kinds.
 *
 * Mapping from source:
 * - audit result 'success' / 'dry-run' → info
 * - audit result 'failure'             → error
 * - Sentry level 'info'                → info
 * - Sentry level 'warning'             → warning
 * - Sentry level 'error'               → error
 * - Sentry level 'fatal' / 'critical'  → critical
 * - deploy (any)                        → info
 */
export type TimelineSeverity = 'info' | 'warning' | 'error' | 'critical';

/**
 * A single entry in the unified timeline.
 */
export interface TimelineEvent {
  /** Opaque unique id (audit entry UUID, Sentry issue id, or deploy UUID). */
  id: string;
  kind: TimelineEventKind;
  /** ISO 8601 UTC timestamp. */
  occurredAt: string;
  env: Environment;
  /** Factory app name, e.g. 'wordis-bond', 'admin-studio'. */
  app?: string;
  severity: TimelineSeverity;
  /** Human-readable summary: action name, Sentry title, or deploy workflow. */
  title: string;
  /** Machine-readable action or Sentry fingerprint. */
  action?: string;
  /** Structured details (audit payload, Sentry culprit, deploy inputs). */
  detail?: Record<string, unknown>;

  // ── Actor ───────────────────────────────────────────────────────────────────
  actorId?: string;
  actorEmail?: string;
  actorRole?: string;

  // ── Correlation IDs ─────────────────────────────────────────────────────────
  /** X-Request-Id / requestId from the audit row or Sentry tag. */
  requestId?: string;
  /** Studio session id from the audit row. */
  sessionId?: string;

  // ── External links ──────────────────────────────────────────────────────────
  /** Permalink to the Sentry issue, GitHub Actions run, or audit detail view. */
  sourceUrl?: string;
  /** Git ref (sha or tag) associated with the event (deploys, Sentry releases). */
  deployRef?: string;
}

/**
 * Filter and pagination parameters for `GET /timeline`.
 * All fields are optional — omitting all returns the most recent events for
 * the caller's current environment.
 */
export interface TimelineQuery {
  /** Restrict to a single env. Defaults to the caller's session env. */
  env?: Environment;
  /** Filter to a specific Factory app. Substring match on `app`. */
  app?: string;
  severity?: TimelineSeverity;
  /**
   * Filter by actor user-id (exact) OR actor email (substring, case-insensitive).
   * Corresponds to `user_id` / `user_email` in studio_audit_log.
   */
  actor?: string;
  /** Exact match on `request_id` / `X-Request-Id`. */
  requestId?: string;
  /** Exact match on `session_id`. */
  sessionId?: string;
  /** Lower bound (inclusive), ISO 8601. */
  from?: string;
  /** Upper bound (exclusive), ISO 8601. */
  to?: string;
  /** Page size, 1..200. Default 50. */
  limit?: number;
  /**
   * Cursor: ISO 8601 timestamp of the last event from the previous page.
   * Events with `occurred_at < cursor` are returned.
   */
  cursor?: string;
}

/**
 * Pagination envelope returned by `GET /timeline`.
 */
export interface TimelinePage {
  events: TimelineEvent[];
  /** ISO 8601 timestamp to pass back as `cursor` for the next page. Null when exhausted. */
  nextCursor: string | null;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Derive a normalised {@link TimelineSeverity} from an audit result.
 */
export function severityFromAuditResult(
  result: 'success' | 'failure' | 'dry-run',
): TimelineSeverity {
  if (result === 'failure') return 'error';
  return 'info';
}

/**
 * Derive a normalised {@link TimelineSeverity} from a Sentry issue level string.
 */
export function severityFromSentryLevel(level: string): TimelineSeverity {
  switch (level) {
    case 'fatal':
    case 'critical':
      return 'critical';
    case 'error':
      return 'error';
    case 'warning':
    case 'warn':
      return 'warning';
    default:
      return 'info';
  }
}

/**
 * Type guard for {@link TimelineSeverity}.
 */
export function isTimelineSeverity(value: unknown): value is TimelineSeverity {
  return (
    value === 'info' ||
    value === 'warning' ||
    value === 'error' ||
    value === 'critical'
  );
}

/**
 * Type guard for {@link TimelineEventKind}.
 */
export function isTimelineEventKind(value: unknown): value is TimelineEventKind {
  return value === 'audit' || value === 'incident' || value === 'deploy';
}
