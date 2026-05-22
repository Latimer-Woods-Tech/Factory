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

## CLI

Use `scripts/council.mjs` to manage the full inquiry lifecycle from the terminal.

```bash
# Start a new inquiry (auto-increments ID, creates file, updates INDEX.md)
node scripts/council.mjs create --title "Should we add a rules engine?" --owner capability-factory

# Run multi-voice LLM deliberation (4 voices + synthesis — writes back to the file)
node scripts/council.mjs deliberate docs/council/inquiries/002-rules-engine.md

# Preview deliberation output without modifying the file
node scripts/council.mjs deliberate docs/council/inquiries/002-rules-engine.md --no-write

# Skip LLM calls (CI/smoke test mode)
node scripts/council.mjs deliberate docs/council/inquiries/002-rules-engine.md --dry-run

# Record a decision (updates file status + INDEX.md + appends to DECISIONS.md)
node scripts/council.mjs approve C-002 --summary "Approved with conditions" \
  --conditions "Thin slice first; No visual canvas before proof gate" \
  --next-actions "Prove outbound-dialer; Define proof gate checklist"

node scripts/council.mjs defer C-003 --reason "Blocked on staging provisioning proof"
node scripts/council.mjs reject C-004 --reason "Scope too broad; raise a scoped replacement"

# Governance checks
node scripts/council.mjs validate   # cross-check INDEX.md vs files vs DECISIONS.md
node scripts/council.mjs stale      # list inquiries past their desired decision date
node scripts/council.mjs list       # print the inquiry index
```

## Deliberation model

`deliberate` sends the inquiry to four LLM voices in parallel, then runs a synthesis pass:

| Voice | Focus |
|---|---|
| Platform Architect | Abstraction soundness, dependency order, long-term coupling |
| Product Skeptic | Is this needed? Minimum lovable version? Delivery speed |
| Security and Operations | Failure modes, blast radius, rollback, attack surface |
| Delivery Velocity Lead | Incremental delivery, sequencing, hidden scope |
| **Synthesis** | Consensus position, top alternatives, ranked risks, open questions |

The synthesis fills the `Alternatives Considered`, `Risks and Mitigations`, and `Council Questions` sections automatically if they are still stubs.

## GitHub Actions

Opening a PR that adds or modifies a file in `docs/council/inquiries/` automatically triggers the **Council Deliberation** workflow (`.github/workflows/council-deliberate.yml`). It posts deliberation output as a PR comment and runs `validate` + `stale` checks against the index.

To enable: set `ANTHROPIC_API_KEY` as a repo or org secret. To disable without removing the workflow: set the `COUNCIL_DELIBERATE_ENABLED` repo variable to `false`.

## Workflow

1. Run `node scripts/council.mjs create --title "..."` to create the inquiry file and register it.
2. Fill in sections 1–3, 5–6, 8–9 in the generated file.
3. Run `node scripts/council.mjs deliberate <file>` to populate Alternatives, Risks, and Council Questions via LLM.
4. Set `Status` to `review`, open a PR — the deliberation workflow posts a summary comment.
5. Council reviews the inquiry document and the deliberation comment.
6. Capture open questions explicitly and resolve them before deciding.
7. Record the outcome: `node scripts/council.mjs approve|defer|reject <id> --summary "..."`.
8. Link resulting implementation artifacts back to the inquiry.

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