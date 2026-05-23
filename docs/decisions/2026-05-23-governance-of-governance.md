---
date: 2026-05-23
decider: adrper79-dot
status: proposed
supersedes: none
amends: 2026-05-23-workflow-lifecycle.md (Phases 3 and 4 sections)
---

# 2026-05-23 — Governance of Governance

Addendum to the [workflow lifecycle decision](./2026-05-23-workflow-lifecycle.md), prompted by external review pointing out a real risk: every additional layer of automation adds both protection AND new surface area for hallucinated or drifted behavior. This decision formalizes the four-defense model that any future state-mutating automation must inherit.

---

## The risk this decision exists to address

Phases 1 and 2 are dominated by deterministic logic (validators, allowlist matching, tier classification). Phase 3 (Workflow Health Warden) is the first surface where automation actively **mutates external state without per-action human review**: it will disable workflow schedules.

External review correctly flagged that without structural defenses:

1. The Warden could disable a critical monitoring workflow based on a transient API hiccup interpreted as "10 consecutive failures"
2. The snapshot helper's allowlist could grow unchecked over time, widening the auto-merge surface
3. Documentation about what the system does could drift from what it actually does
4. The same layer producing health reports could itself be compromised — making the report unreliable

These aren't hypothetical. Incident #529 already happened in this codebase (a single bad branch-protection edit hid for hours). Defense against a future incident of the same class requires more than careful coding.

---

## Decision: every state-mutating automation inherits four defenses

| # | Defense | What it does | Already built? |
|---|---|---|---|
| **1** | **Kill switch** — `.github/automation-paused` | Single presence-based file. Every state-mutating automation consults `isAutomationPaused()` FIRST, exits clean if present. Single chokepoint for the entire surface. | **✅ Shipped in PR #920** (Phase 2 + kill switch) |
| **2** | **External alerting** | Every state-mutating action emits a Pushover notification to `adrper79`. Out-of-band visibility — does not share failure modes of the system being watched. | Pre-Phase 3 (this doc) |
| **3** | **Bounded blast radius** | Each automation is structurally limited to actions whose worst-case damage is bounded and reversible. Enforced in code + asserted in tests + documented in the runbook. | Pre-Phase 3 (this doc) |
| **4** | **Monthly governance audit** | A scheduled workflow that aggregates: quarantines, snapshot approvals, registry edits, allowlist expansions. Fixed report format. Renders a single issue for human review. | Pre-Phase 4 (this doc) |

Defenses 1, 2, and 3 are **mandatory pre-Phase-3**. Defense 4 is **mandatory pre-Phase-4**.

---

## Defense 1 — Kill switch (already shipped)

Status: ✅ Live in PR #920.

Contract for any new automation:
```js
import { isAutomationPaused } from '../scripts/snapshot-pr-helper.mjs';
if (isAutomationPaused()) {
  console.log('⏸  Automation paused. Skipping.');
  process.exit(0);  // exit clean — paused is not an error
}
```

Or equivalent in bash:
```bash
if [ -f .github/automation-paused ]; then
  echo "::notice::Automation paused — skipping state-mutating action"
  exit 0
fi
```

No automation MAY mutate state without consulting this first. The Warden's audit logic (Phase 3) and the budget gate's PR validation (Phase 4) MUST include explicit tests proving the kill switch is honored.

---

## Defense 2 — External alerting

Every state-mutating action emits a Pushover P2 notification with a structured body. Pushover is an external service — failure modes do not overlap with GitHub Actions or our own workflow logic.

**What triggers a notification:**
- Snapshot PR auto-approved + auto-merged (Phase 2)
- Snapshot PR rejected (Phase 2)
- Workflow auto-quarantined (Phase 3)
- Workflow re-enabled after quarantine (Phase 3, future)
- New workflow added without `retires:` and without exception ack (Phase 4)
- Allowlist expanded in `snapshot-paths.yml` (any phase)
- Kill switch armed or cleared (cross-cutting)

