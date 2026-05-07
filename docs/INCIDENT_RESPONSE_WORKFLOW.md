# Incident Response & Postmortem Workflow

**Date:** April 28, 2026  
**Phase:** B (Standardize)  
**Initiative:** T5.3 — Formalize incident, rollback, and postmortem flow  
**Scope:** Define triage process (P1–P4 severity), escalation rules, runbook templates, rollback procedures, and postmortem cadence

---

## Executive Summary

**Problem:** When incidents occur (payment failures, 503 errors, data loss), response is ad-hoc:
- Who do we page?
- What's the priority?
- Do we roll back or push forward?
- How do we prevent recurrence?

**Solution:** Structured incident response with severity tiers, clear escalation paths, and mandatory postmortems.

**Result by May 15:**
- ✅ P1 incidents (user-visible data loss / authentication failure): <5 min page-to-acknowledgment
- ✅ P2 incidents (degraded performance / feature unavailable): <15 min escalation
- ✅ P3 incidents (slow endpoints / minor bugs): Tracked but not paged (business hours)
- ✅ P4 (chores / tech debt): Logged for quarterly review
- ✅ Postmortem template enforces blameless culture + actionable follow-ups

---

## Part 1: Incident Severity Tier Definition

### P1 (Critical — Page Immediately)

