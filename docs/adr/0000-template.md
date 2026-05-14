# ADR-NNNN: <Decision title>

- **Status:** Proposed | Accepted | Superseded by ADR-NNNN | Deprecated
- **Date:** YYYY-MM-DD
- **Deciders:** @adrper79-dot, <other reviewers>
- **Tags:** <stack | security | schema | workflow | governance | other>

## Context

What's the situation? What problem are we solving? What constraints apply (FRIDGE rules, existing ADRs, technical limits, budget)? Cite specific files / PRs / incidents where relevant.

Keep this short. If context needs more than ~300 words, link to a separate design doc and summarize here.

## Decision

The decision, stated as an imperative. Not "we should consider" — "we will."

Example: "All Worker auth flows will use `@latimer-woods-tech/auth@^0.4`. New code that hand-rolls JWT verification will fail conformance."

## Alternatives considered

At least two viable alternatives, briefly. Why we rejected each.

1. **Alternative A:** <description>. Rejected because <reason>.
2. **Alternative B:** <description>. Rejected because <reason>.

If no real alternatives existed, say so explicitly — that's a signal worth recording.

## Consequences

What does this make easier? What does it make harder? What new constraints does it impose? Be honest about the trade-offs.

- **Positive:** <consequence>
- **Negative:** <consequence>
- **Neutral:** <consequence>

## Rollback

How do we undo this if we're wrong? Specifically:
- What command / PR / revert sequence reverses the decision?
- What's the data-migration cost (if any)?
- Estimated effort to roll back (hours / days)?
- Conditions that would trigger rollback consideration.

If rollback is genuinely irreversible, mark this section `IRREVERSIBLE — see Context for one-way-door rationale.`

## Implementation

- [ ] PR opening the change: <link or "to be filed">
- [ ] Conformance dimension updated (if applicable): <which §, what check>
- [ ] PLATFORM_STANDARDS.md updated: <section>
- [ ] Supervisor templates updated (if applicable): <template name>
- [ ] Communicated to: <list>

## Links

- Related ADRs: <list>
- Related issues / PRs: <list>
- External references (RFCs, vendor docs, etc.): <list>
