import { Hono } from 'hono';
import type { AppEnv } from '../types.js';
import { requireConfirmation } from '../middleware/require-confirmation.js';
import { requireEnv } from '@latimer-woods-tech/studio-core';
import { GitHubApiError, dispatchWorkflow, fetchDispatchedRunUrl } from '../lib/github-api.js';
import { getGithubToken, hasGithubAuth } from '../lib/github-app.js';

const deploy = new Hono<AppEnv>();

export interface DeployPlan {
  app: string;
  targetEnv: 'staging' | 'production';
  ref: string;
  workflow: string;
  inputs?: Record<string, string>;
}

interface DeployTargetConfig {
  workflow: string;
  supportsEnvInput: boolean;
  rollbackWorkflow?: string;
}

export const DEPLOY_TARGETS: Readonly<Record<string, DeployTargetConfig>> = {
  'admin-studio': { workflow: 'deploy-admin-studio.yml', supportsEnvInput: true, rollbackWorkflow: 'rollback-admin-studio.yml' },
  'admin-studio-ui': { workflow: 'deploy-admin-studio-ui.yml', supportsEnvInput: true, rollbackWorkflow: 'rollback-admin-studio-ui.yml' },
  'schedule-worker': { workflow: 'deploy-schedule-worker.yml', supportsEnvInput: false },
  'video-cron': { workflow: 'deploy-video-cron.yml', supportsEnvInput: false },
  'synthetic-monitor': { workflow: 'deploy-synthetic-monitor.yml', supportsEnvInput: false },
} as const;

function isValidTargetEnv(env: string): env is 'staging' | 'production' {
  return env === 'staging' || env === 'production';
}

export function buildDeployPlan(app: string, env: string, ref?: string): DeployPlan | null {
  if (!isValidTargetEnv(env)) return null;
  const target = DEPLOY_TARGETS[app];
  if (!target) return null;

  const plan: DeployPlan = {
    app,
    targetEnv: env,
    ref: ref ?? 'main',
    workflow: target.workflow,
  };

  if (target.supportsEnvInput) {
    plan.inputs = { env };
  }
  return plan;
}

/**
 * GET /deploys — recent deploy history (Phase D wires real Cloudflare API).
 */
deploy.get('/', (c) => c.json({ deploys: [] }));

/**
 * POST /deploys — trigger a deploy. Tiered confirmation:
 *   - staging: reversible (tier 1: click)
 *   - production: manual-rollback (tier 2: type-to-confirm)
 */
deploy.post(
  '/',
  requireConfirmation({
    action: 'deploy.trigger',
    reversibility: 'manual-rollback',
    minRole: 'admin',
    allowDryRun: true,
  }),
  async (c) => {
    const body = await c.req.json<{ app: string; ref?: string; idempotencyKey?: string }>();
    const ctx = c.var.envContext;

    // Production deploys require owner role (override the default 'admin' minRole).
    if (ctx.env === 'production' && ctx.role !== 'owner') {
      return c.json({ error: 'Production deploys require owner role' }, 403);
    }

    // Local can never deploy anywhere — local is a development sandbox.
    try {
      requireEnv(ctx, ['staging', 'production']);
    } catch (err) {
      return c.json({ error: (err as Error).message }, 400);
    }

    const plan = buildDeployPlan(body.app, ctx.env, body.ref);
    if (!plan) {
      return c.json(
        {
          error: 'Unsupported deploy target',
          supportedApps: Object.keys(DEPLOY_TARGETS),
        },
        400,
      );
    }

    if (c.req.query('dryRun') === 'true') {
      return c.json({
        dryRun: true,
        plan,
        idempotencyKey: body.idempotencyKey ?? null,
      });
    }

    if (!hasGithubAuth(c.env)) {
      return c.json({ error: 'GitHub auth not configured' }, 503);
    }

    try {
      const githubToken = await getGithubToken(c.env);
      const dispatchedAt = new Date();
      await dispatchWorkflow(githubToken, {
        workflowFile: plan.workflow,
        ref: plan.ref,
        inputs: plan.inputs,
      });

      // Poll once for the real run URL. GitHub queues runs asynchronously so
      // this may return null if the run hasn't appeared within ~3 s.
      const runUrl = await fetchDispatchedRunUrl(githubToken, plan.workflow, dispatchedAt);

      c.set('auditAction', 'deploy.dispatch');
      c.set('auditResource', body.app);
      c.set('auditResultDetail', {
        env: plan.targetEnv,
        workflow: plan.workflow,
        ref: plan.ref,
        runUrl,
        idempotencyKey: body.idempotencyKey ?? null,
      });

      return c.json(
        {
          app: plan.app,
          env: plan.targetEnv,
          status: 'dispatched',
          workflow: plan.workflow,
          ref: plan.ref,
          runUrl,
          idempotencyKey: body.idempotencyKey ?? null,
        },
        202,
      );
    } catch (err) {
      if (err instanceof GitHubApiError) {
        return c.json(
          {
            error: 'workflow dispatch failed',
            status: err.status,
            detail: err.body.slice(0, 800),
          },
          502,
        );
      }

      return c.json(
        { error: 'workflow dispatch failed', detail: (err as Error).message },
        502,
      );
    }
  },
);

