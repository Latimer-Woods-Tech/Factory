/**
 * Core mirror logic for the supervisor-mirror cron Worker (P1.8).
 *
 * Fetches `supervisor_runs` rows from D1 within a time window (plus any
 * non-terminal runs regardless of age) and upserts them into the Neon
 * `factory_runs_mirror` table. Writes one `factory_events_ingest` audit row
 * per sync batch.
 */
import { createDb, sql, eq, and } from '@latimer-woods-tech/neon';
import { factoryRunsMirror, factoryEventsIngest, factoryGates } from '@latimer-woods-tech/neon';
import type { NewFactoryRunsMirror } from '@latimer-woods-tech/neon';
import type { Env } from './env.js';

/** Default look-back window: 10 minutes in milliseconds. */
const DEFAULT_WINDOW_MS = 10 * 60 * 1000;

/** Maximum rows fetched from D1 per sync cycle. */
const MAX_ROWS = 200;

/** Result summary returned by {@link mirrorSupervisorRuns}. */
export interface MirrorResult {
  /** Number of rows successfully upserted into Neon. */
  synced: number;
  /** Number of rows skipped (currently always 0 — reserved for future filtering). */
  skipped: number;
  /** Number of rows that failed to upsert. */
  errors: number;
}

/**
 * Raw row shape returned by the D1 `supervisor_verifications` query.
 */
export interface D1VerificationRow {
  id: string;
  run_id: string;
  verifier_query: string;
  /** JSON-encoded `{ ok: boolean; result?: unknown; error?: string }`. */
  tool_response: string;
  /** Epoch milliseconds. */
  verified_at: number;
}

/**
 * Minimal DB interface for the mirror operations — injectable for testing.
 * Production code uses the full Drizzle instance from `createDb`.
 */
export interface MirrorDbOps {
  /** Upsert one run row into `factory_runs_mirror`. */
  upsertRun(run: Omit<NewFactoryRunsMirror, 'mirroredAt'>): Promise<void>;
  /** Insert one audit event into `factory_events_ingest`. */
  insertAuditEvent(payload: Record<string, unknown>): Promise<void>;
  /**
   * Two-step ingest for a verification row → `factory_gates`.
   * Idempotent: skips silently when the `source_event_id` already exists.
   */
  upsertVerificationGate(v: D1VerificationRow): Promise<void>;
}

/**
 * Creates a production `MirrorDbOps` backed by a real Drizzle instance.
 * Pass the result as the optional `ops` parameter to `mirrorSupervisorRuns`
 * to override (e.g. in tests).
 */
/* c8 ignore start — Drizzle adapter; requires a live Neon connection (integration test) */
export function createMirrorDbOps(binding: Env['DB']): MirrorDbOps {
  const db = createDb(binding);
  return {
    async upsertRun(run) {
      await db
        .insert(factoryRunsMirror)
        .values(run)
        .onConflictDoUpdate({
          target: factoryRunsMirror.id,
          set: {
            status: sql`excluded.status`,
            prUrl: sql`excluded.pr_url`,
            finishedAt: sql`excluded.finished_at`,
            mirroredAt: sql`now()`,
          },
        });
    },
    async insertAuditEvent(payload) {
      await db.insert(factoryEventsIngest).values({
        sourceSystem: 'supervisor-d1',
        sourceEventType: 'mirror.sync',
        payload,
        ingestActor: 'supervisor-mirror:cron',
        derivationStatus: 'derived',
        derivationTargets: ['factory_runs_mirror'],
        observedAt: new Date(),
      });
    },
    async upsertVerificationGate(v) {
      const sourceEventId = `supervisor-verification:${v.id}`;
      const existing = await db
        .select({ id: factoryEventsIngest.id })
        .from(factoryEventsIngest)
        .where(
          and(
            eq(factoryEventsIngest.sourceSystem, 'supervisor-d1'),
            eq(factoryEventsIngest.sourceEventId, sourceEventId),
          ),
        )
        .limit(1);
      if (existing[0]) return;

      let toolResponse: Record<string, unknown> = {};
      try { toolResponse = JSON.parse(v.tool_response) as Record<string, unknown>; } catch { /* leave empty */ }
      const state = toolResponse.ok === true ? 'passed' : 'failed';
      const observedAt = new Date(v.verified_at);

      const [eventRow] = await db
        .insert(factoryEventsIngest)
        .values({
          sourceSystem: 'supervisor-d1',
          sourceEventType: 'gate.verifier',
          sourceEventId,
          payload: v as unknown as Record<string, unknown>,
          ingestActor: 'supervisor-mirror:cron',
          derivationStatus: 'pending',
          derivationTargets: ['factory_gates'],
          observedAt,
        })
        .onConflictDoNothing({
          target: [factoryEventsIngest.sourceSystem, factoryEventsIngest.sourceEventId],
          where: sql`source_event_id IS NOT NULL`,
        })
        .returning({ id: factoryEventsIngest.id });
      if (!eventRow) return;

      await db.insert(factoryGates).values({
        ingestEventId: eventRow.id,
        gateType: 'verifier',
        sourceSystem: 'supervisor-d1',
        sourceRef: `supervisor://run/${v.run_id}/verifier/${v.verifier_query}`,
        subjectType: 'supervisor-run',
        subjectRef: v.run_id,
        state,
        evidenceSummary: { verifier_query: v.verifier_query, tool_response: toolResponse },
        observedAt,
      });

      await db
        .update(factoryEventsIngest)
        .set({ derivationStatus: 'derived', derivationAt: new Date() })
        .where(eq(factoryEventsIngest.id, eventRow.id));
    },
  };
}
/* c8 ignore stop */

