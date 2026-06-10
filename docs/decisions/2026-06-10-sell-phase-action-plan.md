---
date: 2026-06-10
decider: adrper79
status: proposed
builds_on: docs/decisions/2026-05-25-factory-alignment.md
---

# 2026-06-10 — Sell-Phase Action Plan: freeze the platform, fix the products, find the customers

## Revision (same day, operator direction): stabilization first, numbers last

There are 0 customers; marketing trails a functional product. Operator reorder:
**fix what's broken and what's about to break — without the fixes themselves
breaking load-bearing infra — before any metrics/revenue-reporting work.**
Workstream order becomes: WS-2 (Fix What's Broken, expanded below) → WS-3 (COH
safety) → WS-4 items 4.2/4.3 only after UAT is green → WS-1 (Trust the Numbers)
moves last.

### Ground truth established 2026-06-10 (live probes + UAT harness, this session)

- **Selfprime UAT: 66/68 PASS, 0 failures** once sandbox TLS noise (QUIC/ECH) was
  eliminated from the e2e runner. Real issues: 2 warnings (sign-out control not
  discoverable on `#/more`).
- **Capricast UAT: 71/73 PASS, 1 failure**: `POST https://capricast.com/api/sentry/envelope`
  → 404 — the frontend Sentry tunnel has no backend route, so **client-side error
  reporting is silently dead** (fix lives in the capricast repo). Plus 1 warning
  (sign-out control not discoverable).
- Earlier "failing UAT" runs were dominated by `ERR_QUIC_PROTOCOL_ERROR` /
  `ERR_ECH_FALLBACK_CERTIFICATE_INVALID` — sandbox-network transport noise, not
  product defects. The runner now forces TCP/TLS (`--disable-quic`,
  ECH off, opt-in `E2E_INSECURE_TLS=1` for MITM'd CI networks).

### Fixed and curl-verified this session

| Item | Root cause | Fix | Evidence |
|---|---|---|---|
| video-cron 530/unreachable since 2026-06-05 | Workers custom domain for `video-cron.latwoodtech.work` was never attached (no DNS record at all) | Attached custom domain → `video-cron` worker via CF API | `curl /health` → 200 `{"status":"ok","worker":"video-cron"}` |
| **Worker-name collision (P0-class):** `apps/inbound-oracle` `env.production.name` was `"prime-self"` — its deploys **overwrote the legacy Selfprime API worker's code** | Misnamed wrangler production env | Renamed to `inbound-oracle-production`, deployed, re-wired secrets (TELNYX/ELEVENLABS/ANTHROPIC/GROQ), custom domain moved | `curl inbound-oracle.latwoodtech.work/health` → 200 serving `inbound-oracle` |
| prime-self smoke red | Smoke + monitors probed the hijacked `prime-self.adrper79.workers.dev` (serving inbound-oracle, wrong health shape) | Repointed smoke workflow, prime-self-smoke spec, synthetic-monitor host map + service binding (→ `prime-self-api`), admin-studio SLO fixtures to `api.selfprime.net` | Live API: `curl api.selfprime.net/health` → 200 `{"service":"selfprime-api"}`; real frontend confirmed clean of the stale URL |

### Remaining stabilization queue (now the top of the plan)

1. **Human approval needed:** delete the stale `prime-self` CF worker — it serves
   inbound-oracle code at `prime-self.adrper79.workers.dev` while still holding the
   old Selfprime production secret set (JWT_SECRET, STRIPE_SECRET_KEY, NEON_URL).
   Deletion is irreversible → operator's call, per FRIDGE rule 8.
2. **capricast repo:** implement or remove the `/api/sentry/envelope` tunnel route
   (client error reporting is currently dead). Requires adding the capricast repo
   to a session's scope.
3. **xicocity.com root `/` returns 404** (`/health` is 200 — the worker has no root
   route on a customer-facing branded domain). Fix lives in the xico-city repo.
4. Sign-out discoverability on both Selfprime (`#/more`) and Capricast.
5. Redeploy synthetic-monitor so the corrected `PRIME_SELF` service binding
   (`prime-self-api`) takes effect.
6. Dependabot: 110 vulnerabilities reported on the default branch (47 critical) —
   triage which are runtime-reachable vs. dev-tooling noise.
7. The duplicated-config landmine class: audit every `apps/*/wrangler.jsonc`
   `env.production.name` against `docs/service-registry.yml` so no app can deploy
   over another worker's name again (the inbound-oracle collision was found by
   accident). Candidate for a deterministic CI check in `constraints-check.mjs`.

