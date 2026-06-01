/**
 * Core replay logic for the factory-events-replay cron Worker (P1.10).
 *
 * Fetches up to MAX_BATCH `factory_events_ingest` rows with
 * `derivation_status='failed'`, re-derives each one into the appropriate
 * downstream table (`factory_gates` or `factory_artifacts`), and marks it
 * `'replayed'` on success or refreshes the error message on failure.
 *
 * The derivation target is determined by `derivation_targets[0]`:
 *   - `'factory_gates'`     → parse gate fields from payload, insert gate row
 *   - `'factory_artifacts'` → parse artifact fields from payload, insert artifact row
 *   - anything else         → skip (logged as warn; skipped count incremented)
 *
 * The payload stored in `factory_events_ingest` is the verbatim snake_case
 * request body captured by the ingest routes, so field names match the Zod
 * schemas in `routes/gates.ts` and `routes/artifacts.ts`.
 */
import { createReplayDb, type FailedEvent, type ReplayDb } from './replay-db.js';
import type { Env } from './env.js';

/** Maximum events to process per cron tick — prevents Worker timeout. */
const MAX_BATCH = 50;

/** Result summary returned by {@link replayFailedEvents}. */
export interface ReplayResult {
  /** Events successfully re-derived and marked 'replayed'. */
  replayed: number;
  /** Events where re-derivation threw an error (error message refreshed). */
  failed: number;
  /** Events skipped because their derivation target is unknown. */
  skipped: number;
}

/**
 * Re-derives up to `limit` failed ingest events.
 *
 * @param env   - Worker bindings (DB Hyperdrive).
 * @param limit - Maximum events to process; defaults to MAX_BATCH.
 * @param ops   - DB operations; defaults to a real Drizzle instance. Pass a
 *                mock here in tests to avoid live DB connections.
 */
export async function replayFailedEvents(
  env: Env,
  limit: number = MAX_BATCH,
  ops: ReplayDb = createReplayDb(env.DB),
): Promise<ReplayResult> {
  const events = await ops.fetchFailedEvents(limit);

  let replayed = 0;
  let failed = 0;
  let skipped = 0;

  for (const event of events) {
    const target = event.derivationTargets?.[0];

    if (target !== 'factory_gates' && target !== 'factory_artifacts') {
      console.warn(
        JSON.stringify({
          level: 'warn',
          msg: 'replay: unknown derivation target — skipping',
          eventId: event.id,
          target: target ?? null,
        }),
      );
      skipped++;
      continue;
    }

    try {
      if (target === 'factory_gates') {
        await deriveGate(event, ops);
      } else {
        await deriveArtifact(event, ops);
      }
      await ops.markReplayed(event.id);
      replayed++;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(
        JSON.stringify({
          level: 'error',
          msg: 'replay: derivation failed',
          eventId: event.id,
          target,
          error: message,
        }),
      );
      try {
        await ops.markReplayFailed(event.id, message);
      } catch (markErr) {
        console.error(
          JSON.stringify({
            level: 'error',
            msg: 'replay: could not update error on event',
            eventId: event.id,
            error: markErr instanceof Error ? markErr.message : String(markErr),
          }),
        );
      }
      failed++;
    }
  }

  return { replayed, failed, skipped };
}

/** Re-inserts a gate row from the payload of a failed gate ingest event. */
async function deriveGate(event: FailedEvent, ops: ReplayDb): Promise<void> {
  const p = event.payload as Record<string, unknown>;
  const gateType = p['gate_type'];
  const sourceSystem = p['source_system'];
  const sourceRef = p['source_ref'];
  const subjectType = p['subject_type'];
  const subjectRef = p['subject_ref'];
  const state = p['state'];

  if (
    typeof gateType !== 'string' ||
    typeof sourceSystem !== 'string' ||
    typeof sourceRef !== 'string' ||
    typeof subjectType !== 'string' ||
    typeof subjectRef !== 'string' ||
    typeof state !== 'string'
  ) {
    throw new Error('gate payload missing required fields');
  }

  const subjectRepo = typeof p['subject_repo'] === 'string' ? p['subject_repo'] : undefined;
  const evidenceUrl = typeof p['evidence_url'] === 'string' ? p['evidence_url'] : undefined;
  const evidenceSummary =
    p['evidence_summary'] != null && typeof p['evidence_summary'] === 'object'
      ? (p['evidence_summary'] as Record<string, unknown>)
      : {};

  await ops.insertGate({
    ingestEventId: event.id,
    gateType,
    sourceSystem,
    sourceRef,
    subjectType,
    subjectRepo,
    subjectRef,
    state,
    evidenceUrl,
    evidenceSummary,
    observedAt: event.observedAt,
  });
}

/** Re-inserts an artifact row from the payload of a failed artifact ingest event. */
async function deriveArtifact(event: FailedEvent, ops: ReplayDb): Promise<void> {
  const p = event.payload as Record<string, unknown>;
  const artifactType = p['artifact_type'];
  const producerType = p['producer_type'];
  const producerRef = p['producer_ref'];
  const uri = p['uri'];

  if (
    typeof artifactType !== 'string' ||
    typeof producerType !== 'string' ||
    typeof producerRef !== 'string' ||
    typeof uri !== 'string'
  ) {
    throw new Error('artifact payload missing required fields');
  }

  const subjectApp = typeof p['subject_app'] === 'string' ? p['subject_app'] : undefined;
  const subjectRepo = typeof p['subject_repo'] === 'string' ? p['subject_repo'] : undefined;
  const subjectRef = typeof p['subject_ref'] === 'string' ? p['subject_ref'] : undefined;
  const checksum = typeof p['checksum'] === 'string' ? p['checksum'] : undefined;
  const sizeBytes = typeof p['size_bytes'] === 'number' ? p['size_bytes'] : undefined;
  const mimeType = typeof p['mime_type'] === 'string' ? p['mime_type'] : undefined;
  const durationMs = typeof p['duration_ms'] === 'number' ? p['duration_ms'] : undefined;
  const metadata =
    p['metadata'] != null && typeof p['metadata'] === 'object'
      ? (p['metadata'] as Record<string, unknown>)
      : {};
  const expiresAt =
    typeof p['expires_at'] === 'string' ? new Date(p['expires_at']) : undefined;

  await ops.insertArtifact({
    artifactType,
    producerType,
    producerRef,
    subjectApp,
    subjectRepo,
    subjectRef,
    uri,
    checksum,
    sizeBytes,
    mimeType,
    durationMs,
    metadata,
    expiresAt,
  });
}
