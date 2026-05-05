/**
 * GET /audit — paginated, filterable audit log viewer.
 *
 * Authz:
 *   - viewer/editor: own user only (server enforces userId override)
 *   - admin/owner:   any user
 *
 * Filters:
 *   - env, userId, action (substring), from, to (ISO 8601)
 *   - limit (1..200, default 50), cursor (ISO timestamp)
 *
 * @see packages/studio-core/src/health.ts for AuditQuery / AuditPage shape
 */
import { Hono } from 'hono';
import type { AppEnv } from '../types.js';
import { isEnvironment, type AuditQuery } from '@latimer-woods-tech/studio-core';
import { queryAuditEntries } from '../lib/audit-store.js';
import { isTableMissing } from '../lib/schema-readiness.js';

const audit = new Hono<AppEnv>();

audit.get('/', async (c) => {
  const ctx = c.var.envContext;
  const url = new URL(c.req.url);
  const params = url.searchParams;

  const requestedEnv = params.get('env');
  const env = isEnvironment(requestedEnv) ? requestedEnv : undefined;

  // Cross-env reads are allowed (they're read-only) but default to the
  // session env so operators can't accidentally page through prod from staging.
  const query: AuditQuery = {
    env: env ?? ctx.env,
    action: params.get('action') ?? undefined,
    from: params.get('from') ?? undefined,
    to: params.get('to') ?? undefined,
    cursor: params.get('cursor') ?? undefined,
  };

  const limitRaw = params.get('limit');
  if (limitRaw) {
    const n = Number.parseInt(limitRaw, 10);
    if (Number.isFinite(n)) query.limit = n;
  }

  // Authz: non-admins can only see their own activity.
  const userIdParam = params.get('userId');
  if (ctx.role === 'admin' || ctx.role === 'owner') {
    if (userIdParam) query.userId = userIdParam;
  } else {
    query.userId = ctx.userId;
  }

  try {
    const page = await queryAuditEntries(c.env.DB, query);
    return c.json(page);
  } catch (err) {
    if (isTableMissing(err, 'studio_audit_log')) {
      return c.json(
        {
          error: 'schema not ready',
          detail: 'studio_audit_log table does not exist — run database migrations',
        },
        503,
      );
    }
    return c.json(
      {
        error: 'Audit query failed',
        detail: c.env.STUDIO_ENV !== 'production' ? (err as Error).message : undefined,
      },
      500,
    );
  }
});

export default audit;
