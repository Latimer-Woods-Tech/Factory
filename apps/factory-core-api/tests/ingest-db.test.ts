/**
 * Unit tests for the race-safe two-step ingest DB layer.
 *
 * These exercise createIngestDb / twoStepIngest directly (the route tests mock
 * createIngestDb away), proving the ON CONFLICT DO NOTHING dedup path: a
 * concurrent writer that loses the insert race must NOT re-derive, and the
 * existing event id is returned.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// A single fluent stub: every builder method returns `this` (the chain), and the
// object is itself awaitable, resolving to whatever rows are queued. This mimics
// the minimal Drizzle query-builder surface that createIngestDb exercises.
type Chainable = (...args: unknown[]) => FluentStub;
type Terminal = (...args: unknown[]) => Promise<Array<Record<string, unknown>>>;

interface FluentStub extends PromiseLike<unknown> {
  select: Chainable;
  insert: Chainable;
  update: Chainable;
  from: Chainable;
  values: Chainable;
  set: Chainable;
  where: Chainable;
  onConflictDoNothing: Chainable;
  limit: Terminal;
  returning: Terminal;
}

/** Records the last insert/select chain so assertions can inspect args. */
const calls = {
  selectRows: [] as Array<Record<string, unknown>>,
  returningRows: [] as Array<Record<string, unknown>>,
  onConflictArg: undefined as unknown,
  insertedValues: undefined as unknown,
};

function makeFluent(): FluentStub {
  const chain: FluentStub = {
    select: (): FluentStub => chain,
    from: (): FluentStub => chain,
    update: (): FluentStub => chain,
    set: (): FluentStub => chain,
    where: (): FluentStub => chain,
    insert: (): FluentStub => chain,
    values: (...args: unknown[]): FluentStub => {
      calls.insertedValues = args[0];
      return chain;
    },
    onConflictDoNothing: (...args: unknown[]): FluentStub => {
      calls.onConflictArg = args[0];
      return chain;
    },
    // Terminal builders resolve to a row array.
    limit: (): Promise<Array<Record<string, unknown>>> => Promise.resolve(calls.selectRows),
    returning: (): Promise<Array<Record<string, unknown>>> => Promise.resolve(calls.returningRows),
    // db.update(...).set(...).where(...) and db.insert(...).values(...) are
    // awaited directly (no terminal builder) — make the chain itself awaitable.
    then: <TResult1 = unknown, TResult2 = never>(
      onfulfilled?: ((value: unknown) => TResult1 | PromiseLike<TResult1>) | null,
      onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
    ): PromiseLike<TResult1 | TResult2> => Promise.resolve(undefined).then(onfulfilled, onrejected),
  };
  return chain;
}

let fluent: FluentStub;

vi.mock('@latimer-woods-tech/neon', async (importOriginal) => {
  const real = await importOriginal<typeof import('@latimer-woods-tech/neon')>();
  return {
    ...real,
    createDb: vi.fn(() => fluent),
  };
});

// Imported after the mock is registered.
const { createIngestDb, twoStepIngest } = await import('../src/ingest-db.js');

const RAW_EVENT = {
  sourceSystem: 'github-actions',
  sourceEventType: 'gate.ci',
  sourceEventId: 'gh-run-777',
  payload: { ok: true },
  ingestActor: 'jwt-aud:gates-ci',
  derivationStatus: 'pending' as const,
  derivationTargets: ['factory_gates'],
  observedAt: new Date(),
};

beforeEach(() => {
  fluent = makeFluent();
  calls.selectRows = [];
  calls.returningRows = [];
  calls.onConflictArg = undefined;
  calls.insertedValues = undefined;
});

