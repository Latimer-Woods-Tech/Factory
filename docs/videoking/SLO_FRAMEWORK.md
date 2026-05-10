# VideoKing Service Level Objectives (SLOs)

**Date:** April 28, 2026  
**Status:** Phase B Ready  
**Baseline Established:** Yes (99.8% uptime, 0.2% error rate)

---

## Executive Summary

VideoKing is adopting formal SLOs to define production quality expectations and operationalize reliability as a first-class product requirement. This document establishes:

- **Availability target:** 99.9% (30-minute error budget per month)
- **Latency targets:** <200ms p95 for public APIs, <500ms p95 for admin/operator APIs
- **Error rate target:** <0.1% (down from current 0.2%)
- **Tracking:** Automated weekly collection + PostHog dashboards + Sentry alerts

---

## Service Definitions

### Tier 1: Public Viewer APIs (User-Facing)

These are the critical paths that directly impact viewer experience. Viewer satisfaction and retention depend on these.

| Service | Endpoint | SLO | Baseline | Owner |
|---------|----------|-----|----------|-------|
| **Video Playback** | `GET /api/videos/:id` + Cloudflare Stream | 99.95% uptime | 99.8% | Eng (backend) + CF (Stream) |
| **Video Discovery** | `GET /api/videos` (list/search) | 99.9% uptime | 99.8% | Eng (backend) |
| **Creator Profile** | `GET /api/creators/:id` | 99.9% uptime | 99.8% | Eng (backend) |
| **Authentication** | `POST /api/auth/signin`, `POST /api/auth/signup` | 99.9% uptime | 99.8% | Auth package + Eng |
| **Viewer Subscriptions** | `POST /api/subscriptions` (checkout) | 99.9% uptime | 99.8% | Eng + Stripe |

**Latency Target:** p95 < 200ms (p99 < 500ms)

**Error Budget (Monthly for 99.9%):**
- 43 minutes of downtime per month
- ~4.3 minutes per week average
- Used for: deployments, patches, incident recovery

---

### Tier 2: Creator / Authenticated APIs

Creator-facing endpoints support creator dashboard, uploads, and earnings tracking. Less critical than public APIs but important for creator satisfaction and retention.

| Service | Endpoint | SLO | Baseline | Owner |
|---------|----------|-----|----------|-------|
| **Creator Dashboard** | `GET /api/creators/:id/videos`, `/earnings`, `/subscribers` | 99.5% uptime | 99.8% | Eng |
| **Video Upload** | `POST /api/videos` (multipart, progress) | 99.5% uptime | 99.8% | Eng + R2 |
| **Earnings History** | `GET /api/creators/:id/earnings` (paginated) | 99.5% uptime | 99.8% | Eng |
| **Metadata Edit** | `PATCH /api/videos/:id` | 99.5% uptime | 99.8% | Eng |

**Latency Target:** p95 < 300ms (p99 < 800ms)

**Error Budget (Monthly for 99.5%):**
- 216 minutes of downtime per month
- ~50 minutes per week average

---

### Tier 3: Admin / Operator APIs

Operator workflows for payouts, DLQ recovery, and moderation. High impact to business when down, but operators have contingencies (manual recovery, batch resume).

| Service | Endpoint | SLO | Note | Owner |
|---------|----------|-----|------|-------|
| **Dead Letter Queue** | `GET /api/admin/dead-letter-queue`, `POST /:id/recover` | 99.5% uptime | Failure recovery; manual retry if needed | Eng |
| **Payout Management** | `GET /api/admin/payouts/pending`, `/batch/:id/execute` | 99.9% uptime | Critical to creator payouts; SLA < 5 min to resolve | Eng |
| **Moderation Queue** | `GET /api/admin/reports`, `POST /:id/action` | 99.0% uptime | Manual review queued; doesn't block viewers | Eng |
| **Audit Logs** | `GET /api/admin/audit-log` | 99.0% uptime | Historical; not time-critical | Eng |

**Latency Target:** p95 < 500ms (p99 < 1500ms)

**Error Budget (Monthly):**
- Payout APIs (99.9%): 43 minutes
- Other operator APIs (99.0%): 432 minutes (~7 hours per month)

---

## Key Metrics & Collection

### Weekly Metrics (Automated Collection)

**Every Monday 9am UTC**, collect these metrics from the previous 7 days:

| Metric | Source | Query | Alert Threshold |
|--------|--------|-------|-----------------|
| **Availability (% uptime)** | Sentry + Cloudflare logs | Count 2xx/3xx responses / total requests | < 99.5% for any tier |
| **Error Rate (% 5xx)** | Sentry | Count 5xx errors / total requests | > 0.3% |
| **Latency p95** | Cloudflare Analytics + Sentry | 95th percentile request duration | > 300ms (Tier 1) |
| **Latency p99** | Cloudflare Analytics + Sentry | 99th percentile request duration | > 800ms (Tier 1) |
| **Stripe Webhook Success Rate** | DLQ + Stripe events | (succeeded) / (attempted) | < 99.5% |
| **Payout Batch Success Rate** | Payout table | (completed + partial_failure) / (total batches) | < 99.0% |
| **DLQ Item Recovery Rate** | Dead letter queue | (recovered + archived) / (pending) | < 95% within 24h |

