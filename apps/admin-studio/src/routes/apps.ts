/**
 * App health fan-out + Cloudflare deploy-version reads.
 *
 * GET /apps/health?env=staging|production
 *   Concurrent fan-out to every Factory app's /health. Returns
 *   AppHealth[] sorted by status severity (down → degraded → unknown → healthy)
 *   then label, so operators see breakages first.
 *
 * GET /apps/versions?env=staging|production
 *   Reads the latest deployment per worker from the Cloudflare API.
 *   Requires CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID secrets.
 *   Falls back to a clear "not configured" response when secrets are absent.
 */
import { Hono } from 'hono';
import type { AppEnv } from '../types.js';
import {
  isEnvironment,
  type AppHealth,
  type AppHealthStatus,
  type DeployVersion,
  type Environment,
} from '@latimer-woods-tech/studio-core';
import { FACTORY_APPS, healthUrlFor, workerNameFor } from '../lib/app-registry.js';

const apps = new Hono<AppEnv>();

const HEALTH_TIMEOUT_MS = 5000;

function severity(status: AppHealthStatus): number {
  switch (status) {
    case 'down':
      return 0;
    case 'degraded':
      return 1;
    case 'unknown':
      return 2;
    case 'healthy':
      return 3;
  }
}

async function checkOne(
  app: { id: string; label: string },
  env: Environment,
  url: string,
): Promise<AppHealth> {
  const checkedAt = new Date().toISOString();
  const start = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), HEALTH_TIMEOUT_MS);

  try {
    const res = await fetch(url, { method: 'GET', signal: controller.signal });
    const latencyMs = Date.now() - start;
    let body: Record<string, unknown> = {};
    try {
      body = await res.json<Record<string, unknown>>();
    } catch {
      // Non-JSON response — keep going, treat as degraded if 2xx.
    }
    let status: AppHealthStatus;
    if (res.status >= 500) status = 'down';
    else if (res.status >= 400) status = 'degraded';
    else if (res.ok) status = 'healthy';
    else status = 'unknown';

    return {
      id: app.id,
      label: app.label,
      env,
      url,
      status,
      httpStatus: res.status,
      latencyMs,
      checkedAt,
      reportedEnv: typeof body.env === 'string' ? body.env : undefined,
      reportedService: typeof body.service === 'string' ? body.service : undefined,
    };
  } catch (err) {
    return {
      id: app.id,
      label: app.label,
      env,
      url,
      status: 'down',
      httpStatus: 0,
      latencyMs: Date.now() - start,
      checkedAt,
      error: (err as Error).message,
    };
  } finally {
    clearTimeout(timer);
  }
}

apps.get('/health', async (c) => {
  const ctx = c.var.envContext;
  const url = new URL(c.req.url);
  const requested = url.searchParams.get('env');
  const env: Environment = isEnvironment(requested) ? requested : ctx.env;

  if (env === 'local') {
    return c.json({ env, results: [], note: 'Local env has no workers.dev fan-out target.' });
  }

  const checks = FACTORY_APPS.map((app) => {
    const target = healthUrlFor(app, env);
    if (!target) return null;
    return checkOne(app, env, target);
  }).filter((p): p is Promise<AppHealth> => p !== null);

  const settled = await Promise.allSettled(checks);
  const results = settled
    .map((outcome) => {
      if (outcome.status === 'fulfilled') return outcome.value;
      console.warn(`[apps/health] check rejected: ${outcome.reason?.message ?? outcome.reason}`);
      return null;
    })
    .filter((v): v is AppHealth => v !== null);
  results.sort((a, b) => {
    const s = severity(a.status) - severity(b.status);
    if (s !== 0) return s;
    return a.label.localeCompare(b.label);
  });

  return c.json({ env, results });
});

apps.get('/versions', async (c) => {
  const ctx = c.var.envContext;
  const url = new URL(c.req.url);
  const requested = url.searchParams.get('env');
  const env: Environment = isEnvironment(requested) ? requested : ctx.env;

  const token = c.env.CLOUDFLARE_API_TOKEN;
  const accountId = c.env.CLOUDFLARE_ACCOUNT_ID;
  if (!token || !accountId) {
    return c.json({
      env,
      configured: false,
      note: 'CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID not set on this Worker.',
      results: [] as DeployVersion[],
    });
  }

  if (env === 'local') {
    return c.json({ env, configured: true, results: [] });
  }

  const tasks = FACTORY_APPS.map(async (app): Promise<DeployVersion | null> => {
    const workerName = workerNameFor(app, env);
    if (!workerName) return null;
    try {
      const res = await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/scripts/${workerName}/deployments`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (!res.ok) {
        return {
          workerName,
          env,
          versionId: 'unknown',
          deployedAt: new Date(0).toISOString(),
          source: `cf-api-${res.status}`,
        };
      }
      const json: {
        result?: { deployments?: Array<{ id: string; created_on: string; source?: string }> };
      } = await res.json();
      const latest = json.result?.deployments?.[0];
      if (!latest) return null;
      return {
        workerName,
        env,
        versionId: latest.id,
        deployedAt: latest.created_on,
        source: latest.source,
      };
    } catch (err) {
      return {
        workerName,
        env,
        versionId: 'error',
        deployedAt: new Date().toISOString(),
        source: (err as Error).message,
      };
    }
  });

  const settled = await Promise.all(tasks);
  const results = settled.filter((v): v is DeployVersion => v !== null);
  results.sort((a, b) => a.workerName.localeCompare(b.workerName));

  return c.json({ env, configured: true, results });
});

export default apps;
