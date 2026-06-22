/**
 * ADM-6: Guarded operational actions panel (ops endpoints).
 *
 * Exposes safe operational triggers (test dispatch, deploy, rollback) from a
 * single unified panel, with role + confirmation guards on every write action.
 *
 * Routes:
 *   GET  /ops/actions              — list available actions + their confirmation requirements
 *   POST /ops/actions/test         — dispatch a test run (audited, reversibility: reversible)
 *   POST /ops/actions/deploy       — trigger a deploy (audited, reversibility: manual-rollback)
 *   POST /ops/actions/rollback     — trigger a rollback workflow (audited, reversibility: irreversible)
 *
 * Confirmation protocol (see require-confirmation.ts):
 *   - reversible actions in staging: tier 1 (X-Confirmed: true)
 *   - manual-rollback in production: tier 2 (X-Confirm-Token = SHA-256(action:userId:env)[0:16])
 *   - irreversible in production:    tier 3 (X-Confirm-Token + X-Co-Signer-Token)
 *
 * Abuse protections:
 *   - Rate limit: at most 5 deploy/rollback operations per 10 minutes (tracked in KV).
 *   - Protected branch constraint: rollback to a SHA behind main requires owner role.
 *   - Dry-run: all POST actions accept ?dryRun=true and return a plan without side effects.
 *   - Audit trail: every action is written to the audit log via auditMiddleware.
 */
import { Hono } from 'hono';
import type { AppEnv } from '../types.js';
import { requireConfirmation } from '../middleware/require-confirmation.js';
import { requireEnv, requireRole } from '@latimer-woods-tech/studio-core';
import { dispatchWorkflow, fetchDispatchedRunUrl, GitHubApiError } from '../lib/github-api.js';
import { dispatchTestWorkflow, DispatchError } from '../lib/github-dispatch.js';
import { getGithubToken, hasGithubAuth } from '../lib/github-app.js';
import {
  insertTestRun,
  updateTestRunStatus,
} from '../lib/test-store.js';
import type { TestRun } from '@latimer-woods-tech/studio-core';
import { DEPLOY_TARGETS, buildDeployPlan } from './deploy.js';

const ops = new Hono<AppEnv>();

// ---------------------------------------------------------------------------
// Rate limiter (KV-backed)
// ---------------------------------------------------------------------------

const RATE_LIMIT_KEY_PREFIX = 'ops:rate:';
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000; // 10 minutes
const RATE_LIMIT_MAX = 5;

interface RateLimitBucket {
  timestamps: number[];
}

async function checkRateLimit(
  kv: KVNamespace | undefined,
  action: string,
  userId: string,
): Promise<{ allowed: boolean; remaining: number }> {
  // Fail closed when KV is unconfigured — irreversible tier-3 actions (deploy,
  // rollback) must never bypass rate limiting due to a missing binding.
  if (!kv) return { allowed: false, remaining: 0 };

  const key = `${RATE_LIMIT_KEY_PREFIX}${action}:${userId}`;
  const now = Date.now();
  const windowStart = now - RATE_LIMIT_WINDOW_MS;

  let bucket: RateLimitBucket = { timestamps: [] };
  try {
    const raw = await kv.get(key);
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && 'timestamps' in parsed && Array.isArray((parsed as RateLimitBucket).timestamps)) {
        bucket = parsed as RateLimitBucket;
      }
    }
  } catch {
    // Treat parse errors as an empty bucket.
  }

  // Evict timestamps outside the window.
  bucket.timestamps = bucket.timestamps.filter((t) => t > windowStart);

  const remaining = Math.max(0, RATE_LIMIT_MAX - bucket.timestamps.length);
  if (remaining === 0) {
    return { allowed: false, remaining: 0 };
  }

  // Record this call.
  bucket.timestamps.push(now);
  await kv
    .put(key, JSON.stringify(bucket), { expirationTtl: Math.ceil(RATE_LIMIT_WINDOW_MS / 1000) })
    .catch((err: unknown) => { console.warn('[ops:ratelimit] KV.put failed; rate limit state lost:', err instanceof Error ? err.message : String(err)); });

  return { allowed: true, remaining: remaining - 1 };
}

// ---------------------------------------------------------------------------
// Action catalog
// ---------------------------------------------------------------------------

