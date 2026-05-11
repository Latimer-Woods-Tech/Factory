# Platform Gap Register

**Loaded by:** supervisor, Claude reviewer, sub-agents, daily digest · **Updated:** weekly review on Mondays + ad-hoc when gaps close

This is the living, machine-readable register of known platform gaps. Each entry has: ID, severity, status, owner, target stage, fix mechanism, and source. Agents read this to know what's open and what to prioritize.

Source synthesis: `documents/factory/2026-05-11_HOLISTIC_GAP_REVIEW.md` (Sauna-side working note).

## Conventions

- **Severity:** P0 (blocks Stage 1 ship) · P1 (Stage 1-2 must-fix) · P2 (Stage 2-5 fix) · P3 (defer / hygiene)
- **Status:** `open` · `in-progress` · `closed` · `wontfix`
- **Target stage:** `stage-0` … `stage-5` · `continuous` · `out-of-roadmap`
- **Owner:** `@adrper79-dot` · `@factory-cross-repo[bot]` · `@sauna` (the orchestrator)

## P0 — Must close before Stage 1 ships

| ID | Gap | Status | Owner | Target | Fix mechanism |
|---|---|---|---|---|---|
| G1 | Supervisor CONTEXT didn't load PLATFORM_STANDARDS + ADRs | **closed** | @adrper79-dot | stage-0 | PR #624 (merged) updated `docs/supervisor/CONTEXT.md` |
| G2 | Aggregator + sync scripts have no unit tests | open | @sauna + @factory-cross-repo[bot] | stage-1 | Add `tests/` to Factory `scripts/`, coverage ≥80%, CI gate on PRs touching `scripts/**` |
| G3 | Aggregator has no heartbeat (silent cron failure goes unnoticed) | open | @sauna | stage-1 | `.github/workflows/dead-mans-switch.yml` cron fires 25h after last tracker run → Pushover "TRACKER DOWN" |
| G4 | "Clean run" was undefined for trust ladder | **closed** | @adrper79-dot | stage-0 | PR #624 (merged) added `docs/supervisor/TRUST_LADDER.md` with 6-criteria definition |
| G5 | Claude reviewer not calibrated | open (design done) | @sauna | stage-1 | Shadow run on last 50 PRs across org; FN < 5%, FP < 10%; per ADR-0003 |
| G6 | Bootstrap workflow on PR #622 hasn't run yet | open (sequence dep) | @adrper79-dot | stage-0 | After PR #622 merges, dispatch `bootstrap-completion-tracker-private` from Factory Actions |
| G7 | Memory hygiene — session decisions not all in `memory/` | **closed** | @sauna | stage-0 | `RECENT_ACTIVITY.md` updated 2026-05-11 with 8 durable decisions |

## P1 — Stage 1-2 must-fix

| ID | Gap | Status | Owner | Target | Fix mechanism |
|---|---|---|---|---|---|
| G8 | LLM cost hard cap at org level (per-run + daily + monthly) | open | @sauna | stage-1 (M2) | Extend `@lwt/llm-meter` to enforce org-wide daily ($X) and monthly ($Y) caps; calls past cap fail with `BudgetExceededError` |
| G9 | Diff size budget has no machine enforcement | open (decision done) | @factory-cross-repo[bot] | stage-4 | `.github/workflows/pr-size-guard.yml` enforces ADR-0005 budgets (50/200/500); generated files excluded |
| G10 | Sentry overlay endpoint mapping is heuristic (substring match) | open | @sauna | stage-1 (M1) | Add `sentry_project` field to FUNCTIONS_MATRIX schema; aggregator queries Sentry per-project, not org-wide |
| G11 | ADR coverage check path-based, misses novel architectural patterns | open | @sauna | stage-4 | Claude as fallback ADR-need detector; one API call per PR; path heuristic stays as fast path |
| G12 | PII conformance is presence-only, doesn't validate against actual schema | open | @sauna | stage-5 | Parser scans D1 migration files, diffs against `PII_INVENTORY.md`; mismatch fails conformance |
| G13 | Schema migration discipline not machine-checked | open | @sauna | stage-4 | Parser scans `migrations/*.sql` for `-- ROLLBACK:` block; fails conformance if missing or `NONE` without ADR ref |

## P2 — Stage 2-5 fix

