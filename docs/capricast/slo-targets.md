# Videoking SLO Targets

**Document Version:** 1.0  
**Last Updated:** April 28, 2026  
**Effective Date:** May 1, 2026  
**Review Cycle:** Quarterly (next review: June 28, 2026)

---

## Executive Summary

This document defines Service-Level Objectives for videoking's critical, important, and best-effort services. Each tier maps to business impact and has escalation rules based on error budget consumption.

---

## Tier 1: Critical Services (Business-Blocking)

These services directly impact revenue, legal compliance, or creator trust. Availability target is highest; any degradation requires immediate attention.

### 1.1: Authentication & Authorization

**Service:** User login, JWT generation, session validation, permission checks

**SLOs:**

| SLI | Target | Measurement Window | Measurement Method |
|-----|--------|-------------------|-------------------|
| Availability | 99.95% | Rolling 30 days | Cloudflare Analytics: `(total_auth_requests - 5xx_errors) / total_auth_requests` |
| p99 Latency | 500ms | Rolling 24 hours | Cloudflare Workers Analytics dashboard |
| Error Rate | < 0.5% | Rolling 30 days | Sentry: Count of `AuthError` + `TokenExpiredError` |
| Durability | 100% | Per transaction | JWT tokens never silently revoked mid-session |

**Error Budget:**
- Monthly downtime budget: **21.6 minutes**
- Hourly equivalent: **0.9 seconds**

**Alert Rules:**

| Condition | Action | Severity |
|-----------|--------|----------|
| Burn rate 5× (6-day depletion) | Page on-call engineer | High |
| Burn rate 10× (imminent breach) | Page tech lead + on-call | Critical |
| Auth service down > 1 min | Immediate page | P1 Incident |

**Dashboard:**
- Real-time: Current month budget consumption (%)
- Trend: Monthly budget burn over past 4 quarters
- Incidents: Failed auth attempts spike overlay
- On-call dashboard: See [slo-dashboard-template.yaml](../dashboards/slo-dashboard-template.yaml)

**Measurement:**

```sql
-- Cloudflare Analytics (daily)
SELECT 
  COUNT(*) as total_requests,
  SUM(CASE WHEN response_status >= 500 THEN 1 ELSE 0 END) as errors_5xx,
  ROUND(100.0 * (1 - SUM(CASE WHEN response_status >= 500 THEN 1 ELSE 0 END) / COUNT(*)), 4) as availability_pct
FROM http_requests
WHERE endpoint LIKE '/auth/%' AND timestamp >= NOW() - INTERVAL '30 days'
GROUP BY DATE(timestamp)
ORDER BY DATE(timestamp) DESC;
```

**Who measures:** DevOps / SRE team (automated daily)

**Who is on-call:** Auth service owner (24/7)

