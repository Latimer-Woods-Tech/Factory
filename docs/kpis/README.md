# Governance KPIs — Ground Truth Reference

> **This document describes what is actually instrumented across the portfolio, not aspirational design.**
> Thresholds match the code in `.github/scripts/*.mjs`, `.github/workflows/*.yml`, and each app's source — not what the previous version of this doc claimed.

**Last synced:** 2026-05-24
**Factory ref:** `origin/main` @ `c69182f5` (Phase 1 of workflow lifecycle landed)
**Inventory size:** 314 features across 6 surfaces (Factory governance, Factory apps, HumanDesign/selfprime, capricast, coh, xico-city)

---

## Layout

| Path | Contents |
|------|----------|
| [`inventory.tsv`](inventory.tsv) | Master feature × signal × KPI matrix (314 rows) |
| [`metrics/`](metrics/) | Raw metric definitions, one file per emitter |
| [`kpis/`](kpis/) | Composite KPI definitions (rollup queries, thresholds, owners) |
| [`factory-governance.md`](factory-governance.md) | Factory workflows + supervisor + audit chain |
| [`factory-apps.md`](factory-apps.md) | Factory apps + packages surface |
| [`humandesign.md`](humandesign.md) | selfprime.net (Stage 1 priority) |
| [`capricast.md`](capricast.md) | capricast.com (video publishing) |
| [`coh.md`](coh.md) | cypherofhealing.com (5-stream platform) |
| [`xico-city.md`](xico-city.md) | DJMEXXICO creative-economy OS (pre-prod) |

`inventory.tsv` is the index; per-repo briefs are the narrative. Use tabs (`\t`) — many `notes` fields contain commas.

---

## Core governance KPIs (thresholds match code)

| KPI | Threshold | Window | Owner | Data source | Status |
|-----|-----------|--------|-------|-------------|--------|
| Tier-1 Red Time | T1 red >1h / T2 red >24h | rolling 24h | `@adrper79` | `WARDEN_AUDIT:` from [`workflow-health-warden.mjs:204`](../../.github/scripts/workflow-health-warden.mjs) | LIVE_NO_KPI |
| Warden Mode | dry-run vs live | immediate | `@adrper79` | [`workflow-health-warden.yml:92`](../../.github/workflows/workflow-health-warden.yml) (currently `WARDEN_DRY_RUN='true'` by default) | LIVE_NO_KPI |
| T3 Quarantine Count | ≥10 fails → `gh workflow disable` | rolling 7d | `@adrper79` | warden quarantine path | LIVE_NO_KPI |
| PUSHOVER_AUDIT Volume | >50 pages/day | rolling 24h | `@adrper79` | `PUSHOVER_AUDIT:` from [`pushover-notify.mjs:106`](../../.github/scripts/pushover-notify.mjs) | LIVE_NO_KPI |
| GOVERNANCE_AUDIT Emission | 1 run/month | monthly | `@adrper79` | `GOVERNANCE_AUDIT:` from [`governance-audit.mjs:247`](../../.github/scripts/governance-audit.mjs) | LIVE_NO_KPI |
| COHERENCE_AUDIT Drift | >0 violations/run | per run | `@adrper79` | `COHERENCE_AUDIT:` from [`coherence-check.mjs:256`](../../.github/scripts/coherence-check.mjs) | LIVE_NO_KPI |
| Budget Gate Compliance | 100% (any block fails PR) | per PR | `@adrper79` | [`workflow-budget-check.yml`](../../.github/workflows/workflow-budget-check.yml) | LIVE_WITH_KPI |
| Snapshot Auto-Merge Rate | <100% success | rolling 7d | `@adrper79` | [`snapshot-pr-auto-merge.yml`](../../.github/workflows/snapshot-pr-auto-merge.yml) | LIVE_NO_KPI |

**Measurement window is explicit on every row.** Two readers compute the same number.

**Undefined terms defined inline:**
- **Tier-1 Red Time** — time from first `WARDEN_AUDIT` emission with `event: "t1_red"` for a workflow until it either turns green or escalates to T2.
- **Warden Mode** — value of `WARDEN_DRY_RUN` env var on the most recent scheduled run.
- **T3 Quarantine Count** — number of workflows currently disabled via `gh workflow disable` (T3 path: ≥10 consecutive fails).

