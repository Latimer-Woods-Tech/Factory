# Platform Roadmap

**Loaded by:** supervisor, Claude reviewer, sub-agents · **Distilled from:** `docs/OPERATING_FRAMEWORK.md` §6-stage sequence · **Updated:** Monday weekly review

The committed 6-stage sequence. Agents reading this know which milestone is in flight, what's next, and what's deferred.

## Status as of 2026-05-15

| Stage | Status | Milestones | Exit criteria |
|---|---|---|---|
| **0 — Foundation** | ✅ shipped (PR #623, #624 merged) | M0 framework + standards + ADRs | All 5 governance docs on main, supervisor loads them |
| **1 — Visibility** | ✅ shipped (PRs #684, #687, #688, #689, #692, #696) | M1 conformance shadow + cohesion score · M2 cost digest | Daily digest shows Completion + Cohesion + Cost; nothing blocks |
| **2 — Revenue + Customer** | next | M3 Launch Readiness + Stripe MRR + PostHog funnel + Sentry user-facing error rate | Digest answers all 5 questions: shipping / shipping-right / buying / staying / affordable |
| **3 — Adoption tools** | queued | M4 `@lwt/eslint-config` + `@lwt/tsconfig-base` + `@lwt/biome-config` · M5 Renovate at org level | Every repo extends shared configs; version drift visible |
| **4 — Enforcement** | queued | M6 required org rulesets + supervisor templates expanded · M7 Definition of Done PR template | Conformance graduates shadow → required (only after most repos ≥80) |
| **5 — Sellability** | queued | M8 accessibility (axe) · M9 PII inventory + DSR endpoints · M10 public status pages | Each product survives an enterprise procurement questionnaire |
| **6 — UI/UX Foundations** | queued (parallel w/ Stages 3–5) | M11 `@lwt/ui-tokens` · M12 `@lwt/design-system` · M13 `@lwt/a11y` + `@lwt/forms` · M14 `@lwt/icons` · M15 PLATFORM_STANDARDS §12 + 11th conformance dim | Three UI-less apps (cypher-healing, xico-city, factory-admin-studio) inherit a coherent visual language by default. WCAG 2.2 AA + Lighthouse budgets enforced. |
| **Continuous** | queued | Auto-rollback canary, agent observability, prompt versioning, org-level LLM budget, BCP, ICP, pricing experiments | Ongoing |

## Current milestone (in flight)

**Stage 2 — Revenue + Customer.** Starts now (2026-05-15). Headline deliverable: the daily Pushover digest answers all 5 questions (shipping / shipping-right / buying / staying / affordable). Composite Launch Readiness Scorecard per product.

## Stage 1 — Visibility (shipped 2026-05-15)

Closed in a single push: 6 fix PRs + 2 auto-generated snapshot PRs landed on main. Live infrastructure provisioned in parallel (GCP Secret Manager IAM grant, supervisor-sa key rotation, ANTHROPIC_ADMIN_KEY).

**M1 — Conformance shadow** (✅ shipped via PRs #684, #687, #688, #689, #696)
- `.github/workflows/platform-conformance.yml` + `scripts/platform_conformance.py` (10-dimension scorer)
- First-pass cohesion scores live in `docs/conformance/` on main:
  HumanDesign 41 · videoking 24 · factory-admin-studio 29 · cypher-healing 25 · xico-city 52
- Cross-repo access via Factory App token (mirrors `completion-tracker.yml`)
- Shadow mode — scores advisory, not enforced until Stage 4

**M2 — Cost digest** (✅ shipped via same PRs)
- `.github/workflows/cost-observability.yml` + `scripts/cost_digest.py` (CF + Anthropic + Sentry + Stripe + GCP)
- Real Anthropic data flowing: $25.46 yesterday (verified live; cap at $50/day)
- Stripe Connect + balance_transactions working (no revenue yesterday)
- CF/Sentry tokens lack billing/stats scopes — separate token-permission follow-up
- GCP line is a placeholder pending BigQuery billing export

**Stage 1 infrastructure landed during close-out (not in any PR — direct config):**
- `roles/secretmanager.secretAccessor` granted to `supervisor-sa@factory-495015.iam.gserviceaccount.com`
- `ANTHROPIC_ADMIN_KEY` provisioned in GCP Secret Manager (110-char admin key, `sk-ant-admin01-*`)
- `VERTEX_SA_KEY` rotated (previous user-managed key had invalid JWT signature; new key `edd9ab3f...`)
- `scripts/fetch_gcp_secrets.sh` (new): pulls from Secret Manager, strips BOM, first-match-wins on candidate names

**P0/P1 gaps closed:**
- ✅ G3 — `dead-mans-switch.yml` heartbeat (with cold-start tolerance + post-aggregator schedule)
- ⏳ G2 — helper script unit tests (`aggregate_completion.py` etc.) — deferred to Stage 2
- ⏳ G5 — Claude reviewer calibration shadow run — deferred to Stage 2
- ⏳ G8 — LLM cost cap at org level (now visible via `total_usd` in cost digest; enforcement deferred)
- ⏳ G10 — `sentry_project` field — deferred to Stage 2

**Lessons captured** (folded into the workflows for future stages):
- `google-github-actions/auth@v3` does not set gcloud default project — every call needs `--project`
- Direct push to main is branch-protected — workflows must use PR-per-snapshot pattern with `auto-merge` label
- `git diff --quiet` doesn't see new untracked files — stage first, then `diff --cached`
- Stale service account keys fail with `invalid_grant: Invalid JWT Signature` — rotate when GCP says token is invalid despite IAM being correct
- Secret values stored from Windows editors often have a leading UTF-8 BOM — strip in the fetch helper


## Stage 6 detail (added 2026-05-11 — ADR-0008)

**Apps without UI today:** cypher-healing (API only), xico-city (scaffolding), factory-admin-studio (minimal admin). These three are the adoption targets in priority order. HumanDesign + videoking have UIs already; migration is Stage 7 (post-roadmap).

**Design philosophy (PLATFORM_STANDARDS §13):** every decision passes two filters — "What would Steve Jobs do?" (focus, simplicity, performance IS design) AND "What do people in the 2026 market want / don't want?" (dark default, skeleton states, no popups, no chatbot ambushes, native mobile).

**Cost ceiling:** $5 Anthropic for sub-agent fan-out (M11–M14 packages). $0 GitHub Actions (Factory public).

**Rollback:** unpublish packages + revert per-app adoption. ~30 min. See ADR-0008 §Rollback.

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
