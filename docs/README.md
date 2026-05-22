# Factory Core Documentation

**Welcome!** This directory contains the complete Factory Core framework: standards, runbooks, packages, and operational procedures.

## New to Factory? Start Here

1. **[IMPLEMENTATION_MASTER_INDEX.md](IMPLEMENTATION_MASTER_INDEX.md)** — The single entry point for all docs. Tells you where to find what you need.
2. **[Getting Started](runbooks/getting-started.md)** — Set up local development in 5 minutes
3. **[CLAUDE.md](../CLAUDE.md)** — Standing Orders and Hard Constraints (read this before you code)

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

See [DOCS_OWNERSHIP.md](DOCS_OWNERSHIP.md) for:
- Who owns each doc
- How often it gets reviewed
- How to propose changes

Each doc has a "Last Updated" date at the top so you can see how current it is.

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
