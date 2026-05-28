/**
 * Capability Design Studio — backend route surface.
 *
 * Implements Stages A + B + C of the council-approved Golden Design
 * (docs/CAPABILITY_DESIGN_STUDIO_GOLDEN_DESIGN.md):
 *
 *   GET  /capabilities                         — list governed concepts
 *   POST /capabilities/resolve                 — concept + params → recipe (reversible)
 *   POST /capabilities/preview                 — resolve + compiled plan + markdown
 *   POST /capabilities/handoff                 — durable, content-addressable handoff
 *   GET  /capabilities/handoffs                — list handoffs (lineage)
 *   GET  /capabilities/handoffs/:id            — single handoff lookup
 *   POST /capabilities/provision-staging       — audited staging-provision request
 *   GET  /capabilities/provision-requests      — list provision requests (lineage)
 *   GET  /capabilities/provision-requests/:id  — single provision request (evidence polling)
 *   POST /capabilities/provision-requests/:id/transition — lifecycle transition
 *
 * Stage 3 — service lineage:
 *   POST /capabilities/services                — register/update a deployed service
 *   GET  /capabilities/services                — list all services (with optional handoffId filter)
 *   GET  /capabilities/services/:serviceId     — single service lookup by serviceId
 *   POST /capabilities/services/:serviceId/drift-check — record that a drift check ran
 *
 * Every mutating route emits an audit entry via the audit middleware. The
 * handoff, provision-staging, and service endpoints persist their artifacts in
 * Postgres via `handoff-store.ts`.
 */
import { Hono } from 'hono';
import type { AppEnv } from '../types.js';
import {
  CapabilityResolutionError,
  type CapabilityResolution,
  listCapabilityCatalog,
  resolveCapabilityConcept,
} from '../lib/capability-registry.js';
import type { CapabilityPlan } from '../lib/capability-plan.js';
import { compileCapabilityPlan, renderCapabilityPlanPreview } from '../lib/capability-plan.js';
import { hashHandoffBody } from '../lib/handoff-hash.js';
import {
  findHandoffById,
  findHandoffByHash,
  findProvisionRequestById,
  findServiceByServiceId,
  listHandoffs,
  listProvisionRequests,
  listServices,
  persistHandoff,
  recordProvisionRequest,
  touchServiceDriftCheck,
  transitionProvisionRequest,
  upsertService,
  validateProofGates,
  type HandoffRecord,
  type ProofGateState,
  type ProvisionRequestRecord,
} from '../lib/handoff-store.js';
import {
  createGraph,
  findGraphById,
  listGraphs,
  updateGraphLayout,
  saveCompiledPlan,
  deleteGraph,
  type GraphNode,
  type GraphEdge,
} from '../lib/graph-store.js';
import { compileGraph } from '../lib/graph-compiler.js';

const capabilities = new Hono<AppEnv>();

// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion -- literal const needs as const for the type narrowing used in handoff bodies
const HANDOFF_SCHEMA_VERSION = '1.0.0' as const;

capabilities.get('/', (c) => {
  return c.json(listCapabilityCatalog());
});

capabilities.post('/resolve', async (c) => {
  const body = await parseConceptBody(c);
  if (!body.conceptId) {
    return c.json({ error: 'conceptId is required' }, 400);
  }

  try {
    const resolution = resolveCapabilityConcept(body.conceptId, body.params ?? {});
    c.set('auditAction', 'capabilities.resolve');
    c.set('auditResource', body.conceptId);
    c.set('auditReversibility', 'reversible');
    c.set('auditResultDetail', {
      conceptId: body.conceptId,
      recipeId: resolution.recipe.id,
      nextStep: resolution.nextStep.action,
    });
    return c.json(resolution);
  } catch (error) {
    if (error instanceof CapabilityResolutionError) {
      return c.json({ error: error.message }, { status: error.status as 400 | 404 | 500 });
    }
    throw error;
  }
});

capabilities.post('/preview', async (c) => {
  const body = await parseConceptBody(c);
  if (!body.conceptId) {
    return c.json({ error: 'conceptId is required' }, 400);
  }

  try {
    const resolution = resolveCapabilityConcept(body.conceptId, body.params ?? {});
    return c.json(buildPreviewResponse(body.conceptId, resolution));
  } catch (error) {
    if (error instanceof CapabilityResolutionError) {
      return c.json({ error: error.message }, { status: error.status as 400 | 404 | 500 });
    }
    throw error;
  }
});

