# Finance + Operations Weekly Revenue Sync

**Meeting:** Every Monday 10:00 AM UTC (15 minutes)  
**Location:** Slack thread + optional video call  
**Attendees:** Finance Lead, Ops Lead, Product Lead  
**Owner:** Finance Lead (facilitates)  
**Preparation:** Automated report ready by 9:30 AM (scripts/revenue-integrity-audit.mjs)

---

## Agenda Template

### PART 1: Report Review (3 min)

**Finance Lead presents:**
```
This week's financials:
├─ Revenue: $X (vs. $Y last week; ±Z%)
├─ Refund rate: R% (vs. T% target)
├─ Creator earnings recorded: $E
├─ Payouts completed: $P (SLA: S%)
├─ Payout pipeline: $U (pending)
└─ Exceptions: (count)

Status: 🟢 Green / 🟡 Yellow / 🠢 Orange / 🔴 Red
```

**Example:**
```
This week's financials:
├─ Revenue: $47.2k (+4.7% vs last week)
├─ Refund rate: 1.89% (target: <2%) ✅
├─ Creator earnings recorded: $37.8k (80%)
├─ Payouts completed: $34.2k (SLA: 98%) ✅
├─ Payout pipeline: $12.5k scheduled for Tue
└─ Exceptions: 1 (reconciliation variance)

Status: 🠢 Orange — needs investigation
```

---

### PART 2: Exception Review (7 min)

**If no exceptions:** Skip to Part 3.

**If exceptions exist:** Finance Lead walks through each:

#### Exception Template

```
┌─ EXCEPTION #N: [Title]
│  ├─ Type: [Refund spike / Failed payouts / Reconciliation / SLA / Other]
│  ├─ Severity: 🟡 Yellow / 🠢 Orange / 🔴 Red
│  ├─ Metric: [Current value vs. threshold]
│  ├─ Owner: [Finance / Ops / Product]
│  ├─ Root Cause: [Known / Under investigation / TBD]
│  ├─ Impact: [Customers / Creators / Platform]
│  ├─ Remediation: [Step 1, Step 2, ...]
│  ├─ Timeline: [ETA to resolve]
│  └─ Escalation: [Needed? To whom?]
└─
```

**Typical Exception Scenarios:**

#### Scenario A: Refund Rate Spike (Yellow)
```
EXCEPTION: Refund rate 2.8% (target <2%)

Finance: "Churn breakdown shows 'customer_request' +40% this week. Let's hear from Product."

Product: "No feature launches this week. Did any major creators churn?"

Finance: "Top creator @alice still active. Looks like normal weekly variance."

Decision: Monitor; no action needed. Will watch for trend next 2 weeks.
Timeline: Check again next Monday.
```

#### Scenario B: Failed Payouts (Orange)
```
EXCEPTION: 0.8% failed transfers (target <0.5%)

Ops: "DLQ shows 4 creators with invalid bank accounts. Support team contacting them."

Finance: "Total value: $340. Not huge, but let's prioritize getting those creators updated."

Ops: "I'll follow up with support. Target: all retry within 48 hours."

Decision: Ops owns; Finance backup. No system pause needed (isolated issue).
Timeline: Retry resolution by Wed; report results in next Monday sync.
```

#### Scenario C: Reconciliation Variance (Red)
```
EXCEPTION: Variance $140k (expected <$20k)

Finance: "SEVERE. Halting payout automation."

Ops: "Pulling logs now. Could be duplicate event recording?"

Product: "Engineering standby. Need you to pull Stripe API logs."

Decision: PAUSE automation until root cause found. Emergency triage starting NOW.
Timeline: Updates every 2 hours in Slack; full resolution by EOD or escalate to CEO.
```

**Discussion Template for Each Exception:**
1. **Finance:** What's the metric? How far from threshold?
2. **Owner:** Why did this happen? Root cause confirmed?
3. **Product/Ops:** Impact on users/creators? System working as expected?
4. **Decision:** (a) Expected/normal → monitor (b) Action needed → assign & deadline (c) Critical → escalate
5. **Next Steps:** Who does what by when?

---

### PART 3: Metrics Dashboard (2 min)

**Review last 4 weeks (trend):**

| Metric | Week 1 | Week 2 | Week 3 | Week 4 (Today) | Trend | Status |
|--------|--------|--------|--------|----------------|-------|--------|
| Revenue | $42k | $43.5k | $45k | $47.2k | ↗︎ | ✅ |
| ARPU | $12.10 | $11.95 | $12.30 | $12.50 | ↗︎ | ✅ |
| Refund % | 1.5% | 1.8% | 2.1% | 1.89% | ↘︎ | ✅ |
| Churn | 4.2% | 4.5% | 4.8% | 4.3% | ↘︎ | ✅ |
| Payout SLA | 96% | 95% | 98% | 98% | ✅ | ✅ |

**Discussion Points:**
- Revenue up 12% month-over-month → Growth on track!
- Refund % spiking from 1.5% to 2.1% → Product to investigate (did we resolve?)
- Churn peaked at 4.8%, now back to 4.3% → Normal weekly variance, no escalation
- Payout SLA stable >95% → Operations running smoothly

---

### PART 4: Decisions & Action Items (2 min)

**Finance Lead documents:**

```
DECISIONS THIS WEEK:
────────────────────
[ ] Continue payout automation (or PAUSE if Red exception)
[ ] Notify creators of [payout issue / refund policy change / etc.]
[ ] Escalate [exception name] to [team] by [date]
[ ] Check reconciliation variance by Tue EOD

ACTION ITEMS:
─────────────
Owner         Task                                    Deadline
─────────────────────────────────────────────────────────────
Ops           Retry failed payouts                   Wed 6pm UTC
Finance       Investigate reconciliation variance    Tue 6pm UTC
Product       Triage refund spike (if needed)        Tue 6pm UTC
Support       Contact 4 creators re: invalid accts   Tue 12pm UTC
```

