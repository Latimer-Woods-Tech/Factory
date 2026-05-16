# VideoKing Phase B Implementation — April 28 Kickoff

**Status:** ✅ READY FOR EXECUTION  
**Date:** April 28, 2026  
**Target Launch:** May 1, 2026  
**Reference App:** VideoKing

---

## What Was Built (Apr 28)

### T5.1: Service-Level Objectives (Initiative Complete)

Implemented a **production-grade SLO framework** with 4 key artifacts:

1. **SLO_FRAMEWORK.md** — Tier 1/2/3 service definitions
   - Tier 1: 99.9% uptime (video playback, auth, subscriptions)
   - Tier 2: 99.5% uptime (creator dashboard)
   - Tier 3: 99.0–99.9% uptime (operator APIs)
   - Error budgets: 43 min/month for Tier 1, 216 min/month for Tier 2
   - Latency targets: p95 < 200ms for public APIs
   - Alert thresholds: P1 (page), P2 (slack #ops), P3 (weekly standup)

2. **videoking-slo-collect.js** — Automated weekly metrics collection
   - Fetches availability, error rate, latency from Sentry + Cloudflare
   - Posts results to PostHog for historical tracking
   - Sends Slack #ops summary with trend analysis
   - Runs every Monday 9am UTC via GitHub Actions

3. **slo-collect.yml in videoking repo** — GitHub Actions workflow _(TBD — to be created in `Latimer-Woods-Tech/capricast`; moved out of factory 2026-05-09)_
   - Automated trigger (cron schedule) + manual trigger option
   - Authenticates to Sentry, Cloudflare, PostHog
   - Saves artifact for CI/CD visibility
   - Notifies on failure

4. **ON_CALL_RUNBOOK.md** — Incident response procedures
   - Alert escalation matrix (P1 → page on-call → backup on-call)
   - 5-phase incident workflow (Alert → Triage → Execute → Verify → Post-mortem)
   - Root cause decision tree (recent deployment? external service? DB issue?)
   - Post-mortem template + escalation protocol
   - Common incidents with quick resolutions

### Documentation & Messaging

5. **PHASE_B_T5_1_COMPLETE.md** — Comprehensive handoff to team
   - All deliverables listed with integration points
   - Baseline establishment plan (May 1–18)
   - Pre-deployment checklist (secrets, team setup, dry run)
   - Weekly cadence (Monday 10am UTC standup)
   - Success criteria (by May 18)

6. **PHASE_B_INDEX.md** — Phase B implementation roadmap
   - Full 3-month roadmap (May–July)
   - All initiatives sequenced with dependencies
   - Team roles and communication channels
   - FAQ for common questions
   - Links to all resources

---

## Why This Matters

**For VideoKing:**
- ✅ Reliability is now measurable: 99.9% uptime with 43-minute error budget per month
- ✅ Incidents are now structured: 5-phase response with clear escalation paths
- ✅ Operations are now visible: Weekly metrics + trending dashboard + SLO standup
- ✅ On-call is now coached: Runbook covers triage, diagnosis, escalation, post-mortem

**For New Apps:**
- VideoKing becomes the **canonical reference** for reliability operations
- All new apps will inherit VideoKing's SLO model, alert thresholds, incident response
- Factory support (T5.2: observability) will build on VideoKing's SLO framework

**For the Implementation Program (Phase B):**
- T5.1 unblocks 4 downstream initiatives:
  - T5.2 (Observability) — Build dashboards that track SLO targets
  - T5.3 (Incident Response) — Extend the runbook for other apps
  - T2.2 (Test Coverage) — Target tests to high-risk SLO endpoints
  - T3.2 (Payout Ops) — Ensure payout SLOs are met

---

## Deployment Timeline

### Week 1: May 1–7 (Setup & Validation)
- Deploy GitHub workflow + collection script
- Run manual collection daily to validate
- Post daily summaries to #ops (no alerts)
- Fix any data collection gaps

### Week 2: May 8–14 (Threshold Tuning)
- Validate metrics are stable
- Adjust alert thresholds if needed
- Enable P2/P3 alerts (not P1 yet)
- Prepare for go-live

### Week 3: May 15–21 (Go-Live)
- Enable all P1/P2/P3 alerts
- On-call practices incident scenarios
- First SLO standup (Monday May 12)
- Team shifts to operational mindset

---

## Pre-Deployment Checklist (by Apr 30)

### Secrets Configuration
- [ ] `SENTRY_AUTH_TOKEN` set in GitHub Secrets (Factory repo)
- [ ] `CF_API_TOKEN` verified (existing key is fine)
- [ ] `CF_ACCOUNT_ID` verified
- [ ] `POSTHOG_KEY` verified
- [ ] `SLACK_WEBHOOK_OPS` configured (for #ops channel)

### Team Readiness
- [ ] Tech lead: Reviewed SLO targets + signed off on 99.9% Tier 1 target
- [ ] Ops lead: Confirmed Sentry + Cloudflare API access
- [ ] On-call lead: Reviewed ON_CALL_RUNBOOK.md + understands escalation matrix
- [ ] PostHog admin: Created "VideoKing Health" dashboard (template provided)
- [ ] Slack: #ops channel exists + bot has permission to post

### Documentation Publishing (by Apr 29)
- [x] SLO_FRAMEWORK.md published to docs/videoking/
- [x] ON_CALL_RUNBOOK.md published to docs/videoking/
- [x] GitHub workflow deployed to .github/workflows/
- [x] Collection script deployed to scripts/
- [x] Kickoff documents published

### Dry Run (May 1)
- [ ] Run: `node scripts/videoking-slo-collect.js --week 2026-04-28`
- [ ] Verify: Sentry query returns results
- [ ] Verify: Cloudflare query returns results
- [ ] Verify: PostHog event created (check webhook logs)
- [ ] Verify: Slack message posted to #ops

---

## Success Criteria (by May 18)

- [ ] SLO collection runs 3/3 weeks successfully
- [ ] PostHog receiving events + dashboard shows trends
- [ ] Slack notifications posting to #ops weekly (expected format)
- [ ] Team treats T5.1 as "operational" (not experimental)
- [ ] On-call rotation has practiced at least 1 incident scenario
- [ ] Tech lead confident in SLO targets (no changes needed)

---

## Quick Links

| Resource | Purpose | Link |
|----------|---------|------|
| **SLO Framework** | Tier definitions, error budgets, alerts | [SLO_FRAMEWORK.md](docs/videoking/SLO_FRAMEWORK.md) |
| **On-Call Runbook** | Incident response + escalation | [ON_CALL_RUNBOOK.md](docs/videoking/ON_CALL_RUNBOOK.md) |
| **T5.1 Kickoff** | Comprehensive handoff to team | [PHASE_B_T5_1_COMPLETE.md](docs/videoking/PHASE_B_T5_1_COMPLETE.md) |
| **Phase B Index** | Full 3-month roadmap + dependencies | [PHASE_B_INDEX.md](docs/videoking/PHASE_B_INDEX.md) |
| **Metrics Script** | Weekly collection automation | [scripts/videoking-slo-collect.js](scripts/videoking-slo-collect.js) |
| **GitHub Workflow** | Automated trigger + notifications | `Latimer-Woods-Tech/capricast/.github/workflows/slo-collect.yml` (to create — moved out of factory 2026-05-09) |
| **Engineering Baseline** | Phase 4 architecture + risks | [videoking-engineering-baseline.mdx](docs/packages/videoking-engineering-baseline.mdx) |

---

## Next Steps (After May 18)

Once T5.1 is operational:

1. **T5.2: Observability Framework** (June 1–15)
   - Use SLO targets as reference
   - Build dashboards for correlation ID tracing
   - Add observability fixtures for new apps

2. **T2.2: Test Coverage** (June 1–15)
   - Target high-risk SLO endpoints
   - Add DLQ, payout, webhook tests
   - Bring coverage from 75% → 90%+

3. **T3.2: Payout Operations** (June 15 – July 1)
   - Use SLO framework + observability to design dashboard
   - Ensure payout SLOs are met (99.9% for payment APIs)

---

## Owner Assignments

| Component | Primary Owner | Backup |
|-----------|---------------|--------|
| **SLO Targets** | Tech Lead | Engineering Manager |
| **Metrics Collection** | Ops Engineer | Tech Lead |
| **Alert Configuration** | Ops Engineer | On-Call Lead |
| **Weekly Standup** | Tech Lead | Ops Lead |
| **Incident Response** | On-Call Rotation | Backup on-call |
| **Post-Mortems** | Tech Lead + Incident On-Call | Engineering Manager |

---

**Status:** ✅ ALL ARTIFACTS COMPLETE  
**Deployment Ready:** May 1, 2026  
**Go-Live Target:** May 12, 2026 (first automated collection + standup)  

**Next: Approve secrets + run dry run (May 1) → Deploy & go-live (May 12)**

