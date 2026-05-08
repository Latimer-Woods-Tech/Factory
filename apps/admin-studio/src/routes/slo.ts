/**
 * ADM-3: SLO and error-budget burn panel.
 *
 * GET /slo/summary?env=staging|production
 *   Returns per-app availability, p99 latency proxy, error rate, burn rate,
 *   budget consumed, and a policy-state label.
 *
 * Data is synthesised from:
 *   - Live /health fan-out results (availability signal)
 *   - Sentry unresolved-issue counts (error-rate proxy)
 *   - A 28-day rolling budget (99.9% = 40.32 min/28d downtime budget)
 *
 * All responses carry the FRH-09 degraded-state envelope so the UI can
 * distinguish "everything is fine" from "we couldn't measure anything".
 */
import { Hono } from 'hono';
import type { AppEnv } from '../types.js';
import { isEnvironment, type Environment } from '@latimer-woods-tech/studio-core';
import { FACTORY_APPS, healthUrlFor } from '../lib/app-registry.js';

const slo = new Hono<AppEnv>();

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Target availability expressed as a fraction (99.9%). */
const SLO_TARGET = 0.999;

/** Rolling window in minutes (28 days). */
const WINDOW_MINUTES = 28 * 24 * 60; // 40320

/** Error budget in minutes for a 28-day window at 99.9%. */
const BUDGET_MINUTES = WINDOW_MINUTES * (1 - SLO_TARGET); // ~40.32

const HEALTH_TIMEOUT_MS = 5_000;
const SENTRY_TIMEOUT_MS = 8_000;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type PolicyState = 'normal' | 'warning' | 'critical' | 'exhausted';

interface AppSlo {
  id: string;
  label: string;
  /** Observed availability fraction (0–1). */
  availability: number;
  /** Human-readable availability percent e.g. "99.87%". */
  availabilityPct: string;
  /** Latency proxy: last observed /health response time in ms (null if unknown). */
  p99LatencyMs: number | null;
  /** Error rate proxy: unresolved Sentry issues per this app (null if unconfigured). */
  errorCount: number | null;
  /** Budget burn rate: fraction of budget used (estimate; 0–1+). */
  burnRate: number;
  /** Budget consumed estimate in minutes. */
  budgetConsumedMinutes: number;
  /** Remaining budget in minutes. */
  budgetRemainingMinutes: number;
  /** SLO policy state. */
  policyState: PolicyState;
}

interface SloDegradedEnvelope {
  degraded: boolean;
  providerStatus: 'ok' | 'unconfigured' | 'error' | 'partial';
  retryable: boolean;
  error?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function pctStr(fraction: number): string {
  return `${(fraction * 100).toFixed(3)}%`;
}

function policyState(availability: number, burnRate: number): PolicyState {
  // Budget exhausted when we've consumed more than 100%.
  const consumed = (1 - availability) * WINDOW_MINUTES;
  if (consumed >= BUDGET_MINUTES) return 'exhausted';
  // Burn rate > 14.4x means the 28-day budget would be gone within 48h.
  if (burnRate >= 14.4) return 'critical';
  // Burn rate > 6x means the budget would be gone within ~5 days.
  if (burnRate >= 6) return 'warning';
  return 'normal';
}

/** Probe a single app health endpoint. Returns { up, latencyMs }. */
async function probeHealth(url: string): Promise<{ up: boolean; latencyMs: number }> {
  const start = Date.now();
  const ct = new AbortController();
  const timer = setTimeout(() => ct.abort(), HEALTH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: ct.signal });
    return { up: res.ok, latencyMs: Date.now() - start };
  } catch {
    return { up: false, latencyMs: Date.now() - start };
  } finally {
    clearTimeout(timer);
  }
}

/** Fetch unresolved Sentry issue count for a given project. Returns null if unconfigured. */
async function sentryErrorCount(
  token: string | undefined,
  org: string | undefined,
  project: string | undefined,
): Promise<number | null> {
  if (!token || !org || !project) return null;
  const ct = new AbortController();
  const timer = setTimeout(() => ct.abort(), SENTRY_TIMEOUT_MS);
  try {
    const res = await fetch(
      `https://sentry.io/api/0/projects/${encodeURIComponent(org)}/${encodeURIComponent(project)}/issues/?limit=100&query=is:unresolved&statsPeriod=28d`,
      { headers: { Authorization: `Bearer ${token}` }, signal: ct.signal },
    );
    if (!res.ok) return null;
    const data: unknown[] = await res.json();
    return Array.isArray(data) ? data.length : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// Route
// ---------------------------------------------------------------------------

/**
 * GET /slo/summary
 *
 * Query params:
 *   env  — staging | production (default: envContext.env)
 */
slo.get('/summary', async (c) => {
  const ctx = c.var.envContext;
  const requested = c.req.query('env');
  const env: Environment = isEnvironment(requested) ? requested : ctx.env;

  if (env === 'local') {
    return c.json<SloDegradedEnvelope & { env: string; apps: AppSlo[] }>({
      degraded: false,
      providerStatus: 'ok',
      retryable: false,
      env,
      apps: [],
    });
  }

  // Probe all app /health endpoints in parallel.
  const healthTasks = FACTORY_APPS.map(async (app) => {
    const url = healthUrlFor(app, env);
    if (!url) return { id: app.id, label: app.label, up: false, latencyMs: null as number | null };
    const { up, latencyMs } = await probeHealth(url);
    return { id: app.id, label: app.label, up, latencyMs };
  });

  // Fetch Sentry error count once (single shared project for now).
  const errorCountTask = sentryErrorCount(
    c.env.SENTRY_AUTH_TOKEN,
    c.env.SENTRY_ORG,
    c.env.SENTRY_PROJECT,
  );

  const [healthResults, errorCount] = await Promise.all([
    Promise.all(healthTasks),
    errorCountTask,
  ]);

  const anyProbed = healthResults.some((r) => r.latencyMs !== null);
  const providerStatus = anyProbed ? 'ok' : 'error';

  const apps: AppSlo[] = healthResults.map((h) => {
    // Availability: simple binary from the single probe.
    // A real implementation would use a time-series from a monitoring store.
    const availability = h.up ? 1 : 0;

    // Burn rate: compare against 1 (perfect). For a single-probe snapshot the
    // burn rate is either 0 (up) or 1440x (completely down for a minute-equivalent).
    // We cap it at 1440 to remain meaningful on the UI.
    const burnRate = h.up ? 0 : Math.min(1440, WINDOW_MINUTES / BUDGET_MINUTES);

    const budgetConsumedMinutes = h.up ? 0 : Math.min(BUDGET_MINUTES, BUDGET_MINUTES);
    const budgetRemainingMinutes = Math.max(0, BUDGET_MINUTES - budgetConsumedMinutes);

    return {
      id: h.id,
      label: h.label,
      availability,
      availabilityPct: pctStr(availability),
      p99LatencyMs: h.latencyMs,
      errorCount,
      burnRate,
      budgetConsumedMinutes,
      budgetRemainingMinutes,
      policyState: policyState(availability, burnRate),
    };
  });

  const degraded = apps.length > 0 && apps.every((a) => a.availability === 0);

  return c.json({
    degraded,
    providerStatus,
    retryable: degraded,
    env,
    sloTargetPct: pctStr(SLO_TARGET),
    budgetWindowDays: 28,
    budgetTotalMinutes: BUDGET_MINUTES,
    apps,
  });
});

export default slo;
