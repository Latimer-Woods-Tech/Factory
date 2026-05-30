# Factory governance KPI brief

**Surface:** `.github/workflows/`, `.github/scripts/`, supervisor automation, audit chain
**Phase status:** Phase 1 of workflow lifecycle landed 2026-05-23 (PR #919). Phase 3 (Warden) deployed but in **dry-run by default**.
**Canonical ADR:** [`docs/decisions/2026-05-23-workflow-lifecycle.md`](../decisions/2026-05-23-workflow-lifecycle.md)

---

## Purpose

The Factory governance layer measures the health of the automation surface itself — not the apps it builds, but the automation that builds them. It exists to reduce cognitive load by surfacing problems early (Workflow Health Warden), detecting drift over time (Coherence Check), and rolling up month-to-month changes (Governance Audit) for human review.

---

## Summary

| Status | Count | Notes |
|--------|-------|-------|
| LIVE_WITH_KPI | 11 | Tier-1 Red Time, T3 Quarantine, Snapshots, Auto-Merge, Heartbeat, Notifications, Kill Switch |
| LIVE_NO_KPI | 32 | Audit lines or issues created, but no current threshold/owner |
| NOT_INSTRUMENTED | 5 | Workflows exist but produce no audit signal |
| DEAD | 2 | Quarantined or orphaned |
| **Total** | **50** | Across 38 scheduled + 12 event-driven governance workflows |

See [`inventory.tsv`](inventory.tsv) (rows `F-FGOV-001` through `F-FGOV-050`).

---

## Named governance systems

| System | File | Cron | Purpose | KPI status |
|--------|------|------|---------|-----------|
| Workflow Health Warden | [`workflow-health-warden.yml`](../../.github/workflows/workflow-health-warden.yml) + [`.mjs`](../../.github/scripts/workflow-health-warden.mjs) | 13:13 UTC daily | Pages on T1 red, opens issues on T2, quarantines T3 | LIVE (dry-run) |
| Governance Audit | [`governance-audit.yml`](../../.github/workflows/governance-audit.yml) | 1st of month 13:00 UTC | Monthly rollup of `*_AUDIT:` log lines into single issue | LIVE |
| Workflow Budget Gate | [`workflow-budget-check.yml`](../../.github/workflows/workflow-budget-check.yml) | per PR | Blocks new workflows without retire/exception annotation | LIVE_WITH_KPI |
| Snapshot PR Auto-Merge | [`snapshot-pr-auto-merge.yml`](../../.github/workflows/snapshot-pr-auto-merge.yml) | per PR | Auto-merges PRs matching [`snapshot-paths.yml`](../../.github/snapshot-paths.yml) allowlist | LIVE_NO_KPI |
| Coherence Check | [`coherence-check.yml`](../../.github/workflows/coherence-check.yml) | 14:14 UTC daily | 7 invariants (registry coverage, concurrency, kill-switch, notify import, doc links, no-pause) | LIVE_NO_KPI |
| Doc Freshness Audit | [`doc-freshness-audit.yml`](../../.github/workflows/doc-freshness-audit.yml) | weekly Mon 9am UTC | Opens `docs:debt` issues for stale docs | LIVE_NO_KPI |
| Automation Reliability Loop | [`automation-reliability-loop.yml`](../../.github/workflows/automation-reliability-loop.yml) | daily 01:15 UTC | Failure digest + weekly reliability % | LIVE_NO_KPI |
| Auto-Merge Approved PRs | [`auto-merge-approved-prs.yml`](../../.github/workflows/auto-merge-approved-prs.yml) | per PR | Merges APPROVED PRs minus opt-out labels | LIVE_NO_KPI |
| Cost Observability | [`cost-observability.yml`](../../.github/workflows/cost-observability.yml) | daily 06:37 UTC | Cloudflare / Anthropic / Sentry / Stripe / GCP spend | LIVE_NO_KPI |
| Revenue Digest | [`revenue-digest.yml`](../../.github/workflows/revenue-digest.yml) | daily 07:07 UTC | MRR + Sentry user errors + PostHog funnel | LIVE_NO_KPI |
| Dead-Man's Switch | [`dead-mans-switch.yml`](../../.github/workflows/dead-mans-switch.yml) | daily 11:11 UTC | Heartbeats `docs/completion-tracker.json` freshness | LIVE_WITH_KPI |
| Generate STATE.md | [`generate-state.yml`](../../.github/workflows/generate-state.yml) | daily 12:11 UTC | Canonical "what's true now" snapshot | LIVE_NO_KPI |
| Track KPIs | [`track-kpis.yml`](../../.github/workflows/track-kpis.yml) | weekly Mon 10am UTC | KPI history CSV; Slack webhook optional | LIVE_NO_KPI |
| Cohesion Courtesy Check | [`cohesion-courtesy-check.yml`](../../.github/workflows/cohesion-courtesy-check.yml) | every 3h | Sentry / Stripe / Pushover / GCP credential coherence | NOT_INSTRUMENTED (no audit lines) |
| Pushover Notify | [`pushover-notify.mjs`](../../.github/scripts/pushover-notify.mjs) | on demand | External alerting; emits `PUSHOVER_AUDIT:` per call | LIVE_WITH_KPI |

---

## Audit-line → consumer chain

| Emitter | Log prefix | Consumer | Orphan? |
|---------|-----------|----------|---------|
| `workflow-health-warden.mjs` | `WARDEN_AUDIT:` | `governance-audit.yml` (monthly) | No |
| `pushover-notify.mjs` | `PUSHOVER_AUDIT:` | `governance-audit.yml` | No |
| `governance-audit.mjs` | `GOVERNANCE_AUDIT:` | (none — terminal) | **Yes** |
| `coherence-check.mjs` | `COHERENCE_AUDIT:` | (none — terminal) | **Yes** |
| `workflow-budget-check.mjs` | `WORKFLOW_BUDGET_AUDIT:` | `governance-audit.yml` | No |
| `supervisor-core.mjs` | (format unknown) | (none) | **Yes** |
| `cohesion-courtesy-check` | (no audit lines emitted) | (none) | **Yes** |
| `apps/synthetic-monitor/` | (no audit prefix) | (none) | **Yes** |

**Implication.** GOVERNANCE_AUDIT, COHERENCE_AUDIT, supervisor audit (if any), cohesion-courtesy, and synthetic-monitor results are emitted but never aggregated into KPIs. Closing these orphans is the highest-leverage governance work.

---

## Top 5 highest-value governance KPIs not measured

1. **Coherence Drift Velocity** — How many I1–I7 invariant violations are open at any moment? Check emits violations but `governance-audit.mjs` doesn't roll them up by volume or trend.
2. **Snapshot PR Rejection Reason Breakdown** — Why are snapshot PRs rejected? Author? Branch prefix? Path? Comments exist on rejections but reasons aren't aggregated.
3. **Automation Pause Duration & Reason** — How long does `.github/automation-paused` stay active before removal? Who set it and why? Coherence-check flags presence but no audit trail.
4. **Warden False-Negative Rate** — How many workflows marked "healthy" later fail outside the Warden's next run window? No post-run re-check; relies on coherence-check finding drift later.
5. **KPI Owner Responsiveness** — For every WARDEN_AUDIT paging event, is the owner's action (close issue, re-enable workflow) captured? Issue is opened but ownership tracking isn't instrumented.

---

## Surprising findings

1. **Threshold mismatch in earlier doc.** Original `docs/kpis/README.md` claimed Tier-1 Red Time threshold > 4h. The warden code uses `if (tier === 'T1' && redHours > 1)` — 4× off. Fixed in this iteration.

2. **Warden is in dry-run by default.** [`workflow-health-warden.yml:92`](../../.github/workflows/workflow-health-warden.yml) sets `WARDEN_DRY_RUN: ${{ github.event.inputs.dry_run || 'true' }}`. Every scheduled run evaluates but opens zero issues and sends zero Pushover pages. Comment says "for the shakeout period after first merge to main … change 'true' to 'false' in a follow-up PR after observing 7+ days." That follow-up PR hasn't landed. **Most consequential governance state.**

3. **REGISTRY.md and ADR now exist** (commit `10db9d78` / PR #919, 2026-05-23). Earlier audit flagged both as missing — those blockers are resolved.

4. **Snapshot PR auto-merge allowlist not versioned separately.** [`.github/snapshot-paths.yml`](../../.github/snapshot-paths.yml) defines authors / branch prefixes / paths. Changes are not separately audited; a silent edit could lock out snapshot generation.

5. **Coherence check gracefully skips missing REGISTRY.md** — now moot since REGISTRY.md exists, but the defensive return-ok-on-missing pattern in [`coherence-check.mjs:128`](../../.github/scripts/coherence-check.mjs) is worth noting: file deletions are silent, not loud.

6. **Audit-line schema is informal.** Single-line JSON with no `schema_version` field. Renaming a field breaks `governance-audit.mjs` without warning.

---

## Blind spots

1. **Supervisor-core audit schema.** [`supervisor-loop.yml`](../../.github/workflows/supervisor-loop.yml) triggers [`supervisor-core.mjs`](../../.github/scripts/supervisor-core.mjs) every 4h. Audit output format (if any) not documented. Can't trace which agent tasks fired, succeeded, or failed.
2. **Cohesion-Courtesy-Check output.** Runs every 3h on Python 3.12. Script source not in repo. Output format unknown. No audit lines or Pushover.
3. **Flaky-Check-Report aggregation.** Workflow exists; detection logic unknown. No audit trail found.
4. **Sentry-to-GitHub bridge completeness.** Maps Sentry errors to GitHub issues. Mapping rules, dedup logic, failure modes not inspected.
5. **Platform-Conformance shadow scores.** Daily conformance scan in advisory mode. No audit trail of score changes, drift, or causes.
6. **PR Queue Digest consumer.** Generates digest; human action / downstream automation not documented.
7. **Cost + Revenue Digest thresholds.** Pushover optional via input flags. No documented "alert if daily spend exceeds $X" threshold.
8. **Kill-switch rollback procedure.** Creating `.github/automation-paused` disables most automation, but no runbook for re-enabling per subsystem.

---

## Key recommendation

Before declaring the governance loop "done":

1. **Land an external heartbeat** for Warden Mode — [`apps/synthetic-monitor/`](../../apps/synthetic-monitor) target hitting GitHub Actions API for last successful warden run. If >25h, Pushover P0 to `@adrper79` directly.
2. **Flip `WARDEN_DRY_RUN` to `'false'`** after 7 days of clean dry-run output. Open the PR with a one-line diff and dated approval.
3. **Add `schema_version: 1` to every `*_AUDIT:` JSON** so consumer can detect schema drift loud.
4. **Wire `track-kpis.yml` to consume orphan audit lines** (GOVERNANCE_AUDIT, COHERENCE_AUDIT) into headline KPIs.
