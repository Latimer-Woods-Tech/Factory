# Workflow Registry

> Canonical classification of every workflow in this repo. Authoritative source for tier-based SLO + paging. Edits are CODEOWNER-only — see `.github/CODEOWNERS`.

**Decision ref:** [`docs/decisions/2026-05-23-workflow-lifecycle.md`](../../docs/decisions/2026-05-23-workflow-lifecycle.md)

---

## Tier definitions

| Tier | Meaning | Red-state SLO | Paging |
|---|---|--:|---|
| **T1 — Load-bearing** | Failure means production damage, security exposure, or blocked developer flow | ≤ 1h | Pushover P1 + auto-issue `priority/p0` |
| **T2 — Operational** | Failure is bad but bounded — bot loops, smoke probes, sync jobs, observability writers | ≤ 24h | Daily digest + auto-issue `priority/p1` |
| **T3 — Informational** | Failure is a missing data point, not an outage — digests, snapshots, audits | ≤ 7d | Auto-disable + auto-issue `priority/p2` |
| **TR — Reusable** | `workflow_call` only — SLO is owned by the caller |  — | n/a (failures bubble to caller) |
| **TM — Manual** | `workflow_dispatch` only — no schedule, no auto-trigger | — | n/a (failure surfaces at invocation) |

---

## Registry

CODEOWNER for all workflows is `@adrper79-dot` unless otherwise noted.

### T1 — Load-bearing (27)

| Workflow | Triggers | Notes |
|---|---|---|
| `apply-sec-hardening.yml` | schedule (hourly), dispatch | Reapplies branch protection from canonical JSON. Closes #529 incident class. |
| `codeql.yml` | push, PR, schedule, merge_group | Security analysis required by ruleset 15843812 |
| `credential-scrub.yml` | push, PR | Blocks secrets in commits |
| `ci.yml` | push, PR, merge_group | Mainline CI gate |
| `dependency-review.yml` | PR, merge_group | Supply-chain check |
| `factory-admin-ui-ci.yml` | push, PR | Storybook + Playwright e2e for admin-studio-ui |
| `package-integration.yml` | push, PR, dispatch | Cross-package smoke |
| `policy-drift-guard.yml` | schedule, dispatch | Detects branch-protection drift (paired with `apply-sec-hardening`) |
| `pr-quality-check.yml` | PR | PR-level gate (shadow mode) |
| `pr-review.yml` | PR, merge_group | 2-party bot review (Grok→Claude consensus) |
| `pr-size-guard.yml` | pull_request_target | Hard-blocks PRs exceeding ADR-0005 diff-size budgets (G9) |
| `publish.yml` | push | npm package publishing |
| `refresh-vertex-token.yml` | schedule (45min), dispatch | Vertex AI token refresh — pipeline depends on this |
| `render-video.yml` | push, PR, dispatch | Video pipeline (Capricast) |
| `rotate-admin-studio-tokens.yml` | schedule (40min), dispatch | Token rotation — review cadence in Phase 4 |
| `secret-contract-preflight.yml` | PR | Required check on PRs touching secret usage |
| `validate-service-registry.yml` | push, PR | Validates `docs/service-registry.yml` shape |
| `deploy-admin-studio.yml` | push, dispatch | Production deploy — admin-studio Worker |
| `deploy-admin-studio-ui.yml` | push, dispatch | Production deploy — admin-studio-ui Pages |
| `deploy-daily-brief.yml` | push, dispatch | Production deploy — daily-brief Worker |
| `deploy-latwoodtech-web.yml` | push, dispatch | Production deploy — latwoodtech.com Pages |
| `deploy-lead-gen.yml` | push, dispatch | Production deploy — lead-gen Worker |
| `deploy-schedule-worker.yml` | push, dispatch | Production deploy — schedule Worker |
| `deploy-supervisor.yml` | push, dispatch | Production deploy — supervisor Worker + DO |
| `deploy-synthetic-monitor.yml` | push, dispatch | Production deploy — synthetic-monitor Worker |
| `deploy-video-cron.yml` | push, dispatch | Production deploy — video-cron Worker |
| `deploy-webhook-fanout.yml` | push, dispatch | Production deploy — webhook-fanout Worker |
| `deploy-factory-core-api.yml` | push, dispatch | Production deploy — factory-core-api Worker (read-layer + auth) |
| `deploy-factory-events-replay.yml` | push, dispatch | Production deploy — factory-events-replay cron Worker (P1.10) |
| `browser-agent-deploy.yml` | push, dispatch | Production deploy — Cloud Run browser-agent |

