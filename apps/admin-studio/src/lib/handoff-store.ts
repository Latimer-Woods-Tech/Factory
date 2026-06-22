/**
 * Capability handoff + provision-request + service lineage persistence.
 *
 * Stage B (Golden Design): durable, content-addressable handoff artifacts.
 * Stage C: audited staging-provision-request channel that references those
 * handoffs.
 * Stage 3: capability_services lineage table — one row per provisioned service,
 * recording the deployed_sha + manifest_hash for drift detection and the
 * upgrade-candidate loop (Backcasting Phase 5+).
 *
 * Schema is mirrored in:
 *   apps/admin-studio/migrations/0006_capability_handoffs.sql
 *   apps/admin-studio/migrations/0007_capability_services.sql
 * and applied lazily here via ensureSchema() so fresh deploys don't 500
 * before the migrations are run.
 */

import { createDb, sql, type FactoryDb, type HyperdriveBinding } from '@latimer-woods-tech/neon';
import type { CapabilityPlan } from './capability-plan.js';
import type { GraphSourceProvenance } from './graph-store.js';

export interface HandoffRecord {
  id: string;
  /**
   * Constant 'scaffold-handoff' — the only kind ever persisted today.
   * Reconstructed from the row (not stored in its own column) so the
   * shape matches the in-memory body produced by /capabilities/handoff
   * and the validator in packages/deploy/scripts/scaffold.mjs.
   */
  kind: 'scaffold-handoff';
  hash: string;
  schemaVersion: '1.0.0';
  conceptId: string;
  recipeId: string;
  parameters: Record<string, string | number | boolean | null>;
  plan: CapabilityPlan;
  preview: string;
  nextAction: {
    action: 'generate-scaffold-handoff' | 'request-staging-provision';
    conceptId: string;
    recipeId: string;
  };
  sourceGraph?: GraphSourceProvenance;
  createdAt: string;
  createdBy: string;
  env: 'local' | 'staging' | 'production';
}

export interface ProvisionRequestRecord {
  id: string;
  handoffId: string;
  /**
   * Content-addressable hash of the referenced handoff. Populated when the
   * record is returned by `listProvisionRequests` (which JOINs
   * `capability_handoffs`). Absent when fetched by id via
   * `findProvisionRequestById` to avoid the extra JOIN on the hot polling path.
   */
  handoffHash?: string;
  status: 'requested' | 'acknowledged' | 'dispatched' | 'succeeded' | 'failed' | 'withdrawn';
  proofGates: ProofGateState;
  requestedBy: string;
  requestedAt: string;
  env: 'local' | 'staging' | 'production';
  notes: string | null;
}

/**
 * Stage 3 — lineage record for a provisioned service.
 *
 * One row per service_id. Re-provision UPSERTs the row so each service always
 * reflects its most-recent deployment. The combination of `deployed_sha` +
 * `manifest_hash` against the canonical compiled plan is the drift signal:
 * if either diverges, the service is a re-provision candidate.
 */
