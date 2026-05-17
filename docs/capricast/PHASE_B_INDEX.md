# VideoKing Phase B Implementation Index

**Date:** April 28, 2026  
**Status:** Phase B (Standardize) Launched  
**Core App Reference:** NicheStream/VideoKing

---

## Phase B Mission

Establish VideoKing as a **canonical reference implementation** for Factory applications. All new apps will:
- Follow VideoKing's patterns (architecture, testing, operations)
- Meet VideoKing's quality standards (SLOs, observability, runbooks)
- Adopt VideoKing's tools (same monitoring, same incident response)

---

## Phase B Roadmap (May 1 – July 31, 2026)

### Immediate: May 1–31 (Week 1 Priority)

| Initiative | Owner | Dependencies | Target Date |
|-----------|-------|--------------|-------------|
| **T5.1 ✅** — SLOs & Error Budgets | Ops + Tech Lead | None | May 18 (deployed) |
| **T2.1 ✅** — Engineering Baseline Refresh | Tech Lead | Complete (released Apr 28) | May 5 (documentation) |
| **T4.1** — Factory Package Matrix | Tech Lead + Product | T2.1 output | May 15 |
| **T6.1** — Definition of Ready/Done | Engineering Manager | T2.1 baseline | May 15 |
| **T1.1** — Design Quality Rubric | Design Lead + Product | None | May 22 |

### Foundation: June 1–15 (2-week sprint)

| Initiative | Owner | Dependencies | Target Date |
|-----------|-------|--------------|-------------|
| **T2.2** — Money-Moving Test Coverage | Test Engineer + Eng | T5.1 SLOs, T2.1 baseline | June 15 (90%+ coverage) |
| **T5.2** — Observability Framework | Ops + Tech Lead | T5.1 SLOs | June 15 (dashboards live) |
| **T1.2** — Journey Maps (top 8 flows) | Design + Product | T1.1 rubric | June 15 (instrumentation backlog) |
| **T3.1** — Creator Onboarding Journey | Product + Design + Eng | T1.2 flows, T6.1 gates | June 15 (UX design) |

### Hardening: June 15 – July 15 (2-week sprint)

| Initiative | Owner | Dependencies | Target Date |
|-----------|-------|--------------|-------------|
| **T4.2** — Front-End Quality Standards | Design + Tech Lead | T1.1 rubric | July 1 |
| **T3.2** — Payout Ops Dashboard | Ops + Eng | T2.2 tests, T5.2 observability | July 1 (operator-grade) |
| **T6.2** — RFC + Design Review Process | Tech Lead + Engineering Mgr | T6.1 DoR/DoD | July 1 |

### Validation: July 15–31 (Final week)

| Initiative | Owner | Dependencies | Target Date |
|-----------|-------|--------------|-------------|
| **T5.3** — Incident Response Runbook | Ops + On-Call Lead | T5.1/T5.2 complete | July 20 (practiced) |
| **T4.3** — Operator Patterns Library | Design + Ops + Eng | T3.2 validated, T4.2 standards | July 25 |
| **Phase B Exit Criteria** | All | All above | July 31 |

---

## Current VideoKing Deliverables (✅ Complete)

### Engineering Baseline (Apr 28)
- **File:** [docs/packages/videoking-engineering-baseline.mdx](../packages/videoking-engineering-baseline.mdx)
- **Scope:** Post-Phase 4 architecture, tech stack, 92-table schema, DLQ + payout systems, audit fixes
- **Use:** Reference for T2.1, T4.1, T6.1
- **Status:** Production baseline established

### SLO Framework & Operations (Apr 28) — **NEW**
- **File:** [docs/videoking/SLO_FRAMEWORK.md](./SLO_FRAMEWORK.md)
- **Scope:** Tier 1/2/3 SLO definitions, error budgets, alert thresholds, weekly standup cadence
- **Use:** Reference for T5.1, T5.2, T5.3
- **Deployment:** May 1 (automated metrics collection begins)
- **Status:** Ready for production

