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
// HEAD-only helpers: sentryIssueUrl, hogqlQuery, calcTrend
// (used by ADM-3 /slo and ADM-5 /incidents)
// ---------------------------------------------------------------------------

/** Returns a deep-link URL to the Sentry issue detail page. */
function sentryIssueUrl(org: string, issueId: string): string {
  return `https://sentry.io/organizations/${encodeURIComponent(org)}/issues/${encodeURIComponent(issueId)}/`;
}

async function hogqlQuery(
  host: string,
  projectId: string,
  key: string,
  query: string,
): Promise<{ results?: Array<Array<number>> }> {
  const res = await fetch(
    `${host}/api/projects/${encodeURIComponent(projectId)}/query/`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query: { kind: 'HogQLQuery', query } }),
      signal: AbortSignal.timeout(8_000),
    },
  );
  if (!res.ok) throw new Error(`posthog-${res.status}`);
  return res.json<{ results?: Array<Array<number>> }>();
}

// ---------------------------------------------------------------------------
// ADM-3: SLO and error-budget burn panel
//
// Fuses Sentry error count with PostHog total events to compute:
//   - error_rate_pct (errors / total events * 100)
//   - availability_pct (100 - error_rate_pct)
//   - budget_used_pct (how much of the monthly 0.1% SLO has been consumed)
//   - burn_rate (budget_used_pct / days_elapsed * 30)
//   - slo_status: green / yellow / red
// ---------------------------------------------------------------------------

type SloStatus = 'green' | 'yellow' | 'red';

interface SloPanel {
  configured: boolean;
  degraded?: boolean;
  slo_status: SloStatus;
  availability_pct: number;
  error_rate_pct: number;
  /** 30-day rolling budget allowance: 0.1% of requests. */
  budget_allowance_pct: number;
  budget_used_pct: number;
  /** Annualised burn rate multiplier vs sustainable. >1 = burning faster than target. */
  burn_rate: number;
  period: '30d';
  note?: string;
}

const SLO_TARGET_AVAILABILITY = 99.9; // percent
const SLO_ERROR_BUDGET_PCT = 100 - SLO_TARGET_AVAILABILITY; // 0.1%
const PERIOD_DAYS = 30;

/**
 * GET /observability/slo
 *
 * Requires both Sentry and PostHog to be configured for full accuracy.
 * Falls back to Sentry-only mode (treats all Sentry issues as errors against
 * a synthetic event count of 1 000 000 / 30d).
 */
observability.get('/slo', async (c) => {
  const sentryToken = c.env.SENTRY_AUTH_TOKEN;
  const sentryOrg = c.env.SENTRY_ORG;
  const sentryProject = c.env.SENTRY_PROJECT;
  const posthogKey = c.env.POSTHOG_API_KEY;
  const posthogProject = c.env.POSTHOG_PROJECT_ID;
  const posthogHost = c.env.POSTHOG_HOST ?? 'https://us.i.posthog.com';

  const hasSentry = Boolean(sentryToken && sentryOrg && sentryProject);
  const hasPostHog = Boolean(posthogKey && posthogProject);

  if (!hasSentry && !hasPostHog) {
    return c.json({
      configured: false,
      note: 'Set SENTRY_AUTH_TOKEN + SENTRY_ORG + SENTRY_PROJECT (and optionally POSTHOG_API_KEY + POSTHOG_PROJECT_ID).',
      slo_status: 'green' as SloStatus,
      availability_pct: 100,
      error_rate_pct: 0,
      budget_allowance_pct: SLO_ERROR_BUDGET_PCT,
      budget_used_pct: 0,
      burn_rate: 0,
      period: '30d' as const,
    } satisfies SloPanel);
  }

  let errorCount = 0;
  let totalEvents = 0;
  let degraded = false;

  // Fetch Sentry error count over 30d
  if (hasSentry) {
    try {
      const sentryRes = await fetch(
        `https://sentry.io/api/0/projects/${encodeURIComponent(sentryOrg!)}/${encodeURIComponent(sentryProject!)}/stats/?stat=received&resolution=1d&since=${Math.floor(Date.now() / 1000 - PERIOD_DAYS * 86400)}`,
        { headers: { Authorization: `Bearer ${sentryToken}` }, signal: AbortSignal.timeout(8_000) },
      );
      if (sentryRes.ok) {
        const statsData: Array<[number, number]> = await sentryRes.json();
        errorCount = statsData.reduce((sum, [, count]) => sum + count, 0);
      } else {
        degraded = true;
      }
    } catch {
      degraded = true;
    }
  }

  // Fetch PostHog total event count over 30d
  if (hasPostHog) {
    try {
      const phRes = await hogqlQuery(
        posthogHost, posthogProject!, posthogKey!,
        `SELECT count() AS total FROM events WHERE timestamp >= now() - INTERVAL 30 DAY`,
      );
      totalEvents = phRes.results?.[0]?.[0] ?? 0;
    } catch {
      degraded = true;
    }
  }

  // Fallback: use a synthetic baseline of 1 M events/month (≈33k/day, a
  // conservative floor for a small SaaS) so the error-rate math stays
  // meaningful when PostHog is unconfigured or unavailable.
  if (totalEvents === 0 && errorCount > 0) {
    totalEvents = 1_000_000;
  } else if (totalEvents === 0) {
    totalEvents = 1; // avoid division by zero
  }

  const error_rate_pct = Math.min((errorCount / totalEvents) * 100, 100);
  const availability_pct = Math.round((100 - error_rate_pct) * 10000) / 10000;
  const budget_used_pct = Math.min((error_rate_pct / SLO_ERROR_BUDGET_PCT) * 100, 100);

  // Burn rate: fraction of error budget consumed relative to a full 30-day
  // period. Formula: (budget_fraction) * (30 / elapsed_days). Since we use
  // a rolling 30d window, elapsed_days == PERIOD_DAYS, so burn_rate ==
  // budget_used_pct / 100. A value > 1 means exhausting the budget faster
  // than the 30-day replenishment cadence.
  const burn_rate = Math.round((budget_used_pct / 100) * (30 / PERIOD_DAYS) * 100) / 100;

  let slo_status: SloStatus;
  if (availability_pct < SLO_TARGET_AVAILABILITY) slo_status = 'red';
  else if (budget_used_pct > 50) slo_status = 'yellow';
  else slo_status = 'green';

  return c.json({
    configured: true,
    degraded,
    slo_status,
    availability_pct,
    error_rate_pct: Math.round(error_rate_pct * 10000) / 10000,
    budget_allowance_pct: SLO_ERROR_BUDGET_PCT,
    budget_used_pct: Math.round(budget_used_pct * 100) / 100,
    burn_rate,
    period: '30d',
    ...(degraded ? { note: 'One or more upstream sources returned errors; values are partial.' } : {}),
  } satisfies SloPanel);
});

