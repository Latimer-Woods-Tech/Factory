import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import worker from '../index.js';
import type { Env } from '../env.js';

const TEST_PASSWORD = 'smoke-test-password';
const TEST_EMAIL = 'ops@test.example';
let passwordHash = '';
let authToken = '';

const BASE_ENV: Env = {
  STUDIO_ENV: 'staging',
  ALLOWED_ORIGINS: 'https://studio.test',
  DB: { connectionString: 'postgres://test' } as Env['DB'],
  JWT_SECRET: 'test-jwt-secret-smoke',
  STUDIO_ADMIN_EMAIL: TEST_EMAIL,
  STUDIO_ADMIN_PASSWORD_SHA256: '',
  GITHUB_TOKEN: 'github-token',
  ANTHROPIC_API_KEY: 'anthropic-key',
};

function buildEnv(overrides: Partial<Env> = {}): Env {
  return { ...BASE_ENV, STUDIO_ADMIN_PASSWORD_SHA256: passwordHash, ...overrides };
}

function authedPost(path: string, body: unknown = {}): Request {
  return new Request(`https://studio.test${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${authToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

/** Encode `{method}:{path}` as the route's base64url endpoint identifier. */
function encodeEndpoint(method: string, path: string): string {
  const raw = btoa(`${method}:${path}`);
  return raw.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
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
// POST /smoke/:app/:endpoint
// ---------------------------------------------------------------------------

describe('POST /smoke/:app/:endpoint', () => {
  it('returns 404 for unknown app', async () => {
    const endpoint = encodeEndpoint('GET', '/health');
    const res = await worker.fetch(
      authedPost(`/smoke/no-such-app/${endpoint}`, { env: 'staging' }),
      buildEnv(),
    );
    expect(res.status).toBe(404);
    const body = await res.json<{ error: string }>();
    expect(body.error).toBe('unknown app');
  });

  it('returns 400 for invalid base64url endpoint encoding', async () => {
    const res = await worker.fetch(
      authedPost('/smoke/admin-studio/!!!invalid!!!', { env: 'staging' }),
      buildEnv(),
    );
    expect(res.status).toBe(400);
    const body = await res.json<{ error: string }>();
    expect(body.error).toBe('invalid endpoint encoding');
  });

  it('returns 400 for base64 that decodes but has wrong format (no colon)', async () => {
    // "nocolon" base64url-encodes as a valid base64 string but has no ":" separator
    const noColon = btoa('nocolon').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
    const res = await worker.fetch(
      authedPost(`/smoke/admin-studio/${noColon}`, { env: 'staging' }),
      buildEnv(),
    );
    expect(res.status).toBe(400);
    const body = await res.json<{ error: string }>();
    expect(body.error).toBe('invalid endpoint encoding');
  });

  it('returns 404 or 500 when endpoint is not in the catalog (DB stub fails)', { timeout: 15000 }, async () => {
    const endpoint = encodeEndpoint('GET', '/health');
    const res = await worker.fetch(
      authedPost(`/smoke/admin-studio/${endpoint}`, { env: 'staging' }),
      buildEnv(),
    );
    // listCatalog throws on stub DB → 500 (unhandled in route); or 404 if DB returns []
    expect([404, 500, 503]).toContain(res.status);
  });

  it('returns 401 without auth header', async () => {
    const endpoint = encodeEndpoint('GET', '/health');
    const res = await worker.fetch(
      new Request(`https://studio.test/smoke/admin-studio/${endpoint}`, { method: 'POST' }),
      buildEnv(),
    );
    expect(res.status).toBe(401);
  });
});