capabilities.post('/handoff', async (c) => {
  const body = await parseConceptBody(c);
  if (!body.conceptId) {
    return c.json({ error: 'conceptId is required' }, 400);
  }

  try {
    const resolution = resolveCapabilityConcept(body.conceptId, body.params ?? {});
    const previewResponse = buildPreviewResponse(body.conceptId, resolution);
    const handoffBody = buildHandoffBody(previewResponse);
    const hash = await hashHandoffBody(handoffBody);

    const ctx = c.var.envContext;
    const dbBinding = c.env.DB;
    let persisted: HandoffRecord | null = null;
    if (ctx && dbBinding) {
      persisted = await persistHandoff(dbBinding, {
        hash,
        schemaVersion: HANDOFF_SCHEMA_VERSION,
        conceptId: handoffBody.conceptId,
        recipeId: handoffBody.recipeId,
        parameters: handoffBody.parameters,
        plan: handoffBody.plan,
        preview: handoffBody.preview,
        nextAction: handoffBody.nextAction,
        createdBy: ctx.userId,
        env: ctx.env,
      });
    }

    const handoff = {
      ...handoffBody,
      id: persisted?.id ?? null,
      hash,
      createdAt: persisted?.createdAt ?? new Date().toISOString(),
    };

    c.set('auditAction', 'capabilities.handoff');
    c.set('auditResource', body.conceptId);
    c.set('auditResourceId', handoff.id ?? hash);
    c.set('auditReversibility', 'reversible');
    c.set('auditResultDetail', {
      conceptId: body.conceptId,
      recipeId: handoff.recipeId,
      handoffId: handoff.id,
      handoffHash: hash,
      stagingFirst: handoff.plan.scaffold.stagingFirst,
    });

    return c.json({
      generatedAt: previewResponse.generatedAt,
      handoff,
    });
  } catch (error) {
    if (error instanceof CapabilityResolutionError) {
      return c.json({ error: error.message }, { status: error.status as 400 | 404 | 500 });
    }
    throw error;
  }
});

/**
 * Stage C: audited staging-provision request.
 *
 * This endpoint does NOT mutate Cloudflare or Neon directly — provisioning is
 * still a human-in-the-loop step. What it does:
 *   1. resolves the referenced handoff
 *   2. validates that every required proof gate is checked
 *   3. inserts a `capability_provision_requests` row (status='requested')
 *   4. emits an audit entry with reversibility='manual-rollback'
 *
 * Downstream automation can poll for `status='requested'` rows and dispatch
 * the actual scaffold + deploy workflow.
 */
capabilities.post('/provision-staging', async (c) => {
  const ctx = c.var.envContext;
  if (!ctx) {
    return c.json({ error: 'auth required' }, 401);
  }

  type ProvisionBody = {
    handoffId?: string;
    handoffHash?: string;
    proofGates?: Partial<ProofGateState>;
    notes?: string;
  };
  const body: ProvisionBody = await c.req.json<ProvisionBody>().catch((): ProvisionBody => ({}));

  if (!body.handoffId) {
    return c.json({ error: 'handoffId is required' }, 400);
  }

  // Primary lookup by id; on miss, fall back to hash if provided. The hash
  // fallback closes the Hyperdrive read-after-write race where a just-inserted
  // row isn't yet visible to the pooled connection this call landed on.
  // Different SQL → different cache key → fresh DB hit. The client always
  // has the hash because POST /handoff returns it in the same response.
  let handoff = await findHandoffById(c.env.DB, body.handoffId);
  if (!handoff && body.handoffHash) {
    handoff = await findHandoffByHash(c.env.DB, body.handoffHash);
    if (handoff && handoff.id !== body.handoffId) {
      // Hash matched but id differs — client is referencing a stale id.
      // Treat as the canonical row found by hash.
      console.warn(
        `[capabilities] handoff id mismatch (client=${body.handoffId} canonical=${handoff.id}) — using hash-resolved row`,
      );
    }
  }
  if (!handoff) {
    return c.json({ error: `Unknown handoff: ${body.handoffId}` }, 404);
  }

  const gates = validateProofGates(body.proofGates);
  if (!gates.valid) {
    c.set('auditAction', 'capabilities.provision-staging');
    c.set('auditResource', handoff.conceptId);
    c.set('auditResourceId', handoff.id);
    c.set('auditReversibility', 'manual-rollback');
    c.set('auditResultDetail', {
      handoffId: handoff.id,
      missingGates: gates.missing,
    });
    return c.json(
      {
        error: 'Proof gates not satisfied',
        missing: gates.missing,
      },
      400,
    );
  }

  const request = await recordProvisionRequest(c.env.DB, {
    handoffId: handoff.id,
    proofGates: gates.normalized,
    requestedBy: ctx.userId,
    env: ctx.env,
    notes: body.notes ?? null,
  });

  c.set('auditAction', 'capabilities.provision-staging');
  c.set('auditResource', handoff.conceptId);
  c.set('auditResourceId', handoff.id);
  c.set('auditReversibility', 'manual-rollback');
  c.set('auditResultDetail', {
    handoffId: handoff.id,
    handoffHash: handoff.hash,
    provisionRequestId: request.id,
    proofGates: gates.normalized,
  });

  return c.json({
    request,
    handoff: {
      id: handoff.id,
      hash: handoff.hash,
      conceptId: handoff.conceptId,
      recipeId: handoff.recipeId,
    },
    nextStep: {
      action: 'await-staging-deployment',
      handoffId: handoff.id,
      requestId: request.id,
    },
  }, 201);
});

