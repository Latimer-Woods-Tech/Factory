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

### Stage A — Governed Resolver

Already real or in progress:

1. concept catalog
2. parameter form generation
3. rule-based recipe selection
4. plan preview route

### Stage B — Confirmed Handoff

Add:

1. scaffold handoff endpoint
2. explicit confirmation UX
3. audit record for design-to-handoff transition

### Stage C — Staging Provision Control

Add:

1. staging provision request
2. proof-gate checklist panel
3. surface for deployment evidence and smoke outcomes

### Stage D — Constrained Visual Authoring

Only after Stage C is stable:

1. visual grouping and layout affordances
2. guided composition over supported concepts
3. no freeform primitive graph authoring unless separately approved

## Non-Goals

This golden design explicitly excludes:

1. arbitrary primitive mixing by operators
2. visual node graph execution semantics
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