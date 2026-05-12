# ADR-0004: Sub-Agent Fan-Out for Milestone Execution

- **Status:** Accepted
- **Date:** 2026-05-11
- **Deciders:** @adrper79-dot
- **Tags:** governance, ai, throughput

## Context

`OPERATING_FRAMEWORK.md` rule 1 enforces "one milestone in flight at a time" for scope discipline. This was being misread as "one task at a time" — slowing throughput unnecessarily. The clarification: within a single milestone, independent sub-tasks can fan out across parallel sub-agents, each owning a sub-task end-to-end.

Sauna's primitive (per `skills/global/sauna_guide/sub_agents/SKILL.md`) is single-layer fan-out — a parent agent spawns N sub-agents in parallel, each returning a discrete artifact. This was used during the completion-tracker rollout tonight to build 3 feature matrices + the missing label-sync script in parallel.

Memory shows 34 PRs landed in 30 hours one recent stretch — high throughput, low coordination. The opportunity is to **make that throughput intentional** via structured fan-out, not accidental via uncontrolled parallel work.

## Decision

Within a milestone, the operator (you or Sauna) may fan out work across **≤4 parallel sub-agents** when the sub-tasks are independent (no shared files, no order dependency on outputs). Rules:

1. **Fan-out cap: 4 sub-agents per milestone.** More than 4 causes coordination overhead that exceeds the speed-up.
2. **Each sub-agent opens its own atomic PR.** Maximum 1 PR per sub-agent; no nested fan-out (single layer only).
3. **Sub-agent inputs and outputs are declared upfront.** Parent agent defines: scope, expected artifact, success criteria, blockers to escalate.
4. **Sub-agents read PLATFORM_STANDARDS + accepted ADRs as hard constraints** (loaded via `docs/supervisor/CONTEXT.md`).
5. **Each sub-agent's PR goes through `claude-review.yml`** (ADR-0003) and the PR size budget (ADR-0005). No fan-out shortcuts around governance.
6. **Failure isolation:** if one sub-agent's PR fails CI, the other 3 continue. Partial milestone success is acceptable; documented in the milestone exit notes.
7. **Coordination handled at the parent level.** Sub-agents don't talk to each other; the parent reads results and merges them.

The supervisor loop already implements a sequential version of this. The 4x model extends it to parallel execution for sub-tasks the parent classifies as independent.

## Alternatives considered

1. **Serial execution always.** Rejected: slow. Tonight's completion-tracker rollout took ~3 hours; serial would have been ~12.

2. **Unlimited fan-out (no cap).** Rejected: coordination overhead grows non-linearly. Above 4 sub-agents, the parent spends more time merging artifacts than gaining wall-clock speed.

3. **Multi-layer fan-out (sub-agents spawn sub-agents).** Rejected: Sauna primitive is single-layer; multi-layer becomes a tree that's hard to debug, demote, or rollback. Defer to a future ADR if needed.

4. **Always fan out, even for sequential work.** Rejected: forces parallelism on tasks that have real ordering dependencies (migration files, ADR + implementation that must merge in order).

## Consequences

- **Positive:**
  - Milestone wall-clock drops ~3–4x for fan-outable work.
  - Each sub-agent's PR is atomic and reviewable — supports the PR size budget (ADR-0005).
  - Failure of one sub-agent doesn't block the milestone — partial credit ships.
  - Reviewable trail: each sub-agent's work is a separate PR with its own review.

- **Negative:**
  - Coordination overhead at the parent level — the parent agent (Sauna) must merge artifacts and resolve cross-PR conflicts.
  - 4x throughput means 4x review volume (mitigated by Claude reviewer in ADR-0003).
  - Sub-agents may produce inconsistent output across PRs in the same milestone (mitigated by shared CONTEXT.md + ADRs).

- **Neutral:**
  - Compatible with the WIP cap (rule 5 in OPERATING_FRAMEWORK): 3 open PRs per repo. Fan-out across multiple repos avoids the cap.
  - Compatible with supervisor templates — fan-out can spawn 4 instances of the same template against 4 different issues.

## Rollback

Reduce the fan-out cap to 1 in this ADR (effectively serial execution). Update `OPERATING_FRAMEWORK.md` to enforce. Estimated effort: 30 minutes.

Triggers for rollback consideration:
- ≥2 milestones produce inconsistent artifacts across fan-out sub-agents
- Review queue (Claude or human) cannot keep up with 4x PR volume
- Anthropic costs from parallel sub-agent calls exceed 4x the serial baseline (suggests inefficient parallelism)

## Implementation

- [x] Sauna's sub-agent primitive in use (already shipped per skill)
- [ ] Update OPERATING_FRAMEWORK.md to reference this ADR + add §Concurrency Rules pointing here
- [ ] Update supervisor loop to support fan-out template execution (Stage 4)
- [ ] Add fan-out metrics to the daily digest: sub-agents launched / completed / partial / failed (Stage 2)

## Links

- ADR-0001: Cohesion Architecture
- ADR-0002: Operating Framework
- ADR-0003: Claude as Primary Reviewer (companion)
- ADR-0005: PR Size Budget (companion)
- `skills/global/sauna_guide/sub_agents/SKILL.md` (Sauna primitive)
- `documents/factory/2026-05-11_CONCURRENCY_AND_THROUGHPUT.md` (Sauna-side working note)
