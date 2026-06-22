import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import worker from '../index.js';
import type { Env } from '../env.js';

// SLO summary harness — real JWT, stub global fetch to drive /health probes.

const TEST_PASSWORD = 'slo-test-password';
const TEST_EMAIL = 'ops@test.example';
let passwordHash = '';
let authToken = '';

const BASE_ENV: Env = {
  STUDIO_ENV: 'staging',
  ALLOWED_ORIGINS: 'https://studio.test',
  DB: { connectionString: 'postgres://test' } as Env['DB'],
  JWT_SECRET: 'test-jwt-secret-slo-test',
  STUDIO_ADMIN_EMAIL: TEST_EMAIL,
  STUDIO_ADMIN_PASSWORD_SHA256: '',
  GITHUB_TOKEN: 'github-token',
  ANTHROPIC_API_KEY: 'anthropic-key',
};

function buildEnv(overrides: Partial<Env> = {}): Env {
  return { ...BASE_ENV, STUDIO_ADMIN_PASSWORD_SHA256: passwordHash, ...overrides };
}

function authedRequest(path: string): Request {
  return new Request(`https://studio.test${path}`, {
    headers: { Authorization: `Bearer ${authToken}` },
  });
}

beforeAll(async () => {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(TEST_PASSWORD));
  passwordHash = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
  const loginRes = await worker.fetch(
    new Request('https://studio.test/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: TEST_EMAIL, password: TEST_PASSWORD, env: 'staging', app: 'factory' }),
    }),
    buildEnv(),
  );
  authToken = (await loginRes.json<{ token?: string }>()).token ?? '';
  expect(authToken).not.toBe('');
});

afterEach(() => {
  vi.restoreAllMocks();
});

interface SloBody {
  degraded: boolean;
  providerStatus: string;
  env: string;
  sloTargetPct?: string;
  apps: Array<{ availability: number; policyState: string; errorCount: number | null; budgetRemainingMinutes: number }>;
}

describe('GET /slo/summary', () => {
  it('reports full availability + normal policy when every /health is ok', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 200 }));

    const res = await worker.fetch(authedRequest('/slo/summary'), buildEnv());
    expect(res.status).toBe(200);
    const body = await res.json<SloBody>();
    expect(body.env).toBe('staging');
    expect(body.providerStatus).toBe('ok');
    expect(body.degraded).toBe(false);
    expect(body.sloTargetPct).toBe('99.900%');
    expect(body.apps.length).toBeGreaterThan(0);
    expect(body.apps.every((a) => a.availability === 1)).toBe(true);
    expect(body.apps.every((a) => a.policyState === 'normal')).toBe(true);
    // Sentry not configured → errorCount null.
    expect(body.apps[0]?.errorCount).toBeNull();
  });

  it('marks the budget exhausted + degraded when every /health is down', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('down'));

    const res = await worker.fetch(authedRequest('/slo/summary'), buildEnv());
    const body = await res.json<SloBody>();
    expect(body.degraded).toBe(true);
    expect(body.apps.every((a) => a.availability === 0)).toBe(true);
    expect(body.apps.every((a) => a.policyState === 'exhausted')).toBe(true);
    expect(body.apps.every((a) => a.budgetRemainingMinutes === 0)).toBe(true);
  });

  it('returns an empty, non-degraded summary for the local env', async () => {
    const res = await worker.fetch(authedRequest('/slo/summary?env=local'), buildEnv());
    const body = await res.json<SloBody>();
    expect(body.env).toBe('local');
    expect(body.apps).toEqual([]);
    expect(body.degraded).toBe(false);
  });

  it('rejects an unauthenticated request', async () => {
    const res = await worker.fetch(new Request('https://studio.test/slo/summary'), buildEnv());
    expect(res.status).toBe(401);
  });
});
