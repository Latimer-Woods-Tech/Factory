/**
 * Route integration tests for qa-tools-worker.
 *
 * All external dependencies (db, audit, r2) are mocked so tests are
 * deterministic and don't need a real database or browser-agent.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks — hoisted by Vitest before any import below
// ---------------------------------------------------------------------------

vi.mock('../src/lib/db.js', () => ({
  insertRun: vi.fn(),
  updateRun: vi.fn(),
  markRunStarted: vi.fn(),
  getRunById: vi.fn(),
  listRuns: vi.fn(),
  getLatestRun: vi.fn(),
  countOpenViolations: vi.fn(),
  insertResults: vi.fn(),
  getResultsByRunId: vi.fn(),
  updateResultStatus: vi.fn(),
}));

vi.mock('../src/lib/audit.js', () => ({
  runAudit: vi.fn().mockResolvedValue(undefined),
  resolveTargetUrl: vi.fn().mockReturnValue('https://capricast.com'),
}));

// ---------------------------------------------------------------------------
// Imports (after mock setup so they receive mocked modules)
// ---------------------------------------------------------------------------

import app from '../src/index.js';
import { mintQaJwt } from '../src/middleware/auth.js';
import {
  insertRun,
  getRunById,
  listRuns,
  getResultsByRunId,
  updateResultStatus,
  getLatestRun,
  countOpenViolations,
  updateRun,
} from '../src/lib/db.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TEST_SECRET = 'test-secret-for-unit-tests';
const NOW_S = Math.floor(Date.now() / 1000);

/** A minimal passing run row. */
const sampleRun = {
  id: 'run-test-id',
  app_id: 'capricast',
  environment: 'production',
  test_type: 'a11y',
  profile: 'fast',
  status: 'passed',
  created_at: new Date().toISOString(),
  started_at: new Date().toISOString(),
  completed_at: new Date().toISOString(),
  duration_ms: 5000,
  violations_count: 0,
  passes_count: 10,
  warnings_count: 2,
  attempt_number: 1,
  max_attempts: 1,
  parent_run_id: null,
  error_message: null,
  r2_prefix: null,
  github_issue_url: null,
  custom_url: null,
  test_config: {},
  tags: [],
  ci_context: null,
  template_id: null,
  flake_score: null,
} as const;

/** A minimal axe result row. */
const sampleResult = {
  id: 'result-1',
  run_id: 'run-test-id',
  category: 'axe',
  violation_id: 'color-contrast',
  severity: 'critical',
  title: 'color-contrast',
  description: 'Color contrast too low',
  remediation_hint: 'Fix contrast',
  selector: 'button',
  url: 'https://capricast.com',
  affected_nodes: 3,
  screenshot_key: null,
  status: 'open',
  is_regression: false,
  acknowledged_by: null,
  acknowledged_at: null,
  html_snippet: null,
  created_at: new Date().toISOString(),
} as const;

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeEnv(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    ENVIRONMENT: 'development',
    QA_TOOLS_JWT_SECRET: TEST_SECRET,
    BROWSER_AGENT_URL: 'https://browser-agent.test',
    BROWSER_AGENT_AUDIENCE: 'https://browser-agent.test',
    BROWSER_AGENT_SA_KEY: JSON.stringify({
      client_email: 'test@sa.test',
      private_key: '-----BEGIN PRIVATE KEY-----\nMIIEvAIBADANBgkq-----END PRIVATE KEY-----',
    }),
    DB: { connectionString: 'postgresql://test:test@localhost/test' },
    QA_TOOLS_R2: {
      put: vi.fn().mockResolvedValue(undefined),
      get: vi.fn().mockResolvedValue(null),
      head: vi.fn().mockResolvedValue(null),
      delete: vi.fn().mockResolvedValue(undefined),
      list: vi.fn().mockResolvedValue({ objects: [], truncated: false }),
    },
    RATE_LIMIT_KV: {
      get: vi.fn().mockResolvedValue(null),
      put: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockResolvedValue(undefined),
    },
    ...overrides,
  };
}

async function makeToken(role = 'qa_runner', appIds: string[] = ['capricast']): Promise<string> {
  return mintQaJwt(
    { sub: 'test-user', role: role as never, app_ids: appIds as never, exp: NOW_S + 3600 },
    TEST_SECRET,
  );
}

