# KPI: Tier-1 Red Time

**kpi_id:** K-001
**owner:** `@adrper79`
**data source:** `WARDEN_AUDIT:` lines (see [M-001](../metrics/warden_audit.md))
**disable mechanism:** Delete file, or add `if: github.event_name != 'schedule'` guard to consuming workflow, or set `.github/automation-paused` kill-switch
**status:** LIVE_NO_KPI (signal emits; no rollup consumer wired)

---

## Definition

**Tier-1 Red Time** is the elapsed time from the first `WARDEN_AUDIT` emission with `event: "t1_red"` for a workflow until either:
- The workflow turns green (no longer emitting `t1_red`), or
- The workflow escalates to T2 (`event: "t2_red"` after >24h)

**Numerator:** count of workflows currently in T1 red state (red duration >1h and ≤24h)
**Denominator:** N/A — this is a duration-based alert KPI, not a rate

---

## Thresholds (match code reality)

| Tier | Threshold | Window | Action |
|------|-----------|--------|--------|
| T1 | red >1h | rolling 24h | Pushover P0 + open `priority/p0` issue |
| T2 | red >24h | rolling 24h | Open `priority/p1` issue (no Pushover) |
| T3 | ≥10 consecutive fails | rolling 7d | `gh workflow disable` (quarantine) + Pushover P2 |

**Note:** earlier versions of `docs/kpis/README.md` claimed >4h / >3 — those values do not match code. The warden trips at >1h (T1) / >24h (T2) per [`workflow-health-warden.mjs:9`](../../../.github/scripts/workflow-health-warden.mjs). T3 quarantine is ≥10 fails, not >3 workflows.

---

## Measurement window

**Rolling 24h** from the perspective of each scheduled warden run (13:13 UTC daily). Each run evaluates all workflows' current red duration at that moment against the REGISTRY-classified tier.

---

## Rollup query (proposed)

```bash
# Parse last 24h of WARDEN_AUDIT lines from workflow logs.
# Count workflows where latest event is "t1_red" and duration_ms > 3600000.
gh run list --workflow workflow-health-warden.yml --limit 24 \
  | xargs -I {} gh run view {} --log \
  | grep '^WARDEN_AUDIT:' \
  | sed 's/^WARDEN_AUDIT: //' \
  | jq -s 'map(select(.event == "t1_red" and .duration_ms > 3600000)) | length'
```

**Target consumer:** `track-kpis.yml` (new workflow) or extension of [`governance-audit.yml`](../../../.github/workflows/governance-audit.yml).

---

## Owner rationale

Owned by `@adrper79` (a human handle), **not** "Self" or "Phase 3". If the warden itself is down, a human must be paged — the warden cannot page itself. This is the deadman paradox resolved.

---

## External heartbeat (required)

Because the warden is currently in dry-run by default and cannot self-detect total failure, an external check is required:

- **Proposed:** [`apps/synthetic-monitor/`](../../../apps/synthetic-monitor) adds a target that curls the GitHub Actions API for the last successful [`workflow-health-warden.yml`](../../../.github/workflows/workflow-health-warden.yml) run timestamp.
- If last success is >25h ago → page `@adrper79` directly (bypass warden).

---

## Disable mechanism

1. **Soft (env-flagged):**
   ```yaml
   # in workflow-health-warden.yml
   if: github.event_name != 'schedule' || vars.WARDEN_ENABLED == 'true'
   ```
2. **Hard (file delete):** Delete [`workflow-health-warden.yml`](../../../.github/workflows/workflow-health-warden.yml) and the script.
3. **Kill-switch (global):** Presence of `.github/automation-paused` — checked by every governance workflow's first step.

---

## Related KPIs

- **T3 Quarantine Count** (K-002, TODO) — counts `gh workflow disable` calls
- **Warden Mode** (K-003, TODO) — tracks `dry_run` state over time

---

## TODO

- [ ] Implement `track-kpis.yml` consuming `WARDEN_AUDIT:` and emitting the KPI value to `STATE.md`
- [ ] Add external heartbeat check ([`apps/synthetic-monitor/`](../../../apps/synthetic-monitor) target)
- [ ] Wire into monthly [`governance-audit.yml`](../../../.github/workflows/governance-audit.yml) report
- [ ] Flip `WARDEN_DRY_RUN` to `'false'` after 7+ days of clean dry-run output ([`workflow-health-warden.yml:92`](../../../.github/workflows/workflow-health-warden.yml))
