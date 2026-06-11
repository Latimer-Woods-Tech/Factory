import { beforeAll, describe, expect, it, vi } from 'vitest';
import worker from '../index.js';
import type { Env } from '../env.js';

// ---------------------------------------------------------------------------
// Test setup — get a JWT token via the auth login flow
// ---------------------------------------------------------------------------

const TEST_PASSWORD = 'observability-test-password';
const TEST_EMAIL = 'ops@test.example';
let passwordHash = '';
let authToken = '';

const BASE_ENV: Env = {
  STUDIO_ENV: 'staging',
  ALLOWED_ORIGINS: 'https://studio.test',
  DB: { connectionString: 'postgres://test' } as Env['DB'],
  JWT_SECRET: 'test-jwt-secret-observability-test',
  STUDIO_ADMIN_EMAIL: TEST_EMAIL,
  STUDIO_ADMIN_PASSWORD_SHA256: '', // set in beforeAll
  GITHUB_TOKEN: 'github-token',
  ANTHROPIC_API_KEY: 'anthropic-key',
};

beforeAll(async () => {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(TEST_PASSWORD));
  passwordHash = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');

  const env: Env = { ...BASE_ENV, STUDIO_ADMIN_PASSWORD_SHA256: passwordHash };
  const loginRes = await worker.fetch(
    new Request('https://studio.test/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: TEST_EMAIL, password: TEST_PASSWORD, env: 'staging', app: 'factory' }),
    }),
    env,
  );
  const body = await loginRes.json<{ token?: string }>();
  authToken = body.token ?? '';
});

function buildEnv(overrides: Partial<Env> = {}): Env {
  return { ...BASE_ENV, STUDIO_ADMIN_PASSWORD_SHA256: passwordHash, ...overrides };
}

function authedRequest(path: string): Request {
  return new Request(`https://studio.test${path}`, {
    headers: { Authorization: `Bearer ${authToken}` },
  });
}

/**
 * Minimal in-memory KVNamespace mock for journey endpoint test isolation.
 */
function makeKVMock(store: Record<string, string> = {}): KVNamespace {
  const data = { ...store };
  return {
    get(key: string) {
      return Promise.resolve(data[key] ?? null);
    },
    put(key: string, value: string) {
      data[key] = value;
      return Promise.resolve();
    },
    delete(key: string) {
      delete data[key];
      return Promise.resolve();
    },
    list({ prefix = '', limit = 1000 }: { prefix?: string; limit?: number } = {}) {
      const keys = Object.keys(data)
        .filter((k) => k.startsWith(prefix))
        .slice(0, limit)
        .map((name) => ({ name, expiration: undefined, metadata: null }));
      return Promise.resolve({ keys, list_complete: true, cursor: '' });
    },
    getWithMetadata: () => Promise.resolve({ value: null, metadata: null }),
  } as unknown as KVNamespace;
}

// ---------------------------------------------------------------------------
// Journey probe tests
// ---------------------------------------------------------------------------

