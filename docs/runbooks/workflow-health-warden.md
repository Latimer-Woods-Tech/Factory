# Workflow Health Warden

> Phase 3 of the [workflow lifecycle](../decisions/2026-05-23-workflow-lifecycle.md) with the four defenses formalized in the [governance-of-governance](../decisions/2026-05-23-governance-of-governance.md) decision.

## What it does

Runs daily at 13:13 UTC. Reads [`.github/workflows/REGISTRY.md`](../../.github/workflows/REGISTRY.md) to learn each workflow's tier, fetches recent run history, and applies a tier-appropriate response when a workflow is unhealthy.

| Tier | Trigger | Action |
|---|---|---|
| **T1** (Load-bearing) | red > 1 hour | Pushover P1 + open `priority/p0` issue (dedup by title) |
| **T2** (Operational) | red > 24 hours | open `priority/p1` issue (dedup by title) |
| **T3** (Informational) | ≥ 10 consecutive failures | `gh workflow disable` + `workflow-quarantined` issue + Pushover P2 |

Workflows not classified in REGISTRY.md default to **T2** (conservative — middle-of-the-road SLO).

## Blast radius (declared + enforced)

**The Warden CAN:**
- Read workflow run history via `gh api` / `gh run list` / `gh workflow list`
- Disable a workflow's schedule via `gh workflow disable`
- Open / comment on issues
- Post Pushover notifications

**The Warden CANNOT** (enforced by tests scanning the script source + the workflow's `permissions:` block):
- Delete any workflow file or any other file
- Modify any workflow file's content
- Push code to any branch
- Approve, merge, or close any PR
- Modify branch protection or rulesets
- **Re-enable workflows it has quarantined** — re-enable is CODEOWNER-only (deliberate; forces human-in-loop on recovery)

## How to re-enable a quarantined workflow

1. Find the root cause. Read the failing run logs.
2. Land a fix PR.
3. After the fix merges and at least one run goes green naturally (if possible), or after manual verification:

```bash
gh workflow enable <workflow-filename>
```

4. Close the `workflow-quarantined` issue with a comment summarizing root cause + fix PR link. The monthly governance audit will roll up the close-time so quarantine duration is visible.

## Disabling the Warden itself

Three layers, in order of severity:

1. **Dry-run mode** (manual dispatch, no state change):
```bash
gh workflow run workflow-health-warden.yml -f dry_run=true
```
2. **Pause via kill switch** (pauses Warden + all other state-mutating automation):
```bash
# Open a PR adding empty file .github/automation-paused
# Operator runbook: .github/AUTOMATION_PAUSED.md
```
3. **Hard disable** (only Warden stops; rest of automation continues):
```bash
gh workflow disable workflow-health-warden.yml
```

## Tuning thresholds

Thresholds live in `.github/scripts/workflow-health-warden.mjs` in `evaluateWorkflow()`:

- T1 red threshold: `> 1` hour
- T2 red threshold: `> 24` hours
- T3 quarantine threshold: `>= 10` consecutive failures

To change: open a PR editing the script + the corresponding tests. CODEOWNER review required.

## Audit trail

Every Warden action emits `WARDEN_AUDIT:` lines to stdout (in the workflow run log). Pushover notifications additionally emit `PUSHOVER_AUDIT:` lines via the [pushover-notify helper](external-alerting.md).

Inspect recent activity:
```bash
gh run list --workflow=workflow-health-warden.yml --limit 5 --json databaseId -q '.[].databaseId' \
  | xargs -I{} gh run view {} --log 2>/dev/null \
  | grep -E '^(WARDEN_AUDIT|PUSHOVER_AUDIT):' \
  | head -30
```

The monthly [governance audit](../decisions/2026-05-23-governance-of-governance.md) rolls these up into a human-readable §1 table.

## Common false positives & how to handle

### A workflow you don't care about is paging at T1
**Diagnosis:** It's misclassified in REGISTRY.md.
**Fix:** Open a PR demoting it to T2 or T3. CODEOWNER review (REGISTRY.md is human-only).

### A T3 workflow keeps getting quarantined after re-enable
**Diagnosis:** Root cause not fixed. Or the workflow is genuinely broken and should be retired.
**Fix:** Either fix root cause, OR retire the workflow (delete it + REGISTRY.md row), OR demote to "manual only" (`workflow_dispatch` only, no schedule).

### The Warden missed a clear red workflow
**Diagnosis:** Likely one of:
- Workflow not in REGISTRY.md → defaulted to T2 → threshold not yet hit. Add to REGISTRY at correct tier.
- Recent cancelled runs are masking the failure streak. `computeConsecutiveFailures` ignores cancelled — verify run history.
- Kill switch is armed → check `gh api repos/.../contents/.github/automation-paused 2>&1`.

### Two issues opened for the same workflow
**Diagnosis:** Dedup is by exact title match — if the title format changes, old issues won't dedup.
**Fix:** Close one manually. Future runs use the new title format.

## Reading the action decision

The Warden's `evaluateWorkflow()` returns one of:

```
{ type: 'none', reason: '...' }                                  → healthy or not-actionable
{ type: 'page', tier: 'T1', reason: '...', issueLabels: [...] }  → page + issue
{ type: 'log',  tier: 'T2', reason: '...', issueLabels: [...] }  → issue only
{ type: 'quarantine', tier: 'T3', reason: '...', issueLabels }   → disable + issue + page
```

The reason string is included in both the issue body and the Pushover message so the operator never has to guess what triggered the action.

## Test coverage

The Warden ships with **34 unit tests** in [`workflow-health-warden.test.mjs`](../../.github/scripts/workflow-health-warden.test.mjs):

- `parseTierRegistry` — 3 tests (valid input, isolation from non-tier sections, empty input)
- `computeConsecutiveFailures` — 6 tests (boundary conditions including cancelled/skipped/null handling)
- `computeRedDurationHours` — 4 tests
- `evaluateWorkflow` — 7 tests covering each tier × each condition
- `buildIssueTitle` — 2 tests (stability for dedup)
- `isAutomationPaused` — 2 tests (default path, explicit path)
- **Blast-radius source scans** — 8 tests asserting the source contains no forbidden gh subcommands, no `git push`, no file deletion calls, no `-X PUT`/`-X DELETE` API calls
- Real REGISTRY.md round-trip — 1 conditional test (runs only when Phase 1 has landed on this branch)

The blast-radius tests are the load-bearing safety net. If a future edit adds, say, `gh pr merge` to this script, the test fails at PR time — before merge.

## Related

- [`docs/decisions/2026-05-23-workflow-lifecycle.md`](../decisions/2026-05-23-workflow-lifecycle.md) — base decision (Phase 3 originally defined here, re-designed in the governance-of-governance addendum)
- [`docs/decisions/2026-05-23-governance-of-governance.md`](../decisions/2026-05-23-governance-of-governance.md) — four-defense model this inherits
- [`.github/workflows/REGISTRY.md`](../../.github/workflows/REGISTRY.md) — tier classifications (Phase 1)
- [`.github/AUTOMATION_PAUSED.md`](../../.github/AUTOMATION_PAUSED.md) — kill switch (Defense #1)
- [`docs/runbooks/external-alerting.md`](external-alerting.md) — Pushover helper (Defense #2)
