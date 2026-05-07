/**
 * Read-only proxies into Sentry + PostHog so the Studio can render
 * recent-error and metrics tiles without exposing API tokens to the browser.
 *
 * FRH-09: All responses carry a machine-detectable degraded-state envelope:
 *   - `degraded: true` whenever data is unavailable for ANY reason
 *   - `providerStatus`: 'ok' | 'unconfigured' | 'error' | 'timeout'
 *   - `retryable`: whether the caller should retry
 *
 * This lets the UI distinguish "0 issues right now" from "Sentry unreachable".
 */
import { Hono } from 'hono';
import type { AppEnv } from '../types.js';
import { FACTORY_APPS, healthUrlFor } from '../lib/app-registry.js';
import type { Environment } from '@latimer-woods-tech/studio-core';

const observability = new Hono<AppEnv>();

// ---------------------------------------------------------------------------
// Shared degraded-state envelope
// ---------------------------------------------------------------------------

type ProviderStatus = 'ok' | 'unconfigured' | 'error' | 'timeout';

interface DegradedEnvelope {
  /** Always present. True when the provider could not supply live data. */
  degraded: boolean;
  /** Machine-readable provider state — never rely on the `error` string alone. */
  providerStatus: ProviderStatus;
  /** True when the client should retry the same request later. */
  retryable: boolean;
  /** Human-readable explanation, only present when `degraded` is true. */
  error?: string;
}

function okEnvelope(): DegradedEnvelope {
  return { degraded: false, providerStatus: 'ok', retryable: false };
}

function unconfiguredEnvelope(note: string): DegradedEnvelope {
  return { degraded: true, providerStatus: 'unconfigured', retryable: false, error: note };
}

function errorEnvelope(message: string, timedOut = false): DegradedEnvelope {
  return {
    degraded: true,
    providerStatus: timedOut ? 'timeout' : 'error',
    retryable: true,
    error: message,
  };
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SentryIssue {
  id: string;
  title: string;
  culprit?: string;
  level: string;
  count: string;
  userCount: number;
  firstSeen: string;
  lastSeen: string;
  permalink: string;
}

interface PostHogTile {
  id: string;
  label: string;
  value: number;
  unit?: string;
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

observability.get('/sentry/issues', async (c) => {
  const token = c.env.SENTRY_AUTH_TOKEN;
  const org = c.env.SENTRY_ORG;
  const project = c.env.SENTRY_PROJECT;

  if (!token || !org || !project) {
    return c.json({
      ...unconfiguredEnvelope('Set SENTRY_AUTH_TOKEN, SENTRY_ORG, SENTRY_PROJECT.'),
      issues: [] as SentryIssue[],
    });
  }

  const url = new URL(c.req.url);
  const limit = clamp(Number.parseInt(url.searchParams.get('limit') ?? '20', 10), 1, 100);
  const env = url.searchParams.get('env') ?? c.var.envContext.env;

  const ct = new AbortController();
  const timer = setTimeout(() => ct.abort(), 8_000);
  try {
    const res = await fetch(
      `https://sentry.io/api/0/projects/${encodeURIComponent(org)}/${encodeURIComponent(project)}/issues/?limit=${limit}&environment=${encodeURIComponent(env)}&statsPeriod=24h&query=is:unresolved`,
      { headers: { Authorization: `Bearer ${token}` }, signal: ct.signal },
    );
    if (!res.ok) {
      return c.json(
        { ...errorEnvelope(`sentry upstream returned ${res.status}`), issues: [] as SentryIssue[] },
        502,
      );
    }
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const issues: SentryIssue[] = await res.json();
    return c.json({ ...okEnvelope(), env, issues });
  } catch (err) {
    const timedOut = (err as Error).name === 'AbortError';
    return c.json(
      { ...errorEnvelope((err as Error).message, timedOut), issues: [] as SentryIssue[] },
      502,
    );
  } finally {
    clearTimeout(timer);
  }
});

observability.get('/posthog/tiles', async (c) => {
  const key = c.env.POSTHOG_API_KEY;
  const projectId = c.env.POSTHOG_PROJECT_ID;
  const host = c.env.POSTHOG_HOST ?? 'https://us.i.posthog.com';

  if (!key || !projectId) {
    return c.json({
      ...unconfiguredEnvelope('Set POSTHOG_API_KEY + POSTHOG_PROJECT_ID.'),
      tiles: [] as PostHogTile[],
    });
  }

  const ct = new AbortController();
  const timer = setTimeout(() => ct.abort(), 8_000);
  try {
    const res = await fetch(
      `${host}/api/projects/${encodeURIComponent(projectId)}/query/`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: {
            kind: 'HogQLQuery',
            query: `SELECT count() AS total FROM events WHERE timestamp >= now() - INTERVAL 24 HOUR`,
          },
        }),
        signal: ct.signal,
      },
    );
    if (!res.ok) {
      return c.json(
        { ...errorEnvelope(`posthog upstream returned ${res.status}`), tiles: [] as PostHogTile[] },
        502,
      );
    }
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const json: { results?: unknown } = await res.json();
    const rows = Array.isArray(json.results) ? json.results : [];
    const firstRow = Array.isArray(rows[0]) ? (rows[0] as unknown[]) : [];
    const total = typeof firstRow[0] === 'number' ? firstRow[0] : 0;
    const tiles: PostHogTile[] = [{ id: 'events_24h', label: 'Events (24h)', value: total }];
    return c.json({ ...okEnvelope(), tiles });
  } catch (err) {
    const timedOut = (err as Error).name === 'AbortError';
    return c.json(
      { ...errorEnvelope((err as Error).message, timedOut), tiles: [] as PostHogTile[] },
      502,
    );
  } finally {
    clearTimeout(timer);
  }
});

