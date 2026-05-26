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

async function mintToken(aud = 'artifacts-video'): Promise<string> {
  const { token } = await signScopedToken(
    {
      iss: 'factory-core-api',
      sub: 'repo:Latimer-Woods-Tech/test:ref:refs/heads/main',
      aud,
      repository: 'Latimer-Woods-Tech/test',
      repository_owner: 'Latimer-Woods-Tech',
    },
    SIGNING_KEY,
    300,
  );
  return token;
}

function artifactRequest(token: string | null, body: unknown): Request {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (token) headers['authorization'] = `Bearer ${token}`;
  return new Request('https://factory-core-api.test/v1/artifacts', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
}

const VALID_BODY = {
  artifact_type: 'video',
  producer_type: 'github-workflow',
  producer_ref: 'run-789',
  uri: 'r2://factory-videos/output.mp4',
  observed_at: new Date().toISOString(),
};

let mockDb: IngestDb;

beforeEach(() => {
  mockDb = {
    findEventBySourceId: vi.fn().mockResolvedValue(null),
    insertEvent: vi.fn().mockResolvedValue({ id: 'evt-art-456', inserted: true }),
    insertGate: vi.fn().mockResolvedValue(undefined),
    insertArtifact: vi.fn().mockResolvedValue(undefined),
    markDerived: vi.fn().mockResolvedValue(undefined),
    markFailed: vi.fn().mockResolvedValue(undefined),
  };
  vi.mocked(createIngestDb).mockReturnValue(mockDb);
});

describe('POST /v1/artifacts', () => {
  it('201 + event_id on valid artifact payload', async () => {
    const token = await mintToken();
    const res = await app.fetch(artifactRequest(token, VALID_BODY), baseEnv(), makeCtx());
    expect(res.status).toBe(201);
    const body = await res.json() as Record<string, unknown>;
    expect(body['ok']).toBe(true);
    expect(body['event_id']).toBe('evt-art-456');
    expect(mockDb.insertEvent).toHaveBeenCalledOnce();
    expect(mockDb.insertArtifact).toHaveBeenCalledOnce();
    expect(mockDb.markDerived).toHaveBeenCalledWith('evt-art-456');
  });

  it('401 when no Authorization header', async () => {
    const res = await app.fetch(artifactRequest(null, VALID_BODY), baseEnv(), makeCtx());
    expect(res.status).toBe(401);
  });

  it("401 when token audience does not start with 'artifacts-'", async () => {
    const token = await mintToken('gates-ci'); // wrong family
    const res = await app.fetch(artifactRequest(token, VALID_BODY), baseEnv(), makeCtx());
    expect(res.status).toBe(401);
  });

  it('400 when artifact_type is not a recognised value', async () => {
    const token = await mintToken();
    const res = await app.fetch(
      artifactRequest(token, { ...VALID_BODY, artifact_type: 'unknown-type' }),
      baseEnv(),
      makeCtx(),
    );
    expect(res.status).toBe(400);
  });

  it('400 when producer_type is invalid', async () => {
    const token = await mintToken();
    const res = await app.fetch(
      artifactRequest(token, { ...VALID_BODY, producer_type: 'bad-producer' }),
      baseEnv(),
      makeCtx(),
    );
    expect(res.status).toBe(400);
  });

  it('400 when uri lacks a scheme', async () => {
    const token = await mintToken();
    const res = await app.fetch(
      artifactRequest(token, { ...VALID_BODY, uri: 'no-scheme-here' }),
      baseEnv(),
      makeCtx(),
    );
    expect(res.status).toBe(400);
  });

  it('400 when observed_at is missing', async () => {
    const token = await mintToken();
    const { observed_at: _, ...bodyWithout } = VALID_BODY;
    const res = await app.fetch(artifactRequest(token, bodyWithout), baseEnv(), makeCtx());
    expect(res.status).toBe(400);
  });

  it('500 + marks event failed when derivation (insertArtifact) throws', async () => {
    vi.mocked(mockDb.insertArtifact).mockRejectedValue(new Error('unique constraint'));
    const token = await mintToken();
    const res = await app.fetch(artifactRequest(token, VALID_BODY), baseEnv(), makeCtx());
    expect(res.status).toBe(500);
    expect(mockDb.markFailed).toHaveBeenCalledWith('evt-art-456', 'unique constraint');
    expect(mockDb.markDerived).not.toHaveBeenCalled();
  });

  describe('source_event_id idempotency', () => {
    const BODY_WITH_ID = { ...VALID_BODY, source_event_id: 'render-run-12345-video' };

    it('201 + ingests when source_event_id is new', async () => {
      const token = await mintToken();
      const res = await app.fetch(artifactRequest(token, BODY_WITH_ID), baseEnv(), makeCtx());
      expect(res.status).toBe(201);
      expect(mockDb.findEventBySourceId).toHaveBeenCalledWith(
        'video-pipeline',
        'render-run-12345-video',
      );
      expect(mockDb.insertEvent).toHaveBeenCalledOnce();
      expect(vi.mocked(mockDb.insertEvent).mock.calls[0]![0]).toMatchObject({
        sourceEventId: 'render-run-12345-video',
      });
    });

    it('200 + returns existing event without re-inserting on duplicate source_event_id', async () => {
      vi.mocked(mockDb.findEventBySourceId).mockResolvedValue({ id: 'evt-existing-999' });
      const token = await mintToken();
      const res = await app.fetch(artifactRequest(token, BODY_WITH_ID), baseEnv(), makeCtx());
      expect(res.status).toBe(200);
      const body = (await res.json()) as Record<string, unknown>;
      expect(body['ok']).toBe(true);
      expect(body['event_id']).toBe('evt-existing-999');
      expect(mockDb.insertEvent).not.toHaveBeenCalled();
      expect(mockDb.insertArtifact).not.toHaveBeenCalled();
    });

    it('does not consult the idempotency index when source_event_id is omitted', async () => {
      const token = await mintToken();
      const res = await app.fetch(artifactRequest(token, VALID_BODY), baseEnv(), makeCtx());
      expect(res.status).toBe(201);
      expect(mockDb.findEventBySourceId).not.toHaveBeenCalled();
    });

    it('200 + no duplicate artifact when a concurrent writer wins the insert race', async () => {
      // Fast-path lookup misses (TOCTOU window), but the DB unique index fires:
      // insertEvent reports inserted=false and derivation must be skipped.
      vi.mocked(mockDb.findEventBySourceId).mockResolvedValue(null);
      vi.mocked(mockDb.insertEvent).mockResolvedValue({ id: 'race-art-evt', inserted: false });
      const token = await mintToken();
      const bodyWithSourceId = { ...VALID_BODY, source_event_id: 'render-job-concurrent' };
      const res = await app.fetch(artifactRequest(token, bodyWithSourceId), baseEnv(), makeCtx());
      expect(res.status).toBe(200);
      const body = (await res.json()) as Record<string, unknown>;
      expect(body['event_id']).toBe('race-art-evt');
      expect(mockDb.insertArtifact).not.toHaveBeenCalled();
      expect(mockDb.markDerived).not.toHaveBeenCalled();
    });
  });
});
