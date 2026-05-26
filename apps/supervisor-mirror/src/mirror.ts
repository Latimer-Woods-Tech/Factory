/**
 * Core mirror logic for the supervisor-mirror cron Worker (P1.8).
 *
 * Fetches `supervisor_runs` rows from D1 within a time window (plus any
 * non-terminal runs regardless of age) and upserts them into the Neon
 * `factory_runs_mirror` table. Writes one `factory_events_ingest` audit row
 * per sync batch.
 */
import { createDb, sql } from '@latimer-woods-tech/neon';
import { factoryRunsMirror, factoryEventsIngest } from '@latimer-woods-tech/neon';
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
 * @returns         Result summary with synced / skipped / errors counts.
 */
export async function mirrorSupervisorRuns(
  env: Env,
  windowMs: number = DEFAULT_WINDOW_MS,
): Promise<MirrorResult> {
  const db = createDb(env.DB);

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
      await db
        .insert(factoryRunsMirror)
        .values({
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
        })
        .onConflictDoUpdate({
          target: factoryRunsMirror.id,
          set: {
            status: sql`excluded.status`,
            prUrl: sql`excluded.pr_url`,
            finishedAt: sql`excluded.finished_at`,
            mirroredAt: sql`now()`,
          },
        });
      synced++;
    } catch (_err) {
      errors++;
    }
  }

  // Audit trail: one ingest event per sync batch (only when D1 returned rows).
  if (rows.length > 0) {
    await db.insert(factoryEventsIngest).values({
      sourceSystem: 'supervisor-d1',
      sourceEventType: 'mirror.sync',
      payload: { synced, errors, window_ms: windowMs, row_count: rows.length },
      ingestActor: 'supervisor-mirror:cron',
      derivationStatus: 'derived',
      derivationTargets: ['factory_runs_mirror'],
      observedAt: new Date(),
    });
  }

  return { synced, skipped: rows.length - synced - errors, errors };
}
