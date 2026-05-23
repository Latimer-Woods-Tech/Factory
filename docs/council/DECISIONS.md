# Council Decisions

Append-only summary of final council decisions.

## Decision Log

### C-001 — Capability Factory backcasting and thin-slice plan

- Date: 2026-05-22
- Outcome: approved
- Primary artifact: [001-capability-factory-backcasting.md](./inquiries/001-capability-factory-backcasting.md)
- Summary: The council approves Option 3 as the program path. Factory will continue with a recipe-first provisioning engine, prove the `outbound-dialer` thin slice end to end, and delay any unconstrained visual composer work until the registry, compiler, staging provision path, and plan preview seam are real. The council should deliver back a golden-path implementation plan for the shared endstate, not a split v1/v2 infrastructure strategy.
- Conditions:
	- `outbound-dialer` remains the only approved first thin slice until staging provisioning, `/health`, `/manifest`, and plan preview evidence exist.
	- No freeform visual canvas or generalized runtime orchestration work enters v1 scope before the thin-slice proof gate is closed.
	- The council must avoid separate v1/v2 infrastructure designs; it should design the endstate first and slice into it.
	- Recipe expansion beyond the first slice requires explicit ownership, admission criteria, and lifecycle rules.
- Next actions:
	- Continue the registry, compiler, and provisioning workstream.
	- Define the thin-slice proof gate as a concrete checklist before breadth expansion.
	- Add Studio catalog and plan preview only on top of the same compiled plan contract.
	- Deliver a golden-path plan that the implementation team will execute.

## Format for new decisions

```md
### C-### — Title

- Date: YYYY-MM-DD
- Outcome: approved | deferred | rejected | superseded
- Primary artifact: [link](./inquiries/...)
- Summary: one paragraph
- Conditions: optional bullets
- Next actions: optional bullets
```