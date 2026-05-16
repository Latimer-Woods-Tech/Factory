# Revenue Integrity Exception Review Process

**Owner:** Finance, Operations  
**Running:** Every Monday after the automated report (scripts/revenue-integrity-audit.mjs)  
**Audience:** Finance lead, Ops lead, Product lead  
**Escalation:** Engineering if exceptions persist >2 weeks

---

## Exception Severity Levels

| Level | Trigger | Response Time | Owner | Action |
|-------|---------|----------------|-------|--------|
| 🟢 **Green** | All checks pass | N/A | Auto-mark resolved | Continue monitoring |
| 🟡 **Yellow** | Warning threshold hit | 24 hours | Finance/Ops | Investigate; document findings |
| 🟠 **Orange** | Threshold exceeded; systemic pattern | 4 hours | Finance/Ops + Product | Escalate to team lead; may trigger pause |
| 🔴 **Red** | Revenue discrepancy >$1k or unreconciled | 1 hour | Finance + Eng + Ops | Page on-call; pause automation if unresolved |

---

## Exception Thresholds & Auto-Triggers

### Threshold 1: Refund Rate > 2% of Revenue

**Severity:** 🟡 Yellow (warning) at 1.8% → 🟠 Orange at 2.2%+

**Trigger Condition:**
```sql
SELECT
  ROUND(100.0 * SUM(amount_cents) / 
    (SELECT SUM(amount_cents) FROM factory_events 
     WHERE event_name IN ('subscription_payment_succeeded', 'unlock_payment_succeeded')), 2) as refund_pct
FROM factory_events
WHERE event_name IN ('subscription_cancelled', 'refund_issued')
  AND event_timestamp >= DATE_TRUNC('week', NOW());
-- IF refund_pct > 2.0 → trigger exception
```

