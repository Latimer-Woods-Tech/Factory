/**
 * RFC-008 — APP SIGNALS (cross-app daily ingest)
 *
 * Feeds the `factory-memory` Vectorize index with one daily record per Latimer-Woods
 * app, so REFLECT can correlate the existing Factory PR/issue stream with each app's
 * live prod reality (conformance) and business outcome (demand). The synergy: the brain
 * already sees dev effort — this lets it connect dev → deploy → conformance → demand.
 *
 * Design (per plan v2): the brain holds NO app-internal secrets. It pulls each app's
 * own endpoints. Phase 1 reuses selfprime's existing surfaces:
 *   - conformance: a few UNAUTH contract probes (health/public/401/400) — no creds, no mutation
 *   - demand:      GET /api/analytics/audit (one X-Audit-Token; skipped if absent)
 * Phase 2 (when an app ships GET /api/signals/daily) replaces both with a single signed pull.
 *
 * One record/app/day, stable id `app-signals-{app}-YYYY-MM-DD` → idempotent upsert.
 * Trends come from the index over time + REFLECT's 24h/7d windows — no hand-computed deltas.
 * Never throws: a per-app failure only reduces the tally.
 */

import type { Env } from '../index.js';
import { embedAndUpsert } from './vector.js';

const UA = 'factory-supervisor/app-signals';
const FETCH_TIMEOUT_MS = 10_000;

interface AppSignalsResult {
  embedded: number;
  skipped: number;
  errors: number;
}

interface AppConfig {
  app: string;
  baseUrl: string;
  /** X-Audit-Token for the app's analytics audit endpoint (demand). Optional — demand skipped if absent. */
  auditToken?: string;
}

/** App registry. Phase 1: selfprime only. Adding capricast/admin-studio later = one more row. */
function registry(env: Env): AppConfig[] {
  return [
    {
      app: 'selfprime',
      baseUrl: env.SELFPRIME_API_URL ?? 'https://api.selfprime.net',
      auditToken: env.SELFPRIME_AUDIT_TOKEN,
    },
  ];
}

