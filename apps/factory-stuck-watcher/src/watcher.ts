/**
 * factory-stuck-watcher — core detection logic (P2.13b).
 *
 * For each 'running' supervisor run past a gate's grace period, checks whether
 * the expected gate type has appeared in factory_gates. If absent and not
 * already detected this hour, writes a stuck-detection gate row via the
 * two-step ingest pattern (factory_events_ingest → factory_gates).
 */
import { createDb, sql } from '@latimer-woods-tech/neon';
import type { ExpectedGateCheck } from './config.js';

export interface RunningRun {
  id: string;
  started_at: Date;
}

export interface WatcherDbOps {
  /** Returns supervisor runs in 'running' status started before cutoffMs ago. */
  getStaleRunningRuns(cutoffMs: number): Promise<RunningRun[]>;
  /** Returns true if any gate row of gateType exists for this run. */
  gateExists(runId: string, gateType: string): Promise<boolean>;
  /** Returns true if a stuck-detection row for this (runId, gateType) was written
   *  within the last hour (idempotency guard). */
  recentStuckDetectionExists(runId: string, missingGateType: string): Promise<boolean>;
  /** Two-step ingest: events → gates → update derivation_status. */
  insertStuckDetectionGate(runId: string, check: ExpectedGateCheck): Promise<void>;
}

export interface WatchResult {
  runsChecked: number;
  stuckGatesWritten: number;
  errors: number;
}

/**
 * Production adapter that executes the four DB operations against Neon.
 * Wrapped in c8 ignore because it requires a live DB; tested via the
 * injectable WatcherDbOps interface.
 */
/* c8 ignore start */
export function createWatcherDbOps(neonDb: { connectionString: string }): WatcherDbOps {
  const db = createDb(neonDb);
  return {
    async getStaleRunningRuns(cutoffMs: number): Promise<RunningRun[]> {
      const cutoff = new Date(Date.now() - cutoffMs);
      const result = await db.execute<{ id: string; started_at: string }>(sql`
        SELECT id, started_at::text AS started_at
        FROM factory_runs_mirror
        WHERE status = 'running'
          AND started_at < ${cutoff.toISOString()}
      `);
      return result.rows.map((r) => ({ id: r.id, started_at: new Date(r.started_at) }));
    },

    async gateExists(runId: string, gateType: string): Promise<boolean> {
      const result = await db.execute<{ cnt: string }>(sql`
        SELECT COUNT(*) AS cnt
        FROM factory_gates
        WHERE subject_ref = ${runId}
          AND subject_type = 'supervisor-run'
          AND gate_type = ${gateType}
      `);
      return parseInt(result.rows[0]?.cnt ?? '0', 10) > 0;
    },

    async recentStuckDetectionExists(runId: string, missingGateType: string): Promise<boolean> {
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
      const sourceRef = `stuck-watcher://run/${runId}/missing/${missingGateType}`;
      const result = await db.execute<{ cnt: string }>(sql`
        SELECT COUNT(*) AS cnt
        FROM factory_gates
        WHERE subject_ref = ${runId}
          AND subject_type = 'supervisor-run'
          AND gate_type = 'stuck-detection'
          AND source_ref = ${sourceRef}
          AND ingested_at >= ${oneHourAgo.toISOString()}
      `);
      return parseInt(result.rows[0]?.cnt ?? '0', 10) > 0;
    },

    async insertStuckDetectionGate(runId: string, check: ExpectedGateCheck): Promise<void> {
      const now = new Date().toISOString();
      const sourceRef = `stuck-watcher://run/${runId}/missing/${check.gateType}`;
      // Step 1: insert ingest event
      const eventResult = await db.execute<{ id: string }>(sql`
        INSERT INTO factory_events_ingest
          (source_system, source_event_type, source_event_id,
           payload, ingest_actor, derivation_status, observed_at)
        VALUES (
          'factory-stuck-watcher',
          'stuck-detection',
          ${sourceRef},
          ${JSON.stringify({ runId, missingGateType: check.gateType, description: check.description })},
          'factory-stuck-watcher',
          'pending',
          ${now}
        )
        ON CONFLICT DO NOTHING
        RETURNING id
      `);
      const eventId = eventResult.rows[0]?.id;
      if (!eventId) return; // conflict: already ingested, skip

      // Step 2: insert gate row
      await db.execute(sql`
        INSERT INTO factory_gates
          (ingest_event_id, gate_type, source_system, source_ref,
           subject_type, subject_ref, state, evidence_summary, observed_at)
        VALUES (
          ${eventId}::uuid,
          'stuck-detection',
          'factory-stuck-watcher',
          ${sourceRef},
          'supervisor-run',
          ${runId},
          'failed',
          ${JSON.stringify({ missing_gate_type: check.gateType, description: check.description })},
          ${now}
        )
      `);

      // Step 3: mark derived
      await db.execute(sql`
        UPDATE factory_events_ingest
        SET derivation_status = 'derived',
            derivation_at      = ${now},
            derivation_targets = ARRAY['factory_gates']
        WHERE id = ${eventId}::uuid
      `);
    },
  };
}
/* c8 ignore end */

/**
 * Main detection pass. For each 'running' run past a check's grace period,
 * writes a stuck-detection gate when the expected gate is absent.
 */
export async function runWatchPass(
  checks: readonly ExpectedGateCheck[],
  ops: WatcherDbOps,
): Promise<WatchResult> {
  const result: WatchResult = { runsChecked: 0, stuckGatesWritten: 0, errors: 0 };

  // Use the minimum grace period as the cutoff to get all potentially-stale runs.
  const minGrace = checks.reduce((min, c) => Math.min(min, c.graceMs), Infinity);
  const staleRuns = await ops.getStaleRunningRuns(minGrace);
  result.runsChecked = staleRuns.length;

  const now = Date.now();
  for (const run of staleRuns) {
    const runElapsedMs = now - run.started_at.getTime();
    for (const check of checks) {
      if (runElapsedMs < check.graceMs) continue; // not yet overdue for this check

      try {
        const [exists, alreadyDetected] = await Promise.all([
          ops.gateExists(run.id, check.gateType),
          ops.recentStuckDetectionExists(run.id, check.gateType),
        ]);
        if (exists || alreadyDetected) continue;

        await ops.insertStuckDetectionGate(run.id, check);
        result.stuckGatesWritten += 1;
      } catch {
        result.errors += 1;
      }
    }
  }

  return result;
}