The original four workstreams below stand, in the revised order. Everything in
WS-1 (numbers/digest work) is explicitly deprioritized until UAT is green on both
revenue products and the stabilization queue above is empty.

---

## Decision

For the next 30 days, Factory enters a **platform freeze**: no new packages, no new
apps, no new admin/control-plane surface. All engineering capacity goes to four
workstreams — **Trust the Numbers**, **Fix What's Broken**, **Make COH Safe (and
calibrate the supervisor doing it)**, and **Point the Machine at Customers**.

This is the execution plan for the 2026-05-25 alignment decision, which correctly
diagnosed the drift ("Factory must not become a feature factory") but did not stop
it: in the three weeks since, commit heat went to admin-studio (~196 commits),
supervisor (55), and video tooling (~55), while Stripe revenue in the cost digest
stayed at $0, the completion tracker read 0.0% unchallenged, and every
customer-facing P2 gap (G16, G17) stayed open while every infrastructure P1 closed.

## The freeze rule (binding for the duration)

A PR that adds a new `packages/*` directory, a new `apps/*` directory, or net-new
admin-studio routes/screens is out of scope unless it is a named item in this plan.
The litmus test for any proposed work item: **"Does this change a number a customer
or operator can see — revenue, signups, uptime, content published?"** If not, it
waits.

Explicitly ruled out for 30 days (re-affirming the 2026-05-25 exclusion list):
- New speculative packages (25 of 39 packages already have zero app consumers)
- Supervisor Phase 2 (Worker/DO) work — Phase 1 calibration comes first (WS-3)
- Admin Studio feature expansion beyond what WS-1 requires to display real numbers
- A second monitoring/QA surface of any kind (we have synthetic-monitor,
  status-prober, prime-self-smoke, qa-tools already)

---

## Workstream 1 — Trust the Numbers (Week 1)

The org's headline metrics are currently unbelievable, which makes every other
decision blind. Nothing in WS-4 can be evaluated until these are honest.

| # | Item | Owner | Evidence of done |
|---|------|-------|------------------|
| 1.1 | **Diagnose the 0.0% completion tracker.** `completion-tracker.json` has read 0.0% across all five repos since ≤2026-05-25 and ships in STATE.md daily. Determine whether the scorer is broken or the truth is 0; fix the scorer or file the reckoning. | agent | STATE.md shows a non-zero (or explained-zero) per-repo completion with a linked root-cause note |
| 1.2 | **Populate one real revenue close.** Run `docs/capricast/monthly-revenue-close.md` for May 2026 with *actual* Stripe data, even if every line is $0. Delete or clearly mark the $223k exemplar so it can never be mistaken for reality. Repeat for Selfprime. | agent | Committed `docs/reports/revenue-close-2026-05-*.md` with live Stripe query output; exemplar file carries an `EXAMPLE — NOT REAL DATA` banner |
| 1.3 | **Add a real-revenue line to STATE.md / daily digest.** Stage 2's own exit criterion is "digest answers: are people buying?" Wire Stripe gross revenue + active subscriber count per product into `generate_state.py` and the Pushover digest. $0 is an acceptable, honest answer. | agent | STATE.md "Live numbers" section shows MRR/subscribers per product |
| 1.4 | **Root-directory doc purge.** Move or archive the 20+ stale root-level phase/status files (`PHASE_6_*`, `SUP-2.3_*`, `EXECUTION_SUMMARY_*`, etc.) into `docs/archive/`. This is the same G46-class debt Factory flagged in COH while accumulating it at home. | agent | Repo root contains README, CLAUDE, SECURITY, START_HERE, MASTER_INDEX and config only |

## Workstream 2 — Fix What's Broken (Week 1, parallel)

Live outage-class defects on revenue-adjacent surfaces, all older than the newest
admin-studio feature.

