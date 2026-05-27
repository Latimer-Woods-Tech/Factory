/**
 * POST /v1/artifacts — two-step ingest for run output artifacts.
 *
 * Auth (either):
 *   - the dedicated WEBHOOK_FANOUT_INGEST_KEY service credential (same key
 *     used by the gates route), which is implicitly scoped to artifact
 *     ingestion from trusted GitHub Actions workflows; or
 *   - a Bearer scoped JWT where aud starts with 'artifacts-'. Workflow runs
 *     (e.g. render-video.yml) obtain such a token by exchanging their GitHub
 *     OIDC token at `/v1/auth/token` with `{ "audience": "artifacts-video" }`.
 * Idempotency: if `source_event_id` is provided and an event with that
 * (source_system, source_event_id) already exists, returns the existing
 * event_id without re-inserting — so a retried workflow step (same run id /
 * R2 key) dedupes server-side. The DB-level partial unique index makes this
 * race-safe even under concurrent writers.
 */
import { Hono } from 'hono';
import { z } from 'zod';
import { AuthError, BadRequestError } from '@latimer-woods-tech/errors';
import { ARTIFACT_TYPES, PRODUCER_TYPES } from '@latimer-woods-tech/neon';
import { verifyScopedToken } from '../jwt.js';
import { createIngestDb, twoStepIngest } from '../ingest-db.js';
import type { Env } from '../env.js';

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

const ArtifactBodySchema = z.object({
  artifact_type: z.string().refine(
    (v): v is (typeof ARTIFACT_TYPES)[number] => (ARTIFACT_TYPES as readonly string[]).includes(v),
    { message: `artifact_type must be one of: ${ARTIFACT_TYPES.join(', ')}` },
  ),
  producer_type: z.string().refine(
    (v): v is (typeof PRODUCER_TYPES)[number] => (PRODUCER_TYPES as readonly string[]).includes(v),
    { message: `producer_type must be one of: ${PRODUCER_TYPES.join(', ')}` },
  ),
  producer_ref: z.string().min(1),
  /** Caller-supplied source system; defaults to 'github-actions' for service-key auth, 'video-pipeline' for JWT. */
  source_system: z.string().optional(),
  source_event_id: z.string().optional(),
  subject_app: z.string().optional(),
  subject_repo: z.string().optional(),
  subject_ref: z.string().optional(),
  uri: z.string().regex(/^[a-z0-9+.-]+:/, 'uri must start with a URI scheme'),
  checksum: z.string().optional(),
  size_bytes: z.number().int().positive().optional(),
  mime_type: z.string().optional(),
  duration_ms: z.number().int().positive().optional(),
  metadata: z.record(z.unknown()).optional(),
  expires_at: z.string().datetime().optional(),
  observed_at: z.string().datetime(),
});

export function createArtifactsRouter(): Hono<{ Bindings: Env }> {
  const router = new Hono<{ Bindings: Env }>();

  router.post('/', async (c) => {
    const signingKey = c.env.JWT_SIGNING_KEY;
    if (!signingKey) throw new Error('JWT_SIGNING_KEY is not configured');

    const auth = c.req.header('authorization');
    if (!auth?.startsWith('Bearer ')) throw new AuthError('Missing bearer token');
    const token = auth.slice(7).trim();

    const rawBody = await c.req.json<unknown>().catch(() => null);
    const parsed = ArtifactBodySchema.safeParse(rawBody);
    if (!parsed.success) {
      throw new BadRequestError(parsed.error.issues[0]?.message ?? 'Invalid request body');
    }
    const body = parsed.data;

    // Auth: service key (GitHub Actions workflows) OR scoped JWT (video pipeline).
    const serviceKey = c.env.WEBHOOK_FANOUT_INGEST_KEY;
    let ingestActor: string;
    let defaultSourceSystem: string;
    if (serviceKey && timingSafeEqual(token, serviceKey)) {
      ingestActor = 'service:github-actions';
      defaultSourceSystem = 'github-actions';
    } else {
      const claims = await verifyScopedToken(token, signingKey);
      if (!claims.aud.startsWith('artifacts-')) {
        throw new AuthError("Token audience must start with 'artifacts-'");
      }
      ingestActor = `jwt-aud:${claims.aud}`;
      defaultSourceSystem = 'video-pipeline';
    }
    const sourceSystem = body.source_system ?? defaultSourceSystem;

    const db = createIngestDb(c.env.DB as { connectionString: string });

    // Idempotency fast path: if source_event_id already exists, return it. Lets
    // a retried render workflow step POST the same artifact without creating
    // duplicates. The DB unique index + ON CONFLICT in twoStepIngest is the
    // real backstop under concurrency.
    if (body.source_event_id) {
      const existing = await db.findEventBySourceId(sourceSystem, body.source_event_id);
      if (existing) return c.json({ ok: true, event_id: existing.id });
    }

    const { eventId, created } = await twoStepIngest(
      db,
      {
        sourceSystem,
        sourceEventType: `artifact.${body.artifact_type}`,
        sourceEventId: body.source_event_id,
        payload: body as Record<string, unknown>,
        ingestActor,
        derivationStatus: 'pending',
        derivationTargets: ['factory_artifacts'],
        observedAt: new Date(body.observed_at),
      },
      async (_eventId) => {
        await db.insertArtifact({
          artifactType: body.artifact_type,
          producerType: body.producer_type,
          producerRef: body.producer_ref,
          subjectApp: body.subject_app,
          subjectRepo: body.subject_repo,
          subjectRef: body.subject_ref,
          uri: body.uri,
          checksum: body.checksum,
          sizeBytes: body.size_bytes,
          mimeType: body.mime_type,
          durationMs: body.duration_ms,
          metadata: body.metadata ?? {},
          expiresAt: body.expires_at ? new Date(body.expires_at) : undefined,
        });
      },
    );

    // 201 for a freshly inserted event; 200 when the DB unique index detected a
    // duplicate source_event_id under concurrency (derivation was skipped).
    return c.json({ ok: true, event_id: eventId }, created ? 201 : 200);
  });

  return router;
}
