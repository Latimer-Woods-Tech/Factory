import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import worker from '../index.js';
import type { Env } from '../env.js';

const TEST_PASSWORD = 'synthetic-test-password';
const TEST_EMAIL = 'ops@test.example';
let passwordHash = '';
let authToken = '';

const BASE_ENV: Env = {
  STUDIO_ENV: 'staging',
  ALLOWED_ORIGINS: 'https://studio.test',
  DB: { connectionString: 'postgres://test' } as Env['DB'],
  JWT_SECRET: 'test-jwt-secret-synthetic',
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

/** Stub fetch so all journey probes resolve quickly without hitting the network. */
function stubFetchHealthy(): void {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ status: 'ok' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    ),
  );
}

/** Stub fetch so all journey probes return 401 (auth wall pass). */
function stubFetchAuthWall(): void {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(new Response('Unauthorized', { status: 401 })),
  );
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
// GET /synthetic/journeys
// ---------------------------------------------------------------------------

describe('GET /synthetic/journeys', () => {
  it('returns empty journey list with note for local env', async () => {
    const res = await worker.fetch(
      authedGet('/synthetic/journeys?env=local'),
      buildEnv(),
    );
    expect(res.status).toBe(200);
    const body = await res.json<{
      env: string;
      outageClass: string;
      journeys: unknown[];
      note: string;
    }>();
    expect(body.env).toBe('local');
    expect(body.outageClass).toBe('none');
    expect(body.journeys).toHaveLength(0);
    expect(body.note).toContain('not available');
  });

  it('runs journeys against staging and returns snapshot shape', async () => {
    stubFetchHealthy();

    const res = await worker.fetch(
      authedGet('/synthetic/journeys?env=staging'),
      buildEnv(),
    );
    expect(res.status).toBe(200);
    const body = await res.json<{
      degraded: boolean;
      providerStatus: string;
      outageClass: string;
      journeys: Array<{ id: string; status: string; latencyMs: number | null }>;
      trend: Record<string, string[]>;
    }>();
    expect(body.providerStatus).toBe('ok');
    expect(['none', 'partial', 'full']).toContain(body.outageClass);
    expect(Array.isArray(body.journeys)).toBe(true);
    if (body.journeys.length > 0) {
      const j = body.journeys[0]!;
      expect(j).toHaveProperty('id');
      expect(j).toHaveProperty('status');
    }
  });

  it('returns all-pass snapshot when all apps return healthy JSON', async () => {
    // STUDIO_LOGIN_JOURNEY probes /auth/login and expects 401 (not 200).
    // Return 401 for login probes and { status: 'ok' } 200 for all others.
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: string) => {
        if (String(url).includes('/auth/login')) {
          return Promise.resolve(new Response('Unauthorized', { status: 401 }));
        }
        return Promise.resolve(
          new Response(JSON.stringify({ status: 'ok' }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
        );
      }),
    );

    const res = await worker.fetch(
      authedGet('/synthetic/journeys?env=staging'),
      buildEnv(),
    );
    expect(res.status).toBe(200);
    const body = await res.json<{
      outageClass: string;
      journeys: Array<{ status: string }>;
    }>();
    expect(body.outageClass).toBe('none');
    expect(body.journeys.every((j) => j.status === 'pass' || j.status === 'skipped')).toBe(true);
  });

  it('requires authentication', async () => {
    const res = await worker.fetch(
      new Request('https://studio.test/synthetic/journeys'),
      buildEnv(),
    );
    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// POST /synthetic/run
// ---------------------------------------------------------------------------

describe('POST /synthetic/run', () => {
  it('returns 400 for local env', async () => {
    const res = await worker.fetch(
      authedPost('/synthetic/run?env=local', {}),
      buildEnv(),
    );
    expect(res.status).toBe(400);
    const body = await res.json<{ error: string }>();
    expect(body.error).toContain('local');
  });

  it('runs all journeys and returns snapshot when env=staging', async () => {
    stubFetchHealthy();

    const res = await worker.fetch(
      authedPost('/synthetic/run?env=staging', {}),
      buildEnv(),
    );
    expect(res.status).toBe(200);
    const body = await res.json<{
      providerStatus: string;
      outageClass: string;
      journeys: unknown[];
    }>();
    expect(body.providerStatus).toBe('ok');
    expect(Array.isArray(body.journeys)).toBe(true);
  });

  it('filters journeys when body.journey is provided', async () => {
    // Stub: login journey expects 401, health expects { status: 'ok' }
    vi.stubGlobal(
      'fetch',
      vi.fn()
        .mockImplementation((url: string) => {
          if (String(url).includes('/auth/login')) {
            return Promise.resolve(new Response('Unauthorized', { status: 401 }));
          }
          return Promise.resolve(
            new Response(JSON.stringify({ status: 'ok' }), {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            }),
          );
        }),
    );

    const res = await worker.fetch(
      authedPost('/synthetic/run?env=staging', { journey: 'admin-studio:login' }),
      buildEnv(),
    );
    expect(res.status).toBe(200);
    const body = await res.json<{
      journeys: Array<{ id: string }>;
    }>();
    // With a valid filter that matches, we get at most 1 journey (or 0 if base URL not found)
    expect(body.journeys.length).toBeLessThanOrEqual(1);
  });

  it('returns empty journeys for an unknown journey filter', async () => {
    stubFetchHealthy();

    const res = await worker.fetch(
      authedPost('/synthetic/run?env=staging', { journey: 'no-such:journey' }),
      buildEnv(),
    );
    expect(res.status).toBe(200);
    const body = await res.json<{ journeys: unknown[] }>();
    expect(body.journeys).toHaveLength(0);
  });

  it('requires authentication', async () => {
    const res = await worker.fetch(
      new Request('https://studio.test/synthetic/run', { method: 'POST' }),
      buildEnv(),
    );
    expect(res.status).toBe(401);
  });
});