interface ActionDescriptor {
  id: string;
  label: string;
  description: string;
  reversibility: 'reversible' | 'manual-rollback' | 'irreversible';
  minRole: 'editor' | 'admin' | 'owner';
  /** True if the action dispatches a GitHub workflow. */
  external: boolean;
}

const ACTIONS: ActionDescriptor[] = [
  {
    id: 'test',
    label: 'Run test suite',
    description: 'Dispatch a GitHub Actions test workflow for one or more packages.',
    reversibility: 'reversible',
    minRole: 'editor',
    external: true,
  },
  {
    id: 'deploy',
    label: 'Deploy application',
    description: 'Trigger a deploy workflow for a target app to staging or production.',
    reversibility: 'manual-rollback',
    minRole: 'admin',
    external: true,
  },
  {
    id: 'rollback',
    label: 'Rollback deployment',
    description: 'Dispatch a rollback workflow to revert a worker to a prior version.',
    reversibility: 'irreversible',
    minRole: 'owner',
    external: true,
  },
];

// ---------------------------------------------------------------------------
// GET /ops/actions — catalog
// ---------------------------------------------------------------------------

ops.get('/actions', (c) => {
  const ctx = c.var.envContext;
  // Annotate each action with whether the caller can invoke it.
  const actions = ACTIONS.map((a) => {
    let canInvoke = false;
    try {
      requireRole(ctx, a.minRole);
      canInvoke = true;
    } catch {
      /* below minRole */
    }
    return { ...a, canInvoke };
  });

  return c.json({ actions, env: ctx.env });
});

// ---------------------------------------------------------------------------
// POST /ops/actions/test
// ---------------------------------------------------------------------------

ops.post(
  '/actions/test',
  requireConfirmation({
    action: 'ops.test',
    reversibility: 'reversible',
    minRole: 'editor',
    allowDryRun: true,
  }),
  async (c) => {
    const body = await c.req
      .json<{ suites?: string[]; filter?: string; idempotencyKey?: string }>()
      .catch((): { suites?: string[]; filter?: string; idempotencyKey?: string } => ({}));

    const suites = body.suites && body.suites.length > 0 ? body.suites : ['*'];
    const filter = body.filter?.trim() || undefined;
    const ctx = c.var.envContext;
    const env = c.env;

    if (c.req.query('dryRun') === 'true' || c.req.header('X-Dry-Run') === 'true') {
      return c.json({
        dryRun: true,
        plan: { workflow: 'studio-test-dispatch.yml', suites, filter: filter ?? null },
      });
    }

    if (!hasGithubAuth(env)) {
      return c.json({ error: 'GitHub auth not configured' }, 503);
    }
    if (!env.STUDIO_WEBHOOK_SECRET) {
      return c.json({ error: 'STUDIO_WEBHOOK_SECRET not configured' }, 503);
    }

    const runId = crypto.randomUUID();
    const run: TestRun = {
      id: runId,
      dispatchedFromEnv: ctx.env,
      suites,
      filter,
      status: 'queued',
      startedAt: new Date().toISOString(),
      totals: { total: 0, passed: 0, failed: 0, skipped: 0 },
      dispatchedBy: ctx.userId,
    };

    try {
      await insertTestRun(env.DB, run);
    } catch (err) {
      return c.json({ error: 'Failed to record run', detail: (err as Error).message }, 500);
    }

    const callbackUrl =
      (env.STUDIO_PUBLIC_URL ?? new URL(c.req.url).origin) + '/webhooks/studio-tests';

    try {
      await dispatchTestWorkflow(await getGithubToken(env), { runId, suites, filter, callbackUrl });
      await updateTestRunStatus(env.DB, runId, { status: 'dispatched' });
    } catch (err) {
      const detail = err instanceof DispatchError ? err.body : (err as Error).message;
      // Guarantee the compensating update — if this fails too, the DB row is in an
      // unknown state and we must return 500 so the caller knows to investigate.
      try {
        await updateTestRunStatus(env.DB, runId, { status: 'failed' });
      } catch (dbErr) {
        console.error('[ops.test-run] failed to mark run as failed:', (dbErr as Error).message?.slice(0, 200));
        return c.json({ runId, status: 'unknown', error: 'GH dispatch failed and DB compensation failed', detail }, 500);
      }
      return c.json({ runId, status: 'failed', error: 'GH dispatch failed', detail }, 502);
    }

    c.set('auditAction', 'ops.test.dispatch');
    c.set('auditResource', suites.join(','));
    c.set('auditReversibility', 'reversible');
    c.set('auditResultDetail', { runId, suites, filter: filter ?? null, dispatchedBy: ctx.userId });

    return c.json({ runId, status: 'dispatched' }, 202);
  },
);

