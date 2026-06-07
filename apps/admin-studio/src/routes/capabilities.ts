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
  approveGraphRevision,
  createGraph,
  findGraphById,
  findGraphRevisionById,
  listGraphRevisionApprovals,
  listGraphs,
  listGraphRevisions,
  publishGraphRevision,
  updateGraphLayout,
  saveCompiledPlan,
  deleteGraph,
  type GraphSourceProvenance,
} from '../lib/graph-store.js';
import { compileGraph } from '../lib/graph-compiler.js';
import { requireConfirmation } from '../middleware/require-confirmation.js';
import {
  parseGraphCreateInput,
  parseGraphPatchInput,
} from '../lib/graph-validation.js';

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
  const body = await c.req.json<unknown>().catch((): unknown => ({}));
  const parsed = parseGraphCreateInput(body);
  if (!parsed.ok) {
    return c.json({
      error: parsed.issues[0]?.message ?? 'Invalid graph create payload',
      issues: parsed.issues,
    }, 400);
  }
  const graph = await createGraph(c.env.DB, {
    name: parsed.value.name,
    description: parsed.value.description,
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
 * List immutable graph revisions for a graph.
 * GET /capabilities/graphs/:id/revisions?limit=20
 */
capabilities.get('/graphs/:id/revisions', async (c) => {
  const ctx = c.var.envContext;
  if (!ctx) return c.json({ error: 'auth required' }, 401);
  const id = c.req.param('id');
  const graph = await findGraphById(c.env.DB, id);
  if (!graph) return c.json({ error: `Unknown graph: ${id}` }, 404);
  const limitRaw = c.req.query('limit');
  const limit = limitRaw ? Math.max(1, Math.min(100, Number.parseInt(limitRaw, 10) || 20)) : 20;
  const revisions = await listGraphRevisions(c.env.DB, id, { limit });
  return c.json({
    generatedAt: new Date().toISOString(),
    graph: {
      id: graph.id,
      name: graph.name,
      currentRevisionId: graph.currentRevisionId,
      currentRevisionNumber: graph.currentRevisionNumber,
      currentRevisionHash: graph.currentRevisionHash,
      publishedRevisionId: graph.publishedRevisionId,
      publishedRevisionNumber: graph.publishedRevisionNumber,
      publishedRevisionHash: graph.publishedRevisionHash,
    },
  revisions,
  });
});

/**
 * Approve a graph revision for future execution.
 * POST /capabilities/graphs/:id/revisions/:revisionId/approve
 *   body: { summary: string }
 */
capabilities.post(
  '/graphs/:id/revisions/:revisionId/approve',
  requireConfirmation({
    action: 'capabilities.graph.approve',
    reversibility: 'trivial',
    minRole: 'admin',
  }),
  async (c) => {
    const ctx = c.var.envContext;
    if (!ctx) return c.json({ error: 'auth required' }, 401);
    const id = c.req.param('id');
    const revisionId = c.req.param('revisionId');
    const rawBody = await c.req.json<{ summary?: unknown }>().catch(() => ({} as { summary?: unknown }));
    const summary = rawBody.summary;
    if (typeof summary !== 'string' || summary.trim().length === 0) {
      return c.json({ error: 'summary is required' }, 400);
    }
    c.set('auditAction', 'capabilities.graph.approve');
    c.set('auditResource', 'capability_graphs');
    c.set('auditResourceId', id);
    c.set('auditReversibility', 'trivial');
    const result = await approveGraphRevision(c.env.DB, id, revisionId, {
      approvedBy: ctx.userId,
      approvalSummary: summary,
      env: ctx.env,
    });
    if (result.status === 'not_found') return c.json({ error: `Unknown graph: ${id}` }, 404);
    if (result.status === 'revision_not_found') {
      return c.json({ error: 'Revision not found for this graph' }, 404);
    }
    if (result.status === 'revision_already_approved') {
      return c.json({ error: 'Revision has already been approved' }, 409);
    }
    if (result.status === 'self_approval_forbidden') {
      return c.json({ error: 'Production revisions must be approved by a different principal than the author' }, 409);
    }
    c.set('auditResourceId', result.graph.id);
    c.set('auditResultDetail', {
      graphId: result.graph.id,
      revisionId: result.revision.id,
      revisionNumber: result.revision.revisionNumber,
      graphVersion: result.revision.graphVersion,
      approvalId: result.approval.id,
      targetEnvironment: result.approval.targetEnvironment,
      approvalSummary: result.revision.approvalSummary,
    });
    return c.json({
      graph: result.graph,
      revision: result.revision,
      approval: result.approval,
    });
  },
);

/**
 * List append-only approval records for a graph revision.
 * GET /capabilities/graphs/:id/revisions/:revisionId/approvals
 */
capabilities.get('/graphs/:id/revisions/:revisionId/approvals', async (c) => {
  const ctx = c.var.envContext;
  if (!ctx) return c.json({ error: 'auth required' }, 401);
  const id = c.req.param('id');
  const revisionId = c.req.param('revisionId');
  const graph = await findGraphById(c.env.DB, id);
  if (!graph) return c.json({ error: `Unknown graph: ${id}` }, 404);
  const revision = await findGraphRevisionById(c.env.DB, revisionId);
  if (!revision || revision.graphId !== id) {
    return c.json({ error: 'Revision not found for this graph' }, 404);
  }
  const approvals = await listGraphRevisionApprovals(c.env.DB, id, revisionId);
  return c.json({
    generatedAt: new Date().toISOString(),
    graph: { id: graph.id, name: graph.name },
    revision: {
      id: revision.id,
      revisionNumber: revision.revisionNumber,
      graphVersion: revision.graphVersion,
      contentHash: revision.contentHash,
    },
    approvals,
  });
});

/**
 * Publish a graph revision for execution.
 * POST /capabilities/graphs/:id/publish
 *   body: { revisionId? } defaults to current draft revision
 */
capabilities.post(
  '/graphs/:id/publish',
  requireConfirmation({
    action: 'capabilities.graph.publish',
    reversibility: 'reversible',
    minRole: 'admin',
  }),
  async (c) => {
    const ctx = c.var.envContext;
    if (!ctx) return c.json({ error: 'auth required' }, 401);
    const id = c.req.param('id');
    const rawBody = await c.req.json<{ revisionId?: unknown }>().catch(() => ({} as { revisionId?: unknown }));
    const revisionId = rawBody.revisionId;
    if (revisionId !== undefined && typeof revisionId !== 'string') {
      return c.json({ error: 'revisionId must be a string when provided' }, 400);
    }
    c.set('auditAction', 'capabilities.graph.publish');
    c.set('auditResource', 'capability_graphs');
    c.set('auditResourceId', id);
    c.set('auditReversibility', 'reversible');
    const result = await publishGraphRevision(c.env.DB, id, {
      revisionId: typeof revisionId === 'string' ? revisionId : undefined,
      publishedBy: ctx.userId,
      env: ctx.env,
    });
    if (result.status === 'not_found') return c.json({ error: `Unknown graph: ${id}` }, 404);
    if (result.status === 'no_revision') {
      return c.json({ error: 'Graph has no draft revision to publish' }, 409);
    }
    if (result.status === 'revision_not_found') {
      return c.json({ error: 'Revision not found for this graph' }, 404);
    }
    if (result.status === 'revision_not_approved') {
      return c.json({ error: 'Revision must be approved before publishing' }, 409);
    }
    if (result.status === 'approval_environment_mismatch') {
      return c.json({ error: 'Revision approval does not match the requested environment' }, 409);
    }
    if (result.status === 'publisher_must_differ_from_approver') {
      return c.json({ error: 'Production revisions must be published by a different principal than the approver' }, 409);
    }
    c.set('auditResourceId', result.graph.id);
    c.set('auditResultDetail', {
      graphId: result.graph.id,
      revisionId: result.revision.id,
      revisionNumber: result.revision.revisionNumber,
      graphVersion: result.revision.graphVersion,
    });
    return c.json({
      graph: result.graph,
      revision: result.revision,
    });
  },
);

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
  const body = await c.req.json<unknown>().catch((): unknown => ({}));
  const parsed = parseGraphPatchInput(body);
  if (!parsed.ok) {
    return c.json({
      error: parsed.issues[0]?.message ?? 'Invalid graph patch payload',
      issues: parsed.issues,
    }, 400);
  }
  const updateInput = {
    ...parsed.value,
    updatedBy: ctx.userId,
  };
  const result = await updateGraphLayout(c.env.DB, id, updateInput);
  if (result.status === 'not_found') return c.json({ error: `Unknown graph: ${id}` }, 404);
  if (result.status === 'conflict') {
    return c.json({
      error: 'Graph was updated by another session. Refresh and try again.',
      currentVersion: result.currentGraph.version,
      graph: result.currentGraph,
    }, 409);
  }
  const graph = result.graph;
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
  const revision = await getPublishedGraphRevision(c.env.DB, graph);
  if (!revision) {
    return c.json({ error: 'Graph has no published revision. Publish a revision before compiling.' }, 409);
  }
  const compileInput = graphDocumentFromRevision(graph, revision);
  const result = compileGraph(compileInput);
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
    sourceGraph: toGraphSourceProvenance(revision),
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
  const revision = await getPublishedGraphRevision(c.env.DB, graph);
  if (!revision) {
    return c.json({ error: 'Graph has no published revision. Publish a revision before generating a handoff.' }, 409);
  }
  const compileInput = graphDocumentFromRevision(graph, revision);
  const compileResult = compileGraph(compileInput);
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
  const sourceGraph = toGraphSourceProvenance(revision);
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
    sourceGraph,
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
    sourceGraph: handoffBody.sourceGraph,
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

async function getPublishedGraphRevision(
  db: AppEnv['Bindings']['DB'],
  graph: Awaited<ReturnType<typeof findGraphById>>,
) {
  if (!graph?.publishedRevisionId) return null;
  return findGraphRevisionById(db, graph.publishedRevisionId);
}

function toGraphSourceProvenance(revision: Awaited<ReturnType<typeof findGraphRevisionById>>): GraphSourceProvenance {
  if (!revision) {
    throw new Error('graph revision is required for source provenance');
  }
  return {
    graphId: revision.graphId,
    revisionId: revision.id,
    revisionNumber: revision.revisionNumber,
    graphVersion: revision.graphVersion,
    contentHash: revision.contentHash,
  };
}

function graphDocumentFromRevision(
  graph: NonNullable<Awaited<ReturnType<typeof findGraphById>>>,
  revision: NonNullable<Awaited<ReturnType<typeof findGraphRevisionById>>>,
) {
  return {
    ...graph,
    name: revision.name,
    description: revision.description,
    version: revision.graphVersion,
    currentRevisionId: revision.id,
    currentRevisionNumber: revision.revisionNumber,
    currentRevisionHash: revision.contentHash,
    nodes: revision.nodes,
    edges: revision.edges,
  };
}

export default capabilities;