function clamp(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}

interface MonitorSnapshot {
  ts: string;
  status: 'ok' | 'degraded';
  failed: Array<{ id: string; url?: string; latencyMs: number; error?: string }>;
  latencies: Record<string, number>;
  urls?: Record<string, string>;
}

/** Outage classification for journey probes. */
export type JourneyOutageClass = 'ok' | 'partial' | 'outage' | 'unknown';

interface JourneyProbe {
  id: string;
  ok: boolean;
  latencyMs: number;
  url?: string;
  error?: string;
}

interface JourneyTrendPoint {
  ts: string;
  status: 'ok' | 'degraded';
  journeyOk: number;
  journeyFailed: number;
}

const JOURNEY_PREFIX = 'slo.journey.';

function classifyOutage(probes: JourneyProbe[]): JourneyOutageClass {
  if (probes.length === 0) return 'unknown';
  const failedCount = probes.filter((p) => !p.ok).length;
  if (failedCount === 0) return 'ok';
  if (failedCount === probes.length) return 'outage';
  return 'partial';
}

function snapshotToJourneyProbes(snapshot: MonitorSnapshot): JourneyProbe[] {
  const failedMap = new Map(snapshot.failed.map((f) => [f.id, f]));
  return Object.entries(snapshot.latencies)
    .filter(([id]) => id.startsWith(JOURNEY_PREFIX))
    .map(([id, latencyMs]) => {
      const failed = failedMap.get(id);
      return {
        id,
        ok: !failed,
        latencyMs,
        url: snapshot.urls?.[id] ?? failed?.url,
        error: failed?.error,
      };
    });
}

