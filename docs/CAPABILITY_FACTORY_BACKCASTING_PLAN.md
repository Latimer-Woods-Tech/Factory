# Capability Factory — Backcasting Plan

**Status:** Active — Phase 5A (Constrained Visual Composer v1) implemented; production-hardening and Autonomous OS integration required
**Date:** 2026-05-22 (last updated 2026-06-07)
**Decision context:** Option 3 selected — recipe-first provisioning engine, followed by a constrained visual composer.

## Implementation Status

The recipe-first end-to-end thin slice (resolve → provision → deploy) is operational. Drift detection and the constrained visual composer v1 are implemented. The composer now has runtime payload validation, optimistic concurrency, immutable revision lineage, environment-bound append-only revision approvals, published execution heads, and production reviewer separation. It is not complete as a governed Autonomous OS surface: explicit access control, deterministic relationship semantics, actual-state binding, compile-result-bound approval with expiry and execution-time revalidation, and graph-specific staging proof remain open.

### Assembly Line (Stages 1A–1E)

| Stage | Description | Status | PR |
|-------|-------------|--------|----|
| 1A | Dispatch chain end-to-end (resolve → preview → handoff → provision-staging → auto-dispatch → scaffold artifact) | ✅ Shipped | #910 + 7 follow-up PRs |
| 1B | Hyperdrive race fix — hash-based fallback lookup in auto-dispatcher | ✅ Shipped | #1097 |
| 1C | Parameter threading — recipe secrets/vars baked into scaffold `src/env.ts` + `wrangler.jsonc` | ✅ Shipped | #1099 |
| 1D | `capability_services` lineage table — `POST /capabilities/services`, drift-check, dispatch wire-up | ✅ Shipped | #1100 |
| 1E | Real deploy — `provision-app-staging.yml` provisions Hyperdrive + GitHub repo + JWT_SECRET, deploys Worker, verifies `/health`, updates lineage | ✅ Shipped | #1108 |

### Post-Assembly Line (Phase 5 + Observability)

| Item | Description | Status | PR |
|------|-------------|--------|----|
| Credential fix | `NODE_AUTH_TOKEN` wired to non-existent repo secret → always failed at creds gate; fixed to derive from GCP `GH_PAT` | ✅ Shipped | #1123 |
| Drift cron | `runDriftCheck()` on `0 */6 * * *`; SHA-256 of live `/manifest` response vs stored hash; `capability_services` extended with `worker_url`, `drift_detected`, `drift_first_seen_at`, `live_manifest_hash`; migration `0008_capability_services_drift.sql` | ✅ Shipped | #1116 |
| Manifest hash semantics | `provision-app-staging.yml` hash changed from `sha256(wrangler.jsonc)` → `sha256(jq -c -S '.' /manifest)`; `workerUrl` added to lineage POST body | 🔄 Auto-merge queue | #1118 |
| Drift UI badges | `DeployedServicesPanel` + `DriftStatusBadge` in `CapabilitiesTab.tsx`; polls `GET /capabilities/services?conceptId=...`; 3-state badge (unchecked / ok / drift) | 🔄 Auto-merge queue | #1119 |
| Graph compiler backend | `capability_graphs` table, `graph-store.ts`, `graph-compiler.ts` (v1 constraint: exactly one concept node), graph routes (`GET/POST /capabilities/graphs`, `/:id/compile`, `/:id/handoff`), migration `0009_capability_graphs.sql` | Implemented v1; hardening required | #1120 |
| Phase 5 — Visual Composer | `GraphComposerTab.tsx` (1178 lines): 3-panel layout (palette / canvas / properties), drag-drop nodes, SVG edge overlay, concept param editor, compile→handoff flow | Implemented v1; maturity gates open | #1121 |
| Graph governance foundation | Strict payload validation, optimistic concurrency, immutable revisions, revision-pinned compile/handoff, review UI, environment-bound append-only approval ledger and published heads, production author/reviewer/publisher separation | Implemented; compile-bound approval and authorization remain | In progress |