**Investigation Checklist:**
- [ ] Check [interpreting-monetization-funnel.md#churn-reasons](./interpreting-monetization-funnel.md#4-churn-reasons-pie-chart) for churn breakdown
- [ ] Top churn reasons: Does one reason account for >50% of refunds?
- [ ] Timeline: Did refunds spike at specific time? Check for deployment or outage
- [ ] Creator pattern: Are refunds concentrated in specific creators? (indicates low quality)
- [ ] Payment provider: Any Stripe issues reported this week?

**Action Items:**
1. **If single churn reason >50%:** Escalate to Product lead. Update [revenue-sync-agenda.md](./revenue-sync-agenda.md) for Monday standup.
2. **If refunds spiking after deployment:** Check deployment log + notify Product lead of potential feature regression.
3. **If refunds tied to creator quality:** Notify Creator Success team; review creator roster.
4. **If Stripe issue:** Contact Stripe support; document incident in #revenue-integrity Slack channel.

**Resolution Criteria:** Refund rate back below 1.8% by next Monday report, OR documented root cause + remediation plan in place.

---

### Threshold 2: Failed Transfers % > 0.5% of Payout Attempts

**Severity:** 🟡 Yellow at 0.3% → 🔴 Red at 1.0%+

**Trigger Condition:**
```sql
SELECT
  ROUND(100.0 * COUNT(CASE WHEN status = 'failed' THEN 1 END) /
    NULLIF(COUNT(*), 0), 3) as failed_payout_pct
FROM factory_events
WHERE event_name = 'payout_completed'
  AND event_timestamp >= DATE_TRUNC('week', NOW());
-- IF failed_payout_pct > 0.5 → trigger exception
```

**Investigation Checklist:**
- [ ] Check DLQ: Which creators have failed transfers? Why?
  - Invalid account? → Creator action needed (update banking info)
  - Network error? → Infrastructure issue; may be transient
  - Rejected by bank? → Contact creator for details; may be fraud hold
  - Insufficient funds? → Platform doesn't have enough in Stripe; refund operations
- [ ] Payout retry logic: Did failed transfers get retried automatically?
- [ ] Creator communication: Did creators get notified of failures?

**DLQ Triage Template (Ops):**
```
Creator: @alice
Failed Payout ID: payout_xyz
Amount: $500
Failure Reason: invalid_account
Timestamp: Apr 27 3:00 PM UTC
Days Waiting: 1 day

Next Step:
[ ] Support reaches out to creator
[ ] Creator updates banking info
[ ] Finance retries transfer
[ ] Verify completion by <deadline>
```

**Action Items:**
1. **Invalid Account:** Support contacts creator; gets updated banking info; Finance retries next business day.
2. **Network/Transient Error:** Automatic retry in 1 hour (already coded); if re-fails, escalate to Ops.
3. **Bank Rejection:** Contact Stripe support; may require creator to contact their bank directly.
4. **Insufficient Funds:** Verify Stripe balance; if low, deposit from business account; notify Finance.

**Resolution Criteria:** All failed transfers either (a) successfully retried, or (b) creator action in progress with known deadline, or (c) root cause documented and systemic fix in progress.

---

### Threshold 3: Reconciliation Variance > $1,000

**Severity:** 🠢 Orange (immediate investigation)

**Trigger Condition:**
```sql
WITH earnings_total AS (
  SELECT SUM(amount_cents) as total
  FROM factory_events WHERE event_name = 'creator_earnings_recorded'
),
payouts_total AS (
  SELECT SUM(amount_cents) as total
  FROM factory_events WHERE event_name = 'payout_completed'
),
expected_buffer AS (
  SELECT
    (SELECT COALESCE(SUM(amount_cents), 0) FROM factory_events 
     WHERE event_name = 'payout_completed' AND status = 'pending') +
    (SELECT COALESCE(SUM(amount_cents), 0) FROM factory_events 
     WHERE event_name = 'payout_completed' AND status = 'failed') +
    5000000  -- $5k float buffer
  as buffer
)
SELECT
  ABS(
    (SELECT total FROM earnings_total) -
    (SELECT total FROM payouts_total) -
    (SELECT buffer FROM expected_buffer)
  ) as variance;
-- IF variance > 100000 (cents = $1000) → trigger exception
```

**Investigation Checklist (PRIORITY: Stop payout automation until cleared):**
- [ ] Double-check query logic: Is there a bug in the variance calculation?
- [ ] Check event timestamps: Are we including events from multiple weeks?
- [ ] Check event status: Are we only counting `status = 'success'` earnings?
- [ ] Query raw data: Run each leg of the query separately to isolate the discrepancy
- [ ] Check for missing events: Are webhook handlers capturing all payment events?
- [ ] Check for duplicates: Run `SELECT correlation_id, COUNT(*) FROM factory_events WHERE event_name = 'creator_earnings_recorded' GROUP BY correlation_id HAVING COUNT(*) > 1` to detect duplicates

**Action Items:**
1. **Halt payout automation:** Stop scheduled payout jobs until variance explained
2. **Page Finance Lead + Engineer:** This may indicate data corruption or payments being missed
3. **Forensics:** Export transaction log for the variance week; cross-check against Stripe API
4. **Root cause analysis:** Document findings in #revenue-integrity Slack thread

**Resolution Criteria:** Variance explained and fixed, OR payout automation re-enabled with documented mitigation (e.g., manual verification step).

---

### Threshold 4: Payout Lag SLA (<95% within 7 days)

**Severity:** 🟡 Yellow at 90% → 🔴 Red at <80%

**Trigger Condition:**
```sql
WITH earnings_dates AS (
  SELECT creator_id, correlation_id, event_timestamp as earnings_date
  FROM factory_events WHERE event_name = 'creator_earnings_recorded'
    AND event_timestamp >= DATE_TRUNC('week', NOW() - INTERVAL '1 week')
),
payout_dates AS (
  SELECT creator_id, correlation_id, event_timestamp as payout_date
  FROM factory_events WHERE event_name = 'payout_completed' AND status = 'success'
    AND event_timestamp >= DATE_TRUNC('week', NOW() - INTERVAL '1 week')
)
SELECT ROUND(
  100.0 * COUNT(DISTINCT CASE WHEN EXTRACT(DAY FROM (pd.payout_date - ed.earnings_date)) <= 7 
    THEN pd.correlation_id END) / NULLIF(COUNT(*), 0), 1
) as sla_pct
FROM earnings_dates ed
LEFT JOIN payout_dates pd ON ed.creator_id = pd.creator_id AND ed.correlation_id = pd.correlation_id;
-- IF sla_pct < 95 → trigger exception
```

**Investigation Checklist:**
- [ ] Payout batch timing: When do payouts run? (Should be daily or 2x/week)
- [ ] Stripe API latency: Are payout API calls slow?
- [ ] Database lag: Is the payout_completed event delayed in being recorded?
- [ ] Any creators individually >14 days?

**Action Items:**
1. **Check payout job logs:** Did batch run on schedule?
2. **If batch didn't run:** Check GitHub Actions workflows; verify cron trigger; manually trigger if needed
3. **If Stripe latency:** Contact Stripe support; may be on their side
4. **If individual creators waiting >14 days:** Manually retry their transfer + notify them of delay

**Resolution Criteria:** SLA back to >95%, OR documented roadmap to improve (e.g., increase batch frequency).

---

### Threshold 5: Any Creator Waiting >14 Days

**Severity:** 🠢 Orange (creator support issue)

**Trigger Condition:**
```sql
WITH earnings_dates AS (
  SELECT creator_id, correlation_id, event_timestamp as earnings_date
  FROM factory_events WHERE event_name = 'creator_earnings_recorded'
),
payout_dates AS (
  SELECT creator_id, correlation_id, MAX(event_timestamp) as latest_payout
  FROM factory_events WHERE event_name = 'payout_completed'
  GROUP BY creator_id, correlation_id
)
SELECT
  ed.creator_id,
  SUM(ed.earnings_date) as oldest_earning_date,
  EXTRACT(DAY FROM (NOW() - MAX(ed.earnings_date))) as days_waiting
FROM earnings_dates ed
LEFT JOIN payout_dates pd ON ed.creator_id = pd.creator_id AND ed.correlation_id = pd.correlation_id
WHERE pd.latest_payout IS NULL
GROUP BY ed.creator_id
HAVING EXTRACT(DAY FROM (NOW() - MAX(ed.earnings_date))) > 14;
```

**Investigation & Action:**
1. **Contact Finance:** Pull creator details (email, phone)
2. **Support emails creator:** "We noticed payout pending for $X since <date>. Investigating."
3. **Finance checks:** (a) Is creator's bank account verified? (b) Is earnings in pending state? (c) Was payout actually attempted?
4. **Notify creator:** "Your payout has been manually processed. Expected delivery <date>"

**Resolution Criteria:** Creator payout issued, AND creator acknowledged, AND no recurrence next week.

---

## Weekly Standup Decision Matrix

**Every Monday 10:00 AM UTC (15 min) — Finance, Ops, Product**

### Task: Review automated report; triage exceptions

```
┌─────────────────────────────────────────────────────────────┐
│ REVENUE INTEGRITY WEEKLY STANDUP                            │
├─────────────────────────────────────────────────────────────┤
│ Finance Lead reads report:                                  │
│  • Revenue this week: $X (trend: ±Z%)                       │
│  • Refund rate: R% (target: <2%)                            │
│  • Payout SLA: S% (target: >95%)                            │
│  • Exceptions: (list)                                       │
├─────────────────────────────────────────────────────────────┤
│ DECISION BY EXCEPTION TYPE:                                 │
├─────────────────────────────────────────────────────────────┤
│ Exception: REFUND RATE >2%                                  │
│   Finance: What's the reason? (churn breakdown)             │
│   Product: Known issue? Feature quality?                    │
│   Decision: (a) N/A, normal churn (b) Investigate (c) Fix  │
│            (d) Check churn reason breakdown; prioritize    │
├─────────────────────────────────────────────────────────────┤
│ Exception: FAILED PAYOUTS >0.5%                             │
│   Ops: What's in the DLQ? (triage list)                    │
│   Finance: Contact creators?                                │
│   Decision: (a) N/A, normal (b) Ops manual retry            │
│            (c) Escalate to infrastructure                   │
├─────────────────────────────────────────────────────────────┤
│ Exception: RECONCILIATION VARIANCE >$1k                     │
│   Finance: Halt payout automation!                          │
│   Ops: Pull logs, investigate immediately                   │
│   Decision: STOP all payouts until cleared                  │
│            Page engineering if not resolved by EOD          │
├─────────────────────────────────────────────────────────────┤
│ Exception: PAYOUT SLA <95%                                  │
│   Ops: Check batch job logs; is it running?                 │
│   Finance: Any Stripe API issues?                           │
│   Decision: (a) Restart job (b) Increase batch frequency   │
│            (c) Escalate to infrastructure                   │
├─────────────────────────────────────────────────────────────┤
│ FINAL DECISION:                                             │
│  [ ] All green → Post update to Slack; continue monitoring  │
│  [ ] Yellow exceptions → Assign 24h investigate deadline    │
│  [ ] Orange+ exceptions → Assign owner; set escalation      │
│  [ ] Red exception → PAUSE automation; page engineering     │
└─────────────────────────────────────────────────────────────┘
```

---

## Escalation Path

```
RESOLUTION TIME    OWNER              ESCALATION to OWNER
─────────────────────────────────────────────────────────────
Within 24h         Finance + Ops      (no escalation)
Within 4h          Finance + Ops      Product Lead
Within 1h          Finance + Eng + Ops VP Engineering
Unresolved >1h     Finance + Eng + Ops CEO (pause automation)
```

**Example Escalation:**
- 9:00 AM: Weekly report shows failed payouts >0.5%
- 9:15 AM: Standup discussion; Ops investigates
- 10:30 AM: Ops says "DLQ has 5 failed transfers; investigating"
- 1:00 PM: Ops finds systemic issue (Stripe API broken); pages Eng
- 1:30 PM: Engineering confirms Stripe issue; escalates to Stripe support
- 3:00 PM: Root cause found (Stripe rate limiting); increase timeout
- 4:00 PM: All failed transfers retried successfully; issue resolved

---

## Automation: GitHub Actions Trigger

See [scripts/revenue-integrity-audit.mjs](../../scripts/revenue-integrity-audit.mjs)

**Runs:** Every Monday 9:00 AM UTC via GitHub Actions  
**Outputs:**
1. Generates `docs/reports/revenue-integrity-YYYY-WW.md`
2. Posts summary to Slack #revenue-integrity channel with @channel mention
3. Attaches exception list (if any)
4. Links to this workflow document

**Slack Message Format:**
```
:moneybag: Weekly Revenue Integrity Report — Week 17

📊 Revenue: $47.2k (+4.7% WoW)
✅ Refund Rate: 1.89% (within target)
✅ Payout SLA: 98% (<7 days) 
✅ Reconciliation: Balanced

Exceptions: 1
🔴 Large reconciliation variance ($140k unaccounted for)
   Owner: Finance Lead | Deadline: Tue 24h

→ Full Report: {link}
```

---

## Post-Resolution Documentation

After each exception is resolved:

1. **Document root cause** in #revenue-integrity Slack thread
2. **Update runbook** (this file) if process needs refining
3. **Create follow-up issue** if engineering action needed
4. **Notify creators** if compensation/explanation needed
5. **Update forecasting model** if revenue pattern changed

---

## Monthly Review

**Last Friday of month — Finance Lead + Ops Lead**

Review all exceptions from the past 4 weeks:
- [ ] Patterns emerged? (recurring exceptions)
- [ ] Process improvements? (faster triage, better automation)
- [ ] Staffing needs? (is manual work overwhelming?)
- [ ] System improvements? (automate more, catch earlier)

Update this document based on learnings.
