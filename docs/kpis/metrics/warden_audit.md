# Metric: WARDEN_AUDIT

**metric_id:** M-001
**emitter:** [`.github/scripts/workflow-health-warden.mjs`](../../../.github/scripts/workflow-health-warden.mjs)
**log_prefix:** `WARDEN_AUDIT:`
**collection:** GitHub Actions workflow logs (scraped by [`governance-audit.yml`](../../../.github/workflows/governance-audit.yml) monthly, or ad-hoc)
**owner:** `@adrper79`

---

## Schema

Each `WARDEN_AUDIT:` line is a single-line JSON object:

```json
{
  "ts": "2026-05-23T13:13:00.000Z",
  "event": "t1_red" | "t2_red" | "quarantine" | "page" | "dry_run_skip" | "paused_skip" | "healthy",
  "workflow_id": 12345678,
  "workflow_name": "ci.yml",
  "tier": "T1" | "T2" | "T3" | "TR" | "TM",
  "repo": "Latimer-Woods-Tech/Factory",
  "duration_ms": 3600000,
  "reason": "red > 1h" | "≥10 fails" | "...",
  "dry_run": true | false
}
```

---

## Fields

| Field | Type | Description |
|-------|------|-------------|
| `ts` | ISO8601 | Timestamp of audit emission |
| `event` | enum | Type of warden action or observation |
| `workflow_id` | number | GitHub workflow numeric ID |
| `workflow_name` | string | Workflow filename (e.g., `ci.yml`) |
| `tier` | enum | T1 / T2 / T3 / TR / TM — from [`REGISTRY.md`](../../../.github/workflows/REGISTRY.md) |
| `repo` | string | `owner/repo` |
| `duration_ms` | number | How long the workflow has been red (for `t1_red` / `t2_red` events) |
| `reason` | string | Human-readable trigger reason |
| `dry_run` | boolean | Whether warden is in dry-run mode (no actions taken) |

---

## Consumers

| Consumer | Purpose | Status |
|----------|---------|--------|
| [`governance-audit.yml`](../../../.github/workflows/governance-audit.yml) (monthly) | Aggregates `t1_red`, `quarantine`, `page` events for the monthly governance report | LIVE |
| `track-kpis.yml` (proposed) | Rolls up into [Tier-1 Red Time](../kpis/tier1_red_time.md) KPI | PLANNED |

---

## Example emission

```
WARDEN_AUDIT: {"ts":"2026-05-23T13:13:12.000Z","event":"t1_red","workflow_id":12345678,"workflow_name":"_app-ci.yml","tier":"T1","repo":"Latimer-Woods-Tech/Factory","duration_ms":5400000,"reason":"red > 1h","dry_run":true}
```

---

## Notes

- Emitted on every scheduled run of [`workflow-health-warden.yml`](../../../.github/workflows/workflow-health-warden.yml) (daily 13:13 UTC)
- `dry_run: true` by default ([`workflow-health-warden.yml:92`](../../../.github/workflows/workflow-health-warden.yml)) — no quarantine or paging actions taken
- This is the source of truth for **Tier-1 Red Time** and **T3 Quarantine Count** KPIs
- Tier source: [`REGISTRY.md`](../../../.github/workflows/REGISTRY.md). If a workflow is not in REGISTRY, the warden defaults it to T2.
