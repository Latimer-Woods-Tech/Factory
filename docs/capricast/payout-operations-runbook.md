# Videoking Payout Operations Runbook

**Last Updated:** April 28, 2026  
**Scope:** Operator procedures for T3.2 (Payout Operations Operator-Grade)  
**Audience:** Videoking finance & operations team

---

## Quick Reference

| Task | Frequency | Owner | Time | SLA |
|------|-----------|-------|------|-----|
| Review pending batch | Daily (9am UTC) | Ops | 2 min | None (informational) |
| Execute daily batch | Daily (9:30am UTC) | Ops | <15 min | Batch started by 10am UTC |
| Monitor batch execution | During batch | Ops | Real-time | Abort if >25% failure rate |
| DLQ triage & retry | Daily (4pm UTC) | Ops | 30 min | Each DLQ entry addressed |
| Weekly reconciliation | Weekly (Mon 9am) | Ops Lead | 45 min | Report to finance |
| Monthly audit export | Monthly (1st Fri) | Finance | 1 hour | Ready for CFO review |

---

## 1. Daily Workflow — Payout Batch Execution

### 9:00 AM UTC — Pre-Flight Check

**Open Dashboard:** https://admin.videoking.com/payouts/batches

Look for any **pending** batches ready for execution.

```
Expected state:
- 1 batch in "pending" status (today's date)
- creator_count = number of creators with earnings today
- status = "pending" (not executing or completed)
- No errors in summary
```

**Good to go?** → Proceed to Review (9:05 AM)

**Issues detected?** → See troubleshooting section

### 9:05 AM UTC — Batch Review

**If this is your first time:** Take 2 minutes to read the batch details.

