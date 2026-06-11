# Factory Core Documentation

**Welcome!** This directory contains the complete Factory Core framework: standards, runbooks, packages, and operational procedures.

## New to Factory? Start Here

1. **[DOCS_TRUTH_AND_GUARDRAILS.md](DOCS_TRUTH_AND_GUARDRAILS.md)** — How to decide what is current, verified, historical, or unsafe to cite.
2. **[Documentation Catalog](CATALOG.md)** — Generated inventory of canonical, active, archive, and generated docs.
3. **[Documentation Debt Index](_catalog/debt-index.md)** — Generated cleanup queue for drift and broken links, grouped by owner.
4. **[Documentation Control Plane Deployment Plan](runbooks/docs-control-plane-deployment.md)** — How the self-managed catalog, drift, diagram, and verification layer works.
5. **[CLAUDE.md](../CLAUDE.md)** — Standing Orders and Hard Constraints (read this before you code).
6. **[Getting Started](runbooks/getting-started.md)** — Set up local development.
7. **[IMPLEMENTATION_MASTER_INDEX.md](IMPLEMENTATION_MASTER_INDEX.md)** — Historical navigation hub; verify links and status before relying on it.

## For Different Roles

### Engineers Building Packages
- **[CLAUDE.md](../CLAUDE.md)** — Standing Orders, Hard Constraints, Package Dependency Order
- **[Definition of Ready & Done](runbooks/definition-of-ready-done.md)** — Quality gates for all work
- **[Lessons Learned](runbooks/lessons-learned.md)** — Common pitfalls and solutions

### App Developers
- **[App README Template](APP_README_TEMPLATE.md)** — Use this for your app's README
- **[Deployment](runbooks/deployment.md)** — How to deploy to staging and production
- **[Environment Isolation & Verification](runbooks/environment-isolation-and-verification.md)** — Prevent config mistakes

### Ops & On-Call
- **[SLO & Observability](runbooks/slo.md)** — Alert thresholds, incident tiers, monitoring setup
- **[Secret Rotation](runbooks/secret-rotation.md)** — Downtime-free secret rotation procedures
- **[Deployment](runbooks/deployment.md)** — Staging smoke tests and rollback procedures

### Product & Design
- **[WORLD_CLASS_IMPLEMENTATION_DASHBOARD.md](../WORLD_CLASS_IMPLEMENTATION_DASHBOARD.md)** — Strategic roadmap with 7 tracks
- **[Product Quality Review](runbooks/product-quality-review.md)** — How we review features before launch
- **[Design Standards](packages/design-standards.mdx)** — UI/UX baseline and component patterns

### First-Time Contributors
- **[START_HERE.md](../START_HERE.md)** — Quick orientation
- **[Getting Started](runbooks/getting-started.md)** — Local environment setup
- **[CLAUDE.md](../CLAUDE.md)** — Read the Hard Constraints section

---

## Document Map

### Planning & Roadmap
- [RFC-006: Cohesive Automation Flow Operating Model](rfc/RFC-006-automation-flow-operating-model.md) — Proposed target model and phased plan for work flow, Kanban, supervisor, telemetry, and workflow automation
- [WORLD_CLASS_IMPLEMENTATION_DASHBOARD.md](../WORLD_CLASS_IMPLEMENTATION_DASHBOARD.md) — Active implementation plan (7 tracks)
- [PHASE_6_CHECKLIST.md](../PHASE_6_CHECKLIST.md) — Infrastructure provisioning
- [Council Space](council/README.md) — Persistent inquiry workspace for cross-cutting review and decisions

### Quality & Process
- [Definition of Ready & Done](runbooks/definition-of-ready-done.md) — Work gates and PR checklists
- [Product Quality Review](runbooks/product-quality-review.md) — Review workflow before launch

### Operational Runbooks
- [Getting Started](runbooks/getting-started.md)
- [Add New App](runbooks/add-new-app.md)
- [Database](runbooks/database.md)
- [Deployment](runbooks/deployment.md)
- [Environment Isolation & Verification](runbooks/environment-isolation-and-verification.md)
- [GitHub Secrets & Tokens](runbooks/github-secrets-and-tokens.md)
- [Secret Rotation](runbooks/secret-rotation.md)
- [SLO & Observability](runbooks/slo.md)
- [App Transfer](runbooks/transfer.md)
- [Lessons Learned](runbooks/lessons-learned.md)

### Standards & Baselines
- [Design Standards](packages/design-standards.mdx)
- [videoking Engineering Baseline](packages/videoking-engineering-baseline.mdx)
- [User Journeys & Telemetry](packages/journeys.mdx)
- [Service Registry](service-registry.yml)

### Reference
- [IMPLEMENTATION_MASTER_INDEX.md](IMPLEMENTATION_MASTER_INDEX.md) — Master navigation
- [DOCS_TRUTH_AND_GUARDRAILS.md](DOCS_TRUTH_AND_GUARDRAILS.md) — Source-of-truth order and anti-hallucination rules
- [Documentation Catalog](CATALOG.md) — Generated status, owner, fidelity, and freshness index
- [Canonical Docs](CANONICAL_DOCS.md) — Generated allowlisted trusted-doc view
- [Documentation Debt Index](_catalog/debt-index.md) — Generated owner-routed cleanup queue
- [Documentation Control Plane Deployment Plan](runbooks/docs-control-plane-deployment.md) — Rollout plan for generated catalog, docs graph, drift detection, and diagram contracts
- [DOCS_OWNERSHIP.md](DOCS_OWNERSHIP.md) — Who owns each doc, update cadence
- [App README Template](APP_README_TEMPLATE.md)
- [ENVIRONMENT_VERIFICATION_SETUP.md](ENVIRONMENT_VERIFICATION_SETUP.md)

---

## How to Find Something

**Use [IMPLEMENTATION_MASTER_INDEX.md](IMPLEMENTATION_MASTER_INDEX.md)** — it's organized by task and role.

Examples:
- "I'm building a new package" → See index
- "I need to deploy something" → See index
- "What's the current product strategy?" → See index

---

## Keeping Docs Fresh

See [DOCS_OWNERSHIP.md](DOCS_OWNERSHIP.md) and [DOCS_TRUTH_AND_GUARDRAILS.md](DOCS_TRUTH_AND_GUARDRAILS.md) for:
- Who owns each doc
- How often it gets reviewed
- How to propose changes
- What evidence is required before a doc can claim current system state

Dates are useful signals, but they are not proof. For service names, URLs, workflow behavior, package counts, and deployment status, prefer executable evidence and registry-backed validation over prose.

---

## Standards Enforced Here

All code and docs in Factory follow:
- **[CLAUDE.md](../CLAUDE.md)** — Standing Orders and Hard Constraints
- **[Definition of Ready & Done](runbooks/definition-of-ready-done.md)** — Work quality gates
- **TypeScript strict** — zero `any` in public APIs
- **Zero-config deployment** — environment isolation prevents mistakes

---

## Quick Links

- [Service Registry](service-registry.yml) — All Workers and Pages projects
- [Package Inventory](packages/) — Each @latimer-woods-tech/* package
- [GitHub Secrets & Tokens](runbooks/github-secrets-and-tokens.md) — Complete reference
- [Lessons Learned](runbooks/lessons-learned.md) — Common errors and fixes
