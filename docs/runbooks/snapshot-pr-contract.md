# Snapshot PR Auto-Merge Contract

> Operator-facing runbook for Pillar 3 of the [workflow lifecycle decision](../decisions/2026-05-23-workflow-lifecycle.md).

## What it does

Snapshot-generating cron workflows (`cost-observability`, `generate-state`, `revenue-digest`, `completion-tracker`, `morning-digest`, `platform-conformance`, `launch-readiness`, `track-kpis`) open PRs with bot-generated documentation snapshots. The `snapshot-pr-auto-merge` workflow auto-approves and auto-merges these PRs **only when** all three gates pass:

1. **Author** — PR author is in [`.github/snapshot-paths.yml`](../../.github/snapshot-paths.yml) `authors:`
2. **Branch** — PR branch starts with one of `branch_prefixes:`
3. **Paths** — every changed file matches at least one of `paths:`

A PR that fails any gate gets an explanatory comment on the PR and stays open for manual review.

## Why this is safe

The contract is built on three independent layers of defense:

- **Allowlist is conservative by default.** New paths require a CODEOWNER PR to `snapshot-paths.yml`. The default is "reject."
- **Three-gate AND.** Author OR branch OR path being wrong is enough to reject. The attacker would need to control all three to bypass.
- **`pull_request_target` + main-only checkout.** The workflow checks out the `main` branch's copy of the allowlist and helper script, never the PR author's content. A PR that modifies `snapshot-paths.yml` to expand the allowlist will still be evaluated against the existing `main` allowlist — the expansion only takes effect after the PR merges, which by definition requires CODEOWNER review (because `snapshot-paths.yml` itself is not in the snapshot-paths allowlist).

## Adding a new snapshot path

1. Open a PR to `.github/snapshot-paths.yml`
2. Add the new pattern to `paths:` (or new prefix to `branch_prefixes:`, etc.)
3. Get CODEOWNER review
4. Merge

Going forward, PRs touching ONLY that path (and matching the other gates) will auto-merge.

## Kill switch

**The single fastest way to stop all snapshot auto-merge activity is to create the file `.github/automation-paused` on `main`.**

```bash
# Pause — opens a PR that adds the empty flag file
gh api repos/Latimer-Woods-Tech/Factory/contents/.github/automation-paused \
  -X PUT \
  -f message="freeze automation: <reason>" \
  -f content="$(printf '' | base64)" \
  -f branch=chore/automation-pause

gh pr create --base main --head chore/automation-pause \
  --title "🛑 PAUSE automation" \
  --body "Reason: <what triggered the freeze>"

# CODEOWNER review + merge. Once on main, the next `synchronize` event on any
# snapshot PR will trigger snapshot-pr-helper, which will:
#   1. See the flag file exists
#   2. Post a one-line "paused" comment on the PR
#   3. Exit cleanly without approving or merging
```

To resume: open a PR deleting `.github/automation-paused`, get CODEOWNER review, merge. Snapshot PRs re-evaluate on their next `synchronize` event.

**Why presence-only (not a YAML toggle):**
- Fewer failure modes — the kill switch itself cannot misinterpret its own content
- Cannot be partially broken by a typo (`PAUSED=fasle`, etc.)
- Reviewable in one glance from `gh pr view` — "is this file added or removed"

**What else respects the kill switch:**
Phase 3 (Workflow Health Warden) and Phase 4 (budget gate) are explicitly designed to consult `isAutomationPaused()` before any state-mutating action. The kill switch is a single chokepoint for the entire automation surface — Defense Layer #1 from the lifecycle decision's "governance of governance" section.

**What the kill switch does NOT pause:**
- Branch protection enforcement (GitHub-side)
- `apply-sec-hardening` (security-critical; intentionally always-on)
- `credential-scrub` and `codeql` (PR gates that must keep working even during a freeze)
- Manual `gh` CLI actions by a human

Use it freely during incident response, deploy freezes, or when you suspect automation has drifted. False positives are cheap; missed pauses are expensive.

## Removing a snapshot workflow / retiring a path

