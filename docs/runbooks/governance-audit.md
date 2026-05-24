# Governance Audit (Monthly)

> Phase 4 Defense #4 of the [workflow lifecycle](../decisions/2026-05-23-workflow-lifecycle.md). Monthly receipt of what the automation surface did.

## Purpose

Frame is **consent, not health**. Other workflows already check "is the system healthy" (Warden, Coherence Check, smoke probes). This one asks the different question: *what changed, and was that wanted?*

It rolls up `*_AUDIT:` log lines from the four audit-line-emitting workflows into a single rolling issue you can scan in 5 minutes:

- `PUSHOVER_AUDIT:` — every Pushover notification (sent + no-op'd, with reasons)
- `WARDEN_AUDIT:` — every Warden action (evaluated, paged, logged, quarantined)
- `COHERENCE_AUDIT:` — every Coherence Check run (passed + drift events by check ID)
- `FRIDGE_AUDIT:` — every FRIDGE check outcome on Red-tier PRs (pass / fail / uncertain by rule)

## When it runs

- **1st of each month at 13:00 UTC** (cron)
- Manual dispatch via `gh workflow run governance-audit.yml`
- One issue per month: `Factory Governance Audit — YYYY-MM`. Rolling — the body is replaced wholesale each run.

## The issue (what you read)

Stable structure, four sections:

1. **Automation actions (the receipt)** — counts of what each bot did
2. **Drift indicators (the smoke test)** — manual checklist (Tier-1 red count, snapshot backlog, workflow count delta, etc.)
3. **Doc / behavior drift** — pointer to most recent Coherence Check I6 violations
4. **Action items** — only surfaces items that need work (quarantines, drift, FRIDGE fails)

If §1 is all-zero and §4 is empty, the system did nothing problematic that month. Close the issue.

## What it CANNOT catch

- The design itself becoming wrong (judgment territory; not measurable from logs)
- Decisions humans made (this only tracks bot actions)
- Anything that happened before the audit-line emission pattern existed

## Blast radius

**CAN:**
- Read workflow run logs via `gh CLI`
- Open / patch one issue per month
- Post one Pushover notification on completion (priority -1, low)

**CANNOT** (tests scan source):
- Modify any file / push code / approve+merge PRs
- Modify workflows (no `actions:write`; `actions:read` only)
- Modify branch protection or rulesets
- Delete anything

## Performance notes

The audit fetches workflow run logs which can be slow. V1 caps at 50 runs per workflow (default; tunable via `MAX_RUNS_PER_WORKFLOW`). With 4 workflows × 50 runs × ~1MB logs = up to 200MB processed per run. Timeout set to 30 minutes.

If you observe the audit timing out, drop `MAX_RUNS_PER_WORKFLOW` or migrate audit lines to a structured artifact instead of log scraping (future work).

## Tuning

To add a new audit-line emitter:
1. Pick a new prefix (e.g., `CUSTOM_AUDIT:`)
2. Add it to `AUDIT_PREFIXES` in `governance-audit.mjs`
3. Add aggregation logic in `aggregate()` for the new prefix
4. Add the workflow file to `AUDIT_WORKFLOWS` if it's its own workflow
5. Tests + PR

Acks aren't required for new emitters — the audit is additive.

## Disabling

1. **Dry-run**: `gh workflow run governance-audit.yml -f dry_run=true` — builds the report but doesn't post or page
2. **Kill switch**: commit `.github/automation-paused` — pauses this + all other state-mutating automation
3. **Hard disable**: `gh workflow disable governance-audit.yml`

The monthly issue stops appearing if disabled. No backfill mechanism; just re-enable and run for the next month.

## Test coverage

**26 unit tests** in `governance-audit.test.mjs`:
- `parseAuditLines` — 6 tests (boundary cases, malformed input)
- `aggregate` — 5 tests (each prefix category)
- `computePeriod` — 2 tests (mid-year + January year-wrap)
- `buildReport` — 3 tests (heading, surfacing quarantines, clean month)
- Kill switch — 1 test
- **Blast-radius source scans — 8 tests**
- `AUDIT_PREFIXES` stability — 1 test

## Required secrets

- `FACTORY_APP_ID`, `FACTORY_APP_PRIVATE_KEY` — already used by other workflows
- `PUSHOVER_USER_KEY`, `PUSHOVER_APP_TOKEN` — optional (graceful no-op without)

## Related

- [`docs/decisions/2026-05-23-governance-of-governance.md`](../decisions/2026-05-23-governance-of-governance.md) — Defense #4
- [`docs/runbooks/external-alerting.md`](external-alerting.md) — Pushover (Defense #2)
- [`docs/runbooks/workflow-health-warden.md`](workflow-health-warden.md) — Warden (Phase 3; emits `WARDEN_AUDIT:`)
- [`docs/runbooks/coherence-check.md`](coherence-check.md) — Coherence (Phase 6; emits `COHERENCE_AUDIT:`)
- [`docs/runbooks/fridge-semantic-check.md`](fridge-semantic-check.md) — FRIDGE (Phase 5; emits `FRIDGE_AUDIT:`)
