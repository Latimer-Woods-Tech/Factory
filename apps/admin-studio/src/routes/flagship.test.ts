import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import worker from '../index.js';
import type { Env } from '../env.js';

const TEST_PASSWORD = 'flagship-test-password';
const TEST_EMAIL = 'ops@test.example';
let passwordHash = '';
let authToken = '';

const BASE_ENV: Env = {
  STUDIO_ENV: 'staging',
  ALLOWED_ORIGINS: 'https://studio.test',
  DB: { connectionString: 'postgres://test' } as Env['DB'],
  JWT_SECRET: 'test-jwt-secret-flagship',
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
// GET /api/flags — full registry list
// ---------------------------------------------------------------------------

describe('GET /api/flags', () => {
  it('returns all flags with zero stats when FLAG_TELEMETRY is absent', async () => {
    const res = await worker.fetch(authedGet('/api/flags'), buildEnv());
    expect(res.status).toBe(200);
    const body = await res.json<{ flags: unknown[]; total: number; generated_at: string }>();
    expect(body.total).toBeGreaterThan(0);
    expect(Array.isArray(body.flags)).toBe(true);
    const first = body.flags[0] as Record<string, unknown>;
    expect(first).toHaveProperty('key');
    expect(first).toHaveProperty('type');
    expect(first).toHaveProperty('stats');
    expect((first.stats as Record<string, unknown>).evals_24h).toBe(0);
    expect(body.generated_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('requires authentication', async () => {
    const res = await worker.fetch(
      new Request('https://studio.test/api/flags'),
      buildEnv(),
    );
    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// GET /api/flags/activity — last 50 evaluations
// ---------------------------------------------------------------------------

describe('GET /api/flags/activity', () => {
  it('returns degraded envelope when FLAG_TELEMETRY is absent', async () => {
    const res = await worker.fetch(authedGet('/api/flags/activity'), buildEnv());
    expect(res.status).toBe(200);
    const body = await res.json<{ degraded: boolean; evaluations: unknown[] }>();
    expect(body.degraded).toBe(true);
    expect(Array.isArray(body.evaluations)).toBe(true);
    expect(body.evaluations).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// GET /api/flags/:key — single flag detail
// ---------------------------------------------------------------------------

describe('GET /api/flags/:key', () => {
  it('returns 404 for unknown flag key', async () => {
    const res = await worker.fetch(authedGet('/api/flags/unknown%3Aflag'), buildEnv());
    expect(res.status).toBe(404);
    const body = await res.json<{ error: string }>();
    expect(body.error).toContain('not found');
  });

  it('returns flag detail for known key (no FLAG_TELEMETRY → empty stats)', async () => {
    // Use a real key from the inlined registry
    const key = encodeURIComponent('global:ks:supervisor_automerge');
    const res = await worker.fetch(authedGet(`/api/flags/${key}`), buildEnv());
    expect(res.status).toBe(200);
    const body = await res.json<{
      key: string;
      type: string;
      status: string;
      stats: { evals_24h: number };
      recent_evaluations: unknown[];
    }>();
    expect(body.key).toBe('global:ks:supervisor_automerge');
    expect(body.type).toBe('kill_switch');
    expect(body.status).toBe('active');
    expect(body.stats.evals_24h).toBe(0);
    expect(Array.isArray(body.recent_evaluations)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// POST /api/flags/:key/toggle — flip flag status
// ---------------------------------------------------------------------------

describe('POST /api/flags/:key/toggle', () => {
  it('returns 503 when FLAG_TELEMETRY is absent', async () => {
    const key = encodeURIComponent('global:ks:maintenance_mode');
    const res = await worker.fetch(authedPost(`/api/flags/${key}/toggle`), buildEnv());
    expect(res.status).toBe(503);
    const body = await res.json<{ error: string }>();
    expect(body.error).toContain('FLAG_TELEMETRY');
  });

  it('returns 404 for unknown flag', async () => {
    const key = encodeURIComponent('no:such:flag');
    const res = await worker.fetch(authedPost(`/api/flags/${key}/toggle`), buildEnv());
    expect(res.status).toBe(404);
  });

  it('requires authentication', async () => {
    const key = encodeURIComponent('global:ks:maintenance_mode');
    const res = await worker.fetch(
      new Request(`https://studio.test/api/flags/${key}/toggle`, { method: 'POST' }),
      buildEnv(),
    );
    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// POST /api/flags/:key/rollout — set rollout percentage
// ---------------------------------------------------------------------------

describe('POST /api/flags/:key/rollout', () => {
  it('returns 400 for non-rollout flag type', async () => {
    const key = encodeURIComponent('global:ks:supervisor_automerge');
    const res = await worker.fetch(authedPost(`/api/flags/${key}/rollout`, { percentage: 50 }), buildEnv());
    expect(res.status).toBe(400);
    const body = await res.json<{ error: string }>();
    expect(body.error).toContain("not 'rollout'");
  });

  it('returns 400 for invalid percentage (out of range)', async () => {
    const key = encodeURIComponent('humandesign:ro:post_purchase_flow_v2');
    const res = await worker.fetch(authedPost(`/api/flags/${key}/rollout`, { percentage: 150 }), buildEnv());
    expect(res.status).toBe(400);
    const body = await res.json<{ error: string }>();
    expect(body.error).toContain('percentage');
  });

  it('returns 400 for non-numeric percentage', async () => {
    const key = encodeURIComponent('humandesign:ro:post_purchase_flow_v2');
    const res = await worker.fetch(authedPost(`/api/flags/${key}/rollout`, { percentage: 'half' }), buildEnv());
    expect(res.status).toBe(400);
  });

  it('returns 503 when FLAG_TELEMETRY is absent (valid rollout flag + valid percentage)', async () => {
    const key = encodeURIComponent('humandesign:ro:post_purchase_flow_v2');
    const res = await worker.fetch(authedPost(`/api/flags/${key}/rollout`, { percentage: 25 }), buildEnv());
    expect(res.status).toBe(503);
    const body = await res.json<{ error: string }>();
    expect(body.error).toContain('FLAG_TELEMETRY');
  });
});
