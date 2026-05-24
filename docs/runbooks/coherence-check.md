# Coherence Check

> Phase 6 of the [workflow lifecycle](../decisions/2026-05-23-workflow-lifecycle.md). Drift detection — measures whether the system still matches the design over time.

## Why it exists

Every PR-time gate (concurrency check, snapshot allowlist, budget gate) and every runtime monitor (Workflow Health Warden) is **point-in-time**. None of them ask: *does the system still match the design we wrote down?*

In 90 days, several invariants the design assumes will silently drift unless someone checks. This workflow checks.

## What it asserts (the invariants)

| # | Invariant | Why it matters |
|--:|---|---|
| I1 | Every `.github/workflows/*.yml` (except `_*.yml` reusables) appears in `REGISTRY.md` | New workflows shipping without tier classification get the wrong SLO |
| I2 | Every `REGISTRY.md` row points to a real workflow file | Orphaned rows mean the registry is lying about what's deployed |
| I3 | Every push/PR workflow has a top-level `concurrency:` block | Pillar 5 of the lifecycle; cancelled-run noise compounds without this |
| I4 | Every state-mutating script in `.github/scripts/` consults the kill switch | Defense #1 must be honored by every new automation |
| I5 | Every state-mutating script imports `notify()` from `pushover-notify.mjs` | Defense #2 — out-of-band paging applies to every new automation |
| I6 | Markdown links in `docs/decisions/**.md` and `docs/runbooks/**.md` resolve | Docs that reference dead files mean the design intent is unreadable |
| I7 | `.github/automation-paused` does NOT exist on `main` | Steady state is "automation running"; lingering pause file is a process bug |

## What it CANNOT catch (be honest about limits)

- **The design itself becoming wrong over time.** If "T1 red >1h" is the wrong threshold given new app realities, Coherence Check doesn't tell you. That's judgment requiring human re-examination.
- **Subtle behavioral drift in implementations.** Coherence Check is a structural check, not a behavioral one. If the Warden's logic is edited to add a sneaky bypass, the unit-test suite catches it (if tests are still passing); Coherence Check verifies STRUCTURE only.
- **Novel attack patterns.** Coherence Check enforces what we currently know. New threats are out of scope.
- **Drift in implementations that don't trigger the structural checks.** If `notify()` is imported but never actually called, Coherence Check sees the import and passes.

So this is a real defense but not a panacea. It catches **mechanical drift from the documented design**, not **design becoming inappropriate for reality**.

## When it runs

- **Daily** at 14:14 UTC (after the Warden's 13:13 run; staggered to avoid overlap)
- **On every PR** touching `.github/**` or `docs/decisions/**` or `docs/runbooks/**` (catches drift at PR time, before it reaches main)
- **Manually** via `gh workflow run coherence-check.yml`

PR-time runs are always dry-mode (no tracking issues opened from PR-time runs; drift is surfaced via the PR check status instead).

## What happens when drift is detected

**Scheduled run on `main` with drift:**
1. One tracking issue opened per failing check, labeled `compliance:drift` + `priority/p2`. Title is deterministic for dedup — re-runs against the same drift update the existing issue instead of opening duplicates.
2. ONE Pushover notification summarizing the run (not per-check, to avoid fatigue).
3. Exit non-zero (workflow run shows red).

**PR-time run with drift:**
1. PR check fails with a list of violations in the workflow log.
2. No issue opened, no Pushover paging.
3. PR cannot merge until drift is resolved (assuming the check becomes a required check).

**Resolving drift:**
1. Open a fix PR addressing the violations.
2. Close the `compliance:drift` tracking issue after merge.
3. Next Coherence Check run verifies the fix held.

## Blast radius

**CAN:**
- Read any file in the repo
- Open / comment on issues
- Post Pushover notifications

**CANNOT** (asserted by tests scanning the script source):
- Modify any file
- Push code
- Approve, merge, close any PR
- Modify workflows (no `actions:write`)
- Modify branch protection or rulesets
- Delete anything
- Auto-fix any drift it detects (deliberate — drift fixes go through human-reviewed PRs)

## Disabling

Three layers:

1. **Dry-run** — `gh workflow run coherence-check.yml -f dry_run=true` (evaluate but make no issue/paging state changes)
2. **Pause via kill switch** — commit `.github/automation-paused` (Coherence Check + all other state-mutating automation pause)
3. **Hard disable** — `gh workflow disable coherence-check.yml`

## Tuning

Adding a new invariant: edit `coherence-check.mjs`, add a new exported `check*` function, add to the `ALL_CHECKS` array, add corresponding tests. CODEOWNER review per `.github/CODEOWNERS`.

Relaxing an invariant: same process; review must address WHY the invariant is no longer appropriate.

## Test coverage

**42 unit tests** in `.github/scripts/coherence-check.test.mjs`:

- Pure helpers (4 functions): 12 tests
- Each invariant check (7 functions): 20 tests
- Kill switch / production-invariant: 1 test
- Blast-radius source scans: 7 tests
- Real-repo smoke (skip when dependencies not on branch): 1 test

The blast-radius tests are the load-bearing safety. If a future edit introduces, say, `gh pr merge` to this script, the test fails at PR time.

## Related

- [`docs/decisions/2026-05-23-workflow-lifecycle.md`](../decisions/2026-05-23-workflow-lifecycle.md) — base decision
- [`docs/decisions/2026-05-23-governance-of-governance.md`](../decisions/2026-05-23-governance-of-governance.md) — four-defense model
- [`docs/runbooks/workflow-health-warden.md`](workflow-health-warden.md) — Phase 3 (runtime monitor; Coherence Check is structural)
- [`docs/runbooks/external-alerting.md`](external-alerting.md) — Pushover helper (Defense #2)
- [`.github/AUTOMATION_PAUSED.md`](../../.github/AUTOMATION_PAUSED.md) — kill switch (Defense #1)
