---
date: 2026-06-08
decider: "@adrper79-dot"
status: decided
---

# 2026-06-08 — Admin Studio surface & responsibility boundary

> Scope note: this is the *short* boundary record. The multi-package **enforcement**
> work (consolidating policy evaluation, collapsing UI tabs onto one contract) is
> architecture-grade and may warrant a full [RFC](../rfc/) before implementation.

## Decision

**Admin Studio is one product with separate surfaces and a fixed ownership boundary; the API is authoritative and the UI only collects intent.** "factory-admin" is a legacy/secondary deployment surface of this same product — not a distinct product.

## Context

The platform has several "admin" artifacts — `apps/admin-studio` (API), `apps/admin-studio-ui` (UI), `packages/studio-core`, and the older standalone `Latimer-Woods-Tech/factory-admin` repo. They were being treated (including by the Platform Brain entity graph) as if some were duplicate or competing products. They are not: they are surfaces/components of one product, Admin Studio, whose boundary was documented in planning but only partially enforced in code — responsibility has leaked across the UI/API line.

## Why

The governing rule already exists (`04-MATURITY-AND-COHESION-PLAN.md` line 82): *"The API is authoritative. The UI explains and collects intent but does not calculate authoritative outcomes."* Leaks across this line (UI deciding authorization, inferring success from HTTP 200, duplicating policy per tab) silently corrupt the system — the same failure class §1.4.1 of the Admin Technical Guide warns about.

## Ownership boundary (authoritative)

| Surface | Owns |
|---|---|
| `packages/studio-core` | Stable action, policy, receipt, confirmation, environment, and error **contracts** |
| `apps/admin-studio` (Admin Studio **API**) | Auth, authorization, policy decisions, execution-time validation, mutations, orchestration, audit, receipt identity |
| `apps/admin-studio-ui` (Admin Studio **UI**) | Operator workflows, previews, confirmation collection, status presentation, error explanation, evidence navigation |
| Domain systems / workflows | The actual state machines: deployments, payouts, provisioning, GitHub workflows, runtime evidence |
| Supervisor | Autonomous proposal + approved-template scheduling — **not** another Admin UI |

**Flow:** operator intent → UI gathers inputs + preview ack + confirmation → API authenticates and re-evaluates policy → API creates action request / receipt → domain executor performs the mutation → API links audit + workflow + evidence → UI renders the result.

**The UI must never:** decide true authorization; decide reviewer separation; generate authoritative approval records; infer mutation success from HTTP 200; directly call GitHub/Stripe/Neon/Cloudflare/provisioners; reimplement domain state machines.

**The API must not:** own page layout or interaction sequencing; return presentation-specific structures; duplicate domain execution that belongs in Supervisor/provisioners; become the permanent source of truth for deployment/payout/runtime state.

## Naming (standardized)

- **Admin Studio** — the complete operator product.
- **Admin Studio API** — `apps/admin-studio`.
- **Admin Studio UI** — `apps/admin-studio-ui`.
- **Admin surface** — the broader platform category, including per-app `/admin/*` APIs.
- **Supervisor** — autonomous proposal/execution scheduler (not an Admin UI).
- **"Factory Admin" / `factory-admin`** — retired name; a legacy deployment surface to fold into the above.

## Consequences

We now do:
- Treat `factory-admin` as an Admin Studio surface in the sense layer (aliased to `admin-studio`; not ticketed for its own registry; not scored as a peer in conformance) and plan to fold/retire it in favor of the monorepo API + UI.
- Hold the API-authoritative invariant: the UI submits typed action requests; the API admits actions and creates receipts.

Enforcement backlog (each leak below to be closed; sequencing TBD, possibly via RFC):
1. **Policy evaluation exists once, server-side** — catalog `canInvoke` and route `requireConfirmation` must not diverge.
2. **One action executor + one shared client contract** — UI tabs (Tests, Code, Flags, AI, Capabilities, Graph Composer, Functions, Command Center) consume one generated contract instead of each reimplementing action lookup/confirmation/error UI.
3. **Command Center owns prioritization; domain tabs own detailed workflows** — remove overlap.
4. **Static UI read models** (Apps, Council JSON) become API-owned read models or are explicitly classified as generated static artifacts.

We do NOT:
- Move `apps/admin-studio` out to its own repo. The monorepo trio (studio-core + API + UI) is canonical; relocating is not the goal — enforcing the boundary is.

## Revisit when

- Someone proposes a second operator UI, or the enforcement backlog is scheduled (promote to a full RFC at that point), or `factory-admin` is actually archived/folded.
