# VideoKing Phase B Kickoff — T5.1 Operationalization Complete

**Date:** April 28, 2026  
**Phase:** B (Standardize)  
**Initiative:** T5.1 — Define Service-Level Objectives and Error Budgets

---

## Deliverables Complete

### 1. ✅ SLO Framework Document
**File:** [docs/videoking/SLO_FRAMEWORK.md](./docs/videoking/SLO_FRAMEWORK.md)

**Scope:**
- **Tier 1 (Public APIs):** 99.9% uptime (video playback, discovery, auth, subscriptions)
- **Tier 2 (Creator APIs):** 99.5% uptime (dashboard, uploads, earnings)
- **Tier 3 (Operator APIs):** 99.0–99.9% uptime (DLQ, payouts, moderation)

**Key Components:**
- Service definitions with latency targets (p95 < 200ms for Tier 1)
- Monthly error budget: 43 minutes for Tier 1, 216 minutes for Tier 2
- Error budget exhaustion policy: Freeze deployments if budget consumed
- Weekly metrics collection schedule (Monday 9am UTC)
- Alert thresholds: P1 (page on-call immediately), P2 (Slack #ops), P3 (weekly standup)

---

### 2. ✅ Automated Metrics Collection Script
**File:** [scripts/videoking-slo-collect.js](./scripts/videoking-slo-collect.js)

**Functionality:**
- Fetches metrics from Sentry (availability, error rate, latency)
- Fetches metrics from Cloudflare (request counts, response times)
- Posts results to PostHog for historical tracking
- Posts weekly summary to Slack #ops with trend analysis
- Saves JSON artifact for CI/CD visibility

**Metrics Tracked:**
- Availability % by tier
- Error rate % (5xx errors)
- Latency p95 / p99 / p99.9
- Stripe webhook success rate
- Payout batch completion rate
- DLQ recovery rate within 24h

**Execution:** Runs automatically every Monday 9am UTC

---

### 3. ✅ GitHub Actions Workflow
**File:** `Latimer-Woods-Tech/videoking/.github/workflows/slo-collect.yml` _(to be created in the videoking repo — moved out of factory 2026-05-09 as part of orphaned-workflow cleanup)_

**Trigger:** Cron schedule (Monday 9am UTC) + manual workflow_dispatch

**Actions:**
1. Authenticate to Sentry, Cloudflare, PostHog
2. Run metrics collection script
3. Upload report as workflow artifact (90-day retention)
4. Notify #ops channel with visual summary + action buttons
5. Fail gracefully if external services unavailable (with notification)

**Status in Workflow Summary:** Always visible; links to PostHog + Sentry dashboards

---

### 4. ✅ On-Call Incident Response Runbook
**File:** [docs/videoking/ON_CALL_RUNBOOK.md](./docs/videoking/ON_CALL_RUNBOOK.md)

**Scope:**

| Section | Purpose |
|---------|---------|
| **Alert Escalation Matrix** | P1 (page immediately) vs P2 (Slack) vs P3 (weekly standup) rules |
| **Response Workflow** | 5-phase incident response: Alert → Triage → Execution → Verification → Post-mortem |
| **Decision Tree** | How to determine if alert is real incident or false positive |
| **Root Cause Diagnostics** | Queries and dashboards to check (Sentry, Cloudflare, Neon) in order |
| **Common Incidents** | Quick resolution steps for Tier 1 500s, payout failure, latency spike |
| **Escalation Protocol** | When to page backup on-call (10 min); when to page tech lead (20 min) |
| **Post-Mortem Template** | Structured review (timeline, impact, root cause, action items) |
| **On-Call Checklist** | Pre-shift setup, during-shift actions, end-of-shift handoff |

**SLAs:**
- P1 incident: 5-minute triage SLA; escalate if unresolved after 10 min
- P2 incident: 30-minute response SLA
- Post-mortem: Within 2 hours of resolution (while fresh)

---

## Integration Points

### 1. PostHog Dashboard
**Expected Setup:**
- Dashboard: "VideoKing Health"
- Charts: 
  - Real-time availability (vs 99.9% target)
  - Error rate trend (vs 0.1% target)
  - Latency percentiles (p95, p99)
  - Payout success rate
- Alerts: Auto-fire when availability < 99.5% or error rate > 0.3%

**Action:** Import JSON from SLO collection output into PostHog manually or via API

---

### 2. Sentry Pinned Board
**Expected Setup:**
- Monitor: "Tier 1 & 2 Critical Endpoints"
- Endpoints tracked:
  - `GET /api/videos/:id` (video playback)
  - `GET /api/videos` (discovery)
  - `POST /api/auth/signin` (auth)
  - `POST /api/subscriptions` (payments)
- Alert rules: Trigger if error rate > 0.3% for any endpoint

**Action:** Create pinned issue board in Sentry; assign to ops team

---

### 3. Slack #ops Channel
**Expected Messages:**
- Every Monday 10am UTC: Weekly SLO summary + KPI card
- P1 Alert: "Tier 1 Availability Critical" → Page on-call + post thread
- P2 Alert: "Tier 1 Availability Warning" → Post with context; no page
- Escalation: "Escalation: Incident unresolved 20+ min" → Page tech lead

**Action:** Configure Slack webhook for PostHog + Sentry (already in `.env`)

---

### 4. GitHub Actions Artifacts
**Expected Output:**
- Weekly: `slo-report-{run-id}.json` artifact (90-day retention)
- Contains: availability %, error %, latency metrics, week dates
- Accessible via: Actions → videoking-slo-collect → Artifacts

**Action:** Optional — manually review artifact if automatic collection fails

---

## Weekly Cadence (Starting May 5, 2026)

### Every Monday

| Time (UTC) | Owner | Activity | Output |
|-----------|-------|----------|--------|
| 9:00 AM | (Automated) | SLO metrics collection runs | PostHog event + Slack notification |
| 10:00 AM | Tech Lead + Ops | SLO standup (30 min) | Review metrics, discuss blockers, update action items |
| 10:30 AM | Tech Lead | Close standup; post notes to #ops | Written summary of health + any escalations |

### Meeting Agenda (30 min)
1. **Metrics Review (10 min):** Did we meet SLO targets? Error budget status?
2. **Incident Review (10 min):** Any P1/P2 alerts this week? Root causes?
3. **Trend Analysis (5 min):** Is latency increasing? Error rate creeping?
4. **Next Week Planning (5 min):** Any risky deployments planned?

### Monthly Deep Dive (Every Quarter)

| Date | Duration | Attendees | Activity |
|------|----------|-----------|----------|
| End of Q (e.g., June 30) | 90 min | Tech Lead + Product Lead + Ops | Review 13-week performance; adjust SLO targets for next quarter |

---

## Baseline Establishment (May 1–18)

### Week 1 (May 1–7): Collection & Validation
- Deploy SLO collection script to GitHub Actions
- Run metrics collection daily (manual) to validate
- Post daily summaries to #ops (no alerts)
- Identify and fix any data collection gaps

### Week 2 (May 8–14): Threshold Tuning
- Validate metrics are stable
- Compare baseline against SLO targets
- Adjust alert thresholds if needed (if actual availability is consistently < target)
- Enable P2/P3 alerts (not P1 yet)

### Week 3 (May 15–21): Go-Live
- Enable all alert rules (P1, P2, P3)
- On-call rotation practices with sample incidents
- First scheduled SLO standup (Monday May 12)
- Handoff: SLO monitoring now live; team owns thresholds

---

## Pre-Deployment Checklist

**Before May 1, 2026:**

- [ ] **Secrets Configured** (GitHub Actions)
  - [ ] `SENTRY_AUTH_TOKEN` — For Sentry API queries
  - [ ] `CF_API_TOKEN` — For Cloudflare Analytics
  - [ ] `CF_ACCOUNT_ID` — Cloudflare account ID
  - [ ] `POSTHOG_KEY` — PostHog API key
  - [ ] `SLACK_WEBHOOK_OPS` — Slack webhook for #ops channel

- [ ] **Team Readiness**
  - [ ] Tech lead reviewed SLO_FRAMEWORK.md and signed off on targets
  - [ ] Ops lead confirmed Sentry + Cloudflare access
  - [ ] On-call lead reviewed ON_CALL_RUNBOOK.md
  - [ ] PostHog admin configured dashboard template
  - [ ] Slack #ops channel exists and bot has permission to post

- [ ] **Documentation Published**
  - [ ] SLO_FRAMEWORK.md in docs/videoking/
  - [ ] ON_CALL_RUNBOOK.md in docs/videoking/
  - [ ] GitHub workflow deployed to .github/workflows/
  - [ ] Collection script deployed to scripts/

- [ ] **Dry Run** (April 29–30)
  - [ ] Run collection script manually: `node scripts/videoking-slo-collect.js --week 2026-04-28`
  - [ ] Verify Sentry query returns results
  - [ ] Verify Cloudflare query returns results
  - [ ] Verify PostHog event posted (check their webhook logs)
  - [ ] Verify Slack message posted to #ops (check thread)

---

## Success Criteria (By May 18)

- [x] SLO framework defined and ratified
- [ ] Metrics collection running consistently (all 3 runs successful)
- [ ] PostHog dashboard created and accepting events
- [ ] Slack notifications posting weekly (with expected format)
- [ ] Team views T5.1 as "operational" (not "experimental")
- [ ] First post-mortem scheduled (if any P1 incidents this week)
- [ ] On-call rotation practiced one incident scenario

---

## Handoff to Phase B Continuation

**Next Initiative:** T5.2 — Complete Observability  
**Focus:** End-to-end traceability from user action to operator recovery

**Dependencies on T5.1:**
- T5.1 establishes reliability targets; T5.2 ensures we have visibility to meet them
- T5.1 SLOs will feed into T5.2 dashboards (e.g., correlation ID tracing for failed payouts)

**Resources Needed:**
- PostHog (already wired; dashboards ready)
- Sentry (already wired; custom context ready)
- Correlation ID middleware (Factory package ready)

**Estimated Timeline (T5.2):**
- Design: 1 week (define traces + logging conventions)
- Implementation: 2 weeks (add context to workers, frontend, DLQ recovery)
- Validation: 1 week (trace sample incidents end-to-end)
- Total: 4 weeks (May 19 – June 15)

---

## Escalation & Support

**If metrics collection fails:**
1. Check GitHub Actions logs: `Latimer-Woods-Tech/videoking/.github/workflows/slo-collect.yml` _(workflow lives in videoking repo, not factory)_
2. Verify secrets are set correctly (see pre-deployment checklist)
3. Test manual collection: `node scripts/videoking-slo-collect.js`
4. Post to #ops if unresolved after 2 attempts

**If on-call runbook needs updates:**
1. File issue in GitHub
2. On-call lead + tech lead review
3. Update in real-time based on incident learnings
4. Quarterly review in post-mortem meeting

**If SLO targets are unrealistic:**
1. Document evidence (e.g., "Availability actually 99.3% consistently")
2. Post to #ops for discussion
3. Adjust targets in SLO_FRAMEWORK.md + GitHub
4. Communicate change to team + stakeholders

---

**Status:** ✅ **T5.1 COMPLETE — Ready for May 1 Deployment**

**Next Step:** Approve secrets configuration; deploy GitHub workflow; run dry run May 1; go-live May 12

