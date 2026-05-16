# Interpreting the Monetization Funnel Dashboard
## A Diagnostic Guide for Product, Finance, and Operations

**Owner:** Product / Analytics Lead  
**Audience:** Product leads, finance team, operations  
**Update Frequency:** Weekly

---

## Quick Reference: Interpreting Your Metrics

### 1. **Subscription Funnel Conversion Quick Check**

**The Dashboard Shows:**
- Requested: 1000 clicks
- Checkout Started: 400 sessions (40%)
- Succeeded: 150 subscriptions (15%)

**What This Tells You:** For every 100 users who click "Subscribe," only 15 complete purchase. This is your conversion funnel.

**Red Flags by Stage:**

| Metric | Normal | Warning | Critical |
|--------|--------|---------|----------|
| Checkout Started % | 35–50% | 25–35% | <25% |
| Payment Success % | 75–90% | 60–75% | <60% |
| Overall Conversion | 15–25% | 10–15% | <10% |

---

### 2. **ARPU (Average Revenue Per User) Trend**

**What It Measures:** Average revenue per unique paying user each week.

**Example:**
- Week 1 ARPU: $12.50
- Week 2 ARPU: $11.80 (−5.6%)
- Week 3 ARPU: $13.20 (+11.9%)

**Diagnosis Guide:**

| Scenario | Likely Cause | Investigation |
|----------|-------------|----------------|
| ARPU dropping | (a) Pricing change, (b) Tier mix shift, (c) More one-time unlocks, fewer subscriptions | Check tier distribution; compare unlock vs. subscription ratio |
| ARPU rising | (a) More renewals, (b) Tier migration (users upgrading), (c) Churn effect (low-ARPU users leaving) | Check renewal rate; compare new vs. retained users |
| ARPU volatile | (a) Small sample size (early stage), (b) Seasonal events, (c) Promotional pricing | Look at week-over-week growth; check for promotions |

**Action Threshold:** If ARPU drops >10% week-over-week and user count is stable, investigate within 2 hours.

---

### 3. **Cohort Retention (Day 5, 30, 90)**

**What It Measures:** % of users who first subscribed in a cohort week who are still active (renewing) at day 5, day 30, and day 90.

**Example Cohort (Week of Apr 1–7):**
- Day 5 Retention: 65% (650 of 1000 first-time subscribers renewed)
- Day 30 Retention: 42% (420 retained)
- Day 90 Retention: 28% (280 retained)

**Industry Benchmarks (SaaS video):**
- Day 5: 50–70% (should see most churn here)
- Day 30: 30–50% (retention flattens after day 5)
- Day 90: 15–35% (long-term commitment)

**Red Flags:**

| Issue | Normal | Alert | Critical |
|-------|--------|-------|----------|
| Day 5 Retention | 55% | <50% | <35% |
| Day 30 Retention | 40% | <30% | <15% |
| Day 90 Retention | 25% | <15% | <5% |

**Diagnosis Guide:**

| Pattern | Likely Cause | Next Step |
|---------|-------------|-----------|
| Retention cliff at Day 5 | Trial period ending; users deciding not to continue | Check free trial duration; survey churned users on messaging |
| Steady decline Day 5→30→90 | Normal (expected) | No action; monitor for degradation |
| Sudden drop at Day 30 | Renewal failed (payment declined); customer support issue | Check failed renewal rate; look for support tickets |
| Flatter curve (less churn) | Engagement improvements; feature rollout resonating | Celebrate; document changes for future |

---

### 4. **Churn Reasons Pie Chart**

**What It Shows:** Why users are cancelling. Top 5 reasons this month.

**Example Breakdown:**
- Customer Request: 45% (users voluntarily unsubscribe)
- Invoice Payment Failed: 30% (card declined on renewal)
- Feature Request Not Delivered: 15%
- Technical Issue: 7%
- Fraud Detected: 3%

**Action by Reason:**

| Reason | Action |
|--------|--------|
| Customer Request | Survey 5 users; identify top pain point; product backlog |
| Invoice Payment Failed | Email recovery series; offer retry; check for card pattern (expiry?) |
| Feature Request | Prioritize in roadmap; communicate timeline |
| Technical Issue | Page ops; investigate error logs |
| Fraud Detected | Partner with fraud team on policy |

**Threshold:** If any single reason >40% of churn, escalate to product lead.

---

### 5. **Failed Payments & Recovery Rate**

