# Lifecycle

**Version:** v1 · **Date:** 2026-05-18 · **Status:** Authoritative · **Owner:** @adrper79-dot · **Closes:** [G34 in GAP_REGISTER.md](../GAP_REGISTER.md) (PostHog funnel definitions)

> The funnel definitions for every filled matrix cell. One canonical lifecycle, mapped per cell with cell-specific stage transitions and event-to-stage rules. Pairs with [`docs/MONETIZATION_FUNNEL_INSTRUMENTATION.md`](../MONETIZATION_FUNNEL_INSTRUMENTATION.md) — the 12 events defined there are the substrate; this doc builds funnels on top of them.

---

## 1. Canonical lifecycle stages

The lifecycle is **6 stages, immutable across all cells.** Per-cell mappings determine which event triggers which transition.

| # | Stage | Definition | Reached when |
|---|---|---|---|
| 0 | **Unknown** | Anonymous visitor; identified by session_id only | First PostHog event captured |
| 1 | **Cold** | Identified prospect with no expressed intent | `user_id` resolved on a session (form fill, modal opened, etc.) |
| 2 | **MQL** (marketing-qualified) | Demonstrated buying signal | Cell-specific MQL trigger event fired |
| 3 | **Trial / Active free** | Using the product without paying | `trial_started` event |
| 4 | **Paid** | Converting transaction completed | `subscription_created` event |
| 5 | **Retained** | Sustained product use post-payment | Still paid + ≥1 product event in trailing 30 days |
| 6 | **Advocate** | Referrer or public endorser | Either `referral_invited` event fired by user, OR opted into directory / case study |

**Exit states:**
- `lapsed` — paid → no product event in 60d → automatic
- `churned` — paid → `subscription_canceled` event
- `dnc` — `do_not_contact` consent status (per [`packages/crm/src/index.ts`](../../packages/crm/src/index.ts))

State machine is monotone — stages only advance, never retreat, except via exit states. Re-engagement after `lapsed` resumes from `MQL` with the prior cohort tag preserved.

---

## 2. Event-to-stage transition rules

These map the 12 monetization events from [`docs/MONETIZATION_FUNNEL_INSTRUMENTATION.md`](../MONETIZATION_FUNNEL_INSTRUMENTATION.md) plus 4 additions to the canonical stages.