/**
 * Lineage: single handoff lookup by content-addressable hash.
 *
 * Used by the auto-dispatcher as a fallback when the id-based lookup
 * (`GET /capabilities/handoffs/:id`) misses due to the Hyperdrive
 * read-after-write race — a freshly-inserted handoff may not yet be
 * visible on the pooled connection the id-lookup lands on. The hash is
 * always available in the provision-request list (via JOIN) so the
 * auto-dispatcher can switch to this path without any extra API calls.
 *
 * GET /capabilities/handoffs/by-hash/:hash
 */
capabilities.get('/handoffs/by-hash/:hash', async (c) => {
  const ctx = c.var.envContext;
  if (!ctx) {
    return c.json({ error: 'auth required' }, 401);
  }
  const hash = c.req.param('hash');
  const handoff = await findHandoffByHash(c.env.DB, hash);
  if (!handoff) {
    return c.json({ error: `Unknown handoff hash: ${hash}` }, 404);
  }
  return c.json({ handoff });
});

/**
 * Lineage: single handoff lookup by id.
 * GET /capabilities/handoffs/:id
 */
capabilities.get('/handoffs/:id', async (c) => {
  const ctx = c.var.envContext;
  if (!ctx) {
    return c.json({ error: 'auth required' }, 401);
  }
  const id = c.req.param('id');
  const handoff = await findHandoffById(c.env.DB, id);
  if (!handoff) {
    return c.json({ error: `Unknown handoff: ${id}` }, 404);
  }
  return c.json({ handoff });
});

/**
 * Lineage: list recent handoff packages. Optional conceptId / recipeId filter.
 * GET /capabilities/handoffs?conceptId=…&recipeId=…&limit=50
 */
capabilities.get('/handoffs', async (c) => {
  const ctx = c.var.envContext;
  if (!ctx) {
    return c.json({ error: 'auth required' }, 401);
  }
  const conceptId = c.req.query('conceptId') ?? undefined;
  const recipeId = c.req.query('recipeId') ?? undefined;
  const limitRaw = c.req.query('limit');
  const limit = limitRaw ? Math.max(1, Math.min(200, Number.parseInt(limitRaw, 10) || 50)) : 50;
  const handoffs = await listHandoffs(c.env.DB, { conceptId, recipeId, limit });
  return c.json({ generatedAt: new Date().toISOString(), handoffs });
});

/**
 * Deployment evidence: single provision request lookup by id.
 * Polled by the Studio UI after a provision request is submitted so the
 * operator can see live status transitions (dispatched → succeeded/failed)
 * and scaffold notes without leaving the Studio.
 * GET /capabilities/provision-requests/:id
 */
capabilities.get('/provision-requests/:id', async (c) => {
  const ctx = c.var.envContext;
  if (!ctx) {
    return c.json({ error: 'auth required' }, 401);
  }
  const id = c.req.param('id');
  const request = await findProvisionRequestById(c.env.DB, id);
  if (!request) {
    return c.json({ error: `Unknown provision request: ${id}` }, 404);
  }
  return c.json({ request });
});

