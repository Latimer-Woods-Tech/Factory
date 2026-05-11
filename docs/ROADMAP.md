# Platform Roadmap

**Loaded by:** supervisor, Claude reviewer, sub-agents · **Distilled from:** `docs/OPERATING_FRAMEWORK.md` §6-stage sequence · **Updated:** Monday weekly review

The committed 6-stage sequence. Agents reading this know which milestone is in flight, what's next, and what's deferred.

## Status as of 2026-05-11

| Stage | Status | Milestones | Exit criteria |
|---|---|---|---|
| **0 — Foundation** | ✅ shipped (PR #623, #624 merged) | M0 framework + standards + ADRs | All 5 governance docs on main, supervisor loads them |
| **1 — Visibility** | next | M1 conformance shadow + cohesion score · M2 cost digest | Daily digest shows Completion + Cohesion + Cost; nothing blocks |
| **2 — Revenue + Customer** | queued | M3 Launch Readiness + Stripe MRR + PostHog funnel + Sentry user-facing error rate | Digest answers all 5 questions: shipping / shipping-right / buying / staying / affordable |
| **3 — Adoption tools** | queued | M4 `@lwt/eslint-config` + `@lwt/tsconfig-base` + `@lwt/biome-config` · M5 Renovate at org level | Every repo extends shared configs; version drift visible |
| **4 — Enforcement** | queued | M6 required org rulesets + supervisor templates expanded · M7 Definition of Done PR template | Conformance graduates shadow → required (only after most repos ≥80) |
| **5 — Sellability** | queued | M8 accessibility (axe) · M9 PII inventory + DSR endpoints · M10 public status pages | Each product survives an enterprise procurement questionnaire |
| **Continuous** | queued | Auto-rollback canary, agent observability, prompt versioning, org-level LLM budget, BCP, ICP, pricing experiments | Ongoing |

## Current milestone (in flight)

**Stage 1 — Visibility.** Started: pending PR #622 merge. Exit target: end of week 2026-05-18.

**M1 sub-tasks** (sub-agent fan-out per ADR-0004):
- A — `platform-conformance.yml` workflow (nightly + on-PR, shadow mode only)
- B — `scripts/platform_conformance.py` parser + scorer (10 dimensions per PLATFORM_STANDARDS)
- C — Extend `scripts/aggregate_completion.py` with cohesion-score column + per-dimension display
- D — Conformance fixture data + first-pass calibration against HD (already 70%+) and the 4 newer repos

**M2 sub-tasks**:
- A — `cost-observability.yml` workflow + `scripts/cost_digest.py` (CF + Anthropic + Sentry + Stripe + GCP)
- B — Org-level LLM cap in `@lwt/llm-meter` (closes G8)
- C — Pushover digest format update (incorporates cost line)

**P0/P1 gap fixes folded into Stage 1** (per GAP_REGISTER):
- G2 — unit tests for `aggregate_completion.py`, `init-matrix-issues.py`, `sync_labels_to_matrix.py` (coverage ≥80%)
- G3 — `dead-mans-switch.yml` heartbeat
- G5 — Claude reviewer calibration shadow run on last 50 PRs
- G8 — LLM cost cap at org level (above)
- G10 — `sentry_project` field added to FUNCTIONS_MATRIX schema; aggregator queries per-project

**Cost ceiling:** $50 Anthropic + $0 GitHub Actions (Factory public)

**Rollback:** delete the new workflows + revert PR. No production impact (shadow mode).

## Stage 2 preview

Once Stage 1 ships, Stage 2 begins. Headline deliverable: **the daily Pushover digest answers all 5 questions** (shipping / shipping-right / buying / staying / affordable). Composite Launch Readiness Scorecard per product.

## Deferred decisions (not blocking)

- ICP clarity per product (Stage 2 strategic work)
- Pricing experiments (Stage 2+)
- Customer support tool integration (Stage 2)
- Pen-test + bug-bounty (out of roadmap until thresholds hit — see GAP_REGISTER P3)

## What this roadmap deliberately doesn't include

- Net-new product features. The roadmap is platform work; product features happen inside repos and ride on top of this layer.
- Marketing / sales / GTM strategy. Tracked separately; surfaced in the quarterly customer gate.
- Anything that changes FRIDGE.md rules. Those require a separate ADR superseding the current FRIDGE.

## Conventions for sub-agents reading this

When you start a milestone:
1. Read this file to confirm you're working in the correct stage.
2. Read `GAP_REGISTER.md` for related open gaps to fold in.
3. Read `PLATFORM_STANDARDS.md` for the constraints your PR must satisfy.
4. Read the relevant ADRs.
5. Open atomic PRs (per ADR-0005 size budget).
6. Each PR posts a comment linking back to the milestone in this roadmap.

When you finish a milestone:
1. Update this file: mark stage `shipped`, link the merged PRs.
2. Update `GAP_REGISTER.md`: close any gaps that this milestone closed.
3. Kick off the next stage per the sequence above.

This file is the contract between the operator and the agents about what's next.
