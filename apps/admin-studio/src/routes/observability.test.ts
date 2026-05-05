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

// ---------------------------------------------------------------------------
// Tests
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
