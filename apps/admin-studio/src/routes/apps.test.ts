import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import worker from '../index.js';
import type { Env } from '../env.js';

// ---------------------------------------------------------------------------
// Harness — mirrors observability.test.ts: real JWT via the login flow, then
// stub global fetch to drive the /apps/* outbound calls deterministically.
// ---------------------------------------------------------------------------

const TEST_PASSWORD = 'apps-test-password';
const TEST_EMAIL = 'ops@test.example';
let passwordHash = '';
let authToken = '';

const BASE_ENV: Env = {
  STUDIO_ENV: 'staging',
  ALLOWED_ORIGINS: 'https://studio.test',
  DB: { connectionString: 'postgres://test' } as Env['DB'],
  JWT_SECRET: 'test-jwt-secret-apps-test',
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

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
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
  const body = await loginRes.json<{ token?: string }>();
  authToken = body.token ?? '';
  expect(authToken).not.toBe('');
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('GET /apps/health', () => {
  it('marks every app healthy when its /health returns 200 ok', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({ status: 'ok', env: 'staging', service: 'x' }),
    );

    const res = await worker.fetch(authedRequest('/apps/health'), buildEnv());
    expect(res.status).toBe(200);
    const body = await res.json<{ env: string; results: Array<{ status: string; reportedEnv?: string }> }>();
    expect(body.env).toBe('staging');
    expect(body.results.length).toBeGreaterThan(0);
    expect(body.results.every((r) => r.status === 'healthy')).toBe(true);
    expect(body.results[0]?.reportedEnv).toBe('staging');
  });

  it('marks an app down when its /health rejects, and sorts down before healthy', async () => {
    let call = 0;
    vi.spyOn(globalThis, 'fetch').mockImplementation(() => {
      call += 1;
      // Fail the first probe, succeed the rest → mixed result set.
      return call === 1
        ? Promise.reject(new Error('connection refused'))
        : Promise.resolve(jsonResponse({ status: 'ok', env: 'staging' }));
    });

    const res = await worker.fetch(authedRequest('/apps/health'), buildEnv());
    const body = await res.json<{ results: Array<{ status: string }> }>();
    expect(body.results.some((r) => r.status === 'down')).toBe(true);
    // Severity sort: down (0) must come before healthy (3).
    const statuses = body.results.map((r) => r.status);
    expect(statuses.indexOf('down')).toBeLessThan(statuses.lastIndexOf('healthy'));
  });

  it('treats a 5xx as down and a 4xx as degraded', async () => {
    let call = 0;
    vi.spyOn(globalThis, 'fetch').mockImplementation(() => {
      call += 1;
      if (call === 1) return Promise.resolve(jsonResponse({}, 503));
      if (call === 2) return Promise.resolve(jsonResponse({}, 403));
      return Promise.resolve(jsonResponse({ status: 'ok' }, 200));
    });

    const res = await worker.fetch(authedRequest('/apps/health'), buildEnv());
    const body = await res.json<{ results: Array<{ status: string }> }>();
    expect(body.results.some((r) => r.status === 'down')).toBe(true);
    expect(body.results.some((r) => r.status === 'degraded')).toBe(true);
  });

  it('returns an empty set with a note for the local env', async () => {
    const res = await worker.fetch(authedRequest('/apps/health?env=local'), buildEnv());
    const body = await res.json<{ env: string; results: unknown[]; note?: string }>();
    expect(body.env).toBe('local');
    expect(body.results).toEqual([]);
    expect(body.note).toContain('Local');
  });

  it('rejects an unauthenticated request', async () => {
    const res = await worker.fetch(new Request('https://studio.test/apps/health'), buildEnv());
    expect(res.status).toBe(401);
  });
});

describe('GET /apps/versions', () => {
  it('reports not-configured when Cloudflare credentials are absent', async () => {
    const res = await worker.fetch(authedRequest('/apps/versions'), buildEnv());
    const body = await res.json<{ configured: boolean; results: unknown[] }>();
    expect(body.configured).toBe(false);
    expect(body.results).toEqual([]);
  });

  it('parses the latest deployment per worker from the Cloudflare API', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({
        result: {
          deployments: [
            { id: 'v-abc123', created_on: '2026-06-20T00:00:00Z', source: 'api' },
            { id: 'v-old', created_on: '2026-06-19T00:00:00Z' },
          ],
        },
      }),
    );

    const res = await worker.fetch(
      authedRequest('/apps/versions'),
      buildEnv({ CLOUDFLARE_API_TOKEN: 'cf-token', CLOUDFLARE_ACCOUNT_ID: 'acct-123' }),
    );
    const body = await res.json<{ configured: boolean; results: Array<{ versionId: string }> }>();
    expect(body.configured).toBe(true);
    expect(body.results.length).toBeGreaterThan(0);
    expect(body.results[0]?.versionId).toBe('v-abc123');
  });
});
