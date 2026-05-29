/**
 * POST /v1/runs/mirror — supervisor push-on-write for terminal run states (P1.9).
 *
 * Auth: dedicated `SUPERVISOR_PUSH_KEY` service credential (timing-safe
 * comparison), honoured only on this route. When the key is not configured the
 * endpoint returns 503 so the supervisor's best-effort push fails loudly rather
 * than silently accepting unauthenticated writes.
 *
 * Idempotent: `ON CONFLICT (id) DO UPDATE` keeps the latest status/prUrl/
 * finishedAt while refreshing `mirrored_at`.
 */
import { Hono } from 'hono';
import { z } from 'zod';
import { AuthError, BadRequestError } from '@latimer-woods-tech/errors';
import { RUN_STATUSES } from '@latimer-woods-tech/neon';
import { createRunsMirrorDb } from '../runs-db.js';
import type { Env } from '../env.js';

const TERMINAL_STATUSES = ['passed', 'failed_execution', 'failed_verification'] as const;

const RunMirrorBodySchema = z.object({
  id: z.string().uuid('id must be a UUID'),
  template_id: z.string().min(1),
  template_version: z.number().int().positive(),
  description: z.string(),
  source: z.string().min(1),
  status: z.string().refine(
    (v): v is (typeof RUN_STATUSES)[number] => (RUN_STATUSES as readonly string[]).includes(v),
    { message: `status must be one of: ${RUN_STATUSES.join(', ')}` },
  ),
  dry_run: z.boolean(),
  pr_url: z.string().url().optional().nullable(),
  started_at: z.string().datetime(),
  finished_at: z.string().datetime().optional().nullable(),
});

/** Constant-time string comparison — guards against timing side-channels. */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

export function createRunsMirrorRouter(): Hono<{ Bindings: Env }> {
  const router = new Hono<{ Bindings: Env }>();

  router.post('/', async (c) => {
    const pushKey = c.env.SUPERVISOR_PUSH_KEY;
    if (!pushKey) {
      return c.json({ error: 'run mirror endpoint not configured' }, 503);
    }

    const auth = c.req.header('authorization');
    if (!auth?.startsWith('Bearer ')) throw new AuthError('Missing bearer token');
    const token = auth.slice(7).trim();
    if (!timingSafeEqual(token, pushKey)) throw new AuthError('Invalid service credential');

    const rawBody = await c.req.json<unknown>().catch(() => null);
    const parsed = RunMirrorBodySchema.safeParse(rawBody);
    if (!parsed.success) {
      throw new BadRequestError(parsed.error.issues[0]?.message ?? 'Invalid request body');
    }
    const body = parsed.data;

    const isTerminal = (TERMINAL_STATUSES as readonly string[]).includes(body.status);
    if (!isTerminal) {
      throw new BadRequestError(
        `Only terminal statuses may be pushed: ${TERMINAL_STATUSES.join(', ')}`,
      );
    }

    const db = createRunsMirrorDb(c.env.DB as { connectionString: string });
    await db.upsertRun({
      id: body.id,
      templateId: body.template_id,
      templateVersion: body.template_version,
      description: body.description,
      source: body.source,
      status: body.status,
      dryRun: body.dry_run,
      prUrl: body.pr_url ?? undefined,
      startedAt: new Date(body.started_at),
      finishedAt: body.finished_at ? new Date(body.finished_at) : undefined,
    });

    return c.json({ ok: true, run_id: body.id }, 200);
  });

  return router;
}
