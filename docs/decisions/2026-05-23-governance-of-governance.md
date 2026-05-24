# ADR-2026-05-23: Governance of Governance

**Status:** Draft
**Date:** 2026-05-23
**Deciders:** @adrper79
**Related:** Phase 3 (Workflow Health Warden), Phase 4 (Budget Gate + Governance Audit), Phase 5 (FRIDGE), Phase 6 (Coherence Check)

---

## Context

Factory has 102 GitHub Actions workflows and 26 automation scripts. Governance automation (warden, audit, budget, coherence, snapshot auto-merge, etc.) now exceeds the complexity of the application code it protects. Without meta-governance, the automation surface can drift, pause silently, or page excessively.

This ADR ratifies the **governance-of-governance** layer: the principles, mechanisms, and ownership model for the automation that governs all other automation.

---

## Decision

We adopt a **4-layer defense** model for governance:

| Layer | Mechanism | Owner | Signal |
|-------|-----------|-------|--------|
| L1 | Workflow Health Warden (T1/T2/T3) | `@adrper79` | `WARDEN_AUDIT:` |
| L2 | Pushover Notify Helper + Dead Man's Switch | `@adrper79` | `PUSHOVER_AUDIT:` |
| L3 | Monthly Governance Audit | `@adrper79` | `GOVERNANCE_AUDIT:` |
| L4 | Coherence Check (11 invariants) | `@adrper79` | `COHERENCE_AUDIT:` |

**Core principles:**

1. **Explicit allowlists only** — CORS, workflow permissions, notification targets, and audit consumers must be enumerated, never inferred.
2. **Kill-switch on every automation** — `.github/automation-paused` or D1 feature flag checked by all governance workflows.
3. **Audit lines are the source of truth** — every paging, quarantine, or drift action emits a `*_AUDIT:` line. KPIs consume these, not GitHub API state.
4. **Dry-run by default for new governance** — warden, coherence-check, and governance-audit default to `dry_run: true` until explicitly promoted.
5. **Maximum 8–10 KPIs** — adding an 11th requires retiring one. This is the forcing function against metric creep.
6. **External heartbeat for self-referential systems** — the warden cannot page itself if it is down; synthetic-monitor provides the external check.

---

## Consequences

### Positive

- Single owner (`@adrper79`) for all governance automation reduces coordination overhead.
- Audit-line → consumer chain is explicit and grep-able.
- Thresholds in `docs/kpis/README.md` now match code (1h/24h/≥10, not 4h/3).
- `REGISTRY.md` is now a load-bearing artifact (coherence-check enforces it).

### Negative

- ~~`REGISTRY.md` does not yet exist — Tier-1 Red Time is undefined until it ships.~~ **Resolved 2026-05-23 (PR #919): [`.github/workflows/REGISTRY.md`](../../.github/workflows/REGISTRY.md) landed with T1/T2/T3/TR/TM tier classifications.**
- 7 runbooks and 4 workflows reference this ADR before it was written (now resolved).
- External heartbeat for Warden Mode adds a dependency on `synthetic-monitor`.

### Risks

- **Deadman paradox:** If the warden is the only thing that can detect its own failure, total failure is invisible. Mitigated by external heartbeat.
- **Notification fatigue:** `PUSHOVER_AUDIT:` volume is measurable but not yet thresholded. Risk of alert overload if >50 pages/day.
- **Orphan signals:** `GOVERNANCE_AUDIT:` and `COHERENCE_AUDIT:` have no downstream KPI consumer. They are emitted but not measured.

---

## References

- [`.github/workflows/workflow-health-warden.yml`](../../.github/workflows/workflow-health-warden.yml)
- [`.github/scripts/workflow-health-warden.mjs`](../../.github/scripts/workflow-health-warden.mjs)
- [`.github/workflows/governance-audit.yml`](../../.github/workflows/governance-audit.yml)
- [`.github/scripts/governance-audit.mjs`](../../.github/scripts/governance-audit.mjs)
- [`.github/workflows/coherence-check.yml`](../../.github/workflows/coherence-check.yml)
- [`.github/scripts/coherence-check.mjs`](../../.github/scripts/coherence-check.mjs)
- [`docs/kpis/README.md`](../kpis/README.md)
- [`docs/kpis/inventory.tsv`](../kpis/inventory.tsv)
- `docs/runbooks/workflow-health-warden.md` (and 6 other runbooks)
- [`docs/decisions/2026-05-23-workflow-lifecycle.md`](2026-05-23-workflow-lifecycle.md) — sibling ADR covering Phase 1 pillars

---

## TODO

- [x] Commit this ADR to Factory `docs/decisions/` *(migrated 2026-05-24 from nested capricast clone)*
- [ ] Update all 7 runbooks that reference `2026-05-23-workflow-lifecycle.md` if any actually intended this ADR's filename
- [x] Create `REGISTRY.md` so coherence invariant passes *(PR #919, 2026-05-23)*
- [ ] Implement external heartbeat in `synthetic-monitor`
- [ ] Add `track-kpis.yml` to consume orphan audit lines
- [ ] Decide whether to promote status from Draft to Accepted

---

## Migration note (2026-05-24)

This ADR was authored 2026-05-23 in the nested `Factory/capricast/docs/decisions/` clone by a parallel workstream and never made it into Factory's tree. It is referenced by `docs/runbooks/git-hooks.md`, `docs/runbooks/workflow-health-warden.md`, `docs/runbooks/workflow-budget-gate.md`, `docs/runbooks/governance-audit.md`, `docs/runbooks/fridge-semantic-check.md`, `docs/runbooks/external-alerting.md`, and `docs/runbooks/coherence-check.md` — 7 runbooks total, plus 4 workflow files. Without this file in the tree, those references were broken.

The 2026-05-23 strikethrough on "REGISTRY.md does not yet exist" is the only edit made during migration — the rest is verbatim from the original draft.
