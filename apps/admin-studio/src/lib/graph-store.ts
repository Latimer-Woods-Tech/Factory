/**
 * Capability graph persistence — Phase 5 Visual Composer.
 *
 * Stores graph documents (nodes + edges + canvas positions) and the compiled
 * plan generated from them. The compile step uses graph-compiler.ts, which
 * maps the graph to the same CapabilityPlan produced by the recipe-first flow.
 *
 * Schema: capability_graphs (see ensureGraphSchema).
 * Mirrors migration: apps/admin-studio/migrations/0009_capability_graphs.sql
 */

import { createDb, sql, type FactoryDb, type HyperdriveBinding } from '@latimer-woods-tech/neon';
import { canonicalJson, sha256Hex } from './handoff-hash.js';

export interface GraphNode {
  id: string;
  nodeType: 'primitive' | 'concept';
  ref: string;
  position: { x: number; y: number };
  params?: Record<string, string | number | boolean>;
  label?: string;
}

export interface GraphEdge {
  id: string;
  sourceNodeId: string;
  targetNodeId: string;
  label?: string;
}

export interface GraphDocument {
  id: string;
  name: string;
  description: string | null;
  version: number;
  currentRevisionId: string | null;
  currentRevisionNumber: number | null;
  currentRevisionHash: string | null;
  publishedRevisionId: string | null;
  publishedRevisionNumber: number | null;
  publishedRevisionHash: string | null;
  nodes: GraphNode[];
  edges: GraphEdge[];
  compiledPlan: Record<string, unknown> | null;
  compiledAt: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface GraphRevision {
  id: string;
  graphId: string;
  revisionNumber: number;
  graphVersion: number;
  name: string;
  description: string | null;
  nodes: GraphNode[];
  edges: GraphEdge[];
  contentHash: string;
  createdBy: string;
  createdAt: string;
  approvalId: string | null;
  approvedEnvironment: 'local' | 'staging' | 'production' | null;
  approvedAt: string | null;
  approvedBy: string | null;
  approvalSummary: string | null;
  publishedAt: string | null;
  publishedBy: string | null;
}

export interface GraphRevisionApproval {
  id: string;
  graphId: string;
  revisionId: string;
  targetEnvironment: 'local' | 'staging' | 'production';
  mutationClass: 'graph-revision-publish';
  summary: string;
  approvedBy: string;
  approvedAt: string;
  expiresAt: string | null;
}

export interface GraphSourceProvenance {
  graphId: string;
  revisionId: string;
  revisionNumber: number;
  graphVersion: number;
  contentHash: string;
}

// DB row shape
interface GraphRow {
  id: string;
  name: string;
  description: string | null;
  version: number;
  current_revision_id: string | null;
  current_revision_number: number | null;
  current_revision_hash: string | null;
  published_revision_id: string | null;
  published_revision_number: number | null;
  published_revision_hash: string | null;
  nodes: GraphNode[];
  edges: GraphEdge[];
  compiled_plan: Record<string, unknown> | null;
  compiled_at: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

interface GraphRevisionRow {
  id: string;
  graph_id: string;
  revision_number: number;
  graph_version: number;
  name: string;
  description: string | null;
  nodes: GraphNode[];
  edges: GraphEdge[];
  content_hash: string;
  created_by: string;
  created_at: string;
  approval_id: string | null;
  approved_environment: 'local' | 'staging' | 'production' | null;
  approved_at: string | null;
  approved_by: string | null;
  approval_summary: string | null;
  published_at: string | null;
  published_by: string | null;
}

interface GraphRevisionApprovalRow {
  id: string;
  graph_id: string;
  revision_id: string;
  target_environment: 'local' | 'staging' | 'production';
  mutation_class: 'graph-revision-publish';
  summary: string;
  approved_by: string;
  approved_at: string;
  expires_at: string | null;
}

function rowToDocument(row: GraphRow): GraphDocument {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    version: row.version,
    currentRevisionId: row.current_revision_id,
    currentRevisionNumber: row.current_revision_number,
    currentRevisionHash: row.current_revision_hash,
    publishedRevisionId: row.published_revision_id,
    publishedRevisionNumber: row.published_revision_number,
    publishedRevisionHash: row.published_revision_hash,
    nodes: row.nodes,
    edges: row.edges,
    compiledPlan: row.compiled_plan,
    compiledAt: row.compiled_at,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToRevision(row: GraphRevisionRow): GraphRevision {
  return {
    id: row.id,
    graphId: row.graph_id,
    revisionNumber: row.revision_number,
    graphVersion: row.graph_version,
    name: row.name,
    description: row.description,
    nodes: row.nodes,
    edges: row.edges,
    contentHash: row.content_hash,
    createdBy: row.created_by,
    createdAt: row.created_at,
    approvalId: row.approval_id,
    approvedEnvironment: row.approved_environment,
    approvedAt: row.approved_at,
    approvedBy: row.approved_by,
    approvalSummary: row.approval_summary,
    publishedAt: row.published_at,
    publishedBy: row.published_by,
  };
}

function rowToApproval(row: GraphRevisionApprovalRow): GraphRevisionApproval {
  return {
    id: row.id,
    graphId: row.graph_id,
    revisionId: row.revision_id,
    targetEnvironment: row.target_environment,
    mutationClass: row.mutation_class,
    summary: row.summary,
    approvedBy: row.approved_by,
    approvedAt: row.approved_at,
    expiresAt: row.expires_at,
  };
}

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

/**
 * Lazily ensure the capability_graphs table exists.
 *
 * Mirrors migration 0009_capability_graphs.sql. The Promise is cached per
 * Hyperdrive binding instance so it runs at most once per Worker isolate.
 * On failure the cache entry is removed so the next request retries.
 */
export async function ensureGraphSchema(hyperdrive: HyperdriveBinding): Promise<void> {
  let init = schemaInitCache.get(hyperdrive);
  if (!init) {
    const db = getDb(hyperdrive);
    init = (async () => {
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS capability_graphs (
          id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          name        TEXT NOT NULL,
          description TEXT,
          version     INTEGER NOT NULL DEFAULT 1,
          current_revision_id UUID,
          current_revision_number INTEGER,
          current_revision_hash TEXT,
          published_revision_id UUID,
          published_revision_number INTEGER,
          published_revision_hash TEXT,
          nodes       JSONB NOT NULL DEFAULT '[]'::jsonb,
          edges       JSONB NOT NULL DEFAULT '[]'::jsonb,
          compiled_plan JSONB,
          compiled_at   TIMESTAMPTZ,
          created_by    TEXT NOT NULL,
          created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `);
      await db.execute(sql`
        ALTER TABLE capability_graphs
        ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1
      `);
      await db.execute(sql`
        ALTER TABLE capability_graphs
        ADD COLUMN IF NOT EXISTS current_revision_id UUID
      `);
      await db.execute(sql`
        ALTER TABLE capability_graphs
        ADD COLUMN IF NOT EXISTS current_revision_number INTEGER
      `);
      await db.execute(sql`
        ALTER TABLE capability_graphs
        ADD COLUMN IF NOT EXISTS current_revision_hash TEXT
      `);
      await db.execute(sql`
        ALTER TABLE capability_graphs
        ADD COLUMN IF NOT EXISTS published_revision_id UUID
      `);
      await db.execute(sql`
        ALTER TABLE capability_graphs
        ADD COLUMN IF NOT EXISTS published_revision_number INTEGER
      `);
      await db.execute(sql`
        ALTER TABLE capability_graphs
        ADD COLUMN IF NOT EXISTS published_revision_hash TEXT
      `);
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS capability_graph_revisions (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          graph_id UUID NOT NULL REFERENCES capability_graphs(id) ON DELETE CASCADE,
          revision_number INTEGER NOT NULL,
          graph_version INTEGER NOT NULL,
          name TEXT NOT NULL,
          description TEXT,
          nodes JSONB NOT NULL DEFAULT '[]'::jsonb,
          edges JSONB NOT NULL DEFAULT '[]'::jsonb,
          content_hash TEXT NOT NULL,
          created_by TEXT NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          approval_id UUID,
          approved_environment TEXT,
          approved_at TIMESTAMPTZ,
          approved_by TEXT,
          approval_summary TEXT,
          published_at TIMESTAMPTZ,
          published_by TEXT,
          UNIQUE (graph_id, revision_number),
          UNIQUE (graph_id, graph_version)
        )
      `);
      await db.execute(sql`
        ALTER TABLE capability_graph_revisions
        ADD COLUMN IF NOT EXISTS approval_id UUID
      `);
      await db.execute(sql`
        ALTER TABLE capability_graph_revisions
        ADD COLUMN IF NOT EXISTS approved_environment TEXT
      `);
      await db.execute(sql`
        ALTER TABLE capability_graph_revisions
        ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ
      `);
      await db.execute(sql`
        ALTER TABLE capability_graph_revisions
        ADD COLUMN IF NOT EXISTS approved_by TEXT
      `);
      await db.execute(sql`
        ALTER TABLE capability_graph_revisions
        ADD COLUMN IF NOT EXISTS approval_summary TEXT
      `);
      await db.execute(sql`
        ALTER TABLE capability_graph_revisions
        ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ
      `);
      await db.execute(sql`
        ALTER TABLE capability_graph_revisions
        ADD COLUMN IF NOT EXISTS published_by TEXT
      `);
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS capability_graph_revision_approvals (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          graph_id UUID NOT NULL REFERENCES capability_graphs(id) ON DELETE CASCADE,
          revision_id UUID NOT NULL REFERENCES capability_graph_revisions(id) ON DELETE CASCADE,
          target_environment TEXT NOT NULL CHECK (target_environment IN ('local', 'staging', 'production')),
          mutation_class TEXT NOT NULL CHECK (mutation_class IN ('graph-revision-publish')),
          summary TEXT NOT NULL,
          approved_by TEXT NOT NULL,
          approved_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          expires_at TIMESTAMPTZ,
          UNIQUE (revision_id, target_environment, mutation_class)
        )
      `);
      await db.execute(sql`
        UPDATE capability_graph_revisions
        SET approved_environment = 'staging'
        WHERE approved_environment IS NULL
          AND approved_at IS NOT NULL
          AND approved_by IS NOT NULL
      `);
      await db.execute(sql`
        INSERT INTO capability_graph_revision_approvals (
          graph_id, revision_id, target_environment, mutation_class,
          summary, approved_by, approved_at
        )
        SELECT graph_id, id, approved_environment, ${'graph-revision-publish'},
               COALESCE(approval_summary, 'Legacy graph revision approval'),
               approved_by, approved_at
        FROM capability_graph_revisions
        WHERE approval_id IS NULL
          AND approved_environment IS NOT NULL
          AND approved_at IS NOT NULL
          AND approved_by IS NOT NULL
        ON CONFLICT (revision_id, target_environment, mutation_class) DO NOTHING
      `);
      await db.execute(sql`
        UPDATE capability_graph_revisions revision
        SET approval_id = approval.id
        FROM capability_graph_revision_approvals approval
        WHERE revision.approval_id IS NULL
          AND approval.revision_id = revision.id
          AND approval.target_environment = revision.approved_environment
          AND approval.mutation_class = ${'graph-revision-publish'}
      `);
      await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_capability_graphs_created ON capability_graphs (created_at DESC)`);
      await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_capability_graphs_author  ON capability_graphs (created_by, created_at DESC)`);
      await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_capability_graph_revisions_graph_created ON capability_graph_revisions (graph_id, created_at DESC)`);
      await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_capability_graph_revisions_graph_revision ON capability_graph_revisions (graph_id, revision_number DESC)`);
      await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_capability_graph_revision_approvals_revision ON capability_graph_revision_approvals (revision_id, approved_at DESC)`);
    })();
    schemaInitCache.set(hyperdrive, init);
    init.catch(() => { schemaInitCache.delete(hyperdrive); });
  }
  await init;
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

/**
 * Create a new empty graph document.
 */
export async function createGraph(
  hyperdrive: HyperdriveBinding,
  input: { name: string; description?: string | null; createdBy: string },
): Promise<GraphDocument> {
  await ensureGraphSchema(hyperdrive);
  const db = getDb(hyperdrive);
  return runGraphTransaction(db, async (txDb) => {
    const now = new Date().toISOString();
    const result = await txDb.execute(sql`
      INSERT INTO capability_graphs (name, description, created_by, created_at, updated_at)
      VALUES (${input.name}, ${input.description ?? null}, ${input.createdBy}, ${now}, ${now})
      RETURNING id, name, description, version, current_revision_id, current_revision_number,
                current_revision_hash, published_revision_id, published_revision_number,
                published_revision_hash, nodes, edges, compiled_plan, compiled_at,
                created_by, created_at, updated_at
    `);
    const row = (result.rows as unknown as GraphRow[])[0];
    if (!row) throw new Error('[graph-store] createGraph returned no row');
    const graph = rowToDocument(row);
    return persistGraphRevision(txDb, graph, input.createdBy, 1);
  });
}

/**
 * Fetch a single graph by its UUID.
 * Returns null if not found or on DB error.
 */
export async function findGraphById(
  hyperdrive: HyperdriveBinding,
  id: string,
): Promise<GraphDocument | null> {
  try {
    await ensureGraphSchema(hyperdrive);
    const db = getDb(hyperdrive);
    const result = await db.execute(sql`
      SELECT id, name, description, nodes, edges, compiled_plan, compiled_at,
             created_by, created_at, updated_at, version,
             current_revision_id, current_revision_number, current_revision_hash,
             published_revision_id, published_revision_number, published_revision_hash
      FROM capability_graphs WHERE id = ${id} LIMIT 1
    `);
    const row = (result.rows as unknown as GraphRow[])[0];
    return row ? rowToDocument(row) : null;
  } catch (err) {
    console.error('[graph-store] findGraphById failed:', (err as Error).message);
    return null;
  }
}

/**
 * List graph documents, ordered by updated_at DESC.
 */
export async function listGraphs(
  hyperdrive: HyperdriveBinding,
  filter: { createdBy?: string; limit?: number } = {},
): Promise<GraphDocument[]> {
  try {
    await ensureGraphSchema(hyperdrive);
    const db = getDb(hyperdrive);
    const limit = clamp(filter.limit ?? 50, 1, 200);
    const conditions: ReturnType<typeof sql>[] = [];
    if (filter.createdBy) conditions.push(sql`created_by = ${filter.createdBy}`);
    const whereChunks: ReturnType<typeof sql>[] = [];
    for (let i = 0; i < conditions.length; i += 1) {
      whereChunks.push(i === 0 ? sql`WHERE` : sql`AND`);
      whereChunks.push(conditions[i]!);
    }
    const whereClause = sql.join(whereChunks, sql` `);
    const result = await db.execute(sql`
      SELECT id, name, description, nodes, edges, compiled_plan, compiled_at,
             created_by, created_at, updated_at, version,
             current_revision_id, current_revision_number, current_revision_hash,
             published_revision_id, published_revision_number, published_revision_hash
      FROM capability_graphs ${whereClause}
      ORDER BY updated_at DESC LIMIT ${limit}
    `);
    return (result.rows as unknown as GraphRow[]).map(rowToDocument);
  } catch (err) {
    console.error('[graph-store] listGraphs failed:', (err as Error).message);
    return [];
  }
}

/**
 * Patch the graph's name, description, nodes, and/or edges.
 *
 * Any update clears compiled_plan + compiled_at — the caller must recompile
 * after every layout change. Only the fields present in `patch` are updated;
 * absent keys are left unchanged.
 */
export async function updateGraphLayout(
  hyperdrive: HyperdriveBinding,
  id: string,
  patch: {
    name?: string;
    description?: string | null;
    nodes?: GraphNode[];
    edges?: GraphEdge[];
    expectedVersion?: number;
    updatedBy: string;
  },
): Promise<GraphUpdateResult> {
  try {
    await ensureGraphSchema(hyperdrive);
    const db = getDb(hyperdrive);
    return await runGraphTransaction(db, async (txDb) => {
      const current = await findGraphByIdUsingDb(txDb, id);
      if (!current) {
        return { status: 'not_found' } as const;
      }
      if (patch.expectedVersion !== undefined && current.version !== patch.expectedVersion) {
        return { status: 'conflict', currentGraph: current } as const;
      }

      const now = new Date().toISOString();
      const updates: Array<ReturnType<typeof sql>> = [
        sql`updated_at = ${now}`,
        sql`compiled_plan = NULL`,
        sql`compiled_at = NULL`,
        sql`version = version + 1`,
      ];
      if (patch.name !== undefined)        updates.push(sql`name = ${patch.name}`);
      if (patch.description !== undefined) updates.push(sql`description = ${patch.description}`);
      if (patch.nodes !== undefined)       updates.push(sql`nodes = ${JSON.stringify(patch.nodes)}::jsonb`);
      if (patch.edges !== undefined)       updates.push(sql`edges = ${JSON.stringify(patch.edges)}::jsonb`);
      const setClause = sql.join(updates, sql`, `);
      const result = await txDb.execute(sql`
        UPDATE capability_graphs SET ${setClause} WHERE id = ${id}
        RETURNING id, name, description, version, current_revision_id, current_revision_number,
                  current_revision_hash, published_revision_id, published_revision_number,
                  published_revision_hash, nodes, edges, compiled_plan, compiled_at,
                  created_by, created_at, updated_at
      `);
      const row = (result.rows as unknown as GraphRow[])[0];
      if (!row) {
        return { status: 'not_found' } as const;
      }

      const updatedGraph = rowToDocument(row);
      const nextRevisionNumber = (current.currentRevisionNumber ?? 0) + 1;
      const graph = await persistGraphRevision(txDb, updatedGraph, patch.updatedBy, nextRevisionNumber);
      return { status: 'ok', graph } as const;
    });
  } catch (err) {
    console.error('[graph-store] updateGraphLayout failed:', (err as Error).message);
    return { status: 'not_found' };
  }
}

/**
 * Persist the compiled CapabilityPlan back into the graph record.
 * Called after a successful compile run.
 */
export async function saveCompiledPlan(
  hyperdrive: HyperdriveBinding,
  id: string,
  plan: Record<string, unknown>,
): Promise<GraphDocument | null> {
  try {
    await ensureGraphSchema(hyperdrive);
    const db = getDb(hyperdrive);
    const now = new Date().toISOString();
    const result = await db.execute(sql`
      UPDATE capability_graphs
      SET compiled_plan = ${JSON.stringify(plan)}::jsonb,
          compiled_at   = ${now},
          updated_at    = ${now}
      WHERE id = ${id}
      RETURNING id, name, description, version, current_revision_id, current_revision_number,
                current_revision_hash, published_revision_id, published_revision_number,
                published_revision_hash, nodes, edges, compiled_plan, compiled_at,
                created_by, created_at, updated_at
    `);
    const row = (result.rows as unknown as GraphRow[])[0];
    return row ? rowToDocument(row) : null;
  } catch (err) {
    console.error('[graph-store] saveCompiledPlan failed:', (err as Error).message);
    return null;
  }
}

/**
 * Delete a graph document by id.
 * Returns true if the row existed and was deleted; false otherwise.
 */
export async function deleteGraph(
  hyperdrive: HyperdriveBinding,
  id: string,
): Promise<boolean> {
  try {
    await ensureGraphSchema(hyperdrive);
    const db = getDb(hyperdrive);
    const result = await db.execute(sql`DELETE FROM capability_graphs WHERE id = ${id} RETURNING id`);
    return (result.rows as unknown[]).length > 0;
  } catch (err) {
    console.error('[graph-store] deleteGraph failed:', (err as Error).message);
    return false;
  }
}

export async function listGraphRevisions(
  hyperdrive: HyperdriveBinding,
  graphId: string,
  filter: { limit?: number } = {},
): Promise<GraphRevision[]> {
  try {
    await ensureGraphSchema(hyperdrive);
    const db = getDb(hyperdrive);
    const limit = clamp(filter.limit ?? 20, 1, 100);
    const result = await db.execute(sql`
      SELECT id, graph_id, revision_number, graph_version, name, description, nodes, edges,
             content_hash, created_by, created_at, approval_id, approved_environment,
             approved_at, approved_by, approval_summary,
             published_at, published_by
      FROM capability_graph_revisions
      WHERE graph_id = ${graphId}
      ORDER BY revision_number DESC
      LIMIT ${limit}
    `);
    return (result.rows as unknown as GraphRevisionRow[]).map(rowToRevision);
  } catch (err) {
    console.error('[graph-store] listGraphRevisions failed:', (err as Error).message);
    return [];
  }
}

export async function findGraphRevisionById(
  hyperdrive: HyperdriveBinding,
  revisionId: string,
): Promise<GraphRevision | null> {
  try {
    await ensureGraphSchema(hyperdrive);
    const db = getDb(hyperdrive);
    const result = await db.execute(sql`
      SELECT id, graph_id, revision_number, graph_version, name, description, nodes, edges,
             content_hash, created_by, created_at, approval_id, approved_environment,
             approved_at, approved_by, approval_summary,
             published_at, published_by
      FROM capability_graph_revisions
      WHERE id = ${revisionId}
      LIMIT 1
    `);
    const row = (result.rows as unknown as GraphRevisionRow[])[0];
    return row ? rowToRevision(row) : null;
  } catch (err) {
    console.error('[graph-store] findGraphRevisionById failed:', (err as Error).message);
    return null;
  }
}

export async function listGraphRevisionApprovals(
  hyperdrive: HyperdriveBinding,
  graphId: string,
  revisionId: string,
): Promise<GraphRevisionApproval[]> {
  try {
    await ensureGraphSchema(hyperdrive);
    const db = getDb(hyperdrive);
    const result = await db.execute(sql`
      SELECT id, graph_id, revision_id, target_environment, mutation_class,
             summary, approved_by, approved_at, expires_at
      FROM capability_graph_revision_approvals
      WHERE graph_id = ${graphId} AND revision_id = ${revisionId}
      ORDER BY approved_at DESC
    `);
    return (result.rows as unknown as GraphRevisionApprovalRow[]).map(rowToApproval);
  } catch (err) {
    console.error('[graph-store] listGraphRevisionApprovals failed:', (err as Error).message);
    return [];
  }
}

export async function publishGraphRevision(
  hyperdrive: HyperdriveBinding,
  graphId: string,
  input: { revisionId?: string; publishedBy: string; env: 'local' | 'staging' | 'production' },
): Promise<GraphPublishResult> {
  try {
    await ensureGraphSchema(hyperdrive);
    const db = getDb(hyperdrive);
    return await runGraphTransaction(db, async (txDb) => {
      const graph = await findGraphByIdUsingDb(txDb, graphId);
      if (!graph) return { status: 'not_found' } as const;

      const targetRevisionId = input.revisionId ?? graph.currentRevisionId;
      if (!targetRevisionId) return { status: 'no_revision' } as const;

      const revision = await findGraphRevisionByIdUsingDb(txDb, targetRevisionId);
      if (!revision || revision.graphId !== graphId) {
        return { status: 'revision_not_found' } as const;
      }
      const approval = await findGraphRevisionApprovalUsingDb(txDb, revision.id, input.env);
      if (!approval && !revision.approvedAt && !revision.approvedBy) {
        return { status: 'revision_not_approved' } as const;
      }
      if (!approval) {
        return { status: 'approval_environment_mismatch' } as const;
      }
      if (input.env === 'production' && approval.approvedBy === input.publishedBy) {
        return { status: 'publisher_must_differ_from_approver' } as const;
      }

      const publishedAt = new Date().toISOString();
      const revisionUpdate = await txDb.execute(sql`
        UPDATE capability_graph_revisions
        SET published_at = ${publishedAt},
            published_by = ${input.publishedBy}
        WHERE id = ${revision.id}
        RETURNING id, graph_id, revision_number, graph_version, name, description, nodes, edges,
                  content_hash, created_by, created_at, approval_id, approved_environment,
                  approved_at, approved_by, approval_summary,
                  published_at, published_by
      `);
      const publishedRevisionRow = (revisionUpdate.rows as unknown as GraphRevisionRow[])[0];
      if (!publishedRevisionRow) return { status: 'revision_not_found' } as const;

      const graphUpdate = await txDb.execute(sql`
        UPDATE capability_graphs
        SET published_revision_id = ${publishedRevisionRow.id},
            published_revision_number = ${publishedRevisionRow.revision_number},
            published_revision_hash = ${publishedRevisionRow.content_hash}
        WHERE id = ${graphId}
        RETURNING id, name, description, version, current_revision_id, current_revision_number,
                  current_revision_hash, published_revision_id, published_revision_number,
                  published_revision_hash, nodes, edges, compiled_plan, compiled_at,
                  created_by, created_at, updated_at
      `);
      const graphRow = (graphUpdate.rows as unknown as GraphRow[])[0];
      if (!graphRow) return { status: 'not_found' } as const;

      return {
        status: 'ok',
        graph: rowToDocument(graphRow),
        revision: rowToRevision(publishedRevisionRow),
      } as const;
    });
  } catch (err) {
    console.error('[graph-store] publishGraphRevision failed:', (err as Error).message);
    return { status: 'not_found' };
  }
}

export async function approveGraphRevision(
  hyperdrive: HyperdriveBinding,
  graphId: string,
  revisionId: string,
  input: { approvedBy: string; approvalSummary: string; env: 'local' | 'staging' | 'production' },
): Promise<GraphApproveResult> {
  try {
    await ensureGraphSchema(hyperdrive);
    const db = getDb(hyperdrive);
    return await runGraphTransaction(db, async (txDb) => {
      const graph = await findGraphByIdUsingDb(txDb, graphId);
      if (!graph) return { status: 'not_found' } as const;

      const revision = await findGraphRevisionByIdUsingDb(txDb, revisionId);
      if (!revision || revision.graphId !== graphId) {
        return { status: 'revision_not_found' } as const;
      }
      const existingApproval = await findGraphRevisionApprovalUsingDb(txDb, revision.id, input.env);
      if (existingApproval) {
        return { status: 'revision_already_approved' } as const;
      }
      if (input.env === 'production' && revision.createdBy === input.approvedBy) {
        return { status: 'self_approval_forbidden' } as const;
      }

      const approvedAt = new Date().toISOString();
      const approvalSummary = input.approvalSummary.trim();
      const approvalInsert = await txDb.execute(sql`
        INSERT INTO capability_graph_revision_approvals (
          graph_id, revision_id, target_environment, mutation_class,
          summary, approved_by, approved_at
        )
        VALUES (
          ${graphId}, ${revision.id}, ${input.env}, ${'graph-revision-publish'},
          ${approvalSummary}, ${input.approvedBy}, ${approvedAt}
        )
        RETURNING id, graph_id, revision_id, target_environment, mutation_class,
                  summary, approved_by, approved_at, expires_at
      `);
      const approvalRow = (approvalInsert.rows as unknown as GraphRevisionApprovalRow[])[0];
      if (!approvalRow) return { status: 'revision_not_found' } as const;

      const revisionUpdate = await txDb.execute(sql`
        UPDATE capability_graph_revisions
        SET approval_id = ${approvalRow.id},
            approved_environment = ${approvalRow.target_environment},
            approved_at = ${approvedAt},
            approved_by = ${input.approvedBy},
            approval_summary = ${approvalSummary}
        WHERE id = ${revision.id}
        RETURNING id, graph_id, revision_number, graph_version, name, description, nodes, edges,
                  content_hash, created_by, created_at, approval_id, approved_environment,
                  approved_at, approved_by, approval_summary,
                  published_at, published_by
      `);
      const approvedRevisionRow = (revisionUpdate.rows as unknown as GraphRevisionRow[])[0];
      if (!approvedRevisionRow) return { status: 'revision_not_found' } as const;

      return {
        status: 'ok',
        graph,
        revision: rowToRevision(approvedRevisionRow),
        approval: rowToApproval(approvalRow),
      } as const;
    });
  } catch (err) {
    console.error('[graph-store] approveGraphRevision failed:', (err as Error).message);
    return { status: 'not_found' };
  }
}

export type GraphUpdateResult =
  | { status: 'ok'; graph: GraphDocument }
  | { status: 'conflict'; currentGraph: GraphDocument }
  | { status: 'not_found' };

export type GraphApproveResult =
  | { status: 'ok'; graph: GraphDocument; revision: GraphRevision; approval: GraphRevisionApproval }
  | { status: 'not_found' }
  | { status: 'revision_not_found' }
  | { status: 'revision_already_approved' }
  | { status: 'self_approval_forbidden' };

export type GraphPublishResult =
  | { status: 'ok'; graph: GraphDocument; revision: GraphRevision }
  | { status: 'not_found' }
  | { status: 'no_revision' }
  | { status: 'revision_not_found' }
  | { status: 'revision_not_approved' }
  | { status: 'approval_environment_mismatch' }
  | { status: 'publisher_must_differ_from_approver' };

async function findGraphByIdUsingDb(
  db: FactoryDb,
  id: string,
): Promise<GraphDocument | null> {
  const result = await db.execute(sql`
    SELECT id, name, description, nodes, edges, compiled_plan, compiled_at,
           created_by, created_at, updated_at, version,
           current_revision_id, current_revision_number, current_revision_hash,
           published_revision_id, published_revision_number, published_revision_hash
    FROM capability_graphs WHERE id = ${id} LIMIT 1
  `);
  const row = (result.rows as unknown as GraphRow[])[0];
  return row ? rowToDocument(row) : null;
}

async function persistGraphRevision(
  db: FactoryDb,
  graph: GraphDocument,
  createdBy: string,
  revisionNumber: number,
): Promise<GraphDocument> {
  const contentHash = await sha256Hex(canonicalJson({
    name: graph.name,
    description: graph.description,
    nodes: graph.nodes,
    edges: graph.edges,
  }));
  const revisionInsert = await db.execute(sql`
    INSERT INTO capability_graph_revisions (
      graph_id, revision_number, graph_version, name, description, nodes, edges,
      content_hash, created_by
    )
    VALUES (
      ${graph.id}, ${revisionNumber}, ${graph.version}, ${graph.name}, ${graph.description},
      ${JSON.stringify(graph.nodes)}::jsonb, ${JSON.stringify(graph.edges)}::jsonb,
      ${contentHash}, ${createdBy}
    )
    RETURNING id, graph_id, revision_number, graph_version, name, description, nodes, edges,
              content_hash, created_by, created_at, approval_id, approved_environment,
              approved_at, approved_by, approval_summary,
              published_at, published_by
  `);
  const revisionRow = (revisionInsert.rows as unknown as GraphRevisionRow[])[0];
  if (!revisionRow) {
    throw new Error('[graph-store] persistGraphRevision returned no row');
  }

  const graphUpdate = await db.execute(sql`
    UPDATE capability_graphs
    SET current_revision_id = ${revisionRow.id},
        current_revision_number = ${revisionRow.revision_number},
        current_revision_hash = ${revisionRow.content_hash}
    WHERE id = ${graph.id}
    RETURNING id, name, description, version, current_revision_id, current_revision_number,
              current_revision_hash, published_revision_id, published_revision_number,
              published_revision_hash, nodes, edges, compiled_plan, compiled_at,
              created_by, created_at, updated_at
  `);
  const graphRow = (graphUpdate.rows as unknown as GraphRow[])[0];
  if (!graphRow) {
    throw new Error('[graph-store] persistGraphRevision failed to update graph head');
  }
  return rowToDocument(graphRow);
}

async function runGraphTransaction<T>(
  db: FactoryDb,
  fn: (txDb: FactoryDb) => Promise<T>,
): Promise<T> {
  return (db as unknown as {
    transaction<R>(callback: (tx: unknown) => Promise<R>): Promise<R>;
  }).transaction(async (tx) => fn(tx as FactoryDb));
}

async function findGraphRevisionByIdUsingDb(
  db: FactoryDb,
  revisionId: string,
): Promise<GraphRevision | null> {
  const result = await db.execute(sql`
    SELECT id, graph_id, revision_number, graph_version, name, description, nodes, edges,
           content_hash, created_by, created_at, approval_id, approved_environment,
           approved_at, approved_by, approval_summary,
           published_at, published_by
    FROM capability_graph_revisions
    WHERE id = ${revisionId}
    LIMIT 1
  `);
  const row = (result.rows as unknown as GraphRevisionRow[])[0];
  return row ? rowToRevision(row) : null;
}

async function findGraphRevisionApprovalUsingDb(
  db: FactoryDb,
  revisionId: string,
  targetEnvironment: 'local' | 'staging' | 'production',
): Promise<GraphRevisionApproval | null> {
  const result = await db.execute(sql`
    SELECT id, graph_id, revision_id, target_environment, mutation_class,
           summary, approved_by, approved_at, expires_at
    FROM capability_graph_revision_approvals
    WHERE revision_id = ${revisionId}
      AND target_environment = ${targetEnvironment}
      AND mutation_class = ${'graph-revision-publish'}
    LIMIT 1
  `);
  const row = (result.rows as unknown as GraphRevisionApprovalRow[])[0];
  return row ? rowToApproval(row) : null;
}