**Exceptions (don't count against SLO):**
- Provider outages (e.g., third-party OIDC down) — logged as incident but SLO adjusted
- Planned maintenance with >7 days advance notice and customer communication

---

### 1.2: Payment Processing

**Service:** Stripe integration, charge capture, webhook handling, transaction logging

**SLOs:**

| SLI | Target | Measurement Window | Measurement Method |
|-----|--------|-------------------|-------------------|
| Availability | 99.95% | Rolling 30 days | Cloudflare: `(payment_requests - failed_captures) / payment_requests` |
| p99 Latency | 800ms | Rolling 24 hours | Cloudflare Workers Analytics |
| Error Rate | < 0.5% | Rolling 30 days | Sentry: `PaymentError` + transaction rollback logs |
| Durability | 100% | Per transaction | No dropped or duplicated charges |

**Error Budget:**
- Monthly downtime budget: **21.6 minutes**
- This is **payment transaction time**; any dropped payment = budget impact

**Alert Rules:**

| Condition | Action | Severity |
|-----------|--------|----------|
| Payment fail rate > 0.3% over 5 min | Page on-call | High |
| Stripe webhook lag > 30s consistently | Investigation; alert | Warning |
| Any dropped transaction detected | Immediate incident + page | P1 |

**Measurement:**

```sql
-- Count successful vs. failed payment transactions
SELECT 
  COUNT(*) as total_transactions,
  SUM(CASE WHEN status = 'succeeded' THEN 1 ELSE 0 END) as succeeded,
  SUM(CASE WHEN status IN ('failed', 'canceled') THEN 1 ELSE 0 END) as failed,
  ROUND(100.0 * SUM(CASE WHEN status = 'succeeded' THEN 1 ELSE 0 END) / COUNT(*), 4) as success_rate_pct
FROM payment_transactions
WHERE created_at >= NOW() - INTERVAL '30 days'
GROUP BY DATE(created_at)
ORDER BY DATE(created_at) DESC;
```

**Who measures:** Payments team + DevOps (automated hourly reconciliation with Stripe)

**Who is on-call:** Payments engineer (24/7)

**Exceptions:**
- Stripe API outage (documented in status page)
- Known payment processor downtime (e.g., maintenance windows)

---

### 1.3: Payout Execution

**Service:** Creator payouts to bank accounts, payout verification, fraud detection holds

**SLOs:**

| SLI | Target | Measurement Window | Measurement Method |
|-----|--------|-------------------|-------------------|
| Availability | 99.9% | Rolling 30 days | Custom query: `(payout_requests - failed_payouts) / payout_requests` |
| Processing Time (p99) | 15 minutes | Per payout batch | Query Neon: Payout batch completion time |
| Error Rate | < 1% | Rolling 30 days | Sentry + manual audit of payout status table |
| Durability | 100% | Per payout | No duplicate payouts, no lost funds |

**Error Budget:**
- Monthly budget: **43.2 minutes**
- Measured as payout delay, not downtime (even if slow, payouts still happen)

**Alert Rules:**

| Condition | Action | Severity |
|-----------|--------|----------|
| Payout batch fails > 1 time | Immediate investigation | High |
| Payout processing > 30 minutes (p99 breach) | Alert; plan optimization | Warning |
| Duplicate payout detected (any) | Lock account; notify creator; page | P1 |

**Measurement:**

```sql
-- Monitor payout processing
SELECT 
  COUNT(*) as total_payouts,
  AVG(EXTRACT(EPOCH FROM (completed_at - created_at))) as avg_time_seconds,
  PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (completed_at - created_at))) as p99_time_seconds,
  SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed_count
FROM payouts
WHERE created_at >= NOW() - INTERVAL '30 days' AND batch_id IN (SELECT id FROM payout_batches WHERE created_at >= NOW() - INTERVAL '30 days')
GROUP BY DATE(created_at)
ORDER BY DATE(created_at) DESC;
```

**Who measures:** Finance team + DevOps (daily batch verification, monthly audit)

**Who is on-call:** Finance engineer + Platform engineer (24/7 for critical issues)

**Exceptions:**
- Bank API downtime (unusual; documented)
- Fraud hold (legitimate; doesn't count as failure)

---

## Tier 2: Important Services (Customer-Facing, High-Value)

These services materially degrade user experience if unavailable, but aren't blocking revenue.

### 2.1: Video Streaming & Playback

**Service:** Cloudflare Stream delivery, HLS manifest generation, adaptive bitrate selection

**SLOs:**

| SLI | Target | Measurement Window | Measurement Method |
|-----|--------|-------------------|-------------------|
| Availability | 99.9% | Rolling 30 days | Cloudflare Stream API: Stream availability metric |
| p95 Latency | 2s | Rolling 24 hours | Cloudflare Workers Analytics (stream edge latency) |
| Error Rate (4xx + 5xx) | < 1% | Rolling 30 days | Sentry + Cloudflare Stream errors |
| Buffering Rate | < 2% | Rolling 24 hours | PostHog: `video_buffering_event` count |

**Error Budget:**
- Monthly downtime: **43.2 minutes**
- This measures stream availability at the edge

**Alert Rules:**

| Condition | Action | Severity |
|-----------|--------|----------|
| Stream availability < 99% over 1 hour | Alert ops | Warning |
| Buffering rate > 5% | Investigation | High |
| 404 errors on HLS manifests spike | Page platform eng | High |

**Measurement:**

```sql
-- Video stream quality metrics
SELECT 
  COUNT(DISTINCT user_id) as unique_viewers,
  COUNT(*) as total_play_attempts,
  SUM(CASE WHEN event_type = 'video_error' THEN 1 ELSE 0 END) as failed_plays,
  SUM(CASE WHEN event_type = 'video_buffering' THEN 1 ELSE 0 END) as buffering_events,
  ROUND(100.0 * SUM(CASE WHEN event_type = 'video_error' THEN 1 ELSE 0 END) / COUNT(*), 2) as error_rate_pct
FROM factory_events
WHERE event_type IN ('video_play', 'video_error', 'video_buffering', 'video_complete')
  AND timestamp >= NOW() - INTERVAL '30 days'
GROUP BY DATE(timestamp)
ORDER BY DATE(timestamp) DESC;
```

**Who measures:** Platform team + DevOps (hourly automated checks via PostHog)

**Who is on-call:** Streaming platform engineer (business hours + escalation)

---

### 2.2: User Discovery & Feed Generation

**Service:** Creator discovery feed, trending videos list, personalized recommendations (non-ML)

**SLOs:**

| SLI | Target | Measurement Window | Measurement Method |
|-----|--------|-------------------|-------------------|
| Availability | 99.9% | Rolling 30 days | Cloudflare: Feed API response rate |
| p95 Latency | 2s | Rolling 24 hours | Cloudflare Workers Analytics |
| Error Rate | < 1% | Rolling 30 days | Sentry: `FeedGenerationError` |
| Freshness | < 5 min | Per request | Query Neon: Last cache refresh timestamp |

**Error Budget:**
- Monthly: **43.2 minutes**

**Alert Rules:**

| Condition | Action | Severity |
|-----------|--------|----------|
| Feed API > 1% error rate | Alert ops | Warning |
| Feed latency p95 > 5s | Investigation | Medium |
| Cache stale > 15 minutes | Log; schedule refresh | Info |

**Measurement:**

```sql
-- Feed generation success
SELECT 
  COUNT(*) as total_feed_requests,
  SUM(CASE WHEN response_status >= 500 THEN 1 ELSE 0 END) as errors,
  ROUND(100.0 * (1 - SUM(CASE WHEN response_status >= 500 THEN 1 ELSE 0 END) / COUNT(*)), 2) as availability_pct,
  PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY response_time_ms) as p95_latency_ms
FROM requests
WHERE endpoint = '/api/feed' AND timestamp >= NOW() - INTERVAL '30 days'
GROUP BY DATE(timestamp)
ORDER BY DATE(timestamp) DESC;
```

**Who measures:** Backend platform team (automated)

**Who is on-call:** Feed platform engineer (business hours)

---

### 2.3: Notifications

**Service:** Email, push notification delivery; webhook dispatch to external systems

**SLOs:**

| SLI | Target | Measurement Window | Measurement Method |
|-----|--------|-------------------|-------------------|
| Availability | 99.9% | Rolling 30 days | Resend + OneSignal: Delivery logged |
| Delivery Latency (p95) | 2s | Rolling 24 hours | Query Neon: Time from trigger to delivery service |
| Bounce Rate | < 2% | Rolling 7 days | Resend dashboard: Hard bounces |
| Spam Rate | < 0.5% | Rolling 30 days | Manual review + feedback loops |

**Error Budget:**
- Monthly: **43.2 minutes**

**Alert Rules:**

| Condition | Action | Severity |
|-----------|--------|----------|
| Delivery failure rate > 0.5% | Page on-call | High |
| Bounce rate > 5% | Investigate lists; manual review | Medium |
| Spam complaints > 1% | Pause campaign; investigate | High |

**Who measures:** Engagement team + DevOps (daily metrics)

**Who is on-call:** Notifications engineer (business hours)

---

## Tier 3: Best-Effort Services (Non-Blocking)

These services enhance experience but don't block core workflows if unavailable.

### 3.1: Analytics Dashboard

**Service:** PostHog insights, custom event reporting, admin analytics UI

**SLOs:**

| SLI | Target | Measurement Window | Measurement Method |
|-----|--------|-------------------|-------------------|
| Availability | 99% | Rolling 30 days | PostHog API responses |
| Dashboard Load Time (p90) | 5s | Rolling 24 hours | Custom synthetic check |
| Error Rate | < 5% | Rolling 30 days | Sentry: `AnalyticsError` |

**Error Budget:**
- Monthly: **7.2 hours**

**Alert Rules:**

| Condition | Action | Severity |
|-----------|--------|----------|
| Analytics API down | Log; investigate async | Info |
| Dashboard timeout | Cached fallback shown | Info |

**Who measures:** Analytics team (1x daily check)

**Who is on-call:** No (async response)

---

### 3.2: ML Recommendations (Batch Refresh)

**Service:** Nightly creator ranking refresh, trending video list ML recompute

**SLOs:**

| SLI | Target | Measurement Window | Measurement Method |
|-----|--------|-------------------|-------------------|
| Availability | 99% | Rolling 30 days | Batch job completion rate |
| Job Duration (p90) | 2 hours | Per scheduled batch | Neon query logs |
| Error Rate | < 5% | Rolling 7 days | Batch job error logs |

**Error Budget:**
- Monthly: **7.2 hours**

**Measurement:**

```sql
-- ML batch job success tracking
SELECT 
  job_name,
  COUNT(*) as total_runs,
  SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as successful,
  SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
  AVG(EXTRACT(EPOCH FROM (ended_at - started_at))) as avg_duration_seconds
FROM batch_jobs
WHERE started_at >= NOW() - INTERVAL '30 days'
GROUP BY job_name
ORDER BY total_runs DESC;
```

**Who measures:** Data team (automated log review)

**Who is on-call:** No

---

### 3.3: Admin UI Secondary Features

**Service:** Admin studio analytics, creator verification UI, secondary admin pages

**SLOs:**

| SLI | Target | Measurement Window | Measurement Method |
|-----|--------|-------------------|-------------------|
| Availability | 99% | Rolling 30 days | Cloudflare: Admin endpoints |
| Page Load Time (p90) | 5s | Rolling 24 hours | Synthetic monitoring |
| Error Rate | < 5% | Rolling 30 days | Sentry (errors_admin_ui tag) |

**Error Budget:**
- Monthly: **7.2 hours**

**Who measures:** Admin team (1x weekly spot check)

**Who is on-call:** No

---

## Budget Consumption Policy

### Tier 1 Response (Availability > 99.95%)

**Monthly Consumption Thresholds:**

| Consumed | Action |
|----------|--------|
| 0–50% | Normal ops; no action |
| 50–80% | Ops standup; track burn rate daily |
| 80–100% | **Code freeze on non-critical features; reliability sprint begins** |
| 100%+ | **SLO breached: Postmortem scheduled; root cause fix priority** |

Example timeline:
- May 15: Auth SLO at 75% consumed (high alert) → Tech lead reviews incidents; prioritizes latency optimization
- May 22: Auth SLO at 95% consumed (critical) → All non-essential features paused; team focuses on stability
- May 28: Auth SLO fully consumed (100%) → Mandatory postmortem scheduled for May 30; fix in June sprint

### Tier 2 Response (Availability = 99.9%)

| Consumed | Action |
|----------|--------|
| 0–60% | Normal ops |
| 60–80% | Prioritize reliability bugs; defer feature work |
| 80–100% | Reliability sprint; postmortem if breached |
| 100%+ | Postmortem + follow-up sprint |

### Tier 3 Response (Availability = 99%)

| Consumed | Action |
|----------|--------|
| 0–100% | Noted asynchronously; no escalation |
| 100%+ | Log incident; schedule fix at next convenient sprint |

---

## Quarterly Review Schedule

**Fixed Dates:**
- **Q1 review:** March 25–29 (quarterly assessment, targets for Q2)
- **Q2 review:** June 24–28 (targets for Q3)
- **Q3 review:** September 22–26 (targets for Q4)
- **Q4 review:** December 22–26 (targets for Q1 next year)

**Review inputs:**
1. SLO burn rate chart (monthly trend)
2. Incident analysis (count, severity, root cause)
3. Operational load (deployments, changes, on-call incidents)
4. Business context (new features, new markets, customer feedback)

**Review output:** Updated SLO targets published 1 week before next quarter begins

---

## Exceptions & Maintenance

### Planned Maintenance

Planned maintenance windows **do not consume error budget** if:
- Announced >7 days in advance
- Scheduled during low-traffic period (e.g., 2am UTC)
- Communicated to affected customers/creators
- Monitored by on-call engineer

Unannounced maintenance counts toward budget.

### External Incidents

Incidents caused by external providers (e.g., Stripe API down, Neon database incident, Cloudflare DDoS mitigation) are:
- **Logged as incidents** (for postmortem learning)
- **SLO adjusted** (error budget not counted against us)
- **Documented in quarterly review**

---

## Escalation Contacts

### Tier 1 Incidents

| Service | Primary On-Call | Secondary | Escalation |
|---------|-----------------|-----------|-----------|
| Auth | @auth-primary | @auth-backup | @eng-lead |
| Payments | @payments-primary | @payments-backup | @cfo / @ops-lead |
| Payouts | @finance-primary | @platform-primary | @cfo / @ceo |

### Tier 2 Incidents

| Service | Primary On-Call | Escalation |
|---------|-----------------|-----------|
| Video Streaming | @platform-primary | @eng-lead |
| Discovery Feed | @backend-primary | @eng-lead |
| Notifications | @engagement-primary | @product-lead |

---

## Dashboard & Tooling

See [slo-dashboard-template.yaml](../dashboards/slo-dashboard-template.yaml) for Grafana/Datadog dashboard configuration.

**Automated daily reports:**
- SLO status email to #ops channel
- Burn rate trend chart (month-over-month)
- Incident correlation overlay

---

## Feedback & Review

Questions or proposed changes? File an issue in the Factory repo with label `slo-review`. This document is reviewed quarterly alongside SLO targets.

**Last reviewed:** April 28, 2026  
**Next review:** June 28, 2026
