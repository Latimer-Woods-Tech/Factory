# Agent Team Execution Plan

**Last updated:** May 5, 2026  
**Scope:** Factory, Prime Self / HumanDesign, and VideoKing execution lanes  
**Purpose:** convert the current operational assessment into parallel lanes with live issue anchors, explicit verification, and collision control.

## Operating Rules

1. Follow the coordination rules in `docs/operations/WORKFLOW_COORDINATION_MATRIX.md`.
2. No deploy or runtime fix is complete until the live endpoint returns the expected HTTP status.
3. Each lane owns one primary bottleneck. Cross-lane reviews are allowed; cross-lane conflicting edits are not.
4. Existing claimed work stays with its current owner unless the issue is explicitly re-routed.
5. New execution should prefer existing issues over creating duplicate tracking.

## Current Command View

| Lane | Objective | Current status | Primary anchors |
|---|---|---|---|
| 1. Production Recovery | Restore broken production surfaces first | Active | VideoKing #11 |
| 2. Prime Self Release Gate | Make the live Prime Self user journey releaseable | Active | HumanDesign #120, #121, #63, #67 |
| 3. Prime Self CI Drift | Remove test and environment drift that hides production regressions | Active | HumanDesign #64 plus live smoke failures on `/dashboard` and `/sign-in` |
| 4. Factory Ops | Keep automation, supervisor, and deploy guardrails moving | Active | Factory #108, #109, #278, #279, #285, #286, #298 |
| 5. Truth Sync | Keep docs and execution state aligned with reality | Active | This document plus `docs/operations/WORKFLOW_COORDINATION_MATRIX.md` |

## Lane Breakdown

### Lane 1: Production Recovery

**Owner intent:** fix user-visible outages before deeper improvement work.

**Anchors**

- VideoKing issue #11: `P0: Production API returns 503 ServiceUnavailable (missing required env bindings)`

**Immediate actions**

1. Audit missing VideoKing production bindings and secrets against worker runtime requirements.
2. Patch deploy/runtime configuration.
3. Redeploy and verify the production API directly.
4. Add or tighten a post-deploy health gate so green CI cannot hide a dead runtime.

**Exit criteria**

- `https://api.capricast.com/health` returns `200`.
- Runtime no longer fails closed on required environment validation.
- Deploy workflow captures live health evidence.

### Lane 2: Prime Self Release Gate

**Owner intent:** make the actual user-facing Prime Self experience defensible for release.

**Anchors**

- HumanDesign #120: `feat(a11y): WCAG 2.2 AA compliance hardening`
- HumanDesign #121: `perf(bundle): mobile optimization and render-blocking improvements`
- HumanDesign #63: `[bug] /api/profile/generate returns 400 on personal blueprint page`
- HumanDesign #67: `Stripe funnel walk: verify one real checkout_session status=complete`

**Immediate actions**

1. Preserve the now-green accessibility baseline.
2. Resolve live blueprint-generation failures.
3. Verify the real payment funnel end to end.
4. Re-run mobile and authenticated user journeys against production.

**Exit criteria**

- Live blueprint generation succeeds.
- Checkout completion is observed once end to end with correct entitlement effect.
- Accessibility and world-class scans stay green after release-gate fixes.

### Lane 3: Prime Self CI Drift

**Owner intent:** align CI expectations with real production routes and browser behavior.

**Anchors**

- HumanDesign #64: `[bug] CSP blocks inline script at start=1:21`
- Known smoke drift: production `/dashboard` and `/sign-in` return `404`
- Known smoke drift: mobile login flow expectation does not match the live app contract

**Immediate actions**

1. Decide whether the route contract or the smoke tests are wrong.
2. Fix the controlling source of truth rather than patching assertions blindly.
3. Re-run the narrow smoke scope after the first route-alignment edit.
4. Keep CSP and client bootstrap fixes in the same lane because they affect test realism.

**Exit criteria**

- Production smoke targets match the live app contract.
- Mobile login flow passes with no route alias ambiguity.
- CI failures reflect real regressions instead of stale assumptions.

### Lane 4: Factory Ops

**Owner intent:** keep the factory itself unblocked, observable, and safe to operate.

**Anchors**

- Factory #108: `SUP-3.5: Daily scheduled Sauna supervisor (Phase-1)`
- Factory #109: `SUP-1.4: Migration drift detection workflow (structural fix for psn.shared_at / users.display_name class)`
- Factory #278: `feat(kpi): workflow runtime and CI cost telemetry trend`
- Factory #279: `feat(security): secret contract preflight for touched apps/workflows`
- Factory #285: `fix(admin-studio): enforce schema readiness for function_catalog and studio_audit_log`
- Factory #286: `fix(docs): make docs-quality validator deterministic and actionable`
- Factory #298: `[supervisor] 2026-05-05 run summary — template-coverage gap`

**Immediate actions**