1. Open a PR removing the pattern from `snapshot-paths.yml`
2. CODEOWNER review + merge
3. Existing in-flight snapshot PRs for the retired path will be REJECTED next time the workflow re-evaluates them (synchronize event) — they need manual close or manual merge

## Auditing what auto-merged

Filter merged PRs by the workflow's review trail:

```bash
gh pr list --state merged --search 'reviewed-by:factory-cross-repo[bot] in:body "Snapshot PR auto-approved"' --json number,title,mergedAt
```

Or audit a specific PR:

```bash
gh pr view <PR#> --json reviews -q '.reviews[] | select(.author.login == "factory-cross-repo") | {state, body, submittedAt}'
```

## When the workflow itself is broken

**Symptom:** Snapshot PRs pile up again unmerged.

**Diagnosis ladder:**

1. **Workflow is disabled.** Check `gh workflow list | grep snapshot-pr-auto-merge`. If `disabled_manually`, someone (or the Phase 3 Workflow Health Warden) disabled it. Re-enable with `gh workflow enable snapshot-pr-auto-merge.yml`.

2. **Workflow ran but rejected.** Check the latest run for a snapshot PR: `gh run list --workflow=snapshot-pr-auto-merge.yml --limit 5`. Read the run logs and the PR comment for the rejection reason.
   - Common cause: a snapshot workflow started writing to a path outside the allowlist. Fix is to **either** (a) add the path to `snapshot-paths.yml` (intentional expansion) **or** (b) fix the snapshot workflow to stay within the allowlist (most cases).

3. **App token expired or revoked.** Check the run's "Mint factory-cross-repo App token" step. If it failed, rotate the `FACTORY_APP_PRIVATE_KEY` secret (see [`secret-rotation.md`](secret-rotation.md)).

4. **Bypass actor lost on the ruleset.** Verify `factory-cross-repo` is a bypass actor on ruleset 15843812: `gh api repos/Latimer-Woods-Tech/Factory/rulesets/15843812 -q '.bypass_actors'`. If missing, `apply-sec-hardening` should restore it from canonical config — confirm that workflow is green.

5. **Auto-merge enable failed.** `gh pr view <PR#> --json autoMergeRequest`. If `null`, the auto-merge enable didn't stick. Common cause: PR is missing a required check that hasn't run yet. Wait or trigger the check; the workflow will re-evaluate on `synchronize` events.

## Emergency manual drain

If something blocks the auto-merge contract and snapshot PRs accumulate while you fix the root cause, the manual drain pattern is:

```bash
# 1. List snapshot PRs
gh pr list --search 'in:branch chore/state-snapshot- OR in:branch chore/cost-snapshot- OR in:branch chore/revenue-snapshot- OR in:branch chore/conformance-snapshot- OR in:branch chore/scorecard-snapshot- OR in:branch chore/morning-digest- OR in:branch completion-tracker/' --json number,title,headRefName

# 2. For each "type", keep newest, close older
#    (See docs/decisions/2026-05-23-workflow-lifecycle.md Phase 0 for the exact
#    pattern used on 2026-05-23 to drain the initial backlog.)
```

## Related

- [`docs/decisions/2026-05-23-workflow-lifecycle.md`](../decisions/2026-05-23-workflow-lifecycle.md) — the proposal
- [`.github/snapshot-paths.yml`](../../.github/snapshot-paths.yml) — the allowlist (single source of truth)
- [`.github/workflows/snapshot-pr-auto-merge.yml`](../../.github/workflows/snapshot-pr-auto-merge.yml) — the orchestrator
- [`.github/scripts/snapshot-pr-helper.mjs`](../../.github/scripts/snapshot-pr-helper.mjs) — the validator + auto-merge helper
- [`.github/workflows/auto-merge-spotter.yml`](../../.github/workflows/auto-merge-spotter.yml) — the polling fallback that nudges BEHIND PRs with auto-merge already enabled
- [`docs/supervisor/FRIDGE.md`](../supervisor/FRIDGE.md) — rule 3 (Red-tier paths never auto-merge — snapshot allowlist intentionally excludes them)
