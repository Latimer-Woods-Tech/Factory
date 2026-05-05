/**
 * Schema readiness helpers.
 *
 * Centralises detection of missing-table errors so catalog and audit
 * routes can surface a descriptive 503 instead of a generic 500 when a
 * migration has not yet been applied to the target database.
 */

/**
 * Returns true when a database error indicates the named relation does not
 * exist (PostgreSQL SQLSTATE 42P01 — undefined_table).
 *
 * Detection strategy (in priority order):
 *  1. Exact SQLSTATE code `42P01` on the error object (Neon serverless client
 *     and the raw `pg` driver both expose this as `err.code`).
 *  2. Fallback: the PostgreSQL canonical message pattern
 *     `relation "<tableName>" does not exist` in the error message.
 */
export function isTableMissing(err: unknown, tableName: string): boolean {
  if (!(err instanceof Error)) return false;
  if ((err as { code?: string }).code === '42P01') return true;
  // Fallback: match the canonical PostgreSQL message pattern.
  const lower = err.message.toLowerCase();
  const needle = `relation "${tableName}" does not exist`;
  return lower.includes(needle.toLowerCase());
}
