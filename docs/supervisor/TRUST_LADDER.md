# Supervisor Trust Ladder

**Loaded by:** supervisor loop, Claude reviewer, all AI agents · **Governs:** template promotion + autonomous execution rights

The trust ladder converts agent execution rights into a measurable, reversible progression. New templates start cautious. Proven templates execute autonomously. Reverted templates demote.

## Tiers (lowest to highest autonomy)

| Tier | Execution path | Approval required |
|---|---|---|
| **T0 — Sandbox** | Posts a plan comment; human reviews + ✅ react to execute | Human only |
| **T1 — Plan-then-execute (default for new templates)** | Posts a plan comment; auto-executes after 10-min human-veto window | Human can veto by removing the comment or labeling `template:abort` |
| **T2 — Auto-execute Green tier** | Executes immediately for path-scope-Green issues. Plan comment is informational. | None for Green tier; Yellow/Red still requires ✅ |
| **T3 — Auto-execute Yellow tier** | Executes immediately for Yellow-tier issues. Red still requires human ✅. | None for Yellow tier; Red unchanged |
| **T4 — Pre-approved pattern** | All tiers including Red can auto-execute. Reserved for templates explicitly blessed by ADR. | None — ADR is the authority |

Red tier is human-only across all template tiers below T4. T4 requires an explicit ADR per template.

## Definition of "clean run"

A template run is **clean** if all of the following hold:

1. The PR opened by the run **merged to main** (not closed, not reverted into a different PR)
2. **CI was green** on the final commit before merge (no `--admin` overrides, no bypass flag used)
3. **No revert PR** opened against the merge commit within 14 days
4. **No Sentry P0 issue** opened within 7 days post-deploy that is attributed to the change (matched by file path or endpoint)
5. **No regression in the repo's cohesion score** vs the score at the start of the run (Δ ≥ 0)
6. **Human did not add `template:bad-output`** label to any artifact of the run

A run is **dirty** if any of the above fail. Dirty runs trigger demotion logic.

## Promotion rules

- **T0 → T1:** automatic on first run (default for new templates).
- **T1 → T2:** **3 consecutive clean runs**, no dirty runs in between. Promoted automatically by `templates/PROMOTE.yml` cron.
- **T2 → T3:** **10 consecutive clean runs** at T2.
- **T3 → T4:** **requires explicit ADR.** No automatic promotion.

The promotion counter resets to 0 on any dirty run. The counter is per-template, not per-tier — moving up resets it.

## Demotion rules

- **1 dirty run within 30 days:** reset promotion counter; tier unchanged.
- **2 dirty runs within 30 days:** demote one tier.
- **3+ dirty runs within 30 days:** demote to T0 (Sandbox) and open a `template:health` issue for review.

Demotion is irreversible without re-promotion through the normal rules. No "I trust this anyway" overrides — that defeats the ladder.

## Where this is stored

- Current tier per template: `docs/supervisor/TEMPLATES.md` (table with `tier`, `clean_run_count`, `last_dirty_at`, `total_runs`).
- Per-run log: `docs/supervisor/runs/YYYY-MM-DD_RUN_ID.json` (committed each run; aggregated weekly).
- Cron that promotes/demotes: `.github/workflows/templates-promote.yml` (Stage 4 work).

Until the promote workflow lands, the supervisor loop hard-codes T1 for all templates listed in `docs/supervisor/plans/*.yml`. Tier changes are manual PRs to `docs/supervisor/TEMPLATES.md` until then.

## What this prevents

| Failure mode | How the ladder prevents it |
|---|---|
| Agent ships bad code repeatedly under blanket trust | Demotion on 2+ dirty runs; T0 fallback |
| Premature promotion of an unproven template | 3-clean-runs threshold; counter resets on any dirty run |
| "Quick exception" to skip review | No exception path; ADR required for T4 |
| Template metric gaming (e.g., shipping trivial doc edits to climb counter) | Cohesion score Δ ≥ 0 + Sentry attribution + revert window |
| Hard-to-rollback bad pattern reaching production | Red tier never auto-executes below T4; T4 has ADR sign-off |

## Companion docs

- `docs/PLATFORM_STANDARDS.md` — the standards templates must enforce
- `docs/supervisor/CONTEXT.md` — loaded before every supervisor run
- `docs/OPERATING_FRAMEWORK.md` — milestone-level discipline (this trust ladder operates inside it)
- `docs/adr/0003-claude-as-primary-reviewer.md` — Claude's review counts as CODEOWNER approval for Green + Yellow tier
- `docs/adr/0004-subagent-fanout-pattern.md` — fan-out concurrency rules