### Metrics Collection Automation (Apr 28) — **NEW**
- **File:** [scripts/videoking-slo-collect.js](../../scripts/videoking-slo-collect.js)
- **Scope:** Weekly metric collection from Sentry + Cloudflare, PostHog + Slack posting
- **Trigger:** Every Monday 9am UTC
- **Workflow:** `Latimer-Woods-Tech/capricast/.github/workflows/slo-collect.yml` _(to be created in the videoking repo — moved out of factory 2026-05-09)_
- **Status:** Ready for deployment

### On-Call Incident Response (Apr 28) — **NEW**
- **File:** [docs/videoking/ON_CALL_RUNBOOK.md](./ON_CALL_RUNBOOK.md)
- **Scope:** P1/P2 alert response, 5-phase incident workflow, post-mortem template, escalation protocol
- **Use:** Reference for T5.1/T5.3; training for on-call rotations
- **Status:** Ready for team training

---

## T5.1: Service-Level Objectives (Apr 28 – May 18)

### Deliverables ✅ Complete

| Artifact | Purpose | Link | Status |
|----------|---------|------|--------|
| **SLO Framework** | Tier definitions, error budgets, alert rules | SLO_FRAMEWORK.md | ✅ Published |
| **Metrics Script** | Automated weekly collection | scripts/videoking-slo-collect.js | ✅ Ready |
| **GitHub Workflow** | Orchestrates collection + notifications | `Latimer-Woods-Tech/capricast/.github/workflows/slo-collect.yml` (TBD — moved to videoking 2026-05-09) | ⏳ To create in videoking |
| **On-Call Runbook** | Incident response procedures | ON_CALL_RUNBOOK.md | ✅ Published |
| **Kickoff Summary** | T5.1 handoff to team | PHASE_B_T5_1_COMPLETE.md | ✅ Published |

### Pre-Deployment Checklist

**Secrets (by Apr 30):**
- [ ] `SENTRY_AUTH_TOKEN` configured in GitHub Secrets
- [ ] `CF_API_TOKEN` verified (existing token OK)
- [ ] `CF_ACCOUNT_ID` verified
- [ ] `POSTHOG_KEY` verified
- [ ] `SLACK_WEBHOOK_OPS` configured

**Team Setup (by May 1):**
- [ ] Tech lead reviewed SLO targets + signed off
- [ ] Ops lead confirmed Sentry/Cloudflare access
- [ ] On-call lead reviewed runbook
- [ ] PostHog dashboard created (template ready)
- [ ] Slack #ops channel ready

**Dry Run (May 1):**
- [ ] Manual collection script run
- [ ] Sentry query validated
- [ ] Cloudflare query validated
- [ ] PostHog event posted
- [ ] Slack notification sent

**Go-Live (May 12):**
- [ ] Automated schedule enabled
- [ ] First automated collection runs (Monday 9am UTC)
- [ ] First SLO standup (Monday 10am UTC)
- [ ] Alerts enabled (P1, P2, P3)

### Success Metrics (by May 18)

- [x] SLO framework defined
- [ ] Metrics collection 3/3 runs successful
- [ ] PostHog dashboard receiving events
- [ ] Slack notifications posting weekly
- [ ] Team treats T5.1 as operational
- [ ] On-call practiced at least one scenario

---

## T2.1: Engineering Baseline Refresh (Apr 28 – May 5) — ✅ Complete

### Deliverables ✅ Published

| Artifact | Purpose | Link | Status |
|----------|---------|------|--------|
| **Baseline Doc** | Architecture, schema, tech stack, risks | videoking-engineering-baseline.mdx | ✅ Published Apr 28 |
| **Risk Register** | 5 HIGH, 5 MEDIUM, 3 LOW with mitigations | Included in baseline | ✅ Complete |
| **Test Gap Analysis** | Coverage baseline 75% lines, 68% branches | Included in baseline | ✅ Documented |
| **Tech Debt Catalog** | Video recommendations, chat persistence, moderation, streaming, analytics | Included in baseline | ✅ Documented |

### Use for Other Initiatives

