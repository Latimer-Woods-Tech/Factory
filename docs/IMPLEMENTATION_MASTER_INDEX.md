# Implementation Master Index

**Last Updated:** April 28, 2026  
**Audience:** Factory Core engineers, app developers, ops, product, and design teams

This is the single entry point for all Factory implementation docs. It replaces multiple scattered status files with one clear navigation hierarchy.

---

## Quick Links

**Starting a new project?** → [App README Template](APP_README_TEMPLATE.md)  
**Deploying for the first time?** → [Getting Started](runbooks/getting-started.md)  
**Choosing Factory packages?** → [Capability Matrix](packages/factory-capabilities-matrix.mdx) (decision tree + per-package guides)  
**Building frontend?** → [Frontend Standards](packages/frontend-standards.mdx) ([contribution guide](runbooks/frontend-contribution-guide.md))  
**Setting up money flow tests?** → [T2.2 + T5.2 Delivery](T2_2_T5_2_DELIVERY_COMPLETE.md) (regression tests + end-to-end observability)  
**Looking for status?** → [Implementation Scorecard](IMPLEMENTATION_SCORECARD.md) (28 initiatives tracked; Phase D closes May 10) or [WORLD_CLASS_IMPLEMENTATION_DASHBOARD](#planning--roadmap) for strategic context  
**Need runbooks?** → [Operational Runbooks](#operational-runbooks) below  
**Building a package?** → [Factory Packages](#factory-packages) below

---

## Planning & Roadmap

### Strategic Context
- **[WORLD_CLASS_IMPLEMENTATION_DASHBOARD.md](../WORLD_CLASS_IMPLEMENTATION_DASHBOARD.md)** — The active implementation plan with 7 tracks, phases, and KPIs. **This is the source of truth for what's being built and why.**
- **[PHASE_6_CHECKLIST.md](../PHASE_6_CHECKLIST.md)** — Infrastructure provisioning runbook (Neon, Hyperdrive, Sentry, PostHog)

### Quality Standards
- **[Design Standards & Rubrics](packages/design-standards.mdx)** — Visual language, accessibility baseline, component patterns
- **[Engineering Quality Rubric](packages/videoking-engineering-baseline.mdx)** — Code review criteria, performance budgets, testing expectations
- **[Frontend Quality Standards](packages/frontend-standards.mdx)** — TypeScript strict mode, component design patterns, testing targets, accessibility (WCAG 2.2 AA), Web Vitals, ESLint config
- **[Frontend Contribution Guide](runbooks/frontend-contribution-guide.md)** — Setup, testing, building, debugging, and deployment for frontend teams
- **[Factory Capabilities Matrix](packages/factory-capabilities-matrix.mdx)** — Decision tree for "build vs. consume", per-package capabilities, Videoking usage patterns
- **[Definition of Ready & Done](runbooks/definition-of-ready-done.md)** — Gates that prevent ambiguous work starts and weak finishes
- **[T2.2 + T5.2 Delivery Complete](T2_2_T5_2_DELIVERY_COMPLETE.md)** — Money flow regression tests (95%+ coverage), end-to-end observability with correlation IDs, test fixtures, templates, and debugging guides

### User Journeys & Flows
- **[User Journeys & Telemetry](packages/journeys.mdx)** — Critical paths (signup, payment, creator onboarding, etc.) with instrumentation and KPIs
- **[SelfPrime × VideoKing Synergy Development Plan](SELFPRIME_VIDEOKING_SYNERGY_DEVELOPMENT_PLAN.md)** — Complete architecture, environment ownership, phased delivery, and governance plan for applying VideoKing patterns to SelfPrime through Factory shared infrastructure

---

## Baseline & Current State

### Application Architecture
- **[videoking Engineering Baseline](packages/videoking-engineering-baseline.mdx)** — Current production app state, component inventory, known issues

### Infrastructure Status
- **[Service Registry](service-registry.yml)** — Cloudflare Workers, Pages projects, URLs, health checks, rename procedures, and Factory Packages inventory (22 packages with status, dependencies, and Videoking usage)
- **[Package Inventory](packages/)** — README and docs for each @latimer-woods-tech/* package

---

## Process & Governance

### Definition of Work
- **[Definition of Ready & Done](runbooks/definition-of-ready-done.md)** — Checklists that gate work start and completion
- **[Product Quality Review Process](runbooks/product-quality-review.md)** — How design, product, and ops review features before launch

### Releasing & Deploying
- **[Deployment Runbook](runbooks/deployment.md)** — Staging vs. production, smoke tests, health checks, rollback
- **[Environment Isolation & Verification](runbooks/environment-isolation-and-verification.md)** — How config prevents environment mixups

### Managing Secrets & Auth
- **[GitHub Secrets & Tokens Reference](runbooks/github-secrets-and-tokens.md)** — Complete inventory, naming conventions, rotation schedule
- **[Secret Rotation Procedures](runbooks/secret-rotation.md)** — How to rotate JWT, DATABASE_URL, API keys without downtime

### Observability & Incidents
- **[SLO Framework](runbooks/slo-framework.md)** — Core SLO concepts, SLI vs. SLO vs. error budget, quarterly review cadence
- **[Videoking SLO Targets](videoking/slo-targets.md)** — Tier 1 / 2 / 3 SLOs, error budget policy, measurement methods
- **[Error Budget Policy](runbooks/error-budget-policy.md)** — Code freeze triggers, postmortem requirements, seasonal adjustments
- **[SLO Dashboard Template](dashboards/slo-dashboard-template.yaml)** — Grafana/Datadog/CloudWatch panel configs for real-time monitoring
- **[SLO Runbook (Legacy)](runbooks/slo.md)** — Quick reference; see framework above for comprehensive guidance

### RFC & Design Review Process
- **[RFC Process](runbooks/rfc-process.md)** — When to file, review lifecycle, acceptance criteria, status tracking
- **[RFC Template](templates/RFC_TEMPLATE.md)** — Template for filing new RFCs; includes problem, solution, impact, success criteria
- **[Design Review Checklist](runbooks/design-review-checklist.md)** — Accessibility, responsive design, error states, instrumentation requirements
- **[Published RFCs](rfc/)** — Live RFC repository
  - [RFC-001: Payout Batching Fix](rfc/RFC-001-payout-batching-fix.md) — Historical example (implemented March 2026)
  - [RFC-002: Creator Onboarding Journey](rfc/RFC-002-creator-onboarding-redesign.md) — In review; target Q2 2026 ship
  - [RFC-006: Cohesive Automation Flow Operating Model](rfc/RFC-006-automation-flow-operating-model.md) — Proposed control-plane and operational-flow maturity plan

### Documentation Ownership
- **[DOCS_OWNERSHIP.md](DOCS_OWNERSHIP.md)** — Who owns each doc, update cadence, how to propose changes

---

## Track Implementation & Phase D Completion (T4–T7)

### T4: Platform Enablement

**T4.3 — Building Operator Interfaces**
- **[Operator UI Pattern Library](packages/operator-ui-patterns.mdx)** — 10 reusable patterns (tables, filters, actions, status displays, forms, empty states, loading states, error states, audit trails, runbook callouts)
- **Usage:** All new operator surfaces (admin-studio, Finance, Creator ops) implement these patterns
- **Status:** Phase D (Live in videoking)

**T4.4 — Factory Admin Integration**
- **[Factory Admin Telemetry Contract](packages/factory-admin-telemetry-contract.mdx)** — Standardized `/api/admin/health`, `/api/admin/metrics`, `/api/admin/events` that every app exposes
- **[Factory Admin App Integration](integration/factory-admin-app-integration.md)** — Portfolio dashboard consuming app telemetry
- **Status:** Phase D (Contract defined; endpoints ready in videoking)

### T5: Reliability, Security, Observability

**T5.3 — Incident Response & Release Management**
- **[Incident Response Playbook](runbooks/incident-response-playbook.md)** — Severity levels (P1/P2/P3), triage script, escalation, communication templates
- **[Rollback Runbook](runbooks/rollback-runbook.md)** — Worker rollback, database restore, feature flag reset procedures
- **[Postmortem Template](templates/POSTMORTEM_TEMPLATE.md)** — Blameless incident review structure (what happened, root cause, action items)
- **[Postmortem Sync Agenda](runbooks/postmortem-sync-agenda.md)** — Meeting format for P1/P2 incidents (24–48h after resolution)
- **[Incident Metrics Dashboard](dashboards/incident-metrics-template.yaml)** — MTTR, MTTD, incident trends, RCA tracking
- **Status:** Phase D (Playbooks live; drills scheduled)

**T5.4 — Security & Privacy Review**
- **[Security Review Checklist](runbooks/security-review-checklist.md)** — 10 categories (auth, data protection, payments, sessions, abuse prevention, secrets, logging, infrastructure, errors, compliance)
- **[Example: videoking Security Audit](videoking/security-audit-report.md)** — Checklist applied; 91% passing; action items tracked
- **[Privacy Audit Report](videoking/privacy-audit-report.md)** — GDPR compliance, consent, retention, incident response
- **[Security Fixes Roadmap](videoking/security-fixes-roadmap.md)** — Issues found + remediation timeline
- **Status:** Phase D (Audit complete; fixes in flight)

### T6: Delivery Process & Release Governance

**T6.3 — Release Train & Verification**
- **[Release Procedure](runbooks/release-procedure.md)** — Staging deployment → canary (10% traffic, 30 min) → production (100%)
- **[Pre-Release Checklist](templates/PRE_RELEASE_CHECKLIST.md)** — Code, tests, docs, performance, security, database, stakeholder approvals
- **[Smoke Test Template](templates/smoke-test-template.md)** — Critical paths (login, create, subscribe, unlock, payout)
- **[Rollback Plan](runbooks/rollback-plan.md)** — Auto-rollback triggers + manual decision tree
- **[Release Calendar](calendars/release-schedule.md)** — Scheduled releases (biweekly), on-demand policy, blackout dates, on-call schedule
- **Status:** Phase D (Procedure live; canary tested; auto-rollback ready)

**T6.4 — Delivery KPIs & Metrics**
- **[Delivery KPIs Dashboard](dashboards/delivery-kpis-template.yaml)** — 4 key metrics (lead time, deployment frequency, change failure rate, MTTR) with targets + trends
- **[Metrics Tracking Script](scripts/track-delivery-metrics.mjs)** — GitHub API integration; weekly reports to Slack
- **[KPI Target Setting](runbooks/delivery-kpi-targets.md)** — By role + team; quarterly reviews; adjustments for business priority
- **[Retrospective Template](templates/RETROSPECTIVE_TEMPLATE.md)** — Sprint goals, KPI trends, what went well / could improve, action items
- **Status:** Phase D (Dashboard live; weekly reporting starting)

### T7: Documentation & Knowledge Management

**T7.2 — App Documentation Refresh**
- **[videoking README](../apps/videoking/README.md)** — Current features (DLQ, payout batching, creator onboarding, revenue ops), setup, deployment, troubleshooting
- **[videoking ENGINEERING.md](../apps/videoking/ENGINEERING.md)** — Tech stack, code organization, development workflow, testing strategy, deployment process
- **[videoking Runbooks](../docs/videoking/):**
  - [Video Transcoding Runbook](videoking/VIDEO_TRANSCODING_RUNBOOK.md) — Debugging stalled jobs, scaling, monitoring
  - [Durable Objects Runbook](videoking/DURABLE_OBJECTS_RUNBOOK.md) — Real-time features, scaling, connection limits
  - [Database Operations](videoking/DATABASE_OPERATIONS.md) — Migrations, backups, schema changes, troubleshooting
- **[videoking API Documentation](videoking/API.md)** — All endpoints, auth + rate limiting, webhooks, error codes
- **[videoking Architecture Decision Records](videoking/adr/):**
  - [ADR-001: Durable Objects vs. WebSockets + Redis](videoking/adr/ADR-001-durable-objects.md)
  - [ADR-002: Stripe Connect for Payouts](videoking/adr/ADR-002-stripe-connect.md)
  - [ADR-003: Payout Batching + DLQ](videoking/adr/ADR-003-payout-batching.md)
- **Status:** Phase D (All app docs current; ADRs documented)

**T7.3 — Portfolio Scorecard & Stakeholder Reporting**
- **[Implementation Scorecard](IMPLEMENTATION_SCORECARD.md)** — Status of all 28 initiatives (Phase, owner, % complete, exit criteria); risk register; metrics vs. target; next actions
- **[Scorecard Automation Script](scripts/generate-scorecard.mjs)** — GitHub API integration; generates markdown scorecard; posts weekly to #project-status
- **[Portfolio Dashboard](dashboards/implementation-scorecard-template.yaml)** — Pie chart (% complete/in progress/planned), Gantt (28 initiatives with dates), risk register, KPI trends
- **[Stakeholder Report Template](STAKEHOLDER_REPORT_TEMPLATE.md)** — Executive summary (3 key updates + 1 risk), initiative snapshot, metrics, next priorities; published monthly
- **Status:** Phase D (Scorecard live; automated updates weekly starting)

---

## Portfolio Health at a Glance

**Overall Progress:** 185 of 196 initiatives complete (94%)

| Track | Phase | Status | Key Docs |
|-------|-------|--------|----------|
| **T1: Product & UX** | Complete | ✅ | [Journeys](packages/journeys.mdx), [Design System](packages/design-standards.mdx) |
| **T2: Engineering** | Complete | ✅ | [Architecture](packages/videoking-engineering-baseline.mdx), [Quality Gates](runbooks/definition-of-ready-done.md) |
| **T3: Monetization** | Complete | ✅ | [Creator Onboarding](videoking/), [Payouts](videoking/), [Revenue Ops](videoking/slo-targets.md) |
| **T4: Platform** | Final Sprint | 🟡 90% | [Operator Patterns](packages/operator-ui-patterns.mdx), [Telemetry Contract](packages/factory-admin-telemetry-contract.mdx) |
| **T5: Reliability** | Final Sprint | 🟡 93% | [Incident Response](runbooks/incident-response-playbook.md), [Security](runbooks/security-review-checklist.md) |
| **T6: Delivery** | Final Sprint | 🟡 93% | [Release Procedure](runbooks/release-procedure.md), [KPIs](dashboards/delivery-kpis-template.yaml) |
| **T7: Docs** | Final Sprint | 🟡 92% | [App Docs](../apps/videoking/), [Scorecard](IMPLEMENTATION_SCORECARD.md) |

**Risk Summary:** All high-severity risks have clear mitigation plans. Phase D closes May 10, 2026.

See: [Full Implementation Scorecard](IMPLEMENTATION_SCORECARD.md) for detailed tracking

---

## Operational Runbooks

Quick reference for common tasks:

| Task | Runbook |
|------|---------|
| First-time local dev setup | [Getting Started](runbooks/getting-started.md) |
| Add a new standalone app | [Add New App](runbooks/add-new-app.md) |
| Database schema changes | [Database & Migrations](runbooks/database.md) |
| Deploy a Worker or Pages project | [Deployment](runbooks/deployment.md) |
| Rotate a secret (JWT_SECRET, DB_URL, etc.) | [Secret Rotation](runbooks/secret-rotation.md) |
| Transfer an app out of Factory | [App Transfer](runbooks/transfer.md) |
| Common issues & fixes | [Lessons Learned](runbooks/lessons-learned.md) |
| Respond to a production incident | [Incident Response Playbook](runbooks/incident-response-playbook.md) → [Rollback Runbook](runbooks/rollback-runbook.md) → [Postmortem Template](templates/POSTMORTEM_TEMPLATE.md) |
| Release to production | [Release Procedure](runbooks/release-procedure.md) with [Pre-Release Checklist](templates/PRE_RELEASE_CHECKLIST.md) and [Smoke Tests](templates/smoke-test-template.md) |

---

## Factory Packages

### Foundation Layer

| Package | Purpose | Owner | Status |
|---------|---------|-------|--------|
| [@latimer-woods-tech/errors](packages/errors/) | Custom error types with context | Factory | Stable |
| [@latimer-woods-tech/monitoring](packages/monitoring/) | Sentry integration and error reporting | Factory | Stable |
| [@latimer-woods-tech/logger](packages/logger/) | Structured logging with context | Factory | Stable |

### Platform Layer

| Package | Purpose | Owner | Status |
|---------|---------|-------|--------|
| [@latimer-woods-tech/auth](packages/auth/) | JWT auth with Web Crypto API | Factory | Stable |
| [@latimer-woods-tech/neon](packages/neon/) | Neon Postgres via Hyperdrive | Factory | Stable |
| [@latimer-woods-tech/deploy](packages/deploy/) | Build and deployment automation | Factory | Stable |
| [@latimer-woods-tech/testing](packages/testing/) | Mock factories and test helpers | Factory | Stable |

### Integration Layer

| Package | Purpose | Owner | Status |
|---------|---------|-------|--------|
| [@latimer-woods-tech/stripe](packages/stripe/) | Stripe payments and subscriptions | Factory | Phase 3 |
| [@latimer-woods-tech/llm](packages/llm/) | Anthropic + Grok + Groq chain | Factory | Phase 3 |
| [@latimer-woods-tech/telephony](packages/telephony/) | Telnyx + Deepgram + ElevenLabs | Factory | Phase 4 |
| [@latimer-woods-tech/analytics](packages/analytics/) | PostHog + factory_events schema | Factory | Phase 3 |
| [@latimer-woods-tech/email](packages/email/) | Resend integration | Factory | Phase 3 |
| [@latimer-woods-tech/video](packages/video/) | Cloudflare Stream + R2 wrappers | Factory | Phase 5 |
| [@latimer-woods-tech/schedule](packages/schedule/) | Video production calendar + scoring | Factory | Phase 5 |

### Product Layer

| Package | Purpose | Owner | Status |
|---------|---------|-------|--------|
| [@latimer-woods-tech/compliance](packages/compliance/) | Regulatory standards, consent, audit | Factory | Phase 4 |
| [@latimer-woods-tech/crm](packages/crm/) | Relationship management surface | Factory | Phase 5 |
| [@latimer-woods-tech/admin](packages/admin/) | Admin dashboard + analytics | Factory | Phase 4 |
| [@latimer-woods-tech/content](packages/content/) | Content catalog and distribution | Factory | Phase 5 |
| [@latimer-woods-tech/copy](packages/copy/) | Copy generation and templates | Factory | Phase 4 |
| [@latimer-woods-tech/social](packages/social/) | Social sync and publishing | Factory | Phase 5 |
| [@latimer-woods-tech/seo](packages/seo/) | SEO utilities and metadata | Factory | Phase 4 |

**Status Legend:** Stable = production-ready; Phase N = in development; To Do = not started

---

## The 7 Implementation Tracks

From [WORLD_CLASS_IMPLEMENTATION_DASHBOARD.md](../WORLD_CLASS_IMPLEMENTATION_DASHBOARD.md):

| Track | Objective | Lead | Key Docs |
|-------|-----------|------|----------|
| T1 | Product + UX Operating System | Product + Design | [Product Quality Review](runbooks/product-quality-review.md), [Journeys](packages/journeys.mdx) |
| T2 | Core App Engineering Excellence | Core App Tech Lead | [Definition of Done](runbooks/definition-of-ready-done.md), [Baseline](packages/videoking-engineering-baseline.mdx) |
| T3 | Monetization + Operator Maturity | Product + Payments | [App README Template](APP_README_TEMPLATE.md) |
| T4 | Factory Platform Enablement | Platform Lead | [Service Registry](service-registry.yml), [Packages](#factory-packages) |
| T5 | Reliability, Security, Observability | Platform + Ops | [SLO](runbooks/slo.md), [Environment Verification](runbooks/environment-isolation-and-verification.md) |
| T6 | Delivery Process & Release Governance | Tech Lead / EM | [Definition of Ready & Done](runbooks/definition-of-ready-done.md), [Deployment](runbooks/deployment.md) |
| T7 | Documentation & Knowledge Mgmt | Tech Writing | [This file](.), [DOCS_OWNERSHIP.md](DOCS_OWNERSHIP.md) |

---

## Finding Docs When You Need Them

### "I'm building a new package for Factory"
1. Check [CLAUDE.md](../CLAUDE.md) Hard Constraints and Standing Orders
2. Review Package Dependency Order in [CLAUDE.md](../CLAUDE.md) to find your position
3. Use [App README Template](APP_README_TEMPLATE.md) as a guide for your package-level README
4. Follow [Definition of Ready & Done](runbooks/definition-of-ready-done.md) for all work
5. Add docs to [packages/{your-package}/README.md](packages/)

### "I'm deploying a Worker or Pages project"
1. Start with [Getting Started](runbooks/getting-started.md) for local setup
2. Use [Deployment](runbooks/deployment.md) to understand staging vs. production
3. Reference [Environment Isolation & Verification](runbooks/environment-isolation-and-verification.md) to ensure right config
4. Add your service to [Service Registry](service-registry.yml) if it's new
5. Follow [Deployment](runbooks/deployment.md) smoke test procedure before prod

### "I'm consuming Factory packages in my app"
1. Start with [Factory Capabilities Matrix](packages/factory-capabilities-matrix.mdx) to find the right packages (decision tree included)
2. Read the per-package consumption guides:
   - **Auth & RBAC:** [auth-consumption-guide.mdx](packages/auth-consumption-guide.mdx)
   - **Database & ORM:** [neon-consumption-guide.mdx](packages/neon-consumption-guide.mdx)
   - **Payments & Subscriptions:** [stripe-consumption-guide.mdx](packages/stripe-consumption-guide.mdx)
   - **Analytics & Events:** [analytics-consumption-guide.mdx](packages/analytics-consumption-guide.mdx)
   - **Error Tracking & Monitoring:** [monitoring-consumption-guide.mdx](packages/monitoring-consumption-guide.mdx)
3. Check [CLAUDE.md](../CLAUDE.md) for Standing Orders and dependency order constraints
4. Follow [Definition of Ready & Done](runbooks/definition-of-ready-done.md) before starting work

### "I need to understand the current product state"
1. Read [WORLD_CLASS_IMPLEMENTATION_DASHBOARD.md](../WORLD_CLASS_IMPLEMENTATION_DASHBOARD.md) for strategic direction
2. Check [videoking Engineering Baseline](packages/videoking-engineering-baseline.mdx) for app-level architecture
3. Review [User Journeys](packages/journeys.mdx) for critical paths and KPIs
4. See [Design Standards](packages/design-standards.mdx) for UI/UX baseline

### "I'm building a frontend application or component"
1. Read [Frontend Quality Standards](packages/frontend-standards.mdx) for design patterns, testing targets, accessibility, and performance gates
2. Follow [Frontend Contribution Guide](runbooks/frontend-contribution-guide.md) for setup, testing, building, and deployment
3. Use [Design Standards](packages/design-standards.mdx) as your design system baseline
4. Run ESLint, type-check, and tests before committing (see contribution guide for commands)
5. Aim for ≥90% test coverage, WCAG 2.2 AA accessibility, and Web Vitals targets (LCP ≤2.5s, CLS <0.1)

### "I'm setting up a new environment or adding secrets"
1. Check [GitHub Secrets & Tokens Reference](runbooks/github-secrets-and-tokens.md) for naming conventions
2. Follow [Secret Rotation](runbooks/secret-rotation.md) if rotating existing secrets
3. Use [Environment Isolation & Verification](runbooks/environment-isolation-and-verification.md) to validate setup

### "Something is broken; what do I do?"
1. Check [Lessons Learned](runbooks/lessons-learned.md) for common errors and solutions
2. Review [SLO & Observability](runbooks/slo.md) for alert classification
3. Find the relevant runbook under [Operational Runbooks](#operational-runbooks)
4. If not listed, file an issue and update this index

---

## Documentation Standards

All docs in this directory follow these standards:

- **Freshness:** Each document has a "Last Updated" date at the top
- **Ownership:** See [DOCS_OWNERSHIP.md](DOCS_OWNERSHIP.md) for who maintains each doc
- **Update Cadence:** See [DOCS_OWNERSHIP.md](DOCS_OWNERSHIP.md) for how frequently each doc is reviewed
- **Link Strategy:** Relative links only; paths are workspace-relative
- **Status Badges:** New docs should indicate Phase (Phase 3, Phase 4, etc.)

---

## Keeping This Index Up to Date

When you:
- **Add a new runbook:** Add it to [Operational Runbooks](#operational-runbooks)
- **Add a new package:** Add it to the [Factory Packages](#factory-packages) table
- **Launch a new app:** Add it to [Service Registry](service-registry.yml)
- **Change a doc location or owner:** Update [DOCS_OWNERSHIP.md](DOCS_OWNERSHIP.md)
- **Update strategic direction:** Update [WORLD_CLASS_IMPLEMENTATION_DASHBOARD.md](../WORLD_CLASS_IMPLEMENTATION_DASHBOARD.md) then back-link here

See [DOCS_OWNERSHIP.md](DOCS_OWNERSHIP.md) for the update cadence and how to propose changes.

---

## Related Standards

- **[CLAUDE.md](../CLAUDE.md)** — Standing Orders, Hard Constraints, Package Dependency Order (the source of truth for Factory design decisions)
- **[START_HERE.md](../START_HERE.md)** — First-time contributor quickstart
