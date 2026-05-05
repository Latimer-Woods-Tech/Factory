/**
 * Phase B observability types.
 *
 * Shared between admin-studio API (which produces these) and admin-studio-ui
 * (which renders them). Keep this file pure data — no runtime dependencies.
 *
 * @see docs/admin-studio/00-MASTER-PLAN.md — Phase B
 */

import type { Environment } from './env-context.js';

/**
 * Status returned by an app's `/health` endpoint after fan-out.
 *
 * `'unknown'` is used when the call timed out or returned non-JSON;
 * the operator should treat it as a soft alert, not as a confirmed outage.
 */
export type AppHealthStatus = 'healthy' | 'degraded' | 'down' | 'unknown';

/**
 * Single app health record. The Studio API fans out to every app's
 * `/health` endpoint, normalises the response, and returns one of these
 * per app per environment.
 */
export interface AppHealth {
  /** Stable id matching `docs/service-registry.yml`, e.g. `"prime-self"`. */
  id: string;
  /** Human label for UI rendering. */
  label: string;
  env: Environment;
  url: string;
  status: AppHealthStatus;
  /** HTTP status code returned by the health endpoint, 0 if request failed. */
  httpStatus: number;
  /** Round-trip latency in ms (best-effort, includes DNS/TLS/Workers cold start). */
  latencyMs: number;
  /** ISO 8601 timestamp this health snapshot was taken. */
  checkedAt: string;
  /** Echoed `env` field from the app, when present. Used to catch config drift. */
  reportedEnv?: string;
  /** Echoed service name from the app, when present. */
  reportedService?: string;
  /** Free-form error string when status is 'down'/'unknown'. */
  error?: string;
}

/**
 * Deploy version row for the cross-app deploy dashboard.
 *
 * `versionId` is the Cloudflare Workers deployment id (UUID-ish).
 * `tag` mirrors what's set during deploy (typically the git sha).
 */
export interface DeployVersion {
  workerName: string;
  env: Environment;
  versionId: string;
  tag?: string;
  deployedAt: string;
  source?: string;
}

/**
 * Query shape for `GET /audit`. All fields optional.
 * Pagination is cursor-based on `occurred_at` to keep results stable.
 */
export interface AuditQuery {
  /** Restrict to a single env (defaults to caller's env). */
  env?: Environment;
  userId?: string;
  /** Substring match against `action`. Case-insensitive. */
  action?: string;
  /**
   * Filter by actor: exact match on user_id OR case-insensitive substring
   * match on user_email. Useful for operators tracking a specific account.
   */
  actor?: string;
  /** Exact match on the `request_id` column (X-Request-Id header). */
  requestId?: string;
  /** Exact match on the `session_id` column. */
  sessionId?: string;
  /** Lower bound (inclusive), ISO 8601. */
  from?: string;
  /** Upper bound (exclusive), ISO 8601. */
  to?: string;
  /** Page size, 1..200. Default 50. */
  limit?: number;
  /** Cursor: ISO 8601 timestamp of the last row from the previous page. */
  cursor?: string;
}

/**
 * Pagination envelope returned by `GET /audit`.
 */
export interface AuditPage<T> {
  rows: T[];
  /** ISO 8601 timestamp to pass back as `cursor` for the next page. */
  nextCursor: string | null;
}
