# HumanDesign / selfprime KPI brief

**Repo:** [`Latimer-Woods-Tech/HumanDesign`](https://github.com/Latimer-Woods-Tech/HumanDesign)
**Live:** [selfprime.net](https://selfprime.net) — SPA at `selfprime.net/?start=1`, **not** root
**Priority:** Stage 1 (top of portfolio)
**Stack:** Cloudflare Workers + Pages SPA + BetterAuth on D1 + Neon Postgres (project `divine-grass-42421088`, branch `production`)

---

## Purpose

selfprime is a B2C / B2B2C Human Design platform: chart calculation, LLM-synthesized profiles ("Oracle"), practitioner tools, and Stripe ACS (Agentic Commerce) fulfillment. **Never use "AI" in user copy** — use "synthesis", "the Oracle", "Energy Blueprint". In-product uses brand vocab; SEO surfaces use canonical Human Design terms ([`PRODUCT_PRINCIPLES.md`](../../../HumanDesign/PRODUCT_PRINCIPLES.md) §8).

---

## Summary by category

| Category | LIVE_WITH_KPI | LIVE_NO_KPI | NOT_INSTRUMENTED | DEAD | Total |
|----------|---------------|-------------|------------------|------|-------|
| user-facing | 26 | 40 | 0 | 0 | 66 |
| data | 1 | 1 | 0 | 0 | 2 |
| integration | 1 | 4 | 0 | 0 | 5 |
| cron | 1 | 0 | 0 | 0 | 1 |
| monitoring | 4 | 3 | 0 | 0 | 7 |
| feature-flag | 1 | 6 | 0 | 0 | 7 |
| **Total** | **34** | **54** | **0** | **0** | **88** |

See [`inventory.tsv`](inventory.tsv) (rows `F-HD-001` through `F-HD-088`).

---

## Critical user-journey KPIs

To know selfprime is healthy, measure:

| Journey step | Event(s) | Current | Target |
|--------------|---------|---------|--------|
| Signup → first chart | `SIGNUP` → `CHART_CALCULATE` | events fire; no funnel | >60% within 1 week |
| Chart → first profile | `CHART_CALCULATE` → `PROFILE_GENERATE` | events fire; no latency SLA | p95 LLM <5s |
| Profile view → tier upgrade | `PROFILE_GENERATE` → `CHECKOUT_START` → `CHECKOUT_COMPLETE` | events fire; ACS gated `disable_checkout=true` | conversion measurable |
| Daily engagement loop | `CHECKIN_COMPLETE` → `/api/checkin/streak` | streak tracked; adherence aspirational | >40% |
| Practitioner activation | `PRACTITIONER_GATE1_COMPLETED` (paid) → `PRACTITIONER_GATE2_COMPLETED` (first client) → `PRACTITIONER_ACTIVATED` | events fire; no funnel gate | quartile cohort tracking |

40+ event types are published. **54 features capture zero `trackEvent`** — diary entries, dream analysis, messaging, session templates, testimonials, promo redemption, Calendly bookings, RevenueCat sync.

---

## Money KPIs

Stripe webhook is live; trackEvent for checkout, upgrade, downgrade, cancel fires. However:

- **Path from feature → revenue.** ACS shipped 2026-05-21 (PRs #228, #229) but [`workers/src/handlers/agent-commerce.js:158`](../../../HumanDesign/workers/src/handlers/agent-commerce.js) sets `disable_checkout=true` in the product feed. Claim token (30-day TTL) exists; no funnel KPI for claim submission rate (target >50%), reading-generation latency, or delivery success.
- **MRR tracking.** `analytics_events` captures checkout + subscription events. **Missing:** cohort revenue, churn rate by tier, LTV by signup source (organic vs. referral vs. agent).
- **One-time purchase signal.** Feature flag `ONE_TIME_PURCHASES_VISIBLE=false`; synthesis token product exists but is hidden. Revenue upside: enable flag + measure redemption → $500–$2K/month potential.

---

## Feature flags (per [`077_feature_flags_seed.sql`](../../../HumanDesign/workers/src/db/migrations/077_feature_flags_seed.sql))

| Flag | State | Impact |
|------|-------|--------|
| `ACHIEVEMENTS_VISIBLE` | **ON** (100%) | Daily-polled by CCR routine `trig_01Bwsi2Ksn8yQ9MgVvgRSSwR` |
| `CLUSTERS_VISIBLE` | OFF | Cluster endpoints gated |
| `DIVINATION_ENABLED` | OFF | `divination_readings` endpoints gated |
| `ONE_TIME_PURCHASES_VISIBLE` | OFF | Synthesis token purchase hidden |
| `EXPERIMENTS_ENABLED` | OFF | Policy: enable only when DAU ≥ 500 |
| `NOTION_SYNC_ACTIVE` | OFF | Gate until ≥5 independent practitioner requests |
| `disable_checkout` (in ACS feed) | TRUE | Blocks external agent checkout completion |

5 of 7 flags are OFF. Most features are built but not shipped. **No gradual-rollout instrumentation** to measure flag-gated KPI lift.

---

## Top 10 highest-value KPIs not measured

1. **Agent Commerce Claim Submission Rate** — `agentic_orders.awaiting_birth_data → ready`. Likely 0 external volume due to `disable_checkout=true`.
2. **LLM Profile Synthesis Latency (p95)** — `PROFILE_GENERATE` fires; latency SLA unknown. Likely >5s on cold starts.
3. **Email Campaign Engagement** — `email_deliveries` table exists; open / click not captured. 9 drip campaigns running blind.
4. **Practitioner Retention Cohort** — clients added >3 months ago still active. Likely >70% but unmeasured; gates PMF.
5. **Transit Alert Relevance** — `alert_deliveries` lacks user feedback (read / ignore / acted-on). Validates engagement vs. fatigue.
6. **Referral Viral Coefficient** — `referral_signups` tracks conversions but not click-through. Target >1.3× for exponential growth.
7. **Practitioner First-Client Acquisition Time** — gap between `practitioner_invitations.created_at` and `practitioner_session_notes.created_at`. Likely 7–14 days; no SLA.
8. **Daily Checkin Streak Distribution** — `user_streaks.current_streak` exists; p50 / p95 not published. Likely p50 = 3 days.
9. **Practitioner Directory Search Conversion** — `/api/directory` lists 50–200 practitioners; no tracking from view → inquiry → hire. Likely <5%.
10. **ACS Reading Delivery Time** — `agentic_orders → profiles.created_at → email sent`. Target <60s end-to-end; no monitoring.

---

## Surprising findings

1. **40+ analytics event types defined but 54 features capture zero events.** Achievements, referrals, shares, checkins are instrumented. Diary, dreams, messaging, session templates, testimonials, promo, Calendly, RevenueCat publish **no events**. Analytics infrastructure is sophisticated (`FUNNELS`, `aggregateDaily`, KV backup); ~40% of the codebase doesn't use it.

2. **Feature flags exist but most remain OFF.** 6 flags; only `ACHIEVEMENTS_VISIBLE` is ON. Features are built but not shipped; no gradual-rollout instrumentation.

3. **ACS is "shipped" but actually gated at checkout.** `agentic_orders` table, claim token, LLM synthesis, email delivery — all implemented (PRs #228/#229). But product feed sets `disable_checkout=true`. Feature is dead code for revenue until sandbox validation completes.

4. **77 migrations define ~77 tables, many unused.** `platform_testimonials`, `practitioner_inquiries`, `calendar_events`, `social_accounts` — schema exists, handlers minimal, no `trackEvent`. Over-schema'd.

5. **Health endpoint exists but has no SLA.** [`workers/src/index.js:910`](../../../HumanDesign/workers/src/index.js) returns liveness; no SLA enforced. Cron staleness (`cronHealthy` flag) tracked but not alerted on.

6. **Sentry is live but zero error thresholds.** `captureException` fires. No SLA, no alert on >10/day, no per-handler error rate.

7. **KV cache for feature flags but no cache-hit-rate KPI.** Flag cache (60s TTL) reduces DB load; hit rate not monitored.

8. **Stripe ACS feed published but checkout disabled.** Earnings ledger is wired but the merchant onramp is locked.

---

## Blind spots

1. **Agentic Commerce actual volume.** `disable_checkout=true` blocks external agent checkouts. Without Stripe ACS dashboard or logs, can't measure: did agents try? Did they fail?
2. **LLM cost attribution.** `llm_token_tracking` table exists. No per-user bucket or alert when monthly cost exceeds $100.
3. **Practitioner tier dynamics.** Gate events fire once. No "client removed" or "subscription downgraded" events. Can't track practitioner churn.
4. **Frontend analytics.** 40+ shell events (`shell_route_exposed`, etc.) captured; source opaque. Can't distinguish personal vs. practitioner vs. onboarding shells.
5. **Email deliverability.** `email_deliveries` tracks sends. Bounce / spam / unsubscribe feedback loop unclear. Resend API may report failures; unclear if they're persisted.
6. **DB query performance.** No slow-query log or query latency metrics. Cron runs 9 steps; one hung DB call can starve subsequent steps (mitigated by `withTimeout`, 8s per step).
7. **Stripe sync lag.** Webhook → DB → `analytics_daily` is fire-and-forget (`ctx.waitUntil`). No guarantee events flush before next request. MRR may lag by minutes.

---

## Recommended next actions

1. **Add `trackEvent()` to diary, messaging, testimonials, promo, ACS claim submission.** 54 unmeasured surfaces is the biggest gap.
2. **Enable `DIVINATION_ENABLED` and `ONE_TIME_PURCHASES_VISIBLE` flags and measure conversion.** Hidden revenue.
3. **Establish SLAs:** profile synthesis latency (<5s p95), ACS claim submission rate (>50%), practitioner first-client time (<14 days).
4. **Build cohort revenue + referral viral coefficient + alert fatigue reports.** Three KPIs that would change product decisions.
