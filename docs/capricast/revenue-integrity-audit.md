# Revenue Integrity Audit Workflow & Weekly Report Template

**Owner:** Finance, Operations  
**Frequency:** Automated every Monday 9:00 AM UTC; stores in `docs/reports/revenue-integrity-YYYY-WW.md`  
**Execution:** GitHub Actions (scripts/revenue-integrity-audit.mjs)  
**Audience:** Finance lead, Ops lead, Product lead

---

## Automated Weekly Report Template

### Example: `docs/reports/revenue-integrity-2026-W17.md`

```markdown
# Revenue Integrity Audit — Week 17 (Apr 21–27, 2026)

**Report Generated:** Monday Apr 28, 2026 09:00 UTC  
**Data Cutoff:** Sunday Apr 27, 2026 23:59 UTC  
**Status:** ✅ All checks passed (0 exceptions)

---

## Executive Summary

| Metric | This Week | Last Week | Change | Status |
|--------|-----------|-----------|--------|--------|
| **Total Revenue** | $47,230 | $45,100 | +4.7% | ✅ |
| **Total Refunds** | $892 | $1,050 | −15.1% | ✅ |
| **Refund Rate** | 1.89% | 2.33% | ✅ <2% | ✅ |
| **Creator Earnings Recorded** | $37,784 | $36,080 | +4.7% | ✅ |
| **Creator Payouts Completed** | $34,220 | $35,900 | −4.7% | ✅ (lag normal) |
| **Payout Pipeline** | $12,450 | $11,220 | +10.9% | ⚠️ (watch) |
| **Failed Transfers (DLQ)** | $340 | $0 | new | 🔴 (review) |
| **Reconciliation** | ✅ Balanced | ✅ Balanced | — | ✅ |

---

## Detailed Breakdown

### 1. Total Revenue by Channel

```
Subscriptions         $41,200  (87.2%)
Unlocks               $6,030   (12.8%)
────────────────────────────
TOTAL REVENUE         $47,230
```

**Week-over-Week Trend:**
- Subscriptions: +3.1% (more renewals, fewer new cancellations)
- Unlocks: +12.5% (viral video from @alice drove traffic)
- **Net:** +4.7% revenue growth (✅ on target)

---

### 2. Refunds & Chargebacks

| Type | Count | Amount | Details |
|------|-------|--------|---------|
| Refund (customer request) | 6 | $540 | Refunds completed within 24h |
| Chargeback | 2 | $200 | Both disputed; fighting with processor |
| Failed Unlock (auto-refund) | 4 | $152 | Unlock delivery failed; auto-refunded |
| **TOTAL** | **12** | **$892** | |

**Refund Rate:** 1.89% of revenue (✅ target: <2%)  
**Status:** ✅ Acceptable; below threshold

---

### 3. Creator Earnings Audit

**Total Recorded:** $37,784 (20% of $47,230 revenue; platform keeps 20% fees)

**Breakdown by Creator:**

| Creator | Revenue | Earnings | Share % | Status |
|---------|---------|----------|---------|--------|
| @alice | $12,400 | $9,920 | 26.2% | ✅ |
| @bob | $8,100 | $6,480 | 17.1% | ✅ |
| @charlie | $5,600 | $4,480 | 11.8% | ✅ |
| ... | ... | ... | ... | ... |
| **TOTAL** | **$47,230** | **$37,784** | **100%** | ✅ |

**Verification:** Sum of earnings = Revenue − Platform Fees  
  $37,784 = $47,230 − $9,446 ✅

---

### 4. Creator Payouts Status

**Completed This Week:** $34,220
- Method: ACH (85%), Stripe Connect (15%)
- Avg processing time: 4.2 days (✅ SLA: <7 days)
- Failed transfers: 0 (✅)

**Pending (In Batch Queue):** $12,450
- Scheduled for payout next Monday
- Expected delivery: Wed May 1
- No exceptions flagged

**Overdue (>14 Days):** $0 (✅ no creators waiting long)

**Failed Transfers (DLQ):** $340
- Reason: Invalid bank account (creator didn't verify account)
- Status: DLQ'd; manual triage required (see exceptions below)
- Action: Support to contact creator for updated account info

---

### 5. Reconciliation Check

```
+────────────────────────────────────────────────
| CASH IN
+────────────────────────────────────────────────
Revenue (subscriptions + unlocks)       $47,230
Less: Refunds                           ($892)
────────────────────────────────────────
NET MONEY IN (Stripe account)            $46,338

