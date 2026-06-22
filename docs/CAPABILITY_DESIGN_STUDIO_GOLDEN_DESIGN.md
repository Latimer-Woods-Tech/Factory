# Capability Design Studio — Golden Design

**Status:** Council-approved golden design  
**Date:** 2026-05-23  
**Scope:** Admin Studio design surface for capability selection, parameterization, preview, and governed handoff

## Purpose

This document defines the canonical design for the Capability Design Studio inside Admin Studio.

It is the first design that is allowed to drive implementation of the Studio-side composition experience. It exists to prevent two failure modes:

1. building a visually compelling surface that invents semantics outside the registry and compiler
2. building a technically correct surface that has no coherent operator journey

The golden design is constrained on purpose. It is not a freeform canvas. It is a governed design-and-handoff flow on top of the deterministic capability registry.

## Design Decision

Factory will implement the Capability Design Studio as a staged, governed composer with five operator steps:

1. choose a governed capability concept
2. configure only approved parameters
3. preview the compiled plan and selected recipe rationale
4. review risk, evidence, and proof-gate expectations
5. hand off to scaffold and provision actions only after explicit confirmation

Factory will not implement, in the first maturity path:

1. a freeform node canvas
2. arbitrary drag-and-drop primitive composition
3. prompt-only service generation
4. hidden automatic provisioning without plan review

## Product Truth

The operator journey is:

1. open the Capability Design Studio from Admin Studio
2. inspect approved concepts, not raw primitives
3. configure the concept using explicit parameter controls
4. see which recipe variant was chosen and why
5. inspect the compiled plan preview, expected surfaces, contracts, and proof gates
6. confirm the handoff to scaffold and staging provision
7. later inspect lineage, drift, and upgrade posture from the same artifact chain

That journey is the design truth. Every UI element should strengthen it or be removed.

## Design Principles

1. Registry first: the design surface renders governed registry state, it does not invent architecture.
2. Explainability over magic: the chosen recipe, matched rule, and next step must always be visible.
3. Staging first: the surface must reinforce that capability instantiation begins in staging.
4. Proof before breadth: every concept flow should terminate in evidence, not just intent.
5. One seam: the same compiled plan contract must be used by CLI, Studio preview, scaffold, and provision flows.
6. No silent escalation: any step that mutates infrastructure must require explicit operator confirmation.

## System Model

The design studio sits on top of five deterministic layers:

1. `primitives/` — technical substrate
2. `recipes/` — approved deployable compositions
3. `concepts/` — operator-facing menu and parameter contract
4. compiled catalog — read model for Studio
5. compiled plan — execution and preview model

The design studio is not an additional source of truth.

## Screen Architecture

The design studio should be implemented as a staged workspace with four persistent regions.

### 1. Concept rail

Purpose:

1. browse approved concepts
2. compare maturity, tags, and approval tier
3. anchor the current task to a governed object

Behavior:

1. default to menu-visible concepts only
2. sort by operator relevance first, alphabetically second
3. show approval tier and maturity at a glance

### 2. Configuration panel

Purpose:

1. collect allowed parameter inputs
2. constrain the operator to schema-backed controls
3. make defaults explicit

Behavior:

1. controls are derived from concept parameter schema
2. enum values become selects
3. booleans become toggles
4. free text remains typed inputs with format hints
5. unknown inputs are impossible from the UI

### 3. Resolution and preview panel

Purpose:

1. explain the selected recipe and routing rule
2. show the compiled plan preview and expected surfaces
3. expose next-step readiness

Behavior:

1. always show selected recipe id
2. always show routing strategy and matched rule when present
3. show expected surfaces and smoke expectations from the compiled plan
4. show required secrets, vars, and bindings in preview form

### 4. Action rail

Purpose:

1. separate reversible design work from irreversible provisioning work
2. make confirmation boundaries explicit

Behavior:

