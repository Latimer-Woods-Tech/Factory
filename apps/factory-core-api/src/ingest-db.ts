/**
 * DB abstraction for the two-step ingest pattern (Admin Build Plan P1.3).
 *
 * All writes go through twoStepIngest: raw event row is committed BEFORE
 * any derivation runs. Failed derivations leave derivation_status='failed'
 * for the replay Worker to pick up.
 */
import { createDb } from '@latimer-woods-tech/neon';
import {
  factoryEventsIngest,
  factoryGates,
  factoryArtifacts,
  eq,
  and,
  sql,
  type NewFactoryEventIngest,
  type NewFactoryGate,
  type NewFactoryArtifact,
} from '@latimer-woods-tech/neon';

/** Minimal Hyperdrive-compatible binding shape. */
interface HyperdriveBinding {
  readonly connectionString: string;
}

/**
 * Result of a conflict-aware event insert.
 *
 * `inserted` is `true` when this caller won the race and wrote a new row;
 * `false` when a concurrent writer (or earlier request) already committed a
 * row with the same `(source_system, source_event_id)` and this insert was a
 * no-op. In the `false` case `id` is the existing row's UUID, and the caller
 * must NOT run derivation again (the derived gate/artifact already exists).
 */
export interface InsertEventResult {
  /** UUID of the committed (or pre-existing) raw event row. */
  id: string;
  /** Whether this call inserted a new row (`true`) or hit an existing one (`false`). */
  inserted: boolean;
}

/** Testable DB interface for ingest operations. */
export interface IngestDb {
  /** Returns an existing event with matching source system + source ID, or null. */
  findEventBySourceId(sourceSystem: string, sourceEventId: string): Promise<{ id: string } | null>;
  /**
   * Inserts a raw event row, race-safe on `(source_system, source_event_id)`.
   *
   * Uses `INSERT ... ON CONFLICT DO NOTHING` against the partial unique index
   * `ux_events_source_event_id`. If a concurrent writer already committed the
   * same source ID the insert is a no-op; this method then looks up and returns
   * the existing row's id with `inserted: false`. Events with a NULL
   * `source_event_id` never conflict and are always inserted.
   */
  insertEvent(event: Omit<NewFactoryEventIngest, 'id' | 'ingestedAt'>): Promise<InsertEventResult>;
  /** Inserts a derived gate row. */
  insertGate(gate: Omit<NewFactoryGate, 'id' | 'ingestedAt'>): Promise<void>;
  /** Inserts a derived artifact row. */
  insertArtifact(artifact: Omit<NewFactoryArtifact, 'id' | 'createdAt'>): Promise<void>;
  /** Marks a raw event as successfully derived. */
  markDerived(eventId: string): Promise<void>;
  /** Marks a raw event as failed with an error message. */
  markFailed(eventId: string, error: string): Promise<void>;
}

/** Creates a Drizzle-backed IngestDb from a Hyperdrive binding. */
export function createIngestDb(binding: HyperdriveBinding): IngestDb {
  const db = createDb(binding);

  async function findEventBySourceId(
    sourceSystem: string,
    sourceEventId: string,
  ): Promise<{ id: string } | null> {
    const rows = await db
      .select({ id: factoryEventsIngest.id })
      .from(factoryEventsIngest)
      .where(
        and(
          eq(factoryEventsIngest.sourceSystem, sourceSystem),
          eq(factoryEventsIngest.sourceEventId, sourceEventId),
        ),
      )
      .limit(1);
    return rows[0] ?? null;
  }

  return {
    findEventBySourceId,

    async insertEvent(event) {
      const rows = await db
        .insert(factoryEventsIngest)
        .values(event)
        .onConflictDoNothing({
          target: [factoryEventsIngest.sourceSystem, factoryEventsIngest.sourceEventId],
          where: sql`source_event_id IS NOT NULL`,
        })
        .returning({ id: factoryEventsIngest.id });

      if (rows[0]) return { id: rows[0].id, inserted: true };

      // No row returned ⇒ ON CONFLICT DO NOTHING fired: a concurrent writer
      // already committed this (source_system, source_event_id). Resolve the
      // existing row so the caller can return its id without re-deriving.
      // This branch is only reachable when source_event_id is non-null (NULL
      // ids never conflict against the partial index).
      if (event.sourceEventId == null) {
        throw new Error('insertEvent returned no rows for a non-idempotent (null source_event_id) event');
      }
      const existing = await findEventBySourceId(event.sourceSystem, event.sourceEventId);
      if (!existing) {
        throw new Error('insertEvent conflict but no existing event found');
      }
      return { id: existing.id, inserted: false };
    },

    async insertGate(gate) {
      await db.insert(factoryGates).values(gate);
    },

    async insertArtifact(artifact) {
      await db.insert(factoryArtifacts).values(artifact);
    },

    async markDerived(eventId) {
      await db
        .update(factoryEventsIngest)
        .set({ derivationStatus: 'derived', derivationAt: new Date() })
        .where(eq(factoryEventsIngest.id, eventId));
    },

    async markFailed(eventId, error) {
      await db
        .update(factoryEventsIngest)
        .set({ derivationStatus: 'failed', derivationError: error, derivationAt: new Date() })
        .where(eq(factoryEventsIngest.id, eventId));
    },
  };
}

/** Outcome of {@link twoStepIngest}. */
export interface TwoStepIngestResult {
  /** UUID of the committed (or pre-existing) raw event row. */
  eventId: string;
  /**
   * `true` when a new raw event was inserted and derivation ran (caller should
   * return 201). `false` when an idempotent duplicate was detected — derivation
   * was skipped because the derived row already exists (caller should return 200).
   */
  created: boolean;
}

/**
 * Executes the two-step ingest pattern.
 *
 * Inserts a raw event row first (step 1) via a race-safe, conflict-aware insert,
 * then calls `derive` to produce the derived row (step 2). On derive failure the
 * raw event is marked 'failed' and the error is re-thrown so the caller returns a
 * 5xx — the raw event remains for the replay Worker.
 *
 * Idempotency is enforced at the database level by the partial unique index on
 * `(source_system, source_event_id)`. When a concurrent writer already committed
 * the same source id, the insert is a no-op: `derive` is NOT re-run (so derived
 * gate/artifact rows also stay duplicate-free) and the existing event id is
 * returned with `created: false`.
 *
 * @returns The committed raw event id and whether it was newly created.
 */
export async function twoStepIngest(
  db: IngestDb,
  rawEvent: Omit<NewFactoryEventIngest, 'id' | 'ingestedAt'>,
  derive: (eventId: string) => Promise<void>,
): Promise<TwoStepIngestResult> {
  const { id: eventId, inserted } = await db.insertEvent(rawEvent);

  // A concurrent writer won the race: the event (and its derived row) already
  // exist. Do not re-derive — that would duplicate the derived gate/artifact.
  if (!inserted) {
    return { eventId, created: false };
  }

  try {
    await derive(eventId);
    await db.markDerived(eventId);
    return { eventId, created: true };
  } catch (err) {
    await db.markFailed(eventId, err instanceof Error ? err.message : String(err));
    throw err;
  }
}
