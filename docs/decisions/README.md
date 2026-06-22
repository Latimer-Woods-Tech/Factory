# Decisions

Lightweight log of operational, vendor, and product decisions — things that don't warrant a full [RFC](../rfc/) but should not be lost in chat history.

## What goes here vs. where else

| Type of decision | Home |
|---|---|
| Architecture / multi-package / multi-week | [docs/rfc/](../rfc/) (full RFC + design review) |
| Supervisor-loop policy | [docs/supervisor/DECISIONS.md](../supervisor/DECISIONS.md) |
| Vendor choices, on/off feature toggles, operational mode, account keep/delete | **here** (this folder) |
| Short-lived (in-conversation) decisions | nowhere — they're ephemeral |

## Convention

- One file per checkpoint OR one file per single decision. Either is fine; bias to one-per-checkpoint when several decisions land together in a day, one-per-decision when a single call deserves its own discussion record.
- File name: `YYYY-MM-DD-<short-slug>.md`
- Frontmatter:
  ```
  date: YYYY-MM-DD
  decider: <who>
  status: decided | revisited | reversed
  ```
- Body: each decision gets:
  - **Decision** — the call, in one sentence
  - **Context** — what prompted it (one paragraph max)
  - **Why** — the reason in 1–3 sentences
  - **Consequences** — what we now do / don't do
  - **Revisit when** — concrete signal that would re-open this

## Don't

- Don't relitigate prior decisions in new files. Revisit by adding a `Revisited: YYYY-MM-DD — <new outcome>` line to the original file. If the new outcome is large enough to merit a fresh entry, link back: `Supersedes: 2026-05-15-...`.
- Don't capture decisions a CODEOWNER cannot enforce (e.g., "we agreed to be nicer to each other"). This folder is for actions the org will take or vendor postures we'll hold.
- Don't include credentials, API keys, or PII.

## Index

- [2026-05-15-operations-checkpoint](2026-05-15-operations-checkpoint.md) — 9 calls: testing-first week, hybrid llm-meter, Stripe Tax, Dreaming pilot, Copilot review, HubSpot, Cursor app, Salesforce drop
- [2026-05-28-media-room-control-plane](2026-05-28-media-room-control-plane.md) — keep Media Room as a Node-only production control plane for generated-media readiness.
- [2026-06-10-sell-phase-action-plan](2026-06-10-sell-phase-action-plan.md) — 30-day platform freeze + 4 workstreams: trust the numbers, fix what's broken, make COH safe (calibrating the supervisor), point the machine at customers.
- [2026-06-22-primus-design-system](2026-06-22-primus-design-system.md) — Stage 6 delivered as "Primus": consolidate fragmented design packages onto one token source, home it at primusui.com (repurposed from a web3 hub idea).
