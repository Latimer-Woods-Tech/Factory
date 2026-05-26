/**
 * Unit tests for mirrorSupervisorRuns (P1.8).
 *
 * Mocks both the Drizzle createDb (via @latimer-woods-tech/neon) and the D1
 * binding so no real DB connections are needed. Each test verifies a distinct
 * branch of the mirror logic.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Env } from '../src/env.js';

// ── Drizzle fluent stub ──────────────────────────────────────────────────────

type Chainable = (...args: unknown[]) => FluentStub;

// Awaitable stub: has a `then` so `await chain` works, but TypeScript won't
// enforce PromiseLike's generic constraints here.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ThenFn = (res?: any, rej?: any) => Promise<any>;

interface FluentStub {
  insert: Chainable;
  values: Chainable;
  onConflictDoUpdate: Chainable;
  then: ThenFn;
}

const insertCalls: Array<{ table: unknown; values: unknown; conflictSet: unknown }> = [];
let insertShouldThrow = false;
let throwOnInsertIndex = -1;

function makeFluent(table: unknown): FluentStub {
  let _values: unknown;
  let _conflictSet: unknown;
  const chain: FluentStub = {
    insert: () => chain,
    values: (...args: unknown[]) => { _values = args[0]; return chain; },
    onConflictDoUpdate: (...args: unknown[]) => { _conflictSet = (args[0] as { set: unknown })?.set; return chain; },
    then: (res?: unknown, rej?: unknown) => {
      const idx = insertCalls.length;
      insertCalls.push({ table, values: _values, conflictSet: _conflictSet });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rf = res as any;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rjf = rej as any;
      if (insertShouldThrow && (throwOnInsertIndex === -1 || throwOnInsertIndex === idx)) {
        return Promise.reject(new Error('db insert error')).then(rf, rjf);
      }
      return Promise.resolve(undefined).then(rf, rjf);
    },
  };
  return chain;
}

const mockDb = {
  insert: (table: unknown) => makeFluent(table),
};

vi.mock('@latimer-woods-tech/neon', async (importOriginal) => {
  const real = await importOriginal<typeof import('@latimer-woods-tech/neon')>();
  return {
    ...real,
    createDb: vi.fn(() => mockDb),
  };
});

const { mirrorSupervisorRuns } = await import('../src/mirror.js');

// ── D1 mock helpers ──────────────────────────────────────────────────────────

function makeD1(rows: unknown[], success = true): Env['SUPERVISOR_D1'] {
  return {
    prepare: () => ({
      bind: () => ({
        all: async <T>() => ({ success, results: (rows as T[]), meta: {} as never }),
      }),
      // stub unused D1PreparedStatement methods
      first: async () => null,
      run: async () => ({ success: true, meta: {} as never }),
      raw: async () => [],
    }),
    batch: async () => [],
    exec: async () => ({ count: 0, duration: 0 }),
    dump: async () => new ArrayBuffer(0),
    withSession: (s: string | null) => makeD1(rows, success) as D1Database & { alwaysPrimary: () => D1Database },
  } as unknown as Env['SUPERVISOR_D1'];
}

function makeEnv(rows: unknown[], d1Success = true): Env {
  return {
    DB: { connectionString: 'postgresql://test' },
    SUPERVISOR_D1: makeD1(rows, d1Success),
    ENVIRONMENT: 'test',
  };
}

const D1_ROWS = [
  { id: 'a0000000-0000-0000-0000-000000000001', template_id: 'tmpl-1', template_version: 1, description: 'Run A', source: 'github:issue', status: 'passed', dry_run: 0, pr_url: null, started_at: 1000000, finished_at: 1001000 },
  { id: 'a0000000-0000-0000-0000-000000000002', template_id: 'tmpl-2', template_version: 2, description: 'Run B', source: 'webhook', status: 'running', dry_run: 1, pr_url: 'https://github.com/p/1', started_at: 1002000, finished_at: null },
  { id: 'a0000000-0000-0000-0000-000000000003', template_id: 'tmpl-3', template_version: 1, description: 'Run C', source: 'scheduled', status: 'planned', dry_run: 0, pr_url: null, started_at: 1003000, finished_at: null },
];

beforeEach(() => {
  insertCalls.length = 0;
  insertShouldThrow = false;
  throwOnInsertIndex = -1;
});

// ── Tests ────────────────────────────────────────────────────────────────────

describe('mirrorSupervisorRuns', () => {
  it('upserts each D1 row and writes one audit ingest event', async () => {
    const result = await mirrorSupervisorRuns(makeEnv(D1_ROWS));

    expect(result).toEqual({ synced: 3, skipped: 0, errors: 0 });
    // 3 factoryRunsMirror inserts + 1 factoryEventsIngest audit insert
    expect(insertCalls).toHaveLength(4);
  });

  it('maps dry_run=1 to dryRun=true and dry_run=0 to dryRun=false', async () => {
    await mirrorSupervisorRuns(makeEnv(D1_ROWS));

    const dryRunRow = insertCalls.find(c => (c.values as { dryRun?: boolean })?.dryRun === true);
    const notDryRunRow = insertCalls.find(c => (c.values as { dryRun?: boolean })?.dryRun === false);
    expect(dryRunRow).toBeDefined();
    expect(notDryRunRow).toBeDefined();
  });

  it('sets finishedAt=undefined when D1 finished_at is null', async () => {
    await mirrorSupervisorRuns(makeEnv(D1_ROWS));

    const runningRow = insertCalls.find(c => (c.values as { status?: string })?.status === 'running');
    expect((runningRow?.values as { finishedAt?: unknown })?.finishedAt).toBeUndefined();
  });

  it('returns {synced:0,skipped:0,errors:0} and writes no events when D1 returns no rows', async () => {
    const result = await mirrorSupervisorRuns(makeEnv([]));

    expect(result).toEqual({ synced: 0, skipped: 0, errors: 0 });
    expect(insertCalls).toHaveLength(0);
  });

  it('throws when D1 query fails (success=false)', async () => {
    await expect(mirrorSupervisorRuns(makeEnv([], false))).rejects.toThrow('D1 query failed');
    expect(insertCalls).toHaveLength(0);
  });

  it('counts errors per failed upsert and continues syncing remaining rows', async () => {
    insertShouldThrow = true;
    throwOnInsertIndex = 0; // only the first upsert fails

    const result = await mirrorSupervisorRuns(makeEnv(D1_ROWS));

    // errors=1, synced=2, and the audit event is still written (1 audit insert)
    expect(result.errors).toBe(1);
    expect(result.synced).toBe(2);
    expect(result.skipped).toBe(0);
  });

  it('the audit event payload captures synced/errors/row_count', async () => {
    await mirrorSupervisorRuns(makeEnv(D1_ROWS));

    const auditInsert = insertCalls[insertCalls.length - 1];
    const payload = (auditInsert?.values as { payload?: unknown })?.payload as Record<string, unknown>;
    expect(payload?.synced).toBe(3);
    expect(payload?.errors).toBe(0);
    expect(payload?.row_count).toBe(3);
  });

  it('accepts a custom windowMs parameter without throwing', async () => {
    const result = await mirrorSupervisorRuns(makeEnv(D1_ROWS), 30 * 60 * 1000);
    expect(result.synced).toBe(3);
  });
});
