# SelfPrime Monetization Funnel Contract

**Status:** Active  
**Owner:** Product Lead (Monetization), Payments Lead  
**Last Updated:** 2026-05-01  
**Reference:** [docs/videoking/monetization-funnel-spec.md](./monetization-funnel-spec.md) (VideoKing source contract)

---

## Overview

This document adapts the VideoKing monetization funnel contract for SelfPrime's revenue model. VideoKing monetizes content consumption (video unlocks + creator subscriptions). SelfPrime monetizes practitioner-client relationships (coaching, readings, chart analyses) augmented by gated multimedia content and referral-based practitioner acquisition.

All events conform to the [`@latimer-woods-tech/analytics`](../../packages/analytics/src/index.ts) event schema. The base event structure and validation rules are **identical** to the VideoKing contract — this document specifies the SelfPrime-specific `event_name` values, actors, and revenue flows.

---

## 1. Event Schema (Inherited from VideoKing)

SelfPrime reuses the VideoKing `MonetizationEvent` interface without modification:

```typescript
interface MonetizationEvent {
  event_name: string;           // SelfPrime-specific event names (see section 2)
  user_id: string;              // UUID of actor
  event_type:                   // Category drives dashboard bucketing
    | 'subscription'            // Tier upgrades
    | 'unlock'                  // Paid video or reading unlock
    | 'referral'                // Practitioner/user referral
    | 'earnings'                // Practitioner revenue earned
    | 'payout';                 // Stripe Connect disbursement
  timestamp: ISO8601;
  amount_cents: number;
  currency: 'USD';
  status: 'success' | 'failed' | 'pending' | 'cancelled';
  reason_if_failed?: string;
  correlation_id: string;       // Links across payment → earnings → payout
  idempotence_key?: string;     // Stripe idempotency key
  // SelfPrime extensions:
  practitioner_id?: string;     // UUID of practitioner (maps to VideoKing's creator_id)
  video_id?: string;            // Practitioner video ID (phase 2+)
  subscription_tier?: 'free' | 'individual' | 'practitioner' | 'agency';
  referral_code?: string;       // Referral code used (for referral events)
  session_id?: string;
  utm_source?: string;
}
```

**Note:** `creator_id` in VideoKing = `practitioner_id` in SelfPrime. Both map to the revenue recipient.

---

## 2. SelfPrime Critical Events (16 Total)

### A. Subscription Upgrade Funnel (6 events)

Mirrors VideoKing's subscription funnel. Event names are prefixed with `selfprime_` to partition dashboards.

| # | Event Name | Description | Actor | Amount |
|---|---|---|---|---|
| 1 | `selfprime_upgrade_intent` | User lands on upgrade/pricing page | User | 0 |
| 2 | `selfprime_checkout_started` | Stripe session created for tier upgrade | User | 0 |
| 3 | `selfprime_checkout_completed` | Stripe session confirmed (pre-charge) | User | plan price |
| 4 | `selfprime_subscription_activated` | Payment captured + tier updated in DB | System | plan price |
| 5 | `selfprime_subscription_renewed` | Monthly renewal succeeds | System | plan price |
| 6 | `selfprime_subscription_cancelled` | User downgrades/cancels | User | 0 |

**Example — subscription activated:**
```json
{
  "event_name": "selfprime_subscription_activated",
  "user_id": "usr_abc123",
  "event_type": "subscription",
  "amount_cents": 2900,
  "currency": "USD",
  "status": "success",
  "timestamp": "2026-05-01T10:00:00Z",
  "correlation_id": "7f3b2a4c-...",
  "subscription_tier": "practitioner",
  "idempotence_key": "stripe_pi_3PXx..."
}
```

### B. Referral Funnel (4 events)

SelfPrime generates a significant share of new practitioners through peer referrals. This is the primary growth lever absent from VideoKing.

| # | Event Name | Description | Actor | Amount |
|---|---|---|---|---|
| 7 | `selfprime_referral_link_generated` | User generates referral invite link | Referrer | 0 |
| 8 | `selfprime_referral_click` | Referred user arrives via referral link | Referred | 0 |
| 9 | `selfprime_referral_converted` | Referred user activates paid tier | System | 0 (tracked separately) |
| 10 | `selfprime_referral_reward_issued` | Referrer receives account credit or cash bonus | System | reward_cents |

**Referral reward model:**
- Free-to-paid conversion: Referrer earns $10 credit (1,000 cents) OR 30 days free
- Practitioner-to-agency upgrade by referred user: Referrer earns $25 credit
- Cash payouts for referrals are batched monthly via Stripe Connect

