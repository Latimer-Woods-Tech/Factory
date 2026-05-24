---
date: 2026-05-23
decider: adrper79-dot
status: proposed
supersedes: none
---

# 2026-05-23 — Workflow Lifecycle & Automation Hygiene

The Factory CI/automation surface is structurally sound but operationally undisciplined. This decision installs a lifecycle, a tiering model, and an enforcement mechanism so the surface stays healthy as it grows.

---

## Summary

Factory has **95 workflows** producing **~280 runs/day**, with **~5 Tier-1 workflows currently red on `main` and no paging response**, **8 of 27 open PRs sitting unmerged as stale bot snapshots**, and **47 workflows missing `concurrency:` controls**. The architecture is correct. The lifecycle is missing. This decision adds the lifecycle.

We are **not** ripping up the supervisor loop, the auto-merge triangulation, the snapshot-PR pattern, or the security-hardening workflows. We are adding the discipline that turns "fire-and-forget automation" into "fire-and-self-heal automation."

---

## Empirical findings (2026-05-23)

| # | Finding | Source |
|---|---|---|
| F1 | 95 workflows, 34,750 lifetime runs, ~280 runs/day | `gh api .../actions/runs` aggregate |
| F2 | 21 workflows fire on `pull_request` — a single PR triggers ~13 checks | `grep -l "pull_request" .github/workflows/*.yml` |
| F3 | 32 scheduled workflows produce ~400 cron runs/day before any push activity | `grep -E "cron:" .github/workflows/*.yml` |
| F4 | 47 of 95 workflows have no `concurrency:` block → cancelled-run noise on rapid pushes | `grep -L "concurrency:" .github/workflows/*.yml \| wc -l` |
| F5 | `apply-sec-hardening` failing at `Checkout` step for ≥6h with no page (Tier-1: it's the repair arm for [#529]) | Latest run job-steps API |
| F6 | `factory-admin-ui-ci` startup_failure on every push (14/day, all red) | `gh run list --workflow=factory-admin-ui-ci.yml` |
| F7 | `smoke-admin-studio` failing every scheduled run (every 2h, all red) | Same |
| F8 | 8 of 27 open PRs are bot snapshots in `BEHIND` + `REVIEW_REQUIRED` state with `autoMerge: null` (snapshot cron does not enable auto-merge) | `gh pr view 902,909,915 --json mergeStateStatus,reviewDecision,autoMergeRequest` |
| F9 | `docs/STATE.md` is dated 2026-05-21; today is 2026-05-23 — 2-day staleness caused by F8 | Read of `docs/STATE.md` line 5 |
| F10 | Workflows sub-score 33/100 across most repos in `docs/conformance/summary.md` — the lowest dimension | `docs/STATE.md` Cohesion table |
| F11 | `allowed_actions: "all"`, `sha_pinning_required: false` at org/repo policy level | `gh api repos/.../actions/permissions` |

---

## Decision

Adopt a six-pillar workflow lifecycle, implemented over four phases. Each pillar has an explicit owner artifact, an executable enforcement mechanism (where feasible), and a measurable acceptance criterion.

### Pillar 1 — Tiered SLO + paging
Every workflow is classified Tier-1 / Tier-2 / Tier-3 in `.github/workflows/REGISTRY.md`. Red-state SLO is matched to tier:

| Tier | Examples | Red SLO | Paging response |
|------|----------|--------:|---|
| **1 — Load-bearing** | `apply-sec-hardening`, `credential-scrub`, `codeql`, `deploy-*`, `policy-drift-guard`, `validate-service-registry`, `ci` | ≤ 1h | Pushover P1 + auto-issue `priority/p0` |
| **2 — Operational** | `factory-status-dashboard`, `cohesion-courtesy-check`, `auto-merge-spotter`, `copilot-pr-poller`, `supervisor-loop`, smoke probes | ≤ 24h | Daily digest entry + auto-issue `priority/p1` |
| **3 — Informational** | snapshot crons (cost, revenue, state, conformance, scorecard, completion-tracker), `morning-digest`, `pr-queue-digest`, `flaky-check-report` | ≤ 7d | Auto-disable schedule via `gh workflow disable` + auto-issue |

### Pillar 2 — Auto-quarantine for chronic failures
A meta-workflow (`workflow-health-warden.yml`) runs daily and, for any scheduled workflow with ≥10 consecutive failed runs:
1. Disables its schedule via `gh workflow disable`
2. Opens an issue labeled `workflow-quarantined` and `priority/p1` against the workflow's CODEOWNER
3. Posts to Pushover with the offending workflow + last error step

This is the load-bearing change. It converts "broken workflows are silent" into "broken workflows self-amputate."

### Pillar 3 — Snapshot PR auto-merge contract
For PRs that touch ONLY paths in an allowlist (`.github/snapshot-paths.yml`), the opening cron must:
1. Open the PR
2. Approve from `factory-cross-repo[bot]` (already a bypass actor on ruleset 15843812)
3. Enable `gh pr merge --auto --squash`

Snapshot allowlist (initial):
```yaml
paths:
  - docs/STATE.md
  - docs/cost/**
  - docs/conformance/**
  - docs/launch-readiness/**
  - docs/digests/**
  - docs/revenue/**
  - completion-tracker.json
```

A PR touching anything outside the allowlist falls back to standard human-review. The allowlist itself requires a CODEOWNER PR to expand. This is the only place this decision changes review semantics — the change is bounded, audited, and reversible (delete the allowlist entry to restore review).

### Pillar 4 — Workflow budget gate
A required check (`workflow-budget-check`) triggers when `.github/workflows/**.yml` changes. The PR body must contain one of:
- `retires: <existing-workflow.yml>` (and the file must be deleted in the same PR), OR
- `budget-exception: <reason>` (and a CODEOWNER must `✅` the PR)

This is the discipline that prevents the 95→150→200 trajectory. LIFO retirement is the default; exceptions are explicit and on the record.

### Pillar 5 — Concurrency hygiene as a typecheck
A required check (`workflow-concurrency-check`) validates that every workflow with a `pull_request:` or `push:` trigger has a `concurrency:` block. Initial migration is a single PR fixing all 47 missing blocks.

### Pillar 6 — Visible Tier-1 health dashboard
Extend `factory-status-dashboard.yml` to surface Tier-1 red state at the top of `docs/STATE.md`. A single line: "Tier-1 red workflows: 0 (✓) | Last quarantine: 7d ago | Snapshot PR backlog: 0". When that line is anything other than `0 (✓)`, the human has the signal without hunting.

---

## Why

**Why tiering, not deletion.** Each workflow exists because of a documented incident or pattern (`#529` for `apply-sec-hardening`, GitHub's auto-merge rebase gap for `auto-merge-spotter`, etc.). Deleting them re-opens the gaps they close. Tiering is the right primitive: it tells the operator which alerts are pageable.

**Why auto-quarantine.** A scheduled workflow that has failed 10 consecutive times is producing no signal — it's only producing noise and consuming the credibility of every other alert. Quarantining it preserves the option to re-enable while forcing the broken-window into the human's attention queue.

**Why a budget gate, not periodic cleanup.** Periodic cleanup never happens; the workflow that was urgent yesterday is normal today. LIFO-with-exception is the only pattern that holds.

**Why concurrency-as-typecheck.** It's mechanical, has zero design space, and every push without it leaks compute. Once added, the rule maintains itself.

**Why snapshot auto-merge.** Bot review of bot-generated digest data is theater. The choice is: auto-merge it (with a bounded allowlist), commit it directly (loses the auditable PR trail), or stop generating it (loses the data). Auto-merge with allowlist is the only choice that keeps both the audit trail and the operator's time.

---

## Implementation plan

Four phases. Each phase is a single PR (or small PR series), independently shippable, with an explicit Definition of Done. Phases land in order; we do not begin Phase N+1 until Phase N is green on `main`.

### Phase 0 — Stop the bleeding (this PR's pre-work, hours)

Independent of the lifecycle work, the existing red Tier-1 state is an open exposure window.

| Action | Definition of Done |
|---|---|
| Diagnose & fix `apply-sec-hardening` Checkout failure | Workflow green on next scheduled run; verified via `gh run view` |
| Diagnose & fix `factory-admin-ui-ci` startup_failure | Workflow green on next push to `main`; verified via `gh run view` |
| Diagnose `smoke-admin-studio` failure (signal vs. workflow bug) | Either prod-side issue filed (signal) or workflow fix landed (bug); decision documented in run summary |
| Manually clear the 8-PR snapshot backlog (approve + merge or close-as-superseded) | `gh pr list` shows zero `chore/{state,cost,revenue,scorecard,conformance,morning-digest,completion-tracker}-snapshot` PRs older than 24h |

**Phase 0 is not optional. It happens before Phase 1 lands** — otherwise we're enforcing tiers against a baseline that's already in violation.

### Phase 1 — Tier registry + concurrency baseline (1 PR, ~3h)

**Files created/modified:**
- `.github/workflows/REGISTRY.md` (new) — table of all 95 workflows, tier assignment, CODEOWNER, retirement notes
- `.github/workflows/_workflow-concurrency-check.yml` (new) — validator that fails when a `push:` or `pull_request:` workflow lacks `concurrency:`
- All 47 workflows missing `concurrency:` — single mechanical PR adds the standard block:
  ```yaml
  concurrency:
    group: ${{ github.workflow }}-${{ github.ref }}
    cancel-in-progress: true
  ```
- `.github/CODEOWNERS` — add `/.github/workflows/REGISTRY.md @adrper79-dot` to lock the registry to CODEOWNER edits

**Definition of Done:**
- [ ] REGISTRY.md classifies all 95 workflows (Tier-1: ~12, Tier-2: ~25, Tier-3: ~58 by current estimate)
- [ ] `workflow-concurrency-check` passes on a sample PR touching no workflow files
- [ ] `workflow-concurrency-check` fails on a deliberately-broken test PR (manual verification)
- [ ] All 47 listed workflows have concurrency blocks
- [ ] Merge does not break any existing green workflow

**Rollback:** Revert the PR. Concurrency blocks are pure addition; removing the check restores prior behavior.

### Phase 2 — Snapshot PR contract + backlog drain (1 PR, ~3h)

**Files created/modified:**
- `.github/snapshot-paths.yml` (new) — the allowlist
- `.github/scripts/snapshot-pr-helper.mjs` (new) — helper invoked by each snapshot cron after opening a PR: validates paths against allowlist, approves via `factory-cross-repo[bot]`, enables auto-merge. Refuses to act on PRs that touch out-of-allowlist paths.
- Each snapshot-generating workflow (`generate-state.yml`, `cost-observability.yml`, `revenue-digest.yml`, `morning-digest.yml`, `completion-tracker.yml`, `platform-conformance.yml`, `launch-readiness.yml`, `track-kpis.yml`, `pr-queue-digest.yml`) — add a final step calling `snapshot-pr-helper.mjs` against the opened PR
- `docs/runbooks/snapshot-pr-contract.md` (new) — the operator-facing runbook

**Definition of Done:**
- [ ] Next state-snapshot PR auto-merges within 10 minutes of opening
- [ ] An adversarial test PR with a snapshot path + an out-of-allowlist path is **not** auto-merged (helper rejects it)
- [ ] `docs/STATE.md` updates daily without human intervention
- [ ] Phase-0 backlog drained (precondition); ongoing backlog stays at 0

**Rollback:** Remove the final step from each snapshot workflow. PRs go back to manual merge.

### Phase 3 — Workflow Health Warden + paging (1 PR, ~4h)

**Files created/modified:**
- `.github/workflows/workflow-health-warden.yml` (new) — daily cron at `13 13 * * *` (after morning-digest, before cohesion-courtesy-check)
- `.github/scripts/workflow-health-warden.mjs` (new) — the logic:
  1. Read `REGISTRY.md` for tier assignments
  2. For each workflow, fetch last 20 runs via `gh api`
  3. Compute consecutive-failure count
  4. For Tier-1 red >1h: Pushover P1 + create/update `priority/p0` issue (dedup by title)
  5. For Tier-2 red >24h: append to daily digest issue + create/update `priority/p1` issue
  6. For Tier-3 with ≥10 consecutive failures: `gh workflow disable` + create `workflow-quarantined` + `priority/p1` issue
- `docs/runbooks/workflow-health-warden.md` (new) — runbook including how to release a quarantined workflow

**Definition of Done:**
- [ ] First scheduled run completes successfully
- [ ] Quarantine logic tested against a deliberately-broken Tier-3 workflow (or unit test against fixture run-history)
- [ ] Pushover alert verified end-to-end on a Tier-1 simulated failure
- [ ] Dedup logic: re-running the warden does not create duplicate issues for the same red workflow

**Rollback:** Disable the workflow via `gh workflow disable`. No state is mutated except quarantined-workflow disable, which is logged in the issue and reversible by `gh workflow enable`.

### Phase 4 — Budget gate + dashboard surface (1 PR, ~3h)

**Files created/modified:**
- `.github/workflows/workflow-budget-check.yml` (new) — required check on PRs touching `.github/workflows/**.yml`
- `.github/scripts/workflow-budget-check.mjs` (new) — parses PR body for `retires:` or `budget-exception:`, fails if neither is present and a new workflow file is added
- `factory-status-dashboard.yml` — extend to emit Tier-1 health summary into `docs/STATE.md`
- `scripts/generate_state.py` — read warden output, inject the Tier-1 status line at top
- Branch protection ruleset 15843812 — add `workflow-budget-check` and `workflow-concurrency-check` as required contexts (via `.github/security/main-ruleset.json` so `apply-sec-hardening` will self-apply)

**Definition of Done:**
- [ ] Adversarial PR adding a new workflow without `retires:` or `budget-exception:` is blocked
- [ ] Legitimate retirement PR (deletes one, adds one, mentions `retires:`) passes
- [ ] `docs/STATE.md` line 1 shows the Tier-1 status summary
- [ ] Ruleset change verified via `apply-sec-hardening` run

**Rollback:** Remove required contexts from ruleset; the checks become advisory. The dashboard line can be removed by reverting `generate_state.py`.

---

## Consequences

**Positive:**
- Tier-1 workflow red state cannot remain undetected for >1h
- Snapshot PR backlog goes to zero and stays there
- Cancelled-run noise drops sharply (47 workflows × ~average 3 cancellations/day → ~140 fewer runs/day)
- New workflows cost something (a retirement or an exception); growth is bounded
- Workflow conformance sub-score (currently 33/100) moves toward 80+ across the portfolio

**Negative / costs to be eyes-open about:**
- 4 new workflows added (warden, budget-check, concurrency-check, snapshot-helper as called-job) — but Pillar 4's budget gate applies to them too; each is documented and load-bearing
- Snapshot PRs lose the (theoretical) human-review eye on bot-generated data — this is deliberate (see Pillar 3 rationale)
- Quarantining a workflow could mask a real signal if its CODEOWNER doesn't react to the issue — mitigated by Pushover paging on quarantine event

**Reversibility:** All four phases are reversible by a single revert PR. Phase 3's quarantine action mutates external state (workflow enabled→disabled) but the change is logged in the auto-issue and reversed with `gh workflow enable`.

---

## Non-goals (explicit)

This decision does **not**:
- Change the supervisor loop's pickup gating or template flow
- Change the auto-merge triangulation (`auto-merge-approved-prs` + `auto-merge-spotter` + `copilot-*` remain as designed)
- Modify FRIDGE rules
- Touch wordis-bond, packages/**, migrations/**, or Stripe code paths (Red-tier per FRIDGE rule 3)
- Migrate any workflow off scheduled triggers to webhooks (separate decision)
- Flip `allowed_actions: "all"` → `"selected"` or enable `sha_pinning_required: true` — these are supply-chain hardening decisions worth their own RFC; this decision is about lifecycle, not perimeter

---

## Revisit when

- All four phases land and Tier-1 red-state SLO is observed for 30 days, OR
- A workflow-related incident occurs that the lifecycle didn't catch (file new decision describing the gap), OR
- Workflow count crosses 110 (the budget gate should be making this near-impossible; if it happens, the gate is being bypassed)

---

## References

- [`docs/supervisor/FRIDGE.md`](../supervisor/FRIDGE.md) — ten rules; this decision honors rules 3, 6, 8, 9
- [`docs/architecture/FACTORY_V1.md`](../architecture/FACTORY_V1.md) — canonical architecture
- [`docs/STATE.md`](../STATE.md) — live state; will be updated in Phase 4 to surface Tier-1 health
- Incident #529 — the original branch-protection-by-hand regression that motivates `apply-sec-hardening`
- PR #602 — the audit that hardened `apply-sec-hardening` to its current shape
- `.github/workflows/COORDINATION.md` — existing workflow-level coordination notes (Phase 1 REGISTRY.md will supersede)