**In the batch detail view:**
1. Skim creator list (name, email, amount USD)
2. Look for obvious issues:
   - Amount = $0 (shouldn't be in batch; might be data error)
   - Stripe account not connected (status should show warning)
   - Excessive amount (>$10k to single creator; rare but check)

**If all looks normal:** Click "Execute" → Proceed to Execution

**If you spot an issue:** Click "Exclude Creator" and note reason in audit log

### 9:10 AM UTC — Execute Batch

**Before you click Execute:**

Confirm in Slack #videoking-payouts: "Starting batch for [date], [count] creators, $[amount] total"

**Click "Execute"**

System will:
1. Hit Stripe API for each creator (batched in groups of 10)
2. Stream real-time progress: "5/47 succeeded, 2 processing, 1 failed"
3. Move failed payouts to DLQ
4. Mark batch completed when done

**Expected execution time:** <5 minutes for 50 creators (mostly waiting on Stripe API)

### During Execution — Monitor Progress

**Stay alert for:**
- Progress bar stuck >100 seconds? → Check Stripe status page (https://status.stripe.com)
- Failure rate climbing >25%? → Consider "Pause" (see troubleshooting)
- Successful payouts = green light ✅

**Do not close browser tab or refresh!** Status will update in real-time.

### Execution Complete — Review Results

**System shows:**
- Status: "completed" or "partially_completed"
- Succeeded: XX
- Failed: YY
- Failed items: Moved to DLQ (see section 2)

**Post to Slack #videoking-payouts:**
```
✅ Batch executed: [date]
✅ Succeeded: XX / XYZ
✅ Failed: YY (moved to DLQ)
⚠️  [If any issues noted]
```

**If all succeeded:** You're done until tomorrow. DLQ team handles any overnight issues.

**If any failed:** See "Daily DLQ Triage" below.

---

## 2. Daily DLQ Triage & Recovery (4:00 PM UTC)

**DLQ = Dead Letter Queue** (failed payouts awaiting operator decision)

### Open DLQ Dashboard

https://admin.videoking.com/payouts/dlq

Filter: status = "pending" (not yet resolved)

### For Each Pending DLQ Entry

**Read the error message.** Common ones:

#### **"Stripe account not connected"**
- Creator never completed Stripe onboarding
- **Action:** Skip this payout. Mark "archived". Notify creator via email: "Enable payouts to receive earnings."
- **Do not retry.**

#### **"Account restricted by Stripe"**
- Stripe flagged account as high-risk (velocity check, chargeback, etc.)
- **Action:** Check creator's Stripe account status. If they can appeal: "Contact Stripe support." If permanent: Offer alternative payment method (out of scope).
- **Do not retry** until creator resolves with Stripe.

#### **"Bank account invalid"**
- Creator's bank info is wrong or outdated
- **Action:** Notify creator: "Your bank account info needs updating. Go to your Stripe dashboard and re-enter."
- **Mark resolved.** Creator will resubmit in Stripe; next batch will succeed.

#### **"Rate limited by Stripe"**
- Too many requests hit Stripe API at once (RARE)
- **Action:** Click "Retry Now" in 5 min. System will retry with backoff.
- **Expected outcome:** Retry succeeds.

#### **"Invalid Stripe Connect ID"**
- Stripe account ID malformed or doesn't exist (DATA ERROR)
- **Action:** Escalate to engineering. Do not retry.

---

### Decision Tree

```
For each DLQ entry:

1. Read the error message
2. Is it creator's responsibility (account setup, bank info)?
   YES → Mark "Resolved" + notify creator
   NO → Go to 3
3. Is it temporary (rate limit, API timeout)?
   YES → Click "Retry Now"
   NO → Go to 4
4. Is it permanent (account rejected, restricted)?
   YES → Click "Archive" (give up, offer alternative)
   NO → Go to 5
5. Unsure?
   → Click "Contact Support" → Let ops lead investigate

Done? Move next DLQ entry.
```

### Success Metrics

**Daily DLQ goals:**
- Process 100% of pending DLQ within 24 hours
- Retry success rate: >70%
- Zero aged DLQ entries (>30 days pending)

**If DLQ backlog >20 entries:**
- 🚨 Alert ops lead
- May indicate systemic Stripe issue or creator authentication problem

---

## 3. Weekly Reconciliation (Monday 9:00 AM UTC)

**Purpose:** Verify payouts match expected earnings + catch discrepancies early

### Generate Reconciliation Report

https://admin.videoking.com/payouts/reconciliation?period=week

**Report shows:**
```
Period: Last 7 days
Total creators paid: XXX
Total amount: $X,XXX.XX
├─ succeeded: XX creators, $X,XXX.XX ✅
├─ failed (DLQ): YY creators, $YYY.YY ⚠️
├─ excluded: Z creators, $ZZZ.ZZ (creator requested no payout)
└─ missing?: ?? creators, $???.?? (earning >$0 but not in batch)
```

### Verify Total Against Expected

Compare total payout against earnings table:

```
SELECT SUM(amount_usd) FROM earnings 
  WHERE period_date >= today() - interval '7 days'
    AND status IN ('pending', 'transferred');
```

**Expected:** Report total ≈ query total (within $0.01)

**If mismatch >$1:** Escalate to engineering. Data corruption or batch snapshot failed.

### Alert Thresholds

| Metric | Yellow | Red |
|--------|--------|-----|
| Failure rate | 5–10% | >10% |
| Missing creators | 1–2 | >2 |
| DLQ aged >7 days | >5 | >10 |

**If any RED alert:**
- Page on-call engineer
- Check Stripe status page
- May need to pause payouts while investigating

### Weekly Team Standup

**Post report + summary to Slack #videoking-finance:**

```
📊 Weekly Payout Report: [Mon date]

Total paid: $X,XXX.XX
Success rate: XX%
DLQ count: YY (recovery rate: ZZ%)
Status: ✅ Healthy | ⚠️ Investigate | 🚨 Critical

Action items (if any):
- [ ] Item 1
- [ ] Item 2
```

---

## 4. Monthly Audit Export (1st Friday of Month)

**Purpose:** Provide complete audit trail to finance + CFO for reconciliation

### Generate Audit Log Export

https://admin.videoking.com/payouts/audit-log?month=[YYYY-MM]

**CSV includes:**
- Batch ID, Date, Status
- Creator ID, Amount, Outcome
- Operator, Timestamp, Reason for exclusion/retry
- Stripe Transfer ID (for reconciliation)

### Send to Finance

1. Download CSV: `payout_audit_[YYYY-MM].csv`
2. Email to finance + CFO: "[Month] Payout Audit Log"
3. Message: "Attached is complete payout record for [Month]. All verified via Stripe API."

### Keep Copy

Archive in shared drive: `Finance/Payouts/Audit_[YYYY-MM].csv`

**Retention:** Keep 7 years (IRS requirement for business records)

---

## 5. Error Handling & Troubleshooting

### Batch Stuck During Execution

**Symptoms:** Progress bar frozen >2 minutes, no updates

**Diagnosis:**
1. Check Stripe status page: https://status.stripe.com
2. If Stripe is down: Wait for recovery (+1–2 hours usually)
3. If Stripe is up: Check network (are we connected?)

**Fix:**
```
Option A (wait for retry):
- Let it run. System will timeout after 10 min and move to next creator.

Option B (abort):
- Click "Pause Batch"
- Failed items go to DLQ
- Retry later via "Retry Now" button
- System won't double-pay (transfer IDs tracked)

Option C (restart):
- After pausing: 5-min wait
- Click "Resume Batch"
- Continues with remaining creators
```

### Batch Failed Due to High Error Rate

**Example:** "Batch stopped: 30% failure rate detected"

**Diagnosis:**
- 🔴 High failure rate = systemic issue (not just 1 creator)
- Possible causes: Stripe restriction, rate limiting, invalid data

**Debug:**
1. Check Stripe status page
2. Look at first 5 error messages in DLQ
3. Pattern match:
   - All say "account restricted" → Stripe change in policy
   - Mix of different errors → Random/transient (retry likely to work)
   - All say "invalid account ID" → Data corruption (escalate to eng)

**Recovery:**
- If transient: "Retry All in DLQ" after waiting 15 min
- If data corruption: Escalate to engineering

### Creator Missing from Batch

**Symptoms:** Creator earned $X but not in today's payout batch

**Diagnosis:**
1. Check creator's onboarding status
   - If not verified: Creator can't receive payouts (expected)
   - If verified: Go to step 2
2. Check if creator opted out:
   - Creator settings: "Enable payouts" = OFF? (expected)
3. Check earnings table:
   - Earnings for today >$0? If no: Creator earned $0 (expected)

**If creator should be in batch but isn't:**
- Escalate to engineering
- May be batch snapshot issue (creator earnings updated after batch created)

### Creator Marked as "No Longer a Creator"

**If creator deleted their account mid-payout:**
- Payment stays in DLQ
- Mark DLQ as "archived" (creator can't receive)
- Note: We never executed transfer, so no refund needed

---

## 6. Status & Severity Reference

| Batch Status | Meaning | Action |
|--------------|---------|--------|
| **pending** | Ready to execute | Review & execute |
| **processing** | Currently executing | Monitor; don't interrupt |
| **completed** | All succeeded | Acknowledge result; move on |
| **partially_completed** | Some failed | Triage DLQ |
| **failed** | Batch operation failed (not payouts) | Contact engineer |

| DLQ Status | Meaning | Action |
|-----------|---------|--------|
| **pending** | Awaiting operator decision | Triage |
| **retrying** | Retry in progress | Wait for result |
| **resolved** | Issue handled (creator action taken) | OK to close |
| **archived** | Permanent failure; given up | OK to close |

---

## 7. Incident Playbook

### Stripe API Down (All Payouts Failing)

```
1. Check https://status.stripe.com → Confirm incident
2. Slack #videoking-oncall: "Stripe API down; payouts paused"
3. Pause batch (or let it auto-timeout)
4. Monitor Stripe status for recovery
5. Once recovered (usually 30 min to 2 hours):
   - Retry all DLQ entries
   - Expected success rate: >95%
6. Post-incident:
   - Email #videoking-finance: "Payouts delayed due to Stripe outage; now recovered"
   - Update docs if Stripe outage response changed
```

### Creator Disputes Payout Amount

**Example:** Creator says "I earned $500 but only got $200"

**Investigation:**
1. Get creator's claim + date
2. Check earnings table for that period:
   - Query: `SELECT SUM(amount_usd) FROM earnings WHERE creator_id = '...' AND period = '...'`
   - If sum ≠ amount in batch: Data error (escalate)
   - If sum = amount in batch: Creator's understanding is wrong
3. Check payout audit log:
   - Did we execute transfer to this creator for this amount?
   - Stripe Transfer ID? If yes: Check Stripe for proof of settlement
4. If we didn't execute: Find out why (DLQ? Excluded? Earnings error?)
5. Respond to creator with evidence

**This is finance's responsibility; refer dispute to finance team.**

### Many Creators Missing from Batch

**Example:** "Only 20 creators in batch but should be 50"

**Diagnosis:**
1. Check if batch was created today:
   - `SELECT COUNT(*) FROM payouts WHERE batch_id = '...'`
2. If count = 20: Batch is correct size (only 20 earned today)
3. If count = 50: Query is stale; refresh page
4. If count is inconsistent: Escalate "Batch snapshot mismatch" to eng

---

## 8. Monitoring & Alerts

### Daily Checks (automated, but verify manually)

- **9:00 AM:** Batch ready for execution (check dashboard)
- **9:10 AM:** Batch execution started (Slack notification)
- **4:00 PM:** DLQ alert if >10 pending items (Slack notification)

### Weekly Checks (manual)

- **Monday 9:00 AM:** Reconciliation report (verify vs earnings table)

### Monthly Checks (manual)

- **1st Friday:** Audit log export for finance

---

## 9. FAQ

**Q: Should I execute batch if creator didn't connect Stripe?**  
A: No. Batch only includes verified creators. Unverified creators get onboarding email instead.

**Q: Can I retry a creator if they were in DLQ?**  
A: Yes. Click "Retry Now". System will attempt transfer again with 1-min backoff from last attempt.

**Q: What if Stripe transfer succeeds but I accidentally retry?**  
A: Stripe API is idempotent (same idempotent_id = same result). We won't double-pay. Safe to retry.

**Q: How do I exclude a creator from a batch?**  
A: Before executing, click "Exclude" on creator row. They won't receive payment this batch. Next batch: Include by default.

**Q: What if I accidentally mark batch as "Delete"?**  
A: Can't delete executed batches (immutable for audit). If you marked wrong: Contact engineering to correct audit log.

**Q: How often should payout batch run?**  
A: Daily (once per day, every morning). If you need special schedules (weekly, bi-weekly): File feature request.

---

## 10. Quick Links

- Dashboard: https://admin.videoking.com/payouts
- Stripe Dashboard: https://dashboard.stripe.com  
- Stripe Status: https://status.stripe.com
- Slack: #videoking-payouts, #videoking-finance, #videoking-oncall
- Earnings Query: [SQL above]
- Audit Export: [Monthly form]

---

## 11. Call-Out Schedule

**Ops Lead on-call:** Who responds if payout issue escalates outside business hours?

[Fill in your on-call rotation]

---

**Questions?** Ask in #videoking-payouts or contact ops lead.

**Last updated:** April 28, 2026