/**
 * Raw row shape returned by the D1 `supervisor_runs` query.
 * D1 stores timestamps as epoch-millisecond integers and booleans as 0/1.
 */
interface D1Row {
  id: string;
  template_id: string;
  template_version: number;
  description: string;
  source: string;
  status: string;
  /** D1 stores BOOLEAN as INTEGER 0 or 1. */
  dry_run: number;
  pr_url: string | null;
  /** Epoch milliseconds. */
  started_at: number;
  /** Epoch milliseconds, or null if the run has not finished. */
  finished_at: number | null;
}

/**
 * Fetches `supervisor_runs` rows modified in the last `windowMs` milliseconds
 * from D1 and upserts them into `factory_runs_mirror` in Neon.
 * Also picks up any non-terminal runs regardless of age (they may have changed
 * status since the last sync cycle).
 *
 * Writes one `factory_events_ingest` row to audit the sync batch when at least
 * one row was fetched from D1.
 *
 * @param env       - Worker bindings (DB Hyperdrive + SUPERVISOR_D1).
 * @param windowMs  - Look-back window in ms; defaults to 10 minutes.
 * @param ops       - DB operations; defaults to a real Drizzle instance. Pass a
 *                    mock here in tests to avoid live DB connections.
 * @returns         Result summary with synced / skipped / errors counts.
 */
export async function mirrorSupervisorRuns(
  env: Env,
  windowMs: number = DEFAULT_WINDOW_MS,
  ops: MirrorDbOps = createMirrorDbOps(env.DB),
): Promise<MirrorResult> {

  // Query D1: all runs started or finished in the last window, plus any
  // non-terminal runs regardless of age (they may have changed status).
  const cutoffEpochMs = Date.now() - windowMs;
  const d1Result = await env.SUPERVISOR_D1.prepare(`
    SELECT id, template_id, template_version, description, source, status,
           dry_run, pr_url, started_at, finished_at
    FROM supervisor_runs
    WHERE started_at >= ? OR finished_at >= ? OR status IN ('planned', 'running')
    ORDER BY started_at DESC
    LIMIT ${MAX_ROWS}
  `).bind(cutoffEpochMs, cutoffEpochMs).all<D1Row>();

  if (!d1Result.success) {
    throw new Error('D1 query failed');
  }

  const rows = d1Result.results ?? [];
  let synced = 0;
  let errors = 0;

  for (const row of rows) {
    try {
      await ops.upsertRun({
        id: row.id,
        templateId: row.template_id,
        templateVersion: row.template_version,
        description: row.description,
        source: row.source,
        status: row.status,
        dryRun: row.dry_run === 1,
        prUrl: row.pr_url ?? undefined,
        startedAt: new Date(row.started_at),
        finishedAt: row.finished_at != null ? new Date(row.finished_at) : undefined,
      });
      synced++;
    } catch (err) {
      errors++;
      console.error(JSON.stringify({
        level: 'error',
        msg: 'upsert failed',
        id: row.id,
        error: err instanceof Error ? err.message : String(err),
      }));
    }
  }

  // Audit trail: one ingest event per sync batch (only when D1 returned rows).
  // Wrapped separately so an audit write failure does not mask successfully synced data.
  if (rows.length > 0) {
    try {
      await ops.insertAuditEvent({ synced, errors, window_ms: windowMs, row_count: rows.length });
    } catch (err) {
      console.warn(JSON.stringify({
        level: 'warn',
        msg: 'audit event write failed',
        error: err instanceof Error ? err.message : String(err),
      }));
    }
  }

  return { synced, skipped: rows.length - synced - errors, errors };
}

/**
 * Fetches recent `supervisor_verifications` rows from D1 and writes verifier
 * gate rows to `factory_gates` in Neon via the two-step ingest pattern.
 * Idempotent: rows already present in Neon are skipped.
 *
 * @param env      - Worker bindings.
 * @param windowMs - Look-back window in ms; defaults to 10 minutes.
 * @param ops      - DB operations; defaults to a real Drizzle instance.
 * @returns Result summary with synced / skipped / errors counts.
 */
export async function mirrorSupervisorVerifications(
  env: Env,
  windowMs: number = DEFAULT_WINDOW_MS,
  ops: MirrorDbOps = createMirrorDbOps(env.DB),
): Promise<MirrorResult> {
  const cutoffEpochMs = Date.now() - windowMs;
  const d1Result = await env.SUPERVISOR_D1.prepare(`
    SELECT id, run_id, verifier_query, tool_response, verified_at
    FROM supervisor_verifications
    WHERE verified_at >= ?
    ORDER BY verified_at DESC
    LIMIT ${MAX_ROWS}
  `).bind(cutoffEpochMs).all<D1VerificationRow>();

  if (!d1Result.success) {
    throw new Error('D1 supervisor_verifications query failed');
  }

  const rows = d1Result.results ?? [];
  let synced = 0;
  let errors = 0;

  for (const row of rows) {
    try {
      await ops.upsertVerificationGate(row);
      synced++;
    } catch (err) {
      errors++;
      console.error(JSON.stringify({
        level: 'error',
        msg: 'verification gate upsert failed',
        id: row.id,
        error: err instanceof Error ? err.message : String(err),
      }));
    }
  }

  return { synced, skipped: rows.length - synced - errors, errors };
}
