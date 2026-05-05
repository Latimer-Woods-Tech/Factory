/**
 * Audit log persistence.
 *
 * Phase B: writes to `studio_audit_log` via `@latimer-woods-tech/neon`.
 * Phase A only logged to console; the DB write is best-effort and never
 * blocks the response (failures are logged but swallowed).
 *
 * @see apps/admin-studio/migrations/0001_studio_audit_log.sql
 */

import { createDb, sql, type FactoryDb, type HyperdriveBinding } from '@latimer-woods-tech/neon';
import {
  type AuditEntry,
  type AuditRow,
  type AuditQuery,
  type AuditPage,
  toAuditEntry,
} from '@latimer-woods-tech/studio-core';

/**
 * Single Drizzle client instance per Worker invocation.
 *
 * Hyperdrive pools at the edge, so re-using the binding across the
 * request lifecycle is cheap. We memoise on the binding identity.
 */
const dbCache = new WeakMap<HyperdriveBinding, FactoryDb>();

function getDb(hyperdrive: HyperdriveBinding): FactoryDb {
  let db = dbCache.get(hyperdrive);
  if (!db) {
    db = createDb(hyperdrive);
    dbCache.set(hyperdrive, db);
  }
  return db;
}

/**
 * Insert one audit entry. Best-effort — errors are logged but not thrown.
 *
 * @returns true on success, false if the insert failed (caller can decide
 *          whether to add a fallback log).
 */
export async function insertAuditEntry(
  hyperdrive: HyperdriveBinding,
  entry: AuditEntry,
): Promise<boolean> {
  try {
    const db = getDb(hyperdrive);
    await db.execute(sql`
      INSERT INTO studio_audit_log (
        id, occurred_at, user_id, user_email, user_role, session_id, env,
        action, resource, resource_id, reversibility, payload, result,
        result_detail, ip_address, user_agent, request_id
      ) VALUES (
        ${entry.id},
        ${entry.occurredAt},
        ${entry.userId},
        ${entry.userEmail},
        ${entry.userRole},
        ${entry.sessionId},
        ${entry.env},
        ${entry.action},
        ${entry.resource ?? null},
        ${entry.resourceId ?? null},
        ${entry.reversibility},
        ${JSON.stringify(entry.payload ?? {})}::jsonb,
        ${entry.result},
        ${entry.resultDetail ? JSON.stringify(entry.resultDetail) : null}::jsonb,
        ${entry.ipAddress ?? null},
        ${entry.userAgent ?? null},
        ${entry.requestId}
      )
    `);
    return true;
  } catch (err) {
    console.error('[audit-store] insert failed:', (err as Error).message);
    return false;
  }
}

/**
 * Query audit entries with cursor-based pagination.
 *
 * Cursor is the `occurred_at` of the last row of the previous page;
 * results are returned newest-first so the next page is `< cursor`.
 */
export async function queryAuditEntries(
  hyperdrive: HyperdriveBinding,
  query: AuditQuery,
): Promise<AuditPage<AuditEntry>> {
  const db = getDb(hyperdrive);
  const limit = clamp(query.limit ?? 50, 1, 200);

  // Build WHERE incrementally to keep parameters bound and avoid string concat.
  // We use an empty `sql` chunk pattern + `AND` chaining via array joins.
  const conds: ReturnType<typeof sql>[] = [];
  if (query.env) conds.push(sql`env = ${query.env}`);
  if (query.userId) conds.push(sql`user_id = ${query.userId}`);
  if (query.action) conds.push(sql`action ILIKE ${'%' + query.action + '%'}`);
  if (query.actor) {
    // Match by exact userId or case-insensitive email substring.
    conds.push(
      sql`(user_id = ${query.actor} OR user_email ILIKE ${'%' + query.actor + '%'})`,
    );
  }
  if (query.requestId) conds.push(sql`request_id = ${query.requestId}`);
  if (query.sessionId) conds.push(sql`session_id = ${query.sessionId}`);
  if (query.from) conds.push(sql`occurred_at >= ${query.from}`);
  if (query.to) conds.push(sql`occurred_at < ${query.to}`);
  if (query.cursor) conds.push(sql`occurred_at < ${query.cursor}`);

  // Stitch into a WHERE clause; if no filters, omit WHERE entirely.
  const whereChunks: ReturnType<typeof sql>[] = [];
  for (let i = 0; i < conds.length; i += 1) {
    if (i === 0) whereChunks.push(sql`WHERE`);
    else whereChunks.push(sql`AND`);
    whereChunks.push(conds[i]!);
  }
  const whereSql = sql.join(whereChunks, sql` `);

  const result = await db.execute(sql`
    SELECT
      id, occurred_at, user_id, user_email, user_role, session_id, env,
      action, resource, resource_id, reversibility, payload, result,
      result_detail, ip_address, user_agent, request_id
    FROM studio_audit_log
    ${whereSql}
    ORDER BY occurred_at DESC
    LIMIT ${limit + 1}
  `);

  // drizzle/neon-http returns an array directly for SELECT.
  const rows = (result as unknown as AuditRow[]) ?? [];
  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const last = page[page.length - 1];

  return {
    rows: page.map(toAuditEntry),
    nextCursor: hasMore && last ? last.occurred_at : null,
  };
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}
