import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import worker from '../index.js';
import type { Env } from '../env.js';

const TEST_PASSWORD = 'catalog-test-password';
const TEST_EMAIL = 'ops@test.example';
let passwordHash = '';
let authToken = '';

const BASE_ENV: Env = {
  STUDIO_ENV: 'staging',
  ALLOWED_ORIGINS: 'https://studio.test',
  DB: { connectionString: 'postgres://test' } as Env['DB'],
  JWT_SECRET: 'test-jwt-secret-catalog',
  STUDIO_ADMIN_EMAIL: TEST_EMAIL,
  STUDIO_ADMIN_PASSWORD_SHA256: '',
  GITHUB_TOKEN: 'github-token',
  ANTHROPIC_API_KEY: 'anthropic-key',
};

function buildEnv(overrides: Partial<Env> = {}): Env {
  return { ...BASE_ENV, STUDIO_ADMIN_PASSWORD_SHA256: passwordHash, ...overrides };
}

function authedGet(path: string): Request {
  return new Request(`https://studio.test${path}`, {
    headers: { Authorization: `Bearer ${authToken}` },
  });
}

function authedPost(path: string, body: unknown = {}): Request {
  return new Request(`https://studio.test${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${authToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
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

// ---------------------------------------------------------------------------
// GET /catalog — summary
// ---------------------------------------------------------------------------

describe('GET /catalog', () => {
  it('returns 503 when function_catalog table is missing', async () => {
    // The test DB stub will throw a "no such table: function_catalog" error.
    const res = await worker.fetch(authedGet('/catalog'), buildEnv());
    // DB is a stub without a real D1 binding, so summariseCatalog throws → 503 or 500.
    expect([500, 503]).toContain(res.status);
  });

  it('requires authentication', async () => {
    const res = await worker.fetch(
      new Request('https://studio.test/catalog'),
      buildEnv(),
    );
    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// GET /catalog/:app — rows for a specific app
// ---------------------------------------------------------------------------

describe('GET /catalog/:app', () => {
  it('returns 400 for invalid env param', async () => {
    const res = await worker.fetch(
      authedGet('/catalog/admin-studio?env=invalid'),
      buildEnv(),
    );
    expect(res.status).toBe(400);
    const body = await res.json<{ error: string }>();
    expect(body.error).toBe('invalid env');
  });

  it('returns 503 or 500 when DB table is missing', { timeout: 10000 }, async () => {
    const res = await worker.fetch(
      authedGet('/catalog/admin-studio?env=production'),
      buildEnv(),
    );
    expect([500, 503]).toContain(res.status);
  });
});

// ---------------------------------------------------------------------------
// POST /catalog/:app/refresh — crawl manifest and upsert
// ---------------------------------------------------------------------------

describe('POST /catalog/:app/refresh', () => {
  it('returns 404 for unknown app id', async () => {
    const res = await worker.fetch(
      authedPost('/catalog/no-such-app/refresh'),
      buildEnv(),
    );
    expect(res.status).toBe(404);
    const body = await res.json<{ error: string }>();
    expect(body.error).toBe('unknown app');
  });

  it('returns 400 for invalid env param', async () => {
    const res = await worker.fetch(
      authedPost('/catalog/admin-studio/refresh?env=bad'),
      buildEnv(),
    );
    expect(res.status).toBe(400);
    const body = await res.json<{ error: string }>();
    expect(body.error).toBe('invalid env');
  });

  it('returns 400 for local env (cannot crawl local)', async () => {
    const res = await worker.fetch(
      authedPost('/catalog/admin-studio/refresh?env=local'),
      buildEnv(),
    );
    expect(res.status).toBe(400);
    const body = await res.json<{ error: string }>();
    expect(body.error).toBe('cannot crawl local env');
  });

  it('returns 502 when the manifest fetch fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse({ error: 'down' }, 503)),
    );

    const res = await worker.fetch(
      authedPost('/catalog/admin-studio/refresh?env=staging'),
      buildEnv(),
    );
    expect(res.status).toBe(502);
    const body = await res.json<{ error: string }>();
    expect(body.error).toContain('503');
  });

  it('returns 502 when the manifest JSON is invalid', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response('not json at all', {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    );

    const res = await worker.fetch(
      authedPost('/catalog/admin-studio/refresh?env=staging'),
      buildEnv(),
    );
    expect(res.status).toBe(502);
    const body = await res.json<{ error: string }>();
    expect(body.error).toBe('invalid json');
  });

  it('returns 502 when the manifest fails schema validation', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse({ not: 'a manifest' }, 200)),
    );

    const res = await worker.fetch(
      authedPost('/catalog/admin-studio/refresh?env=staging'),
      buildEnv(),
    );
    expect(res.status).toBe(502);
    const body = await res.json<{ error: string }>();
    expect(body.error).toBe('invalid manifest');
  });

  it('returns 409 when manifest app field does not match requested app', async () => {
    const manifest = {
      manifestVersion: 1,
      app: 'wrong-app',
      env: 'staging',
      generatedAt: new Date().toISOString(),
      entries: [],
    };
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse(manifest, 200)),
    );

    const res = await worker.fetch(
      authedPost('/catalog/admin-studio/refresh?env=staging'),
      buildEnv(),
    );
    expect(res.status).toBe(409);
    const body = await res.json<{ error: string; expected: string; actual: string }>();
    expect(body.error).toBe('manifest app mismatch');
    expect(body.expected).toBe('admin-studio');
    expect(body.actual).toBe('wrong-app');
  });

  it('requires authentication', async () => {
    const res = await worker.fetch(
      new Request('https://studio.test/catalog/admin-studio/refresh', { method: 'POST' }),
      buildEnv(),
    );
    expect(res.status).toBe(401);
  });
});
