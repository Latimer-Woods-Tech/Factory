/**
 * Audit log entry shape. Every mutating Studio action must produce one of these.
 */

import type { Environment, Role, ReversibilityTier } from './env-context.js';

/** Structured audit log entry — every mutating Studio action must produce one. */
export interface AuditEntry {
  id: string;
  occurredAt: string; // ISO 8601
  userId: string;
  userEmail: string;
  userRole: Role;
  sessionId: string;
  env: Environment;
  /** Stable action identifier or HTTP method+path */
  action: string;
  /** Resource type, e.g. 'wordis-bond', 'user', 'content' */
  resource?: string;
  /** Resource id, e.g. user UUID */
  resourceId?: string;
  reversibility: ReversibilityTier;
  /** Request payload with secrets stripped */
  payload: Record<string, unknown>;
  result: 'success' | 'failure' | 'dry-run';
  resultDetail?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
  /** Correlation id matching X-Request-Id header */
  requestId: string;
}

/**
 * Strip well-known secret keys from an object before logging.
 */
const SECRET_KEYS = new Set([
  'password',
  'token',
  'jwt',
  'secret',
  'apiKey',
  'api_key',
  'authorization',
  'cookie',
  'session',
  'privateKey',
  'private_key',
]);

/** Strips well-known secret key names from an object before it reaches any log sink. */
export function redactSecrets<T extends Record<string, unknown>>(obj: T): T {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    const lower = key.toLowerCase();
    if (SECRET_KEYS.has(key) || [...SECRET_KEYS].some((s) => lower.includes(s.toLowerCase()))) {
      result[key] = '[REDACTED]';
    } else if (value && typeof value === 'object' && !Array.isArray(value)) {
      result[key] = redactSecrets(value as Record<string, unknown>);
    } else {
      result[key] = value;
    }
  }
  return result as T;
}

/**
 * Database row shape for `studio_audit_log` (snake_case columns).
 *
 * Use {@link toAuditEntry} / {@link fromAuditEntry} to convert between this
 * shape and the camelCase {@link AuditEntry} used in API and UI.
 */
export interface AuditRow {
  id: string;
  occurred_at: string;
  user_id: string;
  user_email: string;
  user_role: Role;
  session_id: string;
  env: Environment;
  action: string;
  resource: string | null;
  resource_id: string | null;
  reversibility: ReversibilityTier;
  payload: Record<string, unknown>;
  result: AuditEntry['result'];
  result_detail: Record<string, unknown> | null;
  ip_address: string | null;
  user_agent: string | null;
  request_id: string;
}

/**
 * Convert a DB row into the API-facing camelCase shape.
 */
export function toAuditEntry(row: AuditRow): AuditEntry {
  return {
    id: row.id,
    occurredAt: row.occurred_at,
    userId: row.user_id,
    userEmail: row.user_email,
    userRole: row.user_role,
    sessionId: row.session_id,
    env: row.env,
    action: row.action,
    resource: row.resource ?? undefined,
    resourceId: row.resource_id ?? undefined,
    reversibility: row.reversibility,
    payload: row.payload,
    result: row.result,
    resultDetail: row.result_detail ?? undefined,
    ipAddress: row.ip_address ?? undefined,
    userAgent: row.user_agent ?? undefined,
    requestId: row.request_id,
  };
}

/**
 * Convert an API-facing entry into DB row column order.
 *
 * Returned as a positional array so callers can splat into a parameterised
 * insert without coupling to ORM internals:
 *
 * ```sql
 * INSERT INTO studio_audit_log (id, occurred_at, user_id, ...)
 * VALUES ($1, $2, $3, ...)
 * ```
 */
export function fromAuditEntry(entry: AuditEntry): readonly unknown[] {
  return [
    entry.id,
    entry.occurredAt,
    entry.userId,
    entry.userEmail,
    entry.userRole,
    entry.sessionId,
    entry.env,
    entry.action,
    entry.resource ?? null,
    entry.resourceId ?? null,
    entry.reversibility,
    JSON.stringify(entry.payload ?? {}),
    entry.result,
    entry.resultDetail ? JSON.stringify(entry.resultDetail) : null,
    entry.ipAddress ?? null,
    entry.userAgent ?? null,
    entry.requestId,
  ];
}