/**
 * Lineage: list provision requests (optionally filtered by status / handoffId).
 * GET /capabilities/provision-requests?status=requested&limit=50
 */
capabilities.get('/provision-requests', async (c) => {
  const ctx = c.var.envContext;
  if (!ctx) {
    return c.json({ error: 'auth required' }, 401);
  }
  const status = c.req.query('status') as ProvisionRequestRecord['status'] | undefined;
  const handoffId = c.req.query('handoffId') ?? undefined;
  const limitRaw = c.req.query('limit');
  const limit = limitRaw ? Math.max(1, Math.min(200, Number.parseInt(limitRaw, 10) || 50)) : 50;
  const requests = await listProvisionRequests(c.env.DB, { status, handoffId, limit });
  return c.json({ generatedAt: new Date().toISOString(), requests });
});

/**
 * Operator-confirmed transition of a provision request between lifecycle
 * states. Allowed: requested → acknowledged → dispatched → (succeeded|failed),
 * or any state → withdrawn. Each transition is audited.
 *
 * POST /capabilities/provision-requests/:id/transition
 *   body: { status: 'acknowledged' | 'dispatched' | 'succeeded' | 'failed' | 'withdrawn', notes?: string }
 */
capabilities.post('/provision-requests/:id/transition', async (c) => {
  const ctx = c.var.envContext;
  if (!ctx) {
    return c.json({ error: 'auth required' }, 401);
  }
  const id = c.req.param('id');
  const body = await c.req
    .json<{ status?: ProvisionRequestRecord['status']; notes?: string }>()
    .catch(() => ({ status: undefined, notes: undefined } as { status?: ProvisionRequestRecord['status']; notes?: string }));

  const allowed: ProvisionRequestRecord['status'][] = [
    'acknowledged',
    'dispatched',
    'succeeded',
    'failed',
    'withdrawn',
  ];
  if (!body.status || !allowed.includes(body.status)) {
    return c.json(
      {
        error: 'status must be one of acknowledged|dispatched|succeeded|failed|withdrawn',
        allowed,
      },
      400,
    );
  }

  const updated = await transitionProvisionRequest(c.env.DB, id, {
    status: body.status,
    notes: body.notes,
  });
  if (!updated) {
    return c.json({ error: `Unknown provision request: ${id}` }, 404);
  }

  c.set('auditAction', 'capabilities.provision-staging.transition');
  c.set('auditResource', 'capability_provision_requests');
  c.set('auditResourceId', updated.id);
  c.set(
    'auditReversibility',
    body.status === 'succeeded' || body.status === 'failed' ? 'irreversible' : 'manual-rollback',
  );
  c.set('auditResultDetail', {
    provisionRequestId: updated.id,
    handoffId: updated.handoffId,
    nextStatus: updated.status,
  });

  return c.json({ request: updated });
});

// ─────────────────────────────────────────────────────────────────────────────
// Stage 3 — Service lineage routes
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Register or update a deployed service.
 *
 * Called by the dispatch-capability-provision.yml workflow after a successful
 * scaffold + deploy cycle. Idempotent on service_id: re-provisioning updates
 * the existing row rather than inserting a duplicate.
 *
 * POST /capabilities/services
 *   body: { serviceId, handoffId, provisionRequestId?, deployedSha, manifestHash }
 */
capabilities.post('/services', async (c) => {
  const ctx = c.var.envContext;
  if (!ctx) {
    return c.json({ error: 'auth required' }, 401);
  }

  type ServiceBody = {
    serviceId?: string;
    handoffId?: string;
    provisionRequestId?: string | null;
    deployedSha?: string;
    manifestHash?: string;
    workerUrl?: string;
  };
  const body = await c.req.json<ServiceBody>().catch((): ServiceBody => ({}));

  if (!body.serviceId) return c.json({ error: 'serviceId is required' }, 400);
  if (!body.handoffId) return c.json({ error: 'handoffId is required' }, 400);
  if (!body.deployedSha) return c.json({ error: 'deployedSha is required' }, 400);
  if (!body.manifestHash) return c.json({ error: 'manifestHash is required' }, 400);

  const service = await upsertService(c.env.DB, {
    serviceId: body.serviceId,
    handoffId: body.handoffId,
    provisionRequestId: body.provisionRequestId ?? null,
    deployedSha: body.deployedSha,
    manifestHash: body.manifestHash,
    workerUrl: body.workerUrl ?? null,
  });

  c.set('auditAction', 'capabilities.service.upsert');
  c.set('auditResource', 'capability_services');
  c.set('auditResourceId', service.id);
  c.set('auditReversibility', 'manual-rollback');
  c.set('auditResultDetail', {
    serviceId: service.serviceId,
    handoffId: service.handoffId,
    deployedSha: service.deployedSha,
    manifestHash: service.manifestHash,
    workerUrl: service.workerUrl,
  });

  return c.json({ service }, 201);
});

