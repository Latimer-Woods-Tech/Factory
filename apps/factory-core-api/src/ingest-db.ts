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
  type NewFactoryEventIngest,
  type NewFactoryGate,
  type NewFactoryArtifact,
} from '@latimer-woods-tech/neon';

/** Minimal Hyperdrive-compatible binding shape. */
interface HyperdriveBinding {
  readonly connectionString: string;
}

/** Testable DB interface for ingest operations. */
export interface IngestDb {
  /** Returns an existing event with matching source ID, or null. */
  findEventBySourceId(sourceSystem: string, sourceEventId: string): Promise<{ id: string } | null>;
  /** Inserts a raw event row and returns its generated UUID. */
  insertEvent(event: Omit<NewFactoryEventIngest, 'id' | 'ingestedAt'>): Promise<{ id: string }>;
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

  return {
    async findEventBySourceId(sourceSystem, sourceEventId) {
      const rows = await db
        .select({ id: factoryEventsIngest.id })
        .from(factoryEventsIngest)
        .where(eq(factoryEventsIngest.sourceEventId, sourceEventId))
        .limit(1);
      return rows[0] ?? null;
    },

    async insertEvent(event) {
      const rows = await db
        .insert(factoryEventsIngest)
        .values(event)
        .returning({ id: factoryEventsIngest.id });
      if (!rows[0]) throw new Error('insertEvent returned no rows');
      return rows[0];
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

/**
 * Executes the two-step ingest pattern.
 *
 * Inserts a raw event row first (step 1), then calls `derive` to produce the
 * derived row (step 2). On derive failure the raw event is marked 'failed' and
 * the error is re-thrown so the caller returns a 5xx — the raw event remains
 * for the replay Worker.
 *
 * @returns The UUID of the committed raw event.
 */
export async function twoStepIngest(
  db: IngestDb,
  rawEvent: Omit<NewFactoryEventIngest, 'id' | 'ingestedAt'>,
  derive: (eventId: string) => Promise<void>,
): Promise<string> {
  const { id: eventId } = await db.insertEvent(rawEvent);
  try {
    await derive(eventId);
    await db.markDerived(eventId);
    return eventId;
  } catch (err) {
    await db.markFailed(eventId, err instanceof Error ? err.message : String(err));
    throw err;
  }
}
