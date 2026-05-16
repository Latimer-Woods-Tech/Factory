# Videoking Creator Onboarding Ops Runbook

**Last Updated:** April 28, 2026  
**Scope:** Operator procedures for T3.1 (Creator Stripe Connect Onboarding)  
**Audience:** Videoking operations team

---

## Quick Reference

| Task | Frequency | Owner | Time | Link |
|------|-----------|-------|------|------|
| Monitor onboarding dashboard | Daily (9am UTC) | Ops | 5 min | `/admin/creators/onboarding` |
| Investigate failed creators | As needed | Ops | 15–30 min | See "Troubleshooting" below |
| Weekly summary report | Weekly (Mon 9am) | Ops Lead | 30 min | See "Reporting" below |
| Escalate stuck accounts | As needed | Ops → Support | 10 min | See "Escalation" below |

---

## 1. Daily Onboarding Monitoring (9:00 UTC)

### What You're Looking For

**Green lights (no action needed):**
- Verified creators: 80%+ of monthly signups complete onboarding
- Mean time to verification: <24 hours
- Error rate: <5%

**Yellow lights (investigation):**
- Error rate: 5–10%
- Stuck creators (submitted >7 days, not verified): >10
- OAuth failure rate: >5%

**Red lights (escalate immediately):**
- Error rate: >10%
- Stripe API unavailable (check Stripe status page)
- 50+ creators in "rejected" status (possible Stripe policy change)

### Dashboard View

1. Open **Admin Dashboard** → **Creators** → **Onboarding**
2. Verify filters show:
   - **All Status**: Should show mix of pending, submitted, verified, rejected
   - **Last 7 Days**: Focus on recently updated
3. Scan the table:
   - **Green**: Verified creators (goal: 80%+)
   - **Yellow**: Submitted >7 days (investigate)
   - **Red**: Rejected or error messages (contact support if >5)

### If Green Light

```
✅ Log: "2026-04-28T09:00Z: Onboarding health check: OK. 85% verified, <1% error rate."
✅ No action needed.
✅ Check back tomorrow.
```

### If Yellow Light

```
⚠️  Stuck creators detected. Click "Verify Now" on each stuck creator.
⚠️  System will fetch latest from Stripe API.
⚠️  If status changes: creator is notified.
⚠️  If status unchanged: Check error message. See "Troubleshooting" below.
```

### If Red Light

```
🚨 Error rate >10% or high rejection rate.
🚨 Check Stripe status page: https://status.stripe.com
🚨 If Stripe is down: Wait for recovery + notify creator support.
🚨 If Stripe is up: Escalate to creator support lead + engineering.
```

---

## 2. Troubleshooting Failed Creators

### Common Error States

#### **Status: Submitted** (Been >7 days)

**What it means:** Creator connected Stripe but account setup incomplete.

**Why it happens:**
- Creator hasn't filled in tax ID / business info
- Creator hasn't added bank account
- WiFi dropped during Stripe setup (rare)

**Recovery:**
1. Click creator row → View Details
2. See "Pending Requirements" list
3. Contact creator: "Your Stripe account needs X to complete. Go to Stripe dashboard and update."
4. Creator fixes in Stripe dashboard (out of our app)
5. Click "Verify Now" to sync status
6. If still submitted after 3 days: Offer phone support / chat with creator

#### **Status: Rejected**

**What it means:** Stripe rejected the account (high-risk signals, policy violation, etc.)

**Why it happens:**
- Creator's identity didn't verify
- Creator's business flagged as high-risk
- Creator has chargeback history
- Creator's payment method is restricted (some banks/countries)

**Recovery:**
1. Show creator: "We're unable to verify your Stripe account due to [reason from error message]."
2. Suggest: "Contact Stripe support directly at https://support.stripe.com or include Stripe error ID"
3. If creator can resolve: Offer to "Verify Now" to re-check
4. If Stripe won't budge: Offer alternative payment (direct bank transfer, ACH, etc.) — NOT in scope of this runbook