/**
 * List service lineage records.
 * GET /capabilities/services?handoffId=…&conceptId=…&limit=50
 */
capabilities.get('/services', async (c) => {
  const ctx = c.var.envContext;
  if (!ctx) {
    return c.json({ error: 'auth required' }, 401);
  }
  const handoffId = c.req.query('handoffId') ?? undefined;
  const conceptId = c.req.query('conceptId') ?? undefined;
  const limitRaw = c.req.query('limit');
  const limit = limitRaw ? Math.max(1, Math.min(200, Number.parseInt(limitRaw, 10) || 50)) : 50;
  const services = await listServices(c.env.DB, { handoffId, conceptId, limit });
  return c.json({ generatedAt: new Date().toISOString(), services });
});

/**
 * Single service lookup by stable service_id string.
 * GET /capabilities/services/:serviceId
 */
capabilities.get('/services/:serviceId', async (c) => {
  const ctx = c.var.envContext;
  if (!ctx) {
    return c.json({ error: 'auth required' }, 401);
  }
  const serviceId = c.req.param('serviceId');
  const service = await findServiceByServiceId(c.env.DB, serviceId);
  if (!service) {
    return c.json({ error: `Unknown service: ${serviceId}` }, 404);
  }
  return c.json({ service });
});

/**
 * Record the result of an automated drift check for this service.
 * Updates last_drift_check_at, drift_detected, live_manifest_hash, and
 * drift_first_seen_at (only on false→true transition). Does not alter
 * deployment fields.
 *
 * POST /capabilities/services/:serviceId/drift-check
 *   body: { driftDetected?: boolean; liveManifestHash?: string | null }
 */
capabilities.post('/services/:serviceId/drift-check', async (c) => {
  const ctx = c.var.envContext;
  if (!ctx) {
    return c.json({ error: 'auth required' }, 401);
  }
  const serviceId = c.req.param('serviceId');

  type DriftCheckBody = { driftDetected?: boolean; liveManifestHash?: string | null };
  const body = await c.req.json<DriftCheckBody>().catch((): DriftCheckBody => ({}));
  const driftResult = {
    driftDetected: Boolean(body.driftDetected),
    liveManifestHash: body.liveManifestHash ?? null,
  };

  const service = await touchServiceDriftCheck(c.env.DB, serviceId, driftResult);
  if (!service) {
    return c.json({ error: `Unknown service: ${serviceId}` }, 404);
  }

  c.set('auditAction', 'capabilities.service.drift-check');
  c.set('auditResource', 'capability_services');
  c.set('auditResourceId', service.id);
  c.set('auditReversibility', 'reversible');
  c.set('auditResultDetail', {
    serviceId: service.serviceId,
    lastDriftCheckAt: service.lastDriftCheckAt,
    driftDetected: service.driftDetected,
    liveManifestHash: service.liveManifestHash,
  });

  return c.json({ service });
});

// ─────────────────────────────────────────────────────────────────────────────
// Phase 5 — Capability Graph routes (visual composer)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * List graph documents.
 * GET /capabilities/graphs?limit=50
 */
capabilities.get('/graphs', async (c) => {
  const ctx = c.var.envContext;
  if (!ctx) return c.json({ error: 'auth required' }, 401);
  const limitRaw = c.req.query('limit');
  const limit = limitRaw ? Math.max(1, Math.min(200, Number.parseInt(limitRaw, 10) || 50)) : 50;
  const graphs = await listGraphs(c.env.DB, { limit });
  return c.json({ generatedAt: new Date().toISOString(), graphs });
});

/**
 * Create a new graph document.
 * POST /capabilities/graphs
 *   body: { name, description? }
 */