**Data source mechanism.** All governance KPIs consume `_AUDIT:` log lines emitted by `.github/scripts/*.mjs`. Collection happens via `governance-audit.yml` (monthly) or ad-hoc log scraping. Raw principle: cheap to collect = grep log prefix, no new infrastructure.

**Easy to disable.** Each KPI workflow has an `if:` guard checking for `.github/automation-paused` (tombstone file) or a D1 feature flag in the FLAGS database. Deleting the workflow file is the nuclear option.

---

## How to add a new KPI

1. **Define the raw metric(s)** — create `metrics/<source>.md` with frontmatter:
   ```yaml
   metric_id: M-XXX
   emitter: <workflow-or-script>
   log_prefix: "WARDEN_AUDIT:"
   fields: [ts, event, ...]
   collection: "GitHub Actions log scraping via governance-audit.yml"
   ```
2. **Propose the composite** — create `kpis/<name>.md` with:
   - Numerator / denominator (or aggregation logic)
   - Threshold + measurement window (be explicit: "rolling 24h", "per PR")
   - Owner handle — must be a person/team, not a phase name
   - Data source (explicit: "consumes WARDEN_AUDIT lines")
   - Disable mechanism: "delete file" | "workflow `if:` guard" | "feature flag in FLAGS D1"
3. **Add to inventory.tsv** — one row, `status: LIVE_NO_KPI` initially
4. **Wire the consumer** — either extend [`governance-audit.yml`](../../.github/workflows/governance-audit.yml) or create a new scheduled workflow
5. **CODEOWNERS review** — PR requires approval from `@adrper79` for `docs/kpis/`

**Maximum 8–10 governance KPIs.** Adding an 11th requires retiring one. This is the forcing function against creep. Per-repo product KPIs are tracked in their own briefs, not constrained by this cap.

---

## STATE.md integration

The daily [`generate-state.yml`](../../.github/workflows/generate-state.yml) workflow writes to [`docs/STATE.md`](../STATE.md) (repo root). KPI status appears under anchor `## KPI Rollup`:

```markdown
## KPI Rollup (auto-generated, do not edit)

| KPI | Current | Threshold | Status |
|-----|---------|-----------|--------|
...
```

If STATE.md is edited to remove this section, [`track-kpis.yml`](../../.github/workflows/track-kpis.yml) will fail and surface the breakage.

---

## Phase 1 ground truth (landed 2026-05-23)

