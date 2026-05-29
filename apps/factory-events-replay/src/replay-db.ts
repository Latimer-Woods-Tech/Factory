/**
 * DB abstraction for the factory-events-replay Worker (P1.10).
 *
 * Separates the Drizzle adapter from the replay logic so tests can inject
 * a mock without requiring a live Neon connection.
 */
import { createDb, eq, sql } from '@latimer-woods-tech/neon';
import {
  factoryEventsIngest,
  factoryGates,
  factoryArtifacts,
  type NewFactoryGate,
  type NewFactoryArtifact,
} from '@latimer-woods-tech/neon';

/** Minimal Hyperdrive-compatible binding shape. */
interface HyperdriveBinding {
  readonly connectionString: string;
}

/** A failed ingest event row queried by the replay Worker. */
export interface FailedEvent {
  /** UUID primary key from `factory_events_ingest`. */
  id: string;
  /** e.g. `"gate.ci"` or `"artifact.video"`. Drives derivation dispatch. */
  sourceEventType: string;
  /** Original request body stored by the ingest route. */
  payload: unknown;
  /** Which derived tables were targeted (from original ingest call). */
  derivationTargets: string[] | null;
  /** When the source event was observed (stored as a proper timestamp). */
  observedAt: Date;
}

/** Testable DB interface for replay operations. */
export interface ReplayDb {
  /** Returns up to `limit` events with derivation_status='failed'. */
  fetchFailedEvents(limit: number): Promise<FailedEvent[]>;
  /** Inserts a gate row derived from a failed event. */
  insertGate(gate: Omit<NewFactoryGate, 'id' | 'ingestedAt'>): Promise<void>;
  /** Inserts an artifact row derived from a failed event. */
  insertArtifact(artifact: Omit<NewFactoryArtifact, 'id' | 'createdAt'>): Promise<void>;
  /** Marks a raw event as successfully replayed. */
  markReplayed(eventId: string): Promise<void>;
  /** Updates the error on a failed event that could not be replayed. */
  markReplayFailed(eventId: string, error: string): Promise<void>;
}

/** Creates a Drizzle-backed ReplayDb from a Hyperdrive binding. */
/* c8 ignore start — Drizzle adapter; requires a live Neon connection (integration test) */
export function createReplayDb(binding: HyperdriveBinding): ReplayDb {
  const db = createDb(binding);

  return {
    async fetchFailedEvents(limit) {
      const rows = await db
        .select({
          id: factoryEventsIngest.id,
          sourceEventType: factoryEventsIngest.sourceEventType,
          payload: factoryEventsIngest.payload,
          derivationTargets: factoryEventsIngest.derivationTargets,
          observedAt: factoryEventsIngest.observedAt,
        })
        .from(factoryEventsIngest)
        .where(eq(factoryEventsIngest.derivationStatus, 'failed'))
        .limit(limit);
      return rows.map((r) => ({
        ...r,
        observedAt: r.observedAt instanceof Date ? r.observedAt : new Date(r.observedAt),
      }));
    },

    async insertGate(gate) {
      await db.insert(factoryGates).values(gate);
    },

    async insertArtifact(artifact) {
      await db.insert(factoryArtifacts).values(artifact);
    },

    async markReplayed(eventId) {
      await db
        .update(factoryEventsIngest)
        .set({
          derivationStatus: 'replayed',
          derivationError: null,
          derivationAt: new Date(),
        })
        .where(eq(factoryEventsIngest.id, eventId));
    },

    async markReplayFailed(eventId, error) {
      await db
        .update(factoryEventsIngest)
        .set({
          derivationStatus: 'failed',
          derivationError: sql`${error}`,
          derivationAt: new Date(),
        })
        .where(eq(factoryEventsIngest.id, eventId));
    },
  };
}
/* c8 ignore stop */