- **T4.1 (Factory Package Matrix)** — Reference VideoKing's package dependencies for new apps
- **T2.2 (Test Coverage)** — Target gaps identified: DLQ, payouts, webhooks
- **T5.1/T5.2 (Observability)** — Use baseline as reference for instrumentation patterns
- **T6.1 (DoR/DoD)** — Use baseline's quality gates as template

---

## Next: T4.1 (May 5–15) — Factory Package Matrix

**Objective:** Map Factory packages to app delivery concerns; clarify ownership

**Input:** T2.1 baseline (VideoKing's current package usage)

**Output:** 
- Package-to-capability matrix (shared vs app-specific)
- Consumption guide for new apps
- Recommendation doc (which packages to use for what)

**Use by:**
- T4.2 (front-end standards)
- T6.1 (DoR/DoD gates)
- Each new app's scaffolding

---

## Implementation Team

### Core Roles

| Role | Name | Responsibilities |
|------|------|------------------|
| **Implementation Lead** | TBD | Overall coordination; timing; blocker removal |
| **Tech Lead** | TBD | Architecture, code review, SLO targets |
| **Ops Lead** | TBD | SLO standup, incident response, observer |
| **On-Call Rotation Lead** | TBD | Incident runbook training, escalation protocol |
| **Product Lead** | TBD | UX/design decisions, journey maps, KPIs |
| **Design Lead** | TBD | Design system, quality rubric, journeys |

### Communication

- **#ops**: Daily operational updates, incident threads, SLO announcements
- **#videoking-phase-b**: Week-by-week progress updates, blocker threads
- **Weekly Sync:** Tuesdays 2pm UTC (all Phase B leads)
- **Monthly Check-In:** Last Friday of month (leadership + team leads)

---

## Resources & Documentation

### VideoKing Docs (Canonical)
- [Engineering Baseline](../packages/videoking-engineering-baseline.mdx)
- [SLO Framework](./SLO_FRAMEWORK.md)
- [On-Call Runbook](./ON_CALL_RUNBOOK.md)
- [Phase B Kickoff](./PHASE_B_T5_1_COMPLETE.md)

### Factory Standing Orders
- [CLAUDE.md](../../CLAUDE.md) — Hard constraints, package order, quality gates
- [Quality Rubric Template](../runbooks/lessons-learned.md)
- [Deployment Checklist](../runbooks/deployment.md)

### External Dashboards
- **PostHog:** [VideoKing Health](https://app.posthog.com/dashboards) (TBD — to be configured)
- **Sentry:** [Tier 1 & 2 Board](https://sentry.io/organizations/factory/)
- **Cloudflare:** [Worker Analytics](https://dash.cloudflare.com/)
- **Neon:** [Database Console](https://console.neon.tech/)

---

## FAQ

**Q: When does Phase B start?**  
A: Phase B starts **May 1, 2026**. T5.1 metrics collection deploys that day.

**Q: Do all new apps need to follow VideoKing's patterns?**  
A: Yes. Phase B exists to make VideoKing the canonical reference. T4.1 will document which patterns are required (must-follow) vs optional (recommended).

**Q: What if SLO targets are unrealistic?**  
A: Document evidence + post to #ops. Adjust in real-time during first 2 weeks (May 1–14). Lock in targets by May 15.

**Q: Who gets paged for P1 incidents?**  
A: On-call engineer (on rotation). After 10 min unresolved: backup on-call + tech lead paged. See [ON_CALL_RUNBOOK.md](./ON_CALL_RUNBOOK.md) for escalation matrix.

**Q: How do I use VideoKing patterns in a new app?**  
A: Wait for T4.1 to publish (May 15). Then: clone VideoKing, delete app-specific code, keep scaffolding + patterns.

**Q: Can T5.1 be skipped?**  
A: No. T5.1 is foundational; T5.2 (observability) and T5.3 (incident response) depend on it. Other initiatives (T2.2, T3.1) also reference SLO targets.

---

**Last Updated:** April 28, 2026  
**Next Review:** May 19, 2026 (Phase B mid-point check-in)  
**Quarterly Review:** June 30, 2026 (Q2 retrospective)