**Trigger Conditions:**
- Authentication system down (users can't log in)
- Payment system down (subscriptions can't be processed)
- Data loss detected (audit trail corruption, unintended deletions)
- DenialOfService attack (RPS spike, rate limiter activated)
- Sentry alert rule fires (error rate > 5%)

**Impact:** Revenue loss, customer trust damage, potential data breach

**Response SLA:** Acknowledgment <5 min; Status update every 10 min; Resolution target <30 min

**Escalation:** Page on-call engineer → If not ack'd in 5 min, page manager + executive

**Runbook:** [P1_INCIDENT_RUNBOOK.md](#part-8-runbook-templates)

**Example Incidents:**
- "Stripe webhooks stopped processing; no subscriptions activating for past 20 min"
- "Database connection pool exhausted; all API requests returning 503"
- "Moderation audit shows 100+ videos were auto-published due to LLM service bug"

---

### P2 (High — Escalate Within 15 Minutes)

**Trigger Conditions:**
- Performance degradation (p95 latency >500ms consistently)
- Feature unavailable but not revenue-critical (creator upload, video recommendation)
- Elevated error rate (1–5%)
- DLQ queue backing up (>50 pending transfers)
- Third-party service timeout (PostHog, Stripe rate limited but recoverable)

**Impact:** User frustration, potential churn, but not immediate revenue loss

**Response SLA:** Assignment <15 min; Status update every 30 min; Resolution target <2 hours

**Escalation:** Slack notification + assign to engineering team; if no progress in 30 min, escalate to lead

**Runbook:** [P2_INCIDENT_RUNBOOK.md](#part-8-runbook-templates)

**Example Incidents:**
- "Video upload taking >60s (should be <5s)"
- "Creator dashboard loading slowly; pulling too many queries"
- "Moderation queue has 500+ pending items due to LLM latency"

---

### P3 (Medium — Track During Business Hours)

**Trigger Conditions:**
- Non-critical performance issue (p95 latency 200–500ms)
- Minor bugs in non-revenue flows (UI glitch, sorting incorrect)
- Tests failing but CI still green (warning-level lints)
- Observability gap (metric missing, trace incomplete)

**Impact:** Annoyance but not urgent

**Response SLA:** Log in Slack #incidents; no page required; triage at daily standup

**Escalation:** If recurring, escalate to P2

**Runbook:** None required; use judgment

**Example Incidents:**
- "Video player subtitle timing off by 0.5s"
- "Search results pagination UI button styling broken"
- "Analytics event not firing during creator onboarding"

---

### P4 (Low — Backlog Item)

**Trigger Conditions:**
- Tech debt (refactor opportunity)
- Chore (update dependencies)
- Enhancement request (nice-to-have feature)
- Documentation gap

**Impact:** None immediate

**Response SLA:** None; schedule in next sprint

**Escalation:** None

**Example Items:**
- "Migrate from Node.js 18 to Node.js 20"
- "Update UI component library version"
- "Add new dashboard metric"

---

## Part 2: Incident Lifecycle

### Stage 1: Detection (0–2 min)

**Who:** Automated alerting or manual discovery
- Sentry alert (configured error rate thresholds)
- Datadog monitor (latency, database, etc.)
- Manual bug report (customer or team member)
- Uptime monitor (external service pinging `/health`)

**Action:** 
- Create Slack thread in #incidents: `🔴 [P1] Payment Processing Down`
- Include brief description + Sentry/Datadog link

### Stage 2: Triage (2–5 min)

**Who:** On-call engineer or engineering manager
- Confirm severity
- Assess impact (% users, revenue impact)
- Determine root cause area (database? Worker? Stripe?)

**Action:**
- Update Slack thread with initial assessment
- Assign to engineer or page backup if needed
- Link to relevant logs/traces

### Stage 3: Response (5–30 min)

**Who:** Assigned engineer
- Follow runbook for severity tier
- Execute diagnostic steps
- Attempt fix or rollback

**Examples:**
- **P1 Database Down:** Kill long-running query; scale up connection pool; restart if necessary
- **P1 Stripe Timeout:** Check Stripe status page; retry webhook queue; trigger manual reconciliation
- **P1 Code Bug:** Roll back to previous version; create hotfix branch
- **P2 LLM Latency:** Reduce batch size; throttle classification; queue for manual review

**Action:**
- Update Slack every 5–10 min with status
- Implement fix or workaround
- Verify via health check

### Stage 4: Recovery (30–60 min)

**Who:** Assigned engineer + ops
- Deploy fix to production (canary rollout)
- Monitor metrics to confirm recovery
- Deploy to 100% once confident

**Action:**
- Update Slack: "✅ Issue resolved at [timestamp]"
- Begin monitoring for recurrence
- Schedule postmortem for P1 (48h)

### Stage 5: Postmortem (Within 48h of P1/P2)

**Who:** Assigned engineer + involved stakeholders
- Blameless analysis: why did this happen?
- Action items: how do we prevent recurrence?
- Timeline: document what happened, when, who did what

**Action:**
- Create postmortem doc (template below)
- Schedule 30 min debrief meeting
- Track action items in backlog

---

## Part 3: Escalation Rules

### If No Acknowledgment (5 min)

```
Incident: P1 Payment Processing Down
[14:22:00] 🔴 Alert triggered
[14:22:05] ⏰ 5 min timeout → AUTO-ESCALATE
[14:22:05] Page on-call manager
[14:22:10] 💬 Slack #incidents: "🚨 Manager paged; no ack from eng"
```

### If No Progress (30 min for P2; 15 min for P1)

```
Incident: P2 Creator Upload Slow
[14:22:00] 🟠 Slack notification
[14:30:00] 🚨 15 min no progress → Escalate to eng lead
[14:30:05] Lead joins Slack thread
[14:30:10] "Investigating. Database query analysis in progress."
```

### If Rollback Decided

```
Incident: P1 Auth Service Returning 401
[14:22:00] 🔴 Sentry: "Auth middleware bug in latest deploy"
[14:22:15] Decision: "Rollback v1.2.3 to v1.2.2"
[14:22:30] Engineer: wrangler rollback (or git revert)
[14:22:45] Verify: auth/login now working
[14:23:00] ✅ "Rollback complete; monitoring"
[14:25:00] Alert clears; incident resolved
```

---

## Part 4: Incident Tracking

### Slack Channel (#incidents)

Every incident gets a thread:

```
🔴 [P1] Stripe Payment Processing Down
Created by: @on-call-eng | 2026-04-28 14:22 UTC

Initial Report:
- Subscription webhooks not processing for 8 minutes
- 23 users affected (pending subscriptions)
- Estimated revenue impact: $230 at-risk
- Root cause: Stripe API rate limit exceeded

Timeline:
[14:22] Alert triggered (Sentry error rate 18%)
[14:23] On-call ack'd; investigating
[14:25] Root cause identified: Stripe rate limit
[14:26] Reduced batch size; webhook retry triggered
[14:27] Webhook processing resumed
[14:30] ✅ All 23 subscriptions activated
[14:32] Postmortem scheduled for 2026-04-29 09:00

Assigned: @eng-alice
Postmortem: [Link to doc]
---

[Reactions: 3 👍, 1 🔴]
```

### Incident Dashboard (Factory Admin)

```
Incidents This Week:
┌─────────────────────────────────────────────────────────────────┐
| Severity | Count | Avg MTTR | Recent Example                      |
|----------|-------|---------|-------------------------------------|
| 🔴 P1   | 1     | 8 min   | Stripe webhook timeout (resolved)   |
| 🟠 P2   | 3     | 18 min  | Upload slow; LLM latency; DLQ queue |
| 🟡 P3   | 7     | N/A     | UI glitches, analytics gaps        |
| 🔵 P4   | 12    | N/A     | Tech debt, chores                  |
└─────────────────────────────────────────────────────────────────┘

SLO Status:
- P1 MTTR target: <30 min ✅ (avg 8 min)
- P2 MTTR target: <2 hours ✅ (avg 18 min)
- Postmortem completion: 100% (3/3 P1s have postmortems)
```

---

## Part 5: Postmortem Template

### Document Structure

```markdown
# Postmortem: [Incident Title]

## Executive Summary
1-2 sentence summary + impact.

Example: "Stripe webhook processing failed for 8 minutes, affecting 23 pending subscriptions. Estimated revenue impact: $230. Root cause: Stripe API rate limit."

## Incident Timeline

| Time | Event |
|------|-------|
| 14:22:00 | Sentry alert: error rate 18% |
| 14:23:15 | On-call ack'd; began investigating |
| 14:25:30 | Identified: Stripe rate limited |
| 14:26:45 | Reduced batch size; retry triggered |
| 14:30:00 | Webhooks processing normally |
| 14:32:00 | Incident resolved |

**Total Duration:** 8 minutes (detection to resolution)

## Impact

- **Users Affected:** 23 (pending subscriptions)
- **Revenue Impact:** $230 at-risk; $0 actual loss (all recovered)
- **Data Loss:** None
- **Support Tickets:** 2 (auto-resolved via email)

## Root Cause Analysis

### What Happened?

Weekly payout job initiated at 14:22, simultaneously with user subscription webhooks. Both hit Stripe API concurrent request limit (200 req/s). Webhook queue backed up; subscriptions stayed pending.

### Why Did It Happen?

1. No backpressure on Stripe API calls (both jobs fire simultaneously)
2. Batch size too aggressive (500 creators in parallel)
3. No rate limit jitter (no exponential backoff)

### Contributing Factors

- Stripe account on default rate limit (not upgraded)
- No monitoring on Stripe API request counts
- No circuit breaker between our service and Stripe

## Resolution

### Immediate Fix (Applied 14:26)

Reduced payout batch size from 500 to 100. Added 1s delay between Stripe calls.

```javascript
// src/jobs/weekly-payout.ts
const BATCH_SIZE = 100; // was 500
const STRIPE_DELAY_MS = 1000;

for (const creator of creators) {
  await stripe.transfers.create(...);
  await sleep(STRIPE_DELAY_MS); // Add delay
}
```

### Root Cause Fix (To Deploy May 1)

1. Implement exponential backoff on Stripe API calls (max 5 retries)
2. Add circuit breaker: If Stripe rate limited >3x in 1 min, queue jobs to KV + retry later
3. Request rate limit increase from Stripe (upgrade to 500 req/s)
4. Add metric: `stripe_api_request_count` (track rate limit headroom)

## Prevention

| Action | Owner | Due Date |
|--------|-------|----------|
| Implement exponential backoff | Engineer | May 1 |
| Deploy circuit breaker | Engineer | May 1 |
| Request Stripe rate limit increase | Lead | April 30 |
| Add Stripe rate limit monitoring | Engineer | May 2 |
| Load test payout job with real Stripe load | QA | May 5 |

## Lessons Learned

| What Went Well | What Could Improve |
|---|---|
| Alert triggered immediately (8s latency) | Could have prevented with circuit breaker |
| On-call responded in <2 min | Need better Stripe rate limit context in runbook |
| Fix was simple + low-risk | Should have tested batch sizes under load |
| Customer communication: auto-notification sent | Could have proactively notified pending users |

## Action Items

- [ ] Exponential backoff implementation (May 1) — @eng-bob
- [ ] Stripe rate limit increase request (April 30) — @lead-alice
- [ ] Load test (May 5) — @qa-carlos
- [ ] Update runbook with Stripe rate limit handling (May 1) — @eng-bob
- [ ] Monitoring: Add Stripe request count metric (May 2) — @devops

**Postmortem Author:** eng-alice  
**Postmortem Date:** 2026-04-29  
**Scheduled Review:** 2026-05-05
```

---

## Part 6: Runbook Snippets

### P1: Payment Processing Down

**Symptoms:** Sentry shows Stripe API errors; subscriptions pending >5 min

**Diagnostic Steps:**

```bash
# 1. Check Stripe status page
curl https://status.stripe.com/api/v2/status.json

# 2. Check our Stripe event log (Sentry)
# Sentry dashboard → Filter by tag:endpoint=/webhooks/stripe

# 3. Check DLQ queue
SELECT COUNT(*) FROM dlq_transfers WHERE created_at > NOW() - INTERVAL 15 MINUTES;

# 4. Check Stripe rate limit via API
curl https://api.stripe.com/v1/radar/review_sessions \
  -H "Authorization: Bearer ${STRIPE_API_KEY}" \
  -w "Rate-Limit: %{http_code}"
```

**Resolution Options:**

| Option | Risk | Duration |
|--------|------|----------|
| Wait 5 min for backoff to clear | Low | 5 min |
| Reduce batch size + retry | Low | 2 min |
| Pause payout job; manual reconciliation | Med | 30 min |
| Request Stripe manual intervention | High | 1+ hour |

**Action:** Try "Reduce batch size + retry" first.

### P2: Creator Upload Slow

**Symptoms:** Upload taking >60s; users reporting "stuck"

**Diagnostic Steps:**

```bash
# 1. Check LLM service latency
curl https://admin-studio-staging.adrper79.workers.dev/metrics?name=llm_classification_latency_ms
# Look for p95 > 15s (normal is <3s)

# 2. Check video encoding queue
SELECT COUNT(*) FROM videos WHERE status='pending_review' AND created_at > NOW() - INTERVAL 1 HOUR;

# 3. Check Worker logs for slow DB queries
# Sentry → Filter by endpoint=/api/videos AND duration_ms > 10000

# 4. Manually trigger LLM classification for stuck video
curl -X POST https://videoking.adrper79.workers.dev/admin/videos/vid_xyz/reprocess-moderation \
  -H "Authorization: Bearer ${ADMIN_TOKEN}"
```

**Resolution:**

1. Check LLM service (Anthropic Claude) — may be experiencing latency
2. If LLM is slow: Queue classifications for manual review (set status='pending_review')
3. If database is slow: Kill long-running queries; scale up connection pool

---

## Part 7: Rollback Procedure

### Decision Criteria

**Rollback when:**
- Issue is reproducible in new deploy only
- Issue is revenue/auth critical
- Confidence in fix is low (<50%)

**Don't rollback when:**
- Issue exists in previous version too (regression, not new)
- Issue is data-related (rolling back loses data)
- Fix is verified in staging

### Rollback Steps

```bash
# 1. Verify version to roll back to
git log --oneline -5  # Check last 5 commits
# v1.2.3 ← current (broken)
# v1.2.2 ← previous (last known good)

# 2. Create rollback commit
git revert HEAD --no-edit  # Creates commit: "Revert ..."
# Or manually: git checkout v1.2.2; make fix; commit as hotfix

# 3. Deploy rollback
wrangler deploy --env production

# 4. Verify
curl https://videoking.adrper79.workers.dev/health
# Should return 200 + status: "healthy"

# 5. Monitor
# Watch Sentry error rate for 10 min
# Should drop from 15% to <0.5% within 2 min

# 6. Communicate
# Slack #incidents: "✅ Rolled back to v1.2.2; incident resolved"

# 7. Schedule postmortem
# Discuss why fix broke prod; prevent next time
```

---

## Part 8: Exit Criteria (T5.3)

- [x] Severity tier definition (P1–P4 with examples)
- [x] Incident lifecycle documented (5 stages: detect, triage, respond, recover, postmortem)
- [x] Escalation rules defined (5-min acknowledgment, 30-min progress for P2)
- [x] Incident tracking in Slack + Factory Admin dashboard
- [x] Postmortem template (blameless, action-oriented)
- [x] Runbook templates (P1, P2 examples; diagnostic + resolution steps)
- [x] Rollback procedure defined
- [ ] Incident response training (May 15)
- [ ] First postmortem completed with team (May 15)

---

## Version History

| Date | Author | Change |
|------|--------|--------|
| 2026-04-28 | Platform Lead | T5.3 incident response framework; P1–P4 tiers; runbooks; postmortem template |

---

**Status:** ✅ T5.3 INCIDENT RESPONSE FRAMEWORK READY  
**Next Action:** Implement Sentry alert rules + alerts on-call (May 1); conduct incident response training (May 15)
