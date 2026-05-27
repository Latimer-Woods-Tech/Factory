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
  nodes: GraphNode[];
  edges: GraphEdge[];
  compiledPlan: Record<string, unknown> | null;
  compiledAt: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

// DB row shape
interface GraphRow {
  id: string;
  name: string;
  description: string | null;
  nodes: GraphNode[];
  edges: GraphEdge[];
  compiled_plan: Record<string, unknown> | null;
  compiled_at: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

function rowToDocument(row: GraphRow): GraphDocument {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    nodes: row.nodes,
    edges: row.edges,
    compiledPlan: row.compiled_plan,
    compiledAt: row.compiled_at,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
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
          nodes       JSONB NOT NULL DEFAULT '[]'::jsonb,
          edges       JSONB NOT NULL DEFAULT '[]'::jsonb,
          compiled_plan JSONB,
          compiled_at   TIMESTAMPTZ,
          created_by    TEXT NOT NULL,
          created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `);
      await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_capability_graphs_created ON capability_graphs (created_at DESC)`);
      await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_capability_graphs_author  ON capability_graphs (created_by, created_at DESC)`);
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
  input: { name: string; description?: string; createdBy: string },
): Promise<GraphDocument> {
  await ensureGraphSchema(hyperdrive);
  const db = getDb(hyperdrive);
  const now = new Date().toISOString();
  const result = await db.execute(sql`
    INSERT INTO capability_graphs (name, description, created_by, created_at, updated_at)
    VALUES (${input.name}, ${input.description ?? null}, ${input.createdBy}, ${now}, ${now})
    RETURNING id, name, description, nodes, edges, compiled_plan, compiled_at, created_by, created_at, updated_at
  `);
  const row = (result.rows as unknown as GraphRow[])[0];
  if (!row) throw new Error('[graph-store] createGraph returned no row');
  return rowToDocument(row);
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
             created_by, created_at, updated_at
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
             created_by, created_at, updated_at
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
  patch: { name?: string; description?: string; nodes?: GraphNode[]; edges?: GraphEdge[] },
): Promise<GraphDocument | null> {
  try {
    await ensureGraphSchema(hyperdrive);
    const db = getDb(hyperdrive);
    const now = new Date().toISOString();
    // Build the SET clause dynamically to avoid overwriting unchanged fields.
    const updates: Array<ReturnType<typeof sql>> = [
      sql`updated_at = ${now}`,
      sql`compiled_plan = NULL`,
      sql`compiled_at = NULL`,
    ];
    if (patch.name !== undefined)        updates.push(sql`name = ${patch.name}`);
    if (patch.description !== undefined) updates.push(sql`description = ${patch.description}`);
    if (patch.nodes !== undefined)       updates.push(sql`nodes = ${JSON.stringify(patch.nodes)}::jsonb`);
    if (patch.edges !== undefined)       updates.push(sql`edges = ${JSON.stringify(patch.edges)}::jsonb`);
    const setClause = sql.join(updates, sql`, `);
    const result = await db.execute(sql`
      UPDATE capability_graphs SET ${setClause} WHERE id = ${id}
      RETURNING id, name, description, nodes, edges, compiled_plan, compiled_at,
                created_by, created_at, updated_at
    `);
    const row = (result.rows as unknown as GraphRow[])[0];
    return row ? rowToDocument(row) : null;
  } catch (err) {
    console.error('[graph-store] updateGraphLayout failed:', (err as Error).message);
    return null;
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
      RETURNING id, name, description, nodes, edges, compiled_plan, compiled_at,
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
