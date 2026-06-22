import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import worker from '../index.js';
import type { Env } from '../env.js';

const TEST_PASSWORD = 'repo-test-password';
const TEST_EMAIL = 'ops@test.example';
let passwordHash = '';
let authToken = '';

const BASE_ENV: Env = {
  STUDIO_ENV: 'staging',
  ALLOWED_ORIGINS: 'https://studio.test',
  DB: { connectionString: 'postgres://test' } as Env['DB'],
  JWT_SECRET: 'test-jwt-secret-repo',
  STUDIO_ADMIN_EMAIL: TEST_EMAIL,
  STUDIO_ADMIN_PASSWORD_SHA256: '',
  // GITHUB_TOKEN intentionally absent in most tests — will be overridden per-test
  ANTHROPIC_API_KEY: 'anthropic-key',
};

function buildEnv(overrides: Partial<Env> = {}): Env {
  return { ...BASE_ENV, STUDIO_ADMIN_PASSWORD_SHA256: passwordHash, ...overrides };
}

function authedGet(path: string, env?: Env): Request {
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
    buildEnv({ GITHUB_TOKEN: 'gh-token' }),
  );
  const body = await loginRes.json<{ token?: string }>();
  authToken = body.token ?? '';
  expect(authToken).not.toBe('');
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Auth gating (no GITHUB_TOKEN → 503, no auth header → 401)
// ---------------------------------------------------------------------------

describe('Repo auth gating', () => {
  it('GET /repo/branches returns 503 when GITHUB_TOKEN absent', async () => {
    const res = await worker.fetch(
      authedGet('/repo/branches'),
      buildEnv({ GITHUB_TOKEN: undefined }),
    );
    expect(res.status).toBe(503);
    const body = await res.json<{ error: string }>();
    expect(body.error).toContain('GitHub auth');
  });

  it('GET /repo/branches returns 401 without auth header', async () => {
    const res = await worker.fetch(
      new Request('https://studio.test/repo/branches'),
      buildEnv({ GITHUB_TOKEN: 'gh-token' }),
    );
    expect(res.status).toBe(401);
  });

  it('GET /repo/tree returns 503 when GITHUB_TOKEN absent', async () => {
    const res = await worker.fetch(
      authedGet('/repo/tree'),
      buildEnv({ GITHUB_TOKEN: undefined }),
    );
    expect(res.status).toBe(503);
  });

  it('GET /repo/file returns 503 when GITHUB_TOKEN absent', async () => {
    const res = await worker.fetch(
      authedGet('/repo/file?path=README.md'),
      buildEnv({ GITHUB_TOKEN: undefined }),
    );
    expect(res.status).toBe(503);
  });
});

// ---------------------------------------------------------------------------
// GET /repo/branches — list branches
// ---------------------------------------------------------------------------