| # | Item | Owner | Evidence of done |
|---|------|-------|------------------|
| 2.1 | **video-cron health 530** (broken since 2026-06-05; blocks the entire automated video pipeline that WS-4 depends on). | agent | `curl` on the canonical URL returns 200; a dispatched render completes end-to-end |
| 2.2 | **prime-self `/health` 404** (open since the 2026-05-21 audit; the flagship revenue product has an unverified health contract). | agent | `curl https://api.selfprime.net/health` returns 200; service-registry updated |
| 2.3 | **FA smoke red** (factory-admin smoke has been red in STATE.md; either fix the app or fix the probe — a permanently red light trains everyone to ignore lights). | agent | Smoke green in next STATE.md generation |
| 2.4 | **Stale-PR hygiene:** merge or close PR #1061 (approved, 3+ days idle). Approved-and-idle PRs are inventory rot. | agent | PR merged or closed with rationale |

## Workstream 3 — Make COH Safe, and calibrate the supervisor doing it (Weeks 1–3)

COH is in production with Stripe wired, ~5% test coverage, no CI gate on deploy, a
live `/__db/reset` endpoint, and hardcoded `.workers.dev` URLs (G41–G45). This is
the single most dangerous open risk in the portfolio. It is also six well-specified,
template-shaped tasks — exactly the calibration workload the Phase-1 supervisor
needs before it can be trusted with anything (FRIDGE plan-approval gate: first 10
runs per template are human-approved anyway).

**One workstream, two payoffs: the riskiest product gets safe, and the supervisor
earns its first blessed templates from real closed work — the only kind FRIDGE
rule 9 allows.**

| # | Item | Gap | Owner | Evidence of done |
|---|------|-----|-------|------------------|
| 3.1 | Remove `/__db/reset` + `/__db/stripe-bootstrap` from prod routes — **first, it's the data-loss path** | G45 | supervisor run (human-approved plan) | `curl` both paths → 404 in prod |
| 3.2 | Add CI test gate to COH `deploy.yml` (no test pass → no deploy) | G41 | supervisor run | A deliberately failing test blocks a deploy in CI logs |
| 3.3 | Replace 3 hardcoded `.workers.dev` URLs in frontend with branded domain | G44 | supervisor run | grep clean; pages serve from branded domain |
| 3.4 | Wire the synced-but-unused Sentry DSN | G43 | supervisor run | A thrown test error appears in Sentry |
| 3.5 | Raise test coverage 5% → 70% on critical paths (auth, Stripe, booking) | G42 | agent (too large for one supervisor run; split per ADR-0005 size budget) | Coverage report ≥70% line on the three paths |
| 3.6 | COH root-doc cleanup | G46 | supervisor run | Obsolete root MDs archived |
| 3.7 | **Bless the templates.** Each closed item above that ran clean becomes a supervisor template (`docs/supervisor/plans/`) with its `template_stats` row seeded. | agent | ≥4 blessed templates sourced from G41–G46 closures |

Exit criterion for WS-3: COH cohesion score ≥ 60 (from 25) and zero open P1 gaps
against it; supervisor has ≥4 templates blessed from real merged work.

## Workstream 4 — Point the Machine at Customers (Weeks 2–4)

The build phase produced one fully-working loop (the video pipeline) and one
two-day-old asset (the factory-core cross-product identity layer). Both are
acquisition machinery nobody has turned on.