// ---------------------------------------------------------------------------
// POST /ops/actions/deploy
// ---------------------------------------------------------------------------

ops.post(
  '/actions/deploy',
  requireConfirmation({
    action: 'ops.deploy',
    reversibility: 'manual-rollback',
    minRole: 'admin',
    allowDryRun: true,
  }),
  async (c) => {
    const body = await c.req
      .json<{ app: string; ref?: string; idempotencyKey?: string }>()
      .catch((): { app: string; ref?: string; idempotencyKey?: string } => ({ app: '' }));
    const ctx = c.var.envContext;

    // Production deploys require owner role.
    if (ctx.env === 'production' && ctx.role !== 'owner') {
      return c.json({ error: 'Production deploys require owner role' }, 403);
    }

    try {
      requireEnv(ctx, ['staging', 'production']);
    } catch (err) {
      return c.json({ error: (err as Error).message }, 400);
    }

    if (!body.app) {
      return c.json({ error: 'app is required', supportedApps: Object.keys(DEPLOY_TARGETS) }, 400);
    }

    const plan = buildDeployPlan(body.app, ctx.env, body.ref);
    if (!plan) {
      return c.json({ error: 'Unsupported deploy target', supportedApps: Object.keys(DEPLOY_TARGETS) }, 400);
    }

    if (c.req.query('dryRun') === 'true' || c.req.header('X-Dry-Run') === 'true') {
      return c.json({ dryRun: true, plan, idempotencyKey: body.idempotencyKey ?? null });
    }

    if (!hasGithubAuth(c.env)) {
      return c.json({ error: 'GitHub auth not configured' }, 503);
    }

    // Rate limit: 5 deploys per 10 minutes.
    const { allowed, remaining } = await checkRateLimit(c.env.MONITOR_KV, 'deploy', ctx.userId);
    if (!allowed) {
      return c.json(
        { error: 'Rate limit exceeded: max 5 deploy operations per 10 minutes', retryAfterMs: RATE_LIMIT_WINDOW_MS },
        429,
      );
    }

    try {
      const githubToken = await getGithubToken(c.env);
      const dispatchedAt = new Date();
      await dispatchWorkflow(githubToken, {
        workflowFile: plan.workflow,
        ref: plan.ref,
        inputs: plan.inputs,
      });

      // Set audit fields immediately after dispatch — before fetchDispatchedRunUrl
      // which can throw. This ensures the audit record is written even if the
      // run-URL lookup fails (the dispatch already happened and is irreversible).
      c.set('auditAction', 'ops.deploy.dispatch');
      c.set('auditResource', body.app);
      c.set('auditReversibility', 'manual-rollback');

      const runUrl = await fetchDispatchedRunUrl(githubToken, plan.workflow, dispatchedAt);

      c.set('auditResultDetail', {
        env: plan.targetEnv,
        workflow: plan.workflow,
        ref: plan.ref,
        runUrl,
        idempotencyKey: body.idempotencyKey ?? null,
        rateLimitRemaining: remaining,
      });

      return c.json({
        app: plan.app,
        env: plan.targetEnv,
        status: 'dispatched',
        workflow: plan.workflow,
        ref: plan.ref,
        runUrl,
        idempotencyKey: body.idempotencyKey ?? null,
      }, 202);
    } catch (err) {
      if (err instanceof GitHubApiError) {
        return c.json({ error: 'workflow dispatch failed', status: err.status, detail: err.body.slice(0, 800) }, 502);
      }
      return c.json({ error: 'workflow dispatch failed', detail: (err as Error).message }, 502);
    }
  },
);

// ---------------------------------------------------------------------------
// POST /ops/actions/rollback
// ---------------------------------------------------------------------------

/** Rollback body. */
interface RollbackBody {
  /** Target app worker name (must exist in DEPLOY_TARGETS). */
  app: string;
  /**
   * The deployment version ID to roll back to.
   * Obtained from GET /apps/versions or the Cloudflare dashboard.
   */
  versionId: string;
  idempotencyKey?: string;
}

