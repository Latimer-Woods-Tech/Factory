/**
 * Tests for POST /v1/audit (P2.13g).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import app from '../src/index.js';
import { createDb } from '@latimer-woods-tech/neon';

vi.mock('@latimer-woods-tech/neon', async (importOriginal) => {
  const real = await importOriginal<typeof import('@latimer-woods-tech/neon')>();
  return { ...real, createDb: vi.fn() };
});

const AUDIT_KEY = 'test-audit-ingest-key';

const mockInsert = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(createDb).mockReturnValue({
    insert: () => ({
      values: () => ({
        returning: mockInsert,
      }),
    }),
  } as unknown as ReturnType<typeof createDb>);
  mockInsert.mockResolvedValue([{ id: 'audit-row-uuid' }]);
});

function makeCtx(): ExecutionContext {
  return {
    waitUntil: vi.fn((p: Promise<unknown>) => { p.catch(() => {}); }),
    passThroughOnException: vi.fn(),
  } as unknown as ExecutionContext;
}

function baseEnv(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    DB: { connectionString: 'postgres://test' },
    JWT_SIGNING_KEY: 'test-key',
    AUDIT_INGEST_KEY: AUDIT_KEY,
    ENVIRONMENT: 'test',
    ...overrides,
  };
}

const VALID_BODY = {
  actor: 'operator@example.com',
  action: 'deploy',
  resource: 'worker.factory-core-api',
  result: 'success',
  acted_at: '2026-05-26T10:00:00Z',
};

describe('POST /v1/audit', () => {
  it('returns 201 with id on valid request', async () => {
    const req = new Request('http://localhost/v1/audit', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${AUDIT_KEY}`,
      },
      body: JSON.stringify(VALID_BODY),
    });
    const res = await app.fetch(req, baseEnv(), makeCtx());
    expect(res.status).toBe(201);
    const json = await res.json() as { id: string };
    expect(json.id).toBe('audit-row-uuid');
  });

  it('returns 401 when AUDIT_INGEST_KEY is not configured', async () => {
    const req = new Request('http://localhost/v1/audit', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${AUDIT_KEY}`,
      },
      body: JSON.stringify(VALID_BODY),
    });
    const res = await app.fetch(req, baseEnv({ AUDIT_INGEST_KEY: undefined }), makeCtx());
    expect(res.status).toBe(401);
  });

  it('returns 401 with missing bearer token', async () => {
    const req = new Request('http://localhost/v1/audit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(VALID_BODY),
    });
    const res = await app.fetch(req, baseEnv(), makeCtx());
    expect(res.status).toBe(401);
  });

  it('returns 401 with wrong key', async () => {
    const req = new Request('http://localhost/v1/audit', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer wrong-key',
      },
      body: JSON.stringify(VALID_BODY),
    });
    const res = await app.fetch(req, baseEnv(), makeCtx());
    expect(res.status).toBe(401);
  });

  it('returns 400 with invalid body (missing action)', async () => {
    const req = new Request('http://localhost/v1/audit', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${AUDIT_KEY}`,
      },
      body: JSON.stringify({ actor: 'op', resource: 'x', acted_at: '2026-01-01T00:00:00Z' }),
    });
    const res = await app.fetch(req, baseEnv(), makeCtx());
    expect(res.status).toBe(400);
  });

  it('returns 400 with non-JSON body', async () => {
    const req = new Request('http://localhost/v1/audit', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${AUDIT_KEY}`,
      },
      body: 'not-json',
    });
    const res = await app.fetch(req, baseEnv(), makeCtx());
    expect(res.status).toBe(400);
  });
});
