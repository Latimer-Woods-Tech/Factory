/**
 * POST /v1/artifacts — two-step ingest for run output artifacts.
 *
 * Auth: Bearer scoped JWT where aud starts with 'artifacts-'.
 */
import { Hono } from 'hono';
import { z } from 'zod';
import { AuthError, BadRequestError } from '@latimer-woods-tech/errors';
import { ARTIFACT_TYPES, PRODUCER_TYPES } from '@latimer-woods-tech/neon';
import { verifyScopedToken } from '../jwt.js';
import { createIngestDb, twoStepIngest } from '../ingest-db.js';
import type { Env } from '../env.js';

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

    const claims = await verifyScopedToken(token, signingKey);
    if (!claims.aud.startsWith('artifacts-')) {
      throw new AuthError("Token audience must start with 'artifacts-'");
    }

    const db = createIngestDb(c.env.DB as { connectionString: string });

    const eventId = await twoStepIngest(
      db,
      {
        sourceSystem: 'video-pipeline',
        sourceEventType: `artifact.${body.artifact_type}`,
        payload: body as Record<string, unknown>,
        ingestActor: `jwt-aud:${claims.aud}`,
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

    return c.json({ ok: true, event_id: eventId }, 201);
  });

  return router;
}
