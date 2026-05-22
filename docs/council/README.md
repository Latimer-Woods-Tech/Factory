# Council Space

The council space is the persistent governance workspace for cross-cutting Factory inquiries.

Use it when a question needs:

1. durable context
2. explicit options and tradeoffs
3. structured review
4. a recorded decision
5. traceability from inquiry to implementation

This directory is the canonical workspace for council review. Chat can start an inquiry, but the inquiry becomes real when it is written here.

## What belongs here

1. inquiry briefs that need review across architecture, product, design, operations, or platform
2. decisions that affect multiple teams, packages, or services
3. council-level follow-up actions and owners
4. references to supporting RFCs, plans, and implementation docs

## What does not belong here

1. one-off chat summaries with no decision needed
2. package-level implementation notes that belong in package docs
3. incident response notes that belong in postmortems or runbooks
4. routine project management updates with no council decision

## Files

1. `INDEX.md` — active and historical inquiry register
2. `TEMPLATE.md` — standard inquiry template
3. `DECISIONS.md` — append-only summary of final council decisions
4. `inquiries/` — one document per inquiry

## Workflow

1. Create a new inquiry from `TEMPLATE.md`.
2. Assign status: `draft`, `review`, `approved`, `deferred`, `rejected`, or `superseded`.
3. Link supporting materials.
4. Capture open questions for the council explicitly.
5. Record the outcome in `DECISIONS.md` once a decision is made.
6. Link resulting implementation artifacts back to the inquiry.

## Naming

Use a stable numeric sequence plus a short slug:

1. `001-capability-factory-backcasting.md`
2. `002-outbound-dialer-thin-slice.md`

## Ownership

1. Council facilitator owns `INDEX.md` freshness.
2. Inquiry author owns the inquiry document until decision.
3. Platform or domain owner owns implementation follow-through after approval.

## Review standard

An inquiry is ready for council only when it includes:

1. clear problem statement
2. recommended path
3. alternatives considered
4. explicit asks of the council
5. decision consequences
6. next actions if approved

## First use

The first seeded inquiry is the capability-factory backcasting and build path based on:

1. `docs/CAPABILITY_FACTORY_BACKCASTING_PLAN.md`

That inquiry establishes the operating pattern for future council use.