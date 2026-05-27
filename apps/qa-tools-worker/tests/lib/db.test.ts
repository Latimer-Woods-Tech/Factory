/**
 * Unit tests for lib/db.ts
 *
 * @neondatabase/serverless is mocked — no real DB connection required.
 * Each test sets up the mock sql function to return specific rows.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { neon } from '@neondatabase/serverless';

// ---------------------------------------------------------------------------
// Mock neon — must come before the db module import
// ---------------------------------------------------------------------------

vi.mock('@neondatabase/serverless', () => ({
  neon: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Imports
// ---------------------------------------------------------------------------

import {
  insertRun,
  updateRun,
  markRunStarted,
  getRunById,
  listRuns,
  getLatestRun,
  countOpenViolations,
  insertResults,
  getResultsByRunId,
  updateResultStatus,
} from '../../src/lib/db.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const CONN = 'postgresql://user:pass@host/db';

/**
 * Configures the neon mock to return the given rows for successive sql calls.
 * Any calls beyond the provided list return [].
 */
function setupSql(...returnValues: unknown[]): ReturnType<typeof vi.fn> {
  const mockSql = vi.fn();
  for (const val of returnValues) {
    mockSql.mockResolvedValueOnce(val);
  }
  mockSql.mockResolvedValue([]); // default for any extra calls
  vi.mocked(neon).mockReturnValue(mockSql as never);
  return mockSql;
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// insertRun
// ---------------------------------------------------------------------------

describe('insertRun', () => {
  it('returns the id from the RETURNING clause', async () => {
    setupSql([{ id: 'new-run-id-123' }]);
    const id = await insertRun(CONN, {
      appId: 'capricast',
      environment: 'production',
      testType: 'a11y',
      profile: 'fast',
      testConfig: {},
      maxAttempts: 1,
    });
    expect(id).toBe('new-run-id-123');
  });

  it('throws when no row returned', async () => {
    setupSql([]); // empty result → no id
    await expect(insertRun(CONN, {
      appId: 'selfprime',
      environment: 'staging',
      testType: 'performance',
      profile: 'a11y',
      testConfig: {},
      maxAttempts: 2,
    })).rejects.toThrow('insertRun returned no id');
  });

  it('passes optional fields (tags, ciContext, createdBy)', async () => {
    const sql = setupSql([{ id: 'run-with-opts' }]);
    await insertRun(CONN, {
      appId: 'capricast',
      environment: 'production',
      testType: 'a11y',
      profile: 'fast',
      testConfig: {},
      maxAttempts: 1,
      tags: ['ci', 'pr-123'],
      ciContext: { pr_number: 123, sha: 'abc' },
      createdBy: 'user-id',
      templateId: 'tmpl-1',
    });
    expect(sql).toHaveBeenCalledOnce();
  });
});

// ---------------------------------------------------------------------------
// updateRun
// ---------------------------------------------------------------------------

describe('updateRun', () => {
  it('calls sql exactly once', async () => {
    const sql = setupSql([]);
    await updateRun(CONN, { id: 'run-1', status: 'passed' });
    expect(sql).toHaveBeenCalledOnce();
  });

  it('handles all optional fields', async () => {
    const sql = setupSql([]);
    await updateRun(CONN, {
      id: 'run-2',
      status: 'failed',
      completedAt: new Date(),
      durationMs: 12000,
      violationsCount: 5,
      passesCount: 20,
      warningsCount: 3,
      errorMessage: 'timeout',
      r2Prefix: 'qa-tools/capricast/run-2',
      githubIssueUrl: 'https://github.com/org/repo/issues/42',
    });
    expect(sql).toHaveBeenCalledOnce();
  });
});

// ---------------------------------------------------------------------------
// markRunStarted
// ---------------------------------------------------------------------------

describe('markRunStarted', () => {
  it('issues a single UPDATE sql call', async () => {
    const sql = setupSql([]);
    await markRunStarted(CONN, 'run-xyz');
    expect(sql).toHaveBeenCalledOnce();
  });
});

// ---------------------------------------------------------------------------
// getRunById
// ---------------------------------------------------------------------------

describe('getRunById', () => {
  it('returns the row when found', async () => {
    const row = { id: 'r1', app_id: 'capricast', status: 'passed' };
    setupSql([row]);
    const result = await getRunById(CONN, 'r1');
    expect(result).toEqual(row);
  });

  it('returns null when no rows returned', async () => {
    setupSql([]);
    const result = await getRunById(CONN, 'unknown-id');
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// listRuns — all six filter branches
// ---------------------------------------------------------------------------

describe('listRuns', () => {
  it('appId + environment + status → issues 2 queries', async () => {
    const sql = setupSql([{ total: 2 }], [{ id: 'r1' }, { id: 'r2' }]);
    const result = await listRuns(CONN, {
      appId: 'capricast',
      environment: 'production',
      status: 'passed',
      limit: 10,
      offset: 0,
    });
    expect(result.total).toBe(2);
    expect(result.runs).toHaveLength(2);
    expect(sql).toHaveBeenCalledTimes(2);
  });

  it('appId + environment (no status)', async () => {
    const sql = setupSql([{ total: 5 }], []);
    const result = await listRuns(CONN, {
      appId: 'selfprime',
      environment: 'staging',
      limit: 20,
      offset: 0,
    });
    expect(result.total).toBe(5);
    expect(sql).toHaveBeenCalledTimes(2);
  });

  it('appId + status (no environment)', async () => {
    const sql = setupSql([{ total: 1 }], [{ id: 'r1' }]);
    const result = await listRuns(CONN, {
      appId: 'capricast',
      status: 'error',
      limit: 10,
      offset: 5,
    });
    expect(result.total).toBe(1);
    expect(sql).toHaveBeenCalledTimes(2);
  });

  it('appId only (no environment, no status)', async () => {
    const sql = setupSql([{ total: 10 }], []);
    const result = await listRuns(CONN, { appId: 'xicocity', limit: 100, offset: 0 });
    expect(result.total).toBe(10);
    expect(sql).toHaveBeenCalledTimes(2);
  });

  it('status only (no appId, no environment)', async () => {
    const sql = setupSql([{ total: 3 }], []);
    const result = await listRuns(CONN, { status: 'running', limit: 20, offset: 0 });
    expect(result.total).toBe(3);
    expect(sql).toHaveBeenCalledTimes(2);
  });

  it('no filters (returns all)', async () => {
    const sql = setupSql([{ total: 50 }], []);
    const result = await listRuns(CONN, { limit: 50, offset: 0 });
    expect(result.total).toBe(50);
    expect(sql).toHaveBeenCalledTimes(2);
  });

  it('returns zero total when count row is missing', async () => {
    setupSql([/* empty count */], []);
    const result = await listRuns(CONN, { limit: 20, offset: 0 });
    expect(result.total).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// getLatestRun
// ---------------------------------------------------------------------------

describe('getLatestRun', () => {
  it('returns latest run row', async () => {
    const row = { id: 'latest-run', app_id: 'capricast', status: 'passed' };
    setupSql([row]);
    const result = await getLatestRun(CONN, 'capricast', 'production');
    expect(result).toEqual(row);
  });

  it('returns null when no runs exist', async () => {
    setupSql([]);
    const result = await getLatestRun(CONN, 'capricast', 'staging');
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// countOpenViolations
// ---------------------------------------------------------------------------

describe('countOpenViolations', () => {
  it('returns violation counts from the aggregate row', async () => {
    setupSql([{ critical: 2, serious: 1, moderate: 5, total: 8 }]);
    const result = await countOpenViolations(CONN, 'selfprime');
    expect(result.critical).toBe(2);
    expect(result.serious).toBe(1);
    expect(result.moderate).toBe(5);
    expect(result.total).toBe(8);
  });

  it('returns all zeros when no rows returned', async () => {
    setupSql([]);
    const result = await countOpenViolations(CONN, 'capricast');
    expect(result).toEqual({ critical: 0, serious: 0, moderate: 0, total: 0 });
  });
});

// ---------------------------------------------------------------------------
// insertResults
// ---------------------------------------------------------------------------

describe('insertResults', () => {
  it('is a no-op for an empty array', async () => {
    const sql = setupSql();
    await insertResults(CONN, []);
    expect(sql).not.toHaveBeenCalled();
  });

  it('inserts each result with a separate sql call', async () => {
    const sql = setupSql([], []);
    await insertResults(CONN, [
      { runId: 'r1', category: 'axe', severity: 'critical', title: 'color-contrast' },
      { runId: 'r1', category: 'axe', severity: 'serious', title: 'image-alt' },
    ]);
    expect(sql).toHaveBeenCalledTimes(2);
  });

  it('batches 55+ results into groups of 50', async () => {
    // 55 results → first batch: 50, second batch: 5
    const results = Array.from({ length: 55 }, (_, i) => ({
      runId: 'r1',
      category: 'axe',
      severity: 'minor',
      title: `violation-${String(i)}`,
    }));
    const sql = setupSql(...Array.from({ length: 55 }, () => []));
    await insertResults(CONN, results);
    expect(sql).toHaveBeenCalledTimes(55);
  });
});

// ---------------------------------------------------------------------------
// getResultsByRunId
// ---------------------------------------------------------------------------

describe('getResultsByRunId', () => {
  it('returns the rows sorted by severity', async () => {
    const rows = [
      { id: 'res-1', severity: 'critical', category: 'axe' },
      { id: 'res-2', severity: 'serious', category: 'axe' },
    ];
    setupSql(rows);
    const results = await getResultsByRunId(CONN, 'run-1');
    expect(results).toHaveLength(2);
    expect(results[0]?.id).toBe('res-1');
  });

  it('returns empty array when no results', async () => {
    setupSql([]);
    const results = await getResultsByRunId(CONN, 'run-no-results');
    expect(results).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// updateResultStatus
// ---------------------------------------------------------------------------

describe('updateResultStatus', () => {
  it('calls sql once for acknowledged status (with acknowledgedBy)', async () => {
    const sql = setupSql([]);
    await updateResultStatus(CONN, 'res-1', 'acknowledged', 'user-abc');
    expect(sql).toHaveBeenCalledOnce();
  });

  it('calls sql once for non-acknowledged status (no acknowledgedBy)', async () => {
    const sql = setupSql([]);
    await updateResultStatus(CONN, 'res-1', 'fixed');
    expect(sql).toHaveBeenCalledOnce();
  });

  it('handles false-positive status', async () => {
    const sql = setupSql([]);
    await updateResultStatus(CONN, 'res-2', 'false-positive');
    expect(sql).toHaveBeenCalledOnce();
  });
});
