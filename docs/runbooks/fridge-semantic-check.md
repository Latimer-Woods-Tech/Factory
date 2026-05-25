# FRIDGE Semantic Check

> Phase 5 of the [workflow lifecycle](../decisions/2026-05-23-workflow-lifecycle.md). Judgment proxy for the button-presser CODEOWNER model.

## What it does

On every PR touching Red-tier paths (per `.github/CODEOWNERS`), asks an LLM to evaluate compliance with the 5 FRIDGE rules that require code-semantic judgment. The other 5 FRIDGE rules are already covered by deterministic gates (branch protection, label gates, etc.) — no LLM needed.

Posts a structured comment on the PR with per-rule verdicts.

## V1 (this PR) vs V2 (future)

**V1 — Advisory mode** (current):
- Single model: Anthropic Claude Haiku 4.5
- Comment posted, but PR is **not blocked** on fail
- Pushover P2 on any `fail` verdict so the operator can intervene manually
- Mode of operation: gather signal, measure false-positive rate

**V2 — Enforcement** (future PR after observing signal):
- Adds Grok as second model (2-party consensus per existing supervisor pattern)
- Promote to required check; `fail` blocks merge
- Both `uncertain` → CHANGES_REQUESTED review

The V1 advisory phase is deliberate. Going straight to enforcement risks blocking legitimate PRs on LLM hallucinations.

## Rules in scope

Five of the ten FRIDGE rules. The five where determinism leaves a judgment gap:

| Rule | What it asks |
|---|---|
| **1 — wordis-bond UI** | Does the diff modify wordis-bond UI / frontend code? (Backend engine code is exempt.) |
| **2 — credentials** | Does the diff introduce hardcoded secrets the regex-based credential-scrub might miss (obfuscated, split across lines, etc.)? |
| **4 — /admin mutation** | Does the diff modify admin handlers, and if so does the PR body acknowledge with `FRIDGE-rule-4-ack`? |
| **6 — single-writer** | Does the diff introduce a concurrent-write path without claiming a LockDO lock first? |
| **8 — irreversible** | Does the diff perform irreversible actions (delete CF resources, mutate Stripe products, send live SMS) without `FRIDGE-rule-8-ack` in the body? |

Rules 3, 5, 7, 9, 10 are not in scope — they're already enforced deterministically (branch protection, supervisor budget, label gates, etc.).

## How to acknowledge (for legitimate Red-tier work)

When you intentionally do a thing the check flags, put the appropriate `ack` token in the PR body:

```
FRIDGE-rule-4-ack: modifying /admin/billing-status endpoint per ops-checkpoint 2026-05-23.
FRIDGE-rule-8-ack: deleting old D1 instance; data already migrated to new instance verified at curl <url>.
```

The model sees the acks and changes the verdict from `fail` to `pass`. Honest acks are the bypass mechanism.

## Override (CODEOWNER-only)

If the check is wrong (false-positive), add label `fridge-bypass` to the PR. Per repo policy, this label requires CODEOWNER application. Once labeled, future runs of this check on the PR skip without paging (V2 — not yet wired; V1 is advisory anyway).

## Blast radius

**CAN:**
- Read PR diff and PR body via `gh CLI`
- Call Anthropic Messages API
- Post one PR comment (deduped — edits existing comment on synchronize)
- Post one Pushover notification on `fail` outcome

**CANNOT** (asserted by tests scanning the script source):
- Modify any file
- Push code
- Approve, merge, or close any PR (advisory only in V1)
- Modify workflows (`permissions:` does not include `actions:write`)
- Modify branch protection or rulesets
- Delete anything

## Defenses inherited

1. **Kill switch** — first action; `.github/automation-paused` → exit clean
2. **External alerting** — Pushover P2 on `fail` only (not on `pass`/`uncertain` to avoid fatigue)
3. **Bounded blast** — workflow `permissions:` is minimum-viable; 7 source-scan tests
4. **Monthly audit** — `FRIDGE_AUDIT:` log lines roll up into governance audit

## Prompt-injection hardening

The PR body and diff are **untrusted data**. The check defends against an attacker stuffing instructions into the body or diff:

1. **Override directive at top of prompt** — model instructed to treat fenced content as data, ignore embedded instructions
2. **Strict JSON output schema** — output that doesn't parse as the schema is treated as `uncertain` on all rules
3. **Diff/body truncation** — 60KB diff, 4KB body cap defends against prompt-flood attacks
4. **Base-branch checkout** — script always runs from `main`'s copy; PR-author content cannot modify the script

## Cost

Target: < $0.05 per Red-tier PR.
- One Anthropic Haiku call per PR
- Bounded by diff truncation (~15K tokens input + 1500 tokens output)

The governance audit will track total cost monthly. If it drifts above budget, the `paths:` filter can be tightened.

## Failure modes

| Symptom | Likely cause | Fix |
|---|---|---|
| No comment posted on a Red-tier PR | `ANTHROPIC_API_KEY` not set | Add secret |
| Comment posted but all `uncertain` | LLM returned non-JSON or malformed response | Inspect workflow log for the raw model output; tune prompt if recurring |
| False-positive `fail` | Model misreads the diff | Add `fridge-bypass` label (CODEOWNER) + reply on the PR explaining |
| Pushover paging but no PR opened | Webhook dropped or skipped | Inspect `FRIDGE_AUDIT:` log; check secret config |
| Workflow not triggering on a clearly-Red-tier PR | Path filter mismatch | Add the path pattern to `fridge-semantic-check.yml` `paths:` |

## Required secrets

| Secret | Source |
|---|---|
| `ANTHROPIC_API_KEY` | Existing — set by `LATIMER_ANTHROPIC_API` mapping or direct |
| `PUSHOVER_USER_KEY` | From the Pushover helper (Defense #2 PR) |
| `PUSHOVER_APP_TOKEN` | Same |

Without `ANTHROPIC_API_KEY`, the check exits cleanly without running (logged as `no-api-key-skip`).

## Test coverage

**37 unit tests** in `fridge-semantic-check.test.mjs`:

- `truncateBytes` — 3 tests
- `buildPrompt` — 6 tests including prompt-injection robustness
- `parseModelResponse` — 7 tests covering valid, invalid, partial, markdown-wrapped, unknown-verdict, truncated-evidence cases
- `determineOutcome` — 7 tests covering all pass/fail/uncertain/n-a permutations
- `buildCommentBody` — 3 tests
- `callAnthropic` mocked fetch — 3 tests (happy path, 4xx, malformed response)
- Kill switch — 1 test (production invariant)
- **Blast-radius source scans — 7 tests** (the safety net)

## Related

- [`docs/supervisor/FRIDGE.md`](../supervisor/FRIDGE.md) — the rules being evaluated
- [`docs/decisions/2026-05-23-governance-of-governance.md`](../decisions/2026-05-23-governance-of-governance.md) — Phase 5 design rationale
- [`docs/runbooks/workflow-health-warden.md`](workflow-health-warden.md) — Phase 3 (runtime monitor)
- [`docs/runbooks/coherence-check.md`](coherence-check.md) — Phase 6 (structural drift detector)
- [`.github/scripts/pr-review.mjs`](../../.github/scripts/pr-review.mjs) — existing 2-party reviewer (V2 will piggyback on this)
