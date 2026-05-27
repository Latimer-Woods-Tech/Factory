/**
 * DB abstraction for supervisor run mirroring (P1.9).
 *
 * Upserts run rows into `factory_runs_mirror` via Drizzle ON CONFLICT DO UPDATE,
 * keeping status, prUrl, finishedAt, and mirroredAt current on each push.
 */
import { createDb } from '@latimer-woods-tech/neon';
import { factoryRunsMirror, sql } from '@latimer-woods-tech/neon';
import type { NewFactoryRunsMirror } from '@latimer-woods-tech/neon';

/** Minimal Hyperdrive-compatible binding shape. */
interface HyperdriveBinding {
  readonly connectionString: string;
}

/** Testable DB interface for run mirror operations. */
export interface RunsMirrorDb {
  /** Upsert a terminal run row into `factory_runs_mirror`. */
  upsertRun(run: Omit<NewFactoryRunsMirror, 'mirroredAt'>): Promise<void>;
}

/** Creates a Drizzle-backed RunsMirrorDb from a Hyperdrive binding. */
/* c8 ignore start — Drizzle adapter; requires a live Neon connection (integration test) */
export function createRunsMirrorDb(binding: HyperdriveBinding): RunsMirrorDb {
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
  };
}
/* c8 ignore stop */