| Event | Triggers transition to | Notes |
|---|---|---|
| (any PostHog event with new `distinct_id`) | 0 → 1 if `user_id` resolves | Identity resolution gates Cold |
| `email_subscribed` *(new event — adds to schema)* | 1 → 2 | MQL signal for owned channels |
| `chart_calculated` *(new event)* | 1 → 2 | MQL signal for Selfprime cells (product engagement before signup) |
| `signup_completed` *(new event)* | 2 → 3 if no prior trial | Trial begins |
| `checkout_started` (#1 in monetization doc) | 3 → 3 (intent recorded) | Not a stage change; tracked for funnel viz |
| `subscription_created` (#4) | 3 → 4 | First paying conversion |
| `subscription_renewed` (#5) | 4 → 5 on N=2 (second renewal = retained) | Retention threshold per-cell |
| `referral_invited` *(new event)* | 5 → 6 | Advocate signal |
| `subscription_canceled` (#7) | 4 or 5 → churned | Exit |
| 60d inactivity after last product event | 4 or 5 → lapsed | Cron-driven; not event-driven |

New events to add to [`packages/analytics/src/event-schemas.ts`](../../packages/analytics/src/event-schemas.ts) (per PR 3b):
- `email_subscribed`
- `chart_calculated`
- `signup_completed`
- `referral_invited`

---

## 3. Per-cell funnel definitions

PostHog funnel definitions get checked in as JSON in [`docs/marketing/funnels/`](./funnels/) — one per cell — so they're reproducible and reviewable. Per CLAUDE.md the JSON files are managed via the supervisor loop (PR 2 ships specs; PR 3e ships the loop that maintains them).

### `selfprime:practitioner`

Primary funnel — practitioner trial → paid → retained:

| Step | Event | Filter | Drop-off red flag |
|---|---|---|---|
| 1 | Page view | `path` starts with `/practitioners` OR `utm_content=practitioner` | <10% → channel mismatch |
| 2 | `email_subscribed` OR `signup_completed` | Same session | <5% → landing page failure |
| 3 | `chart_calculated` | Within 7 days | <30% → onboarding friction |
| 4 | Any *practitioner-tool* event (draft a reading, brand a report, embed widget) | Within 14 days | <20% → product friction |
| 5 | `subscription_created` with `plan='practitioner'` | Within 30 days | <8% → pricing mismatch |
| 6 | `subscription_renewed` ≥1 | Within 45 days | <70% → retention crisis |

Secondary funnel — design partner cohort (manually tagged):
- Steps 1-6 above but cohort-tagged `design_partner_2026q2`
- Watched separately because they bias retention upward (high-touch onboarding)

### `selfprime:consumer`

Primary funnel — consumer trial → paid:

| Step | Event | Filter | Drop-off red flag |
|---|---|---|---|
| 1 | Page view | `path = /` OR `utm_content=consumer` OR sub-segment landing pages | — |
| 2 | `chart_calculated` (free) | Same session | <40% → CTA failure |
| 3 | `signup_completed` | Within 24h | <20% → friction post-chart |
| 4 | Push notification engagement OR app session day 2+ | Within 7 days | <50% → onboarding habit fail |
| 5 | `subscription_created` with `plan='consumer'` | Within 30 days | <5% → freemium-to-paid friction |

Cohort dimensions tracked separately: sub-segment A/B/C/D (see [`icp/selfprime-consumer.md` §2](./icp/selfprime-consumer.md)).

### `cypher:practitioner`

Primary funnel — healer/coach trial → paid. (Definitions deepened in the cypher-practitioner ICP draft.) Stage transitions per canonical, with compliance-aware MQL gate:
- Step 2 requires explicit consent box check for any health-adjacent content (per [`CONSTITUTION.md §6`](./CONSTITUTION.md#6-data-consent-compliance))
- Step 3 includes a "professional verification" optional step (license number, modality cert, etc.) — pre-paid; segments LTV downstream

### `factory:internal`

Internal product cell — no traditional funnel. Funnel = adoption gradient:

| Step | Event | Definition |
|---|---|---|
| 1 | Repo on the conformance scorecard | Listed in [`docs/conformance/summary.md`](../conformance/summary.md) |
| 2 | Imports ≥1 `@latimer-woods-tech/*` package | Per repo dependency graph |
| 3 | Imports ≥3 packages | Same |
| 4 | Cohesion score ≥70 | Per [`docs/conformance/summary.md`](../conformance/summary.md) |
| 5 | Cohesion score ≥80 (graduates from shadow) | Stage-4 enforcement gate |

No monetary conversion — "paid" is "conformance-enforced." See [`icp/factory-internal.md`](./icp/factory-internal.md).

---

## 4. Drip sequences (per stage transition)

Per-cell email sequences fire on stage transitions. Sequences are owned in [`@lwt/email`](../../packages/email/) after PR 3a (real drip sequencer).

| Cell | Transition | Sequence name | Steps |
|---|---|---|---|
| `selfprime:practitioner` | 1→2 (Cold→MQL via `email_subscribed`) | `practitioner_welcome_v1` | 5 emails over 14 days: welcome → workflow audit prompt → first chart-prep tutorial → branded-shareable demo → trial offer |
| `selfprime:practitioner` | 3→4 (Trial→Paid) | `practitioner_paid_welcome_v1` | 3 emails over 7 days: onboarding success criteria → 1-month checkpoint → referral nudge |
| `selfprime:practitioner` | 4→5 lapse-risk (no product event in 14d) | `practitioner_winback_v1` | 2 emails: "what's missing?" + offer pause-not-cancel |
| `selfprime:consumer` | 1→2 | `consumer_welcome_v1` | 5 emails over 14 days: chart insight → 2nd-layer insight → habit-loop → upgrade prompt → social proof |
| `selfprime:consumer` | 3→4 | `consumer_paid_welcome_v1` | 3 emails: feature tour → 1-month → social/referral |
| `cypher:practitioner` | 1→2 | `cypher_practitioner_welcome_v1` | Compliance-aware welcome; modality verification optional path |
| `factory:internal` | n/a | n/a — internal channel is the supervisor digest, not email | — |

Each sequence has its own brand-voice profile lookup (cell × stage) per [`VOICES.md`](./VOICES.md). Sequence creation/activation is a Tier-2 action per [`CONSTITUTION.md §4`](./CONSTITUTION.md#4-approval-tiers).

---

## 5. Cohort dimensions

Every event is tagged with:

| Dimension | Values | Used for |
|---|---|---|
| `cell_key` | e.g. `selfprime:practitioner` | Cell-level funnel decomposition |
| `sub_segment` | e.g. `pure_astro`, `hd_reader`, `multi_modal` | Sub-segment learning loops (per ICP file §2) |
| `cohort_week` | YYYY-WW | Weekly cohort retention curves |
| `acquisition_source` | First-touch channel | Per [`ATTRIBUTION.md`](./ATTRIBUTION.md) |
| `acquisition_campaign` | First-touch campaign_id | Per [`CAMPAIGN_TAGGING.md`](./CAMPAIGN_TAGGING.md) |
| `design_partner` | bool | Excludes design partners from baseline retention math |
| `experiment_arm` | A/B/C/D or null | Per [`CONSTITUTION.md §8`](./CONSTITUTION.md#8-experimentation-discipline) |

Tagging happens at event-emission time (frontend or webhook). Schema enforcement in [`packages/analytics/src/event-schemas.ts`](../../packages/analytics/src/event-schemas.ts) per PR 3b.

---

## 6. Dashboards

Per cell, three dashboards (auto-generated by the supervisor loop):

| Dashboard | Question answered | Refresh |
|---|---|---|
| **Funnel** | Where are we losing people? | Hourly |
| **Cohort retention** | Are we keeping who we get? | Daily |
| **Sub-segment comparison** | Which sub-segment converts best? | Daily |

A *portfolio* dashboard rolls these up to north star ([`MARKETING_PLAN.md §1`](./MARKETING_PLAN.md#1-north-star)).

Dashboard configs as code: [`docs/marketing/dashboards/`](./dashboards/) (created in PR 2 — supervisor reads these to provision PostHog).

---

## 7. Alerts (extends MONETIZATION_FUNNEL_INSTRUMENTATION.md Part 6)

Per-cell alerting on top of the portfolio alerts already defined.

| Alert | Per-cell trigger | Action |
|---|---|---|
| Funnel drop-off >2× baseline at any step | Cell-specific baseline | Tier-2 (FYI) |
| Stage-transition rate crash >50% WoW | Cell-specific | Tier-3 (approval — fold into tripwire) |
| Sub-segment LTV gap >3× | Lower segment | Auto-reweight outreach mix; Tier-2 FYI |
| Lapsed-to-winback recovery rate <5% | Cell-specific | Tier-2; revise winback sequence |

Each alert is implemented in PostHog with the trigger spec checked into [`docs/marketing/alerts/`](./alerts/).

---

## 8. Cross-references

- [`MONETIZATION_FUNNEL_INSTRUMENTATION.md`](../MONETIZATION_FUNNEL_INSTRUMENTATION.md) — 12 monetization events (foundation for this doc)
- [`CONSTITUTION.md §4`](./CONSTITUTION.md#4-approval-tiers) — sequence-activation tier rules
- [`MARKETING_PLAN.md`](./MARKETING_PLAN.md) — index
- [`ICP_MATRIX.md`](./ICP_MATRIX.md) — cells whose funnels are defined here
- [`ATTRIBUTION.md`](./ATTRIBUTION.md) — `acquisition_source` definition
- [`CAMPAIGN_TAGGING.md`](./CAMPAIGN_TAGGING.md) — `campaign_id` convention
- [`KPI_DECOMPOSITION.md`](./KPI_DECOMPOSITION.md) — what we report from these funnels
- [`packages/analytics/src/event-schemas.ts`](../../packages/analytics/src/event-schemas.ts) — schema enforcement
- [`packages/email/src/index.ts`](../../packages/email/src/index.ts) — sequencer (PR 3a)
- [`docs/GAP_REGISTER.md`](../GAP_REGISTER.md) — **closes G34**

---

## Version history

| Date | Author | Change |
|------|--------|--------|
| 2026-05-18 | @adrper79-dot (drafted by Claude) | v1 — 6-stage canonical lifecycle; per-cell funnels for selfprime:practitioner, selfprime:consumer, cypher:practitioner, factory:internal; drip sequence map; cohort dimensions; closes G34 |
