/**
 * factory-events-archiver — core archival logic (P2.13c).
 *
 * Queries factory_events_ingest for derived/replayed rows older than
 * ARCHIVE_AGE_DAYS (90 days), writes them to R2 as a JSON-lines batch,
 * then deletes the archived rows from Neon.
 *
 * Design notes:
 * - Processes BATCH_SIZE rows at a time to avoid OOM on Workers (128 MB limit).
 * - Dry-run mode: queries candidates but does not write to R2 or delete from DB.
 * - Idempotent: if the R2 key already exists the batch is skipped (rerun safety).
 */
import { createDb, sql } from '@latimer-woods-tech/neon';

export const ARCHIVE_AGE_DAYS = 90;
export const BATCH_SIZE = 500;

export interface EventRow extends Record<string, unknown> {
  id: string;
  source_system: string;
  source_event_type: string;
  source_event_id: string | null;
  payload: unknown;
  payload_size_bytes: number | null;
  payload_sha256: string | null;
  ingest_actor: string;
  derivation_status: string;
  derivation_targets: string[] | null;
  derivation_error: string | null;
  derivation_at: string | null;
  observed_at: string;
  ingested_at: string;
}

export interface ArchiveResult {
  candidatesFound: number;
  batchesWritten: number;
  rowsArchived: number;
  rowsDeleted: number;
  dryRun: boolean;
}

export interface ArchiverOps {
  /** Returns up to BATCH_SIZE archive candidates. */
  fetchCandidates(cutoffDate: Date, limit: number): Promise<EventRow[]>;
  /** Returns true if the R2 key already exists (idempotency check). */
  archiveKeyExists(key: string): Promise<boolean>;
  /** Writes NDJSON batch to R2. */
  writeArchiveBatch(key: string, ndjson: string): Promise<void>;
  /** Deletes rows by ID from factory_events_ingest. */
  deleteRows(ids: string[]): Promise<number>;
}

/** R2 object key for a batch: `factory-events-archiver/YYYY-MM-DD/batch-{epoch}.ndjson` */
export function makeBatchKey(runDate: Date, epochMs: number): string {
  const date = runDate.toISOString().slice(0, 10);
  return `factory-events-archiver/${date}/batch-${epochMs}.ndjson`;
}

/** Production adapter backed by Neon + R2. Wrapped in c8 ignore (requires live infra). */
/* c8 ignore start */
export function createArchiverOps(
  neonDb: { connectionString: string },
  bucket: R2Bucket,
): ArchiverOps {
  const db = createDb(neonDb);
  return {
    async fetchCandidates(cutoffDate: Date, limit: number): Promise<EventRow[]> {
      const result = await db.execute<EventRow>(sql`
        SELECT
          id, source_system, source_event_type, source_event_id,
          payload, payload_size_bytes, payload_sha256,
          ingest_actor, derivation_status, derivation_targets,
          derivation_error, derivation_at::text  AS derivation_at,
          observed_at::text  AS observed_at,
          ingested_at::text  AS ingested_at
        FROM factory_events_ingest
        WHERE derivation_status IN ('derived', 'replayed')
          AND ingested_at < ${cutoffDate.toISOString()}
        ORDER BY ingested_at ASC
        LIMIT ${limit}
      `);
      return result.rows;
    },

    async archiveKeyExists(key: string): Promise<boolean> {
      const obj = await bucket.head(key);
      return obj !== null;
    },

    async writeArchiveBatch(key: string, ndjson: string): Promise<void> {
      await bucket.put(key, ndjson, {
        httpMetadata: { contentType: 'application/x-ndjson' },
      });
    },

    async deleteRows(ids: string[]): Promise<number> {
      if (ids.length === 0) return 0;
      // Use ANY(ARRAY[...]) for batch delete
      const result = await db.execute<{ count: string }>(sql`
        WITH deleted AS (
          DELETE FROM factory_events_ingest
          WHERE id = ANY(${ids}::uuid[])
          RETURNING id
        )
        SELECT COUNT(*) AS count FROM deleted
      `);
      return parseInt(result.rows[0]?.count ?? '0', 10);
    },
  };
}
/* c8 ignore end */

/**
 * Main archival pass. Processes one batch of candidates per invocation.
 * Designed to be called repeatedly (once per cron tick) until candidatesFound = 0.
 */
export async function runArchiveBatch(
  ops: ArchiverOps,
  opts: { dryRun?: boolean; now?: Date } = {},
): Promise<ArchiveResult> {
  const dryRun = opts.dryRun ?? false;
  const now = opts.now ?? new Date();
  const cutoff = new Date(now.getTime() - ARCHIVE_AGE_DAYS * 24 * 60 * 60 * 1000);

  const candidates = await ops.fetchCandidates(cutoff, BATCH_SIZE);
  const result: ArchiveResult = {
    candidatesFound: candidates.length,
    batchesWritten: 0,
    rowsArchived: 0,
    rowsDeleted: 0,
    dryRun,
  };

  if (candidates.length === 0) return result;
  if (dryRun) return result;

  const key = makeBatchKey(now, now.getTime());
  const alreadyExists = await ops.archiveKeyExists(key);
  if (!alreadyExists) {
    const ndjson = candidates.map((r) => JSON.stringify(r)).join('\n');
    await ops.writeArchiveBatch(key, ndjson);
    result.batchesWritten = 1;
    result.rowsArchived = candidates.length;
  }

  const ids = candidates.map((r) => r.id);
  result.rowsDeleted = await ops.deleteRows(ids);

  return result;
}