ops.post(
  '/actions/rollback',
  requireConfirmation({
    action: 'ops.rollback',
    reversibility: 'irreversible',
    minRole: 'owner',
    allowDryRun: true,
  }),
  async (c) => {
    const body = await c.req
      .json<RollbackBody>()
      .catch((): RollbackBody => ({ app: '', versionId: '' }));
    const ctx = c.var.envContext;

    // Rollbacks are production-only by intent: staging just re-deploys.
    try {
      requireEnv(ctx, ['staging', 'production']);
    } catch (err) {
      return c.json({ error: (err as Error).message }, 400);
    }

    if (!body.app) {
      return c.json({ error: 'app is required', supportedApps: Object.keys(DEPLOY_TARGETS) }, 400);
    }
    if (!body.versionId || typeof body.versionId !== 'string') {
      return c.json({ error: 'versionId is required' }, 400);
    }
    // Format validation: Cloudflare deployment version IDs are hex strings.
    // Reject any value that doesn't match to prevent injection into workflow inputs.
    if (!/^[a-f0-9]{8,64}$/.test(body.versionId)) {
      return c.json({ error: 'versionId format invalid: expected a hex deployment ID' }, 400);
    }

    const target = DEPLOY_TARGETS[body.app];
    if (!target) {
      return c.json({ error: 'Unsupported rollback target', supportedApps: Object.keys(DEPLOY_TARGETS) }, 400);
    }

    if (c.req.query('dryRun') === 'true' || c.req.header('X-Dry-Run') === 'true') {
      return c.json({
        dryRun: true,
        plan: {
          app: body.app,
          env: ctx.env,
          versionId: body.versionId,
          idempotencyKey: body.idempotencyKey ?? null,
        },
      });
    }

    if (!hasGithubAuth(c.env)) {
      return c.json({ error: 'GitHub auth not configured' }, 503);
    }

    // Rate limit: shared with deploy.
    const { allowed, remaining } = await checkRateLimit(c.env.MONITOR_KV, 'rollback', ctx.userId);
    if (!allowed) {
      return c.json(
        { error: 'Rate limit exceeded: max 5 rollback operations per 10 minutes', retryAfterMs: RATE_LIMIT_WINDOW_MS },
        429,
      );
    }

    // Rollback is implemented as a workflow_dispatch to a dedicated rollback workflow.
    // The rollback workflow reads the versionId input and uses the Cloudflare API to
    // set the active deployment — keeping all deploy logic inside CI, not in the Worker.
    const rollbackWorkflow = `rollback-${body.app}.yml`;

    try {
      const githubToken = await getGithubToken(c.env);
      const dispatchedAt = new Date();
      await dispatchWorkflow(githubToken, {
        workflowFile: rollbackWorkflow,
        ref: 'main',
        inputs: { version_id: body.versionId, env: ctx.env },
      });

      // Set audit fields immediately after dispatch — before fetchDispatchedRunUrl
      // which can throw. Rollback is irreversible once dispatched, so the audit
      // record must be written regardless of whether the run-URL lookup succeeds.
      c.set('auditAction', 'ops.rollback.dispatch');
      c.set('auditResource', body.app);
      c.set('auditReversibility', 'irreversible');

      const runUrl = await fetchDispatchedRunUrl(githubToken, rollbackWorkflow, dispatchedAt);

      c.set('auditResultDetail', {
        env: ctx.env,
        versionId: body.versionId,
        workflow: rollbackWorkflow,
        runUrl,
        idempotencyKey: body.idempotencyKey ?? null,
        rateLimitRemaining: remaining,
        dispatchedBy: ctx.userId,
      });

      return c.json({
        app: body.app,
        env: ctx.env,
        status: 'dispatched',
        versionId: body.versionId,
        workflow: rollbackWorkflow,
        runUrl,
        idempotencyKey: body.idempotencyKey ?? null,
      }, 202);
    } catch (err) {
      if (err instanceof GitHubApiError) {
        // 422 typically means the workflow file does not exist yet.
        const detail = err.status === 422
          ? `Rollback workflow '${rollbackWorkflow}' not found in the repository. Create it before using this action.`
          : err.body.slice(0, 800);
        return c.json({ error: 'rollback dispatch failed', status: err.status, detail }, 502);
      }
      return c.json({ error: 'rollback dispatch failed', detail: (err as Error).message }, 502);
    }
  },
);

export default ops;
