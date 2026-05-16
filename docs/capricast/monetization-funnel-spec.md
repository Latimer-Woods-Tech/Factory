# Monetization Funnel Instrumentation Specification

## Overview
This specification defines the event schema, critical events, and instrumentation contract for measuring the complete monetization journey in VideoKing: subscriptions, unlocks, payouts, churn, and retention.

**Owner:** Product (Analytics), Finance, Operations  
**Last Updated:** 2026-04-28  
**Status:** Active

---

## 1. Event Schema & Contract

All monetization events **must** conform to the [`@latimer-woods-tech/analytics`](../../packages/analytics/src/index.ts) event schema.

### Base Event Structure

```typescript
interface MonetizationEvent {
  // Mandatory
  event_name: string;                    // One of 12 critical events (see section 2)
  user_id: string;                       // UUID of actor (subscriber or creator)
  event_type: 'subscription' | 'unlock' | 'earnings' | 'payout'; // Category
  timestamp: ISO8601;                    // UTC, server time
  
  // Financial context
  amount_cents: number;                  // Integer cents (e.g., 999 for $9.99)
  currency: 'USD';                       // Whitelisted (later: EUR, GBP)
  
  // Outcome tracking
  status: 'success' | 'failed' | 'pending' | 'cancelled';
  reason_if_failed?: string;             // e.g., "card_declined", "insufficient_funds", "customer_request"
  
  // Tracing
  correlation_id: string;                // Links payment → earnings → payout
  idempotence_key?: string;              // Stripe idempotency key (avoid double-charges)
  
  // Attribution
  creator_id?: string;                   // UUID of creator (for earnings/payouts)
  video_id?: string;                     // Video unlocked or subscribed to
  subscription_tier?: 'tier_1' | 'tier_2' | 'tier_3'; // If applicable
  
  // Platform context
  session_id?: string;                   // User session for cohort analysis
  utm_source?: string;                   // Traffic attribution
  geographic_region?: string;            // For regional pricing analysis
}
```

**Validation Rules:**
- `amount_cents` must be ≥ 0
- `timestamp` must be within last 24 hours (prevent stale replays)
- `correlation_id` must be UUID v4, globally unique
- `status` must match outcome (success ≠ failed, etc.)
- If `status === 'failed'`, `reason_if_failed` is required
- If `event_type === 'earnings' | 'payout'`, `creator_id` is required

**Example:**
```json
{
  "event_name": "subscription_payment_succeeded",
  "user_id": "usr_7a392c50",
  "creator_id": "usr_d0e42f1a",
  "event_type": "subscription",
  "amount_cents": 999,
  "currency": "USD",
  "status": "success",
  "timestamp": "2026-04-28T14:32:10Z",
  "correlation_id": "d4f90e7b-2a18-4c3e-9e2b-5f7c1b3a0d8e",
  "subscription_tier": "tier_1",
  "video_id": "vid_c1e8f294"
}
```

---

## 2. Critical Events (12 Total)

### **Subscription Funnel (6 events)**

#### A. `subscription_requested` — User clicks Subscribe button
- **Actor:** User / Subscriber
- **Typical Amount:** 0 (no charge yet; just intent)
- **Status:** always `success` (click happened)
- **When:** User clicks "Subscribe to Creator" button
- **Why:** Measure top-of-funnel demand

```json
{
  "event_name": "subscription_requested",
  "user_id": "usr_xxx",
  "creator_id": "usr_yyy",
  "event_type": "subscription",
  "amount_cents": 0,
  "status": "success",
  "subscription_tier": "tier_1"
}
```

#### B. `subscription_checkout_started` — Stripe session created
- **Actor:** Backend / Stripe
- **Amount:** Expected amount (0 if not calculated yet)
- **Status:** `success` (session created) or `failed` (unable to create)
- **When:** Backend calls `stripe.checkout.sessions.create()` and receives session ID
- **Why:** Measure checkout abandonment; identify technical failures

```json
{
  "event_name": "subscription_checkout_started",
  "user_id": "usr_xxx",
  "event_type": "subscription",
  "amount_cents": 999,
  "status": "success"
}
```

#### C. `subscription_payment_processing` — Payment initiated
- **Actor:** Stripe / Payment Processor
- **Amount:** Charge amount
- **Status:** `pending` (waiting for 3DS, authorization, etc.)
- **When:** Stripe begins processing; before terminal outcome
- **Why:** Measure how many reach this deep funnel stage

```json
{
  "event_name": "subscription_payment_processing",
  "user_id": "usr_xxx",
  "event_type": "subscription",
  "amount_cents": 999,
  "status": "pending"
}
```

