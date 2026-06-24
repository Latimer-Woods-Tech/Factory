import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Env } from '../index';

// Capture what runAppSignals passes to embedAndUpsert (the record shape is the contract).
const embedAndUpsert = vi.fn(async (..._args: unknown[]) => true);
vi.mock('./vector.js', () => ({ embedAndUpsert: (...args: unknown[]) => embedAndUpsert(...args) }));

const { runAppSignals } = await import('./app-signals.js');

/** Minimal env exercising the fields runAppSignals reads. */
function makeEnv(over: Partial<Env> = {}): Env {
  return {
    AI: {} as unknown as Ai,
    VECTORIZE_MEMORY: {} as unknown as VectorizeIndex,
    SELFPRIME_API_URL: 'https://api.selfprime.test',
    SELFPRIME_AUDIT_TOKEN: 'audit-tok',
    ...over,
  } as unknown as Env;
}

/** Default healthy prod: all conformance probes pass, audit returns demand. */
function healthyFetch(statusByPath: Record<string, number> = {}) {
  const base: Record<string, number> = {
    '/health': 200,
    '/api/council/list': 200,
    '/api/billing/plans': 200,
    '/api/notifications': 401,
    '/api/experiments': 401,
    '/api/webhook/stripe': 400,
  };
  const map = { ...base, ...statusByPath };
  return vi.fn(async (url: string) => {
    if (url.includes('/api/analytics/audit')) {
      return { ok: true, status: 200, json: async () => ({
        signupComparison: { this_week: 7, last_week: 3 },
        activationStats: { activated_real: 4 },
        mrr: { totalActive: 2, breakdown: { practitioner: { count: 1 }, agency: { count: 1 } } },
      }) };
    }
    const path = Object.keys(map).find((p) => url.endsWith(p));
    const status = path ? (map[path] ?? 404) : 404;
    return { ok: status < 400, status, json: async () => ({}) };
  });
}

afterEach(() => { vi.clearAllMocks(); vi.unstubAllGlobals(); });

describe('runAppSignals', () => {
  it('embeds one record/app with full conformance + demand', async () => {
    vi.stubGlobal('fetch', healthyFetch());
    const res = await runAppSignals(makeEnv());
    expect(res).toEqual({ embedded: 1, skipped: 0, errors: 0 });
    expect(embedAndUpsert).toHaveBeenCalledOnce();
    const [, , id, text, meta] = embedAndUpsert.mock.calls[0] as unknown as [unknown, unknown, string, string, Record<string, unknown>];
    expect(id).toMatch(/^app-signals-selfprime-\d{4}-\d{2}-\d{2}$/);
    expect(meta.type).toBe('app-signals');
    expect(meta.source).toBe('selfprime');
    expect(meta.conformance_pass).toBe(6);
    expect(meta.conformance_total).toBe(6);
    expect(meta.conformance_failures).toBe(0);
    expect(meta.signups_this_week).toBe(7);
    expect(meta.paying_total).toBe(2);
    expect(text).toContain('all probed contracts healthy');
    expect(text).toContain('real signups this week 7');
  });

  it('records conformance failures in metadata + text (REFLECT-surfaceable)', async () => {
    // notifications returns 200 instead of the expected 401 → one failure.
    vi.stubGlobal('fetch', healthyFetch({ '/api/notifications': 200 }));
    const res = await runAppSignals(makeEnv());
    expect(res.embedded).toBe(1);
    const [, , , text, meta] = embedAndUpsert.mock.calls[0] as unknown as [unknown, unknown, string, string, Record<string, unknown>];
    expect(meta.conformance_pass).toBe(5);
    expect(meta.conformance_failures).toBe(1);
    expect(text).toContain('FAILURES (prod contract broken)');
    expect(text).toContain('notifications unauth->401 (got 200)');
  });

  it('still embeds (demand unavailable) when the audit token is absent', async () => {
    vi.stubGlobal('fetch', healthyFetch());
    const res = await runAppSignals(makeEnv({ SELFPRIME_AUDIT_TOKEN: undefined }));
    expect(res.embedded).toBe(1);
    const [, , , text, meta] = embedAndUpsert.mock.calls[0] as unknown as [unknown, unknown, string, string, Record<string, unknown>];
    expect(text).toContain('DEMAND: unavailable');
    expect(meta.signups_this_week).toBeUndefined();
  });

  it('no-ops when memory bindings are absent', async () => {
    vi.stubGlobal('fetch', healthyFetch());
    const res = await runAppSignals(makeEnv({ AI: undefined }));
    expect(res).toEqual({ embedded: 0, skipped: 0, errors: 0 });
    expect(embedAndUpsert).not.toHaveBeenCalled();
  });

  it('counts an error (best-effort) when the embed fails', async () => {
    vi.stubGlobal('fetch', healthyFetch());
    embedAndUpsert.mockResolvedValueOnce(false);
    const res = await runAppSignals(makeEnv());
    expect(res).toEqual({ embedded: 0, skipped: 0, errors: 1 });
  });

  it('never throws even if every fetch rejects', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('network down'); }));
    const res = await runAppSignals(makeEnv());
    // probes return status 0 (all fail), demand null → still embeds one record describing the outage.
    expect(res.errors + res.embedded).toBeGreaterThanOrEqual(1);
  });
});