### Dashboards

1. **PostHog Dashboard: VideoKing Health**
   - Real-time availability (current week vs. target)
   - Error rate trend (7-day rolling)
   - Latency percentiles (p95, p99, p99.9)
   - Stripe webhook success rate
   - Payout batch status distribution

2. **Sentry Pinned Board: Tier 1 & 2 Services**
   - List of critical endpoints
   - Error rate for each endpoint
   - Top error messages (deduplicated)
   - Alert on any endpoint > 0.3% error rate

3. **Cloudflare Workers Analytics**
   - Request rate by endpoint
   - Response status distribution
   - Request duration distribution (native analytics)

### Collection Script

**Location:** `scripts/videoking-slo-collect.js`

```javascript
// Runs weekly (Monday 9am UTC) via GitHub Actions
// Collects metrics and posts to PostHog + Slack #ops channel

await collectSLOMetrics({
  startDate: lastMonday,
  endDate: today,
  metrics: [
    'availability_tier1',
    'availability_tier2',
    'availability_tier3',
    'error_rate_overall',
    'error_rate_stripe_webhooks',
    'payout_success_rate',
    'dlq_recovery_rate',
    'latency_p95_tier1',
    'latency_p99_tier1',
  ],
  postToPostHog: true,
  alertOnThresholdBreach: true,
  slackChannel: '#ops',
});
```

**GitHub Actions Workflow:** `Latimer-Woods-Tech/videoking/.github/workflows/slo-collect.yml` _(to be created in the videoking repo — moved out of factory 2026-05-09 as part of orphaned-workflow cleanup; see chore/delete-orphaned-workflows)_
- Trigger: Every Monday 9am UTC
- Script: `scripts/videoking-slo-collect.js` _(also needs to move to videoking)_
- Outputs: PostHog events + Slack notification
- On-Call Escalation: If alert threshold breached, notify on-call engineer

---

## Alert Rules

### Critical Alerts (Page On-Call)

| Condition | Severity | Action |
|-----------|----------|--------|
| Tier 1 availability < 99.5% in last 5 min | P1 | Page on-call engineer immediately |
| Tier 1 error rate > 1.0% in last 5 min | P1 | Page on-call engineer immediately |
| Tier 1 latency p95 > 1000ms for 5 consecutive min | P1 | Page on-call engineer immediately |
| Payout API unavailable (3 consecutive failures) | P1 | Page on-call engineer + ops lead |

**Response Time SLA:** On-call triage within 5 minutes; root cause within 15 minutes

### Warning Alerts (Slack #ops)

| Condition | Severity | Action |
|-----------|----------|--------|
| Tier 1 availability < 99.8% in last 15 min | P2 | Post to #ops with context |
| Tier 2 availability < 99.3% in last 15 min | P2 | Post to #ops with context |
| Weekly metric drift > 10% from target | P3 | Post to #ops; review in weekly standup |

---

## Monthly Review Cadence

### Every Monday 10am UTC: Team SLO Standup

**Attendees:** Tech Lead, Ops Lead, On-Call Rotation Lead

**Agenda (30 min):**
1. **Metrics Review (10 min):**
   - Did we meet all SLO targets last week?
   - If no: what went wrong? (incident, bug, infra issue?)
   - Current month error budget: how much consumed?

2. **Incident Review (10 min):**
   - Any P1/P2 alerts last week?
   - Were they detected by SLO alerts or user report?
   - Action items to improve detection?

3. **Trend Analysis (5 min):**
   - Latency increasing? Error rate creeping up?
   - Any concerning patterns?

4. **Next Week Planning (5 min):**
   - Any risky changes (big deployments, migrations)?
   - If so, plan for extended monitoring

**Output:** Notes posted to #ops; blockers escalated to tech lead

---

## Quarterly Deep Dive

### Every 13 Weeks: SLO Review & Targets Update

**Attendees:** Tech Lead, Product Lead, Ops Lead

**Scope (90 min):**
1. **Q Performance Summary:** Did we meet targets all 13 weeks?
2. **Baseline vs. Target:** Are targets realistic? Too loose?
3. **Error Budget Usage:** Where did we burn most error budget? (incidents, features, deployments)
4. **Customer Impact:** Any SLO breaches that hurt user retention or revenue?
5. **Improvement Opportunities:** Can we improve p95 latency? Reduce webhook failures? Better DLQ recovery?
6. **Target Adjustments:** Should we tighten/loosen SLOs for next quarter?

**Output:** Updated SLO targets for next quarter; published to stakeholders

---

## Error Budget & Release Policy

### Error Budget Consumption Rules

**Tier 1 (99.9%) Monthly Budget: 43 minutes**

- **Planned Maintenance:** (up to 10 min/month allowed)
  - Database maintenance window during low-traffic hours
  - Cloudflare cache purge
  - Emergency hotfix deployment (no more than 1/month)

- **Incident Recovery:** (consumes budget)
  - If incident lasts 5 min, that's 5 min from 43-minute budget
  - If budget exhausted, next incident = SLO miss