1. `Resolve` is reversible
2. `Preview Plan` is reversible
3. `Generate Scaffold Handoff` requires confirmation
4. `Provision to Staging` requires confirmation and proof-gate acknowledgement

## Interaction Model

The design studio state machine is:

1. `browse`
2. `configure`
3. `resolved`
4. `previewed`
5. `confirmed-for-handoff`
6. `staging-provision-requested`

Allowed transitions:

1. `browse -> configure`
2. `configure -> resolved`
3. `resolved -> previewed`
4. `previewed -> configure` when inputs change
5. `previewed -> confirmed-for-handoff`
6. `confirmed-for-handoff -> staging-provision-requested`

Disallowed transitions:

1. `browse -> staging-provision-requested`
2. `configure -> staging-provision-requested`
3. `resolved -> staging-provision-requested` without preview

## Mandatory Visible Evidence

Before any infrastructure-affecting action is enabled, the surface must show:

1. selected concept id
2. selected recipe id
3. routing rule id or explicit default fallback
4. expected surfaces
5. smoke expectations
6. required environment contract
7. staging-first note

## Handoff Contract

The first production-ready handoff from the design studio is not direct provisioning. It is a governed handoff package containing:

1. resolved concept
2. normalized parameters
3. selected recipe id
4. compiled plan
5. preview markdown
6. next action metadata

That handoff package must be consumable by:

1. CLI scripts
2. Admin Studio server routes
3. scaffold generator
4. later provisioning workflows

## Maturity Path

### Stage A — Governed Resolver ✅ Complete (PR #910, 2026-05-23)

Delivered:

1. concept catalog
2. parameter form generation
3. rule-based recipe selection
4. plan preview route

### Stage B — Confirmed Handoff ✅ Complete (PR #910, 2026-05-23)

Delivered:

1. scaffold handoff endpoint
2. explicit confirmation UX
3. audit record for design-to-handoff transition

### Stage C — Staging Provision Control ✅ Complete (PRs #910 + feat/studio-stage-d, 2026-05-23)

Delivered:

1. `POST /capabilities/provision-staging` — inserts `capability_provision_requests` row with proof-gate validation; returns 201
2. proof-gate checklist panel in the UI (five gates: `reviewedPlan`, `reviewedEnvContract`, `reviewedSmokeChecks`, `acknowledgedStagingFirst`, `acknowledgedCustomDomain`)
3. `GET /capabilities/handoffs` + `GET /capabilities/handoffs/:id` — lineage and direct lookup
4. `GET /capabilities/provision-requests` + `GET /capabilities/provision-requests/:id` — lineage and direct lookup for evidence polling
5. `POST /capabilities/provision-requests/:id/transition` lifecycle state machine
6. `.github/workflows/dispatch-capability-provision.yml` — operator-triggered `workflow_dispatch` that fetches the handoff via the dedicated `/handoffs/:id` endpoint, transitions the request to `dispatched`, runs `scaffold.mjs`, and uploads the scaffolded tree as a GitHub Actions artifact
7. **Deployment Evidence Panel** in Studio UI — polls `GET /capabilities/provision-requests/:id` every 8 seconds and renders live status, lifecycle timeline, and scaffold notes after a provision request is submitted. Transitions stop on terminal states (`succeeded`, `failed`, `withdrawn`). This closes the Stage C proof gate: staging provision evidence is now visible in Studio.

**dispatch-capability-provision.yml is the intentional Stage C bridge.** An operator confirms proof gates in Admin Studio, triggering the `requested` row; then manually invokes this workflow with the `provision_request_id` and `handoff_id`. The scaffold artifact is uploaded for review before any deploy step runs. Stage D adds a scheduled poller to replace the manual invocation.

Required secrets (set via `wrangler secret put` or GitHub Secrets):
- `STUDIO_API_BASE` — e.g. `https://admin-staging.latwoodtech.work`
- `STUDIO_DISPATCH_TOKEN` — admin-tier JWT (short-lived, rotated)