[`docs/decisions/2026-05-23-workflow-lifecycle.md`](../decisions/2026-05-23-workflow-lifecycle.md) ratified the workflow lifecycle. Two pillars shipped in commit `10db9d78` → `c69182f5` (PR #919):

- **Pillar 1 — Tier registry.** [`.github/workflows/REGISTRY.md`](../../.github/workflows/REGISTRY.md) classifies every workflow as **T1** (load-bearing, red >1h = P0), **T2** (operational, red >24h = P1), **T3** (informational, red >7d auto-disabled), **TR** (reusable, SLO owned by caller), **TM** (manual dispatch). CODEOWNERS: REGISTRY.md is human-only — tier reclassification needs a CODEOWNER PR.
- **Pillar 5 — Concurrency hygiene.** 13 workflows missing top-level `concurrency:` blocks were fixed. [`workflow-concurrency-check.yml`](../../.github/workflows/workflow-concurrency-check.yml) added as a PR-time gate.

**Implication for this doc:** earlier versions flagged "REGISTRY.md missing" and "ADR missing" as blockers. Both are resolved. Tier-1 Red Time is now well-defined (REGISTRY.md is the tier source).

**Still pending** (from the ADR, not yet shipped):
- Pillar 2 — Pushover-notify helper Defense Layer #2 (merged via PR #922 on origin)
- Pillar 3 — Workflow Health Warden — **scheduled but in dry-run by default** ([`workflow-health-warden.yml:92`](../../.github/workflows/workflow-health-warden.yml)). Going live requires the 7-day clean dry-run review.
- Pillar 4 — Workflow Budget Gate (live, blocking PRs)

---

## KPIs removed / re-grounded vs. previous README

| Previous claim | Reality | Action |
|----------------|---------|--------|
| Tier-1 Red Time threshold > 4h | Code trips at >1h (T1) / >24h (T2) | **Corrected** above |
| Quarantined Workflow Count > 3 | T3 quarantine fires at ≥10 fails, count of *currently disabled* | **Rewritten** as T3 Quarantine Count |
| Governance PR Latency | No workflow tags governance PRs or measures their merge latency | **Dropped** — not instrumented |
| Stale Snapshot PR Count | `snapshot-pr-auto-merge.yml` acts per-PR; no aggregation exists | **Dropped** — no producer |
| "Phase 2/3/4" owners | Phases end; pagers don't follow them | **Replaced** with `@adrper79` |
| "Self" owner on Warden Health | Warden can't page itself (deadman paradox) | **Replaced** with `@adrper79`, plus external heartbeat TODO |

---

## Audit-line → consumer chain

| Emitter | Log prefix | Consumer | Orphan? |
|---------|-----------|----------|---------|
| [`workflow-health-warden.mjs`](../../.github/scripts/workflow-health-warden.mjs) | `WARDEN_AUDIT:` | [`governance-audit.yml`](../../.github/workflows/governance-audit.yml) (monthly) | No |
| [`pushover-notify.mjs`](../../.github/scripts/pushover-notify.mjs) | `PUSHOVER_AUDIT:` | `governance-audit.yml` | No |
| [`governance-audit.mjs`](../../.github/scripts/governance-audit.mjs) | `GOVERNANCE_AUDIT:` | none — terminal | **Yes** |
| [`coherence-check.mjs`](../../.github/scripts/coherence-check.mjs) | `COHERENCE_AUDIT:` | none — terminal | **Yes** |
| [`workflow-budget-check.mjs`](../../.github/scripts/workflow-budget-check.mjs) | `WORKFLOW_BUDGET_AUDIT:` | `governance-audit.yml` | No |
| `apps/synthetic-monitor/` | (no `_AUDIT:` prefix) | none | **Yes** |

**Orphan signals** — GOVERNANCE_AUDIT, COHERENCE_AUDIT, and synthetic-monitor results have no consumer that produces a KPI. They are emitted but not measured. Closing these orphans is the most leveraged work for the next iteration.

---

## Top 5 highest-value governance KPIs not yet measured

1. **Warden Mode (dry-run vs live)** — Single most important governance fact. Currently `WARDEN_DRY_RUN='true'` by default. Needs an external heartbeat (Warden can't self-detect failure).
2. **T3 Disable Count** — Count of `gh workflow disable` calls. Real quarantine signal. No KPI tracks it.
3. **Automation Pause State** — Presence/absence of `.github/automation-paused`. Kill-switch health.
4. **Coherence Drift Open Issues** — Count of open `[Coherence]` tracking issues. Measures drift remediation velocity.
5. **Budget Gate Block Rate** — Percentage of PRs blocked by `workflow-budget-check`. Leading indicator of budget pressure.

---

## CODEOWNERS

```
docs/kpis/                @adrper79
.github/scripts/          @adrper79
.github/workflows/        @adrper79
.github/workflows/REGISTRY.md  @adrper79   # human-only, no bot co-owner
```

Step 5 of "How to add a new KPI" is enforceable when [`.github/CODEOWNERS`](../../.github/CODEOWNERS) carries these rules.

---

## TODO (post-Phase-1)

- [ ] Land external heartbeat check for Warden Mode (synthetic-monitor target hitting GitHub Actions API for last successful run timestamp)
- [ ] Flip `WARDEN_DRY_RUN` to `'false'` after 7+ days of clean dry-run output
- [ ] Wire `track-kpis.yml` consumer to aggregate orphan `*_AUDIT:` lines into headline KPIs
- [ ] Add `metrics/pushover_audit.md`, `metrics/governance_audit.md`, `metrics/coherence_audit.md`, `metrics/factory_events.md`
- [ ] Add `kpis/t3_quarantine.md`, `kpis/warden_mode.md`, `kpis/budget_gate_block_rate.md`
- [ ] Add anchor regex test to `coherence-check.mjs` that fails if STATE.md loses the `## KPI Rollup` heading

---

## Cross-repo notes

This index lives in Factory but applies to the full portfolio. Per-repo product KPIs (selfprime conversion funnels, capricast view metrics, coh content engagement, xico-city S-01 completion) are tracked in `inventory.tsv` and in each `{repo}.md` brief.

The 8-KPI cap above is for **governance** KPIs only. Each product surface owns its own KPI envelope.