/** HTTP status of a probe — returns 0 on any network error (timeout/DNS). */
async function probeStatus(method: string, url: string, body?: string): Promise<number> {
  try {
    const res = await fetch(url, {
      method,
      headers: { 'User-Agent': UA, ...(body !== undefined ? { 'content-type': 'application/json' } : {}) },
      body,
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    return res.status;
  } catch {
    return 0;
  }
}

/** JSON GET — returns null on any error. */
async function fetchJson<T>(url: string, headers: Record<string, string>): Promise<T | null> {
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA, ...headers }, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

/**
 * UNAUTH contract conformance probe — no creds, no mutation. Each check is a
 * (label, method, path, predicate) over the prod status code. Mirrors the highest-value
 * checks from selfprime's live-eb-smoke (the §6 Stark lens), restricted to unauthenticated
 * routes so the brain never needs the app's credentials.
 */
async function probeConformance(baseUrl: string): Promise<{ pass: number; total: number; failures: string[] }> {
  const checks: Array<[string, string, string, (s: number) => boolean, string?]> = [
    ['health->200', 'GET', '/health', (s) => s === 200],
    ['council/list public->200', 'GET', '/api/council/list', (s) => s === 200],
    ['billing/plans public->200', 'GET', '/api/billing/plans', (s) => s === 200],
    ['notifications unauth->401', 'GET', '/api/notifications', (s) => s === 401],
    ['experiments unauth->401', 'GET', '/api/experiments', (s) => s === 401],
    ['stripe-webhook no-sig->400', 'POST', '/api/webhook/stripe', (s) => s === 400, '{}'],
  ];
  let pass = 0;
  const failures: string[] = [];
  for (const [label, method, path, ok, body] of checks) {
    const status = await probeStatus(method, baseUrl + path, body);
    if (ok(status)) pass += 1;
    else failures.push(`${label} (got ${status})`);
  }
  return { pass, total: checks.length, failures };
}

interface DemandSummary {
  signupsThisWeek?: number;
  signupsLastWeek?: number;
  activatedReal?: number;
  payingTotal?: number;
}

/** Pull demand/conversion from the app's existing audit endpoint (one token). Null if no token or unreachable. */
async function fetchDemand(baseUrl: string, auditToken?: string): Promise<DemandSummary | null> {
  if (!auditToken) return null;
  // /api/analytics/audit mirrors /api/admin/analytics: { signupComparison, activationStats, mrr, ... }
  const data = await fetchJson<{
    signupComparison?: { this_week?: number; last_week?: number };
    activationStats?: { activated?: number; activated_real?: number };
    mrr?: { totalActive?: number; total_active?: number; breakdown?: Record<string, { count?: number }> };
  }>(`${baseUrl}/api/analytics/audit`, { 'X-Audit-Token': auditToken });
  if (!data) return null;
  const paying = data.mrr?.totalActive ?? data.mrr?.total_active
    ?? Object.values(data.mrr?.breakdown ?? {}).reduce((n, b) => n + (b?.count ?? 0), 0);
  return {
    signupsThisWeek: data.signupComparison?.this_week,
    signupsLastWeek: data.signupComparison?.last_week,
    activatedReal: data.activationStats?.activated_real ?? data.activationStats?.activated,
    payingTotal: paying,
  };
}

/** Build the embeddable text. Phrased so REFLECT's theme probes surface failures (risk) + demand (opportunity). */
function buildText(app: string, date: string, conf: { pass: number; total: number; failures: string[] }, demand: DemandSummary | null): string {
  const lines = [`${app} daily signals — ${date}`];
  if (conf.failures.length) {
    lines.push(`CONFORMANCE: ${conf.pass}/${conf.total} pass — FAILURES (prod contract broken): ${conf.failures.join('; ')}`);
  } else {
    lines.push(`CONFORMANCE: ${conf.pass}/${conf.total} pass — all probed contracts healthy.`);
  }
  if (demand) {
    lines.push(
      `DEMAND: real signups this week ${demand.signupsThisWeek ?? '?'} (prev ${demand.signupsLastWeek ?? '?'}), `
      + `activated ${demand.activatedReal ?? '?'}, paying subscribers ${demand.payingTotal ?? '?'}. `
      + 'Fake-door card captures: not yet wired (phase 2, needs the app signed endpoint).',
    );
  } else {
    lines.push('DEMAND: unavailable this run (audit token absent or endpoint unreachable).');
  }
  return lines.join('\n');
}

/**
 * Pulls each registered app's signals and embeds one record/app/day into factory-memory.
 * Safe to call from the scheduled handler — never throws.
 */
export async function runAppSignals(env: Env): Promise<AppSignalsResult> {
  const result: AppSignalsResult = { embedded: 0, skipped: 0, errors: 0 };
  if (!env.AI || !env.VECTORIZE_MEMORY) return result; // bindings absent in local dev

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- VectorizeVectorMetadata vs Record mismatch; resolved once llm pkg exports typed embed()
  const index = env.VECTORIZE_MEMORY as any;
  const date = new Date(Date.now()).toISOString().slice(0, 10); // YYYY-MM-DD

  for (const cfg of registry(env)) {
    try {
      const conf = await probeConformance(cfg.baseUrl);
      const demand = await fetchDemand(cfg.baseUrl, cfg.auditToken);
      const text = buildText(cfg.app, date, conf, demand);
      const title = `${cfg.app} ${date}: conformance ${conf.pass}/${conf.total}`
        + (demand ? `, signups ${demand.signupsThisWeek ?? '?'}, paying ${demand.payingTotal ?? '?'}` : '');
      const ok = await embedAndUpsert(
        env.AI,
        index,
        `app-signals-${cfg.app}-${date}`,
        text,
        {
          type: 'app-signals',
          source: cfg.app,
          app: cfg.app,
          title: title.slice(0, 100),
          occurred_at: Date.now(),
          conformance_pass: conf.pass,
          conformance_total: conf.total,
          conformance_failures: conf.failures.length,
          ...(demand
            ? {
              signups_this_week: demand.signupsThisWeek ?? -1,
              signups_last_week: demand.signupsLastWeek ?? -1,
              activated_real: demand.activatedReal ?? -1,
              paying_total: demand.payingTotal ?? -1,
            }
            : {}),
        },
      );
      if (ok) result.embedded += 1; else result.errors += 1;
    } catch {
      result.errors += 1;
    }
  }

  return result;
}