### Stage D — Constrained Visual Authoring ✅ Approved and In Progress (feat/studio-stage-d, 2026-05-23)

The Stage C proof gate is closed. Stage D is approved:

1. the concept registry is validated in CI ✅
2. the compiled catalog is regenerated deterministically ✅
3. Studio can resolve and preview at least one concept end to end ✅
4. scaffold handoff uses the same compiled plan contract ✅
5. staging provision evidence is visible in Studio ✅ (Deployment Evidence Panel)
6. route and UI regressions exist for the design surface ✅

Delivered in Stage D (feat/studio-stage-d, commits df0ee836 + 884f1056):

1. **Tag-based concept filtering** — filter rail above the concept list lets operators narrow by tag (`telephony`, `llm`, `video`, etc.) without leaving the studio
2. **Guided composition templates** — each concept ships pre-configured parameter sets in the registry JSON; templates pass through `compile.mjs` into the catalog; UI reads from catalog, removing the hardcoded `CONCEPT_TEMPLATES` constant
3. **Maturity badges** — color-coded tier badges (`stable` green, `beta` blue, `experimental` amber) on every concept card and in the detail header for at-a-glance upgrade posture
4. **Recipe version badges** — `compile.mjs` cross-references recipe files to inject `version` into concept recipe summaries; concept list cards and detail header show `vX.Y.Z`
5. **Expanded concept registry** — three new production concepts covering the actual portfolio: `prime-self-api` (Human Design API), `capricast-video-api` (video publishing), `cypher-healing-api` (healing voice agent), with three new recipes and three new primitives (`auth`, `stripe`, `video`)
6. **Deployment Evidence Panel** — closes Stage C proof gate; auto-polls and renders lifecycle timeline, status badge, and scaffold notes
7. **Concept lineage history panel** — collapsible `ConceptHistoryPanel` fetches `GET /capabilities/handoffs?conceptId=X&limit=5` on expand and renders past handoffs with recipe id and creation date
8. **Auto-dispatch scheduled poller** — `.github/workflows/auto-dispatch-provision.yml` runs every 15 minutes, fetches pending provision rows, resolves concept id via `/capabilities/handoffs/:id`, and calls `gh workflow run dispatch-capability-provision.yml` — replaces the manual `workflow_dispatch` step

Remaining Stage D work (no council approval needed — expansion unlocked):

1. concept upgrade lifecycle signal when a recipe version advances

The constrained Graph Composer is an adjacent governed surface, not ordinary Stage D expansion. Its v1 implementation may remain available for exploration, but publishing graph revisions, assigning relationship semantics, binding actual state, or enabling autonomous proposals requires the Phase 5 boundary ADR and maturity gates in `CAPABILITY_FACTORY_BACKCASTING_PLAN.md`.

## Non-Goals

This golden design explicitly excludes:

1. arbitrary primitive mixing by operators
2. visual node graph execution semantics; Graph Composer may describe registry-owned relationships and desired state, but may not define or execute arbitrary control flow
3. autonomous app creation from natural language alone
4. production-first provisioning
5. hidden environment mutation behind a single click

## Proof Gate for Design Studio Expansion

The design studio is only allowed to expand beyond staged preview and handoff when all of the following are true:

1. the concept registry is validated in CI
2. the compiled catalog is regenerated deterministically
3. Studio can resolve and preview at least one concept end to end
4. scaffold handoff uses the same compiled plan contract
5. staging provision evidence is visible in Studio
6. route and UI regressions exist for the design surface

## Implementation Guidance

Implementation should proceed in this order:

1. keep the current Capabilities tab as the seed surface
2. add a reviewable handoff artifact before any mutate action
3. wire scaffold and staging provision behind explicit confirmation
4. add richer layout and interaction only after the proof gate closes

## Governing Rule

The golden design is authoritative until superseded by a later council decision.

If implementation pressure conflicts with this document, the design does not bend silently. The conflict must go back to council.
