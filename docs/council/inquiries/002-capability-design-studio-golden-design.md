# C-002 — Capability Design Studio Golden Design

| Field | Value |
|---|---|
| Inquiry ID | C-002 |
| Title | Capability Design Studio golden design |
| Author | GitHub Copilot with user direction |
| Date Opened | 2026-05-23 |
| Status | approved |
| Desired Decision Date | 2026-05-23 |
| Primary Owner | capability-factory |
| Related Docs | [Capability Design Studio — Golden Design](../../CAPABILITY_DESIGN_STUDIO_GOLDEN_DESIGN.md), [Capability Factory — Backcasting Plan](../../CAPABILITY_FACTORY_BACKCASTING_PLAN.md), [C-001 — Capability Factory backcasting and thin-slice plan](./001-capability-factory-backcasting.md) |

## 1. Decision Needed

Decide whether the Capability Design Studio golden design is mature enough to govern implementation of the Studio-side composition experience.

## 2. Problem

Factory now has a meaningful deterministic seam:

1. governed concepts
2. rule-based recipe selection
3. compiled catalog
4. compiled plan preview
5. Studio routes and UI seed surfaces

What is missing is a durable design doctrine for the Studio experience itself.

Current risk:

1. the implementation could drift into a decorative UI with weak confirmation boundaries
2. the implementation could overcorrect into a technical surface with no coherent operator journey
3. the team could accidentally violate C-001 by treating the design studio as a license for a freeform visual composer

Why now:

1. the hardened capability flow is now real enough to support a governing design
2. the next implementation phase will shape operator behavior, not just internal plumbing
3. the design needs council-level constraints before breadth or canvas work enters scope

## 3. Recommended Path

Approve the golden design as the governing path for the Capability Design Studio.

Approve:

1. a staged, governed design surface built on concepts, resolution, preview, and confirmed handoff
2. explicit evidence and confirmation boundaries before any scaffold or provision action
3. a maturity path that delays any visual authoring expansion until the proof gate is closed

Do not approve:

1. a freeform visual composer in the current phase
2. prompt-only or hidden provisioning flows
3. UI-driven semantics that bypass the compiled plan contract

This is the best current path because it gives the team a product truth without weakening the engine truth established by C-001.

## 4. Alternatives Considered

### A. Stay purely technical and delay design decisions

Pros:

1. keeps short-term focus on engine internals
2. reduces immediate UX decision load

Cons:

1. invites ad hoc UI layering later
2. leaves no durable operator journey doctrine
3. increases the chance that the first design surface is accidental

Not recommended because the next implementation step is already design-shaped.

### B. Approve a broad visual composer now

Pros:

1. strong demo energy
2. feels like the eventual end state sooner

Cons:

1. directly conflicts with C-001 constraints
2. encourages UI-invented semantics
3. creates large rollback and redesign risk

Not recommended because the proof gate is not closed.

### C. Approve a staged golden design for the governed design studio

Pros:

1. aligns product truth with deterministic engine truth
2. gives implementation a clear north star
3. preserves the path to future visual authoring without approving it prematurely

Cons:

1. less magical in the short term
2. requires discipline around action gating and auditability

Recommended because it is ambitious enough to guide real implementation and restrained enough to remain supportable.

## 5. Impact

### Platform

1. reinforces the compiled plan as the shared seam
2. reduces the chance of Studio-specific execution semantics

### Studio UX

1. provides a coherent staged operator journey
2. separates reversible design work from confirmed execution handoff

### Delivery speed

1. speeds alignment by eliminating design ambiguity
2. slows premature canvas work by design

### Governance

1. gives future design-studio scope changes a clear baseline to compare against
2. keeps the council’s existing C-001 conditions intact

### Long-term maintenance

1. lowers rework risk by constraining where semantics live
2. improves explainability and auditability of operator actions

## 6. Approval Criteria

Approval should require agreement that:

1. the design studio remains concept-driven, not primitive-driven
2. compiled plan preview is mandatory before scaffold or provision handoff
3. staging-first and explicit confirmation remain hard constraints
4. no freeform visual composition is implied by this approval
5. the design can serve as a golden implementation target until superseded

## 7. Risks and Mitigations

1. Risk: the design becomes too rigid for later evolution.
   Mitigation: allow later council-approved expansion after the proof gate is closed.

2. Risk: the design studio quietly acquires mutation actions without enough review.
   Mitigation: require explicit confirmation boundaries and audit metadata for every infrastructure-affecting step.

3. Risk: the team interprets “design studio” as approval for a canvas.
   Mitigation: state the non-goals and prohibited scope directly in the golden design.

4. Risk: implementation diverges from the document.
   Mitigation: treat the golden design as authoritative until superseded and send conflicts back to council.

## 8. Council Questions

1. Is the staged studio flow strict enough to prevent UI semantic drift?
2. Is the proof gate for later visual authoring explicit enough?
3. Are the confirmation boundaries strong enough for scaffold and provision actions?
4. Should this design be treated as the golden design for implementation until replaced?

## 9. If Approved, Next Actions

1. Treat the golden design as the implementation north star for the Capabilities tab evolution.
2. Add confirmed handoff actions on top of the existing resolve and preview path.
3. Keep route and UI coverage aligned with the staged design transitions.
4. Bring any future canvas or graph-authoring proposal back as a separate council inquiry.

## 10. Outcome

### Decision

Approved on 2026-05-23.

### Notes

The council approves the Capability Design Studio golden design as the governing design for the Studio-side capability composition experience.

Conditions of approval:

1. The golden design inherits all relevant C-001 constraints.
2. The design studio remains concept-driven and preview-first.
3. No freeform visual composer, primitive graph editor, or prompt-only provisioning flow enters scope under this approval.
4. Scaffold and staging-provision actions must remain behind explicit confirmation and audit boundaries.
5. Any future visual authoring expansion requires a new council inquiry after the proof gate is closed.

Recorded rationale:

1. The registry, resolver, preview, and Studio seed surfaces are now real enough to support a governing design.
2. The design is sufficiently mature to guide implementation without weakening the engine doctrine.
3. Treating this as the golden design reduces ambiguity and design drift in the next implementation phase.