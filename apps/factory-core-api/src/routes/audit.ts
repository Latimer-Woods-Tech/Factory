/**
 * POST /v1/audit — append-only operator/automation action log ingest (P2.13g).
 *
 * Auth: Bearer AUDIT_INGEST_KEY service credential (same timing-safe pattern
 * as gates/artifacts routes).
 *
 * Writes a row to factory_audit_log. Audit entries are first-class records —
 * they do not go through the factory_events_ingest two-step pattern.
 */
import { Hono } from 'hono';
import { z } from 'zod';
import { AuthError, BadRequestError } from '@latimer-woods-tech/errors';
import { createDb, factoryAuditLog, AUDIT_ACTOR_TYPES, AUDIT_RESULTS } from '@latimer-woods-tech/neon';
import type { Env } from '../env.js';

const AuditBodySchema = z.object({
  actor: z.string().min(1),
  actor_type: z.enum(AUDIT_ACTOR_TYPES).default('human'),
  action: z.string().min(1),
  resource: z.string().min(1),
  resource_id: z.string().optional(),
  request_id: z.string().optional(),
  environment: z.string().default('production'),
  result: z.enum(AUDIT_RESULTS).default('success'),
  detail: z.record(z.unknown()).default({}),
  evidence_url: z.string().url().optional(),
  acted_at: z.string().datetime(),
});

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

export function createAuditRouter(): Hono<{ Bindings: Env }> {
  const router = new Hono<{ Bindings: Env }>();

  router.post('/', async (c) => {
    const auditKey = c.env.AUDIT_INGEST_KEY;
    if (!auditKey) throw new AuthError('AUDIT_INGEST_KEY not configured');

    const auth = c.req.header('authorization');
    if (!auth?.startsWith('Bearer ')) throw new AuthError('Missing bearer token');
    const token = auth.slice(7).trim();
    if (!timingSafeEqual(token, auditKey)) throw new AuthError('Invalid audit ingest key');

    const rawBody = await c.req.json<unknown>().catch(() => null);
    const parsed = AuditBodySchema.safeParse(rawBody);
    if (!parsed.success) {
      throw new BadRequestError(parsed.error.issues[0]?.message ?? 'Invalid request body');
    }

    const body = parsed.data;
    const db = createDb(c.env.DB);

    const rows = await db
      .insert(factoryAuditLog)
      .values({
        actor: body.actor,
        actorType: body.actor_type,
        action: body.action,
        resource: body.resource,
        resourceId: body.resource_id,
        requestId: body.request_id,
        environment: body.environment,
        result: body.result,
        detail: body.detail,
        evidenceUrl: body.evidence_url,
        actedAt: new Date(body.acted_at),
      })
      .returning({ id: factoryAuditLog.id });

    return c.json({ id: rows[0]?.id }, 201);
  });

  return router;
}