**Notification format** (deliberately minimal — Pushover messages should fit on a lock screen):
```
[Factory · <action>] <subject>
<one-line context>
<short URL to GH run or PR>
```

Example:
```
[Factory · QUARANTINE] smoke-admin-studio (Tier-2)
10 consecutive failures since 2026-05-21
https://github.com/.../actions/runs/12345
```

**Implementation:**
- New `.github/scripts/pushover-notify.mjs` — pure helper. Reads `PUSHOVER_USER_KEY` and `PUSHOVER_APP_TOKEN` from env. No-op if either is missing (so the Warden doesn't fail in dev/test envs).
- Existing automations get the call wired in by their PR. New ones MUST include it.

**Pre-Phase 3 work item:** Write `pushover-notify.mjs` + tests. Land alongside Phase 3 in the same PR so the Warden ships with paging from day one.

---

## Defense 3 — Bounded blast radius

Each automation declares its damage envelope in its own header AND has tests that prove it can't exceed that envelope.

### Workflow Health Warden (Phase 3)

**CAN do:**
- Read workflow run history via `gh api`
- Disable a workflow's schedule via `gh workflow disable`
- Open an issue with a fixed template
- Post a Pushover notification

**CANNOT do (enforced in code AND tested):**
- Delete a workflow file
- Modify a workflow file's content
- Modify any other file
- Push code to any branch
- Approve or merge any PR
- Modify branch protection or rulesets
- Re-enable workflows it has quarantined (intentional — re-enable is a CODEOWNER action)

### Budget gate (Phase 4)

**CAN do:**
- Read PR diff
- Read PR body
- Fail the check (block the PR)
- Post an explanatory comment

**CANNOT do:**
- Modify any file
- Approve, merge, or close the PR
- Modify CODEOWNERS or ruleset

**Enforcement:** Each automation's PR must include a section in its runbook titled "Blast radius" that lists its CAN/CANNOT explicitly, AND its test suite must include negative tests proving it cannot perform the CANNOT actions (e.g., "Warden's code does not contain the string `workflow delete`", "Warden's GITHUB_TOKEN permissions block does not include `actions: write` for paths that would let it delete").

---

## Defense 4 — Monthly governance audit

A scheduled workflow that produces a single GitHub issue, the 1st of each month, summarizing what the automation surface did. The issue is the human-readable receipt of the past month's autonomy.

### Workflow

- **File:** `.github/workflows/governance-audit.yml`
- **Schedule:** `0 13 1 * *` (1st of month, 13:00 UTC — after morning-digest, before EOD)
- **Tier:** T2 (Operational) — red ≤ 24h
- **Trigger:** `schedule` + `workflow_dispatch`

### Report format

A single GitHub issue, fixed sections, filed against `adrper79-dot`:

```markdown
# Factory Governance Audit — <YYYY-MM> · period <YYYY-MM-DD>..<YYYY-MM-DD>

## 1. Automation actions (the receipt)
| Action | Count | Detail |
|---|--:|---|
| Snapshot PRs auto-merged | NN | links to top 5 most recent |
| Snapshot PRs rejected | NN | links to all (rejections should be rare) |
| Workflows auto-quarantined | NN | name + first-failure-date + still-quarantined? |
| Workflows re-enabled | NN | name + reason from issue body |
| Allowlist (`snapshot-paths.yml`) edits | NN | links to PRs |
| Registry (`REGISTRY.md`) tier changes | NN | links to PRs |
| Kill switch armed/cleared | NN | timestamps |

## 2. Drift indicators (the smoke test)
- Tier-1 red >1h count: NN  (acceptable: 0)
- Tier-1 red total hours: NN (acceptable: <2)
- Median age of open snapshot PR: NN min  (acceptable: <15)
- Workflow count: NN  (was NN last month; delta NN)
- Files in snapshot allowlist: NN  (was NN; delta NN)
- Files in workflow REGISTRY: NN  (was NN; delta NN)

## 3. Doc / behavior drift (the audit)
For each automation: is the doc still accurate?
- [ ] `snapshot-pr-helper.mjs` — runbook current?
- [ ] Workflow Health Warden — runbook current?
- [ ] Budget gate — runbook current?
- [ ] REGISTRY.md tiers match observed behavior?

(Audit script runs `git log --since=<period> -- <runbook>` to surface stale docs.)

## 4. Action items
- [ ] Re-enable any wrongly-quarantined workflows
- [ ] Close any allowlist expansion that wasn't justified
- [ ] Update any stale runbook flagged in §3
- [ ] If item 2 is red: file P1 issue
```

### What makes this audit different from existing audits

The repo already has `cohesion-courtesy-check`, `doc-freshness-audit`, `policy-drift-guard`, `automation-reliability-loop`, etc. The governance audit is **not** another check — it's a **roll-up of what the bots did** that pulls from those individual signals into one human-readable receipt.

It does NOT try to detect "is the system healthy" (other workflows do that). It surfaces "what changed in the automation surface, and was that change wanted." The frame is consent, not health.

---

## Phase 3 — Workflow Health Warden (re-designed)

Replaces the Phase 3 section in the original lifecycle decision.

### What it does

A scheduled workflow that runs once a day, reads `.github/workflows/REGISTRY.md`, and for each registered workflow:

1. Fetches the last 20 runs via `gh api`
2. Computes consecutive-failure count
3. Applies tier-based response:

| Tier | Trigger | Action |
|---|---|---|
| T1 | red >1h | Pushover P1 + open `priority/p0` issue (dedup by title) |
| T2 | red >24h | Open `priority/p1` issue + add to monthly digest |
| T3 | ≥10 consecutive failures | `gh workflow disable` + open `workflow-quarantined` `priority/p1` issue + Pushover P2 |

### Inherits the four defenses

1. **Kill switch:** First action in the script — `if (isAutomationPaused()) exit 0`. Tested with a fixture file.
2. **External alerting:** Pushover on EVERY action (paged for T1/T2; logged for T3 quarantines).
3. **Bounded blast radius:** Can disable schedules + open issues. CANNOT delete, modify, push, approve, merge, or modify branch protection. Tested with negative assertions on the workflow YAML's `permissions:` block (no `actions: write` granted; no `contents: write` granted).
4. **Monthly audit visibility:** Every quarantine action is captured in the governance audit's §1 table.

### Files (planned)

- `.github/workflows/workflow-health-warden.yml`
- `.github/scripts/workflow-health-warden.mjs` (with tests)
- `.github/scripts/pushover-notify.mjs` (with tests) ← Defense #2 helper
- `docs/runbooks/workflow-health-warden.md` (including blast radius section)

### Acceptance criteria

- [ ] Tests prove kill switch is honored (paused → no `gh workflow disable` called)
- [ ] Tests prove blast radius (no `delete`, `merge`, `approve` in code path)
- [ ] Pushover notification verified end-to-end on a simulated T1 failure
- [ ] Dedup verified (running twice doesn't create duplicate issues)
- [ ] Re-enable flow documented as **human-only** (CODEOWNER must `gh workflow enable` after fixing root cause)

---

## Phase 4 — Budget gate + Tier-1 dashboard (re-designed)

Largely unchanged from the original decision, with the four-defense layer formalized:

### Inherits the four defenses

1. **Kill switch:** Budget check fails-open (advisory only) when paused.
2. **External alerting:** Pushover on every "new workflow without retires/exception ack" event.
3. **Bounded blast radius:** Can fail the check + post a comment. CANNOT modify any file. Verified in workflow `permissions:` block.
4. **Monthly audit:** Budget-gate denials and exception acks captured in §1 table.

### Acceptance criteria

Same as original decision Phase 4, plus:
- [ ] Test proves the gate cannot modify any file (workflow `permissions:` is read-only contents + read-write pull-requests for comments)
- [ ] Test proves the gate respects the kill switch

---

## What this addendum changes about the rollout

| Original plan | Updated plan |
|---|---|
| Phase 3 → land Warden after Phase 1 green | Phase 3 → land Warden AFTER kill switch (done) + Pushover helper + blast-radius tests are all green. Phase 3 PR ships all four together. |
| Phase 4 → budget gate + dashboard | Phase 4 → same, plus monthly governance audit workflow lands FIRST as its own small PR, then Phase 4 builds on top |
| "Phases land in order" | Now: Phase 1 (in flight #919) || Phase 2+KillSwitch (in flight #920) → Pushover helper PR → Phase 3 → Governance audit PR → Phase 4 |

Two new PRs in the sequence — both small, both load-bearing, both shippable independently.

---

## Why this is the right level of paranoia (not more)

The argument that adding governance ALSO adds surface area is correct, and applies to this addendum too. Defenses 1–4 themselves are automations that can have bugs.

The reason this is the right stopping point — not "five defenses," not "ten" — is that each additional defense has **diminishing protection and increasing complexity**. The four chosen here have the property that each one's failure mode is independent of the others:

- Kill switch fails: defenses 2/3/4 still work (Pushover still fires; blast radius still bounded; audit still runs)
- Pushover fails: defenses 1/3/4 still work (you can still pause; nothing extra gets damaged; you'll see it in the audit)
- Blast radius leaks: defenses 1/2/4 still work (you can pause within minutes of the Pushover alert; audit surfaces the unexpected behavior)
- Audit fails: defenses 1/2/3 still work (real-time alerts still fire; the lapse is visible at the next month's audit)

This is **defense in depth, not defense in series**. Four independent layers means failure of any single layer doesn't compound.

Adding a fifth layer (e.g., "second independent alerting channel") would add value but at a cost — every layer needs maintenance, tests, runbook, and a human who knows about it. Four is the right ceiling for a one-human-multi-product org.

---

## Consequences

**Positive:**
- Phase 3 (the highest-leverage automation we'd add) ships into a defense-in-depth system, not a bare system
- Every state-mutating action emits an out-of-band signal — operator visibility is no longer dependent on the system being audited
- Blast radius limits are tested, not just documented — code review can verify them
- Monthly audit forces a quarterly+ check on whether documentation matches behavior

**Negative / costs:**
- Two new helper artifacts (`pushover-notify.mjs`, `governance-audit.yml`) — but each is < 200 lines and load-bearing
- Pushover quota usage increases (estimate: 5–30 notifications/month based on current automation cadence; well within free tier)
- Monthly issue adds 1 governance-review touchpoint to the calendar

**Reversibility:**
All four defenses are individually reversible:
- Disable Pushover by clearing `PUSHOVER_USER_KEY` secret
- Disable governance audit via `gh workflow disable`
- Kill switch is presence-based, removing the file resumes
- Blast-radius tests can be deleted (but doing so should require explicit ack in the PR body)

---

## Revisit when

- After the first three months of Phase 3+4 in production: are the Pushover alerts noisy enough to be ignored?
- After the first quarterly governance audit: did it surface any drift that wasn't already known?
- If a real incident occurs that defenses 1–4 did not catch: file a new decision describing the fifth defense the incident reveals
- If the user is paged > 1× per week by Defense #2: tune thresholds OR re-tier the involved workflows

---

## Refs

- [`docs/decisions/2026-05-23-workflow-lifecycle.md`](./2026-05-23-workflow-lifecycle.md) — base decision; this doc amends its Phases 3+4
- [`docs/supervisor/FRIDGE.md`](../supervisor/FRIDGE.md) — rule 6 (single-writer per app via LockDO; orthogonal but compatible)
- PR #919 (Phase 1) — registry + concurrency
- PR #920 (Phase 2 + kill switch) — auto-merge contract + Defense #1
- The external-review prompt that surfaced this risk class (transcript captured in session log 2026-05-23)