### T2 — Operational (30)

| Workflow | Triggers | Notes |
|---|---|---|
| `adr-need-check.yml` | PR | ADR-need advisory (shadow mode) — path heuristic + Claude fallback (G11) |
| `auto-merge-approved-prs.yml` | PR, pull_request_review | Event-driven auto-merge enable |
| `auto-merge-spotter.yml` | schedule (10min), dispatch | Polling fallback — GH auto-merge does not auto-rebase BEHIND PRs |
| `automation-reliability-loop.yml` | schedule, dispatch | Self-test of automation surface |
| `cohesion-courtesy-check.yml` | schedule (3h), dispatch | Cross-repo cohesion warden |
| `completion-tracker.yml` | repository_dispatch, schedule, dispatch | Stage-completion telemetry |
| `copilot-auto-approve.yml` | PR, workflow_run | Auto-approve Copilot agent PRs |
| `copilot-pr-poller.yml` | schedule (10min), dispatch | Polling for Copilot agent PR state |
| `dead-mans-switch.yml` | schedule, dispatch | Liveness signal |
| `dependabot-security-auto-merge.yml` | pull_request_target | Auto-merges Dependabot security + patch PRs after CI green |
| `factory-status-dashboard.yml` | schedule (hourly), dispatch | Status writeup → STATE.md |
| `label-sync.yml` | issues, schedule, dispatch | Label reconciliation |
| `memory-single-writer.yml` | PR | Memory file write-coordination |
| `pr-size-warning.yml` | PR | PR size advisory (warn-only) |
| `project-sync.yml` | issue_comment, issues, PR, schedule, dispatch | GitHub Projects v2 board sync |
| `reviewer-class-hints.yml` | PR | Reviewer suggestions |
| `rfc-status-gate.yml` | PR | RFC-decision gate |
| `scripts-tests.yml` | push, PR, schedule | Tests for `scripts/` directory |
| `sentry-to-github.yml` | schedule (4h), dispatch | Sentry issue → GH issue mirror |
| `smoke-admin-studio.yml` | schedule (2h), dispatch | Smoke probe — needs `STUDIO_EMAIL/PASSWORD` |
| `smoke-prime-self.yml` | schedule (daily), dispatch | Smoke probe — selfprime.net production |
| `supervisor-loop.yml` | issues, schedule (4h), dispatch | Supervisor execution loop |
| `supervisor-template-author.yml` | issues | Supervisor template authoring |
| `sync-agent-labels.yml` | push, dispatch | Agent label sync |
| `sync-security-md.yml` | push, dispatch | SECURITY.md sync |
| `_app-prod-canary.yml` | workflow_call | Production canary (called by app deploys) |
| `_app-reliability-gate.yml` | workflow_call | Reliability gate (called by deploys) — see TR |
| `_canary-watch.yml` | workflow_call | Canary watcher (called by deploys) — see TR |
| `_migration-drift-guard.yml` | workflow_call | Migration drift detection — see TR |
| `_post-deploy-verify.yml` | workflow_call | Post-deploy verification — see TR |

### T3 — Informational (25)

| Workflow | Triggers | Notes |
|---|---|---|
| `bootstrap-completion-tracker-private.yml` | dispatch | Bootstrap helper — should likely be retired post-Phase 4 |
| `cost-observability.yml` | schedule (daily), dispatch | Cost digest → snapshot PR |
| `doc-freshness-audit.yml` | schedule (weekly), dispatch | Doc staleness check |
| `docs-health.yml` | PR, push, schedule, dispatch | Documentation control-plane catalog, self-check, registry, link, and freshness health |
| `flaky-check-report.yml` | schedule (weekly), dispatch | Flaky-test summary |
| `generate-scorecard.yml` | schedule (weekly), dispatch | Scorecard summary |
| `generate-state.yml` | push, schedule (daily), dispatch | STATE.md snapshot generator |
| `launch-readiness.yml` | schedule (daily), dispatch | Launch readiness scorecard snapshot |
| `morning-digest.yml` | schedule (daily), dispatch | Morning digest snapshot |
| `offsite-mirror.yml` | schedule (daily), dispatch | Repo mirror to off-site |
| `platform-conformance.yml` | schedule (daily), dispatch | Conformance shadow scores → snapshot PR |
| `pr-queue-digest.yml` | schedule (weekdays), dispatch | PR queue digest |
| `revenue-digest.yml` | schedule (daily), dispatch | Revenue + reliability digest |
| `track-kpis.yml` | schedule (weekly), dispatch | KPI tracker |
| `update-stack-manifest.yml` | schedule (daily), dispatch, workflow_run | STACK.md regeneration |