describe('createIngestDb.insertEvent', () => {
  it('returns inserted=true with the new id on the happy path', async () => {
    calls.returningRows = [{ id: 'new-evt-1' }];
    const db = createIngestDb({ connectionString: 'postgres://test' });
    const result = await db.insertEvent(RAW_EVENT);
    expect(result).toEqual({ id: 'new-evt-1', inserted: true });
    // Conflict target + partial-index predicate are wired through.
    expect(calls.onConflictArg).toMatchObject({ target: expect.any(Array) });
  });

  it('returns inserted=false + existing id when ON CONFLICT fires (race lost)', async () => {
    calls.returningRows = []; // ON CONFLICT DO NOTHING => no row returned
    calls.selectRows = [{ id: 'existing-evt-9' }]; // findEventBySourceId resolves it
    const db = createIngestDb({ connectionString: 'postgres://test' });
    const result = await db.insertEvent(RAW_EVENT);
    expect(result).toEqual({ id: 'existing-evt-9', inserted: false });
  });

  it('throws if a null source_event_id insert returns no row', async () => {
    calls.returningRows = [];
    const db = createIngestDb({ connectionString: 'postgres://test' });
    await expect(db.insertEvent({ ...RAW_EVENT, sourceEventId: null })).rejects.toThrow(
      /non-idempotent/,
    );
  });

  it('throws if conflict fires but no existing row can be found', async () => {
    calls.returningRows = [];
    calls.selectRows = []; // lookup also misses (should not happen, defensive)
    const db = createIngestDb({ connectionString: 'postgres://test' });
    await expect(db.insertEvent(RAW_EVENT)).rejects.toThrow(/no existing event found/);
  });

  it('allows null source_event_id rows to be inserted (partial index does not block)', async () => {
    calls.returningRows = [{ id: 'null-evt' }];
    const db = createIngestDb({ connectionString: 'postgres://test' });
    const result = await db.insertEvent({ ...RAW_EVENT, sourceEventId: null });
    expect(result).toEqual({ id: 'null-evt', inserted: true });
  });
});

describe('twoStepIngest', () => {
  it('derives + marks derived and returns created=true on a fresh insert', async () => {
    calls.returningRows = [{ id: 'fresh-evt' }];
    const db = createIngestDb({ connectionString: 'postgres://test' });
    const derive = vi.fn().mockResolvedValue(undefined);
    const result = await twoStepIngest(db, RAW_EVENT, derive);
    expect(result).toEqual({ eventId: 'fresh-evt', created: true });
    expect(derive).toHaveBeenCalledWith('fresh-evt');
  });

  it('skips derivation and returns created=false when the insert race is lost', async () => {
    calls.returningRows = [];
    calls.selectRows = [{ id: 'winner-evt' }];
    const db = createIngestDb({ connectionString: 'postgres://test' });
    const derive = vi.fn().mockResolvedValue(undefined);
    const result = await twoStepIngest(db, RAW_EVENT, derive);
    expect(result).toEqual({ eventId: 'winner-evt', created: false });
    // Critical: derivation must NOT run again, so no duplicate derived row.
    expect(derive).not.toHaveBeenCalled();
  });

  it('marks the event failed and rethrows when derivation throws', async () => {
    calls.returningRows = [{ id: 'fail-evt' }];
    const db = createIngestDb({ connectionString: 'postgres://test' });
    const derive = vi.fn().mockRejectedValue(new Error('boom'));
    await expect(twoStepIngest(db, RAW_EVENT, derive)).rejects.toThrow('boom');
  });
});

describe('createIngestDb derived-row + status helpers', () => {
  it('insertGate, insertArtifact, markDerived, markFailed resolve without error', async () => {
    const db = createIngestDb({ connectionString: 'postgres://test' });
    await expect(
      db.insertGate({
        ingestEventId: 'evt',
        gateType: 'ci',
        sourceSystem: 'github-actions',
        sourceRef: 'run-1',
        subjectType: 'pr',
        subjectRef: 'refs/heads/main',
        state: 'passed',
        evidenceSummary: {},
        observedAt: new Date(),
      }),
    ).resolves.toBeUndefined();
    await expect(
      db.insertArtifact({
        artifactType: 'video',
        producerType: 'github-workflow',
        producerRef: 'run-1',
        uri: 'r2://b/o.mp4',
        metadata: {},
      }),
    ).resolves.toBeUndefined();
    await expect(db.markDerived('evt')).resolves.toBeUndefined();
    await expect(db.markFailed('evt', 'oops')).resolves.toBeUndefined();
  });
});