- **Deployment Risk:** (no consumption if no errors)
  - Blue/green deployments = zero downtime if successful
  - Canary deployments = gradual rollout, reduce blast radius

### Error Budget Exhaustion Policy

**If error budget exhausted before month end:**

1. **Freeze all non-critical deployments** (continue critical hotfixes only)
2. **Increase monitoring intensity** (real-time dashboards, lower alert thresholds)
3. **Daily SLO standup** (instead of weekly)
4. **Code review: every change** (no approvals; block risky code)
5. **Post-mortem planning:** Why did we chew through 43 minutes?

**Resumption:** Budget resets on the 1st of next month; normal deployment cadence resumes if no active incidents.

---

## Baseline Establishment (Week 1)

To validate these SLO targets are realistic, we will collect metrics for the first 2 weeks without enforcing alerts:

**Week 1 (Apr 28 – May 4):**
- Deploy SLO collection script
- Run metrics collection daily
- Identify any data collection gaps
- Post daily summary to #ops (no alerts)

**Week 2 (May 5 – May 11):**
- Validate metrics are stable
- Compare against SLO targets
- Adjust alert thresholds if needed
- Enable P2/P3 alerts (not P1 yet)

**Week 3 (May 12 – May 18):**
- Enable all alert rules (P1, P2, P3)
- On-call rotation practices incident response
- First scheduled SLO standup (Monday May 12)

---

## SLO Contract with Stakeholders

### For Creators

> VideoKing's public APIs (video playback, discovery, auth, subscriptions) are available **99.9% of the time**. That means:
> - ~30 minutes of downtime per month
> - ~7 minutes per week average
> - Even during updates, we use zero-downtime deployments

> If we fall short, we will post a status update to the creator dashboard and explain what happened.

### For Viewers

> VideoKing video streaming is designed to be available **99.95% of the time**. That means:
> - ~22 minutes of downtime per month
> - Less than 5 minutes per week

> If a video fails to load, we'll show you an error message and the option to retry. If the problem persists, contact support.

### For Operations Team

> Payout APIs are available **99.9% of the time**. If a payout batch fails:
> 1. The system automatically records the failure to the DLQ
> 2. You will be notified within 5 minutes
> 3. You can retry the batch with one click
> 4. SLA is <5 min to resolve (manual execution if automation fails)

---

## Owner Assignments

| Area | Owner | Backup |
|------|-------|--------|
| **SLO Targets & Policy** | Tech Lead | Engineering Manager |
| **Metrics Collection** | Ops Engineer | Tech Lead |
| **Alert Configuration** | Ops Engineer | On-Call Lead |
| **Weekly Standup** | Tech Lead | Ops Lead |
| **Quarterly Review** | Tech Lead + Product Lead | Engineering Manager |
| **On-Call Response** | On-Call Rotation (weekly) | Backup on-call |

---

## Appendix: SLO Runbook

### If Tier 1 Availability Falls Below 99.8% (Alert Triggered)

1. **On-call engineer receives page alert** (via Sentry/PagerDuty)
2. **Check Cloudflare status dashboard:**
   - Are there known issues in our region?
   - Is this a CF edge problem or our worker code?
3. **Check Neon database health:**
   - Is Hyperdrive connection pool healthy?
   - Any long-running queries blocking requests?
4. **Review recent deployments:**
   - Did we deploy code in the last 5 minutes?
   - Roll back if necessary: `wrangler rollback`
5. **Check Stripe API status:**
   - Payments might be failing if Stripe is down
6. **Document incident in Sentry** with root cause
7. **Post-incident:** Schedule post-mortem if SLO missed

### If Payout Batch Fails (P1 Alert)

1. **On-call + ops lead receive alert**
2. **Manual payout execution steps:**
   ```bash
   # SSH to admin box
   curl -X GET https://videoking.adrper79.workers.dev/api/admin/payouts/pending \
     -H "Authorization: Bearer ${ADMIN_TOKEN}" \
     -H "Content-Type: application/json"
   
   # Review pending batch
   curl -X POST https://videoking.adrper79.workers.dev/api/admin/payouts/batch \
     -H "Authorization: Bearer ${ADMIN_TOKEN}" \
     -d '{...}'
   
   # Execute (idempotent — same batch can be retried)
   curl -X POST https://videoking.adrper79.workers.dev/api/admin/payouts/batch/:id/execute \
     -H "Authorization: Bearer ${ADMIN_TOKEN}"
   ```
3. **If execution succeeds:** Mark resolved in SLO dashboard
4. **If execution fails:** Check DLQ for blocked transfers; escalate to engineering

---

## Version History

| Date | Author | Change |
|------|--------|--------|
| 2026-04-28 | Baseline | Initial SLO framework; Tier 1/2/3 targets set; collection + alert rules defined |

---

**Next Steps:**
1. Approve SLO targets with tech lead (by Apr 30)
2. Deploy metrics collection script (by May 1)
3. Run 2-week baseline collection (May 1–14)
4. Enable alerts (by May 12)
5. First SLO standup (Monday May 12)
