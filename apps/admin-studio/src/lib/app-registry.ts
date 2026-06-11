/**
 * Factory app registry — single source of truth for the apps the Studio
 * monitors and operates on.
 *
 * Mirrors `docs/service-registry.yml`. Kept in code so the Worker can
 * iterate without a YAML parser. Update both when adding a new app.
 *
 * Drift guard command:
 *   npm run check:service-registry
 *
 * URLs use the per-environment hostname pattern documented in
 * CLAUDE.md (`{name}.adrper79.workers.dev` for staging-style names,
 * `{name}-production.adrper79.workers.dev` for prod-style).
 */

import type { Environment } from '@latimer-woods-tech/studio-core';

export interface FactoryApp {
  /** Stable id, matches `service-registry.yml`. */
  id: string;
  label: string;
  /** Worker name in production (used for CF API lookups). */
  productionWorkerName: string;
  /** Worker name in staging. */
  stagingWorkerName: string;
  /** Optional custom domain for the production health check. */
  productionCustomDomain?: string;
  /** Optional custom domain for the staging health check (use when workers.dev returns 404). */
  stagingCustomDomain?: string;
}

export const FACTORY_APPS: readonly FactoryApp[] = [
  {
    id: 'admin-studio',
    label: 'Admin Studio',
    productionWorkerName: 'admin-studio-production',
    stagingWorkerName: 'admin-studio-staging',
    productionCustomDomain: 'api.apunlimited.com',
    stagingCustomDomain: 'api.admin.latimerwoods.dev',
  },
  {
    id: 'prime-self',
    label: 'Prime Self',
    productionWorkerName: 'prime-self-api',
    // No distinct staging worker is currently registry-backed for prime-self.
    stagingWorkerName: 'prime-self-api',
    productionCustomDomain: 'api.selfprime.net',
  },
  {
    id: 'schedule-worker',
    label: 'Schedule Worker',
    productionWorkerName: 'schedule-worker',
    // No distinct staging worker is currently registry-backed for schedule-worker.
    stagingWorkerName: 'schedule-worker',
    productionCustomDomain: 'schedule.latwoodtech.work',
  },
  {
    id: 'video-cron',
    label: 'Video Cron',
    productionWorkerName: 'video-cron',
    // No distinct staging worker is currently registry-backed for video-cron.
    stagingWorkerName: 'video-cron',
    productionCustomDomain: 'video-cron.latwoodtech.work',
  },
  {
    id: 'capricast-api',
    label: 'Capricast API',
    productionWorkerName: 'capricast-api',
    stagingWorkerName: 'capricast-api-staging',
    productionCustomDomain: 'api.capricast.com',
  },
  {
    id: 'cypher-healing',
    label: 'Cypher of Healing',
    productionWorkerName: 'cypher-healing',
    stagingWorkerName: 'cypher-healing',
    productionCustomDomain: 'api.cipherofhealing.com',
  },
] as const;

const ACCOUNT_SUBDOMAIN = 'adrper79';

/**
 * Compute the canonical health URL for an app in a given environment.
 *
 * Rules:
 *   - production: prefer custom domain when defined, else workers.dev URL
 *   - staging:    always workers.dev URL
 *   - local:      not supported (callers should skip)
 */
export function healthUrlFor(app: FactoryApp, env: Environment): string | null {
  if (env === 'local') return null;
  if (env === 'production') {
    if (app.productionCustomDomain) {
      return `https://${app.productionCustomDomain}/health`;
    }
    return `https://${app.productionWorkerName}.${ACCOUNT_SUBDOMAIN}.workers.dev/health`;
  }
  // staging: prefer explicit custom domain when defined, else fall back to workers.dev
  if (app.stagingCustomDomain) {
    return `https://${app.stagingCustomDomain}/health`;
  }
  return `https://${app.stagingWorkerName}.${ACCOUNT_SUBDOMAIN}.workers.dev/health`;
}

/**
 * Resolve the worker name for an app in a given environment. Returns null
 * for `local` (no workers.dev deployment exists for local).
 */
export function workerNameFor(app: FactoryApp, env: Environment): string | null {
  if (env === 'local') return null;
  if (env === 'production') return app.productionWorkerName;
  return app.stagingWorkerName;
}

/**
 * Compute the canonical /manifest URL for an app — same host as /health
 * but on the `/manifest` path. Returns null for `local` envs.
 */
export function manifestUrlFor(app: FactoryApp, env: Environment): string | null {
  const url = healthUrlFor(app, env);
  if (!url) return null;
  return url.replace(/\/health$/, '/manifest');
}