describe('GET /observability/synthetic/journey', () => {
  it('returns configured:false when MONITOR_KV is not bound', async () => {
    const res = await worker.fetch(
      authedRequest('/observability/synthetic/journey'),
      buildEnv(),
    );

    expect(res.status).toBe(200);
    const body = await res.json<{ configured: boolean; outageClass: string }>();
    expect(body.configured).toBe(false);
    expect(body.outageClass).toBe('unknown');
  });

  it('returns configured:true with unknown outageClass when no snapshot exists', async () => {
    const kv = makeKVMock({});
    const res = await worker.fetch(
      authedRequest('/observability/synthetic/journey'),
      buildEnv({ MONITOR_KV: kv }),
    );

    expect(res.status).toBe(200);
    const body = await res.json<{ configured: boolean; outageClass: string; probes: unknown[] }>();
    expect(body.configured).toBe(true);
    expect(body.outageClass).toBe('unknown');
    expect(body.probes).toHaveLength(0);
  });

  it('classifies outageClass:ok when all journey probes pass', async () => {
    const snapshot = buildSnapshot({ allPassing: true });
    const kv = makeKVMock({ latest: JSON.stringify(snapshot) });

    const res = await worker.fetch(
      authedRequest('/observability/synthetic/journey'),
      buildEnv({ MONITOR_KV: kv }),
    );

    expect(res.status).toBe(200);
    const body = await res.json<{
      configured: boolean;
      outageClass: string;
      probes: Array<{ id: string; ok: boolean; latencyMs: number }>;
      trend: unknown[];
    }>();
    expect(body.configured).toBe(true);
    expect(body.outageClass).toBe('ok');
    expect(body.probes.length).toBeGreaterThan(0);
    expect(body.probes.every((p) => p.ok)).toBe(true);
    expect(body.trend).toHaveLength(0);
  });

  it('classifies outageClass:partial when some journey probes fail', async () => {
    const snapshot = buildSnapshot({ failIds: ['slo.journey.auth-api'] });
    const kv = makeKVMock({ latest: JSON.stringify(snapshot) });

    const res = await worker.fetch(
      authedRequest('/observability/synthetic/journey'),
      buildEnv({ MONITOR_KV: kv }),
    );

    const body = await res.json<{
      outageClass: string;
      probes: Array<{ id: string; ok: boolean; error?: string; url?: string }>;
    }>();
    expect(body.outageClass).toBe('partial');
    const failed = body.probes.filter((p) => !p.ok);
    expect(failed.length).toBe(1);
    expect(failed[0]?.id).toBe('slo.journey.auth-api');
    expect(failed[0]?.error).toBe('Unexpected status 500 (expected 200)');
    expect(failed[0]?.url).toBe('https://api.selfprime.net/health');
  });

  it('classifies outageClass:outage when all journey probes fail', async () => {
    const allJourneyIds = [
      'slo.journey.render-ingest',
      'slo.journey.video-dispatch',
      'slo.journey.auth-api',
      'slo.journey.operator-plane',
      'slo.journey.webhook',
    ];
    const snapshot = buildSnapshot({ failIds: allJourneyIds });
    const kv = makeKVMock({ latest: JSON.stringify(snapshot) });

    const res = await worker.fetch(
      authedRequest('/observability/synthetic/journey'),
      buildEnv({ MONITOR_KV: kv }),
    );

    const body = await res.json<{ outageClass: string }>();
    expect(body.outageClass).toBe('outage');
  });

  it('returns trend points from recent KV snapshots', async () => {
    const snapshot1 = buildSnapshot({ allPassing: true, ts: '2025-01-01T00:00:00.000Z' });
    const snapshot2 = buildSnapshot({
      failIds: ['slo.journey.auth-api'],
      ts: '2025-01-01T00:05:00.000Z',
    });
    const kv = makeKVMock({
      latest: JSON.stringify(snapshot2),
      'snapshots:2025-01-01T00:00:00.000Z': JSON.stringify(snapshot1),
      'snapshots:2025-01-01T00:05:00.000Z': JSON.stringify(snapshot2),
    });

    const res = await worker.fetch(
      authedRequest('/observability/synthetic/journey'),
      buildEnv({ MONITOR_KV: kv }),
    );

    const body = await res.json<{
      trend: Array<{ ts: string; journeyOk: number; journeyFailed: number }>;
    }>();
    expect(body.trend).toHaveLength(2);
    const passRun = body.trend.find((t) => t.ts === '2025-01-01T00:00:00.000Z');
    const failRun = body.trend.find((t) => t.ts === '2025-01-01T00:05:00.000Z');
    expect(passRun?.journeyFailed).toBe(0);
    expect(failRun?.journeyFailed).toBe(1);
  });

  it('returns 401 when request is unauthenticated', async () => {
    const res = await worker.fetch(
      new Request('https://studio.test/observability/synthetic/journey'),
      buildEnv(),
    );

    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// Degraded-state envelope tests (FRH-09)
// ---------------------------------------------------------------------------

describe('observability degraded-state semantics (FRH-09)', () => {
  describe('GET /observability/sentry/issues', () => {
    it('returns degraded+unconfigured when Sentry secrets are absent', async () => {
      const res = await worker.fetch(
        authedRequest('/observability/sentry/issues'),
        buildEnv({ SENTRY_AUTH_TOKEN: undefined, SENTRY_ORG: undefined, SENTRY_PROJECT: undefined }),
      );

      expect(res.status).toBe(200);
      const body = await res.json<Record<string, unknown>>();
      expect(body.degraded).toBe(true);
      expect(body.providerStatus).toBe('unconfigured');
      expect(body.retryable).toBe(false);
      expect(body.issues).toEqual([]);
    });

    it('returns degraded+error when Sentry API returns non-OK', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('Unauthorized', { status: 401 })));

      const res = await worker.fetch(
        authedRequest('/observability/sentry/issues'),
        buildEnv({ SENTRY_AUTH_TOKEN: 'token', SENTRY_ORG: 'org', SENTRY_PROJECT: 'project' }),
      );

      expect(res.status).toBe(502);
      const body = await res.json<Record<string, unknown>>();
      expect(body.degraded).toBe(true);
      expect(body.providerStatus).toBe('error');
      expect(body.retryable).toBe(true);
      expect(body.issues).toEqual([]);
    });

    it('returns degraded+timeout when Sentry fetch aborts', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new DOMException('Aborted', 'AbortError')));

      const res = await worker.fetch(
        authedRequest('/observability/sentry/issues'),
        buildEnv({ SENTRY_AUTH_TOKEN: 'token', SENTRY_ORG: 'org', SENTRY_PROJECT: 'project' }),
      );

      expect(res.status).toBe(502);
      const body = await res.json<Record<string, unknown>>();
      expect(body.degraded).toBe(true);
      expect(body.providerStatus).toBe('timeout');
      expect(body.retryable).toBe(true);
    });

    it('returns ok+non-degraded when Sentry returns issues', async () => {
      const issues = [{ id: '1', title: 'Test error', level: 'error', count: '5', userCount: 2, firstSeen: '', lastSeen: '', permalink: '' }];
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
        new Response(JSON.stringify(issues), { status: 200, headers: { 'content-type': 'application/json' } }),
      ));

      const res = await worker.fetch(
        authedRequest('/observability/sentry/issues'),
        buildEnv({ SENTRY_AUTH_TOKEN: 'token', SENTRY_ORG: 'org', SENTRY_PROJECT: 'project' }),
      );

      expect(res.status).toBe(200);
      const body = await res.json<Record<string, unknown>>();
      expect(body.degraded).toBe(false);
      expect(body.providerStatus).toBe('ok');
      expect(body.retryable).toBe(false);
      expect(Array.isArray(body.issues)).toBe(true);
    });

    it('returns ok+non-degraded with empty array when Sentry has zero issues', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
        new Response(JSON.stringify([]), { status: 200, headers: { 'content-type': 'application/json' } }),
      ));

      const res = await worker.fetch(
        authedRequest('/observability/sentry/issues'),
        buildEnv({ SENTRY_AUTH_TOKEN: 'token', SENTRY_ORG: 'org', SENTRY_PROJECT: 'project' }),
      );

      expect(res.status).toBe(200);
      const body = await res.json<Record<string, unknown>>();
      expect(body.degraded).toBe(false); // zero issues is valid data, NOT degraded
      expect(body.providerStatus).toBe('ok');
      expect(body.issues).toEqual([]);
    });
  });

  describe('GET /observability/posthog/tiles', () => {
    it('returns degraded+unconfigured when PostHog secrets are absent', async () => {
      const res = await worker.fetch(
        authedRequest('/observability/posthog/tiles'),
        buildEnv({ POSTHOG_API_KEY: undefined, POSTHOG_PROJECT_ID: undefined }),
      );

      expect(res.status).toBe(200);
      const body = await res.json<Record<string, unknown>>();
      expect(body.degraded).toBe(true);
      expect(body.providerStatus).toBe('unconfigured');
      expect(body.retryable).toBe(false);
      expect(body.tiles).toEqual([]);
    });

    it('returns degraded+error when PostHog API returns non-OK', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('Forbidden', { status: 403 })));

      const res = await worker.fetch(
        authedRequest('/observability/posthog/tiles'),
        buildEnv({ POSTHOG_API_KEY: 'phc_key', POSTHOG_PROJECT_ID: '12345' }),
      );

      expect(res.status).toBe(502);
      const body = await res.json<Record<string, unknown>>();
      expect(body.degraded).toBe(true);
      expect(body.providerStatus).toBe('error');
      expect(body.retryable).toBe(true);
      expect(body.tiles).toEqual([]);
    });

    it('returns degraded+timeout when PostHog fetch aborts', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new DOMException('Aborted', 'AbortError')));

      const res = await worker.fetch(
        authedRequest('/observability/posthog/tiles'),
        buildEnv({ POSTHOG_API_KEY: 'phc_key', POSTHOG_PROJECT_ID: '12345' }),
      );

      expect(res.status).toBe(502);
      const body = await res.json<Record<string, unknown>>();
      expect(body.degraded).toBe(true);
      expect(body.providerStatus).toBe('timeout');
      expect(body.retryable).toBe(true);
    });

    it('returns ok+non-degraded with event count tile when PostHog succeeds', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ results: [[42]] }), { status: 200, headers: { 'content-type': 'application/json' } }),
      ));

      const res = await worker.fetch(
        authedRequest('/observability/posthog/tiles'),
        buildEnv({ POSTHOG_API_KEY: 'phc_key', POSTHOG_PROJECT_ID: '12345' }),
      );

      expect(res.status).toBe(200);
      const body = await res.json<Record<string, unknown>>();
      expect(body.degraded).toBe(false);
      expect(body.providerStatus).toBe('ok');
      expect(body.retryable).toBe(false);
      const tiles = body.tiles as Array<{ id: string; value: number }>;
      expect(tiles[0]?.id).toBe('events_24h');
      expect(tiles[0]?.value).toBe(42);
    });
  });
});

