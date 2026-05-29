/**
 * GET /v1/command-center/runs|gates|artifacts — Command Center read layer (P2.13).
 *
 * Three endpoints for the Command Center "Runs", "Gates", and "Artifacts"
 * screens. All read directly from THE_FACTORY Neon via the FACTORY_DB
 * Hyperdrive binding. Returns an empty list + note when FACTORY_DB is not
 * configured.
 *
 * Pattern follows /v1/blocking (P1.11): extracted fetch helpers for unit-
 * testability; Hono routes are thin wrappers over those helpers.
 */
import { Hono } from 'hono';
import { createDb, sql } from '@latimer-woods-tech/neon';
import type { AppEnv } from '../types.js';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

function parseLimit(raw: string | undefined): number {
  const n = parseInt(raw ?? '', 10);
  if (Number.isNaN(n) || n < 1) return DEFAULT_LIMIT;
  return Math.min(n, MAX_LIMIT);
}

function parseOffset(raw: string | undefined): number {
  const n = parseInt(raw ?? '', 10);
  if (Number.isNaN(n) || n < 0) return 0;
  return n;
}

// ── Runs ─────────────────────────────────────────────────────────────────────

/** Row shape returned by factory_runs_v. */
export interface RunRow extends Record<string, unknown> {
  id: string;
  template_id: string;
  template_version: number;
  description: string;
  source: string;
  status: string;
  dry_run: boolean;
  pr_url: string | null;
  started_at: string;
  finished_at: string | null;
  mirrored_at: string;
  gates_passed: number;
  gates_failed: number;
  gates_pending: number;
  last_gate_observed_at: string | null;
  deploy_url: string | null;
}

/** Fetch paginated runs from factory_runs_v. Returns [] when FACTORY_DB absent. */
export async function fetchRuns(
  factoryDb: { connectionString: string } | null | undefined,
  opts: { limit?: number; offset?: number } = {},
): Promise<RunRow[]> {
  if (!factoryDb) return [];
  const db = createDb(factoryDb);
  const limit = opts.limit ?? DEFAULT_LIMIT;
  const offset = opts.offset ?? 0;
  const result = await db.execute<RunRow>(sql`
    SELECT
      id, template_id, template_version, description, source, status,
      dry_run, pr_url,
      started_at::text   AS started_at,
      finished_at::text  AS finished_at,
      mirrored_at::text  AS mirrored_at,
      gates_passed, gates_failed, gates_pending,
      last_gate_observed_at::text AS last_gate_observed_at,
      deploy_url
    FROM factory_runs_v
    ORDER BY started_at DESC
    LIMIT ${limit} OFFSET ${offset}
  `);
  return result.rows;
}

// ── Gates ────────────────────────────────────────────────────────────────────

/** Row shape returned by the gates list query. */
export interface GateRow extends Record<string, unknown> {
  id: string;
  ingest_event_id: string;
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
  ingested_at: string;
}

/** Fetch paginated gate transitions from factory_gates. Returns [] when FACTORY_DB absent. */
export async function fetchGates(
  factoryDb: { connectionString: string } | null | undefined,
  opts: { limit?: number; offset?: number } = {},
): Promise<GateRow[]> {
  if (!factoryDb) return [];
  const db = createDb(factoryDb);
  const limit = opts.limit ?? DEFAULT_LIMIT;
  const offset = opts.offset ?? 0;
  const result = await db.execute<GateRow>(sql`
    SELECT
      id, ingest_event_id, gate_type, source_system, source_ref,
      subject_type, subject_repo, subject_ref,
      state, evidence_url, evidence_summary,
      observed_at::text  AS observed_at,
      ingested_at::text  AS ingested_at
    FROM factory_gates
    ORDER BY observed_at DESC
    LIMIT ${limit} OFFSET ${offset}
  `);
  return result.rows;
}

// ── Artifacts ────────────────────────────────────────────────────────────────

/** Row shape returned by the artifacts list query. */
export interface ArtifactRow extends Record<string, unknown> {
  id: string;
  artifact_type: string;
  producer_type: string;
  producer_ref: string;
  subject_app: string | null;
  subject_repo: string | null;
  subject_ref: string | null;
  uri: string;
  uri_scheme: string | null;
  checksum: string | null;
  size_bytes: number | null;
  mime_type: string | null;
  duration_ms: number | null;
  metadata: Record<string, unknown>;
  created_at: string;
  expires_at: string | null;
}

/** Fetch paginated artifacts from factory_artifacts. Returns [] when FACTORY_DB absent. */
export async function fetchArtifacts(
  factoryDb: { connectionString: string } | null | undefined,
  opts: { limit?: number; offset?: number } = {},
): Promise<ArtifactRow[]> {
  if (!factoryDb) return [];
  const db = createDb(factoryDb);
  const limit = opts.limit ?? DEFAULT_LIMIT;
  const offset = opts.offset ?? 0;
  const result = await db.execute<ArtifactRow>(sql`
    SELECT
      id, artifact_type, producer_type, producer_ref,
      subject_app, subject_repo, subject_ref,
      uri, uri_scheme, checksum, size_bytes, mime_type, duration_ms,
      metadata,
      created_at::text  AS created_at,
      expires_at::text  AS expires_at
    FROM factory_artifacts
    ORDER BY created_at DESC
    LIMIT ${limit} OFFSET ${offset}
  `);
  return result.rows;
}

// ── Hono routes ──────────────────────────────────────────────────────────────

const commandCenter = new Hono<AppEnv>();

commandCenter.get('/runs', async (c) => {
  const limit = parseLimit(c.req.query('limit'));
  const offset = parseOffset(c.req.query('offset'));
  const rows = await fetchRuns(c.env.FACTORY_DB ?? null, { limit, offset });
  const note = c.env.FACTORY_DB
    ? undefined
    : 'FACTORY_DB not configured — run wrangler secret put FACTORY_DB';
  return c.json({ runs: rows, ...(note ? { note } : {}) });
});

commandCenter.get('/gates', async (c) => {
  const limit = parseLimit(c.req.query('limit'));
  const offset = parseOffset(c.req.query('offset'));
  const rows = await fetchGates(c.env.FACTORY_DB ?? null, { limit, offset });
  const note = c.env.FACTORY_DB
    ? undefined
    : 'FACTORY_DB not configured — run wrangler secret put FACTORY_DB';
  return c.json({ gates: rows, ...(note ? { note } : {}) });
});

commandCenter.get('/artifacts', async (c) => {
  const limit = parseLimit(c.req.query('limit'));
  const offset = parseOffset(c.req.query('offset'));
  const rows = await fetchArtifacts(c.env.FACTORY_DB ?? null, { limit, offset });
  const note = c.env.FACTORY_DB
    ? undefined
    : 'FACTORY_DB not configured — run wrangler secret put FACTORY_DB';
  return c.json({ artifacts: rows, ...(note ? { note } : {}) });
});

export default commandCenter;