#### **Status: Pending** (Never started)

**What it means:** Creator hasn't connected Stripe yet.

**Why it happens:**
- Creator hasn't visited Settings → Payments
- Creator decided not to set up payments
- Creator saw Stripe and got intimidated

**Recovery:**
1. Not an error; expected state for new creators
2. Reach out via email: "Ready to start earning? Connect your bank account in 2 clicks → link"
3. If creator doesn't respond in 30 days: Lower engagement; re-engage via marketing

#### **Status: OAuth Error** (In error message field)

**What it means:** OAuth flow broke mid-process.

**Possible errors:**
- `state_token_expired` → User took too long between starting OAuth and returning
- `invalid_grant` → Stripe's auth code invalid or expired
- `access_denied` → User denied Stripe permission
- Network error → Connection dropped mid-flow

**Recovery:**
1. Contact creator: "Your Stripe setup didn't complete. Try again: [link]"
2. Ask creator to try again; log which step fails
3. If fails repeatedly: May be regional Stripe issue; escalate to engineer

---

## 3. Manual Onboarding Account Creation

**When to use:** Creator can't complete Stripe yourself (account deleted, region restriction, etc.)

**Prerequisites:**
- Operator has creator's consent (email / Slack)
- Creator has Stripe account ready (tax ID + bank already in Stripe)

**Steps:**
1. Verify creator's identity (email match + 2FA check)
2. Copy creator's Stripe account ID from their settings
3. In Admin → Creators → Manual Override → Enter Stripe ID
4. System creates connection with status: `verified`
5. Notify creator: "Your account is now set up for payouts"

**Caution:** Only use if creator has explicitly asked. Avoid shortcutting verification process.

---

## 4. Bulk Operations

### Bulk Verify All Pending Creators

Use this weekly to catch creators whose Stripe setup completed but webhook was missed.

```
Steps:
1. Admin Dashboard → Creators → Onboarding
2. Filter: Status = "submitted" (not already verified)
3. Select all (or use date range filter for last 3 days)
4. Click "Verify All Selected"
5. System fetches latest from Stripe for each
6. Statuses update in real-time
7. Log result: "Verified 20 creators; 15 now ready for payouts, 5 still pending."
```

**Expected outcome:** ~60% will jump from "submitted" → "verified" (Stripe completed in background). ~40% will remain "submitted" (awaiting creator).

### Mark Ready for First Payout

Once verified, creator is eligible for payouts. Operator marks as ready after review.

```
Steps:
1. See creator status: "verified"
2. Click "Mark Ready for First Payout"
3. System moves to "processing" (waiting for next batch)
4. Creator included in next payout batch
5. Log: "Marked 5 creators ready for payouts based on verification review"
```

---

## 5. Escalation Procedures

### To Creator Support

**When:** Creator needs help filling out Stripe forms, or account rejection appeals
**Who:** Creator support team
**Process:**
1. Open ticket: "Creator onboarding help needed"
2. Include: Creator ID, Stripe account status, specific error
3. Creator support contacts creator directly
4. Once resolved: Ops clicks "Verify" to sync status

### To Engineering

**When:** Technical issue (OAuth failing for all creators, webhook queue backed up, Stripe API errors not in error_message field)
**Who:** Engineering on-call
**Process:**
1. Slack #videoking-oncall: "Creator onboarding issue: X creators with Y error"
2. Include: Error message, time issue started, affected creator count
3. Engineer investigates logs + Stripe API
4. If systemic: May pause onboarding or notify customers

### To Stripe Support

**When:** Stripe account flagged/restricted, or policy question
**Who:** Stripe support (via your Stripe dashboard under "Contact Support")
**Process:**
1. Log into dashboard: https://dashboard.stripe.com
2. Click "?" → "Contact support"
3. Describe issue: "Creator account restricted; can we appeal?"
4. Stripe investigates; takes 24–48 hours
5. Once Stripe responds: Ops manually updates status (or wait for webhook)

---

