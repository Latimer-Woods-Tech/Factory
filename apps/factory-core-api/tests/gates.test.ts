import { describe, it, expect, vi, beforeEach } from 'vitest';
import app from '../src/index.js';
import { signScopedToken } from '../src/jwt.js';
import { createIngestDb } from '../src/ingest-db.js';
import type { IngestDb } from '../src/ingest-db.js';

vi.mock('../src/ingest-db.js', async (importOriginal) => {
  const real = await importOriginal<typeof import('../src/ingest-db.js')>();
  return { ...real, createIngestDb: vi.fn() };
});

const SIGNING_KEY = 'test-root-signing-key-0123456789';

function baseEnv(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    JWT_SIGNING_KEY: SIGNING_KEY,
    DB: { connectionString: 'postgres://test' },
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

async function mintToken(gateType = 'ci'): Promise<string> {
  const { token } = await signScopedToken(
    {
      iss: 'factory-core-api',
      sub: 'repo:Latimer-Woods-Tech/test:ref:refs/heads/main',
      aud: `gates-${gateType}`,
      repository: 'Latimer-Woods-Tech/test',
      repository_owner: 'Latimer-Woods-Tech',
    },
    SIGNING_KEY,
    300,
  );
  return token;
}

function gateRequest(token: string | null, body: unknown): Request {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (token) headers['authorization'] = `Bearer ${token}`;
  return new Request('https://factory-core-api.test/v1/gates', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
}

const VALID_BODY = {
  gate_type: 'ci',
  source_system: 'github-actions',
  source_ref: 'run-123',
  subject_type: 'pr',
  subject_ref: 'refs/heads/main',
  state: 'passed',
  observed_at: new Date().toISOString(),
};

let mockDb: IngestDb;

beforeEach(() => {
  mockDb = {
    findEventBySourceId: vi.fn().mockResolvedValue(null),
    insertEvent: vi.fn().mockResolvedValue({ id: 'evt-abc-123' }),
    insertGate: vi.fn().mockResolvedValue(undefined),
    insertArtifact: vi.fn().mockResolvedValue(undefined),
    markDerived: vi.fn().mockResolvedValue(undefined),
    markFailed: vi.fn().mockResolvedValue(undefined),
  };
  vi.mocked(createIngestDb).mockReturnValue(mockDb);
});

describe('POST /v1/gates', () => {
  it('201 + event_id on valid gate payload', async () => {
    const token = await mintToken('ci');
    const res = await app.fetch(gateRequest(token, VALID_BODY), baseEnv(), makeCtx());
    expect(res.status).toBe(201);
    const body = await res.json() as Record<string, unknown>;
    expect(body['ok']).toBe(true);
    expect(body['event_id']).toBe('evt-abc-123');
    expect(mockDb.insertEvent).toHaveBeenCalledOnce();
    expect(mockDb.insertGate).toHaveBeenCalledOnce();
    expect(mockDb.markDerived).toHaveBeenCalledWith('evt-abc-123');
  });

  it('401 when no Authorization header', async () => {
    const res = await app.fetch(gateRequest(null, VALID_BODY), baseEnv(), makeCtx());
    expect(res.status).toBe(401);
  });

  it('401 when token audience does not match gate_type', async () => {
    const token = await mintToken('canary'); // aud=gates-canary but gate_type=ci
    const res = await app.fetch(gateRequest(token, VALID_BODY), baseEnv(), makeCtx());
    expect(res.status).toBe(401);
  });

  it('400 when gate_type is not a recognised value', async () => {
    const token = await mintToken('ci');
    const res = await app.fetch(
      gateRequest(token, { ...VALID_BODY, gate_type: 'not-a-real-gate' }),
      baseEnv(),
      makeCtx(),
    );
    expect(res.status).toBe(400);
  });

  it('400 when source_system is invalid', async () => {
    const token = await mintToken('ci');
    const res = await app.fetch(
      gateRequest(token, { ...VALID_BODY, source_system: 'bad-system' }),
      baseEnv(),
      makeCtx(),
    );
    expect(res.status).toBe(400);
  });

  it('400 when required observed_at is missing', async () => {
    const token = await mintToken('ci');
    const { observed_at: _, ...bodyWithout } = VALID_BODY;
    const res = await app.fetch(gateRequest(token, bodyWithout), baseEnv(), makeCtx());
    expect(res.status).toBe(400);
  });

  it('200 + existing event_id on idempotent replay (source_event_id match)', async () => {
    vi.mocked(mockDb.findEventBySourceId).mockResolvedValue({ id: 'existing-evt-999' });
    const token = await mintToken('ci');
    const bodyWithSourceId = { ...VALID_BODY, source_event_id: 'gh-run-456' };
    const res = await app.fetch(gateRequest(token, bodyWithSourceId), baseEnv(), makeCtx());
    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(body['ok']).toBe(true);
    expect(body['event_id']).toBe('existing-evt-999');
    expect(mockDb.insertEvent).not.toHaveBeenCalled();
  });

  it('500 + marks event failed when derivation (insertGate) throws', async () => {
    vi.mocked(mockDb.insertGate).mockRejectedValue(new Error('DB constraint violation'));
    const token = await mintToken('ci');
    const res = await app.fetch(gateRequest(token, VALID_BODY), baseEnv(), makeCtx());
    expect(res.status).toBe(500);
    expect(mockDb.markFailed).toHaveBeenCalledWith('evt-abc-123', 'DB constraint violation');
    expect(mockDb.markDerived).not.toHaveBeenCalled();
  });

  describe('WEBHOOK_FANOUT_INGEST_KEY service-key auth', () => {
    const SERVICE_KEY = 'svc-webhook-fanout-key-abcdef0123456789';

    it('201 when authenticated with the service key (no JWT, no aud check)', async () => {
      const res = await app.fetch(
        gateRequest(SERVICE_KEY, VALID_BODY),
        baseEnv({ WEBHOOK_FANOUT_INGEST_KEY: SERVICE_KEY }),
        makeCtx(),
      );
      expect(res.status).toBe(201);
      const body = await res.json() as Record<string, unknown>;
      expect(body['event_id']).toBe('evt-abc-123');
      expect(mockDb.insertEvent).toHaveBeenCalledOnce();
      expect(vi.mocked(mockDb.insertEvent).mock.calls[0]![0]).toMatchObject({
        ingestActor: 'service:webhook-fanout',
      });
    });

    it('201 with the service key for any gate_type (bypasses per-type aud)', async () => {
      const res = await app.fetch(
        gateRequest(SERVICE_KEY, { ...VALID_BODY, gate_type: 'codeowner-review' }),
        baseEnv({ WEBHOOK_FANOUT_INGEST_KEY: SERVICE_KEY }),
        makeCtx(),
      );
      expect(res.status).toBe(201);
    });

    it('401 when bearer is neither a valid JWT nor the service key', async () => {
      const res = await app.fetch(
        gateRequest('not-the-key-and-not-a-jwt', VALID_BODY),
        baseEnv({ WEBHOOK_FANOUT_INGEST_KEY: SERVICE_KEY }),
        makeCtx(),
      );
      expect(res.status).toBe(401);
    });

    it('does not honour the service key when WEBHOOK_FANOUT_INGEST_KEY is unset', async () => {
      const res = await app.fetch(gateRequest(SERVICE_KEY, VALID_BODY), baseEnv(), makeCtx());
      expect(res.status).toBe(401);
    });
  });
});