export interface ServiceRecord {
  id: string;
  /** Stable human-readable worker identifier (e.g. "media-room"). */
  serviceId: string;
  /** FK: the handoff that defines what this service should look like. */
  handoffId: string;
  /** FK: the provision request that triggered the scaffold run (nullable). */
  provisionRequestId: string | null;
  /** Git SHA of the Factory Core repo at deploy time. */
  deployedSha: string;
  /**
   * Content hash stored at deploy time (wrangler.jsonc hash for the scaffold
   * workflow). The drift cron compares this against the SHA-256 of the live
   * /manifest endpoint response to detect configuration divergence.
   */
  manifestHash: string;
  /** Timestamp of the most recent automated drift check; null until first run. */
  lastDriftCheckAt: string | null;
  /** Staging worker URL (e.g. https://foo-staging.adrper79.workers.dev). */
  workerUrl: string | null;
  /** True if the last drift check detected a hash mismatch. */
  driftDetected: boolean;
  /** Timestamp when drift was first detected; null until drift occurs. */
  driftFirstSeenAt: string | null;
  /** SHA-256 hex of the /manifest response observed during the last drift check. */
  liveManifestHash: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ProofGateState {
  reviewedPlan: boolean;
  reviewedEnvContract: boolean;
  reviewedSmokeChecks: boolean;
  acknowledgedStagingFirst: boolean;
  acknowledgedCustomDomain: boolean;
}

export const REQUIRED_PROOF_GATES: ReadonlyArray<keyof ProofGateState> = [
  'reviewedPlan',
  'reviewedEnvContract',
  'reviewedSmokeChecks',
  'acknowledgedStagingFirst',
  'acknowledgedCustomDomain',
];

const dbCache = new WeakMap<HyperdriveBinding, FactoryDb>();
const schemaInitCache = new WeakMap<HyperdriveBinding, Promise<void>>();

function getDb(hyperdrive: HyperdriveBinding): FactoryDb {
  let db = dbCache.get(hyperdrive);
  if (!db) {
    db = createDb(hyperdrive);
    dbCache.set(hyperdrive, db);
  }
  return db;
}

async function ensureSchema(hyperdrive: HyperdriveBinding): Promise<void> {
  let init = schemaInitCache.get(hyperdrive);
  if (!init) {
    const db = getDb(hyperdrive);
    init = (async () => {
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS capability_handoffs (
          id UUID PRIMARY KEY,
          hash TEXT NOT NULL UNIQUE,
          schema_version TEXT NOT NULL,
          concept_id TEXT NOT NULL,
          recipe_id TEXT NOT NULL,
          parameters JSONB NOT NULL DEFAULT '{}'::jsonb,
          plan JSONB NOT NULL,
          preview TEXT NOT NULL,
          next_action JSONB NOT NULL,
          source_graph JSONB,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          created_by TEXT NOT NULL,
          env TEXT NOT NULL CHECK (env IN ('local','staging','production'))
        )
      `);
      await db.execute(sql`
        ALTER TABLE capability_handoffs
        ADD COLUMN IF NOT EXISTS source_graph JSONB
      `);
      await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_capability_handoffs_concept ON capability_handoffs (concept_id, created_at DESC)`);
      await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_capability_handoffs_recipe  ON capability_handoffs (recipe_id,  created_at DESC)`);
      await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_capability_handoffs_created ON capability_handoffs (created_at DESC)`);

      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS capability_provision_requests (
          id UUID PRIMARY KEY,
          handoff_id UUID NOT NULL REFERENCES capability_handoffs(id) ON DELETE RESTRICT,
          status TEXT NOT NULL CHECK (status IN ('requested','acknowledged','dispatched','succeeded','failed','withdrawn')),
          proof_gates JSONB NOT NULL,
          requested_by TEXT NOT NULL,
          requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          env TEXT NOT NULL CHECK (env IN ('local','staging','production')),
          notes TEXT
        )
      `);
      await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_capability_provision_requests_handoff ON capability_provision_requests (handoff_id)`);
      await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_capability_provision_requests_status ON capability_provision_requests (status, requested_at DESC)`);

      // Stage 3: service lineage table (mirrors 0007_capability_services.sql).
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS capability_services (
          id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          service_id           TEXT NOT NULL,
          handoff_id           UUID NOT NULL REFERENCES capability_handoffs(id) ON DELETE RESTRICT,
          provision_request_id UUID REFERENCES capability_provision_requests(id) ON DELETE SET NULL,
          deployed_sha         TEXT NOT NULL,
          manifest_hash        TEXT NOT NULL,
          last_drift_check_at  TIMESTAMPTZ,
          worker_url           TEXT,
          drift_detected       BOOLEAN NOT NULL DEFAULT false,
          drift_first_seen_at  TIMESTAMPTZ,
          live_manifest_hash   TEXT,
          created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `);
      await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_capability_services_service_id ON capability_services (service_id)`);
      await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_capability_services_handoff          ON capability_services (handoff_id)`);
      await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_capability_services_drift_check      ON capability_services (last_drift_check_at DESC NULLS FIRST)`);
      // Stage 4: drift detection columns — added via ALTER so existing deploys pick them up.
      await db.execute(sql`ALTER TABLE capability_services ADD COLUMN IF NOT EXISTS worker_url TEXT`);
      await db.execute(sql`ALTER TABLE capability_services ADD COLUMN IF NOT EXISTS drift_detected BOOLEAN NOT NULL DEFAULT false`);
      await db.execute(sql`ALTER TABLE capability_services ADD COLUMN IF NOT EXISTS drift_first_seen_at TIMESTAMPTZ`);
      await db.execute(sql`ALTER TABLE capability_services ADD COLUMN IF NOT EXISTS live_manifest_hash TEXT`);
    })();
    schemaInitCache.set(hyperdrive, init);
    init.catch(() => { schemaInitCache.delete(hyperdrive); });
  }
  await init;
}

/**
 * Persist a handoff (idempotent on hash). If a handoff with the same content
 * hash already exists, returns the existing record. Otherwise inserts a fresh
 * row and returns it.
 *
 * Throws on real DB failures so the caller can surface them (HTTP 500 with
 * an audited error). The previous "swallow + return in-memory record"
 * behaviour masked storage outages: clients received a handoff_id that
 * pointed at nothing, then 404'd on the immediate follow-up call to
 * /provision-staging. Surfacing the failure is the correct behaviour.
 */
export async function persistHandoff(
  hyperdrive: HyperdriveBinding,
  record: Omit<HandoffRecord, 'id' | 'createdAt' | 'kind'> & {
    id?: string;
    createdAt?: string;
  },
): Promise<HandoffRecord> {
  const id = record.id ?? crypto.randomUUID();
  const createdAt = record.createdAt ?? new Date().toISOString();

  await ensureSchema(hyperdrive);
  const db = getDb(hyperdrive);

  const existing = await db.execute(sql`
    SELECT id, hash, schema_version, concept_id, recipe_id, parameters, plan, preview,
           next_action, source_graph, created_at, created_by, env
    FROM capability_handoffs
    WHERE hash = ${record.hash}
    LIMIT 1
  `);
  const existingRow = (existing.rows as unknown[])[0] as HandoffRow | undefined;
  if (existingRow) {
    return rowToRecord(existingRow);
  }

  await db.execute(sql`
    INSERT INTO capability_handoffs (
      id, hash, schema_version, concept_id, recipe_id, parameters, plan, preview,
      next_action, source_graph, created_at, created_by, env
    ) VALUES (
      ${id}, ${record.hash}, ${record.schemaVersion}, ${record.conceptId}, ${record.recipeId},
      ${JSON.stringify(record.parameters)}::jsonb,
      ${JSON.stringify(record.plan)}::jsonb,
      ${record.preview},
      ${JSON.stringify(record.nextAction)}::jsonb,
      ${record.sourceGraph ? JSON.stringify(record.sourceGraph) : null}::jsonb,
      ${createdAt}, ${record.createdBy}, ${record.env}
    )
    ON CONFLICT (hash) DO NOTHING
  `);
  return {
    ...record,
    id,
    kind: 'scaffold-handoff',
    createdAt,
  };
}

export async function findHandoffById(
  hyperdrive: HyperdriveBinding,
  id: string,
): Promise<HandoffRecord | null> {
  try {
    await ensureSchema(hyperdrive);
    const db = getDb(hyperdrive);
    const result = await db.execute(sql`
      SELECT id, hash, schema_version, concept_id, recipe_id, parameters, plan, preview, next_action, source_graph, created_at, created_by, env
      FROM capability_handoffs
      WHERE id = ${id}
      LIMIT 1
    `);
    const row = (result.rows as unknown[])[0] as HandoffRow | undefined;
    return row ? rowToRecord(row) : null;
  } catch (err) {
    console.error('[handoff-store] lookup failed:', (err as Error).message);
    return null;
  }
}

/**
 * Hash-based handoff lookup. Used by /provision-staging as a fallback when
 * the id-based lookup misses — closes the Hyperdrive read-after-write race
 * where a just-inserted row isn't yet visible to the pooled connection
 * the follow-up call lands on. Since the handoff hash is content-addressable
 * (returned by POST /handoff), the client always has it.
 */
export async function findHandoffByHash(
  hyperdrive: HyperdriveBinding,
  hash: string,
): Promise<HandoffRecord | null> {
  try {
    await ensureSchema(hyperdrive);
    const db = getDb(hyperdrive);
    const result = await db.execute(sql`
      SELECT id, hash, schema_version, concept_id, recipe_id, parameters, plan, preview, next_action, source_graph, created_at, created_by, env
      FROM capability_handoffs
      WHERE hash = ${hash}
      LIMIT 1
    `);
    const row = (result.rows as unknown[])[0] as HandoffRow | undefined;
    return row ? rowToRecord(row) : null;
  } catch (err) {
    console.error('[handoff-store] hash lookup failed:', (err as Error).message);
    return null;
  }
}

export async function listHandoffs(
  hyperdrive: HyperdriveBinding,
  filter: { conceptId?: string; recipeId?: string; limit?: number } = {},
): Promise<HandoffRecord[]> {
  try {
    await ensureSchema(hyperdrive);
    const db = getDb(hyperdrive);
    const limit = clamp(filter.limit ?? 50, 1, 200);

    const conditions: ReturnType<typeof sql>[] = [];
    if (filter.conceptId) conditions.push(sql`concept_id = ${filter.conceptId}`);
    if (filter.recipeId) conditions.push(sql`recipe_id = ${filter.recipeId}`);
    const whereChunks: ReturnType<typeof sql>[] = [];
    for (let i = 0; i < conditions.length; i += 1) {
      whereChunks.push(i === 0 ? sql`WHERE` : sql`AND`);
      whereChunks.push(conditions[i]!);
    }
    const whereClause = sql.join(whereChunks, sql` `);

    const result = await db.execute(sql`
      SELECT id, hash, schema_version, concept_id, recipe_id, parameters, plan, preview, next_action, source_graph, created_at, created_by, env
      FROM capability_handoffs
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT ${limit}
    `);
    return (result.rows as unknown as HandoffRow[]).map(rowToRecord);
  } catch (err) {
    console.error('[handoff-store] list handoffs failed:', (err as Error).message);
    return [];
  }
}

export async function findProvisionRequestById(
  hyperdrive: HyperdriveBinding,
  id: string,
): Promise<ProvisionRequestRecord | null> {
  try {
    await ensureSchema(hyperdrive);
    const db = getDb(hyperdrive);
    const result = await db.execute(sql`
      SELECT id, handoff_id, status, proof_gates, requested_by, requested_at, env, notes
      FROM capability_provision_requests
      WHERE id = ${id}
      LIMIT 1
    `);
    const row = (result.rows as unknown as ProvisionRequestRow[])[0];
    if (!row) return null;
    return {
      id: row.id,
      handoffId: row.handoff_id,
      status: row.status,
      proofGates: row.proof_gates,
      requestedBy: row.requested_by,
      requestedAt: row.requested_at,
      env: row.env,
      notes: row.notes,
    };
  } catch (err) {
    console.error('[handoff-store] provision-request lookup failed:', (err as Error).message);
    return null;
  }
}

export async function listProvisionRequests(
  hyperdrive: HyperdriveBinding,
  filter: {
    status?: ProvisionRequestRecord['status'];
    handoffId?: string;
    limit?: number;
  } = {},
): Promise<ProvisionRequestRecord[]> {
  try {
    await ensureSchema(hyperdrive);
    const db = getDb(hyperdrive);
    const limit = clamp(filter.limit ?? 50, 1, 200);

    // Column aliases use `pr.` prefix so the WHERE conditions can reference
    // the provision-request columns without ambiguity after the JOIN.
    const conditions: ReturnType<typeof sql>[] = [];
    if (filter.status) conditions.push(sql`pr.status = ${filter.status}`);
    if (filter.handoffId) conditions.push(sql`pr.handoff_id = ${filter.handoffId}`);
    const whereChunks: ReturnType<typeof sql>[] = [];
    for (let i = 0; i < conditions.length; i += 1) {
      whereChunks.push(i === 0 ? sql`WHERE` : sql`AND`);
      whereChunks.push(conditions[i]!);
    }
    const whereClause = sql.join(whereChunks, sql` `);

    // LEFT JOIN capability_handoffs to include the handoff hash so the
    // auto-dispatcher can resolve conceptId via hash when id-based lookup
    // misses (Hyperdrive read-after-write race — see auto-dispatch-provision.yml).
    const result = await db.execute(sql`
      SELECT pr.id, pr.handoff_id, pr.status, pr.proof_gates, pr.requested_by,
             pr.requested_at, pr.env, pr.notes,
             ch.hash AS handoff_hash
      FROM capability_provision_requests pr
      LEFT JOIN capability_handoffs ch ON ch.id = pr.handoff_id
      ${whereClause}
      ORDER BY pr.requested_at DESC
      LIMIT ${limit}
    `);
    return (result.rows as unknown as ProvisionRequestRow[]).map((row) => ({
      id: row.id,
      handoffId: row.handoff_id,
      handoffHash: row.handoff_hash ?? undefined,
      status: row.status,
      proofGates: row.proof_gates,
      requestedBy: row.requested_by,
      requestedAt: row.requested_at,
      env: row.env,
      notes: row.notes,
    }));
  } catch (err) {
    console.error('[handoff-store] list provision-requests failed:', (err as Error).message);
    return [];
  }
}

export async function transitionProvisionRequest(
  hyperdrive: HyperdriveBinding,
  id: string,
  next: {
    status: ProvisionRequestRecord['status'];
    notes?: string;
  },
): Promise<ProvisionRequestRecord | null> {
  try {
    await ensureSchema(hyperdrive);
    const db = getDb(hyperdrive);
    const result = await db.execute(sql`
      UPDATE capability_provision_requests
      SET status = ${next.status},
          notes = COALESCE(${next.notes ?? null}, notes)
      WHERE id = ${id}
      RETURNING id, handoff_id, status, proof_gates, requested_by, requested_at, env, notes
    `);
    const row = (result.rows as unknown as ProvisionRequestRow[])[0];
    if (!row) return null;
    return {
      id: row.id,
      handoffId: row.handoff_id,
      status: row.status,
      proofGates: row.proof_gates,
      requestedBy: row.requested_by,
      requestedAt: row.requested_at,
      env: row.env,
      notes: row.notes,
    };
  } catch (err) {
    console.error('[handoff-store] transition provision-request failed:', (err as Error).message);
    return null;
  }
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

interface ProvisionRequestRow {
  id: string;
  handoff_id: string;
  /** Populated by LEFT JOIN in listProvisionRequests; absent in findProvisionRequestById. */
  handoff_hash?: string | null;
  status: ProvisionRequestRecord['status'];
  proof_gates: ProofGateState;
  requested_by: string;
  requested_at: string;
  env: ProvisionRequestRecord['env'];
  notes: string | null;
}

export async function recordProvisionRequest(
  hyperdrive: HyperdriveBinding,
  input: Omit<ProvisionRequestRecord, 'id' | 'requestedAt' | 'status'> & {
    id?: string;
    requestedAt?: string;
    status?: ProvisionRequestRecord['status'];
  },
): Promise<ProvisionRequestRecord> {
  const id = input.id ?? crypto.randomUUID();
  const requestedAt = input.requestedAt ?? new Date().toISOString();
  const status = input.status ?? 'requested';
  const record: ProvisionRequestRecord = { ...input, id, requestedAt, status };

  try {
    await ensureSchema(hyperdrive);
    const db = getDb(hyperdrive);
    await db.execute(sql`
      INSERT INTO capability_provision_requests (
        id, handoff_id, status, proof_gates, requested_by, requested_at, env, notes
      ) VALUES (
        ${id}, ${input.handoffId}, ${status},
        ${JSON.stringify(input.proofGates)}::jsonb,
        ${input.requestedBy}, ${requestedAt}, ${input.env}, ${input.notes ?? null}
      )
    `);
    return record;
  } catch (err) {
    console.error('[handoff-store] provision-request insert failed:', (err as Error).message);
    return record;
  }
}

export function validateProofGates(state: Partial<ProofGateState> | undefined | null): {
  valid: boolean;
  missing: ReadonlyArray<keyof ProofGateState>;
  normalized: ProofGateState;
} {
  const normalized: ProofGateState = {
    reviewedPlan: Boolean(state?.reviewedPlan),
    reviewedEnvContract: Boolean(state?.reviewedEnvContract),
    reviewedSmokeChecks: Boolean(state?.reviewedSmokeChecks),
    acknowledgedStagingFirst: Boolean(state?.acknowledgedStagingFirst),
    acknowledgedCustomDomain: Boolean(state?.acknowledgedCustomDomain),
  };
  const missing = REQUIRED_PROOF_GATES.filter((gate) => !normalized[gate]);
  return { valid: missing.length === 0, missing, normalized };
}

interface HandoffRow {
  id: string;
  hash: string;
  schema_version: string;
  concept_id: string;
  recipe_id: string;
  parameters: Record<string, string | number | boolean | null>;
  plan: CapabilityPlan;
  preview: string;
  next_action: HandoffRecord['nextAction'];
  source_graph?: GraphSourceProvenance | null;
  created_at: string;
  created_by: string;
  env: HandoffRecord['env'];
}

function rowToRecord(row: HandoffRow): HandoffRecord {
  return {
    id: row.id,
    kind: 'scaffold-handoff',
    hash: row.hash,
    schemaVersion: row.schema_version as '1.0.0',
    conceptId: row.concept_id,
    recipeId: row.recipe_id,
    parameters: row.parameters,
    plan: row.plan,
    preview: row.preview,
    nextAction: row.next_action,
    ...(row.source_graph ? { sourceGraph: row.source_graph } : {}),
    createdAt: row.created_at,
    createdBy: row.created_by,
    env: row.env,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Stage 3 — Service lineage CRUD
// ─────────────────────────────────────────────────────────────────────────────

interface ServiceRow {
  id: string;
  service_id: string;
  handoff_id: string;
  provision_request_id: string | null;
  deployed_sha: string;
  manifest_hash: string;
  last_drift_check_at: string | null;
  worker_url: string | null;
  drift_detected: boolean;
  drift_first_seen_at: string | null;
  live_manifest_hash: string | null;
  created_at: string;
  updated_at: string;
}

function serviceRowToRecord(row: ServiceRow): ServiceRecord {
  return {
    id: row.id,
    serviceId: row.service_id,
    handoffId: row.handoff_id,
    provisionRequestId: row.provision_request_id,
    deployedSha: row.deployed_sha,
    manifestHash: row.manifest_hash,
    lastDriftCheckAt: row.last_drift_check_at,
    workerUrl: row.worker_url,
    driftDetected: row.drift_detected,
    driftFirstSeenAt: row.drift_first_seen_at,
    liveManifestHash: row.live_manifest_hash,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Upsert a service lineage record.
 *
 * Re-provisioning the same service updates the existing row (deployed_sha,
 * manifest_hash, handoff_id, provision_request_id, worker_url, updated_at)
 * so the table always reflects the most-recent deployment. The original
 * created_at is preserved.
 */
export async function upsertService(
  hyperdrive: HyperdriveBinding,
  input: Omit<ServiceRecord, 'id' | 'createdAt' | 'updatedAt' | 'lastDriftCheckAt' | 'driftDetected' | 'driftFirstSeenAt' | 'liveManifestHash'> & {
    id?: string;
    workerUrl?: string | null;
  },
): Promise<ServiceRecord> {
  const id = input.id ?? crypto.randomUUID();
  const now = new Date().toISOString();

  await ensureSchema(hyperdrive);
  const db = getDb(hyperdrive);

  const result = await db.execute(sql`
    INSERT INTO capability_services (
      id, service_id, handoff_id, provision_request_id,
      deployed_sha, manifest_hash, worker_url, created_at, updated_at
    ) VALUES (
      ${id}, ${input.serviceId}, ${input.handoffId},
      ${input.provisionRequestId ?? null},
      ${input.deployedSha}, ${input.manifestHash},
      ${input.workerUrl ?? null},
      ${now}, ${now}
    )
    ON CONFLICT (service_id) DO UPDATE SET
      handoff_id           = EXCLUDED.handoff_id,
      provision_request_id = EXCLUDED.provision_request_id,
      deployed_sha         = EXCLUDED.deployed_sha,
      manifest_hash        = EXCLUDED.manifest_hash,
      worker_url           = EXCLUDED.worker_url,
      updated_at           = EXCLUDED.updated_at
    RETURNING id, service_id, handoff_id, provision_request_id,
              deployed_sha, manifest_hash, last_drift_check_at,
              worker_url, drift_detected, drift_first_seen_at, live_manifest_hash,
              created_at, updated_at
  `);

  const row = (result.rows as unknown as ServiceRow[])[0];
  if (!row) {
    throw new Error(`[handoff-store] upsertService returned no row for service_id=${input.serviceId}`);
  }
  return serviceRowToRecord(row);
}

/**
 * Look up a service by its stable service_id string.
 */
export async function findServiceByServiceId(
  hyperdrive: HyperdriveBinding,
  serviceId: string,
): Promise<ServiceRecord | null> {
  try {
    await ensureSchema(hyperdrive);
    const db = getDb(hyperdrive);
    const result = await db.execute(sql`
      SELECT id, service_id, handoff_id, provision_request_id,
             deployed_sha, manifest_hash, last_drift_check_at,
             worker_url, drift_detected, drift_first_seen_at, live_manifest_hash,
             created_at, updated_at
      FROM capability_services
      WHERE service_id = ${serviceId}
      LIMIT 1
    `);
    const row = (result.rows as unknown as ServiceRow[])[0];
    return row ? serviceRowToRecord(row) : null;
  } catch (err) {
    console.error('[handoff-store] findServiceByServiceId failed:', (err as Error).message);
    return null;
  }
}

/**
 * List service lineage records, optionally filtered by handoff or concept.
 *
 * When `conceptId` is provided the query JOINs `capability_handoffs` so the
 * WHERE condition can reference the concept_id column without requiring the
 * caller to resolve it first.
 *
 * Ordered by updated_at DESC so re-provisioned services sort to the top.
 */
export async function listServices(
  hyperdrive: HyperdriveBinding,
  filter: { handoffId?: string; conceptId?: string; limit?: number } = {},
): Promise<ServiceRecord[]> {
  try {
    await ensureSchema(hyperdrive);
    const db = getDb(hyperdrive);
    const limit = clamp(filter.limit ?? 50, 1, 200);

    if (filter.conceptId) {
      // JOIN path: filter by concept_id via the handoffs table.
      const result = await db.execute(sql`
        SELECT cs.id, cs.service_id, cs.handoff_id, cs.provision_request_id,
               cs.deployed_sha, cs.manifest_hash, cs.last_drift_check_at,
               cs.worker_url, cs.drift_detected, cs.drift_first_seen_at, cs.live_manifest_hash,
               cs.created_at, cs.updated_at
        FROM capability_services cs
        JOIN capability_handoffs ch ON ch.id = cs.handoff_id
        WHERE ch.concept_id = ${filter.conceptId}
        ORDER BY cs.updated_at DESC
        LIMIT ${limit}
      `);
      return (result.rows as unknown as ServiceRow[]).map(serviceRowToRecord);
    }

    // Plain path: optional handoffId filter, no JOIN needed.
    const conditions: ReturnType<typeof sql>[] = [];
    if (filter.handoffId) conditions.push(sql`handoff_id = ${filter.handoffId}`);
    const whereChunks: ReturnType<typeof sql>[] = [];
    for (let i = 0; i < conditions.length; i += 1) {
      whereChunks.push(i === 0 ? sql`WHERE` : sql`AND`);
      whereChunks.push(conditions[i]!);
    }
    const whereClause = sql.join(whereChunks, sql` `);

    const result = await db.execute(sql`
      SELECT id, service_id, handoff_id, provision_request_id,
             deployed_sha, manifest_hash, last_drift_check_at,
             worker_url, drift_detected, drift_first_seen_at, live_manifest_hash,
             created_at, updated_at
      FROM capability_services
      ${whereClause}
      ORDER BY updated_at DESC
      LIMIT ${limit}
    `);
    return (result.rows as unknown as ServiceRow[]).map(serviceRowToRecord);
  } catch (err) {
    console.error('[handoff-store] listServices failed:', (err as Error).message);
    return [];
  }
}

/**
 * Record the result of a drift check for this service.
 *
 * Updates:
 *   - last_drift_check_at → now()
 *   - drift_detected      → driftResult.driftDetected
 *   - live_manifest_hash  → driftResult.liveManifestHash (null if fetch failed)
 *   - drift_first_seen_at → set to now() ONLY on the false→true transition;
 *                           preserved on repeated drift; cleared back to null
 *                           when drift is resolved (driftDetected goes false).
 *
 * Does not touch the deployment fields (deployed_sha, manifest_hash).
 */
export async function touchServiceDriftCheck(
  hyperdrive: HyperdriveBinding,
  serviceId: string,
  driftResult: { driftDetected: boolean; liveManifestHash?: string | null },
): Promise<ServiceRecord | null> {
  try {
    await ensureSchema(hyperdrive);
    const db = getDb(hyperdrive);
    const now = new Date().toISOString();
    const result = await db.execute(sql`
      UPDATE capability_services
      SET last_drift_check_at = ${now},
          updated_at          = ${now},
          drift_detected      = ${driftResult.driftDetected},
          live_manifest_hash  = ${driftResult.liveManifestHash ?? null},
          drift_first_seen_at = CASE
            WHEN NOT drift_detected AND ${driftResult.driftDetected} THEN ${now}
            WHEN ${driftResult.driftDetected} THEN drift_first_seen_at
            ELSE NULL
          END
      WHERE service_id = ${serviceId}
      RETURNING id, service_id, handoff_id, provision_request_id,
                deployed_sha, manifest_hash, last_drift_check_at,
                worker_url, drift_detected, drift_first_seen_at, live_manifest_hash,
                created_at, updated_at
    `);
    const row = (result.rows as unknown as ServiceRow[])[0];
    return row ? serviceRowToRecord(row) : null;
  } catch (err) {
    console.error('[handoff-store] touchServiceDriftCheck failed:', (err as Error).message);
    return null;
  }
}
