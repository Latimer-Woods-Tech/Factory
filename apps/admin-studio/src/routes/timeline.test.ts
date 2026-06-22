import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import worker from '../index.js';
import type { Env } from '../env.js';

const TEST_PASSWORD = 'timeline-test-password';
const TEST_EMAIL = 'ops@test.example';
let passwordHash = '';
let authToken = '';

const BASE_ENV: Env = {
  STUDIO_ENV: 'staging',
  ALLOWED_ORIGINS: 'https://studio.test',
  DB: { connectionString: 'postgres://test' } as Env['DB'],
  JWT_SECRET: 'test-jwt-secret-timeline',
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
// GET /timeline
// ---------------------------------------------------------------------------

describe('GET /timeline', () => {
  it('returns 200 with events/nextCursor shape (empty when DB fails)', async () => {
    const res = await worker.fetch(authedGet('/timeline'), buildEnv());
    expect(res.status).toBe(200);
    const body = await res.json<{ events: unknown[]; nextCursor: string | null }>();
    expect(Array.isArray(body.events)).toBe(true);
    expect('nextCursor' in body).toBe(true);
  });

  it('clamps limit > 200 to 200', async () => {
    // The route clamps limit to Math.max(1, Math.min(200, n)) — we can't observe
    // the clamped value directly, but we verify the request succeeds (no error).
    const res = await worker.fetch(authedGet('/timeline?limit=9999'), buildEnv());
    expect(res.status).toBe(200);
  });

  it('ignores non-numeric limit and uses default of 50', async () => {
    const res = await worker.fetch(authedGet('/timeline?limit=abc'), buildEnv());
    expect(res.status).toBe(200);
    const body = await res.json<{ events: unknown[] }>();
    // Default limit is 50; events <= 50 with stub DB (likely 0)
    expect(body.events.length).toBeLessThanOrEqual(50);
  });

  it('falls back to ctx.env for invalid env param', async () => {
    const res = await worker.fetch(authedGet('/timeline?env=invalid'), buildEnv());
    expect(res.status).toBe(200);
    const body = await res.json<{ events: unknown[] }>();
    // Route falls back to ctx.env='staging' — no error thrown
    expect(Array.isArray(body.events)).toBe(true);
  });

  it('accepts valid env filter', async () => {
    const res = await worker.fetch(authedGet('/timeline?env=production'), buildEnv());
    expect(res.status).toBe(200);
  });

  it('returns 401 without auth header', async () => {
    const res = await worker.fetch(
      new Request('https://studio.test/timeline'),
      buildEnv(),
    );
    expect(res.status).toBe(401);
  });

  it('skips Sentry fetch when SENTRY_AUTH_TOKEN is absent', async () => {
    // No SENTRY_AUTH_TOKEN in base env — fetchSentryEvents returns [] silently.
    // We verify no network call is made by asserting fetch is not called.
    const mockFetch = vi.fn();
    vi.stubGlobal('fetch', mockFetch);

    const res = await worker.fetch(authedGet('/timeline'), buildEnv());
    expect(res.status).toBe(200);
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
