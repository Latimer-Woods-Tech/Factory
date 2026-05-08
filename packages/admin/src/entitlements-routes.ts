/**
 * Entitlements admin routes for the Factory control plane.
 *
 * Mounted at `/admin/entitlements` and gated by capability middleware.
 * Provides grant/revoke/audit operations for tier and feature access control.
 */
import { Hono } from 'hono';
import { sql } from '@latimer-woods-tech/neon';
import type { FactoryDb } from '@latimer-woods-tech/neon';
import { NotFoundError, ValidationError, InternalError, ErrorCodes } from '@latimer-woods-tech/errors';
import type { Entitlement } from '@latimer-woods-tech/entitlements';

/** Bindings required by the entitlements router. */
export interface EntitlementsRouterEnv {
  DB: FactoryDb;
  appScope: string; // e.g. "selfprime", "videoking", "xico-city"
}

/** Request body for grant operation. */
export interface GrantRequest {
  entitlementId: string;
  expiresAt?: string; // ISO-8601, null = never expires
}

/** Request body for revoke operation. */
export interface RevokeRequest {
  entitlementId: string;
}

/** Audit log entry returned by GET /audit. */
export interface AuditLogEntry {
  id: string;
  userId: string;
  entitlementId: string;
  appScope: string;
  action: 'grant' | 'revoke' | 'expire';
  operatorId: string | null;
  expiresAt: string | null;
  occurredAt: string;
}

/**
 * Creates a Hono router for entitlements operations.
 * Intended to be mounted by apps at `/admin/entitlements`.
 */
export function createEntitlementsRouter(env: EntitlementsRouterEnv): Hono<{ Bindings: EntitlementsRouterEnv }> {
  const { DB, appScope } = env;
  const router = new Hono<{ Bindings: EntitlementsRouterEnv }>();

  /**
   * GET /users/:userId
   * Fetch all entitlements for a user in this app scope.
   */
  router.get('/users/:userId', async (c) => {
    const userId = c.req.param('userId');
    interface EntitlementRow extends Record<string, unknown> {
      id: string;
      label: string;
      enabled: boolean;
      expires_at: string | null;
    }
    const rows = await DB.execute<EntitlementRow>(
      sql`SELECT e.id, e.label, e.enabled, ue.expires_at
          FROM entitlements e
          JOIN user_entitlements ue ON e.id = ue.entitlement_id
          WHERE ue.user_id = ${userId}
            AND ue.app_scope = ${appScope}
          ORDER BY ue.granted_at DESC`,
    );
    const entitlements: Entitlement[] = rows.rows.map((r) => ({
      id: r.id,
      label: r.label,
      enabled: r.enabled,
      expiresAt: r.expires_at,
    }));
    return c.json({ userId, appScope, entitlements });
  });

  /**
   * POST /users/:userId/grant
   * Grant an entitlement to a user with optional expiry.
   */
  router.post('/users/:userId/grant', async (c) => {
    const userId = c.req.param('userId');
    const body = await c.req.json();

    if (!body.entitlementId) throw new ValidationError('entitlementId is required');

    interface EntitlementCheckRow extends Record<string, unknown> { id: string }
    const entCheck = await DB.execute<EntitlementCheckRow>(
      sql`SELECT id FROM entitlements WHERE id = ${body.entitlementId}`,
    );
    if (entCheck.rows.length === 0) {
      throw new NotFoundError(`Entitlement ${body.entitlementId} not found`);
    }

    const userEntId = crypto.randomUUID();
    const auditId = crypto.randomUUID();
    const expiresAt = body.expiresAt ?? null;

    try {
      await DB.execute(
        sql`INSERT INTO user_entitlements (id, user_id, entitlement_id, app_scope, expires_at)
            VALUES (${userEntId}, ${userId}, ${body.entitlementId}, ${appScope}, ${expiresAt})
            ON CONFLICT (user_id, entitlement_id, app_scope) DO UPDATE
            SET expires_at = EXCLUDED.expires_at, granted_at = NOW()`,
      );

      await DB.execute(
        sql`INSERT INTO entitlement_audit_log (id, user_id, entitlement_id, app_scope, action, expires_at)
            VALUES (${auditId}, ${userId}, ${body.entitlementId}, ${appScope}, 'grant', ${expiresAt})`,
      );
    } catch (err) {
      throw new InternalError('Failed to grant entitlement', {
        code: ErrorCodes.DB_QUERY_FAILED,
        cause: (err as Error).message,
      });
    }

    return c.json({ success: true, userId, entitlementId: body.entitlementId, expiresAt });
  });

  /**
   * POST /users/:userId/revoke
   * Revoke an entitlement from a user.
   */
  router.post('/users/:userId/revoke', async (c) => {
    const userId = c.req.param('userId');
    const body = await c.req.json();

    if (!body.entitlementId) throw new ValidationError('entitlementId is required');

    try {
      const result = await DB.execute(
        sql`DELETE FROM user_entitlements
            WHERE user_id = ${userId}
              AND entitlement_id = ${body.entitlementId}
              AND app_scope = ${appScope}`,
      );

      if ((result.rowCount ?? 0) === 0) {
        throw new NotFoundError(`User ${userId} does not have entitlement ${body.entitlementId}`);
      }

      await DB.execute(
        sql`INSERT INTO entitlement_audit_log (id, user_id, entitlement_id, app_scope, action)
            VALUES (${crypto.randomUUID()}, ${userId}, ${body.entitlementId}, ${appScope}, 'revoke')`,
      );
    } catch (err) {
      if (err instanceof NotFoundError) throw err;
      throw new InternalError('Failed to revoke entitlement', {
        code: ErrorCodes.DB_QUERY_FAILED,
        cause: (err as Error).message,
      });
    }

    return c.json({ success: true, userId, entitlementId: body.entitlementId });
  });

  /**
   * GET /audit
   * List entitlement audit log entries with pagination.
   */
  router.get('/audit', async (c) => {
    const page = Math.max(1, Number(c.req.query('page') ?? '1'));
    const limit = Math.min(100, Math.max(1, Number(c.req.query('limit') ?? '20')));
    const offset = (page - 1) * limit;

    interface AuditRow extends Record<string, unknown> {
      id: string;
      user_id: string;
      entitlement_id: string;
      app_scope: string;
      action: string;
      operator_id: string | null;
      expires_at: string | null;
      occurred_at: string;
    }

    const rows = await DB.execute<AuditRow>(
      sql`SELECT id, user_id, entitlement_id, app_scope, action, operator_id, expires_at, occurred_at
          FROM entitlement_audit_log
          WHERE app_scope = ${appScope}
          ORDER BY occurred_at DESC
          LIMIT ${limit} OFFSET ${offset}`,
    );

    const entries: AuditLogEntry[] = rows.rows.map((r) => ({
      id: r.id,
      userId: r.user_id,
      entitlementId: r.entitlement_id,
      appScope: r.app_scope,
      action: r.action as 'grant' | 'revoke' | 'expire',
      operatorId: r.operator_id,
      expiresAt: r.expires_at,
      occurredAt: r.occurred_at,
    }));

    return c.json({ page, limit, appScope, entries });
  });

  return router;
}
