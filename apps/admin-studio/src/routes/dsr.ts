/**
 * DSR (Data Subject Request) operator surface.
 *
 * Routes:
 *   GET  /dsr          — list DSR requests; supports ?userId, ?appId, ?status, ?limit
 *   GET  /dsr/:id      — get a single DSR by request ID
 *
 * Auth:  admin / owner only (enforced here; envContextMiddleware verifies JWT).
 * Gap:   G-15 — DSR E2E path for HumanDesign Practitioner tier.
 */
import { Hono } from 'hono';
import type { AppEnv } from '../types.js';
import { createDb } from '@latimer-woods-tech/neon';
import {
  listDSRRequests,
  getDSRStatus,
  type DsrStatus,
} from '@latimer-woods-tech/compliance';

const VALID_STATUSES: DsrStatus[] = ['pending', 'in_progress', 'fulfilled', 'rejected'];

const dsr = new Hono<AppEnv>();

/**
 * GET /dsr
 *
 * Lists DSR requests visible to the authenticated operator.
 *
 * Query params:
 *   userId  — filter to a specific data subject
 *   appId   — filter to a specific application (e.g. "humandesign")
 *   status  — filter by lifecycle status
 *   limit   — max rows to return (default 50, max 200)
 */
dsr.get('/', async (c) => {
  const ctx = c.var.envContext;

  // Only admin / owner may browse DSRs.
  if (ctx.role !== 'admin' && ctx.role !== 'owner') {
    return c.json({ error: 'Forbidden — admin or owner role required' }, 403);
  }

  const params = new URL(c.req.url).searchParams;

  const userId = params.get('userId') ?? undefined;
  const appId = params.get('appId') ?? undefined;
  const rawStatus = params.get('status');
  const rawLimit = params.get('limit');

  let status: DsrStatus | undefined;
  if (rawStatus) {
    if (!VALID_STATUSES.includes(rawStatus as DsrStatus)) {
      return c.json(
        { error: `Invalid status — must be one of: ${VALID_STATUSES.join(', ')}` },
        400,
      );
    }
    status = rawStatus as DsrStatus;
  }

  let limit = 50;
  if (rawLimit) {
    const n = Number.parseInt(rawLimit, 10);
    if (Number.isFinite(n) && n > 0) {
      limit = Math.min(n, 200);
    }
  }

  try {
    const db = createDb(c.env.DB);
    const requests = await listDSRRequests(db, { userId, appId, status, limit });
    return c.json({ requests, total: requests.length });
  } catch (err) {
    return c.json(
      {
        error: 'Failed to list DSR requests',
        detail:
          c.env.STUDIO_ENV !== 'production'
            ? err instanceof Error ? err.message : String(err)
            : undefined,
      },
      500,
    );
  }
});

/**
 * GET /dsr/:id
 *
 * Returns the current status and metadata of a single DSR.
 */
dsr.get('/:id', async (c) => {
  const ctx = c.var.envContext;

  if (ctx.role !== 'admin' && ctx.role !== 'owner') {
    return c.json({ error: 'Forbidden — admin or owner role required' }, 403);
  }

  const requestId = c.req.param('id');
  if (!requestId) {
    return c.json({ error: 'Missing request ID' }, 400);
  }

  try {
    const db = createDb(c.env.DB);
    const request = await getDSRStatus(db, requestId);
    return c.json(request);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('not found')) {
      return c.json({ error: `DSR ${requestId} not found` }, 404);
    }
    return c.json(
      {
        error: 'Failed to fetch DSR',
        detail: c.env.STUDIO_ENV !== 'production' ? msg : undefined,
      },
      500,
    );
  }
});

export default dsr;
