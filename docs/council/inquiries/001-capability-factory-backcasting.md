# C-001 — Capability Factory Backcasting and Thin-Slice Plan

| Field | Value |
|---|---|
| Inquiry ID | C-001 |
| Title | Capability Factory backcasting and thin-slice plan |
| Author | GitHub Copilot with user direction |
| Date Opened | 2026-05-22 |
| Status | review |
| Desired Decision Date | 2026-05-23 |
| Primary Owner | capability-factory |
| Related Docs | [Capability Factory — Backcasting Plan](../..//CAPABILITY_FACTORY_BACKCASTING_PLAN.md) |

## 1. Decision Needed

Approve the build doctrine, first thin slice, and operating model for the capability-factory initiative.

## 2. Problem

Factory has a strong set of reusable packages and platform capabilities, but it does not yet have a canonical machine-readable composition layer that turns those primitives into repeatable, supportable service patterns.

Current state:

1. shared packages exist
2. app scaffolding exists
3. manifests and catalog direction exist
4. visual composition and recipe-backed provisioning do not yet exist

Why now:

1. the team wants to move from package reuse to capability composition
2. the backcasting plan has already established the intended direction
3. the next step needs council alignment before implementation expands

## 3. Recommended Path

Approve Option 3:

1. recipe-first provisioning engine first
2. one real thin slice first
3. Studio catalog and plan preview before visual composition
4. constrained composer only after the shared seam is proven

Do not approve:

1. freeform visual orchestration first
2. generalized runtime workflow engine first
3. broad recipe expansion before the first thin slice is proven

## 4. Alternatives Considered

### A. Build the visual canvas first

Pros:

1. fast demo value
2. easy to communicate conceptually

Cons:

1. high risk of UI inventing semantics
2. expensive rewrite once engine contracts harden
3. likely to produce a toy before a platform

Not recommended because the abstraction debt would be paid late and expensively.

### B. Build only the engine first

Pros:

1. strongest architecture discipline
2. highly testable core

Cons:

1. weak operator visibility early
2. risk of overbuilding the center without enough product feedback

Not recommended because it delays useful operator surfaces too long.

### C. Option 3: recipe-first with Studio preview, then constrained composer

Pros:

1. best balance of rigor and visibility
2. lets UI land on proven semantics
3. yields value before full visual composition

Cons:

1. slower to feel magical at first
2. requires restraint on v1 scope

Recommended because it reduces both semantic drift and late UI debt.

## 5. Impact

### Platform

1. adds a canonical registry and validation layer
2. adds compiler and provisioning responsibilities later

### Studio UX

1. introduces catalog and plan preview before full composition
2. creates a credible path to a visual builder

### Delivery speed

1. speeds repeatable service bootstrapping once the first recipe is proven
2. slows premature breadth by design

### Governance

1. forces explicit ownership and recipe lifecycle decisions
2. creates a durable decision trail for cross-cutting inquiries

### Maintenance

1. improves long-term maintainability if recipe scope is controlled
2. becomes costly if unsupported recipes are admitted too easily

## 6. Approval Criteria

Approval should require agreement on:

1. Option 3 as the program path
2. `outbound-dialer` as the first thin-slice candidate
3. staging-first provisioning as a hard rule
4. registry plus compiler seam before visual composition

## 7. Risks and Mitigations

1. Risk: overbuilding abstractions without operator value.
   Mitigation: require one complete thin slice early.

2. Risk: UI semantics diverge from engine semantics.
   Mitigation: make the shared seam canonical before the composer.

3. Risk: combinatorial recipe explosion.
   Mitigation: require admission criteria and owner accountability.

## 8. Council Questions

1. Is `outbound-dialer` the correct first thin slice?
2. Which team or person owns the capability-factory program?
3. What exact milestone defines “thin slice proven”?
4. Which promotions require explicit human approval?

## 9. If Approved, Next Actions

1. Stand up the canonical registry.
2. Seed the first primitive descriptors and first recipe.
3. Add validation tooling.
4. Build the first compiler inputs and plan model.
5. Add Studio catalog and plan preview after the engine seam is stable.

## 10. Outcome

### Decision

Pending council review.

### Notes

Awaiting council decision.