+────────────────────────────────────────────────
| CASH OUT
+────────────────────────────────────────────────
Payouts Completed (to creators)         $34,220
Payouts Pending (in batch)              $12,450
Payouts DLQ (failed; will retry)           $340
────────────────────────────────────────
TOTAL COMMITTED PAYOUTS                 $47,010

+────────────────────────────────────────────────
| BALANCE CHECK
+────────────────────────────────────────────────
Stripe Account Balance                  ~$5,000 (for float)
Total Paid Out So Far (all time)       $1,234,567
Total Earnings Recorded (all time)     $1,392,400

Reconcile: Earnings − Payouts = Buffer + DLQ
$1,392,400 − $1,234,567 = $157,833
Expected Buffer + DLQ: $12,450 + $340 + ~$5,000 = $17,790
...wait, $157,833 ≠ $17,790. Issue detected!

→ See Exception #1 below.
```

---

## Exceptions Requiring Review

### Exception #1: Large Variance in All-Time Reconciliation

**Finding:** Total earnings recorded ($1,392,400) − Total payouts ($1,234,567) = $157,833  
**Expected:** Should be ≈ Pending + DLQ + Buffer ≈ $17,790  
**Gap:** $140,043 unaccounted for

**Diagnosis:** 
- [ ] Check if any creators have unclaimed earnings (pending creator verification)
- [ ] Query: `SELECT SUM(amount_cents) FROM factory_events WHERE event_name = 'creator_earnings_recorded' AND status != 'success'`
- [ ] Check if earnings are being double-recorded somehow
- [ ] Verify Stripe payout webhook handlers aren't missing events

**Owner:** Finance Lead + Ops  
**Deadline:** By EOD Tuesday (within 24h of report)  
**If Unresolved:** Escalate to Engineering; stop payout automation until cleared

---

### Exception #2: Failed Transfers ($340)

**Details:**
- Creator: @unknown-creator-id-xyz
- Attempted Payout: $340
- Reason: "invalid_account" (bank account not verified)
- Retry Scheduled: Not yet (manual action needed)

**Action:**
- [ ] Support team reaches out to creator
- [ ] Creator updates bank account in settings
- [ ] Finance manually retries transfer (or trigger automatic retry)
- [ ] Verify success within 48h

**Owner:** Operations / Support  
**Deadline:** By EOD Wednesday

---

### Exception #3: DLQ Recommendation

**Observation:** $340 in DLQ is low (✅ <0.5% of attempted payouts)  
**But:** More than $0, so manual attention needed

**Check:**
- [ ] No systemic issues with payout routing
- [ ] No pattern of failures (all different creators ≠ systemic)

**Status:** ✅ Cleared (isolated to one creator's bad account)

---

## One-Line Executive Summary

**This week: +$47.2k revenue, on track, 0 systemic issues, 1 DLQ exception (isolated), reconciliation variance needs investigation.**

---

## Weekly Integrity Checklist

- [ ] Report auto-generated by scripts/revenue-integrity-audit.mjs
- [ ] All 10 finance formulas match (see below)
- [ ] Refund rate <2% of revenue
- [ ] Failed payout % <0.5% of attempted
- [ ] Reconciliation balanced (or variance <$1k)
- [ ] Payout lag SLA met (>90% <7 days)
- [ ] No creators waiting >14 days
- [ ] Finance lead signs off
- [ ] Ops lead signs off
- [ ] Report posted to Slack #revenue-integrity channel

---

## Finance Formulas (Automated Validation)

All queries below must pass validation with zero errors:

### Formula 1: Revenue = Subscriptions + Unlocks
```sql
SELECT
  SUM(CASE WHEN event_name = 'subscription_payment_succeeded' THEN amount_cents ELSE 0 END) +
  SUM(CASE WHEN event_name = 'unlock_payment_succeeded' THEN amount_cents ELSE 0 END) as total_revenue,
  SUM(amount_cents) as events_sum