async function req(
  method: string,
  path: string,
  opts: { body?: unknown; token?: string; env?: Record<string, unknown> } = {},
): Promise<Response> {
  const env = opts.env ?? makeEnv();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (opts.token) headers['Authorization'] = `Bearer ${opts.token}`;

  const request = new Request(`http://qa-tools.test${path}`, {
    method,
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });

  return app.fetch(request, env as never, {
    waitUntil: vi.fn(),
    passThroughOnException: vi.fn(),
  } as never);
}

// Reset and re-apply default mock returns before each test
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(insertRun).mockResolvedValue('run-test-id');
  vi.mocked(getRunById).mockResolvedValue(null);
  vi.mocked(listRuns).mockResolvedValue({ runs: [], total: 0 });
  vi.mocked(getResultsByRunId).mockResolvedValue([]);
  vi.mocked(updateResultStatus).mockResolvedValue(undefined);
  vi.mocked(getLatestRun).mockResolvedValue(null);
  vi.mocked(countOpenViolations).mockResolvedValue({ critical: 0, serious: 0, moderate: 0, total: 0 });
  vi.mocked(updateRun).mockResolvedValue(undefined);
});

// ---------------------------------------------------------------------------
// POST /runs — success paths
// ---------------------------------------------------------------------------

describe('POST /runs — success path', () => {
  it('returns 202 with runId on valid request', async () => {
    const token = await makeToken();
    const res = await req('POST', '/runs', {
      token,
      body: { appId: 'capricast', environment: 'production', testType: 'a11y', profile: 'fast' },
    });
    expect(res.status).toBe(202);
    const body = await res.json() as Record<string, unknown>;
    expect(body['runId']).toBe('run-test-id');
    expect(body['status']).toBe('pending');
    expect(insertRun).toHaveBeenCalledOnce();
  });

  it('returns 202 with full-audit profile', async () => {
    const token = await makeToken();
    const res = await req('POST', '/runs', {
      token,
      body: { appId: 'capricast', environment: 'production', testType: 'full-audit', profile: 'full' },
    });
    expect(res.status).toBe(202);
    const body = await res.json() as Record<string, unknown>;
    expect(body['profile']).toBe('full');
  });

  it('returns 202 for custom environment + customUrl', async () => {
    const token = await makeToken();
    const res = await req('POST', '/runs', {
      token,
      body: { appId: 'capricast', environment: 'custom', customUrl: 'https://staging.example.com', testType: 'a11y', profile: 'fast' },
    });
    expect(res.status).toBe(202);
  });

  it('includes X-RateLimit-App-Concurrent header', async () => {
    const token = await makeToken();
    const res = await req('POST', '/runs', {
      token,
      body: { appId: 'capricast', environment: 'production', testType: 'a11y', profile: 'fast' },
    });
    expect(res.status).toBe(202);
    const rlHeader = res.headers.get('X-RateLimit-App-Concurrent');
    expect(rlHeader).toMatch(/^\d+\/3$/);
  });

  it('handles staging environment', async () => {
    const token = await makeToken('qa_runner', ['selfprime']);
    const res = await req('POST', '/runs', {
      token,
      body: { appId: 'selfprime', environment: 'staging', testType: 'a11y', profile: 'a11y' },
    });
    expect(res.status).toBe(202);
  });
});

// ---------------------------------------------------------------------------
// GET /runs — list
// ---------------------------------------------------------------------------

describe('GET /runs', () => {
  it('returns empty list with default pagination', async () => {
    const token = await makeToken('qa_viewer');
    const res = await req('GET', '/runs', { token });
    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(body['total']).toBe(0);
    expect(Array.isArray(body['runs'])).toBe(true);
    expect(body['limit']).toBe(20);
    expect(body['offset']).toBe(0);
  });

  it('returns runs matching appId filter', async () => {
    vi.mocked(listRuns).mockResolvedValue({ runs: [sampleRun] as never[], total: 1 });
    const token = await makeToken('qa_viewer');
    const res = await req('GET', '/runs?appId=capricast', { token });
    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(body['total']).toBe(1);
  });

  it('admin can list without appId filter', async () => {
    const token = await makeToken('qa_admin', []);
    vi.mocked(listRuns).mockResolvedValue({ runs: [sampleRun] as never[], total: 5 });
    const res = await req('GET', '/runs', { token });
    expect(res.status).toBe(200);
  });

  it('respects limit + offset query params', async () => {
    const token = await makeToken('qa_viewer');
    const res = await req('GET', '/runs?limit=50&offset=10', { token });
    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(body['limit']).toBe(50);
    expect(body['offset']).toBe(10);
  });
});

// ---------------------------------------------------------------------------
// GET /runs/:id/status
// ---------------------------------------------------------------------------