observability.get('/synthetic/journey', async (c) => {
  const kv = c.env.MONITOR_KV;
  if (!kv) {
    return c.json({
      configured: false,
      note: 'MONITOR_KV binding not configured.',
      outageClass: 'unknown' as JourneyOutageClass,
      probes: [] as JourneyProbe[],
      trend: [] as JourneyTrendPoint[],
    });
  }

  const latestRaw = await kv.get('latest');
  if (!latestRaw) {
    return c.json({
      configured: true,
      note: 'No monitor snapshot found yet.',
      outageClass: 'unknown' as JourneyOutageClass,
      probes: [] as JourneyProbe[],
      trend: [] as JourneyTrendPoint[],
    });
  }

  const latest = JSON.parse(latestRaw) as MonitorSnapshot;
  const probes = snapshotToJourneyProbes(latest);
  const outageClass = classifyOutage(probes);

  // Fetch recent snapshots (up to 12) for trend display.
  // Keys are ISO timestamp strings (lexicographically sortable), so
  // sorting them descending gives the most-recent-first ordering.
  const list = await kv.list({ prefix: 'snapshots:', limit: 12 });
  const sortedKeys = list.keys.map((k) => k.name).sort().reverse();
  const trendRaws = await Promise.all(sortedKeys.map((k) => kv.get(k)));

  const trend: JourneyTrendPoint[] = trendRaws
    .filter((r): r is string => r !== null)
    .map((raw) => {
      const s = JSON.parse(raw) as MonitorSnapshot;
      const journeyIds = Object.keys(s.latencies).filter((id) => id.startsWith(JOURNEY_PREFIX));
      const journeyFailed = s.failed.filter((f) => f.id.startsWith(JOURNEY_PREFIX)).length;
      const journeyOk = Math.max(0, journeyIds.length - journeyFailed);
      return { ts: s.ts, status: s.status, journeyOk, journeyFailed };
    });

  return c.json({
    configured: true,
    checkedAt: latest.ts,
    outageClass,
    probes,
    trend,
  });
});

// ── Telemetry contract coverage (ADM-7) ─────────────────────────────────────

const TELEMETRY_ENDPOINTS = ['/api/admin/health', '/api/admin/metrics', '/api/admin/events'] as const;

interface EndpointResult {
  path: string;
  status: 'ok' | 'missing' | 'error' | 'skipped';
  httpStatus?: number;
  latencyMs?: number;
}

interface AppCoverageRow {
  id: string;
  label: string;
  endpoints: EndpointResult[];
}

/** Probe a single telemetry path with a 5-second timeout. */
async function probeEndpoint(baseUrl: string, path: string): Promise<EndpointResult> {
  const ct = new AbortController();
  const timer = setTimeout(() => ct.abort(), 5_000);
  const start = Date.now();
  try {
    const res = await fetch(`${baseUrl}${path}`, { signal: ct.signal });
    const latencyMs = Date.now() - start;
    if (res.status === 404) return { path, status: 'missing', httpStatus: 404, latencyMs };
    if (res.ok || res.status === 401 || res.status === 403) {
      return { path, status: 'ok', httpStatus: res.status, latencyMs };
    }
    return { path, status: 'error', httpStatus: res.status, latencyMs };
  } catch {
    return { path, status: 'error', latencyMs: Date.now() - start };
  } finally {
    clearTimeout(timer);
  }
}

observability.get('/telemetry-coverage', async (c) => {
  const env = (c.req.query('env') ?? c.var.envContext.env) as Environment;
  if (env === 'local') {
    return c.json({ env, apps: [] as AppCoverageRow[], note: 'Coverage checks not available for local environment.' });
  }

  const rows = await Promise.all(
    FACTORY_APPS.map(async (app): Promise<AppCoverageRow> => {
      const health = healthUrlFor(app, env);
      if (!health) {
        return {
          id: app.id,
          label: app.label,
          endpoints: TELEMETRY_ENDPOINTS.map((p) => ({ path: p, status: 'skipped' as const })),
        };
      }
      const base = health.replace(/\/health$/, '');
      const endpoints = await Promise.all(TELEMETRY_ENDPOINTS.map((p) => probeEndpoint(base, p)));
      return { id: app.id, label: app.label, endpoints };
    }),
  );

  return c.json({ env, apps: rows });
});


// ---------------------------------------------------------------------------
// ADM-2: PostHog funnel / KPI panel
// GET /observability/posthog/funnel?window=24h|7d|30d
// ---------------------------------------------------------------------------

type FunnelWindow = '24h' | '7d' | '30d';

interface KpiMetric {
  id: string;
  label: string;
  value: number;
  unit?: string;
  /** Positive = improving (or neutral for absolute counts). */
  trend?: number;
}

