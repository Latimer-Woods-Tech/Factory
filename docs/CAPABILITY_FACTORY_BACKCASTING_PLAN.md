# Capability Factory — Backcasting Plan

**Status:** Active — Phase 5 (Constrained Visual Composer) in auto-merge queue (2026-05-27)
**Date:** 2026-05-22 (last updated 2026-05-27)
**Decision context:** Option 3 selected — recipe-first provisioning engine, followed by a constrained visual composer.

## Implementation Status

The end-to-end thin slice (resolve → provision → deploy) is fully operational. Drift detection and the constrained visual composer are complete and pending final merge.

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
| Graph compiler backend | `capability_graphs` table, `graph-store.ts`, `graph-compiler.ts` (v1 constraint: exactly one concept node), graph routes (`GET/POST /capabilities/graphs`, `/:id/compile`, `/:id/handoff`), migration `0009_capability_graphs.sql` | 🔄 Auto-merge queue | #1120 |
| Phase 5 — Visual Composer | `GraphComposerTab.tsx` (1178 lines): 3-panel layout (palette / canvas / properties), drag-drop nodes, SVG edge overlay, concept param editor, compile→handoff flow | 🔄 Auto-merge queue | #1121 |

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

**Remaining work:** First real end-to-end provision run with a live handoff; drift cron validation in production; multi-concept graph support (v1 supports one concept node only).

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

1. Add a graph authoring surface.
2. Keep node/edge types constrained to supported semantics.
3. Compile graphs into the same plan model used by recipes.

Deliverables:

1. Graph schema
2. Graph UI
3. Graph compile endpoint
4. Validation overlays

Exit criteria:

1. Operators can author supported compositions visually.
2. Graphs compile into the same deterministic plan structure.
3. No runtime semantics are invented only in UI code.

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

## Recommended Immediate Next Steps

1. Approve this backcasting framework.
2. Approve the first thin-slice recipe.
3. Create the registry and schema workstream.
4. Create the compiler and provisioning workstream.
5. Create the Studio catalog and plan-preview workstream.

Once these are approved, the program can move without semantic drift.