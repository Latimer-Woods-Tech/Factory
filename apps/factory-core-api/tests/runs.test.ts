/**
 * Unit tests for POST /v1/runs/mirror (P1.9).
 * Mocks createRunsMirrorDb at module level — no live DB connection.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import app from '../src/index.js';
import { createRunsMirrorDb } from '../src/runs-db.js';
import type { RunsMirrorDb } from '../src/runs-db.js';

vi.mock('../src/runs-db.js', async (importOriginal) => {
  const real = await importOriginal<typeof import('../src/runs-db.js')>();
  return { ...real, createRunsMirrorDb: vi.fn() };
});

const PUSH_KEY = 'test-supervisor-push-key-1234567';

function baseEnv(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    JWT_SIGNING_KEY: 'unused-in-this-route',
    DB: { connectionString: 'postgres://test' },
    SUPERVISOR_PUSH_KEY: PUSH_KEY,
    ENVIRONMENT: 'test',
    ...overrides,
  };
}

function makeCtx(): ExecutionContext {
  return {
    waitUntil: vi.fn((p: Promise<unknown>) => { p.catch(() => {}); }),
    passThroughOnException: vi.fn(),
  } as unknown as ExecutionContext;
}

const VALID_BODY = {
  id: 'aaa00000-0000-0000-0000-000000000001',
  template_id: 'tmpl-1',
  template_version: 1,
  description: 'Test run',
  source: 'github:issue',
  status: 'passed',
  dry_run: false,
  pr_url: null,
  started_at: new Date(1_000_000_000).toISOString(),
  finished_at: new Date(1_000_001_000).toISOString(),
};

let upsertRunMock: ReturnType<typeof vi.fn>;
let mockDb: RunsMirrorDb;

beforeEach(() => {
  upsertRunMock = vi.fn().mockResolvedValue(undefined);
  mockDb = { upsertRun: upsertRunMock as RunsMirrorDb['upsertRun'] };
  vi.mocked(createRunsMirrorDb).mockReturnValue(mockDb);
});

function runRequest(token: string | null, body: unknown): Request {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (token) headers['authorization'] = `Bearer ${token}`;
  return new Request('https://factory-core-api.test/v1/runs/mirror', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
}

describe('POST /v1/runs/mirror', () => {
  it('200 + run_id on valid passed run', async () => {
    const res = await app.fetch(runRequest(PUSH_KEY, VALID_BODY), baseEnv(), makeCtx());
    expect(res.status).toBe(200);
    const data = await res.json() as Record<string, unknown>;
    expect(data['ok']).toBe(true);
    expect(data['run_id']).toBe(VALID_BODY.id);
    expect(upsertRunMock).toHaveBeenCalledOnce();
  });

  it('503 when SUPERVISOR_PUSH_KEY is not set', async () => {
    const res = await app.fetch(
      runRequest(PUSH_KEY, VALID_BODY),
      baseEnv({ SUPERVISOR_PUSH_KEY: undefined }),
      makeCtx(),
    );
    expect(res.status).toBe(503);
    expect(upsertRunMock).not.toHaveBeenCalled();
  });

  it('401 when Authorization header is absent', async () => {
    const res = await app.fetch(runRequest(null, VALID_BODY), baseEnv(), makeCtx());
    expect(res.status).toBe(401);
  });

  it('401 when credential does not match', async () => {
    const res = await app.fetch(runRequest('wrong-key', VALID_BODY), baseEnv(), makeCtx());
    expect(res.status).toBe(401);
  });

  it('400 when id is not a valid UUID', async () => {
    const res = await app.fetch(
      runRequest(PUSH_KEY, { ...VALID_BODY, id: 'not-a-uuid' }),
      baseEnv(),
      makeCtx(),
    );
    expect(res.status).toBe(400);
  });

  it('400 when status is not a recognised value', async () => {
    const res = await app.fetch(
      runRequest(PUSH_KEY, { ...VALID_BODY, status: 'unknown_status' }),
      baseEnv(),
      makeCtx(),
    );
    expect(res.status).toBe(400);
  });

  it('400 when status is non-terminal (planned)', async () => {
    const res = await app.fetch(
      runRequest(PUSH_KEY, { ...VALID_BODY, status: 'planned' }),
      baseEnv(),
      makeCtx(),
    );
    expect(res.status).toBe(400);
  });

  it('400 when started_at is not ISO datetime', async () => {
    const res = await app.fetch(
      runRequest(PUSH_KEY, { ...VALID_BODY, started_at: 'not-a-date' }),
      baseEnv(),
      makeCtx(),
    );
    expect(res.status).toBe(400);
  });

  it('passes failed_execution status through', async () => {
    const res = await app.fetch(
      runRequest(PUSH_KEY, { ...VALID_BODY, status: 'failed_execution' }),
      baseEnv(),
      makeCtx(),
    );
    expect(res.status).toBe(200);
    expect(upsertRunMock).toHaveBeenCalledOnce();
    const call = upsertRunMock.mock.calls[0]![0] as Record<string, unknown>;
    expect(call['status']).toBe('failed_execution');
  });

  it('passes failed_verification status through', async () => {
    const res = await app.fetch(
      runRequest(PUSH_KEY, { ...VALID_BODY, status: 'failed_verification' }),
      baseEnv(),
      makeCtx(),
    );
    expect(res.status).toBe(200);
    expect(upsertRunMock).toHaveBeenCalledOnce();
  });

  it('maps dry_run=true to dryRun=true in upsertRun call', async () => {
    const res = await app.fetch(
      runRequest(PUSH_KEY, { ...VALID_BODY, dry_run: true }),
      baseEnv(),
      makeCtx(),
    );
    expect(res.status).toBe(200);
    const call = upsertRunMock.mock.calls[0]![0] as Record<string, unknown>;
    expect(call['dryRun']).toBe(true);
  });

  it('sets finishedAt=undefined when finished_at is null', async () => {
    const res = await app.fetch(
      runRequest(PUSH_KEY, { ...VALID_BODY, finished_at: null }),
      baseEnv(),
      makeCtx(),
    );
    expect(res.status).toBe(200);
    const call = upsertRunMock.mock.calls[0]![0] as Record<string, unknown>;
    expect(call['finishedAt']).toBeUndefined();
  });

  it('500 when upsertRun throws', async () => {
    upsertRunMock.mockRejectedValue(new Error('db error'));
    const res = await app.fetch(runRequest(PUSH_KEY, VALID_BODY), baseEnv(), makeCtx());
    expect(res.status).toBe(500);
  });
});