interface FunnelStep {
  step: string;
  label: string;
  count: number;
  dropoffPct: number;
}

interface PostHogFunnelResponse {
  window: FunnelWindow;
  kpis: KpiMetric[];
  funnel: FunnelStep[];
  /**
   * False when any of the five PostHog queries returned a non-ok response.
   * All-zero metrics are indistinguishable from genuine zero traffic — this flag
   * lets the UI surface a "data unavailable" state rather than showing zeroes.
   */
  dataAvailable: boolean;
  /** Populated when dataAvailable is false; explains which queries failed. */
  dataWarnings?: string[];
}

// Returns a literal SQL interval string for a known FunnelWindow enum value.
// All branches return compile-time string literals — no user input reaches this
// function directly (the caller enforces a strict allowlist before calling).
function funnelIntervalSql(window: FunnelWindow): string {
  switch (window) {
    case '7d':
      return '7 DAY';
    case '30d':
      return '30 DAY';
    default:
      return '24 HOUR';
  }
}

// Returns a literal SQL interval string for a known FunnelWindow enum value.
// Mirrors funnelIntervalSql: all branches are compile-time string literals.
// No user input reaches this function — caller enforces the allowlist first.
function prevFunnelIntervalSql(window: FunnelWindow): string {
  switch (window) {
    case '7d':
      return '14 DAY';
    case '30d':
      return '60 DAY';
    default:
      return '48 HOUR';
  }
}

/**
 * Run a HogQL query against PostHog and return the raw results array.
 * Returns null on error (caller decides how to degrade).
 */
async function hogql(
  host: string,
  key: string,
  projectId: string,
  query: string,
  signal: AbortSignal,
): Promise<unknown[][] | null> {
  const res = await fetch(`${host}/api/projects/${encodeURIComponent(projectId)}/query/`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: { kind: 'HogQLQuery', query } }),
    signal,
  });
  if (!res.ok) return null;
  const json: { results?: unknown } = await res.json();
  const rows = Array.isArray(json.results) ? (json.results as unknown[][]) : [];
  return rows;
}

