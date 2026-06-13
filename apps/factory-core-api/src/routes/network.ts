/**
 * Factory Network Layer router — /v1/network/*
 *
 * Four endpoints:
 *   POST /v1/network/links   — register a verified cross-app identity link
 *   POST /v1/network/events  — fire-and-forget cross-app event
 *   GET  /v1/network/resolve — resolve a local user_id to linked identities
 *   GET  /v1/network/events  — query events for a user (factory-internal analytics)
 *
 * All endpoints require M2M auth (Authorization: Bearer <FACTORY_NETWORK_TOKEN>).
 * Token is validated once in middleware and the resolved app_id is stored in
 * c.var.networkAppId for use by individual handlers.
 *
 * Uses NETWORK_DB (factory-network Neon project) — separate from the CI/CD DB.
 */
import { Hono } from 'hono';
import { createDb, sql } from '@latimer-woods-tech/neon';
import { BadRequestError } from '@latimer-woods-tech/errors';
import { createLogger, generateRequestId } from '@latimer-woods-tech/logger';
import type { Env } from '../env.js';
import { validateAppToken } from '../lib/app-auth.js';

const SERVICE = 'factory-core-api/network';

function resolveEnv(value: string | undefined) {
  return value === 'production' ? 'production' : value === 'staging' ? 'staging' : 'development';
}

