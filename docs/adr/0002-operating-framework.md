# ADR-0002: Operating Framework — Milestone-Based Execution

- **Status:** Accepted
- **Date:** 2026-05-11
- **Deciders:** @adrper79-dot
- **Tags:** governance, process

## Context

The cohesion + tracker v2 + sellability roadmap is ~6 weeks of platform work plus 23 surfaced considerations. Without an operating framework, "yes to all of it" produces parallel half-finished workstreams. Memory shows the failure mode already present: 34 PRs in 30 hours, 9 days at zero customers, shipping velocity at all-time-high while revenue is flat.

The framework needs to: limit WIP, prevent scope creep, make trade-offs visible, force decisions early, and let the operator (you) sleep without 30 open PRs in the back of your head.

## Decision

We will adopt the 10-rule operating framework in `docs/OPERATING_FRAMEWORK.md`, summarized:

1. One milestone in flight at a time
2. Time-boxed at 2 weeks max
3. Dependency-ordered (6-stage sequence committed)
4. Shadow mode default for anything that gates
5. WIP cap: 3 open PRs per repo
6. Definition of Ready before starting
7. Definition of Done before exiting
8. Documented + tested rollback per milestone
9. ADRs for every architecturally significant call
10. Quarterly customer gate (the 5 questions test)

Cadence: Monday 06:30 ET weekly review + daily Pushover digest + quarterly strategic review.

## Alternatives considered

1. **Kanban with no WIP cap.** Rejected: that's what we have now. Produces 34 PRs in 30 hours and zero customer traction.

2. **Strict waterfall (sequential, no parallelism even within milestones).** Rejected: solo founder, small scope; some intra-milestone parallelism (e.g., draft ADR while implementation PR opens) is fine.

3. **Pure Scrum (sprints, retros, story points).** Rejected: ceremony overhead exceeds value at solo-founder scale. Reconsider when team grows past 3 contributors.

4. **No framework, "just ship."** Rejected: the question that prompted this ADR was specifically "how do we ship without headaches." Lack of framework is the headache.

## Consequences

- **Positive:**
  - One thing at a time = each thing actually ships.
  - WIP cap prevents the 30-PR-open situation.
  - Quarterly customer gate ensures we don't ship platform forever while revenue stagnates.
  - Shadow mode = enforcement never breaks production.
  - ADR culture = decisions don't get re-litigated.
  - Defensible to future hires / collaborators ("here's how we work").

- **Negative:**
  - Slower than maximum-velocity-no-rules. Estimated 20% slower throughput.
  - Requires discipline. Easy to abandon when "just one more PR" feels urgent.
  - The Monday review is itself work (~30 min / week).

- **Neutral:**
  - Compatible with existing supervisor loop (the supervisor opens issues; this framework governs how we work through them).
  - Compatible with Factory's existing FRIDGE rules (FRIDGE wins on conflict).

## Rollback

The framework can be paused or abandoned. To roll back:

1. Open an ADR explaining the failure mode and the new approach.
2. Revert this ADR's status to `Superseded by ADR-NNNN`.
3. Update OPERATING_FRAMEWORK.md or replace it.
4. Notify any contributors / agents that have loaded the old framework.

Estimated rollback effort: 1–2 hours.

Triggers for rollback consideration:
- Three consecutive milestones fail to exit on time (signal: stages too big or framework too rigid)
- Customer signals deteriorate for 2 consecutive quarters during platform-work milestones (signal: prioritizing platform over revenue)
- Framework rules being followed by exception more than by rule (signal: framework is wrong)

## Implementation

- [x] `docs/OPERATING_FRAMEWORK.md` written
- [ ] First weekly review scheduled (Monday 2026-05-18 06:30 ET)
- [ ] Daily Pushover digest format updated to include WIP per repo + current milestone status
- [ ] Stage 0 PR merged (this PR)
- [ ] Stage 1 milestone (M1: conformance + cohesion score in shadow) kicked off after merge

## Links

- ADR-0001: Cohesion Architecture (companion)
- `documents/factory/2026-05-11_OPERATING_FRAMEWORK.md`
- `documents/factory/2026-05-11_COHESION_AND_STANDARDS_ARCHITECTURE.md`
- `docs/supervisor/FRIDGE.md` (Factory)