capabilities.post('/graphs', async (c) => {
  const ctx = c.var.envContext;
  if (!ctx) return c.json({ error: 'auth required' }, 401);
  type GraphCreateBody = { name?: string; description?: string };
  const body = await c.req.json<GraphCreateBody>().catch((): GraphCreateBody => ({}));
  if (!body.name?.trim()) return c.json({ error: 'name is required' }, 400);
  const graph = await createGraph(c.env.DB, {
    name: body.name.trim(),
    description: body.description,
    createdBy: ctx.userId,
  });
  c.set('auditAction', 'capabilities.graph.create');
  c.set('auditResource', 'capability_graphs');
  c.set('auditResourceId', graph.id);
  c.set('auditReversibility', 'reversible');
  c.set('auditResultDetail', { graphId: graph.id, name: graph.name });
  return c.json({ graph }, 201);
});

/**
 * Get a graph by id.
 * GET /capabilities/graphs/:id
 */
capabilities.get('/graphs/:id', async (c) => {
  const ctx = c.var.envContext;
  if (!ctx) return c.json({ error: 'auth required' }, 401);
  const id = c.req.param('id');
  const graph = await findGraphById(c.env.DB, id);
  if (!graph) return c.json({ error: `Unknown graph: ${id}` }, 404);
  return c.json({ graph });
});

/**
 * Update graph nodes/edges/name/description.
 * PUT /capabilities/graphs/:id
 *   body: { name?, description?, nodes?, edges? }
 * Clears compiledPlan on every update (recompile required).
 */
capabilities.put('/graphs/:id', async (c) => {
  const ctx = c.var.envContext;
  if (!ctx) return c.json({ error: 'auth required' }, 401);
  const id = c.req.param('id');
  type GraphPatchBody = {
    name?: string;
    description?: string;
    nodes?: unknown[];
    edges?: unknown[];
  };
  const body = await c.req.json<GraphPatchBody>().catch((): GraphPatchBody => ({}));
  const graph = await updateGraphLayout(c.env.DB, id, {
    name: body.name,
    description: body.description,
    nodes: body.nodes as GraphNode[] | undefined,
    edges: body.edges as GraphEdge[] | undefined,
  });
  if (!graph) return c.json({ error: `Unknown graph: ${id}` }, 404);
  c.set('auditAction', 'capabilities.graph.update');
  c.set('auditResource', 'capability_graphs');
  c.set('auditResourceId', graph.id);
  c.set('auditReversibility', 'reversible');
  c.set('auditResultDetail', {
    graphId: graph.id,
    nodeCount: graph.nodes.length,
    edgeCount: graph.edges.length,
  });
  return c.json({ graph });
});

/**
 * Delete a graph.
 * DELETE /capabilities/graphs/:id
 */
capabilities.delete('/graphs/:id', async (c) => {
  const ctx = c.var.envContext;
  if (!ctx) return c.json({ error: 'auth required' }, 401);
  const id = c.req.param('id');
  const deleted = await deleteGraph(c.env.DB, id);
  if (!deleted) return c.json({ error: `Unknown graph: ${id}` }, 404);
  c.set('auditAction', 'capabilities.graph.delete');
  c.set('auditResource', 'capability_graphs');
  c.set('auditResourceId', id);
  c.set('auditReversibility', 'irreversible');
  c.set('auditResultDetail', { graphId: id });
  return c.json({ deleted: true });
});

/**
 * Compile a graph to a CapabilityPlan.
 * POST /capabilities/graphs/:id/compile
 * Returns errors/warnings + plan on success.
 * On success, persists the compiled plan to the graph record.
 */
capabilities.post('/graphs/:id/compile', async (c) => {
  const ctx = c.var.envContext;
  if (!ctx) return c.json({ error: 'auth required' }, 401);
  const id = c.req.param('id');
  const graph = await findGraphById(c.env.DB, id);
  if (!graph) return c.json({ error: `Unknown graph: ${id}` }, 404);
  const result = compileGraph(graph);
  if (result.success && result.plan) {
    await saveCompiledPlan(c.env.DB, id, result.plan as unknown as Record<string, unknown>);
  }
  c.set('auditAction', 'capabilities.graph.compile');
  c.set('auditResource', 'capability_graphs');
  c.set('auditResourceId', id);
  c.set('auditReversibility', 'reversible');
  c.set('auditResultDetail', {
    graphId: id,
    success: result.success,
    errorCount: result.errors.length,
    recipeId: result.recipeId,
  });
  return c.json({
    graphId: id,
    success: result.success,
    errors: result.errors,
    warnings: result.warnings,
    plan: result.plan,
    recipeId: result.recipeId,
    compiledAt: result.success ? new Date().toISOString() : null,
  });
});

