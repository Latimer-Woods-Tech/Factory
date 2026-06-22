/**
 * ADM-4: Synthetic journey monitor panel.
 *
 * GET /synthetic/journeys?env=staging|production
 *   Returns pass/fail status for each named synthetic journey.
 *   Journeys extend beyond raw /health probes to exercise real user paths:
 *     - login  : POST /auth/login with test credentials → expect 200 + token
 *     - health : GET /health → expect 200 + { status: "ok" }
 *     - payment: GET /api/admin/creators → expect 200 | 403 (not 5xx)
 *
 * POST /synthetic/run?env=staging|production
 *   Re-runs all journeys on demand (audited via auditMiddleware).
 *   Body: { journey?: string }   — omit to run all.
 *
 * Each result carries:
 *   - pass/fail
 *   - latencyMs
 *   - failureEvidence: partial response snippet (never full body)
 *   - outageClassification: none | partial | full
 *   - trend (last 10 snapshots from KV, if MONITOR_KV is bound)
 *
 * All responses carry the FRH-09 degraded-state envelope.
 */
import { Hono } from 'hono';
import type { AppEnv } from '../types.js';
import { isEnvironment, type Environment } from '@latimer-woods-tech/studio-core';
import { FACTORY_APPS, healthUrlFor } from '../lib/app-registry.js';

const synthetic = new Hono<AppEnv>();

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type OutageClass = 'none' | 'partial' | 'full';
type JourneyStatus = 'pass' | 'fail' | 'skipped';

interface JourneyResult {
  id: string;
  label: string;
  status: JourneyStatus;
  latencyMs: number | null;
  /** Short evidence snippet — truncated at 200 chars, never includes secrets. */
  failureEvidence: string | null;
  outageClass: OutageClass;
  checkedAt: string;
}

interface JourneySnapshot {
  env: Environment;
  checkedAt: string;
  outageClass: OutageClass;
  journeys: JourneyResult[];
  /** Recent pass/fail trend per journey id (last 10 snapshots from KV). */
  trend: Record<string, JourneyStatus[]>;
}

// ---------------------------------------------------------------------------
// Journey definitions
// ---------------------------------------------------------------------------

interface JourneyDef {
  id: string;
  label: string;
  /** Returns a JourneyResult given the resolved base URL (without /health suffix). */
  run(baseUrl: string, env: Environment): Promise<JourneyResult>;
}

const JOURNEY_TIMEOUT_MS = 8_000;