export function createNetworkRouter() {
  const router = new Hono<{ Bindings: Env }>();

  // M2M auth middleware — validates token once, stores app_id in context.
  router.use('*', async (c, next) => {
    const appId = await validateAppToken(c.req.header('authorization'), c.env.NETWORK_DB);
    c.set('networkAppId', appId);
    await next();
  });

  /**
   * POST /v1/network/links
   * Body: { source_user_id: string, target_app: string, target_user_id: string }
   *
   * The calling app's id comes from the validated token (app_id in factory_app_keys).
   * Upserts the link — re-linking the same source user to a different target is allowed.
   */
  router.post('/links', async (c) => {
    const requestId = c.get('requestId') ?? generateRequestId();
    const log = createLogger({ workerId: SERVICE, requestId, environment: resolveEnv(c.env.ENVIRONMENT) });
    const appId = c.get('networkAppId');

    const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null;
    const sourceUserId = typeof body?.source_user_id === 'string' ? body.source_user_id : '';
    const targetApp = typeof body?.target_app === 'string' ? body.target_app : '';
    const targetUserId = typeof body?.target_user_id === 'string' ? body.target_user_id : '';

    if (!sourceUserId || !targetApp || !targetUserId) {
      throw new BadRequestError('source_user_id, target_app, and target_user_id are required');
    }

    const db = createDb(c.env.NETWORK_DB);
    await db.execute(sql`
      INSERT INTO factory_network_links (source_app, source_user_id, target_app, target_user_id, verified_at)
      VALUES (${appId}, ${sourceUserId}, ${targetApp}, ${targetUserId}, now())
      ON CONFLICT (source_app, source_user_id, target_app)
      DO UPDATE SET target_user_id = EXCLUDED.target_user_id, verified_at = now()
    `);

    log.info('network.link_registered', { sourceApp: appId, targetApp, sourceUserId });
    return c.json({ ok: true }, 201);
  });

  /**
   * POST /v1/network/events
   * Body: { user_id_local: string, event_name: string, properties?: object, schema_version?: number }
   *
   * Fire-and-forget. The caller wraps with ctx.waitUntil to avoid blocking
   * the user response. Returns 202.
   */
  router.post('/events', async (c) => {
    const requestId = c.get('requestId') ?? generateRequestId();
    const log = createLogger({ workerId: SERVICE, requestId, environment: resolveEnv(c.env.ENVIRONMENT) });
    const appId = c.get('networkAppId');

    const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null;
    const userIdLocal = typeof body?.user_id_local === 'string' ? body.user_id_local : '';
    const eventName = typeof body?.event_name === 'string' ? body.event_name : '';
    const properties = (body?.properties && typeof body.properties === 'object' && !Array.isArray(body.properties))
      ? body.properties
      : {};
    const schemaVersion = typeof body?.schema_version === 'number' ? body.schema_version : 1;

    if (!userIdLocal || !eventName) {
      throw new BadRequestError('user_id_local and event_name are required');
    }

    const db = createDb(c.env.NETWORK_DB);
    await db.execute(sql`
      INSERT INTO factory_network_events (app_id, user_id_local, event_name, properties, schema_version)
      VALUES (${appId}, ${userIdLocal}, ${eventName}, ${JSON.stringify(properties)}::jsonb, ${schemaVersion})
    `);

    log.info('network.event_recorded', { appId, eventName, userIdLocal });
    return c.json({ ok: true }, 202);
  });

  /**
   * GET /v1/network/resolve?app_id=selfprime&user_id=<id>
   *
   * Returns all known cross-app links for a given (app, user) pair.
   * Used by analytics and the platform brain synergize scanner.
   * app_id defaults to the calling app if omitted.
   */
  router.get('/resolve', async (c) => {
    const callerAppId = c.get('networkAppId');
    const queryApp = c.req.query('app_id') ?? callerAppId;
    const userId = c.req.query('user_id') ?? '';

    if (!userId) {
      throw new BadRequestError('user_id query param is required');
    }

    const db = createDb(c.env.NETWORK_DB);
    const links = await db.execute<{ target_app: string; target_user_id: string; verified_at: string }>(sql`
      SELECT target_app, target_user_id, verified_at
      FROM factory_network_links
      WHERE source_app = ${queryApp} AND source_user_id = ${userId}
      ORDER BY verified_at DESC
    `);

    return c.json({ source_app: queryApp, source_user_id: userId, links: links.rows });
  });

  /**
   * GET /v1/network/events?user_id=<id>&limit=50&before=<iso>
   *
   * Returns recent events for a user (in the calling app's namespace).
   * Factory-internal: used by network-sense.mjs to populate graph.network.
   */
  router.get('/events', async (c) => {
    const appId = c.get('networkAppId');
    const userId = c.req.query('user_id') ?? '';
    const limit = Math.min(parseInt(c.req.query('limit') ?? '50', 10) || 50, 200);
    const before = c.req.query('before') ?? new Date().toISOString();

    if (!userId) {
      throw new BadRequestError('user_id query param is required');
    }

    const db = createDb(c.env.NETWORK_DB);
    const events = await db.execute<{
      id: string; event_name: string; properties: unknown; schema_version: number; occurred_at: string;
    }>(sql`
      SELECT id, event_name, properties, schema_version, occurred_at
      FROM factory_network_events
      WHERE app_id = ${appId}
        AND user_id_local = ${userId}
        AND occurred_at < ${before}::timestamptz
      ORDER BY occurred_at DESC
      LIMIT ${limit}
    `);

    return c.json({ app_id: appId, user_id: userId, events: events.rows });
  });

  /**
   * POST /v1/network/signals
   * Body: { user_id_local: string, signal: string, properties?: object }
   *
   * Fire-and-forget cross-app signal relay. Looks up all linked accounts for
   * the caller's (app_id, user_id_local) pair and delivers the signal to each
   * target app's /api/internal/signal endpoint using FACTORY_OUTBOUND_SIGNAL_KEY.
   * Returns 202 immediately — delivery is ctx.waitUntil fire-and-forget.
   */
  router.post('/signals', async (c) => {
    const requestId = c.get('requestId') ?? generateRequestId();
    const log = createLogger({ workerId: SERVICE, requestId, environment: resolveEnv(c.env.ENVIRONMENT) });
    const sourceAppId = c.get('networkAppId');

    const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null;
    const userIdLocal = typeof body?.user_id_local === 'string' ? body.user_id_local : '';
    const signal = typeof body?.signal === 'string' ? body.signal : '';
    const properties = (body?.properties && typeof body.properties === 'object' && !Array.isArray(body.properties))
      ? body.properties
      : {};

    if (!userIdLocal || !signal) {
      throw new BadRequestError('user_id_local and signal are required');
    }

    const signalKey = c.env.FACTORY_OUTBOUND_SIGNAL_KEY;
    if (!signalKey) {
      log.warn('network.signal_key_missing', { sourceAppId });
      return c.json({ ok: true, delivered: 0 }, 202);
    }

    const db = createDb(c.env.NETWORK_DB);
    const links = await db.execute<{ target_app: string; target_user_id: string; worker_url: string | null }>(sql`
      SELECT fnl.target_app, fnl.target_user_id, fak.worker_url
      FROM factory_network_links fnl
      JOIN factory_app_keys fak ON fak.app_id = fnl.target_app AND fak.revoked_at IS NULL
      WHERE fnl.source_app = ${sourceAppId}
        AND fnl.source_user_id = ${userIdLocal}
        AND fak.worker_url IS NOT NULL
    `);

    const deliveries = links.rows.map(({ target_app, target_user_id, worker_url }) =>
      fetch(`${worker_url}/api/internal/signal`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Factory-Signal-Key': signalKey,
        },
        signal: AbortSignal.timeout(8_000),
        body: JSON.stringify({
          signal,
          source_app: sourceAppId,
          target_user_id,
          properties,
        }),
      }).catch((err) => {
        log.warn('network.signal_delivery_failed', { target_app, signal, error: String(err) });
      }),
    );

    c.executionCtx.waitUntil(Promise.all(deliveries));
    log.info('network.signals_dispatched', { sourceAppId, signal, targets: links.rows.length });
    return c.json({ ok: true, delivered: links.rows.length }, 202);
  });

  return router;
}