---

## Escalation Decision Tree

```
START
  │
  ├─ Report generated: 9:00 AM
  │   Auto-post to Slack #revenue-integrity
  │
  ├─ Review at 10:00 AM Standup
  │   │
  │   ├─ All checks GREEN?
  │   │   └─→ Post: "✅ All green this week. Revenue on track."
  │   │       ACTION: Resume normal. Continue monitoring.
  │   │
  │   ├─ YELLOW (warning) exceptions?
  │   │   └─→ Assign investigate owner. Deadline: EOD Tuesday.
  │   │       ACTION: Monitor. Report findings next Monday.
  │   │
  │   ├─ ORANGE (threshold exceeded) exceptions?
  │   │   └─→ Assign owner. Deadline: EOD today.
  │   │       ACTION: Immediate investigation. May trigger team standby.
  │   │
  │   └─ RED (critical) exceptions?
  │       └─→ PAGE ON-CALL. Escalate to Product Lead.
  │           ACTION: PAUSE payout automation. Emergency triage.
  │           Involve: Finance + Ops + Engineering + Product
  │           Deadline: Resolve or escalate to CEO within 4h
  │
  └─ Next Monday: Repeat
```

---

## Communication Templates

### Green Week Message (Post to Slack)

```
:moneybag: Week {N} Revenue Report — All Systems Green ✅

Revenue:           ${amount} (+{pct}%)
Refund Rate:       {rate}% (<2% target) ✅
Payout SLA:        {sla}% (>95% target) ✅
Creator Payouts:   ${payout_total} completed
Reconciliation:    Balanced ✅

No exceptions. All metrics on track.

→ Full report: {link-to-report}
```

### Exception Alert Message (Post to Slack)

```
:warning: Week {N} Revenue Report — {N} Exception(s) Found

Revenue:           ${amount}
Status:            {severity}

EXCEPTIONS:
────────────────────
{exception-name-1}  — {owner-name} investigating (ETA: {date})
{exception-name-2}  — {owner-name} investigating (ETA: {date})

ACTION: {decision}
NEXT: {owner-action}

→ Full report: {link-to-report}
→ Triage checklist: {link-to-workflow}
```

### Critical Escalation Message

```
:rotating_light: REVENUE EMERGENCY — Week {N}

CRITICAL EXCEPTION: {exception-name}
Severity: RED
Impact: {impact}

IMMEDIATE ACTION: Payout automation PAUSED
ESCALATION: Finance + Ops + Engineering teams notified

ON-CALL: Investigating now. Updates every 30 minutes in thread.

→ Full details: {link-to-report}
```

---

## Weekly Runbook for Finance Lead

**9:00 AM — Automated Report Ready**
- [ ] Check email for report generation success / failure
- [ ] If failed: investigate GitHub Actions logs; rerun manually if needed
- [ ] Review report in Slack #revenue-integrity channel

**9:15 AM — Pre-Standup Review**
- [ ] Read full report markdown
- [ ] Identify exceptions and root causes (consult Ops/Product if unclear)
- [ ] Prepare talking points for exceptions

**9:45 AM — Prepare Slack Update**
- [ ] Draft message (green week vs. exceptions)
- [ ] Link to full report
- [ ] Notify @channel if RED exceptions

**10:00 AM — Standup**
- [ ] Read agenda items
- [ ] Facilitate discussion of exceptions
- [ ] Document decisions and action items

**10:15 AM — Post-Standup Documentation**
- [ ] Update Slack thread with decisions
- [ ] Create action item cards in project management (if team uses one)
- [ ] Assign owners and deadlines

**Throughout Week**
- [ ] Monitor Slack for progress on action items
- [ ] Follow up on exceptions as deadlines approach
- [ ] Prepare for next Monday's report

---

## Decision Framework for Product Lead

**During Standup, when exception involves users/features:**

| Exception | Product Question | Decision Path |
|-----------|-----------------|---------------|
| High refund rate | Did we ship something? | Check git log; correlate with deployment |
| Churn spike | New feature rolled out? | Check feature flags; did engagement drop? |
| ARPU dropping | Pricing change? | Check if tier mix shifted or price tested |
| Conversion funnel low | Checkout flow changed? | Review recent commits; check error logs |

---

## Success Metrics for This Weekly Sync

✅ **Executed consistently**
- Sync happens every Monday 10:00 AM (no cancellations)
- Report ready by 9:00 AM (zero manual delays)
- <3 exceptions on average (healthy exception rate)
- All exceptions resolved or in-progress with clear deadline

✅ **Decision Quality**
- Decisions documented and communicated within 30 minutes of standup
- Action items assigned with clear owners and deadlines
- Zero escalation delays (Red exceptions paged immediately)
- Follow-up: 90% of action items completed by deadline

✅ **Financial Integrity**
- Zero unexplained reconciliation variances >$500
- Failed payouts resolved within 48h of detection
- Creator payout delays <5 days (except for banking issues)
- 4 consecutive weeks of clean financial close

---

## Backup Procedures

**If Finance Lead unavailable:**
- Ops Lead facilitates; Finance team member presents report

**If no standup held (holiday, etc.):**
- Report auto-posts to Slack
- Async discussion acceptable (Slack thread)
- Decisions documented in thread by EOD Tuesday

**If payout automation is paused:**
- Manual payouts approved by Finance Lead
- Each transfer requires Ops validation
- Emergency standup called within 2h of pause