### TR — Reusable (12)

| Workflow | Notes |
|---|---|
| `_app-ci.yml` | App CI building block |
| `_app-ci-pnpm.yml` | App CI building block (pnpm variant) |
| `_app-deploy.yml` | App deploy building block (Workers) |
| `_app-deploy-pages.yml` | App deploy building block (Pages) |
| `_app-deploy-pnpm.yml` | App deploy building block (pnpm variant) |
| `_app-prod-canary.yml` | (also T2 — caller-context defines tier) |
| `_app-reliability-gate.yml` | (caller-context) |
| `_canary-watch.yml` | (caller-context) |
| `_docs-health.yml` | Reusable documentation control-plane health workflow |
| `_hello-reusable.yml` | Reusable example/template |
| `_migration-drift-guard.yml` | (caller-context) |
| `_post-deploy-verify.yml` | (caller-context) |

### TM — Manual (15)

`workflow_dispatch`-only — no schedule, no auto-trigger. SLO is "works when invoked."

| Workflow | Notes |
|---|---|
| `align-legacy-repos.yml` | One-off cross-repo alignment |
| `bootstrap-publish.yml` | Bootstrap publisher |
| `capricast-rename.yml` | One-off rename helper |
| `deploy.yml` | Manual deploy fallback |
| `dispatch-capability-provision.yml` | Capability provisioning dispatch |
| `generate-app-lockfiles.yml` | Lockfile generator (one of four — consider consolidating in Phase 4+) |
| `mirror-org-secrets-to-dependabot.yml` | Secret mirroring helper |
| `push-google-oauth.yml` | OAuth credential push |
| `push-neon-selfprime.yml` | Neon connection push |
| `regen-lockfile-on-branch.yml` | Lockfile regen on branch |
| `regenerate-app-lockfiles.yml` | Lockfile regen (another duplicate candidate) |
| `run-app-migrations.yml` | App migration runner |
| `run-migrations.yml` | Migration runner |
| `set-jwt-secrets.yml` | JWT secret bulk set |
| `setup-app-secrets.yml` | App secret setup |
| `setup-sentry-alerts.yml` | Sentry alert provisioning |
| `setup-project-status-options.yml` | One-time bootstrap: adds RFC-006 lifecycle Status options to the Projects v2 board (idempotent) |
| `studio-test-dispatch.yml` | Studio test dispatcher |
| `update-app-lockfiles.yml` | Lockfile update (third duplicate candidate) |
| `validate-sentry-auth-token.yml` | Sentry token validation |

---

## Retirement candidates (Phase 4 budget gate will require explicit `retires:` for new additions)

Pre-flagged for consolidation review — not deleted yet, but new additions in this space require a `retires:` reference:

- **Lockfile generators** (4 workflows): `generate-app-lockfiles`, `regen-lockfile-on-branch`, `regenerate-app-lockfiles`, `update-app-lockfiles` — likely consolidatable to 1
- **Bootstrap helpers** (2 workflows): `bootstrap-completion-tracker-private`, `bootstrap-publish` — review post-Phase 4
- `_hello-reusable.yml` — example file; retire if unused

---

## How to update this file

1. New workflow added → add a row to the appropriate tier
2. Workflow promoted/demoted between tiers → move row + add comment with date and reason
3. Workflow retired → remove row, add to a `## Retired (YYYY-MM-DD)` section at bottom
4. Changes require a PR (CODEOWNER review per `.github/CODEOWNERS`)
