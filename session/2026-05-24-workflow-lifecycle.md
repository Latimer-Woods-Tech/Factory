# Workflow Lifecycle Session — 2026-05-23 → 2026-05-24

> Close-out + handoff document for the multi-PR workflow lifecycle refactor. Read this first if you're picking up where this session left off.

---

## TL;DR

Factory's automation surface (95 workflows, 34,750 lifetime runs, multiple Tier-1 workflows silently red) got a structural overhaul: a **6-phase lifecycle** with **4 defenses-in-depth** + **judgment proxy** for the button-presser CODEOWNER model.

| Shipped to main | Pending merge | Deferred |
|---|---|---|
| Phase 0 (#908) — submodule + smoke fix | Phase 1 (#919) — Registry + concurrency baseline | Phase 4 Part C — Tier-1 dashboard (cosmetic; skipped) |
| | Kill switch (#920) — Defense #1 | SHA-pinning hardening — multi-PR effort |
| | Governance-of-governance doc (#921) — design | 60 dependabot vulnerabilities — per-vuln content work |
| | Pushover helper + Warden + dry-run + Coherence + FRIDGE + Governance Audit + Budget Gate (#922 chain) | |
| | Pre-commit branch-guard hook (#924) | |

**Status at close:** 8 PRs opened across this session. PR #908 merged. PRs #923, #926, #927, #928, #929, #930 merged into the #922 chain (will land on main with #922). PRs #919, #920, #921, #922, #924 awaiting final CI completion + auto-merge. **Required action from CODEOWNER: none** (all PRs are APPROVED + auto-merge ON, waiting on green CI which the #908 merge should unblock).

---

## The arc (what happened and why)

The session traced an unusually clean architectural arc. Each phase responded to a specific real or external signal:

1. **Initial audit** revealed the workflow surface had structural problems — 95 workflows, ~5 red Tier-1 with no paging, 20 stale snapshot PRs, 47 workflows without concurrency control.

2. **Designed the lifecycle** as a 4-phase plan ([docs/decisions/2026-05-23-workflow-lifecycle.md](../docs/decisions/2026-05-23-workflow-lifecycle.md)) → Phase 1 (Registry + concurrency), Phase 2 (Snapshot auto-merge), Phase 3 (Workflow Health Warden), Phase 4 (Budget gate + Governance audit + Tier-1 dashboard).

3. **Built Phases 1-2** as standalone PRs (#919, #920) including the **kill switch** as Defense #1.

4. **External review** of the design surfaced the "increasingly destabilizing hallucination damage" risk — every layer of automation adds protection AND new surface area for drift.

5. **Validated the critique honestly** and produced the four-defense addendum ([docs/decisions/2026-05-23-governance-of-governance.md](../docs/decisions/2026-05-23-governance-of-governance.md)) → Defense #1 (kill switch), #2 (Pushover paging), #3 (bounded blast radius), #4 (monthly audit). This became the load-bearing design doc.

6. **Operator self-assessment** ("I'm more like a button-presser than a reviewer") triggered Phase 5 — the FRIDGE semantic check (#928), an LLM-based judgment proxy for the 5 FRIDGE rules requiring code-semantic understanding.

7. **Operator question about drift detection** ("how often do we measure compliance with the design?") triggered Phase 6 — the Coherence Check (#927), a daily structural drift detector with 7 invariants.

8. **Branch hygiene problems** caused by parallel IDE/agent processes interfering with my git operations triggered:
   - A local defense (pre-commit branch-guard, #924)
   - A structural defense (the `factory-lifecycle/` worktree)

After the worktree switch, zero hygiene incidents occurred for the remaining 3+ PRs (#929, #930, plus this close-out).

9. **Multi-agent validation proposal** assessed: 80% rejected (mechanical checks are better deterministic), 20% extracted into Phase 5's FRIDGE semantic check.

10. **Queue management** — rebased 3 BEHIND/DIRTY PRs, enabled auto-merge on all 6 approved PRs, regenerated capability artifacts on the blocking PRs.

---

## What each phase delivers (the final intended state)

### Phase 1 — Tiered registry + concurrency baseline (PR #919)

- **`.github/workflows/REGISTRY.md`** — every workflow classified T1/T2/T3/TR/TM. Authoritative source for the Warden's tier-based response.
- **Concurrency blocks** added to 13 push/PR-triggered workflows
- **`workflow-concurrency-check.yml`** — required check that fails any future workflow PR missing concurrency
- **CODEOWNERS** — REGISTRY.md is human-only (no bot co-owner)

### Phase 2 + Defense #1 — Snapshot PR auto-merge contract + Kill switch (PR #920)

- **`.github/snapshot-paths.yml`** — allowlist of paths a bot can auto-merge
- **`.github/scripts/snapshot-pr-helper.mjs`** — three-gate validator (author + branch + paths), all-or-nothing; rejects mixed PRs with an explanatory comment
- **`.github/workflows/snapshot-pr-auto-merge.yml`** — orchestrator on `pull_request_target`, base-branch checkout (defends against PR-head tampering)
- **Kill switch** — `.github/automation-paused` presence-based global emergency stop. Every state-mutating automation checks this first. `.github/AUTOMATION_PAUSED.md` is operator docs.

### Governance-of-Governance design (PR #921)

The load-bearing design doc. Specifies the four-defense model and re-designs Phases 3+4+5 to inherit them.

### Pushover helper — Defense #2 (PR #922 base)

- **`.github/scripts/pushover-notify.mjs`** — pure-function paging helper. Graceful no-op when secrets missing. Priority 2 (emergency retry-until-ack) clamped DOWN to 1. Audit log line on every call.

### Phase 3 — Workflow Health Warden (PR #923, merged into #922 chain)

- **Daily monitor** at 13:13 UTC. Reads REGISTRY.md, fetches recent run history, applies tier-based response:
  - T1 red >1h → Pushover P1 + `priority/p0` issue
  - T2 red >24h → `priority/p1` issue
  - T3 ≥10 fails → `gh workflow disable` + Pushover P2
- **Re-enable is CODEOWNER-only** (`gh workflow disable` is in the script; `gh workflow enable` is intentionally NOT — verified by source-scan tests).
- **DRY_RUN=true default** for first 7 days post-merge (PR #926 in chain). Manual flip required to go live.

### Phase 5 — FRIDGE semantic check (PR #928, merged into #922 chain)

- **LLM-based judgment proxy** for the 5 FRIDGE rules requiring code-semantic understanding (rules 1, 2, 4, 6, 8). Other 5 rules already deterministic.
- **V1 advisory only** — posts a structured comment on Red-tier PRs; does NOT block merge. Pushover P2 on `fail` so operator can intervene.
- **V2 (future)** adds Grok as 2-party consensus + promotes to required check.

### Phase 6 — Coherence Check (PR #927, merged into #922 chain)

- **Daily drift detector** at 14:14 UTC + on PR touching governance paths.
- **7 invariants**: registry↔filesystem (both directions), concurrency presence, kill-switch coverage, notify import, doc link resolution, no pause-on-main.
- **Tracking issues opened** per failing check; one Pushover P0 summary per run.

### Phase 4 Defense #4 — Monthly Governance Audit (PR #929, merged into #922 chain)

- **1st of each month at 13:00 UTC**. Scans previous calendar month's workflow logs for `*_AUDIT:` lines, aggregates, posts one rolling issue.
- Frame: **consent, not health**. "What changed, and was that wanted?"

### Phase 4 Part A — Workflow Budget Gate (PR #930, merged into #922 chain)

- **PR-time gate**: adding a workflow requires `retires: <file>` (with matching deletion in the same PR) OR `budget-exception: <reason>`.
- Fails-open under the kill switch (budget is bureaucracy, not safety).
- Modifications + removals exempt.

### Pre-commit branch guard (PR #924)

- **`.githooks/pre-commit`** — local safety net. Blocks commits to `main`/`master`, detached HEAD. Prints branch + staged files on every commit.
- **Per-clone activation** via `git config core.hooksPath .githooks`.
- Caught a real branch-state inconsistency during its own commit; the worktree pattern is the stronger structural fix.

---

## Operator quick-reference

### Where things live

| Concern | Location |
|---|---|
| Workflow tier classification | [`.github/workflows/REGISTRY.md`](../.github/workflows/REGISTRY.md) (human-only edit) |
| Snapshot auto-merge allowlist | [`.github/snapshot-paths.yml`](../.github/snapshot-paths.yml) (CODEOWNER edit) |
| Kill switch (emergency stop) | Commit `.github/automation-paused` (any non-zero file content) |
| Kill switch operator docs | [`.github/AUTOMATION_PAUSED.md`](../.github/AUTOMATION_PAUSED.md) |
| FRIDGE rules being judged | [`docs/supervisor/FRIDGE.md`](../docs/supervisor/FRIDGE.md) |
| Lifecycle base decision | [`docs/decisions/2026-05-23-workflow-lifecycle.md`](../docs/decisions/2026-05-23-workflow-lifecycle.md) |
| Governance-of-governance | [`docs/decisions/2026-05-23-governance-of-governance.md`](../docs/decisions/2026-05-23-governance-of-governance.md) |
| Helper script docs | `docs/runbooks/{snapshot-pr-contract,external-alerting,workflow-health-warden,coherence-check,fridge-semantic-check,governance-audit,workflow-budget-gate}.md` |

### Day-to-day operator interactions

| Scenario | Action |
|---|---|
| New snapshot path needed | PR editing `snapshot-paths.yml`; CODEOWNER review |
| Workflow tier reclassification | PR editing `REGISTRY.md`; CODEOWNER review |
| Emergency stop everything | Commit `.github/automation-paused` |
| Resume automation | PR deleting `.github/automation-paused` |
| Warden quarantined a workflow | Fix root cause, then manually `gh workflow enable <wf>` (intentionally not automated) |
| New workflow won't merge (budget gate fail) | Add `retires:` (with deletion) OR `budget-exception:` to PR body |
| FRIDGE check shows uncertain/fail incorrectly | Add `FRIDGE-rule-N-ack` to PR body OR `fridge-bypass` label (CODEOWNER) |
| Drift issue opened by Coherence Check | Fix the violation listed in the issue; close after fix lands |

### Required secrets (must exist for full functionality)

- `FACTORY_APP_ID` + `FACTORY_APP_PRIVATE_KEY` — factory-cross-repo App, already used
- `PUSHOVER_USER_KEY` + `PUSHOVER_APP_TOKEN` — for paging. Without these, automations no-op gracefully (no failures).
- `ANTHROPIC_API_KEY` — for FRIDGE semantic check. Without it, FRIDGE check skips cleanly.
- `STUDIO_EMAIL` + `STUDIO_PASSWORD` — for smoke-admin-studio probe (mentioned in #908)
- `GH_PAT` — for launch-readiness scorecard push (mentioned in #908)

---

## Known followups (deferred from this session)

### High priority
- **Add the 3 secrets** flagged in PR #908 body: `STUDIO_EMAIL`, `STUDIO_PASSWORD`, `GH_PAT`. Without them, smoke + scorecard workflows stay yellow.
- **Add `ANTHROPIC_API_KEY` secret** if not already present (FRIDGE check needs it; check exists `LATIMER_ANTHROPIC_API` alias per memory).
- **After Warden runs in dry-run for 7+ days**: flip `WARDEN_DRY_RUN` default to `'false'` in a follow-up PR. Open the PR with a summary of the dry-run audit lines showing false-positive rate is acceptable.
- **Factory-admin-ui-ci startup_failure** — diagnosed during the session to commit `5137ed87` (capabilities-e2e job addition); root cause not fully pinned. Inspect the run page in web UI for the annotation; fix or revert the addition.

### Medium priority
- **SHA-pin all GitHub Actions references** (currently uses `@v6` tag pins). 200+ refs across 95 workflows. Best done via a tool like `pin-github-actions` + manual review.
- **Flip `allowed_actions: "all"` → `"selected"`** at org policy level. Supply-chain hardening.
- **Flip `sha_pinning_required: false` → `true`**. Same.
- **CI-side branch guard** — server-side backstop to PR #924's pre-commit hook. The worktree is the primary defense; this is belt-and-braces.
- **Phase 5 V2** — add Grok as 2-party consensus model + promote FRIDGE check to required. Land after V1 has been observed for ~30 days.

### Low priority
- **60 dependabot vulnerabilities** (2 high, 51 moderate, 7 low). Per-vuln content work.
- **Phase 4 Part C** — Tier-1 dashboard line in `factory-status-dashboard`. Cosmetic; the data is already surfaced in 4 other places (Warden audit lines, Coherence Check, governance audit, existing status-dashboard).
- **Dedupe inlined `isAutomationPaused`** — 4 scripts each carry a 1-line copy. Extract to `.github/scripts/automation-paused.mjs` once a 5th caller appears.

---

## Lessons learned (worth remembering)

### Branch hygiene at scale

The session hit **3 wrong-branch commits** before switching to a dedicated `factory-lifecycle/` worktree. The pre-commit hook (PR #924) caught one of them; the structural fix was the worktree.

**Pattern that worked:** `cd ../factory-lifecycle && <commands>` for every Bash invocation. The harness resets cwd after each call, so the prefix is mandatory. The worktree's isolation prevented IDE/extension-driven branch switches that bit the main checkout.

**Pattern that failed:** trusting `git checkout -b` to succeed. When uncommitted changes block it, the output prints `Aborting` but the exit code may be 0 in some contexts, and tail-piped output buries the message. Use `git switch -C <branch> <ref>` instead — atomic, fails loud.

### Design pivots that paid off

Three external prompts forced material design changes; honoring them strengthened the result:

1. **External review** about hallucination damage → produced the four-defense addendum (#921). Best load-bearing artifact of the session.
2. **Operator self-assessment** as button-presser → moved Phase 5 (FRIDGE check) from "last" to higher priority. The judgment-proxy is now the operator's primary semantic gate on Red-tier PRs.
3. **Operator question** about coherence/drift measurement → produced Phase 6 (Coherence Check). Filled a real gap between PR-time gates and human review.

### What I'd do differently next session

- Open the worktree FIRST, before any multi-PR work. The structural fix is cheaper than the recovery cost from one wrong-branch commit.
- Use `git switch -C` everywhere, not `git checkout -b`.
- After every `git switch` / `git stash pop` / `git rebase`, verify with `git branch --show-current` BEFORE the next operation.
- For complex multi-PR chains, document the dependency graph in the PR bodies so reviewers can sequence approvals correctly.

---

## Numbers

| Metric | Value |
|---|--:|
| PRs opened this session | 9 (one was #926, a Warden dry-run follow-up) |
| PRs merged at close | #908 + the in-flight cascade |
| New code (excluding generated artifacts) | ~4,700 lines |
| New tests | 156 (across 7 test files) |
| Decision docs added | 2 |
| Runbooks added | 7 |
| New workflows on main (post-cascade) | 7 (snapshot-pr-auto-merge, workflow-health-warden, coherence-check, fridge-semantic-check, governance-audit, workflow-budget-check, workflow-concurrency-check) |
| Existing workflows modified | 14 (13 concurrency adds + scripts-tests Node test runner) |
| Branch hygiene incidents (pre-worktree) | 3 |
| Branch hygiene incidents (post-worktree) | 0 |

---

## Closing

The system is meaningfully more disciplined than it was at session start. The four-defense model is in place, the judgment-proxy fills the button-presser gap, the drift detector closes the "how do we know it's still coherent" question, and the worktree pattern prevents the multi-process interference that would otherwise plague future agent work in this repo.

When the cascade completes (PRs #919-#924 landing), the structural work is done. The followups list above is real but not blocking.

— Session closed 2026-05-24.