| ID | Gap | Status | Owner | Target | Fix mechanism |
|---|---|---|---|---|---|
| G14 | No retro mechanism for missed milestones | open | @adrper79-dot | continuous | Mandatory `documents/factory/retros/YYYY-MM-DD_milestone-NN_retro.md` after any milestone that misses exit criteria |
| G15 | Monday review is a placeholder (no agenda template) | open | @adrper79-dot | stage-0 follow-up | `docs/MONDAY_REVIEW_TEMPLATE.md` — agenda: digest review (5m), milestone exit check (10m), drift triage (5m), customer signal review (5m), kickoff next milestone (5m) |
| G16 | No customer feedback loop in the system | open | @sauna | stage-2 | Email forwarding into triage workflow; cancellation reasons from Stripe; NPS micro-survey; aggregated into daily digest |
| G17 | No competitive intel watch | open | @sauna | continuous | Quarterly: sub-agent watches competitor changelogs / X feeds / G2 reviews |
| G18 | No domain/IP/legal tracker | open | @adrper79-dot | stage-5 | `documents/factory/LEGAL_OPS.md` — domains + renewal dates, trademark status, ToS/PP version per product, tax registration per state |
| G19 | No bus-factor doc for solo operator | open | @adrper79-dot | continuous | Platform tour doc, recovery procedures per critical system, designated trusted contact, annual fire drill |
| G20 | No backup/DR strategy per product | open | @adrper79-dot | stage-5 | `RECOVERY.md` required per product. RTO + RPO declared. Monthly restore drill |

## P3 — Hygiene / defer

| ID | Gap | Status | Owner | Target | Fix mechanism |
|---|---|---|---|---|---|
| G21 | Supply-chain checks beyond CodeQL (Sigstore TLOG for all deps) | open | @factory-cross-repo[bot] | continuous | Expand factory#613 pattern across all packages |
| G22 | No pen-test schedule | open | @adrper79-dot | out-of-roadmap (until $20k MRR) | Annual third-party + quarterly self-test |
| G23 | No bug bounty program | open | @adrper79-dot | out-of-roadmap (until 1k+ users) | HackerOne or independent |
| G24 | No multi-region story for D1 | open | @adrper79-dot | out-of-roadmap (until forced) | CF roadmap, defer |
| G25 | Per-product rate limiting standardized | open | @factory-cross-repo[bot] | stage-5 | Audit + canonicalize via `@lwt/rate-limit` package |
| G26 | Queue / DO backpressure documented per Worker | open | @factory-cross-repo[bot] | stage-5 | Audit each DO; document backpressure pattern |
| G27 | GCP key rotation overdue (`76bc15364b7d…`) | open | @adrper79-dot | this week | Manual rotate; update `memory/SAUNA_TOOLS.md` |
| G28 | No calendar event for Monday review | open | @sauna | stage-0 follow-up | Create recurring Google Calendar event via `apn_4vhDK94` |
| G29 | HubSpot keep-or-delete pending | open | @adrper79-dot | this week | Decide + ADR if keeping |
| G30 | Pipedream Gmail (adrper79@gmail.com) reconnect or retire | open | @adrper79-dot | this week | Reconnect via Sauna or retire connection |

## Meta-gaps (the framework can't auto-answer)

| ID | Question | Surface |
|---|---|---|
| M1 | Are we building the right thing for the right customer? | Quarterly customer gate (OPERATING_FRAMEWORK §rule-10). ICP work per product. |
| M2 | At what point do we stop building and start selling? | Quarterly customer gate. Memory shows 9 days at zero new customers. |

## How to use this register

- **Agents** (supervisor, sub-agents, Claude reviewer): when planning work, check this register for gaps in the milestone's target stage. Prefer closing register entries over inventing new work.
- **Aggregator workflow:** read this file; report `open` P0 + P1 counts in the daily Pushover digest.
- **Monday review:** triage `open` gaps; promote, demote, or close.
- **Adding gaps:** open a PR adding a row; reference the source incident or doc. Severity assigned by the reviewer.
- **Closing gaps:** edit status to `closed`, add a one-line summary of how it closed, link the PR that closed it.

## Tracker-aggregator integration

When `aggregate_completion.py` runs, it tallies:

```
P0 open: N
P1 open: M
P2 open: K
P3 open: J
Closed this week: X (out of Y opened-or-closed)
```

These four numbers go in the Pushover digest right under the cohesion score. Open P0 > 0 = the system flags itself as not-ready.