1. Keep supervisor and digest workflows running on schedule.
2. Close hardening gaps that affect reliability of cross-repo execution.
3. Enforce deterministic docs and schema-readiness checks so deploys fail early.
4. Treat issue #298 as the current supervisory deficit list until superseded.

**Exit criteria**

- No critical workflows are stuck in `waiting` without owner action.
- The next supervisor and digest cycles complete without manual rescue.
- Hardening issues above move from reactive triage to enforced gates.

### Lane 5: Truth Sync

**Owner intent:** keep documentation, claims, and runtime evidence aligned.

**Anchors**

- `docs/operations/AGENT_TEAM_EXECUTION_PLAN.md`
- `docs/operations/WORKFLOW_COORDINATION_MATRIX.md`
- `docs/service-registry.yml`

**Immediate actions**

1. Update this plan when lane ownership or anchors change.
2. Record live verification evidence after each production-facing fix.
3. Avoid status claims that are not backed by curl or equivalent direct verification.

**Exit criteria**

- Active issues, docs, and production evidence agree.
- No lane is marked complete without direct runtime proof.

## Execution Order

1. Lane 1: VideoKing production recovery.
2. Lane 3: Prime Self smoke and route-contract alignment.
3. Lane 2: Prime Self release-gate fixes that remain after smoke drift is removed.
4. Lane 4: Factory hardening and automation reliability.
5. Lane 5: continuous truth-sync throughout every lane.

## Morning Priority Addendum (May 5, 2026)

The following briefing items are now part of the execution plan and should be handled in this order.

### Must-do before new main merges

1. Prime Self production smoke failing three mornings in a row.
2. P0 draft PR review and decision queue: Factory #326, Factory #327, Factory #315, HumanDesign #142, HumanDesign #143.
3. Verify Sentry to GitHub issue sync polling because smoke is red while Sentry is reporting zero unresolved.

### Must-do today

1. Stripe funnel read-only audit follow-up for the current pattern (billing-portal activity with zero completed checkouts and zero new customers).
2. Triage all Copilot draft PRs into P0/P1/P2/P3 and leave actionable review direction on each.
3. Close Factory #212 as duplicate of #213.

### Decision-only items (owner input required)

1. Stripe Tax mode.
2. Annual pricing copy.
3. HubSpot keep-or-delete.
4. Salesforce identity-verification follow-up from May 2.
5. Cursor GitHub App permissions.

### Lane mapping for briefing items

1. Smoke failure and Sentry sync check map to Lane 3 and Lane 4.
2. P0 PR queue and full draft triage map to Lane 4 and Lane 5.
3. Stripe funnel audit maps to Lane 2.
4. Duplicate issue cleanup maps to Lane 5.
5. External release decision memo (Cloudflare/Anthropic/Stripe changes) maps to Lane 5 after the smoke and P0 queue are stabilized.

## Automation Self-Improving Loop Schedule (Starting May 6, 2026)

This schedule operationalizes Lane 4 into a recurring improvement loop with explicit checkpoints.

### Phase 1: Control-loop stabilization

1. May 6 to May 7: add concurrency and branch-guard hardening for supervisor and auto-merge workflows.
2. May 7: verify duplicate-trigger reduction by comparing run counts and action-required noise against May 5 baseline.

### Phase 2: Failure intelligence

1. May 8 to May 10: run daily failure digest and classify failures by signature (for example auth, flaky timeout, approval gate).
2. May 10: publish first signature leaderboard and top-repeat offenders.

### Phase 3: Safe auto-remediation

1. May 11 to May 13: enable one-attempt auto-rerun for transient signatures only.
2. May 13: verify that retries reduce repeat failures without masking non-transient defects.

### Phase 4: Weekly learning cadence

1. Every Monday at 14:15 UTC: generate weekly automation reliability scorecard.
2. Every Monday: open or update follow-up hardening issues for signatures above threshold.

### Success metrics for this schedule

1. action_required runs without actionable jobs trend down week over week.
2. Migration and package-auth failures move from reactive incidents to classified events with owner routing.
3. Median recovery time and repeat-failure rate both improve week over week.

## Collision Control

1. If a lane needs the same workflow file as another lane, Lane 4 owns the edit and the other lane reviews.
2. If a lane needs the same user-facing Prime Self surface as another lane, Lane 3 establishes the route/test contract first.
3. If an issue is already claimed by `sauna`, keep that ownership unless a blocker requires explicit reassignment.
4. If an issue is already claimed by `copilot`, update the issue state before opening a duplicate.

## Immediate Activation Record

- HumanDesign execution anchors already claimed by Copilot: #120, #121, #63, #64, #67.
- Factory execution anchors already claimed or active with Copilot involvement: #108, #109, #278, #279, #285, #286, #298.
- VideoKing production recovery remains anchored on issue #11 and should stay the top-priority runtime lane until `api.capricast.com` is healthy.