#### D. `subscription_payment_succeeded` — Charge completed (Webhook)
- **Actor:** Stripe
- **Amount:** Actual charged amount
- **Status:** `success`
- **When:** Stripe sends `charge.succeeded` webhook
- **Why:** Measure conversion %; revenue recognition

```json
{
  "event_name": "subscription_payment_succeeded",
  "user_id": "usr_xxx",
  "event_type": "subscription",
  "amount_cents": 999,
  "status": "success",
  "timestamp": "2026-04-28T14:32:10Z",
  "idempotence_key": "cs_test_xyz"
}
```

#### E. `subscription_payment_failed` — Charge failed (Webhook)
- **Actor:** Stripe
- **Amount:** Attempted amount
- **Status:** `failed`
- **Reason:** e.g., `card_declined`, `card_network_error`, `processor_error`
- **When:** Stripe sends `charge.failed` webhook
- **Why:** Measure decline rate; identify recurring issues

```json
{
  "event_name": "subscription_payment_failed",
  "user_id": "usr_xxx",
  "event_type": "subscription",
  "amount_cents": 999,
  "status": "failed",
  "reason_if_failed": "card_declined"
}
```

#### F. `subscription_renewed` — Automatic renewal succeeded
- **Actor:** Stripe (recurring billing)
- **Amount:** Renewal amount
- **Status:** `success`
- **When:** Stripe successfully charges for renewal (e.g., 30 days later)
- **Why:** Measure retention; recurring revenue stability

```json
{
  "event_name": "subscription_renewed",
  "user_id": "usr_xxx",
  "event_type": "subscription",
  "amount_cents": 999,
  "status": "success"
}
```

---

### **Unlock Funnel (3 events)**

Same pattern as subscription, but for one-time unlocks (e.g., unlock a single video).

#### G. `unlock_requested` — User clicks Unlock button
- Same as `subscription_requested`, but for unlocks
- **Amount:** 0 (intent only)

#### H. `unlock_checkout_started` — Stripe session for unlock
- Same as `subscription_checkout_started`, but one-time charge
- **Amount:** e.g., 299 (for $2.99 unlock)

#### I. `unlock_payment_succeeded` — Unlock charge completed
- Same as `subscription_payment_succeeded`, but one-time
- **Amount:** Actual charged amount

---

### **Churn & Cancellation (1 event)**

#### J. `subscription_cancelled` — User unsubscribes
- **Actor:** User or Automated (e.g., failed renewal → auto-cancel)
- **Amount:** 0 (no charge)
- **Status:** `success` (cancellation processed) or `failed` (unable to process)
- **Reason:** e.g., `customer_request`, `invoice_payment_failed`, `dunning_exhausted`
- **When:** User clicks "Cancel" or cancellation triggered by system
- **Why:** Measure churn; identify churn triggers

```json
{
  "event_name": "subscription_cancelled",
  "user_id": "usr_xxx",
  "event_type": "subscription",
  "amount_cents": 0,
  "status": "success",
  "reason_if_failed": "customer_request"
}
```

---

### **Creator Earnings & Payouts (2 events)**

#### K. `creator_earnings_recorded` — Earnings attributed to creator
- **Actor:** Backend (after payment succeeds)
- **Amount:** Creator's cut (after platform fee)
- **Creator ID:** The creator receiving payment
- **User ID:** The paying subscriber
- **Status:** `success` (earnings recorded) or `failed` (record failed)
- **When:** After `subscription_payment_succeeded` webhook; platform calculates splits
- **Why:** Track creator earnings pipeline; identify delays

```json
{
  "event_name": "creator_earnings_recorded",
  "user_id": "usr_subscriber",
  "creator_id": "usr_creator",
  "event_type": "earnings",
  "amount_cents": 799,  // After 20% platform fee
  "status": "success"
}
```