**Full operator flow (assembly line + composer):**
```
Admin Studio → resolve recipe → preview plan → create handoff          [Phases 1–4]
  → dispatch-capability-provision.yml (scaffold artifact + lineage)
  → [operator reviews artifact]
  → provision-app-staging.yml (Hyperdrive + repo + deploy + /health verify + lineage)
                                                                        [Phase 5]
Admin Studio → GraphComposerTab → drag concept node → set params
  → compile graph → POST /capabilities/graphs/:id/handoff
  → same provision pipeline above

Drift cron: 0 */6 * * * → runDriftCheck() → GET /manifest on each live service
  → SHA-256 compare → flag drift in capability_services
  → DriftStatusBadge in CapabilitiesTab shows amber when drift detected
```

**Remaining work:** First real graph-authored end-to-end provision run with a live handoff; drift cron validation in production; typed relationship semantics; actual-state binding; explicit graph authorization; compiler/version-pinned approvals with expiry; broader graph-specific tests; and approval integration with execution-time revalidation. Multi-concept graph support remains locked until the single-concept lifecycle passes the maturity gates below.

## Phase 5 Maturity Revision

### Governing Decision

Graph Composer is a constrained desired-state authoring, review, and evidence surface. It is not an independent workflow engine, runtime orchestrator, or freeform execution canvas.

The governed lifecycle is:

```text
Operator or constrained AI proposal
  -> CapabilityGraph working document
  -> immutable GraphRevision
  -> registry validation
  -> deterministic CompileResult
  -> approved Handoff
  -> Supervisor-selected approved template/workflow
  -> provisioner mutation
  -> ServiceBinding and runtime Observation
  -> DriftFinding and reviewed reconciliation proposal
```

The registry defines what is legal. The compiler defines graph meaning. The Supervisor may schedule and gate only approved templates and workflows. Provisioners perform mutations. The composer proposes, reviews, and visualizes; it never executes arbitrary graph semantics.

### Canonical Artifact Model

| Artifact | Responsibility | Mutability |
|----------|----------------|------------|
| `CapabilityGraph` | Stable graph identity, metadata, ownership, and current draft pointer | Mutable metadata |
| `GraphRevision` | Complete desired-state graph, schema version, author, and content hash | Immutable |
| `CompileResult` | Deterministic output, diagnostics, compiler version, registry version, and source revision hash | Immutable |
| `Handoff` | Approved request to realize an exact successful compile result in a target environment | Immutable |
| `ProvisionRequest` | Concrete invocation of an approved workflow/template | Append-only lifecycle |
| `ServiceBinding` | Link from realized capability/revision to deployed service identity | Append-only lifecycle |
| `Observation` | Time-bound measured actual state and evidence | Immutable |
| `DriftFinding` | Desired-versus-actual comparison with severity and disposition | Append-only lifecycle |
| `GraphProposal` | Human- or AI-authored candidate diff requiring normal validation and approval | Immutable proposal |

No handoff may be generated from a mutable draft. Every handoff, provision request, service binding, observation, and drift finding must retain lineage to an immutable graph revision. Environment intent belongs to the handoff or promotion request, not the reusable graph revision, unless a registry-owned concept explicitly declares an environment-specific parameter.

### Lifecycle Invariants

1. Canonical serialization and content hashing define graph revision identity; array order, key order, and presentation-only canvas changes must have explicitly documented hash behavior.
2. A compile result pins the exact graph revision, schema version, registry version, compiler version, and other semantic inputs.
3. An approval binds to the exact handoff and compile-result hash, target environment, mutation class, and expiry. Execution must revalidate that binding immediately before mutation.
4. Staging and production are separate realization targets. A successful staging handoff never implicitly authorizes production.
5. Every mutating request has an idempotency key and an append-only attempt history.
6. Mutations are classified as additive, in-place, replacing, destructive, or externally irreversible before approval.
7. "Rollback" means either proven reversal or an explicit compensating action. The system must not promise reversal for irreversible provider operations.
8. Historical revisions, compile results, approvals, execution receipts, and observations follow an explicit retention policy and remain auditable.
9. A lifecycle state transition is valid only when its preconditions are satisfied; components may not infer success from a later artifact while an earlier required artifact is missing.

### Authority Matrix