describe('GET /runs/:id/status', () => {
  it('returns 200 with summary for passed run', async () => {
    vi.mocked(getRunById).mockResolvedValue(sampleRun as never);
    const token = await makeToken();
    const res = await req('GET', '/runs/run-test-id/status', { token });
    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(body['status']).toBe('passed');
    expect(body['summary']).toBeDefined();
  });

  it('returns progress for pending run', async () => {
    vi.mocked(getRunById).mockResolvedValue({
      ...sampleRun,
      status: 'pending',
      started_at: new Date(Date.now() - 5000).toISOString(),
    } as never);
    const token = await makeToken();
    const res = await req('GET', '/runs/run-test-id/status', { token });
    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(body['progress']).toBeDefined();
  });

  it('returns progress for running run', async () => {
    vi.mocked(getRunById).mockResolvedValue({
      ...sampleRun,
      status: 'running',
      started_at: new Date(Date.now() - 10_000).toISOString(),
    } as never);
    const token = await makeToken();
    const res = await req('GET', '/runs/run-test-id/status', { token });
    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    const progress = body['progress'] as Record<string, unknown>;
    expect(progress['currentPhase']).toBe('auditing');
  });

  it('returns errorMessage for error run', async () => {
    vi.mocked(getRunById).mockResolvedValue({
      ...sampleRun,
      status: 'error',
      error_message: 'browser-agent timed out',
    } as never);
    const token = await makeToken();
    const res = await req('GET', '/runs/run-test-id/status', { token });
    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(body['errorMessage']).toBe('browser-agent timed out');
  });

  it('returns 404 for unknown runId', async () => {
    vi.mocked(getRunById).mockResolvedValue(null);
    const token = await makeToken();
    const res = await req('GET', '/runs/missing-id/status', { token });
    expect(res.status).toBe(404);
  });

  it('returns 401 when run belongs to different app', async () => {
    vi.mocked(getRunById).mockResolvedValue({ ...sampleRun, app_id: 'selfprime' } as never);
    const token = await makeToken('qa_runner', ['capricast']); // no selfprime
    const res = await req('GET', '/runs/run-test-id/status', { token });
    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// GET /runs/:id/results
// ---------------------------------------------------------------------------

describe('GET /runs/:id/results', () => {
  it('returns results grouped by category', async () => {
    vi.mocked(getRunById).mockResolvedValue(sampleRun as never);
    vi.mocked(getResultsByRunId).mockResolvedValue([sampleResult as never]);
    const token = await makeToken();
    const res = await req('GET', '/runs/run-test-id/results', { token });
    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(body['runId']).toBe('run-test-id');
    const results = body['results'] as Record<string, unknown[]>;
    expect(results['axe']).toHaveLength(1);
    expect(results['network']).toHaveLength(0);
    expect(results['consoleErrors']).toHaveLength(0);
  });

  it('groups network results separately', async () => {
    const networkResult = { ...sampleResult, category: 'network' };
    vi.mocked(getRunById).mockResolvedValue(sampleRun as never);
    vi.mocked(getResultsByRunId).mockResolvedValue([
      sampleResult as never,
      networkResult as never,
    ]);
    const token = await makeToken();
    const res = await req('GET', '/runs/run-test-id/results', { token });
    const body = await res.json() as Record<string, unknown>;
    const results = body['results'] as Record<string, unknown[]>;
    expect(results['axe']).toHaveLength(1);
    expect(results['network']).toHaveLength(1);
  });

  it('returns 404 for unknown run', async () => {
    vi.mocked(getRunById).mockResolvedValue(null);
    const token = await makeToken();
    const res = await req('GET', '/runs/missing-id/results', { token });
    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// POST /runs/:id/create-issue
// ---------------------------------------------------------------------------

describe('POST /runs/:id/create-issue', () => {
  it('returns 503 when GITHUB_QA_TOKEN not configured', async () => {
    vi.mocked(getRunById).mockResolvedValue(sampleRun as never);
    const token = await makeToken('qa_runner');
    const res = await req('POST', '/runs/run-test-id/create-issue', {
      token,
      body: {},
    });
    expect(res.status).toBe(503);
  });

  it('creates GitHub issue and returns issueUrl', async () => {
    vi.mocked(getRunById).mockResolvedValue(sampleRun as never);
    vi.mocked(getResultsByRunId).mockResolvedValue([sampleResult as never]);

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({ html_url: 'https://github.com/Org/repo/issues/42', number: 42 }),
        { status: 201, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    const token = await makeToken('qa_runner');
    const env = makeEnv({ GITHUB_QA_TOKEN: 'ghp-test-token' });
    const res = await req('POST', '/runs/run-test-id/create-issue', {
      token,
      env,
      body: { labels: ['qa-finding'] },
    });
    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(body['issueUrl']).toBe('https://github.com/Org/repo/issues/42');
    expect(body['issueNumber']).toBe(42);

    fetchSpy.mockRestore();
  });

  it('returns 502 on GitHub API error', async () => {
    vi.mocked(getRunById).mockResolvedValue(sampleRun as never);
    vi.mocked(getResultsByRunId).mockResolvedValue([]);

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('Unauthorized', { status: 401 }),
    );

    const token = await makeToken('qa_runner');
    const env = makeEnv({ GITHUB_QA_TOKEN: 'ghp-bad-token' });
    const res = await req('POST', '/runs/run-test-id/create-issue', {
      token,
      env,
      body: {},
    });
    expect(res.status).toBe(502);

    fetchSpy.mockRestore();
  });

  it('returns 404 for unknown run', async () => {
    vi.mocked(getRunById).mockResolvedValue(null);
    const token = await makeToken('qa_runner');
    const env = makeEnv({ GITHUB_QA_TOKEN: 'ghp-test' });
    const res = await req('POST', '/runs/missing-id/create-issue', {
      token,
      env,
      body: {},
    });
    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// POST /runs/:id/rerun
// ---------------------------------------------------------------------------

describe('POST /runs/:id/rerun', () => {
  it('returns 202 with new runId and parentRunId', async () => {
    vi.mocked(getRunById).mockResolvedValue(sampleRun as never);
    vi.mocked(insertRun).mockResolvedValue('new-run-id');
    const token = await makeToken('qa_runner');
    const res = await req('POST', '/runs/run-test-id/rerun', { token, body: {} });
    expect(res.status).toBe(202);
    const body = await res.json() as Record<string, unknown>;
    expect(body['runId']).toBe('new-run-id');
    expect(body['parentRunId']).toBe('run-test-id');
  });

  it('accepts overrideProfile', async () => {
    vi.mocked(getRunById).mockResolvedValue(sampleRun as never);
    vi.mocked(insertRun).mockResolvedValue('rerun-id');
    const token = await makeToken('qa_runner');
    const res = await req('POST', '/runs/run-test-id/rerun', {
      token,
      body: { overrideProfile: 'full' },
    });
    expect(res.status).toBe(202);
    const body = await res.json() as Record<string, unknown>;
    expect(body['profile']).toBe('full');
  });

  it('returns 429 when concurrent limit reached', async () => {
    vi.mocked(getRunById).mockResolvedValue(sampleRun as never);
    const envWithFullKv = makeEnv({
      RATE_LIMIT_KV: {
        get: vi.fn(async (key: string) => (key.startsWith('rl:concurrent:') ? '3' : null)),
        put: vi.fn().mockResolvedValue(undefined),
        delete: vi.fn().mockResolvedValue(undefined),
      },
    });
    const token = await makeToken('qa_runner');
    const res = await req('POST', '/runs/run-test-id/rerun', {
      token,
      env: envWithFullKv,
      body: {},
    });
    expect(res.status).toBe(429);
  });

  it('returns 404 for unknown original run', async () => {
    vi.mocked(getRunById).mockResolvedValue(null);
    const token = await makeToken('qa_runner');
    const res = await req('POST', '/runs/missing-id/rerun', { token, body: {} });
    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// PATCH /runs/:id/results/:resultId — acknowledge
// ---------------------------------------------------------------------------

describe('PATCH /runs/:id/results/:resultId', () => {
  it('acknowledges a finding and returns updated status', async () => {
    vi.mocked(getRunById).mockResolvedValue(sampleRun as never);
    const token = await makeToken('qa_runner');
    const res = await req('PATCH', '/runs/run-test-id/results/result-1', {
      token,
      body: { status: 'acknowledged' },
    });
    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(body['status']).toBe('acknowledged');
    expect(updateResultStatus).toHaveBeenCalledWith(
      expect.any(String),
      'result-1',
      'acknowledged',
      'test-user',
    );
  });

  it('marks finding as fixed', async () => {
    vi.mocked(getRunById).mockResolvedValue(sampleRun as never);
    const token = await makeToken('qa_runner');
    const res = await req('PATCH', '/runs/run-test-id/results/result-1', {
      token,
      body: { status: 'fixed' },
    });
    expect(res.status).toBe(200);
    // fixed status should not pass sub/email as acknowledgedBy
    expect(updateResultStatus).toHaveBeenCalledWith(
      expect.any(String),
      'result-1',
      'fixed',
      undefined,
    );
  });

  it('returns 422 for invalid status value', async () => {
    vi.mocked(getRunById).mockResolvedValue(sampleRun as never);
    const token = await makeToken('qa_runner');
    const res = await req('PATCH', '/runs/run-test-id/results/result-1', {
      token,
      body: { status: 'not-a-valid-status' },
    });
    expect(res.status).toBe(422);
  });

  it('returns 404 for unknown run', async () => {
    vi.mocked(getRunById).mockResolvedValue(null);
    const token = await makeToken('qa_runner');
    const res = await req('PATCH', '/runs/missing-id/results/result-1', {
      token,
      body: { status: 'acknowledged' },
    });
    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// GET /apps/:appId/health
// ---------------------------------------------------------------------------

describe('GET /apps/:appId/health', () => {
  it('returns healthy/green when last run passed with no violations', async () => {
    vi.mocked(getLatestRun).mockResolvedValue(sampleRun as never);
    vi.mocked(countOpenViolations).mockResolvedValue({ critical: 0, serious: 0, moderate: 2, total: 2 });
    const token = await makeToken();
    const res = await req('GET', '/apps/capricast/health', { token });
    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(body['statusLabel']).toBe('healthy');
    expect(body['statusColor']).toBe('green');
    expect(body['appId']).toBe('capricast');
  });

  it('returns critical/red when critical violations exist', async () => {
    vi.mocked(getLatestRun).mockResolvedValue(sampleRun as never);
    vi.mocked(countOpenViolations).mockResolvedValue({ critical: 3, serious: 0, moderate: 0, total: 3 });
    const token = await makeToken();
    const res = await req('GET', '/apps/capricast/health', { token });
    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(body['statusColor']).toBe('red');
    expect(body['statusLabel']).toBe('critical');
  });

  it('returns degraded/yellow when last run failed', async () => {
    vi.mocked(getLatestRun).mockResolvedValue({ ...sampleRun, status: 'failed' } as never);
    vi.mocked(countOpenViolations).mockResolvedValue({ critical: 0, serious: 0, moderate: 0, total: 0 });
    const token = await makeToken();
    const res = await req('GET', '/apps/capricast/health', { token });
    const body = await res.json() as Record<string, unknown>;
    expect(body['statusColor']).toBe('yellow');
    expect(body['statusLabel']).toBe('degraded');
  });

  it('returns degraded/yellow when serious violations exist', async () => {
    vi.mocked(getLatestRun).mockResolvedValue(sampleRun as never);
    vi.mocked(countOpenViolations).mockResolvedValue({ critical: 0, serious: 2, moderate: 0, total: 2 });
    const token = await makeToken();
    const res = await req('GET', '/apps/capricast/health', { token });
    const body = await res.json() as Record<string, unknown>;
    expect(body['statusColor']).toBe('yellow');
  });

  it('returns unknown/yellow when no run exists', async () => {
    vi.mocked(getLatestRun).mockResolvedValue(null);
    vi.mocked(countOpenViolations).mockResolvedValue({ critical: 0, serious: 0, moderate: 0, total: 0 });
    const token = await makeToken();
    const res = await req('GET', '/apps/capricast/health', { token });
    const body = await res.json() as Record<string, unknown>;
    expect(body['statusLabel']).toBe('unknown');
  });

  it('returns checking/yellow for pending run status', async () => {
    vi.mocked(getLatestRun).mockResolvedValue({ ...sampleRun, status: 'pending' } as never);
    vi.mocked(countOpenViolations).mockResolvedValue({ critical: 0, serious: 0, moderate: 0, total: 0 });
    const token = await makeToken();
    const res = await req('GET', '/apps/capricast/health', { token });
    const body = await res.json() as Record<string, unknown>;
    expect(body['statusLabel']).toBe('checking');
  });

  it('returns 404 for unknown appId', async () => {
    const token = await makeToken('qa_admin', []);
    const res = await req('GET', '/apps/not-a-real-app/health', { token });
    expect(res.status).toBe(404);
  });

  it('filters by environment query param', async () => {
    vi.mocked(getLatestRun).mockResolvedValue(sampleRun as never);
    vi.mocked(countOpenViolations).mockResolvedValue({ critical: 0, serious: 0, moderate: 0, total: 0 });
    const token = await makeToken();
    const res = await req('GET', '/apps/capricast/health?environment=staging', { token });
    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(body['environment']).toBe('staging');
  });
});
