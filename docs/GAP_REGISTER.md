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
| G2 | Aggregator + sync scripts have no unit tests | **in-progress** | @sauna + @factory-cross-repo[bot] | stage-1 | Phase 1 shipped via PR [#708](https://github.com/Latimer-Woods-Tech/Factory/pull/708) — 75 tests, 41% combined coverage on the 3 scripts (60% on init-matrix-issues, 38% on aggregate_completion, 36% on sync_labels_to_matrix). Phase 2 (HTTP overlays + render + main()) still open; needs urllib mocking at scale to hit ≥80%. |
| G3 | Aggregator has no heartbeat (silent cron failure goes unnoticed) | **closed** | @sauna | stage-1 | `.github/workflows/dead-mans-switch.yml` shipped via PR [#684](https://github.com/Latimer-Woods-Tech/Factory/pull/684) + schedule + cold-start tolerance via [#687](https://github.com/Latimer-Woods-Tech/Factory/pull/687). Fires 11:11 UTC daily; alerts Pushover if `docs/completion-tracker.json` is >26h stale. Cold-start tolerance prevents false-positive on first-ever run. |
| G4 | "Clean run" was undefined for trust ladder | **closed** | @adrper79-dot | stage-0 | PR #624 (merged) added `docs/supervisor/TRUST_LADDER.md` with 6-criteria definition |
| G5 | Claude reviewer not calibrated | open (design done) | @sauna | stage-1 | Shadow run on last 50 PRs across org; FN < 5%, FP < 10%; per ADR-0003 |
| G6 | Bootstrap workflow on PR #622 hasn't run yet | open (sequence dep) | @adrper79-dot | stage-0 | After PR #622 merges, dispatch `bootstrap-completion-tracker-private` from Factory Actions |
| G7 | Memory hygiene — session decisions not all in `memory/` | **closed** | @sauna | stage-0 | `RECENT_ACTIVITY.md` updated 2026-05-11 with 8 durable decisions |

## P1 — Stage 1-2 must-fix

| ID | Gap | Status | Owner | Target | Fix mechanism |
|---|---|---|---|---|---|
| G8 | LLM cost hard cap at org level (per-run + daily + monthly) | **partial** | @sauna | stage-1 (M2) → enforcement stage-2 | Visibility shipped via `scripts/cost_digest.py` + `.github/workflows/cost-observability.yml` (PRs [#684](https://github.com/Latimer-Woods-Tech/Factory/pull/684), [#687](https://github.com/Latimer-Woods-Tech/Factory/pull/687), [#696](https://github.com/Latimer-Woods-Tech/Factory/pull/696)): daily digest reports Anthropic $ vs $50/day cap, fires `anthropic_over_cap` warning. Enforcement (block calls past cap) still open — extend `@lwt/llm-meter`. |
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

| G31 | JWT rotation procedure (auth pkg) — no dual-key window for secret rotation | open | @adrper79-dot + @factory-cross-repo[bot] | stage-4 | Add `JWT_SECRET_NEXT` env + middleware verifies against both during rotation window; doc in `@lwt/auth` README |
| G32 | Stripe idempotency keys not persisted in DB — retries can double-charge under worker crash | open | @sauna | stage-3 | Add `stripe_idempotency_keys` table to canonical schema; `@lwt/stripe.transferOrIdempotent()` helper checks/inserts before Stripe call |
| G33 | No PostgreSQL row-level security templates in `@lwt/neon` | open | @sauna | stage-5 | Publish RLS template SQL per common role (viewer/creator/admin/operator); apps adopt via migration |
| G34 | No PostHog funnel definitions for monetization paths | open | @sauna | stage-2 | Pre-built funnels in `@lwt/analytics`: signup→first-action→paid→renewal→day-30-retention. Configurable per product. |
| G35 | No transactional email templates in `@lwt/email` (currently raw `sendEmail()` only) | open | @sauna | stage-5 | Add: subscription_confirmed, renewal_failed, payout_completed, account_review_required, magic_link, password_reset. Apps brand via template vars. |
| G36 | No audit logging for payout/admin mutating operations | open | @sauna | stage-5 | `@lwt/compliance.auditLog()` middleware required on all admin routes (per PLATFORM_STANDARDS §10 Privacy). Reads `actor`+`target`+`action`+`metadata` from request context. |
| G37 | `CF_API_TOKEN` and `LATIMERWOODS_SENTRY_AUTH` lack scopes for billing/stats endpoints | open | @adrper79-dot | stage-2 | Cost digest run 2026-05-15 returned HTTP 403 on Cloudflare `billing/profile` and Sentry `stats_v2`. Tokens work for runtime but not observability. Either expand scopes on existing tokens or provision read-only billing tokens. |
| G38 | GCP billing line in cost digest is a placeholder — needs BQ billing export | open | @adrper79-dot | stage-2 | `scripts/cost_digest.py::collect_gcp` returns "skipped: missing GCP_BILLING_TOKEN or GCP_BILLING_ACCOUNT_ID" — but the real path is a BigQuery billing export ([docs](https://cloud.google.com/billing/docs/how-to/export-data-bigquery)). Until that's configured + queried, no GCP $ in the digest. |
| G39 | Auto-merge bot race: drift PRs from aggregator can sit open and block subsequent runs | open | @sauna | stage-2 | Symptom: PR [#702](https://github.com/Latimer-Woods-Tech/Factory/pull/702) sat open from 2026-05-15 02:56 → 16:30 because auto-merge bot didn't squash it; next aggregator runs failed with "branch already exists." Fix: aggregator workflow should `gh pr merge --auto` re-arm + `--admin` fallback when its own PR is >2h stale. |
| G40 | Cross-agent institutional memory has no single entry point | **in-progress** | @sauna | stage-1 | Memory spreads across CLAUDE.md, ROADMAP.md, FRIDGE.md, GAP_REGISTER.md, decisions/, conformance/, cost/, completion-tracker.json — no agent reads all of them on boot. Fix: `docs/STATE.md` auto-generated daily (PR landing 2026-05-15). Patterns surface added via `docs/architecture/PATTERNS.md`. |

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