## 6. Weekly Reporting (Monday 9:00 UTC)

### Report Template

Save to: `docs/videoking/reports/onboarding-weekly-YYYY-MM-DD.md`

```markdown
# Onboarding Report: Week of [Mon Date]

## Summary
- Total new creators: XXX
- Completed onboarding (verified): XXX (??%)
- Stuck (submitted >7 days): XX
- Rejected: X
- Average time to verify: XX hours

## Alerts
- [ ] Error rate exceeded 5%? If yes: Describe & action taken
- [ ] Stripe status page had incidents? If yes: When & impact
- [ ] Creator support tickets spiked? If yes: Root cause?

## Action Items
- [ ] Contacted XX stuck creators
- [ ] Escalated X rejections to support
- [ ] Fixed YY via manual verification

## Metrics (trend over 4 weeks)
| Week | Total | Verified | Error Rate |
|------|-------|----------|-----------|
| W1   | XXX   | XX%      | X%        |
| W2   | XXX   | XX%      | X%        |
| W3   | XXX   | XX%      | X%        |
| W4   | XXX   | XX%      | X%        |

## Notes for Next Week
- [Any systemic issues to watch?]
```

### Send To
- Videoking Slack: #videoking-ops
- Weekly meeting: Product + Engineering + Support

---

## 7. Status Reference

| Status | Meaning | Action |
|--------|---------|--------|
| **pending** | Creator hasn't started Stripe Connect | Send onboarding email |
| **submitted** | Stripe account created; awaiting setup | Monitor; contact if >7 days |
| **verified** | Stripe account fully ready | Mark for payouts |
| **processing** | Marked ready for payouts; in queue | Wait for batch execution |
| **rejected** | Stripe rejected account | Contact creator; escalate if needed |

---

## 8. Keyboard Shortcuts & Quick Links

- Dashboard: https://admin.videoking.com/creators/onboarding
- Stripe Dashboard: https://dashboard.stripe.com
- Creator Support: #videoking-support (Slack)
- On-Call Eng: #videoking-oncall (Slack)
- Status Page: https://status.stripe.com

---

## 9. FAQ

**Q: Should I contact a creator in "pending" status?**  
A: No, they just signed up. Give them 48 hours. If no activity after 7 days, send "ready to monetize?" email.

**Q: Creator verified but earnings still show $0?**  
A: Verification is just Stripe setup. Earnings = views × rate. Separate from onboarding. Direct to earnings dashboard.

**Q: Can I manually override a rejected status?**  
A: No, Stripe rejected for reason. You can offer alternative payment method (outside this scope).

**Q: How long should I wait before contacting creator?**  
A: submitted >7 days = yellow flag. submitted >14 days = contact. submitted >30 days = offer alternative payment.

---

## Incident Playbook

### High Error Rate (>10%)

```
1. Check Stripe status page (https://status.stripe.com)
2. If Stripe is down: 
   - Announcement in #videoking-customers
   - Pause onboarding emails (don't send if Stripe is down)
   - Wait for recovery
3. If Stripe is up:
   - Slack #videoking-oncall: "Error rate spike"
   - Check logs: What's the error? (OAuth? Account creation? Verification?)
   - If OAuth errors: Check OAuth config (redirect URI, client ID)
   - If account creation errors: Check Stripe API limits
4. Once root cause found + fix deployed:
   - Re-run "Verify All Pending" to catch missed updates
   - Send customer update: "Onboarding is back to normal"
```

### Creepy Silent Failures (No Errors, Just No Verifications)

```
1. Manually verify 5 random "submitted" creators
2. If refresh works: Webhook queue may be backed up
3. Check: Admin → Queues → Stripe Connect
4. If queue is long (>1000 items): 
   - Ops: Increase queue concurrency
   - Eng: Check if webhook handler is stuck
5. If queue is empty but creators not verified:
   - Check webhook logs (may not be firing)
   - Restart webhook handler (last resort)
```

---

**Questions?** Ask in #videoking-ops or contact on-call.
