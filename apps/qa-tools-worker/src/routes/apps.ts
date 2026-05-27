/**
 * App-level health and summary route handlers.
 *
 * GET /apps/:appId/health — Per-app health summary (last run + open violations)
 *
 * Health status logic (see §4.6 of QA_TOOLS_ARCHITECTURE.md):
 *   healthy  (green):  Last run passed, 0 critical/serious violations, no regressions in 7d
 *   degraded (yellow): Last run failed OR any serious violations open OR perf dropped
 *   critical (red):    1+ critical violations OR last 3 runs failed OR LCP > configured max
 */

import { Hono } from 'hono';
import { NotFoundError } from '@latimer-woods-tech/errors';
import type { Env } from '../env.js';
import { VALID_APP_IDS } from '../types.js';
import { getLatestRun, countOpenViolations } from '../lib/db.js';
import { requireAuth, assertAppAccess } from '../middleware/auth.js';

const appsRouter = new Hono<{ Bindings: Env }>();

// ---------------------------------------------------------------------------
// GET /apps/:appId/health
// ---------------------------------------------------------------------------

appsRouter.get('/:appId/health', async (c) => {
  const claims = await requireAuth(c.req.header('Authorization'), c.env.QA_TOOLS_JWT_SECRET);
  const appId = c.req.param('appId');

  if (!VALID_APP_IDS.includes(appId as typeof VALID_APP_IDS[number])) {
    throw new NotFoundError(`Unknown app: ${appId}`);
  }
  assertAppAccess(claims, appId);

  const environment = c.req.query('environment') ?? 'production';
  const connectionString = c.env.DB.connectionString;

  const [lastRun, violations] = await Promise.all([
    getLatestRun(connectionString, appId, environment),
    countOpenViolations(connectionString, appId),
  ]);

  const { statusLabel, statusColor } = computeHealthStatus(
    lastRun?.status,
    violations.critical,
    violations.serious,
  );

  return c.json({
    appId,
    environment,
    statusLabel,
    statusColor,
    lastRunAt: lastRun?.created_at ?? null,
    lastRunId: lastRun?.id ?? null,
    lastRunStatus: lastRun?.status ?? null,
    lastRunProfile: lastRun?.profile ?? null,
    openViolationsCount: violations.total,
    details: {
      critical: violations.critical,
      serious: violations.serious,
      moderate: violations.moderate,
    },
    // Phase 3+: trend, regressionsSince, lighthouseScore
  });
});

// ---------------------------------------------------------------------------
// Health status computation
// ---------------------------------------------------------------------------

function computeHealthStatus(
  lastRunStatus: string | undefined,
  criticalCount: number,
  seriousCount: number,
): { statusLabel: string; statusColor: 'green' | 'yellow' | 'red' } {
  if (criticalCount > 0) {
    return { statusLabel: 'critical', statusColor: 'red' };
  }
  if (!lastRunStatus || lastRunStatus === 'error') {
    return { statusLabel: 'unknown', statusColor: 'yellow' };
  }
  if (lastRunStatus === 'failed' || seriousCount > 0) {
    return { statusLabel: 'degraded', statusColor: 'yellow' };
  }
  if (lastRunStatus === 'passed') {
    return { statusLabel: 'healthy', statusColor: 'green' };
  }
  // pending / running
  return { statusLabel: 'checking', statusColor: 'yellow' };
}

export { appsRouter };