| Concern | Sole authority |
|---------|----------------|
| Allowed concepts, primitives, parameters, recipes, and relationship types | Capability registry |
| Meaning of a valid graph and graph-to-plan translation | Deterministic graph compiler |
| Drafting, reviewing, diffing, and visualizing desired and actual state | Graph Composer |
| Execution scheduling, trust tier, policy gates, and approved-template selection | Supervisor |
| Infrastructure and repository mutations | Approved GitHub Actions workflows and provisioners |
| Deployed identity and lineage | Capability service registry |
| Runtime condition | Signed or otherwise trustworthy observations |
| Production promotion | Explicit human approval under existing production policy |

An LLM may draft a `GraphProposal` or explain diagnostics. It may not invent registry entries, define new edge semantics, select an unapproved executor, infer secrets, bypass approval, or mutate infrastructure.

### Relationship Taxonomy v1

Relationship types are registry-owned, versioned, and finite. Phase 5B begins with descriptive relationships:

- `requires`: source requires target capability or primitive
- `uses`: source consumes target at runtime
- `exposes`: source exposes target interface
- `emits`: source emits target event or output
- `observed_by`: source is monitored by target
- `deployed_as`: desired capability is realized as target service binding
- `owned_by`: source is governed by target owner or team

Relationship types do not imply execution order, retries, branching, loops, arbitrary network calls, or scripting. Unsupported relationships are compile errors, not warnings. The compiler is the only component allowed to assign semantics to a relationship.

### Source-of-Truth and Approval Rules

Source-of-truth precedence is explicit:

1. The registry defines allowed vocabulary and constraints.
2. An immutable `GraphRevision` defines desired topology.
3. A `CompileResult` defines the deterministic realization plan.
4. A `Handoff` and `ProvisionRequest` record the approved requested mutation.
5. A `ServiceBinding` records provisioned identity and lineage.
6. An `Observation` records measured actual state.
7. A `DriftFinding` compares desired state to actual state; it does not silently redefine either.

Each transition has one approval owner:

| Transition | Required authority |
|------------|--------------------|
| Save draft | Graph editor permission |
| Publish immutable revision | Graph publisher permission |
| Approve handoff | Designated capability reviewer approving the exact compile hash, environment, and mutation class |
| Execute staging provision | Supervisor/workflow policy gate |
| Promote to production | Explicit human production approver |
| Apply reconciliation | Same or stronger authority as the original mutation |

### Required Delivery Phases

#### Phase 5A — Existing Constrained Composer v1

Status: implemented and governed through revision publication, but not production-complete.

Known constraints:

1. Exactly one concept node is supported.
2. Primitive nodes and edges are mostly informational.
3. Relationship semantics remain mostly informational and are not registry-owned typed contracts.
4. Revision approval is revision-bound, environment-bound, immutable, and stored in an append-only ledger, but is not yet bound to compile hash, registry/compiler versions, expiry, or execution-time revalidation.
5. Graph-specific authorization, compiler fixtures, migration tests, and end-to-end staging proof are incomplete.
6. Desired state is not bound into a complete desired-versus-actual lifecycle.

#### Phase 5B — Governed Graph Foundation

Requirements:

1. Council ADR confirms the composer boundary and prohibited semantics.
2. Add versioned runtime schemas for nodes, relationships, documents, and revisions.
3. Add immutable revisions, canonical content hashes, compiler/registry/schema version capture, and optimistic concurrency.
4. Define organization/team/owner visibility plus view/edit/publish/handoff permissions.
5. Reject dangling, duplicate, unsupported, cyclic-when-prohibited, and unauthorized relationships.
6. Add graph/compiler/route/auth/migration tests and deterministic compiler fixtures.
7. Preserve and migrate existing `capability_graphs` rows without silent data loss.
8. Define explicit lifecycle states and allowed transitions for drafts, revisions, compiles, handoffs, provisions, bindings, observations, and drift findings.

Exit criteria:

1. The same revision and registry/compiler versions always produce the same compile result.
2. Concurrent edits cannot silently overwrite a published revision.
3. Malformed or unauthorized graphs cannot be saved, compiled, published, or handed off.
4. Every handoff references an immutable revision and successful compile result.
5. Approval and execution reject stale, expired, differently targeted, or differently classified handoffs.

#### Phase 5C — Lifecycle and Evidence Integration

Requirements:

1. Execute only through approved Supervisor templates/workflows.
2. Bind graph revisions, handoffs, provision requests, services, and observations end to end.
3. Display desired state, actual state, evidence freshness, and drift without conflating them.
4. Represent reversal, compensating actions, and reconciliation as reviewable proposals and governed requests.
5. Provide graph rename, description editing, relationship deletion, accessible keyboard controls, diff, and revision history.
6. Classify mutation impact and require stronger approval for replacing, destructive, or externally irreversible actions.

Exit criteria:

1. One single-concept graph provisions a real staging service and retains complete lineage.
2. The composer displays trustworthy actual state and detects a controlled drift event.
3. Reconciliation requires normal approval and restores the expected state.
4. A reversible change is reversed in staging, and an irreversible test case produces a reviewed compensating-action plan instead of a false rollback promise.

#### Phase 5D — Constrained Autonomous OS Proposals

Requirements:

1. AI output is limited to schema-valid `GraphProposal` diffs against an existing revision.
2. Registry validation and deterministic compile occur before human review.
3. Trust tier controls whether proposals may be automatically queued, never whether policy may be bypassed.
4. Every proposal records model/tool provenance, rationale, validation results, and disposition.

Exit criteria:

1. Invalid, unsafe, or out-of-registry proposals are rejected deterministically.
2. Repeated proposal failures demote automation under the Supervisor trust ladder.
3. No AI-generated proposal can directly provision or promote production.

#### Phase 6 — Evidence-Gated Multi-Concept Composition

Multi-concept support remains prohibited until Phases 5B through 5D pass their exit criteria. Its ADR must define composition boundaries, ownership, failure isolation, rollback behavior, relationship cardinality, and cross-service approval.

### Stress-Test Matrix

| Scenario | Required behavior | Failure if |
|----------|-------------------|------------|
| Malformed node or relationship payload | Reject before persistence with actionable diagnostics | Unknown JSON is cast into a graph document |
| Unknown concept, primitive, parameter, or relationship | Registry/compiler rejects deterministically | Composer or LLM invents semantics |
| Two editors update the same draft | Detect version conflict and require reconciliation | Last writer silently wins |
| Registry changes after a graph revision is published | Preserve old compile lineage and require explicit recompile/upgrade | Historical result changes silently |
| Compiler version changes | Record new result separately and show diff | Existing handoff meaning changes |
| Graph changes after compile | Invalidate draft compile and require a new immutable revision | Stale compile can produce a handoff |
| Approval targets an older compile or different environment | Reject at execution and require fresh approval | Approval is reused across changed intent or production |
| Approval expires between queue and execution | Revalidate immediately before mutation and fail closed | Stale approval authorizes a mutation |
| Unauthorized operator discovers a graph ID | Deny read/write/publish/handoff according to scope | ID knowledge grants access |
| Supervisor receives a valid graph but no approved template | Refuse execution and report missing approved path | Raw graph is executed |
| AI proposes unsupported composition or secret inference | Reject proposal and record policy failure | Proposal bypasses registry or secret policy |
| Live service differs from desired revision | Create drift finding with evidence; do not auto-mutate by default | Actual state silently replaces desired state |
| Observation is stale or unavailable | Mark actual state unknown/stale | UI reports false health or false conformity |
| Provision succeeds but lineage write fails | Surface partial failure and reconcile idempotently | Untracked service is treated as complete |
| Workflow retries after timeout | Use idempotency key and avoid duplicate service creation | Retry creates a second service |
| Reconciliation would delete or replace state | Require equal-or-stronger approval and rollback plan | Drift repair becomes destructive automation |
| Provider operation cannot be reversed | Require explicit irreversible classification and compensating-action plan | UI promises rollback that cannot work |
| Presentation-only canvas movement | Follow documented canonical-hash policy and avoid accidental semantic revision | Layout noise invalidates approvals unexpectedly |
| Required lineage or audit artifact is missing | Mark lifecycle incomplete and reconcile explicitly | Later artifacts are treated as proof of complete success |
| Production owner or approval system is unavailable | Fail closed while preserving staging and recovery paths | Automation bypasses production policy |

### Completion Definition

Graph Composer is complete for the single-concept use case only when:

1. It is governed by the registry and deterministic compiler.
2. It persists immutable, versioned, access-controlled revisions.
3. It produces approved handoffs through the existing provisioning path.
4. It binds realized services and trustworthy observations back to the authored revision.
5. It shows evidence, drift, revision diffs, and reversal/compensating-action/reconciliation proposals.
6. It passes the stress-test matrix in automated tests and a staging proof.
7. It cannot become an alternate path around Supervisor, workflow, security, or production approval controls.

## Purpose

This document defines how Factory should build the capability-factory initiative using a backcasting model:

1. Define the end-state operator experience first.
2. Define the engine invariants second.
3. Define the shared seam between product and engine third.
4. Build one thin end-to-end slice that proves the whole path.
5. Expand only after the whole path is real, validated, and operable.

This approach avoids two failure modes:

1. Building abstractions with no product shape.
2. Building a visual experience whose semantics are invented in the UI.

## Decision

Factory will pursue **Option 3**:

1. Build a recipe-first provisioning engine.
2. Prove it with one real recipe.
3. Expose that engine in Admin Studio through catalog and plan-preview surfaces.
4. Add a constrained visual composer later, on top of the same shared model.

Factory will **not** start with:

1. A freeform visual orchestration canvas.
2. A generalized runtime workflow engine.
3. A marketplace of arbitrary node combinations.

## End-State Vision

The target operator journey for v1 is:

1. Open Admin Studio.
2. Browse supported capability recipes.
3. Select a recipe and inspect what it requires.
4. Preview the generated provisioning plan.
5. Provision the service to staging.
6. Verify deployment through manifest, health, and smoke signals.
7. Observe lineage, drift, and upgrade status later.

This is the product truth. Work that does not directly support this flow should not enter the first delivery path.

## Engine Invariants

The engine must guarantee the following regardless of how the UI evolves:

1. Every supported composition is declarative.
2. Every plan is deterministic.
3. Every recipe declares an env and binding contract.
4. Every provisioned service has lineage.
5. Every provision path is staging-first.
6. Every provisioned service exposes expected `/health` and `/manifest` surfaces.
7. Every upgrade path is knowable.
8. Platform and compliance policy is enforced by code, not operator memory.

If a design choice weakens one of these invariants, it should be rejected.

## Build Doctrine

The program should use this build doctrine:

1. Define the destination first.
2. Define the invariants second.
3. Define the shared seam third.
4. Build one complete path fourth.
5. Generalize only after evidence exists.

The goal is to build from the end toward the middle and from the core outward until both meet at a justified seam.

## Four-Layer Model

The system should be organized into four layers.

### 1. Primitives

Reusable technical capabilities, usually backed by shared packages and infrastructure.

Examples:

1. `telephony`
2. `llm`
3. `stripe`
4. `analytics`
5. `compliance`
6. `crm`
7. `email`
8. `video`
9. `schedule`

### 2. Recipes

Approved, supportable compositions of primitives.

Examples:

1. `outbound-dialer`
2. `voice-intake-agent`
3. `subscription-core`
4. `content-pipeline`

### 3. Graphs

Visual compositions authored in Studio. Graphs do not invent new semantics; they compile to supported recipe-backed plans.

### 4. Services

Real deployable apps instantiated from a recipe version or compiled graph plan.

## Source of Truth

The source of truth must live in the Factory repo, not in the Studio UI.

Recommended canonical structure:

1. `capabilities/primitives/*.json`
2. `capabilities/recipes/*.json`
3. `capabilities/rules/*.json`
4. `capabilities/schema/*.json`
5. `capabilities/templates/` if needed later

Admin Studio should consume this registry and render it. Runtime manifests remain evidence of deployed reality, not architecture truth.

## Shared Seam

The shared seam is the object model that both the engine and the future visual composer use.

That seam should include:

1. Primitive descriptor
2. Recipe descriptor
3. Validation result
4. Compiled provisioning plan
5. Service lineage record
6. Graph document schema

This seam is the load-bearing middle. It must exist before a full visual composer is added.

## Backcasting Framework

Every feature or work item should be evaluated across five layers.

### Layer 1 — Outcome

What must a human be able to accomplish?

For v1:

1. Provision a supported service from a recipe.
2. Inspect why the system considers it valid.
3. Verify deployment and health.
4. Understand lineage and upgrade status.

### Layer 2 — Evidence

How do we know the outcome is real?

For v1:

1. A generated plan exists.
2. A repo and app surface exist.
3. A staging deployment exists.
4. `/health` returns the expected result.
5. `/manifest` matches the expected shape.
6. Smoke checks pass.
7. A lineage record exists.

### Layer 3 — Capabilities

What capabilities are required to produce that evidence?

1. Registry lookup
2. Recipe resolution
3. Rule validation
4. Plan compilation
5. Scaffold and provisioning execution
6. Lineage persistence
7. Plan preview in Studio

### Layer 4 — Components

What concrete code surfaces provide those capabilities?

1. Capability registry files
2. JSON schemas
3. Rule engine
4. Compiler
5. Scaffold extension
6. Studio endpoints
7. Studio catalog and preview UI

### Layer 5 — Sequence

What is the smallest valid implementation order?

1. Schemas and descriptors
2. One real recipe
3. Compiler
4. Provisioner
5. Plan preview in Studio
6. Lineage and drift
7. Constrained visual authoring

## Thin Slice Strategy

The first thin slice must prove the entire path end to end.

### Recommended first recipe

`outbound-dialer`

### Why this recipe

1. Forces telephony integration.
2. Forces compliance enforcement.
3. Forces CRM and analytics integration.
4. Requires meaningful manifests and health surfaces.
5. Is concrete enough to review commercially and operationally.

### Thin slice success criteria

1. The recipe exists declaratively in the registry.
2. The recipe compiles deterministically into a provisioning plan.
3. The plan can scaffold and provision a staging app.
4. The service exposes `/health` and `/manifest`.
5. Studio can preview the plan and show lineage for the result.

No breadth expansion should happen before this path is closed.

## Phased Delivery

### Phase 0 — Architecture Lock

Goals:

1. Confirm Option 3 is the program direction.
2. Freeze v1 scope.
3. Define non-goals.
4. Define the end-state operator flow.

Deliverables:

1. This document
2. `docs/CAPABILITY_FACTORY_ARCHITECTURE.md`
3. `docs/CAPABILITY_FACTORY_SCOPE_V1.md`

Exit criteria:

1. One agreed operator journey
2. One agreed engine doctrine
3. One agreed first recipe family

### Phase 1 — Registry Foundation

Goals:

1. Define primitive descriptor schema.
2. Define recipe descriptor schema.
3. Backfill descriptors for the highest-value packages.
4. Add CI schema validation.

Deliverables:

1. `capabilities/schema/*.json`
2. `capabilities/primitives/*.json`
3. `capabilities/recipes/*.json`
4. CI validation scripts

Exit criteria:

1. Registry is machine-readable.
2. At least one recipe is represented declaratively.
3. Invalid registry data fails CI.

### Phase 2 — Compiler and Rules

Goals:

1. Resolve recipe dependencies.
2. Enforce compatibility rules.
3. Emit deterministic provisioning plans.
4. Generate manifest expectations and smoke expectations.

Deliverables:

1. Compiler module
2. Rule engine
3. Plan schema
4. Golden tests for compiler output

Exit criteria:

1. Same recipe input always yields the same plan.
2. Invalid combinations fail with clear errors.
3. Plans include env, bindings, lineage, manifest, and smoke contracts.

### Phase 3 — Provisioning Path

Goals:

1. Extend scaffold to accept recipes.
2. Generate app structure from compiled plans.
3. Provision staging automatically.
4. Verify manifest and health output.

Deliverables:

1. Scaffold upgrade
2. Generated app template support
3. Integration tests for recipe-driven provisioning

Exit criteria:

1. One recipe provisions a real staging service.
2. Service verifies cleanly.
3. Generated output is reproducible.

### Phase 4 — Studio Catalog and Plan Preview

Goals:

1. Show primitives and recipes in Studio.
2. Show recipe requirements.
3. Show a compiled plan preview.
4. Show lineage and drift state.

Deliverables:

1. Catalog endpoints
2. Catalog UI
3. Plan preview UI
4. Lineage view

Exit criteria:

1. Operators can review a plan before provisioning.
2. Operators can understand what exists and why.

### Phase 5 — Constrained Visual Composer

Goals:

1. Mature the implemented v1 graph authoring surface into the governed desired-state and evidence surface defined in the Phase 5 Maturity Revision.
2. Keep node and relationship types constrained to registry-owned, compiler-enforced semantics.
3. Compile immutable revisions into the same plan model used by recipes.
4. Bind approved realization and trustworthy actual-state evidence back to the authored revision.
5. Preserve Supervisor, workflow, security, and production-approval boundaries.

Deliverables:

1. Versioned graph and relationship schemas
2. Immutable revisions, canonical hashes, authorization, and concurrency controls
3. Deterministic compile results and approved handoffs
4. Desired-versus-actual evidence, drift, diff, and reconciliation surfaces
5. Graph-specific automated tests and a full staging proof

Exit criteria:

1. The single-concept completion definition and stress-test matrix in the Phase 5 Maturity Revision pass.
2. Operators can author and review supported desired state visually without inventing runtime semantics.
3. Graph revisions compile into the same deterministic plan structure and execute only through approved templates/workflows.
4. No runtime, relationship, approval, or mutation semantics exist only in UI or LLM code.
5. Multi-concept composition remains locked pending a separate Phase 6 ADR.

## Governance Model

### Ownership

1. Platform owner: schemas, compiler, provisioning engine, policy rules
2. Recipe owner: each recipe family
3. Studio owner: visual and catalog surfaces
4. Service owner: generated service after provisioning

### Review model

1. Schema changes require platform review.
2. Recipe changes require platform plus recipe-owner review.
3. Provisioning changes require platform review.
4. Studio provisioning UX changes require platform plus Studio review.

### Lifecycle states

Use explicit maturity states:

1. `draft`
2. `experimental`
3. `stable`
4. `deprecated`
5. `retired`

No recipe should be treated as a stable platform primitive until it has:

1. a schema-valid descriptor
2. a full contract
3. smoke tests
4. a real provision path
5. a clear owner

## Continuous Evolution

To keep the engine continuously inventive without destabilizing production:

1. Shared packages should emit capability descriptors.
2. CI should analyze which recipes are affected by package changes.
3. Candidate upgrades should be generated in preview mode.
4. Stable promotions should remain explicit and reviewed.
5. Services should record lineage so upgrade opportunities are knowable.

The engine should auto-detect and auto-suggest. It should only auto-promote when policy allows it.

## Guardrails

### Do now

1. Define schemas.
2. Define descriptors.
3. Build one real recipe.
4. Build the compiler.
5. Build the staging-first provisioning path.
6. Build plan preview and lineage.

### Do later

1. Graph canvas
2. Graph templates
3. Candidate recipe generation
4. Upgrade recommendation UI

### Do not do in v1

1. Freeform scripting in the graph
2. Arbitrary runtime orchestration
3. Production deploy directly from unconstrained graph authoring
4. Broad recipe marketplace before one recipe family is proven

## Decision Filter

For every proposed feature, ask:

1. Does it strengthen the end-state operator flow?
2. Does it strengthen an engine invariant?
3. Does it strengthen the shared seam?
4. Can it be validated with concrete evidence?

If the answer is no to most of these, the feature is premature.

## Council Questions

The council should explicitly decide:

1. Is `outbound-dialer` the correct first recipe?
2. Which owners are accountable for platform, recipe, and Studio tracks?
3. What exact operator flow should count as the first successful thin slice?
4. Which actions require human approval versus auto-promotion?
5. What maturity threshold promotes a recipe from experimental to stable?
6. Does the Phase 5 Maturity Revision correctly preserve the golden-design prohibition on freeform graph execution?
7. What graph ownership scope and approval roles apply before Graph Composer can publish handoffs?
8. Which operations are considered destructive or externally irreversible?

## Recommended Immediate Next Steps

1. Approve a Phase 5 boundary ADR covering authority, prohibited semantics, ownership, approvals, and environment targeting.
2. Implement versioned runtime schemas, immutable revisions, canonical hashing, and optimistic concurrency.
3. Add graph compiler, route, authorization, migration, determinism, and lifecycle-state tests.
4. Bind an immutable single-concept revision through compile, approved handoff, staging provision, service binding, observation, and controlled drift.
5. Prove reversal and compensating-action behavior in staging.
6. Permit constrained Autonomous OS graph proposals only after the governed single-concept lifecycle passes its exit criteria.

Once these are approved, the program can move without semantic drift.
