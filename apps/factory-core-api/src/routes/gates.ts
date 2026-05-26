/**
 * POST /v1/gates — two-step ingest for gate state transitions.
 *
 * Auth (either):
 *   - the dedicated WEBHOOK_FANOUT_INGEST_KEY service credential, which is
 *     accepted only on this route and is therefore implicitly scoped to gate
 *     ingestion; or
 *   - a Bearer scoped JWT where aud === 'gates-{gate_type}'.
 * Idempotency: if source_event_id is provided and an event with that ID
 * already exists, returns the existing event_id without re-inserting.
 */
import { Hono } from 'hono';
import { z } from 'zod';
import { AuthError, BadRequestError } from '@latimer-woods-tech/errors';
import {
  GATE_TYPES,
  GATE_SOURCE_SYSTEMS,
  SUBJECT_TYPES,
  GATE_STATES,
} from '@latimer-woods-tech/neon';
import { verifyScopedToken } from '../jwt.js';
import { createIngestDb, twoStepIngest } from '../ingest-db.js';
import type { Env } from '../env.js';

const GateBodySchema = z.object({
  gate_type: z.string().refine(
    (v): v is (typeof GATE_TYPES)[number] => (GATE_TYPES as readonly string[]).includes(v),
    { message: `gate_type must be one of: ${GATE_TYPES.join(', ')}` },
  ),
  source_system: z.string().refine(
    (v): v is (typeof GATE_SOURCE_SYSTEMS)[number] =>
      (GATE_SOURCE_SYSTEMS as readonly string[]).includes(v),
    { message: `source_system must be one of: ${GATE_SOURCE_SYSTEMS.join(', ')}` },
  ),
  source_ref: z.string().min(1),
  source_event_id: z.string().optional(),
  subject_type: z.string().refine(
    (v): v is (typeof SUBJECT_TYPES)[number] => (SUBJECT_TYPES as readonly string[]).includes(v),
    { message: `subject_type must be one of: ${SUBJECT_TYPES.join(', ')}` },
  ),
  subject_repo: z.string().optional(),
  subject_ref: z.string().min(1),
  state: z.string().refine(
    (v): v is (typeof GATE_STATES)[number] => (GATE_STATES as readonly string[]).includes(v),
    { message: `state must be one of: ${GATE_STATES.join(', ')}` },
  ),
  evidence_url: z.string().url().optional(),
  evidence_summary: z.record(z.unknown()).optional(),
  observed_at: z.string().datetime(),
});

/**
 * Constant-time string comparison for the service credential, guarding against
 * timing side-channels. Length is allowed to leak (standard for HMAC/secret
 * compare); content comparison is timing-independent.
 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

export function createGatesRouter(): Hono<{ Bindings: Env }> {
  const router = new Hono<{ Bindings: Env }>();

  router.post('/', async (c) => {
    const signingKey = c.env.JWT_SIGNING_KEY;
    if (!signingKey) throw new Error('JWT_SIGNING_KEY is not configured');

    const auth = c.req.header('authorization');
    if (!auth?.startsWith('Bearer ')) throw new AuthError('Missing bearer token');
    const token = auth.slice(7).trim();

    const rawBody = await c.req.json<unknown>().catch(() => null);
    const parsed = GateBodySchema.safeParse(rawBody);
    if (!parsed.success) {
      throw new BadRequestError(parsed.error.issues[0]?.message ?? 'Invalid request body');
    }
    const body = parsed.data;

    // Auth: the dedicated service key (accepted only here, so implicitly scoped
    // to gate ingestion) OR a scoped JWT whose aud matches the gate_type.
    const serviceKey = c.env.WEBHOOK_FANOUT_INGEST_KEY;
    let ingestActor: string;
    if (serviceKey && timingSafeEqual(token, serviceKey)) {
      ingestActor = 'service:webhook-fanout';
    } else {
      const claims = await verifyScopedToken(token, signingKey);
      const expectedAud = `gates-${body.gate_type}`;
      if (claims.aud !== expectedAud) {
        throw new AuthError(`Token audience must be '${expectedAud}'`);
      }
      ingestActor = `jwt-aud:${claims.aud}`;
    }

    const db = createIngestDb(c.env.DB as { connectionString: string });

    // Idempotency: if source_event_id already exists, return it.
    if (body.source_event_id) {
      const existing = await db.findEventBySourceId(body.source_system, body.source_event_id);
      if (existing) return c.json({ ok: true, event_id: existing.id });
    }

    const eventId = await twoStepIngest(
      db,
      {
        sourceSystem: body.source_system,
        sourceEventType: `gate.${body.gate_type}`,
        sourceEventId: body.source_event_id,
        payload: body as Record<string, unknown>,
        ingestActor,
        derivationStatus: 'pending',
        derivationTargets: ['factory_gates'],
        observedAt: new Date(body.observed_at),
      },
      async (eventId) => {
        await db.insertGate({
          ingestEventId: eventId,
          gateType: body.gate_type,
          sourceSystem: body.source_system,
          sourceRef: body.source_ref,
          subjectType: body.subject_type,
          subjectRepo: body.subject_repo,
          subjectRef: body.subject_ref,
          state: body.state,
          evidenceUrl: body.evidence_url,
          evidenceSummary: body.evidence_summary ?? {},
          observedAt: new Date(body.observed_at),
        });
      },
    );

    return c.json({ ok: true, event_id: eventId }, 201);
  });

  return router;
}