FROM factory_events
WHERE event_name IN ('subscription_payment_succeeded', 'unlock_payment_succeeded')
  AND status = 'success'
  AND event_timestamp >= DATE_TRUNC('week', NOW() - INTERVAL '1 week')
  AND event_timestamp < DATE_TRUNC('week', NOW());
-- Expected: total_revenue APPROX EQUAL TO events_sum (difference <$1)
```

### Formula 2: Creator Earnings = (Revenue − Platform Fees)
```sql
SELECT
  SUM(CASE WHEN event_name IN ('subscription_payment_succeeded', 'unlock_payment_succeeded') 
           THEN amount_cents ELSE 0 END) as revenue,
  SUM(CASE WHEN event_name = 'creator_earnings_recorded' THEN amount_cents ELSE 0 END) as earnings,
  SUM(CASE WHEN event_name IN ('subscription_payment_succeeded', 'unlock_payment_succeeded') 
           THEN amount_cents ELSE 0 END) -
  SUM(CASE WHEN event_name = 'creator_earnings_recorded' THEN amount_cents ELSE 0 END) as platform_fees
FROM factory_events
WHERE event_timestamp >= DATE_TRUNC('week', NOW() - INTERVAL '1 week')
  AND event_timestamp < DATE_TRUNC('week', NOW());
-- Expected: platform_fees BETWEEN revenue * 0.18 AND revenue * 0.22 (20% ±2%)
```

### Formula 3: Payouts = Completed + Pending + DLQ
```sql
SELECT
  SUM(CASE WHEN event_name = 'payout_completed' AND status = 'success' THEN amount_cents ELSE 0 END) as completed,
  SUM(CASE WHEN event_name = 'payout_completed' AND status = 'pending' THEN amount_cents ELSE 0 END) as pending,
  SUM(CASE WHEN event_name = 'payout_completed' AND status = 'failed' THEN amount_cents ELSE 0 END) as dlq
FROM factory_events
WHERE event_timestamp >= DATE_TRUNC('week', NOW() - INTERVAL '4 weeks');
-- Expected: SUM(all three) APPROX sum of all creator_earnings_recorded (within $100)
```

### Formula 4: Refund Rate = Refunds / Revenue
```sql
SELECT
  ROUND(100.0 * SUM(amount_cents) / 
    (SELECT SUM(amount_cents) FROM factory_events 
     WHERE event_name IN ('subscription_payment_succeeded', 'unlock_payment_succeeded')
     AND event_timestamp >= DATE_TRUNC('week', NOW() - INTERVAL '1 week')), 2) as refund_pct
FROM factory_events
WHERE event_name IN ('subscription_cancelled', 'unlock_refund')  -- or similar
  AND status = 'success'
  AND event_timestamp >= DATE_TRUNC('week', NOW() - INTERVAL '1 week');
-- Expected: refund_pct <2%
```

### Formula 5: Failed Payouts % = Failed / All Attempted
```sql
SELECT
  ROUND(100.0 * COUNT(CASE WHEN status = 'failed' THEN 1 END) /
    NULLIF(COUNT(*), 0), 3) as failed_payout_pct
FROM factory_events
WHERE event_name = 'payout_completed'
  AND event_timestamp >= DATE_TRUNC('week', NOW() - INTERVAL '1 week');
-- Expected: failed_payout_pct <0.5%
```

### Formula 6–10: (Reserved for custom business logic)

---

## Monthly Deep-Dive (Integrated with Monthly Financial Close)

See [monthly-revenue-close.md](./monthly-revenue-close.md)
