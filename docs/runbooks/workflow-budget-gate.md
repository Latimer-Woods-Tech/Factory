# Workflow Budget Gate

> Phase 4 Part A of the [workflow lifecycle](../decisions/2026-05-23-workflow-lifecycle.md). PR-time check that prevents the 95-workflow problem from recurring.

## What it does

When a PR adds a new file under `.github/workflows/**.yml`, the PR body must contain ONE of:

**Option 1 — `retires:` (LIFO retirement, the default discipline):**
```
retires: existing-workflow.yml
```
This means you're adding a new workflow that replaces `existing-workflow.yml`. The matching file must also be DELETED in the same PR (the check verifies this).

**Option 2 — `budget-exception:` (genuine net-new):**
```
budget-exception: <one-line reason explaining why this workflow doesn't replace anything>
```
This is the explicit acknowledgment that you're growing the workflow count and have a substantive reason.

Modifications to existing workflows and removals are **exempt** — this is about preventing growth, not preventing change.

## Examples

**Valid PR body — LIFO retirement:**
```
This PR consolidates the four lockfile generators into one.

retires: generate-app-lockfiles.yml, regen-lockfile-on-branch.yml, regenerate-app-lockfiles.yml

Adds: update-app-lockfiles.yml (the canonical one going forward).
```

**Valid PR body — budget exception:**
```
budget-exception: net-new capability per Q3 plan; no existing workflow handles XYZ.

This workflow adds X capability that genuinely doesn't have a predecessor.
```

**INVALID — would fail the check:**
```
Adds new-fancy-workflow.yml.

(No `retires:` and no `budget-exception:` → FAIL.)
```

## Blast radius

**CAN:**
- Read PR diff + body via gh CLI
- Post / edit one PR comment with verdict
- Exit non-zero to fail the PR check

**CANNOT** (tests scan source):
- Modify any file / push code / approve+merge PRs
- Modify workflows or branch protection
- Delete anything

Workflow `permissions:` is minimum-viable: `contents:read + pull-requests:write`.

## How to override (when the check is wrong)

If the check fires incorrectly:
1. The simplest fix is `budget-exception:` — explain why this case is different. The exception is logged in the monthly governance audit; the operator can review.
2. For systematic false-positives, open a PR adjusting `classifyDiffFiles` or `parseBudgetAcks` logic in the script. The check is fail-open under the kill switch.

## What this check is NOT

- Not a code-quality reviewer (that's `pr-review.mjs`)
- Not a FRIDGE rule check (that's `fridge-semantic-check`)
- Not a security gate (CodeQL + dependency-review + credential-scrub handle that)
- Not a blocker for legitimate work — `budget-exception:` always works

## Kill switch behavior (fails-open)

Unlike other state-mutating automations that **skip** under the kill switch, this gate **passes** under the kill switch. Rationale: budget discipline is bureaucracy, not safety. During a freeze (incident, maintenance), the operator should be able to add a workflow without bureaucratic friction.

Logged as `paused-skip-fail-open` in the audit trail.

## Test coverage

**28 unit tests** in `workflow-budget-check.test.mjs`:
- `classifyDiffFiles` — 4 tests (boundary cases including REGISTRY.md exclusion, reusable workflows)
- `parseBudgetAcks` — 7 tests (single/multi/comma-separated retires, short-exception rejection, case-insensitive, empty input)
- `evaluateBudget` — 7 tests (each verdict path)
- `buildExplanation` — 2 tests (pass + fail body shapes)
- Kill switch — 1 test
- **Blast-radius source scans — 7 tests**

## Tuning

To change the budget discipline:
- Edit `parseBudgetAcks` for new ack token shapes
- Edit `evaluateBudget` for new verdict logic
- Tests + PR

CODEOWNER review required per `.github/CODEOWNERS`.

## Related

- [`docs/decisions/2026-05-23-workflow-lifecycle.md`](../decisions/2026-05-23-workflow-lifecycle.md) — base decision (Pillar 4)
- [`docs/decisions/2026-05-23-governance-of-governance.md`](../decisions/2026-05-23-governance-of-governance.md) — four-defense model
- [`.github/workflows/REGISTRY.md`](../../.github/workflows/REGISTRY.md) — tier classification (every new workflow should also get a row)