describe('GET /repo/branches', () => {
  it('proxies GitHub branches response', async () => {
    // GitHub API returns objects with commit.sha — fetchBranches maps b.commit.sha.
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse([
          { name: 'main', protected: true, commit: { sha: 'abc123' } },
          { name: 'feat/test', protected: false, commit: { sha: 'def456' } },
        ]),
      ),
    );

    const res = await worker.fetch(
      authedGet('/repo/branches'),
      buildEnv({ GITHUB_TOKEN: 'gh-token' }),
    );
    expect(res.status).toBe(200);
    const body = await res.json<{ branches: Array<{ name: string }> }>();
    expect(Array.isArray(body.branches)).toBe(true);
    expect(body.branches.find((b) => b.name === 'main')).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// GET /repo/file — path validation
// ---------------------------------------------------------------------------

describe('GET /repo/file', () => {
  it('returns 400 when path query param is missing', async () => {
    const res = await worker.fetch(
      authedGet('/repo/file'),
      buildEnv({ GITHUB_TOKEN: 'gh-token' }),
    );
    expect(res.status).toBe(400);
    const body = await res.json<{ error: string }>();
    expect(body.error).toContain('path');
  });

  it('returns 400 for path traversal attempt (..)', async () => {
    const res = await worker.fetch(
      authedGet('/repo/file?path=../../etc/passwd'),
      buildEnv({ GITHUB_TOKEN: 'gh-token' }),
    );
    expect(res.status).toBe(400);
    const body = await res.json<{ error: string }>();
    expect(body.error).toBe('invalid path');
  });

  it('proxies file content from GitHub', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({
          name: 'README.md',
          path: 'README.md',
          content: Buffer.from('# Hello').toString('base64'),
          encoding: 'base64',
          sha: 'abc123',
          size: 7,
          type: 'file',
        }),
      ),
    );

    const res = await worker.fetch(
      authedGet('/repo/file?path=README.md'),
      buildEnv({ GITHUB_TOKEN: 'gh-token' }),
    );
    expect(res.status).toBe(200);
    const body = await res.json<{ file: { name: string } }>();
    expect(body.file).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// POST /repo/commit — write-path guards
// ---------------------------------------------------------------------------

describe('POST /repo/commit', () => {
  it('returns 503 when GITHUB_TOKEN absent', async () => {
    const res = await worker.fetch(
      authedPost('/repo/commit', { path: 'test.txt', branch: 'feat/x', message: 'test', content: 'hi' }),
      buildEnv({ GITHUB_TOKEN: undefined }),
    );
    expect(res.status).toBe(503);
  });

  it('returns 400 for missing path', async () => {
    const res = await worker.fetch(
      authedPost('/repo/commit', { branch: 'feat/x', message: 'test', content: 'hi' }),
      buildEnv({ GITHUB_TOKEN: 'gh-token' }),
    );
    expect(res.status).toBe(400);
    const body = await res.json<{ error: string }>();
    expect(body.error).toContain('path');
  });

  it('returns 403 for commit to protected branch (main)', async () => {
    const res = await worker.fetch(
      authedPost('/repo/commit', { path: 'test.txt', branch: 'main', message: 'test', content: 'hi' }),
      buildEnv({ GITHUB_TOKEN: 'gh-token' }),
    );
    expect(res.status).toBe(403);
    const body = await res.json<{ error: string }>();
    expect(body.error).toContain('protected branch');
  });

  it('returns 400 for path traversal in commit', async () => {
    const res = await worker.fetch(
      authedPost('/repo/commit', { path: '../etc/passwd', branch: 'feat/x', message: 'test', content: 'x' }),
      buildEnv({ GITHUB_TOKEN: 'gh-token' }),
    );
    expect(res.status).toBe(400);
    const body = await res.json<{ error: string }>();
    expect(body.error).toContain('path');
  });

  it('returns 400 for missing commit message', async () => {
    const res = await worker.fetch(
      authedPost('/repo/commit', { path: 'test.txt', branch: 'feat/x', message: '   ', content: 'hi' }),
      buildEnv({ GITHUB_TOKEN: 'gh-token' }),
    );
    expect(res.status).toBe(400);
    const body = await res.json<{ error: string }>();
    expect(body.error).toContain('message');
  });
});

// ---------------------------------------------------------------------------
// POST /repo/branches — branch creation guards
// ---------------------------------------------------------------------------

describe('POST /repo/branches', () => {
  it('returns 503 when GITHUB_TOKEN absent', async () => {
    const res = await worker.fetch(
      authedPost('/repo/branches', { name: 'feat/new' }),
      buildEnv({ GITHUB_TOKEN: undefined }),
    );
    expect(res.status).toBe(503);
  });

  it('returns 403 for protected branch name (main)', async () => {
    const res = await worker.fetch(
      authedPost('/repo/branches', { name: 'main' }),
      buildEnv({ GITHUB_TOKEN: 'gh-token' }),
    );
    expect(res.status).toBe(403);
    const body = await res.json<{ error: string }>();
    expect(body.error).toContain('protected');
  });

  it('returns 400 for invalid branch name', async () => {
    const res = await worker.fetch(
      authedPost('/repo/branches', { name: 'invalid branch name with spaces!' }),
      buildEnv({ GITHUB_TOKEN: 'gh-token' }),
    );
    expect(res.status).toBe(400);
    const body = await res.json<{ error: string }>();
    expect(body.error).toContain('invalid branch');
  });
});
