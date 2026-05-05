import { Hono } from 'hono';
import type { AppEnv } from '../types.js';
import { requireConfirmation } from '../middleware/require-confirmation.js';
import { requireEnv } from '@latimer-woods-tech/studio-core';
import { GitHubApiError, dispatchWorkflow, fetchDispatchedRunUrl } from '../lib/github-api.js';

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
}

export const DEPLOY_TARGETS: Readonly<Record<string, DeployTargetConfig>> = {
  'admin-studio': { workflow: 'deploy-admin-studio.yml', supportsEnvInput: true },
  'admin-studio-ui': { workflow: 'deploy-admin-studio-ui.yml', supportsEnvInput: true },
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

    if (!c.env.GITHUB_TOKEN) {
      return c.json({ error: 'GITHUB_TOKEN not configured' }, 503);
    }

    try {
      const dispatchedAt = new Date();
      await dispatchWorkflow(c.env.GITHUB_TOKEN, {
        workflowFile: plan.workflow,
        ref: plan.ref,
        inputs: plan.inputs,
      });

      // Poll once for the real run URL. GitHub queues runs asynchronously so
      // this may return null if the run hasn't appeared within ~3 s.
      const runUrl = await fetchDispatchedRunUrl(c.env.GITHUB_TOKEN, plan.workflow, dispatchedAt);

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

export default deploy;