**Example — referral converted:**
```json
{
  "event_name": "selfprime_referral_converted",
  "user_id": "usr_referred456",
  "event_type": "referral",
  "amount_cents": 0,
  "currency": "USD",
  "status": "success",
  "timestamp": "2026-05-01T11:30:00Z",
  "correlation_id": "9e1d3b7f-...",
  "referral_code": "SARAH-HD-2026",
  "subscription_tier": "individual",
  "practitioner_id": "usr_referrer789"
}
```

### C. Practitioner Video Unlocks (3 events)

Applies to Phase 2+ when practitioner-gated video content is live.

| # | Event Name | Description | Actor | Amount |
|---|---|---|---|---|
| 11 | `selfprime_video_unlock_intent` | User clicks "Unlock Video" CTA | User | 0 |
| 12 | `selfprime_video_unlock_succeeded` | Payment captured + access granted | System | unlock price |
| 13 | `selfprime_video_earnings_credited` | Practitioner's cut credited to their account | System | practitioner_cut |

**Revenue split:** 70% practitioner / 30% platform (configurable per practitioner tier).

**Example — video unlock:**
```json
{
  "event_name": "selfprime_video_unlock_succeeded",
  "user_id": "usr_abc123",
  "practitioner_id": "usr_prac456",
  "video_id": "vid_def789",
  "event_type": "unlock",
  "amount_cents": 1900,
  "currency": "USD",
  "status": "success",
  "timestamp": "2026-05-01T14:22:10Z",
  "correlation_id": "c2a5b8d1-...",
  "idempotence_key": "stripe_pi_4QYy..."
}
```

### D. Practitioner Revenue Share (3 events)

| # | Event Name | Description | Actor | Amount |
|---|---|---|---|---|
| 14 | `selfprime_practitioner_earnings_accrued` | Revenue from unlock/subscription credited to practitioner balance | System | practitioner_cut |
| 15 | `selfprime_payout_initiated` | Stripe Connect payout initiated | System | payout_amount |
| 16 | `selfprime_payout_succeeded` | Funds arrived in practitioner's bank account | System | payout_amount |

---

## 3. Critical Funnel Metrics

### 3.1 Subscription Conversion Funnel

```
intent → checkout_started → checkout_completed → activated
```

**Target conversion rates (baseline):**
| Step | VideoKing baseline | SelfPrime target |
|---|---|---|
| Intent → Checkout Started | 35% | 40% (higher intent market) |
| Checkout Started → Completed | 78% | 82% |
| Completed → Activated | 97% | 97% |
| **End-to-end** | **26%** | **32%** |

### 3.2 Referral Funnel

```
link_generated → referral_click → converted → reward_issued
```

**Target metrics:**
- Referral link generation rate: 15% of `practitioner` tier users
- Click-to-conversion: 12%
- Reward payout rate: 100% of conversions within 30 days

### 3.3 Video Unlock Funnel (Phase 2+)

```
intent → payment → unlock_succeeded → earnings_credited
```

