/**
 * Unit tests for mirrorSupervisorRuns (P1.8).
 *
 * Uses dependency injection (the `ops` parameter) to avoid module mocking —
 * no live DB connections needed.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { mirrorSupervisorRuns } from '../src/mirror.js';
import type { MirrorDbOps } from '../src/mirror.js';
import type { Env } from '../src/env.js';

// ── mock ops ──────────────────────────────────────────────────────────────────

interface UpsertCall {
  id: string;
  dryRun: boolean;
  status: string;
  finishedAt: Date | undefined;
}

interface AuditCall {
  payload: Record<string, unknown>;
}

let upsertCalls: UpsertCall[] = [];
let auditCalls: AuditCall[] = [];
let upsertError: Error | null = null;
let upsertErrorOnIndex = -1;

function makeMockOps(): MirrorDbOps {
  return {
    async upsertRun(run) {
      const idx = upsertCalls.length;
      upsertCalls.push({ id: run.id as string, dryRun: run.dryRun ?? false, status: run.status, finishedAt: run.finishedAt ?? undefined });
      if (upsertError && (upsertErrorOnIndex === -1 || upsertErrorOnIndex === idx)) {
        throw upsertError;
      }
    },
    async insertAuditEvent(payload) {
      auditCalls.push({ payload });
    },
  };
}

// ── D1 mock helpers ───────────────────────────────────────────────────────────

function makeD1(rows: unknown[], success = true): Env['SUPERVISOR_D1'] {
  return {
    prepare: () => ({
      bind: () => ({
        all: async <T>() => ({ success, results: rows as T[], meta: {} as never }),
      }),
      first: async () => null,
      run: async () => ({ success: true, meta: {} as never }),
      raw: async () => [],
    }),
    batch: async () => [],
    exec: async () => ({ count: 0, duration: 0 }),
    dump: async () => new ArrayBuffer(0),
    withSession: () => makeD1(rows, success) as unknown as ReturnType<D1Database['withSession']>,
  } as unknown as Env['SUPERVISOR_D1'];
}

function makeEnv(rows: unknown[], d1Success = true): Env {
  return {
    DB: { connectionString: 'postgresql://ignored' },
    SUPERVISOR_D1: makeD1(rows, d1Success),
    ENVIRONMENT: 'test',
  };
}

const D1_ROWS = [
  { id: 'aaa00000-0000-0000-0000-000000000001', template_id: 'tmpl-1', template_version: 1, description: 'Run A', source: 'github:issue', status: 'passed', dry_run: 0, pr_url: null, started_at: 1000000, finished_at: 1001000 },
  { id: 'aaa00000-0000-0000-0000-000000000002', template_id: 'tmpl-2', template_version: 2, description: 'Run B', source: 'webhook', status: 'running', dry_run: 1, pr_url: 'https://github.com/p/1', started_at: 1002000, finished_at: null },
  { id: 'aaa00000-0000-0000-0000-000000000003', template_id: 'tmpl-3', template_version: 1, description: 'Run C', source: 'scheduled', status: 'planned', dry_run: 0, pr_url: null, started_at: 1003000, finished_at: null },
];

beforeEach(() => {
  upsertCalls = [];
  auditCalls = [];
  upsertError = null;
  upsertErrorOnIndex = -1;
});

// ── tests ─────────────────────────────────────────────────────────────────────

describe('mirrorSupervisorRuns', () => {
  it('upserts each D1 row and writes one audit event', async () => {
    const result = await mirrorSupervisorRuns(makeEnv(D1_ROWS), undefined, makeMockOps());

    expect(result).toEqual({ synced: 3, skipped: 0, errors: 0 });
    expect(upsertCalls).toHaveLength(3);
    expect(auditCalls).toHaveLength(1);
  });

  it('maps dry_run=1 → dryRun=true and dry_run=0 → dryRun=false', async () => {
    await mirrorSupervisorRuns(makeEnv(D1_ROWS), undefined, makeMockOps());

    expect(upsertCalls.some(c => c.dryRun === true)).toBe(true);
    expect(upsertCalls.some(c => c.dryRun === false)).toBe(true);
  });

  it('sets finishedAt=undefined when D1 finished_at is null', async () => {
    await mirrorSupervisorRuns(makeEnv(D1_ROWS), undefined, makeMockOps());

    const running = upsertCalls.find(c => c.status === 'running');
    expect(running?.finishedAt).toBeUndefined();
  });

  it('returns {synced:0,skipped:0,errors:0} and writes no events when D1 returns no rows', async () => {
    const result = await mirrorSupervisorRuns(makeEnv([]), undefined, makeMockOps());

    expect(result).toEqual({ synced: 0, skipped: 0, errors: 0 });
    expect(upsertCalls).toHaveLength(0);
    expect(auditCalls).toHaveLength(0);
  });

  it('throws when D1 query fails (success=false)', async () => {
    await expect(mirrorSupervisorRuns(makeEnv([], false), undefined, makeMockOps()))
      .rejects.toThrow('D1 query failed');
    expect(upsertCalls).toHaveLength(0);
  });

  it('counts errors per failed upsert and continues syncing the remaining rows', async () => {
    upsertError = new Error('pg error');
    upsertErrorOnIndex = 0; // only first row fails

    const result = await mirrorSupervisorRuns(makeEnv(D1_ROWS), undefined, makeMockOps());

    expect(result.errors).toBe(1);
    expect(result.synced).toBe(2);
    expect(result.skipped).toBe(0);
    // audit event is still written (3 rows were fetched)
    expect(auditCalls).toHaveLength(1);
  });

  it('audit event payload captures synced/errors/row_count', async () => {
    await mirrorSupervisorRuns(makeEnv(D1_ROWS), undefined, makeMockOps());

    const { payload } = auditCalls[0]!;
    expect(payload['synced']).toBe(3);
    expect(payload['errors']).toBe(0);
    expect(payload['row_count']).toBe(3);
  });

  it('accepts a custom windowMs without throwing', async () => {
    const result = await mirrorSupervisorRuns(makeEnv(D1_ROWS), 30 * 60 * 1000, makeMockOps());
    expect(result.synced).toBe(3);
  });
});