// ---------------------------------------------------------------------------
// Journey test helpers
// ---------------------------------------------------------------------------

const JOURNEY_PROBE_URLS: Record<string, string> = {
  'slo.journey.render-ingest': 'https://schedule-worker.adrper79.workers.dev/health',
  'slo.journey.video-dispatch': 'https://video-cron.adrper79.workers.dev/health',
  'slo.journey.auth-api': 'https://api.selfprime.net/health',
  'slo.journey.operator-plane': 'https://admin-studio-staging.adrper79.workers.dev/health',
  'slo.journey.webhook': 'https://schedule-worker.adrper79.workers.dev/stripe/health',
};

function buildSnapshot({
  allPassing = false,
  failIds = [] as string[],
  ts = '2025-01-01T12:00:00.000Z',
} = {}): object {
  const allIds = Object.keys(JOURNEY_PROBE_URLS);
  const latencies = Object.fromEntries(allIds.map((id) => [id, 42]));
  const urls = { ...JOURNEY_PROBE_URLS };
  const effectiveFailIds = allPassing ? [] : failIds;
  const failed = effectiveFailIds.map((id) => ({
    id,
    url: JOURNEY_PROBE_URLS[id],
    latencyMs: 123,
    error: 'Unexpected status 500 (expected 200)',
  }));
  return {
    ts,
    status: effectiveFailIds.length === 0 ? 'ok' : 'degraded',
    failed,
    latencies,
    urls,
  };
}