/**
 * POST /deploys/rollback — trigger a Cloudflare Workers rollback to the
 * previous stable deployment. This is an irreversible action in production
 * (tier 3 confirmation required) and manual-rollback in staging (tier 2).
 *
 * Body: { app: string; versionId?: string; reason?: string }
 *
 * Rollback mechanics:
 *   1. If the target has a dedicated rollback workflow, dispatch it via GH Actions.
 *   2. Otherwise, call the Cloudflare Workers Deployments API to promote the
 *      previous deployment, passing versionId as `rollback_by` override.
 *
 * ADM-6: Guarded operational actions — every rollback is audited, requires
 * confirmation, and is scoped to admin/owner roles.
 */
deploy.post(
  '/rollback',
  requireConfirmation({
    action: 'deploy.rollback',
    reversibility: 'irreversible',
    minRole: 'admin',
    allowDryRun: true,
  }),
  async (c) => {
    const body = await c.req.json<{ app: string; versionId?: string; reason?: string; idempotencyKey?: string }>();
    const ctx = c.var.envContext;

    // Production rollbacks require owner role. The confirmation middleware
    // allows 'admin' so that staging rollbacks can be initiated by admins,
    // but production is intentionally restricted to 'owner' for extra safety.
    if (ctx.env === 'production' && ctx.role !== 'owner') {
      return c.json({ error: 'Production rollbacks require owner role' }, 403);
    }

    try {
      requireEnv(ctx, ['staging', 'production']);
    } catch (err) {
      return c.json({ error: (err as Error).message }, 400);
    }

    const target = DEPLOY_TARGETS[body.app];
    if (!target) {
      return c.json(
        {
          error: 'Unsupported rollback target',
          supportedApps: Object.keys(DEPLOY_TARGETS),
        },
        400,
      );
    }

    if (c.req.query('dryRun') === 'true') {
      return c.json({
        dryRun: true,
        app: body.app,
        env: ctx.env,
        versionId: body.versionId ?? 'previous',
        reason: body.reason ?? null,
        mechanism: target.rollbackWorkflow ? 'github-workflow' : 'cloudflare-api',
      });
    }

    // Path 1: rollback workflow exists → dispatch via GitHub Actions.
    if (target.rollbackWorkflow) {
      if (!hasGithubAuth(c.env)) {
        return c.json({ error: 'GitHub auth not configured' }, 503);
      }

      const inputs: Record<string, string> = { env: ctx.env };
      if (body.versionId) inputs.version_id = body.versionId;
      if (body.reason) inputs.reason = body.reason;

      try {
        await dispatchWorkflow(await getGithubToken(c.env), {
          workflowFile: target.rollbackWorkflow,
          ref: 'main',
          inputs,
        });

        c.set('auditAction', 'deploy.rollback');
        c.set('auditResource', body.app);
        c.set('auditReversibility', 'irreversible');
        c.set('auditResultDetail', {
          env: ctx.env,
          versionId: body.versionId ?? 'previous',
          reason: body.reason ?? null,
          mechanism: 'github-workflow',
          workflow: target.rollbackWorkflow,
          idempotencyKey: body.idempotencyKey ?? null,
        });

        return c.json(
          {
            app: body.app,
            env: ctx.env,
            status: 'rollback-dispatched',
            mechanism: 'github-workflow',
            workflow: target.rollbackWorkflow,
            versionId: body.versionId ?? 'previous',
            dispatchId: crypto.randomUUID(),
          },
          202,
        );
      } catch (err) {
        if (err instanceof GitHubApiError) {
          return c.json(
            { error: 'rollback workflow dispatch failed', status: err.status, detail: err.body.slice(0, 800) },
            502,
          );
        }
        return c.json({ error: 'rollback workflow dispatch failed', detail: (err as Error).message }, 502);
      }
    }

    // Path 2: use Cloudflare Workers Deployments API directly.
    const cfToken = c.env.CLOUDFLARE_API_TOKEN;
    const cfAccount = c.env.CLOUDFLARE_ACCOUNT_ID;
    if (!cfToken || !cfAccount) {
      return c.json({ error: 'CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID not configured for direct rollback' }, 503);
    }

    const workerName = ctx.env === 'production' ? body.app : `${body.app}-staging`;
    const rollbackUrl = body.versionId
      ? `https://api.cloudflare.com/client/v4/accounts/${cfAccount}/workers/scripts/${workerName}/deployments/${encodeURIComponent(body.versionId)}/rollback`
      : `https://api.cloudflare.com/client/v4/accounts/${cfAccount}/workers/scripts/${workerName}/deployments/rollback`;

    try {
      const res = await fetch(rollbackUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${cfToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ message: body.reason ?? 'Rollback via Admin Studio' }),
        signal: AbortSignal.timeout(10_000),
      });

      if (!res.ok) {
        const text = await res.text();
        return c.json({ error: `Cloudflare rollback failed (${res.status})`, detail: text.slice(0, 800) }, 502);
      }

      c.set('auditAction', 'deploy.rollback');
      c.set('auditResource', body.app);
      c.set('auditReversibility', 'irreversible');
      c.set('auditResultDetail', {
        env: ctx.env,
        workerName,
        versionId: body.versionId ?? 'previous',
        reason: body.reason ?? null,
        mechanism: 'cloudflare-api',
        idempotencyKey: body.idempotencyKey ?? null,
      });

      return c.json(
        {
          app: body.app,
          env: ctx.env,
          status: 'rolled-back',
          mechanism: 'cloudflare-api',
          workerName,
          versionId: body.versionId ?? 'previous',
        },
        200,
      );
    } catch (err) {
      return c.json({ error: 'Cloudflare rollback request failed', detail: (err as Error).message }, 502);
    }
  },
);

export default deploy;