#### L. `payout_completed` — Transfer to creator's bank succeeded
- **Actor:** Stripe Payouts API
- **Amount:** Payout amount (may be multiple subscribers' earnings batched)
- **Status:** `success` (transfer completed) or `failed` (transfer failed; now in DLQ)
- **Reason if failed:** e.g., `bank_error`, `invalid_account`, `risk_declined`
- **When:** Stripe successfully transfers funds to creator's bank (or Stripe Connect account)
- **Why:** Complete the funnel; measure payout SLA; identify delivery issues

```json
{
  "event_name": "payout_completed",
  "creator_id": "usr_creator",
  "event_type": "payout",
  "amount_cents": 10000,  // May include multiple subscriptions
  "status": "success",
  "timestamp": "2026-04-28T15:00:00Z"
}
```

---

## 3. Event Emission Points

| Event | Emitter | Timing | Idempotent? |
|-------|---------|--------|-------------|
| subscription_requested | Frontend (monetization-events.ts) | Button click | ✓ (session + button ID) |
| subscription_checkout_started | Backend (Stripe route handler) | After session created | ✓ (Stripe session ID) |
| subscription_payment_processing | Backend or Stripe webhook | Before terminal outcome | ✓ (charge ID) |
| subscription_payment_succeeded | Stripe webhook handler | After `charge.succeeded` | ✓ (via idempotence_key) |
| subscription_payment_failed | Stripe webhook handler | After `charge.failed` | ✓ (charge ID) |
| subscription_renewed | Stripe webhook handler | After renewal charge | ✓ (renewal charge ID) |
| unlock_requested | Frontend | Button click | ✓ (session + button ID) |
| unlock_checkout_started | Backend (Stripe route handler) | After session created | ✓ (Stripe session ID) |
| unlock_payment_succeeded | Stripe webhook handler | After `charge.succeeded` | ✓ (charge ID) |
| subscription_cancelled | Frontend / Backend / Automated | User action or system trigger | ✓ (subscription ID) |
| creator_earnings_recorded | Backend (payment processor) | After payment succeeds | ✓ (correlation_id) |
| payout_completed | Stripe webhook or scheduled job | After transfer succeeds | ✓ (payout ID) |

---

## 4. Correlation ID Lifecycle

The `correlation_id` must be:
1. **Generated** when user initiates action (subscription_requested)
2. **Carried through** checkout → payment processing → success/failure
3. **Linked to** earnings recorded → payout completed

This enables tracing a dollar from click → bank account.

**Example Flow:**
```
correlation_id: "abc-123-def"

subscription_requested (correlation_id: abc-123-def)
  ↓
subscription_checkout_started (correlation_id: abc-123-def)
  ↓
subscription_payment_processing (correlation_id: abc-123-def)
  ↓
subscription_payment_succeeded (correlation_id: abc-123-def)
  ↓
creator_earnings_recorded (correlation_id: abc-123-def)
  ↓
[7 days later]
payout_completed (correlation_id: abc-123-def linked in batch)
  ↓
[Bank receives transfer]
```

---

## 5. Whitelisted Failure Reasons

### Payment Processing Failures
- `card_declined` — Card issuer declined
- `card_network_error` — Network unreachable
- `processor_error` — Stripe or processor error
- `insufficient_funds` — Insufficient balance
- `lost_card` — Card reported lost
- `stolen_card` — Card stolen
- `duplicate_transaction` — Duplicate detected
- `generic_decline` — Generic decline (no reason)

### Dunning / Renewal Failures
- `invoice_payment_failed` — Failed after multiple retries
- `dunning_exhausted` — Dunning retries exceeded
- `subscription_schedule_failed` — Scheduled charge failed

### System / Policy Failures
- `customer_request` — User requested cancellation
- `fraud_suspected` — Risk check triggered
- `risk_declined` — Payout risk declined
- `bank_error` — Transfer failed at bank
- `invalid_account` — Account details invalid
- `region_not_supported` — Unsupported payment region

---

## 6. Implementation Checklist

- [ ] Event schema validated in @latimer-woods-tech/analytics
- [ ] Frontend instrumentation (apps/web/src/instrumentation/monetization-events.ts)
- [ ] Stripe webhook handlers emit events for payment_succeeded / payment_failed / charge events
- [ ] Subscription renewal handler emits subscription_renewed
- [ ] Earnings calculator emits creator_earnings_recorded
- [ ] Payout service emits payout_completed
- [ ] Correlation ID flows through payment → earnings → payout pipelines
- [ ] All 12 events firing in staging
- [ ] No data gaps in last 30 days
- [ ] Dashboard queries execute without error
- [ ] 5-minute lag SLA met (events queryable within 5 min of emission)

---

## 7. Links & References

- **Analytics Schema:** [packages/analytics](../../packages/analytics/src/index.ts)
- **Stripe Webhook Handlers:** [apps/video-studio/src/routes/webhooks.ts](../../apps/video-studio/src/routes/webhooks.ts)
- **Dashboard Queries:** [docs/videoking/monetization-analytics.sql](./monetization-analytics.sql)
- **Dashboard Template:** [docs/dashboards/monetization-funnel-template.yaml](../dashboards/monetization-funnel-template.yaml)
- **Frontend Integration:** [apps/web/src/instrumentation/monetization-events.ts](../../apps/web/src/instrumentation/monetization-events.ts)
- **Revenue Integrity Audit:** [docs/videoking/revenue-integrity-audit.md](./revenue-integrity-audit.md)
