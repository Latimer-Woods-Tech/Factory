/**
 * Unit tests for factory-stuck-watcher core logic (P2.13b).
 *
 * Uses a fully injectable mock WatcherDbOps — no live DB required.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runWatchPass } from '../src/watcher.js';
import type { WatcherDbOps, RunningRun } from '../src/watcher.js';
import type { ExpectedGateCheck } from '../src/config.js';

const CI_CHECK: ExpectedGateCheck = {
  gateType: 'ci',
  graceMs: 30 * 60 * 1000,
  description: 'CI gate expected within 30 min',
};

const CONSTRAINTS_CHECK: ExpectedGateCheck = {
  gateType: 'constraints',
  graceMs: 15 * 60 * 1000,
  description: 'Constraints gate expected within 15 min',
};

function makeRun(minsAgo: number): RunningRun {
  return {
    id: `run-${minsAgo}m`,
    started_at: new Date(Date.now() - minsAgo * 60 * 1000),
  };
}

function makeMockOps(overrides: Partial<WatcherDbOps> = {}): WatcherDbOps {
  return {
    getStaleRunningRuns: vi.fn(async () => []),
    gateExists: vi.fn(async () => false),
    recentStuckDetectionExists: vi.fn(async () => false),
    insertStuckDetectionGate: vi.fn(async () => {}),
    ...overrides,
  };
}

describe('runWatchPass', () => {
  it('returns zero counts when no stale runs', async () => {
    const ops = makeMockOps({ getStaleRunningRuns: vi.fn(async () => []) });
    const result = await runWatchPass([CI_CHECK], ops);
    expect(result).toEqual({ runsChecked: 0, stuckGatesWritten: 0, errors: 0 });
    expect(ops.insertStuckDetectionGate).not.toHaveBeenCalled();
  });

  it('skips gate check when run elapsed < grace period', async () => {
    // Run started 10 min ago, grace is 15 min → not yet overdue for constraints
    const ops = makeMockOps({
      getStaleRunningRuns: vi.fn(async () => [makeRun(10)]),
    });
    const result = await runWatchPass([CONSTRAINTS_CHECK], ops);
    expect(result.stuckGatesWritten).toBe(0);
    expect(ops.gateExists).not.toHaveBeenCalled();
  });

  it('writes stuck-detection gate when gate missing and overdue', async () => {
    const ops = makeMockOps({
      getStaleRunningRuns: vi.fn(async () => [makeRun(20)]),
      gateExists: vi.fn(async () => false),
      recentStuckDetectionExists: vi.fn(async () => false),
    });
    const result = await runWatchPass([CONSTRAINTS_CHECK], ops);
    expect(result.stuckGatesWritten).toBe(1);
    expect(ops.insertStuckDetectionGate).toHaveBeenCalledWith(
      'run-20m',
      CONSTRAINTS_CHECK,
    );
  });

  it('skips when gate already exists', async () => {
    const ops = makeMockOps({
      getStaleRunningRuns: vi.fn(async () => [makeRun(20)]),
      gateExists: vi.fn(async () => true),
    });
    const result = await runWatchPass([CONSTRAINTS_CHECK], ops);
    expect(result.stuckGatesWritten).toBe(0);
    expect(ops.insertStuckDetectionGate).not.toHaveBeenCalled();
  });

  it('skips when recent stuck-detection already exists (idempotency)', async () => {
    const ops = makeMockOps({
      getStaleRunningRuns: vi.fn(async () => [makeRun(20)]),
      gateExists: vi.fn(async () => false),
      recentStuckDetectionExists: vi.fn(async () => true),
    });
    const result = await runWatchPass([CONSTRAINTS_CHECK], ops);
    expect(result.stuckGatesWritten).toBe(0);
  });

  it('counts per-check errors without aborting the pass', async () => {
    const ops = makeMockOps({
      getStaleRunningRuns: vi.fn(async () => [makeRun(35)]),
      gateExists: vi.fn(async () => { throw new Error('db error'); }),
    });
    const result = await runWatchPass([CI_CHECK], ops);
    expect(result.errors).toBe(1);
    expect(result.stuckGatesWritten).toBe(0);
  });

  it('checks multiple checks per run independently', async () => {
    // Run started 40 min ago — overdue for both constraints (15m) and ci (30m)
    const ops = makeMockOps({
      getStaleRunningRuns: vi.fn(async () => [makeRun(40)]),
      gateExists: vi.fn(async () => false),
      recentStuckDetectionExists: vi.fn(async () => false),
    });
    const result = await runWatchPass([CONSTRAINTS_CHECK, CI_CHECK], ops);
    expect(result.stuckGatesWritten).toBe(2);
  });

  it('processes multiple runs across multiple checks', async () => {
    const ops = makeMockOps({
      getStaleRunningRuns: vi.fn(async () => [makeRun(20), makeRun(40)]),
      gateExists: vi.fn(async () => false),
      recentStuckDetectionExists: vi.fn(async () => false),
    });
    // run-20m: overdue only for constraints (15m)
    // run-40m: overdue for both constraints (15m) and ci (30m)
    const result = await runWatchPass([CONSTRAINTS_CHECK, CI_CHECK], ops);
    expect(result.runsChecked).toBe(2);
    expect(result.stuckGatesWritten).toBe(3); // 1 + 2
  });

  it('uses minimum grace period as cutoff for getStaleRunningRuns', async () => {
    const ops = makeMockOps();
    await runWatchPass([CI_CHECK, CONSTRAINTS_CHECK], ops);
    // Called with the minimum: 15 min = 900_000 ms
    expect(ops.getStaleRunningRuns).toHaveBeenCalledWith(15 * 60 * 1000);
  });

  it('returns zero errors on clean pass with no stale runs', async () => {
    const ops = makeMockOps();
    const result = await runWatchPass([CI_CHECK], ops);
    expect(result.errors).toBe(0);
  });
});