**What It Measures:** Users whose payment failed; how many tried again within 7 days; success rate on retry.

**Example:**
- Total Failed Attempts: 450
- Retried Successfully: 180 (40%)
- Retried but Failed Again: 90 (20%)
- Never Retried: 180 (40%)

**Recovery Targets:**
- Successful Recovery Rate: >50%
- Never-Retry Rate: <25% (indicates card is genuinely dead)

**Breakdown by Failure Reason:**

| Reason | Recovery Rate | Action if Low |
|--------|---------------|---------------|
| Card Declined | 60–80% | Normal; card issue, user will fix |
| Insufficient Funds | 40–50% | Normal; waiting for paycheck |
| Network Error | 90%+ | Investigate; retry logic should catch this |
| Card Expired | 30–40% | Suggest card update in email |
| Fraud Blocked | 10–20% | Partner with payments team on false positives |

**Red Flag:** If recovery rate <40%, product should implement dunning (retry-after-X-days) sequence.

---

### 6. **Payout SLA (<7 Days)**

**What It Measures:** % of creator earnings that are paid out within 7 days (business day target: <5 days typical).

**Example:**
- Eligible Payouts This Month: 2,000 earnings events
- Completed Within 7 Days: 1,960 (98%)
- Completed Within 14 Days: 1,999 (99.95%)
- Still Outstanding (>14 days): 1 (0.05%)

**SLA Target:** 95%+ within 7 days

**Red Flags:**

| Metric | Normal | Warning | Critical |
|--------|--------|---------|----------|
| SLA Compliance (<7d) | >95% | 80–95% | <80% |
| Avg Days to Payout | 3–5 | 5–7 | >7 |
| Any Creator Waiting >14d | 0 | 1–2 creators | >3 creators |

**If SLA <95%:** Escalate to Finance + Ops. Diagnose:
1. Stripe delays? (integration issue) → Check Stripe API logs
2. Batch job not running? (automation issue) → Check scheduled job logs
3. Insufficient funds in Stripe account? → Top up from revenue
4. Individual creator validation failing? (data issue) → Manual triage in revenue-integrity-audit

---

### 7. **Creator Earnings Attribution**

**What It Shows:** Top 10 creators by earnings this month; trend.

**Example:**
| Creator | Earnings (USD) | Events | Avg per Event |
|---------|---------|--------|---------------|
| @alice | $5,200 | 520 | $10.00 |
| @bob | $4,100 | 410 | $10.00 |
| @charlie | $2,800 | 280 | $10.00 |

**Diagnosis:**

| Pattern | Action |
|---------|--------|
| Top creator earnings suddenly drop | Check if they paused uploads; reach out to verify they're still active |
| New creator in top 10 | Growth signal; feature visibility working; celebrate |
| Earnings flat (not growing with traffic) | May indicate price sensitivity; check if ARPU dropped |

---

## Workflow: "Why Did Conversions Drop?"

### Scenario: Your weekly report shows funnel conversion dropped from 18% to 14% (−22%)

**Step 1: Rule Out Data Issues** (5 min)
- Check dashboard refresh timestamp: is data fresh? (should be <1 min old)
- Verify event count in funnel: is total traffic similar?
  - If traffic is down 50%, then conversion % is meaningless (fewer attempts)
  - If traffic is flat, conversion drop is real

**Step 2: Isolate the Leak** (10 min)
- Which step dropped?
  - Requested → Checkout Started: Traffic issue or messaging?
  - Checkout Started → Succeeded: Payment processing issue?
  - Or all-of-the-above: Site outage?

| Step | Dropped | Likely Cause |
|------|---------|-------------|
| Requested | Yes | Traffic source changed or site visibility down. Check Stripe dashboard traffic. |
| Checkout Started | Yes | Checkout UX broken; check error logs. Or user clicked but abandoned (normal). |
| Succeeded | Yes | Payment failures spiking. Check failed payment reason breakdown. |

**Step 3: Check Platform Events** (5 min)
- Any deployments yesterday? Code changes in checkout flow?
- Any Stripe integration changes?
- Any infrastructure incidents? (check status page)

**Step 4: Check Payment Provider** (10 min)
- Log into Stripe dashboard
- Check success rate on payments (Stripe dashboard → Payments → Success Rate)
- If Stripe success rate is down, issue is on their side or with your data
- If Stripe success rate is stable, issue is in your checkout UI or user behavior