/**
 * Compile a graph and generate a handoff for staging provision.
 * POST /capabilities/graphs/:id/handoff
 * Equivalent to the recipe-first handoff flow but driven from a graph.
 */
capabilities.post('/graphs/:id/handoff', async (c) => {
  const ctx = c.var.envContext;
  if (!ctx) return c.json({ error: 'auth required' }, 401);
  const id = c.req.param('id');
  const graph = await findGraphById(c.env.DB, id);
  if (!graph) return c.json({ error: `Unknown graph: ${id}` }, 404);
  const compileResult = compileGraph(graph);
  if (!compileResult.success || !compileResult.plan || !compileResult.resolution) {
    return c.json(
      {
        error: 'Graph compilation failed — fix errors before generating a handoff',
        errors: compileResult.errors,
        warnings: compileResult.warnings,
      },
      422,
    );
  }
  const handoffBody = {
    schemaVersion: HANDOFF_SCHEMA_VERSION,
    kind: 'scaffold-handoff' as const,
    conceptId: compileResult.resolution.concept.id,
    recipeId: compileResult.recipeId!,
    parameters: compileResult.resolution.parameters,
    plan: compileResult.plan,
    preview: renderCapabilityPlanPreview(compileResult.plan),
    nextAction: {
      action: 'request-staging-provision' as const,
      conceptId: compileResult.resolution.concept.id,
      recipeId: compileResult.recipeId!,
    },
  };
  const hash = await hashHandoffBody(handoffBody);
  const persisted = await persistHandoff(c.env.DB, {
    hash,
    schemaVersion: HANDOFF_SCHEMA_VERSION,
    conceptId: handoffBody.conceptId,
    recipeId: handoffBody.recipeId,
    parameters: handoffBody.parameters,
    plan: handoffBody.plan,
    preview: handoffBody.preview,
    nextAction: handoffBody.nextAction,
    createdBy: ctx.userId,
    env: ctx.env,
  });
  const handoff = { ...handoffBody, id: persisted.id, hash, createdAt: persisted.createdAt };
  c.set('auditAction', 'capabilities.graph.handoff');
  c.set('auditResource', 'capability_graphs');
  c.set('auditResourceId', id);
  c.set('auditReversibility', 'reversible');
  c.set('auditResultDetail', {
    graphId: id,
    handoffId: persisted.id,
    recipeId: handoffBody.recipeId,
  });
  return c.json({ graph: { id, name: graph.name }, handoff });
});

type ConceptBody = { conceptId?: string; params?: Record<string, unknown> };

async function parseConceptBody(c: {
  req: { json: <T>() => Promise<T> };
}): Promise<ConceptBody> {
  return c.req.json<ConceptBody>().catch((): ConceptBody => ({}));
}

function buildPreviewResponse(conceptId: string, resolution: CapabilityResolution) {
  const plan = compileCapabilityPlan(resolution.recipe.id);
  const preview = renderCapabilityPlanPreview(plan);

  return {
    resolution,
    plan,
    preview,
    generatedAt: new Date().toISOString(),
    nextStep: {
      action: 'review-plan-preview' as const,
      conceptId,
      recipeId: resolution.recipe.id,
    },
  };
}

function buildHandoffBody(previewResponse: {
  resolution: CapabilityResolution;
  plan: CapabilityPlan;
  preview: string;
  nextStep: {
    action: string;
    conceptId: string;
    recipeId: string;
  };
}) {
  return {
    schemaVersion: HANDOFF_SCHEMA_VERSION,
    kind: 'scaffold-handoff' as const,
    conceptId: previewResponse.resolution.concept.id,
    recipeId: previewResponse.resolution.recipe.id,
    parameters: previewResponse.resolution.parameters,
    plan: previewResponse.plan,
    preview: previewResponse.preview,
    nextAction: {
      action: 'generate-scaffold-handoff' as const,
      conceptId: previewResponse.nextStep.conceptId,
      recipeId: previewResponse.nextStep.recipeId,
    },
  };
}

export default capabilities;