| # | Item | Owner | Evidence of done |
|---|------|-------|------------------|
| 4.1 | **Video pipeline → content cadence.** After 2.1, seed `video_calendar` with a recurring schedule: ≥2 published videos/week/brand across Capricast, Selfprime, COH, Xico, scored by `scorePriority()`. The pipeline has produced 1 video in 3 weeks; the marginal cost of running it daily is near zero and it is the only acquisition channel a zero-headcount org can afford. | agent + schedule-worker | 8+ videos live on watch pages within 2 weeks of pipeline fix, each with VideoObject JSON-LD (SEO surface) |
| 4.2 | **Customer feedback loop (G16).** Minimum viable: support email forwarding per brand → inbound-oracle (already provisioned, idle) → factory_events; Stripe cancellation-reason capture; one post-purchase email via Resend. No new app — wire existing pieces. | agent | A test cancellation produces a `factory_events` row with a reason; STATE.md gains a "voice of customer" count |
| 4.3 | **Cross-sell groundwork on the identity layer.** The factory-core network links selfprime/capricast/coh/xico identities — the same buyer archetype (creators/healers/artists monetizing a personal brand). Ship the smallest cross-sell surface: a "more from the network" block on Capricast watch pages and Selfprime post-purchase, instrumented in PostHog. Use the orphaned `@latimer-woods-tech/crm` package (1,289 LOC, zero consumers) as the lead store — its first real consumer, or evidence it should be deleted. | agent | Cross-property click events visible in PostHog; crm package imported by ≥1 app or an ADR retiring it |
| 4.4 | **Real distribution for linkedin-publisher.** It currently composes posts and sends them to Pushover. Close the loop: publish to LinkedIn via API (or explicitly park it with an ADR). A growth tool that asks the operator to copy-paste is not automation. | agent | Posts appear on LinkedIn on the Tue/Thu schedule, or a parking ADR exists |
| 4.5 | **bodygraph × video spike (1 run, hard-capped).** One supervisor-budgeted spike ($5 cap per FRIDGE rule 5): render one personalized Human Design video using the bodygraph SVG renderer inside a Remotion composition. If it works, it's a differentiated Selfprime SKU no competitor can produce at this cost; if not, document and stop. | agent | One rendered MP4 with an embedded body-graph, or a written negative result |

## Sequencing

```
Week 1:  WS-1 (1.1–1.4)  +  WS-2 (2.1–2.4)  +  WS-3 start (3.1, 3.2)
Week 2:  WS-3 (3.3–3.6)  +  WS-4 start (4.1 after 2.1, 4.2)
Week 3:  WS-3 finish (3.5 coverage, 3.7 templates)  +  WS-4 (4.3, 4.4)
Week 4:  WS-4 finish (4.5 spike)  +  30-day review against exit criteria
```

Dependencies: 4.1 blocks on 2.1 (video-cron). 3.7 blocks on 3.1–3.4 merging clean.
4.3 blocks on nothing — the identity layer is live. Everything in WS-1/WS-2 is
independent and parallelizable (sub-agents per Sub-Agent Isolation rules).

## Exit criteria (the 30-day review answers these, with evidence)

1. STATE.md shows believable completion numbers and a real revenue line per product
   (even if $0) — *Stage 2's own "are people buying?" question, finally answerable*.
2. Zero red health probes; zero approved-idle PRs older than 48h.
3. COH: cohesion ≥60, G41–G46 closed, no destructive prod endpoints.
4. Supervisor: ≥4 blessed templates with `template_stats` rows from real merged work.
5. ≥8 videos published across ≥3 brands; PostHog shows cross-property traffic.
6. A customer can be heard: cancellation reasons + support email land in
   factory_events.

## Budget

Fits inside the existing alignment-doc cost posture. Incremental spend: supervisor
calibration runs at $5/run hard cap (FRIDGE rule 5), video renders ride existing
GitHub Actions free minutes + ElevenLabs/Stream per-video pennies, Anthropic stays
under the $50/day cap. No new SaaS lines.

## What this plan deliberately does NOT do

- Build supervisor Phase 2, new packages, or new monitoring/QA/admin surface
- Populate the 25 orphaned packages with consumers "for completeness" — only `crm`
  gets a use-it-or-retire-it decision (4.3)
- Touch wordis-bond, pricing experiments, or the AI-tokens SKU (all stay deferred
  per 2026-05-25)
- Pretend marketing strategy is solved — WS-4 builds *channels*; GTM strategy
  remains the operator's quarterly customer-gate work

## Revisit when

- Any exit criterion is met early → pull the next item forward; do not backfill
  with platform work.
- The 30-day review lands → decide whether the freeze lifts, extends, or converts
  into a standing "customer-visible numbers first" FRIDGE rule.
- Real revenue exceeds $0 → trigger the alignment doc's existing re-tier rule
  (platform cost vs. 10% of revenue).
