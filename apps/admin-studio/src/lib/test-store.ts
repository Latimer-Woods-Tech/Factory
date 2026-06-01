/**
 * Persistence for `studio_test_runs` + `studio_test_results`.
 *
 * Same WeakMap-cached Drizzle client pattern as audit-store. Run state
 * is the source of truth for the SSE stream — webhook handler writes
 * here, SSE handler reads from here on subscribe.
 *
 * @see migrations/0004_studio_test_runs.sql
 */
import { createDb, sql, type FactoryDb, type HyperdriveBinding } from '@latimer-woods-tech/neon';
import type { TestResult, TestRun, TestRunStatus } from '@latimer-woods-tech/studio-core';

const dbCache = new WeakMap<HyperdriveBinding, FactoryDb>();
const schemaInitCache = new WeakMap<HyperdriveBinding, Promise<void>>();

function getDb(hyperdrive: HyperdriveBinding): FactoryDb {
  let db = dbCache.get(hyperdrive);
  if (!db) {
    db = createDb(hyperdrive);
    dbCache.set(hyperdrive, db);
  }
  return db;
}

async function ensureTestSchema(hyperdrive: HyperdriveBinding): Promise<void> {
  let init = schemaInitCache.get(hyperdrive);
  if (!init) {
    const db = getDb(hyperdrive);
    init = (async () => {
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS studio_test_runs (
          id UUID PRIMARY KEY,
          dispatched_from_env TEXT NOT NULL,
          gh_run_id TEXT,
          gh_run_url TEXT,
          suites JSONB NOT NULL DEFAULT '[]'::jsonb,
          filter TEXT,
          status TEXT NOT NULL DEFAULT 'queued',
          started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          finished_at TIMESTAMPTZ,
          totals JSONB NOT NULL DEFAULT '{"total":0,"passed":0,"failed":0,"skipped":0}'::jsonb,
          dispatched_by TEXT NOT NULL,
          CONSTRAINT studio_test_runs_status_chk
            CHECK (status IN ('queued','dispatched','running','passed','failed','cancelled','timed-out'))
        )
      `);
      await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_studio_test_runs_started ON studio_test_runs (started_at DESC)`);
      await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_studio_test_runs_user ON studio_test_runs (dispatched_by, started_at DESC)`);
      await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_studio_test_runs_gh ON studio_test_runs (gh_run_id)`);
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS studio_test_results (
          run_id UUID NOT NULL REFERENCES studio_test_runs(id) ON DELETE CASCADE,
          test_id TEXT NOT NULL,
          suite TEXT NOT NULL,
          name TEXT NOT NULL,
          outcome TEXT NOT NULL,
          duration_ms INTEGER NOT NULL DEFAULT 0,
          failure JSONB,
          recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          PRIMARY KEY (run_id, test_id),
          CONSTRAINT studio_test_results_outcome_chk
            CHECK (outcome IN ('passed','failed','skipped','todo'))
        )
      `);
      await db.execute(sql`
        CREATE INDEX IF NOT EXISTS idx_studio_test_results_failed ON studio_test_results (run_id, outcome)
        WHERE outcome = 'failed'
      `);
    })();
    schemaInitCache.set(hyperdrive, init);
  }
  await init;
}

interface RunRow {
  id: string;
  dispatched_from_env: string;
  gh_run_id: string | null;
  gh_run_url: string | null;
  suites: unknown;
  filter: string | null;
  status: TestRunStatus;
  started_at: string;
  finished_at: string | null;
  totals: unknown;
  dispatched_by: string;
}

const ZERO_TOTALS: TestRun['totals'] = { total: 0, passed: 0, failed: 0, skipped: 0 };

function parseTotals(value: unknown): TestRun['totals'] {
  if (!value) return ZERO_TOTALS;
  if (typeof value === 'string') {
    try {
      const parsed: unknown = JSON.parse(value);
      return { ...ZERO_TOTALS, ...toPartialTotals(parsed) };
    } catch {
      return ZERO_TOTALS;
    }
  }
  return { ...ZERO_TOTALS, ...toPartialTotals(value) };
}

function toPartialTotals(value: unknown): Partial<TestRun['totals']> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const record = value as Record<string, unknown>;
  return {
    total: typeof record.total === 'number' ? record.total : undefined,
    passed: typeof record.passed === 'number' ? record.passed : undefined,
    failed: typeof record.failed === 'number' ? record.failed : undefined,
    skipped: typeof record.skipped === 'number' ? record.skipped : undefined,
  };
}

function parseSuites(value: unknown): readonly string[] {
  if (Array.isArray(value)) return value as string[];
  if (typeof value === 'string') {
    try {
      const parsed: unknown = JSON.parse(value);
      return Array.isArray(parsed) ? (parsed as string[]) : [];
    } catch {
      return [];
    }
  }
  return [];
}

function rowToRun(row: RunRow): TestRun {
  return {
    id: row.id,
    dispatchedFromEnv: row.dispatched_from_env,
    ghRunId: row.gh_run_id ?? undefined,
    ghRunUrl: row.gh_run_url ?? undefined,
    suites: parseSuites(row.suites),
    filter: row.filter ?? undefined,
    status: row.status,
    startedAt: row.started_at,
    finishedAt: row.finished_at ?? undefined,
    totals: parseTotals(row.totals),
    dispatchedBy: row.dispatched_by,
  };
}

export async function insertTestRun(
  hyperdrive: HyperdriveBinding,
  run: TestRun,
): Promise<void> {
  await ensureTestSchema(hyperdrive);
  const db = getDb(hyperdrive);
  await db.execute(sql`
    INSERT INTO studio_test_runs (
      id, dispatched_from_env, suites, filter, status, started_at, totals, dispatched_by
    ) VALUES (
      ${run.id},
      ${run.dispatchedFromEnv},
      ${JSON.stringify(run.suites)}::jsonb,
      ${run.filter ?? null},
      ${run.status},
      ${run.startedAt},
      ${JSON.stringify(run.totals)}::jsonb,
      ${run.dispatchedBy}
    )
  `);
}

export async function getTestRun(
  hyperdrive: HyperdriveBinding,
  runId: string,
): Promise<TestRun | null> {
  await ensureTestSchema(hyperdrive);
  const db = getDb(hyperdrive);
  const result = await db.execute(sql`
    SELECT id, dispatched_from_env, gh_run_id, gh_run_url, suites, filter,
           status, started_at, finished_at, totals, dispatched_by
    FROM studio_test_runs
    WHERE id = ${runId}
  `);
  const rows = result.rows as unknown as RunRow[];
  if (rows.length === 0) return null;
  return rowToRun(rows[0]!);
}

export async function listTestRuns(
  hyperdrive: HyperdriveBinding,
  opts: { dispatchedBy?: string; limit?: number },
): Promise<TestRun[]> {
  await ensureTestSchema(hyperdrive);
  const db = getDb(hyperdrive);
  const limit = Math.max(1, Math.min(200, opts.limit ?? 50));
  const result = opts.dispatchedBy
    ? await db.execute(sql`
        SELECT id, dispatched_from_env, gh_run_id, gh_run_url, suites, filter,
               status, started_at, finished_at, totals, dispatched_by
        FROM studio_test_runs
        WHERE dispatched_by = ${opts.dispatchedBy}
        ORDER BY started_at DESC
        LIMIT ${limit}
      `)
    : await db.execute(sql`
        SELECT id, dispatched_from_env, gh_run_id, gh_run_url, suites, filter,
               status, started_at, finished_at, totals, dispatched_by
        FROM studio_test_runs
        ORDER BY started_at DESC
        LIMIT ${limit}
      `);
  const rows = result.rows as unknown as RunRow[];
  return rows.map(rowToRun);
}

export async function updateTestRunStatus(
  hyperdrive: HyperdriveBinding,
  runId: string,
  patch: {
    status?: TestRunStatus;
    ghRunId?: string;
    ghRunUrl?: string;
    totals?: TestRun['totals'];
    finishedAt?: string;
  },
): Promise<void> {
  await ensureTestSchema(hyperdrive);
  const db = getDb(hyperdrive);
  // We use one statement per non-undefined field to avoid building dynamic SQL.
  // Each is short and runs against an indexed PK, so the cost is negligible.
  if (patch.status !== undefined) {
    await db.execute(sql`UPDATE studio_test_runs SET status = ${patch.status} WHERE id = ${runId}`);
  }
  if (patch.ghRunId !== undefined) {
    await db.execute(sql`UPDATE studio_test_runs SET gh_run_id = ${patch.ghRunId} WHERE id = ${runId}`);
  }
  if (patch.ghRunUrl !== undefined) {
    await db.execute(sql`UPDATE studio_test_runs SET gh_run_url = ${patch.ghRunUrl} WHERE id = ${runId}`);
  }
  if (patch.totals !== undefined) {
    await db.execute(sql`
      UPDATE studio_test_runs
      SET totals = ${JSON.stringify(patch.totals)}::jsonb
      WHERE id = ${runId}
    `);
  }
  if (patch.finishedAt !== undefined) {
    await db.execute(sql`
      UPDATE studio_test_runs SET finished_at = ${patch.finishedAt} WHERE id = ${runId}
    `);
  }
}

interface ResultRow {
  test_id: string;
  suite: string;
  name: string;
  outcome: TestResult['outcome'];
  duration_ms: number;
  failure: unknown;
}

function parseFailure(value: unknown): TestResult['failure'] | undefined {
  if (!value) return undefined;
  if (typeof value === 'string') {
    try {
      return JSON.parse(value) as TestResult['failure'];
    } catch {
      return undefined;
    }
  }
  return value as TestResult['failure'];
}

export async function upsertTestResults(
  hyperdrive: HyperdriveBinding,
  runId: string,
  results: readonly TestResult[],
): Promise<void> {
  if (results.length === 0) return;
  await ensureTestSchema(hyperdrive);
  const db = getDb(hyperdrive);
  for (const r of results) {
    await db.execute(sql`
      INSERT INTO studio_test_results (run_id, test_id, suite, name, outcome, duration_ms, failure)
      VALUES (
        ${runId},
        ${r.id},
        ${r.suite},
        ${r.name},
        ${r.outcome},
        ${r.durationMs},
        ${r.failure ? JSON.stringify(r.failure) : null}::jsonb
      )
      ON CONFLICT (run_id, test_id) DO UPDATE
      SET outcome     = EXCLUDED.outcome,
          duration_ms = EXCLUDED.duration_ms,
          failure     = EXCLUDED.failure,
          recorded_at = now()
    `);
  }
}

export async function listTestResults(
  hyperdrive: HyperdriveBinding,
  runId: string,
): Promise<TestResult[]> {
  await ensureTestSchema(hyperdrive);
  const db = getDb(hyperdrive);
  const result = await db.execute(sql`
    SELECT test_id, suite, name, outcome, duration_ms, failure
    FROM studio_test_results
    WHERE run_id = ${runId}
    ORDER BY suite ASC, name ASC
  `);
  const rows = result.rows as unknown as ResultRow[];
  return rows.map((r) => ({
    id: r.test_id,
    suite: r.suite,
    name: r.name,
    outcome: r.outcome,
    durationMs: r.duration_ms,
    failure: parseFailure(r.failure),
  }));
}
