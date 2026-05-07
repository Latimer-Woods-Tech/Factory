# Agent Protocol

Contract every subagent prompt links to. Defines how multiple agents work in parallel without colliding, lying about progress, or stacking broken commits on main.

This is binding. A subagent that ignores this protocol is failing the task, not just being sloppy.

## Why this exists

May 1 2026: 7 UI/UX subagents shipped 7 PRs. 5 of 7 got merged to main without ever running locally. One PR (#46) violated a route-table contract enforced by tests; CI caught it on push but the merges already stacked. Production sat on an old SHA for 80 minutes, eight consecutive failed deploys, before the breakage was diagnosed.

Every failure mode that day is mechanical and preventable. This protocol fixes them.

## The contract

### 1. One issue per task

Every subagent task starts as a GitHub Issue using the `agent-task` template. Free-form prompts without an issue ID are rejected. The issue is the unit of coordination — branch names, status comments, PR links, deploy SHAs all reference it.

### 2. Claim before you start

First action on receiving an issue is to add the label `agent:claimed:<your-name>` (e.g. `agent:claimed:claude-code`, `agent:claimed:sauna-1`). If the issue is already claimed, post a `/status state:blocked` comment and stop. Never silently overlap.

Claim labels expire if the agent goes idle >30 minutes without a status comment. The coordinator (or a human) may release a stale claim by removing the label.

### 2a. Label semantics

The repo seeds and maintains these labels via `.github/agent-labels.json` and `.github/workflows/sync-agent-labels.yml`:

| Label | Meaning | Used by |
|---|---|---|
| `agent:claimed:*` | Issue is actively claimed by the named agent. Only one claim label should be present at a time. | Claim protocol, project board Agent field, PR digest |
| `status:in_progress` | Work started and agent is actively implementing or validating. | Project board status, coordinator filtering |
| `status:blocked` | Work is paused on a dependency, failing test, secret, or human decision. | PR digest, coordinator triage |
| `status:done` | Agent completed implementation and posted the final `/status state:done` update. | Merge triage |
| `status:abandoned` | Agent stopped without handing off a mergeable result. | Coordinator reassignment |

Status labels are optional mirrors of the required `/status` audit trail. If they drift, update the `/status` comment first, then reconcile or remove the stale label before relying on project-board filters.

### 3. Branch naming

`agent/<your-name>/<issue-number>` — e.g. `agent/claude-code/127`. No exceptions. This makes branches grep-able, sortable, and trivially garbage-collectable.

### 4. Status comments

Post a `/status` comment on the issue at three checkpoints minimum: start, mid (or any blocker), and end. Use this exact shape:

```
/status
state: in_progress | blocked | done | abandoned
branch: agent/<name>/<issue#>
files: path/one.js, path/two.css
tests: ran=true|false, passing=true|false
notes: <plain-English context, blockers, decisions>
```

The fields are machine-readable. Coordinators and dashboards parse them. Don't decorate, don't paraphrase, don't omit.

Project-board automation now treats the issue audit trail as canonical. Claim labels, assignees, linked PRs, and `/status` comments drive the shared project board, and missing cards are backfilled automatically. Agents should update the issue state, not manually curate the board.

### 5. Tests must run locally

Before posting `state: done`, you must:

1. Run the full deterministic test suite locally (`npm run test:deterministic` in HumanDesign, package-specific equivalent elsewhere)
2. Run any contract tests touched by your change
3. Confirm `passing=true` honestly — if anything failed and you couldn't fix it, post `state: blocked` with the failure pasted in `notes`

A subagent posting `tests: ran=true, passing=true` without actually running the tests is the single most damaging failure mode in this system. Don't do it.

### 6. Open a PR, don't merge

Subagents open PRs. Subagents do not merge to main. The coordinator (or human) merges only after:

- All required status checks green on the PR's head SHA: `CI / validate`, `CodeQL Security Analysis / Analyze (javascript)`, and `Dependency Review / dependency-review`
- The PR body references the issue (`Closes #N`)
- The agent's final `/status state: done` comment is on the issue

Today's `gh pr merge --merge` straight from a subagent is forbidden by this protocol.

### 7. Coordinator pattern for parallel batches

When >2 agents work in parallel, work goes through `integration/<sprint-id>` rather than landing directly on main. Pattern:

1. Coordinator creates `integration/2026-05-01-ui` branch off main
2. Each agent's PR targets `integration/2026-05-01-ui`
3. Coordinator rebases each agent's branch onto integration as PRs land, runs full test suite + dry-run deploy against integration
4. Only after integration is fully green does coordinator open a single fast-forward PR from integration to main

This eliminates the stack-up class outright. Worth the overhead any time agents touch overlapping files (route tables, shared CSS, schema, tests).

### 8. Post-merge verification

Within 60 seconds of merge, the merger (coordinator or human) must:

1. Confirm `deploy-frontend` and `deploy-workers` workflow runs are queued for the merge SHA
2. Wait for both to complete
3. Confirm production is serving the new SHA via the smoke endpoint

If any of these fail, the merger triggers `deploy-recovery.yml` or rolls back. Do not start the next merge until the current one is verified live.

### 9. Honest reporting

When something doesn't work, say so plainly. `state: blocked` with the actual error in `notes` is always preferable to a soft-pedaled `state: done`. The cost of a blocked task that needs help is small. The cost of a "done" task that's secretly broken is hours of debug time and a stalled main.

## Quick reference

| Phase | Subagent action |
|---|---|
| Receive issue | Read body, check labels, claim with `agent:claimed:<name>` |
| Start work | Post `/status state:in_progress` with branch name |
| Hit blocker | Post `/status state:blocked` with details, stop |
| Finish | Run full tests locally, open PR, post `/status state:done` |
| Never | Merge to main, claim a labeled issue, declare done without tests |

## When to escalate to a human

- Tests fail after 2 attempts to fix
- Issue body is ambiguous (acceptance criteria unclear)
- Your change touches a contract test (route tables, schema, public API surface) — a human reviewer is required
- Your change requires a secret rotation, infra provisioning, or external service config change
- You discover the issue belongs to a different sprint or owner

## Versioning

This protocol is versioned via git history. Material changes require a PR with `process` label and at least 24h review window. Rev bumps go in the changelog at the bottom.

---

**v1.1** — 2026-05-07 — Added explicit required-check gate and clarified that project-board state is derived from issue/PR audit trail plus self-healing sync.

**v1.0** — 2026-05-01 — Initial protocol after the May 1 stack-up incident.