**Target metrics:**
- Intent-to-purchase: 18% (warm audience: already in practitioner's client list)
- Average video unlock price: $19–$49

---

## 4. Dashboard Queries

### 4.1 Monthly Recurring Revenue (MRR)

```sql
-- MRR from subscriptions (rolling 30-day window)
SELECT
  subscription_tier,
  COUNT(*) AS active_subscribers,
  SUM(amount_cents) / 100.0 AS mrr_usd
FROM factory_events
WHERE
  event_name = 'selfprime_subscription_activated'
  AND status = 'success'
  AND timestamp >= NOW() - INTERVAL '30 days'
GROUP BY subscription_tier
ORDER BY mrr_usd DESC;
```

### 4.2 Practitioner Revenue Share (Monthly)

```sql
-- Practitioner earnings for payout batch
SELECT
  practitioner_id,
  SUM(amount_cents) AS total_earned_cents,
  COUNT(*) AS unlock_count
FROM factory_events
WHERE
  event_name = 'selfprime_practitioner_earnings_accrued'
  AND status = 'success'
  AND DATE_TRUNC('month', timestamp) = DATE_TRUNC('month', NOW())
GROUP BY practitioner_id
HAVING SUM(amount_cents) >= 5000  -- $50 minimum payout threshold
ORDER BY total_earned_cents DESC;
```

### 4.3 Referral Attribution

```sql
-- Top referrers by converted revenue this quarter
SELECT
  fe_ref.properties->>'practitioner_id' AS referrer_id,
  COUNT(*) AS conversions,
  SUM(fe_sub.amount_cents) / 100.0 AS attributed_mrr_usd
FROM factory_events fe_ref
JOIN factory_events fe_sub
  ON fe_sub.properties->>'referral_code' = fe_ref.properties->>'referral_code'
  AND fe_sub.event_name = 'selfprime_subscription_activated'
WHERE
  fe_ref.event_name = 'selfprime_referral_converted'
  AND fe_ref.timestamp >= DATE_TRUNC('quarter', NOW())
GROUP BY referrer_id
ORDER BY attributed_mrr_usd DESC
LIMIT 20;
```

---

## 5. Stripe Integration Mapping

| SelfPrime Revenue Type | Stripe Object | Notes |
|---|---|---|
| Subscription (individual) | `Subscription` — `price_individual_usd` | Monthly, auto-renew |
| Subscription (practitioner) | `Subscription` — `price_practitioner_usd` | Monthly, auto-renew |
| Subscription (agency) | `Subscription` — `price_agency_usd` | Monthly, auto-renew |
| Video unlock (one-time) | `PaymentIntent` | No subscription |
| Referral reward (credit) | `PromotionCode` or account credit | Applied to next invoice |
| Referral reward (cash) | `Transfer` via Stripe Connect | Batched monthly |
| Practitioner payout | `Transfer` via Stripe Connect | Batched monthly |

**Stripe Connect model:** Platform → Practitioner = `destination charges`
- Platform fee deducted at charge time via `application_fee_amount`
- Practitioner receives automatic transfer 7 days after charge

---

## 6. Compliance & Idempotency

Identical to VideoKing contract requirements:

- Every payment event **must** include `idempotence_key` (Stripe request ID)
- Every earnings/payout event **must** include `correlation_id` linking back to the originating payment
- `reason_if_failed` is **required** when `status === 'failed'`
- Events older than 24 hours are rejected by the analytics ingestion layer
- All `amount_cents` values are integers — no floats in the event store

---

## 7. Differences from VideoKing Contract

| Dimension | VideoKing | SelfPrime |
|---|---|---|
| Primary revenue | Subscriptions + video unlocks | Subscriptions + practitioner revenue share |
| Creator role | Content creator (any user) | Certified practitioner (gated tier) |
| Content types | User-generated videos | AI-generated + practitioner-uploaded |
| Growth engine | Viral video sharing | Practitioner referrals + client invitations |
| Payout frequency | Monthly | Monthly (same) |
| Revenue split | 70/30 | 70/30 (identical) |
| Event prefix | `subscription_`, `unlock_`, etc. | `selfprime_` prefixed (partition by app) |
| Referral events | Not in VideoKing | Added (events 7–10) |
| Subscription tiers | `tier_1`, `tier_2`, `tier_3` | `free`, `individual`, `practitioner`, `agency` |

---

## 8. Implementation Checklist

- [ ] Add `selfprime_` events to `factory_events` check constraint
- [ ] Wire `selfprime_upgrade_intent` event to pricing page load (frontend)
- [ ] Wire `selfprime_checkout_started` to `/api/billing/checkout` response
- [ ] Wire `selfprime_subscription_activated` to Stripe webhook `customer.subscription.created`
- [ ] Wire `selfprime_subscription_renewed` to Stripe webhook `invoice.payment_succeeded`
- [ ] Wire `selfprime_subscription_cancelled` to Stripe webhook `customer.subscription.deleted`
- [ ] Wire `selfprime_referral_link_generated` to `/api/referrals/code` response
- [ ] Wire `selfprime_referral_converted` to Stripe webhook (check referral code in metadata)
- [ ] Wire `selfprime_referral_reward_issued` to referral reward processing
- [ ] Phase 2: Wire `selfprime_video_unlock_succeeded` to video unlock Stripe webhook
- [ ] Phase 2: Wire `selfprime_practitioner_earnings_accrued` after each unlock
- [ ] Phase 2: Wire `selfprime_payout_succeeded` to Stripe Connect payout webhook

---

## See Also

- [docs/videoking/monetization-funnel-spec.md](./monetization-funnel-spec.md) — Source contract (VideoKing)
- [docs/PRACTITIONER_VIDEO_STUDIO_SPEC.md](../PRACTITIONER_VIDEO_STUDIO_SPEC.md) — Phase 2 video upload spec
- [packages/analytics/src/index.ts](../../packages/analytics/src/index.ts) — Event schema types
- [apps/prime-self-reference/src/handlers/stripe-webhook.js](../../apps/prime-self-reference/) — Stripe webhook implementation