function safeNum(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

observability.get('/posthog/funnel', async (c) => {
  const key = c.env.POSTHOG_API_KEY;
  const projectId = c.env.POSTHOG_PROJECT_ID;
  const host = c.env.POSTHOG_HOST ?? 'https://us.i.posthog.com';

  if (!key || !projectId) {
    return c.json({
      ...unconfiguredEnvelope('Set POSTHOG_API_KEY + POSTHOG_PROJECT_ID.'),
      window: '24h' as FunnelWindow,
      kpis: [] as KpiMetric[],
      funnel: [] as FunnelStep[],
    });
  }

  // `window` is user-controlled; the allowlist below is the ONLY gate before
  // it reaches HogQL. After this assignment, `window` is always one of the three
  // FunnelWindow literals — never a raw user string. funnelIntervalSql(window)
  // returns only compile-time constants ('24 HOUR', '7 DAY', '30 DAY'); no user
  // input reaches HogQL interpolation. No parameterized query API is needed here
  // because the interpolated value is ALWAYS a server-controlled literal.
  const rawWindow = c.req.query('window') ?? '24h';
  const window: FunnelWindow =
    rawWindow === '7d' || rawWindow === '30d' ? rawWindow : '24h';

  const interval = funnelIntervalSql(window);
  const prevInterval = prevFunnelIntervalSql(window);

  const ct = new AbortController();
  // 8 s leaves headroom within Cloudflare's 30 s CPU wall for multi-query fan-out.
  const timer = setTimeout(() => ct.abort(), 8_000);

  try {
    const [dauRows, prevDauRows, newUsersRows, churnRows, funnelRows] = await Promise.all([
      hogql(
        host, key, projectId,
        `SELECT uniq(distinct_id) AS users FROM events WHERE timestamp >= now() - INTERVAL ${interval}`,
        ct.signal,
      ),
      hogql(
        host, key, projectId,
        `SELECT uniq(distinct_id) AS users FROM events WHERE timestamp >= now() - INTERVAL ${prevInterval} AND timestamp < now() - INTERVAL ${interval}`,
        ct.signal,
      ),
      hogql(
        host, key, projectId,
        `SELECT count() FROM (SELECT distinct_id, min(timestamp) AS first_seen FROM events GROUP BY distinct_id HAVING first_seen >= now() - INTERVAL ${interval})`,
        ct.signal,
      ),
      hogql(
        host, key, projectId,
        `SELECT uniq(distinct_id) FROM events WHERE timestamp >= now() - INTERVAL ${prevInterval} AND timestamp < now() - INTERVAL ${interval} AND distinct_id NOT IN (SELECT distinct_id FROM events WHERE timestamp >= now() - INTERVAL ${interval})`,
        ct.signal,
      ),
      hogql(
        host, key, projectId,
        `SELECT countIf(event = '$pageview') AS pageviews, countIf(event = 'user_signed_up') AS signups, countIf(event = 'subscription_started') AS subscriptions, countIf(event = 'payment_completed') AS payments FROM events WHERE timestamp >= now() - INTERVAL ${interval}`,
        ct.signal,
      ),
    ]);

    // Track which queries returned null (non-ok PostHog response) so we can
    // surface dataAvailable=false instead of silently returning all-zero metrics.
    const queryResults = { dauRows, prevDauRows, newUsersRows, churnRows, funnelRows };
    const failedQueries = Object.entries(queryResults)
      .filter(([, v]) => v === null)
      .map(([k]) => k);
    const dataAvailable = failedQueries.length === 0;

    const dau = safeNum(dauRows?.[0]?.[0]);
    const prevDau = safeNum(prevDauRows?.[0]?.[0]);
    const dauTrend = prevDau > 0 ? Math.round(((dau - prevDau) / prevDau) * 100) : 0;
    const newUsers = safeNum(newUsersRows?.[0]?.[0]);
    const churned = safeNum(churnRows?.[0]?.[0]);

    const fRow = funnelRows?.[0] ?? [];
    const pageviews = safeNum(fRow[0]);
    const signups = safeNum(fRow[1]);
    const subscriptions = safeNum(fRow[2]);
    const payments = safeNum(fRow[3]);

    const kpis: KpiMetric[] = [
      { id: 'dau', label: window === '24h' ? 'DAU' : window === '7d' ? 'WAU' : 'MAU', value: dau, unit: 'users', trend: dauTrend },
      { id: 'new_users', label: 'New users', value: newUsers, unit: 'users' },
      { id: 'churned', label: 'Churned', value: churned, unit: 'users' },
    ];

    function dropoff(from: number, to: number): number {
      if (from === 0) return 0;
      return Math.round((1 - to / from) * 100);
    }

    const funnel: FunnelStep[] = [
      { step: 'pageview', label: 'Page views', count: pageviews, dropoffPct: 0 },
      { step: 'signup', label: 'Sign-ups', count: signups, dropoffPct: dropoff(pageviews, signups) },
      { step: 'subscription', label: 'Subscriptions', count: subscriptions, dropoffPct: dropoff(signups, subscriptions) },
      { step: 'payment', label: 'Payments', count: payments, dropoffPct: dropoff(subscriptions, payments) },
    ];

    const payload: PostHogFunnelResponse = {
      window,
      kpis,
      funnel,
      dataAvailable,
      ...(failedQueries.length > 0 && {
        dataWarnings: [`PostHog queries returned no data: ${failedQueries.join(', ')}. Metrics may be zero due to API unavailability, not genuine zero traffic.`],
      }),
    };
    return c.json({ ...okEnvelope(), ...payload });
  } catch (err) {
    const timedOut = (err as Error).name === 'AbortError';
    return c.json(
      {
        ...errorEnvelope((err as Error).message, timedOut),
        window,
        kpis: [] as KpiMetric[],
        funnel: [] as FunnelStep[],
      },
      502,
    );
  } finally {
    clearTimeout(timer);
  }
});

export default observability;