**Step 5: Check Failure Reasons** (5 min)
- Query your dashboard: "Failed Payments by Reason (Last 7 days)"
- If "card_declined" spiked: users ran out of money or expired cards; normal seasonal pattern
- If "processor_error" spiked: Stripe or payment network issue; escalate to Stripe support
- If "risk_declined" spiked: fraud filter too aggressive; page payments team

**Step 6: Run Query** (2 min)
Execute this query in your analytics tool:

```sql
SELECT
  DATE(event_timestamp) as date,
  COUNT(DISTINCT CASE WHEN event_name = 'subscription_requested' THEN correlation_id END) as requested,
  COUNT(DISTINCT CASE WHEN event_name = 'subscription_payment_succeeded' THEN correlation_id END) as succeeded,
  ROUND(100.0 * COUNT(DISTINCT CASE WHEN event_name = 'subscription_payment_succeeded' THEN correlation_id END) /
    NULLIF(COUNT(DISTINCT CASE WHEN event_name = 'subscription_requested' THEN correlation_id END), 0), 2) as funnel_pct
FROM factory_events
WHERE event_name IN ('subscription_requested', 'subscription_payment_succeeded')
  AND event_timestamp >= NOW() - INTERVAL '14 days'
GROUP BY DATE(event_timestamp)
ORDER BY date DESC;
```

This shows you funnel % day-by-day. **When exactly did it drop?**
- If drop was at 12:00 PM on Monday: correlate with deployment time
- If gradual over week: correlate with viral event or traffic source change

---

## Weekly Standup Agenda (Product + Finance + Ops)

**Every Monday 10:00 AM UTC (15 min)**

### Prepared by: Analytics Lead
- Revenue this week: $X (vs. last week: $Y)
- ARPU: $A (trend: +/−Z%)
- Churn rate: C% (target: <5%)
- Funnel conversion: F% (target: 18–25%)
- Payout SLA: S% (target: >95%)
- Exceptions: (list below)

### Exceptions Require Discussion
- Conversion <15% → Product lead investigates
- Churn >8% → Product lead + ops investigate
- ARPU dropped >10% → Product lead diagnoses
- Payout SLA <90% → Finance + ops diagnoses
- Any creator waiting >14 days for payout → Finance follows up

### Decision Framework
| Finding | Severity | Decision |
|---------|----------|----------|
| Conversion dip but recovers by day 3 | Low | Monitor; no action |
| Conversion dip + sustained | Medium | Investigate; may need code revert |
| Payout late to single creator | Low | Ops manual fix; notify creator |
| Funnel broken (failed payment spike) | High | Page payments team; may need rollback |

---

## Monthly Close (Finance) — Checklist

By end of day on last business day of month:

- [ ] Run [monthly-revenue-close.sql](./monthly-revenue-close.md) query
- [ ] Compare reported revenue to dashboard ARPU × users
- [ ] Reconcile: Total Revenue = Payouts + Refunds + Platform Fees + Outstanding
- [ ] Identify outliers (creators with anomalous earnings)
- [ ] Export transaction log for external audit
- [ ] Sign-off: "Revenue reconciled and audited"

---

## Troubleshooting: Dashboard Issues

| Issue | Solution |
|-------|----------|
| Dashboard shows no data | (1) Check data source connection to Postgres. (2) Verify factory_events table exists. (3) Run test query: `SELECT COUNT(*) FROM factory_events WHERE event_timestamp > NOW() - INTERVAL '1 day'` |
| Metrics stuck at old values | (1) Check dashboard refresh rate (should be 1 min). (2) Manually click "Refresh" button. (3) Check if events are still flowing into factory_events. |
| Alert firing constantly | (1) Check alert threshold is realistic. (2) Verify condition SQL is correct. (3) Consider disabling if false-positive rate >20%. |
| Query times out | (1) Reduce date range (e.g., last 7 days instead of 90). (2) Add index on event_timestamp. (3) Contact DB admin. |

---

## Next Steps

1. **Import dashboard template** into your Grafana/PostHog instance (docs/dashboards/monetization-funnel-template.yaml)
2. **Adjust alert email recipients** (product-lead@, ops-lead@, finance-lead@)
3. **Schedule weekly sync** on calendar (Monday 10:00 AM UTC)
4. **Train team** on interpreting metrics (30-min walkthrough)
5. **Document decisions** from weekly standups in Slack thread for future reference
