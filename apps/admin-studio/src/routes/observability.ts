/**
 * Read-only proxies into Sentry + PostHog so the Studio can render
 * recent-error and metrics tiles without exposing API tokens to the browser.
 *
 * Both endpoints are tolerant of missing config: if secrets aren't set
 * they return `{ configured: false }` instead of 500. This lets us ship
 * the UI before the secret rotation is finished.
 *
 * Phase C will add SSE streaming for live error tails.
 */
import { Hono } from 'hono';
import type { AppEnv } from '../types.js';
import { FACTORY_APPS, healthUrlFor } from '../lib/app-registry.js';
import type { Environment } from '@latimer-woods-tech/studio-core';

const observability = new Hono<AppEnv>();

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

observability.get('/sentry/issues', async (c) => {
  const token = c.env.SENTRY_AUTH_TOKEN;
  const org = c.env.SENTRY_ORG;
  const project = c.env.SENTRY_PROJECT;
  if (!token || !org || !project) {
    return c.json({
      configured: false,
      note: 'Set SENTRY_AUTH_TOKEN, SENTRY_ORG, SENTRY_PROJECT.',
      issues: [] as SentryIssue[],
    });
  }

  const url = new URL(c.req.url);
  const limit = clamp(Number.parseInt(url.searchParams.get('limit') ?? '20', 10), 1, 100);
  const env = url.searchParams.get('env') ?? c.var.envContext.env;

  const sentryCt = new AbortController();
  const sentryTimer = setTimeout(() => sentryCt.abort(), 8_000);
  try {
    const res = await fetch(
      `https://sentry.io/api/0/projects/${encodeURIComponent(org)}/${encodeURIComponent(project)}/issues/?limit=${limit}&environment=${encodeURIComponent(env)}&statsPeriod=24h&query=is:unresolved`,
      { headers: { Authorization: `Bearer ${token}` }, signal: sentryCt.signal },
    );
    if (!res.ok) {
      return c.json({ configured: true, error: `sentry-${res.status}`, issues: [] }, 502);
    }
    const issues: SentryIssue[] = await res.json();
    return c.json({ configured: true, env, issues });
  } catch (err) {
    return c.json({ configured: true, error: (err as Error).message, issues: [] }, 502);
  } finally {
    clearTimeout(sentryTimer);
  }
});

interface PostHogTile {
  id: string;
  label: string;
  value: number;
  unit?: string;
}

observability.get('/posthog/tiles', async (c) => {
  const key = c.env.POSTHOG_API_KEY;
  const projectId = c.env.POSTHOG_PROJECT_ID;
  const host = c.env.POSTHOG_HOST ?? 'https://us.i.posthog.com';
  if (!key || !projectId) {
    return c.json({
      configured: false,
      note: 'Set POSTHOG_API_KEY + POSTHOG_PROJECT_ID.',
      tiles: [] as PostHogTile[],
    });
  }

  // Minimal viable tile: total events in last 24h via the Insights API.
  // Richer tiles (DAU, retention, conversion) land in Phase C.
  const phCt = new AbortController();
  const phTimer = setTimeout(() => phCt.abort(), 8_000);
  try {
    const res = await fetch(
      `${host}/api/projects/${encodeURIComponent(projectId)}/query/`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: {
            kind: 'HogQLQuery',
            query: `SELECT count() AS total FROM events WHERE timestamp >= now() - INTERVAL 24 HOUR`,
          },
        }),
        signal: phCt.signal,
      },
    );
    if (!res.ok) {
      return c.json({ configured: true, error: `posthog-${res.status}`, tiles: [] }, 502);
    }
    const json: { results?: unknown } = await res.json();
    const rows = Array.isArray(json.results) ? json.results : [];
    const firstRow = Array.isArray(rows[0]) ? (rows[0] as unknown[]) : [];
    const total = typeof firstRow[0] === 'number' ? firstRow[0] : 0;
    const tiles: PostHogTile[] = [
      { id: 'events_24h', label: 'Events (24h)', value: total },
    ];
    return c.json({ configured: true, tiles });
  } catch (err) {
    return c.json({ configured: true, error: (err as Error).message, tiles: [] }, 502);
  } finally {
    clearTimeout(phTimer);
  }
});

function clamp(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}

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
      // 401/403 means the endpoint exists but requires auth — counts as present
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

export default observability;