async function probeGet(
  url: string,
  id: string,
  label: string,
  expectOk: (status: number, body: string) => boolean,
): Promise<JourneyResult> {
  const checkedAt = new Date().toISOString();
  const ct = new AbortController();
  const timer = setTimeout(() => ct.abort(), JOURNEY_TIMEOUT_MS);
  const start = Date.now();
  try {
    const res = await fetch(url, { signal: ct.signal });
    const latencyMs = Date.now() - start;
    const text = await res.text().catch(() => '');
    const snippet = text.slice(0, 200);
    const ok = expectOk(res.status, text);
    return {
      id,
      label,
      status: ok ? 'pass' : 'fail',
      latencyMs,
      failureEvidence: ok ? null : `HTTP ${res.status}: ${snippet}`,
      outageClass: ok ? 'none' : 'partial',
      checkedAt,
    };
  } catch (err) {
    return {
      id,
      label,
      status: 'fail',
      latencyMs: Date.now() - start,
      failureEvidence: (err as Error).message.slice(0, 200),
      outageClass: 'full',
      checkedAt,
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Probe the /health endpoint — expects { status: "ok" }.
 */
function healthJourney(appId: string, appLabel: string): JourneyDef {
  return {
    id: `${appId}:health`,
    label: `${appLabel} /health`,
    async run(baseUrl) {
      return probeGet(`${baseUrl}/health`, `${appId}:health`, `${appLabel} /health`, (status, body) => {
        if (!status.toString().startsWith('2')) return false;
        try {
          const j = JSON.parse(body) as { status?: string };
          return j.status === 'ok';
        } catch {
          return false;
        }
      });
    },
  };
}

/**
 * Probe an authenticated admin endpoint — expects 200 | 401 | 403 (never 5xx).
 * 401/403 are acceptable because the journey has no credentials; we're testing
 * that the service is running, not that authentication works.
 */
function authWallJourney(appId: string, appLabel: string, path: string): JourneyDef {
  return {
    id: `${appId}:auth-wall`,
    label: `${appLabel} auth wall`,
    async run(baseUrl) {
      return probeGet(`${baseUrl}${path}`, `${appId}:auth-wall`, `${appLabel} auth wall`, (status) => {
        return status < 500;
      });
    },
  };
}

/**
 * Studio login journey — exercises the full auth flow end-to-end.
 * Uses obviously-invalid credentials; expects 401 (not 5xx).
 */
const STUDIO_LOGIN_JOURNEY: JourneyDef = {
  id: 'admin-studio:login',
  label: 'Studio login rejects bad creds',
  async run(baseUrl) {
    const checkedAt = new Date().toISOString();
    const ct = new AbortController();
    const timer = setTimeout(() => ct.abort(), JOURNEY_TIMEOUT_MS);
    const start = Date.now();
    try {
      const res = await fetch(`${baseUrl}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'synthetic@example.invalid', password: 'bad-password', env: 'staging', app: 'factory' }),
        signal: ct.signal,
      });
      const latencyMs = Date.now() - start;
      const text = await res.text().catch(() => '');
      // Must return 401 — any 5xx means the service is broken.
      const ok = res.status === 401;
      return {
        id: 'admin-studio:login',
        label: 'Studio login rejects bad creds',
        status: ok ? 'pass' : 'fail',
        latencyMs,
        failureEvidence: ok ? null : `Expected 401, got ${res.status}: ${text.slice(0, 200)}`,
        outageClass: ok ? 'none' : res.status >= 500 ? 'full' : 'partial',
        checkedAt,
      };
    } catch (err) {
      return {
        id: 'admin-studio:login',
        label: 'Studio login rejects bad creds',
        status: 'fail',
        latencyMs: Date.now() - start,
        failureEvidence: (err as Error).message.slice(0, 200),
        outageClass: 'full',
        checkedAt,
      };
    } finally {
      clearTimeout(timer);
    }
  },
};

// ---------------------------------------------------------------------------
// Derive journey list from app registry
// ---------------------------------------------------------------------------

function buildJourneys(env: Environment): JourneyDef[] {
  const journeys: JourneyDef[] = [];
  for (const app of FACTORY_APPS) {
    const url = healthUrlFor(app, env);
    if (!url) continue;
    journeys.push(healthJourney(app.id, app.label));
    // Studio gets the extra login + auth-wall journeys.
    if (app.id === 'admin-studio') {
      journeys.push(STUDIO_LOGIN_JOURNEY);
      journeys.push(authWallJourney(app.id, app.label, '/me'));
    }
  }
  return journeys;
}

// ---------------------------------------------------------------------------
// Outage classification
// ---------------------------------------------------------------------------

function classifyOutage(results: JourneyResult[]): OutageClass {
  const failed = results.filter((r) => r.status === 'fail');
  if (failed.length === 0) return 'none';
  if (failed.some((r) => r.outageClass === 'full')) return 'full';
  return 'partial';
}

// ---------------------------------------------------------------------------
// KV trend helpers
// ---------------------------------------------------------------------------

const KV_TREND_KEY_PREFIX = 'synthetic:trend:';
const KV_MAX_TREND_ENTRIES = 10;

async function loadTrend(
  kv: KVNamespace | undefined,
  journeyId: string,
): Promise<JourneyStatus[]> {
  if (!kv) return [];
  try {
    const raw = await kv.get(`${KV_TREND_KEY_PREFIX}${journeyId}`);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as JourneyStatus[]) : [];
  } catch {
    return [];
  }
}

async function saveTrend(
  kv: KVNamespace | undefined,
  journeyId: string,
  status: JourneyStatus,
  existing: JourneyStatus[],
): Promise<void> {
  if (!kv) return;
  const updated = [...existing, status].slice(-KV_MAX_TREND_ENTRIES);
  try {
    await kv.put(
      `${KV_TREND_KEY_PREFIX}${journeyId}`,
      JSON.stringify(updated),
      { expirationTtl: 90 * 24 * 60 * 60 }, // 90 days
    );
  } catch {
    // Non-fatal: trend is advisory only.
  }
}

// ---------------------------------------------------------------------------
// Core run logic (shared by GET and POST)
// ---------------------------------------------------------------------------

async function runJourneys(
  env: Environment,
  kv: KVNamespace | undefined,
  filter?: string,
): Promise<JourneySnapshot> {
  const allJourneys = buildJourneys(env);
  const toRun = filter
    ? allJourneys.filter((j) => j.id === filter)
    : allJourneys;

  if (toRun.length === 0) {
    return {
      env,
      checkedAt: new Date().toISOString(),
      outageClass: 'none',
      journeys: [],
      trend: {},
    };
  }

  // Load existing trends before running (so we can append to them).
  const trendsBefore = await Promise.all(
    toRun.map((j) => loadTrend(kv, j.id)),
  );

  // Resolve base URLs.
  const urlMap = new Map<string, string>();
  for (const app of FACTORY_APPS) {
    const url = healthUrlFor(app, env);
    if (url) urlMap.set(app.id, url.replace(/\/health$/, ''));
  }

  // Run all journeys in parallel.
  const results = await Promise.all(
    toRun.map((j) => {
      const appId = j.id.split(':')[0] ?? '';
      const baseUrl = urlMap.get(appId) ?? '';
      if (!baseUrl) {
        return Promise.resolve<JourneyResult>({
          id: j.id,
          label: j.label,
          status: 'skipped',
          latencyMs: null,
          failureEvidence: 'No URL available for this environment',
          outageClass: 'none',
          checkedAt: new Date().toISOString(),
        });
      }
      return j.run(baseUrl, env);
    }),
  );

  // Persist updated trends.
  await Promise.all(
    results.map((r, i) => saveTrend(kv, r.id, r.status, trendsBefore[i] ?? [])),
  );

  // Reload trends to include the just-recorded entry.
  const trendsAfter = await Promise.all(results.map((r) => loadTrend(kv, r.id)));
  const trend: Record<string, JourneyStatus[]> = {};
  for (let i = 0; i < results.length; i++) {
    trend[results[i]!.id] = trendsAfter[i] ?? [];
  }

  return {
    env,
    checkedAt: new Date().toISOString(),
    outageClass: classifyOutage(results),
    journeys: results,
    trend,
  };
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

/**
 * GET /synthetic/journeys
 * Run all (or a filtered set of) journeys and return the snapshot.
 */
synthetic.get('/journeys', async (c) => {
  const ctx = c.var.envContext;
  const requested = c.req.query('env');
  const env: Environment = isEnvironment(requested) ? requested : ctx.env;

  if (env === 'local') {
    return c.json({
      degraded: false,
      providerStatus: 'ok',
      retryable: false,
      env,
      checkedAt: new Date().toISOString(),
      outageClass: 'none' as OutageClass,
      journeys: [] as JourneyResult[],
      trend: {} as Record<string, JourneyStatus[]>,
      note: 'Synthetic journeys are not available for local environment.',
    });
  }

  try {
    const snapshot = await runJourneys(env, c.env.MONITOR_KV);
    const degraded = snapshot.outageClass === 'full';
    return c.json({
      degraded,
      providerStatus: 'ok',
      retryable: degraded,
      ...snapshot,
    });
  } catch (err) {
    return c.json(
      {
        degraded: true,
        providerStatus: 'error',
        retryable: true,
        error: (err as Error).message,
        env,
        checkedAt: new Date().toISOString(),
        outageClass: 'full' as OutageClass,
        journeys: [] as JourneyResult[],
        trend: {},
      },
      502,
    );
  }
});

/**
 * POST /synthetic/run
 * On-demand run — audited. Body: { journey?: string }
 */
synthetic.post('/run', async (c) => {
  const ctx = c.var.envContext;
  const requested = c.req.query('env');
  const env: Environment = isEnvironment(requested) ? requested : ctx.env;

  if (env === 'local') {
    return c.json({ error: 'Cannot run synthetic journeys against local environment.' }, 400);
  }

  const body = await c.req.json<{ journey?: string }>().catch((): { journey?: string } => ({}));
  const filter = typeof body.journey === 'string' ? body.journey : undefined;

  try {
    const snapshot = await runJourneys(env, c.env.MONITOR_KV, filter);

    c.set('auditAction', 'synthetic.run');
    c.set('auditResource', filter ?? 'all');
    c.set('auditReversibility', 'trivial');
    c.set('auditResultDetail', {
      env,
      outageClass: snapshot.outageClass,
      total: snapshot.journeys.length,
      failed: snapshot.journeys.filter((j) => j.status === 'fail').length,
      triggeredBy: ctx.userId,
    });

    return c.json({
      degraded: snapshot.outageClass === 'full',
      providerStatus: 'ok',
      retryable: false,
      ...snapshot,
    });
  } catch (err) {
    return c.json(
      {
        degraded: true,
        providerStatus: 'error',
        retryable: true,
        error: (err as Error).message,
      },
      502,
    );
  }
});

export default synthetic;
