/**
 * GET /v1/blocking — Command Center read of factory_gates_blocking (P1.11).
 *
 * Returns the current blocking gates (state = 'pending' | 'failed') from the
 * THE_FACTORY Neon read-layer, ordered by severity (failed first) then by
 * observed_at DESC. Requires admin session auth (envContextMiddleware applied
 * in index.ts). Returns an empty list when FACTORY_DB is not yet configured.
 */
import { Hono } from 'hono';
import { createDb, sql } from '@latimer-woods-tech/neon';
import type { AppEnv } from '../types.js';

/** Minimal shape of a blocking gate row returned by factory_gates_blocking. */
export interface BlockingGate extends Record<string, unknown> {
  id: string;
  gate_type: string;
  source_system: string;
  source_ref: string;
  subject_type: string;
  subject_repo: string | null;
  subject_ref: string;
  state: string;
  evidence_url: string | null;
  evidence_summary: Record<string, unknown>;
  observed_at: string;
}

/** Maximum rows returned per request. */
const LIMIT = 200;

/**
 * Queries the `factory_gates_blocking` view and returns at most LIMIT rows.
 * Extracted for unit-testability via dependency injection.
 *
 * Returns an empty array when `factoryDb` is not configured.
 */
export async function fetchBlockingGates(
  factoryDb: { connectionString: string } | null | undefined,
): Promise<BlockingGate[]> {
  if (!factoryDb) return [];
  const db = createDb(factoryDb);
  const result = await db.execute<BlockingGate>(sql`
    SELECT id, gate_type, source_system, source_ref,
           subject_type, subject_repo, subject_ref,
           state, evidence_url, evidence_summary,
           observed_at::text
    FROM factory_gates_blocking
    LIMIT ${LIMIT}
  `);
  return result.rows;
}

const blocking = new Hono<AppEnv>();

blocking.get('/', async (c) => {
  const gates = await fetchBlockingGates(c.env.FACTORY_DB ?? null);
  const note = c.env.FACTORY_DB
    ? undefined
    : 'FACTORY_DB not configured — run wrangler secret put FACTORY_DB';
  return c.json({ gates, ...(note ? { note } : {}) });
});

export default blocking;