// ---------------------------------------------------------------------------
//
// GET /observability/incidents
//   Returns a unified, chronological list of Sentry incidents and operator
//   actions correlated by env, time range, and request ID.
// ---------------------------------------------------------------------------

type IncidentKind = 'sentry' | 'audit' | 'synthetic';

interface IncidentEvent {
  id: string;
  kind: IncidentKind;
  /** ISO 8601 */
  occurredAt: string;
  title: string;
  severity: 'fatal' | 'error' | 'warning' | 'info' | 'unknown';
  env: string;
  /** Sentry permalink, deploy URL, or audit resource */
  sourceUrl?: string;
  /** X-Request-Id that links HTTP traces to this incident */
  requestId?: string;
  actor?: string;
  detail?: Record<string, unknown>;
}

observability.get('/incidents', async (c) => {
  const qs = new URL(c.req.url).searchParams;
  const env = qs.get('env') ?? c.var.envContext.env;
  const from = qs.get('from');
  const to = qs.get('to');
  const limit = clamp(Number.parseInt(qs.get('limit') ?? '50', 10), 1, 200);

  const events: IncidentEvent[] = [];

  // --- Sentry issues (ADM-1 fusion) ---
  const sentryToken = c.env.SENTRY_AUTH_TOKEN;
  const sentryOrg = c.env.SENTRY_ORG;
  const sentryProject = c.env.SENTRY_PROJECT;
  if (sentryToken && sentryOrg && sentryProject) {
    try {
      const period = from ? '' : '&statsPeriod=7d';
      const dateRange = from
        ? `&start=${encodeURIComponent(from)}${to ? `&end=${encodeURIComponent(to)}` : ''}`
        : '';
      const res = await fetch(
        `https://sentry.io/api/0/projects/${encodeURIComponent(sentryOrg)}/${encodeURIComponent(sentryProject)}/issues/` +
          `?limit=25&environment=${encodeURIComponent(env)}${period}${dateRange}&query=is:unresolved`,
        { headers: { Authorization: `Bearer ${sentryToken}` }, signal: AbortSignal.timeout(8_000) },
      );
      if (res.ok) {
        const raw: Array<Record<string, unknown>> = await res.json();
        for (const item of raw) {
          const level = typeof item['level'] === 'string' ? item['level'] : 'error';
          events.push({
            id: `sentry:${String(item['id'] ?? '')}`,
            kind: 'sentry',
            occurredAt: String(item['lastSeen'] ?? new Date().toISOString()),
            title: String(item['title'] ?? 'Sentry issue'),
            severity: (level === 'fatal' || level === 'error' || level === 'warning' || level === 'info')
              ? level
              : 'unknown',
            env,
            sourceUrl: sentryIssueUrl(sentryOrg, String(item['id'] ?? '')),
            detail: {
              count: item['count'],
              userCount: item['userCount'],
              firstSeen: item['firstSeen'],
            },
          });
        }
      }
    } catch {
      // Best-effort: skip if Sentry is down
    }
  }

  // Merge and sort newest-first, trim to limit
  events.sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
  const page = events.slice(0, limit);

  return c.json({
    env,
    total: events.length,
    returned: page.length,
    ...(from ? { from } : {}),
    ...(to ? { to } : {}),
    events: page,
  });
});

export default observability;
