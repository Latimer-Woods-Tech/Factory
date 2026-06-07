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
          UNIQUE (graph_id, revision_number),
          UNIQUE (graph_id, graph_version)
        )
      `);
      await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_capability_graphs_created ON capability_graphs (created_at DESC)`);
      await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_capability_graphs_author  ON capability_graphs (created_by, created_at DESC)`);
      await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_capability_graph_revisions_graph_created ON capability_graph_revisions (graph_id, created_at DESC)`);
      await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_capability_graph_revisions_graph_revision ON capability_graph_revisions (graph_id, revision_number DESC)`);
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
                current_revision_hash, nodes, edges, compiled_plan, compiled_at, created_by,
                created_at, updated_at
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
             current_revision_id, current_revision_number, current_revision_hash
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
             current_revision_id, current_revision_number, current_revision_hash
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
                  current_revision_hash, nodes, edges, compiled_plan, compiled_at, created_by,
                  created_at, updated_at
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
                current_revision_hash, nodes, edges, compiled_plan, compiled_at,
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
             content_hash, created_by, created_at
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
             content_hash, created_by, created_at
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

export type GraphUpdateResult =
  | { status: 'ok'; graph: GraphDocument }
  | { status: 'conflict'; currentGraph: GraphDocument }
  | { status: 'not_found' };

async function findGraphByIdUsingDb(
  db: FactoryDb,
  id: string,
): Promise<GraphDocument | null> {
  const result = await db.execute(sql`
    SELECT id, name, description, nodes, edges, compiled_plan, compiled_at,
           created_by, created_at, updated_at, version,
           current_revision_id, current_revision_number, current_revision_hash
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
              content_hash, created_by, created_at
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
              current_revision_hash, nodes, edges, compiled_plan, compiled_at,
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
