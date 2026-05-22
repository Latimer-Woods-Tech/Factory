# World-Class Implementation Dashboard

**Last Updated:** May 21, 2026 (deployment coordination and registry validation docs refreshed)  
**Phase B Progress:** 28/28 (100% Complete) 🎉  
**Status:** Canonical execution dashboard, work register, and coordination process with current deployment alignment and executable registry guardrails  
**Scope:** Factory support platform + core application delivery model  
**Reference Core App:** `_external_reviews/videoking` as the current quality and operating baseline

---

## Executive Verdict

The current plan is a strong **delivery foundation**, but it is **not yet the best plan** for reaching a world-class product and platform.

What is strong today:
- Factory has real package boundaries, strong standing orders, and automation for provisioning and scaffolding.
- The core app has meaningful product depth, strong edge-native architecture, and solid monetization building blocks.
- Quality gates, documentation, and deployment patterns already exist.

What is still missing for world-class execution:
- A single operating model that connects **Factory support**, **core app delivery**, and **UI/UX quality**.
- A clearly documented separation between **shared platform responsibilities** and **app-specific responsibilities**.
- A design and product quality bar with measurable UX, accessibility, and conversion targets.
- A release and review process that treats product, design, analytics, reliability, and operations as one system.
- A dashboard that sequences the work by outcomes, not just by infrastructure or isolated features.

**Conclusion:** the plan needed improvement. This dashboard is the updated implementation plan.

## Current operational delta

Recent deployment-alignment work changed the control-plane state in ways that matter operationally even though it does not change the broader W360 roadmap:

- `webhook-fanout` is now deployed with real KV and D1 bindings, a verified `workers.dev` health endpoint, and a branded-domain route recorded in `docs/service-registry.yml`.
- `daily-brief` now has a dedicated deploy workflow instead of relying on manual/operator memory.
- `schedule-worker` and `synthetic-monitor` workflows now verify branded production domains instead of defaulting to `workers.dev` where a canonical custom domain already exists.
- `admin-studio` staging and production are now part of the validated local deploy surface; the workflow provisions required runtime secrets explicitly instead of depending on pre-existing Worker state.
- `lead-gen` deployment repair is complete and is now part of the validated local deploy surface.
- `factory-supervisor` production hostname reconciliation is complete and its deploy workflow now provisions the Slack secrets required by the live worker contract.
- `docs/service-registry.yml` is now enforced by CI rather than treated as advisory documentation only.
- The service-registry validator now covers workflow verification targets for all 9 local deploy workflows and contract alignment for 9 local Workers with zero exemptions.

Why this matters:

- The control plane now has an executable source of truth for the covered local Workers.
- Documentation, deploy workflows, and Wrangler config are materially harder to let drift apart.
- Future hardening can proceed one Worker at a time without reopening broad repo-wide policy work.
- The validator is now mature enough to deserve its own operating runbook instead of being documented only through status notes and coordination comments.

---

## North Star

**Current iteration north star:** World Class 360. The active execution queue is `docs/operations/WORLD_CLASS_360_TASK_DASHBOARD.md`.
For cross-cutting platform/control-plane hardening, use `docs/operations/W360_FACTORY_REPO_HARDENING_PLAN.md` as the detailed execution spec.

Build a portfolio system where each app can ship with:
- world-class user experience,
- production-grade reliability,
- measurable business performance,
- repeatable engineering discipline,
- and a Factory support layer that accelerates delivery without leaking app-specific logic into shared infrastructure.

---

## Planning Principles

1. **Product quality is a first-class requirement.** A platform is not world-class if the user journeys are confusing, inaccessible, or visually inconsistent.
2. **Shared infrastructure must stay shared.** Factory owns reusable capabilities, guardrails, and templates; apps own product-specific behavior and UX.
3. **Every roadmap item must end in a measurable outcome.** No vague “improve X” tasks.
4. **Operational excellence is part of product quality.** SLOs, incident handling, observability, and rollback must be designed up front.
5. **Design and engineering must move together.** No separate “polish later” track.
6. **Monetization systems require auditability.** Payouts, subscriptions, unlocks, and analytics need explicit operator workflows and regression protection.
7. **Documentation must match the actual delivery motion.** Status docs cannot drift behind reality.

---

## Responsibility Model

| Area | Factory Support Owns | Core Application Owns |
|---|---|---|
| Architecture guardrails | Worker patterns, auth patterns, analytics contracts, deploy templates, QA gates | Product-specific route design, state models, failure handling within domain workflows |
| Developer experience | Scaffold, CI templates, verification scripts, shared lint/type/test policy | App-specific test suites, app-level runbooks, feature-specific fixtures |
| Reliability | Monitoring package, error reporting package, release/runbook standards | App SLO implementation, alert thresholds, recovery flows, operator tooling |
| Design system | Shared design principles, accessibility baseline, tokens/process if reused across apps | Brand expression, journeys, copy hierarchy, component compositions |
| Data/analytics | Shared event schema conventions and instrumentation patterns | Product KPIs, experiment design, funnel definitions, growth loops |
| Monetization support | Shared Stripe/analytics primitives, audit conventions | Pricing UX, onboarding UX, payout ops, entitlement rules, operator review workflows |

---

## Current-State Review

### Factory Strengths
- Package discipline and dependency ordering are already documented and enforced.
- Provisioning and scaffolding automation are significantly ahead of most teams at this stage.
- Operational runbooks exist for secrets, deployment, environment verification, and migrations.

### Factory Gaps
- The roadmap is heavily infrastructure-centric and less explicit about product quality, design review, and operational cadence.
- There is no single implementation board connecting package evolution, app rollout, and UX standards.
- Shared front-end quality expectations are implied, not operationalized.

### Core App Strengths
- NicheStream/videoking already has meaningful depth in realtime, payments, ads, subscriptions, and operator flows.
- The codebase shows good platform instincts: structured logging, retries, idempotency, role-based middleware, and clear route separation.

### Core App Gaps
- The improvement tracker is now behind the latest Phase 4 work and should no longer be treated as the source of truth.
- Monetization is technically deeper than before, but still lacks a complete operator-grade workflow around onboarding, payout operations, and regression tests.
- UI/UX quality is not yet managed as a formal workstream with accessibility, consistency, and journey-level success metrics.

---

## What “World Class” Means Here

### Coding
- Stable architecture boundaries.
- Type-safe contracts end to end.
- Regression tests around every money-moving and identity-sensitive workflow.
- Performance budgets enforced in CI.
- ADRs for non-trivial design choices.

### Process
- Definition of Ready and Definition of Done are explicit.
- Each workstream has exit criteria, KPIs, and dependencies.
- Weekly operating rhythm includes product, design, engineering, and operations review.
- Release management includes canary/staging verification, rollback, and post-release review.

### UI/UX
- Clear design principles and a reusable component language.
- Accessibility is audited, not assumed.
- Critical journeys are instrumented and optimized.
- Surfaces feel intentional and premium, not merely functional.

---

## World-Class UI/UX Operating Plan

The missing step is not more isolated polish work. It is an operating model that ties design, frontend engineering, accessibility, performance, analytics, and release evidence into one system.

### Objective

Ship customer-facing and operator-facing surfaces that are:
- immediately understandable,
- premium in visual hierarchy and motion,
- WCAG 2.2 AA compliant on critical paths,
- performant on real mobile networks,
- instrumented for conversion and trust,
- and reusable across Factory apps without flattening brand identity.

### Non-Negotiable Outcomes

| Outcome | Required proof |
|---|---|
| Shared primitives exist and are used | `@latimer-woods-tech/design-tokens` and `@latimer-woods-tech/ui` own tokens + core primitives; apps consume instead of hardcoding repeated styles |
| Critical journeys are explicitly designed | Every app has journey maps with acceptance criteria for anonymous, authenticated, paid, and operator flows |
| Accessibility is enforced in CI and manually verified | axe, keyboard-path review, screen-reader spot checks, and breakpoint checks are attached to PR evidence |
| Performance is treated as a release gate | Lighthouse/Core Web Vitals budgets are defined per surface and regressions block merge or release |
| UX success is measurable | PostHog + `factory_events` capture funnel, trust, and failure events for each critical journey |
| Release evidence includes UX proof | Screenshots, a11y proof, mobile proof, and happy/sad path evidence are part of Definition of Done |

### System Architecture For UI/UX Quality

| Layer | Factory responsibility | App responsibility |
|---|---|---|
| Tokens | semantic colors, spacing, typography, motion, focus, density, breakpoints | brand palette choices within token constraints |
| Primitives | Button, Input, Label, Alert, Dialog, Toast, Tabs, Card, EmptyState, LoadingState | app-specific wrappers and composed product modules |
| Journey patterns | auth gate, checkout shell, dashboard shell, destructive-action confirmation, form validation pattern | information architecture, copy, domain-specific task flows |
| Quality gates | axe, Lighthouse, visual regression, interaction timing, mobile matrix, event schema validation | route-specific tests, product-specific fixtures, operator walkthroughs |
| Analytics | shared event naming conventions and funnel templates | app KPIs, experiment definitions, retention and conversion goals |

### Execution Workstreams

| Workstream | Scope | Owner disciplines | Exit criteria |
|---|---|---|---|
| UX-01 Foundations | Tokens, primitives, component API, accessibility defaults, motion rules | D03, D04, D09, D12 | `design-tokens` and `ui` packages exist with docs, tests, and at least Button/Input/Dialog/Toast/FormField/Card shipped |
| UX-02 Journey design | Journey maps and acceptance criteria for public, auth, checkout, dashboard, and operator flows | D02, D03, D04, D14 | Each critical flow has a journey spec, success metric, failure states, and test plan |
| UX-03 Quality gates | axe, Lighthouse, visual diff, breakpoint matrix, keyboard path automation | D04, D09, D10, D12 | CI blocks regressions on agreed routes and publishes evidence artifacts |
| UX-04 Instrumentation | funnel, trust, rage-click/drop-off, error, and success event coverage | D02, D10, D12, D14 | Every critical journey emits required events and missing events fail tests |
| UX-05 Product polish | copy hierarchy, loading/success/error states, empty states, mobile density, operator ergonomics | D03, D04, D05, D14 | Core routes meet rubric and usability review on desktop + mobile |
| UX-06 Governance | design review, RFC usage, Definition of Ready/Done enforcement, launch review | D01, D03, D06, D12, D13 | No UI work starts without journey criteria and no UI work closes without UX evidence |

### Marketplace Quality Scorecard

Every launch candidate should be scored against these dimensions before it is called world-class.

| Dimension | Minimum bar | World-class bar |
|---|---|---|
| Clarity | user identifies primary action in <= 2 seconds | user identifies primary action, fallback path, and trust signal immediately |
| Accessibility | WCAG 2.2 AA on critical routes | AA plus manual keyboard and screen-reader walkthrough evidence on all critical journeys |
| Performance | Lighthouse >= 85 and LCP <= 2.5s | Lighthouse >= 95, CLS <= 0.05, route transition feedback <= 100ms |
| Visual consistency | token usage and primitive reuse on core routes | coherent premium brand system with no ad-hoc exceptions on shipped routes |
| Trust | clear loading, success, error, and destructive-action states | trust states plus operator-safe recovery and audited money/auth flows |
| Conversion | funnels instrumented | funnels instrumented, benchmarked, and iterated with visible improvement targets |

### Release Gates For Any UI Surface

No customer-facing or operator-facing UI is release-ready until all of the following are true:
- Journey spec exists with happy path, sad path, edge cases, and KPI target.
- Design review references the rubric and breakpoint behavior.
- Tokens and primitives are used where applicable; ad-hoc styles are justified.
- axe passes with zero critical issues.
- Keyboard-only navigation is tested on all interactive routes.
- Lighthouse/mobile performance budget passes on target routes.
- Critical funnel and trust events are present and validated.
- Playwright or equivalent covers core happy path and at least one meaningful failure path.
- Direct HTTP verification and live smoke prove the deployed surface works.

### Delivery Sequence

| Phase | Goal | Concrete outputs |
|---|---|---|
| UX Phase 0 | Baseline and scoring | route inventory, journey inventory, current Lighthouse/a11y/mobile baselines, top 10 UX risks |
| UX Phase 1 | Shared foundation | `design-tokens`, `ui` primitives, usage guide, migration plan for SelfPrime/Admin Studio |
| UX Phase 2 | Route hardening | SelfPrime public/auth/dashboard polish, Admin Studio control-plane ergonomics, Xico shell patterns |
| UX Phase 3 | Measurement and regression gates | Lighthouse CI, visual regression, event verification, mobile matrix, screen-reader spot-check checklist |
| UX Phase 4 | Marketplace polish | trust cues, premium motion, empty states, onboarding refinement, conversion optimization backlog |

### Immediate Priority Order

1. Establish token and primitive packages so future UI work stops hardcoding styles per app.
2. Baseline SelfPrime, Admin Studio, and Xico critical journeys with measurable UX/performance/accessibility scores.
3. Add CI-grade Lighthouse and visual regression gates on the routes that already have Playwright and axe coverage.
4. Convert current route-level fixes into reusable patterns: auth gate, modal/dialog, feedback/toast, dashboard empty/loading/error states.
5. Make launch review require UX evidence alongside typecheck, test, deploy, and smoke evidence.

---

## Program Structure

The work is organized into seven coordinated tracks.

| Track | Objective | Primary Owner |
|---|---|---|
| T1 | Product + UX Operating System | Product + Design Lead |
| T2 | Core App Engineering Excellence | Core App Tech Lead |
| T3 | Monetization + Operator Maturity | Product + Payments Lead |
| T4 | Factory Platform Enablement | Platform Lead |
| T5 | Reliability, Security, and Observability | Platform + App Ops |
| T6 | Delivery Process and Release Governance | Engineering Manager / Tech Lead |
| T7 | Documentation and Knowledge Management | Tech Writing + Engineering |

---

## Phase Roadmap

### Phase A — Align and Baseline
**Goal:** establish one quality bar, one roadmap, and one delivery operating model.

Exit criteria:
- This dashboard is the active source of truth.
- Shared ownership boundaries are accepted.
- UX quality rubric, engineering quality rubric, and release rubric are documented.
- Current-state baselines are captured for reliability, performance, accessibility, and conversion.

### Phase B — Standardize the Platform and the Product Core
**Goal:** remove architectural ambiguity and bake in repeatable quality.

Exit criteria:
- Shared Factory support standards are mapped to app-level implementation guides.
- Core app journeys have documented contracts, tests, and observability.
- Design system primitives and accessibility standards are defined.

### Phase C — Raise User Experience and Monetization Quality
**Goal:** turn the system from “working” into “premium, trustworthy, and efficient.”

Exit criteria:
- Critical journeys are redesigned and instrumented.
- Monetization flows are operator-safe and test-protected.
- Conversion, trust, and retention UX are addressed as one system.

### Phase D — Operationalize and Scale
**Goal:** make the system repeatable across apps with measurable service quality.

Exit criteria:
- SLOs, support workflows, and release governance are active.
- Factory support improvements are reusable by additional apps.
- Dashboard metrics support portfolio-level decision-making.

### Phase E — SelfPrime × VideoKing Synergy Foundation
**Goal:** turn the SelfPrime × VideoKing synergy plan into a safe execution track without coupling either product runtime.

Exit criteria:
- Shared Factory video Workers are present in the service registry.
- `schedule-worker` and `video-cron` live `/health` checks return `200` via direct HTTP verification.
- SelfPrime product video work starts only after shared video scheduling, cron dispatch, secrets, and telemetry are reconciled.
- VideoKing remains a pattern source until its documented production URL and health endpoints are reconciled.

---

## Canonical Operating Model and Open Work Register

This section is the single place to answer: what exists, what is done, what is undone, what is not yet realized, and which agent owns updates.

### Source-of-Truth Rules

| Area | Canonical source | Update rule |
|---|---|---|
| Portfolio roadmap and open work | This dashboard | Only the coordinator agent updates roadmap status, open task state, and owner assignments |
| World Class 360 active task queue | `docs/operations/WORLD_CLASS_360_TASK_DASHBOARD.md` | This is the current iteration board for W360 items, immediate execution order, escaped work, and full Xico/Practitioner/Admin Studio slicing |
| Worker names, URLs, consumers, and rename safety | `docs/service-registry.yml` | Any worker rename or new hardcoded URL must update the registry in the same change |
| Admin Studio product plan | `docs/admin-studio/00-MASTER-PLAN.md` | Admin Studio features graduate here only after scope and exit criteria are known |
| Package dependency and standing constraints | `CLAUDE.md` | Treat as policy; do not duplicate or override elsewhere |
| Deployment and smoke verification procedures | `docs/runbooks/deployment.md` | Every deploy must end with direct HTTP verification, not only green CI |
| Session artifacts and one-off summaries | Root `*_SUMMARY.md` / `*_COMPLETE.md` files | Historical only; do not use as the live task board |

### Multi-Agent Coordination Process

1. One coordinator agent owns this dashboard and `MASTER_INDEX.md` / `PROJECT_STATUS.md` status references.
2. Specialist agents own bounded paths, for example one app, one package, or one workflow.
3. Specialist agents must not create new root-level summary files as task boards; they should report status back to the coordinator.
4. Before editing, every agent checks `git status`, recent commits, and this dashboard's ownership table.
5. Agents must not edit another agent's claimed paths unless the coordinator reassigns ownership.
6. Completion requires code merge, quality gates, docs update, service registry update if applicable, and direct endpoint verification for deployed services.
7. The working tree must not include generated dependency folders such as `node_modules/` or `dist/` in commits.

### Project, Repo, and Service Inventory

| Asset | Repo / path | Type | Current role | Status |
|---|---|---|---|---|
| Factory Core | `Latimer-Woods-Tech/factory` | Monorepo | Shared packages, Workers, docs, Admin Studio | Active control repo |
| wordis-bond | `Latimer-Woods-Tech/wordis-bond` | App repo | App scaffold target | Created; Phase 7 waits on Phase 6 gates |
| cypher-healing | `Latimer-Woods-Tech/cypher-healing` | App repo | App scaffold target | Created; Phase 7 waits on Phase 6 gates |
| prime-self | `Latimer-Woods-Tech/prime-self` | App repo / Worker | Reference app and SelfPrime runtime | Created; live Worker referenced in service registry |
| prime-self-ui | `Latimer-Woods-Tech/prime-self-ui` | Pages app | SelfPrime landing/front-end consumer | Registry consumer of `prime-self` |
| ijustus | `Latimer-Woods-Tech/ijustus` | App repo | App scaffold target | Created; Phase 7 waits on Phase 6 gates |
| the-calling | `Latimer-Woods-Tech/the-calling` | App repo | App scaffold target | Created; Phase 7 waits on Phase 6 gates |
| neighbor-aid | `Latimer-Woods-Tech/neighbor-aid` | App repo | App scaffold target | Created; Phase 7 waits on Phase 6 gates |
| admin-studio | `apps/admin-studio` | Worker | Factory browser control plane API | In progress; environment safety and API surface planned/partially implemented |
| admin-studio-ui | `apps/admin-studio-ui` | Pages/UI | Factory browser control plane UI | In progress; Functions tab and generated build artifacts present locally |
| studio-core | `packages/studio-core` | Shared package | Admin Studio types, manifests, smoke probes | In progress; uncommitted local changes exist |
| schedule-worker | `apps/schedule-worker` | Worker | Shared video job API | Deployed; `/health` returned `200` on Apr 29 |
| video-cron | `apps/video-cron` | Worker | Shared video dispatch cron | Deployed; `/health` returned `200` on Apr 29 |
| video-studio | `apps/video-studio` | Render templates | Remotion template source | Code complete enough for first render workflow path |
| videoking | `apps/videoking` / `_external_reviews/videoking` | Reference app | Monetization and video architecture pattern source | Pattern source only; no live `videoking.adrper79.workers.dev` endpoint |

### Open Work Register

| ID | Work item | Owner mode | Current state | Next verification |
|---|---|---|---|---|
| OWR-001 | Keep this dashboard as the live task board | Coordinator only | Active | Every status-changing PR updates this section |
| OWR-002 | Clean multi-agent collision risk | Coordinator + specialist agents | Required; multiple agents have touched overlapping areas | Assign path ownership before further edits |
| OWR-003 | Review uncommitted Admin Studio / Studio Core local changes | Admin Studio specialist | Required; local changes exist in `apps/admin-studio-ui` and `packages/studio-core` | Decide commit, stash, or discard before master updates |
| OWR-004 | Exclude generated dependency/build artifacts from commits | Coordinator | Required; local `node_modules/`, `dist/`, and build info are present | Ensure `.gitignore` coverage and do not stage generated files |
| OWR-013 | ~~Deploy synthetic-monitor to production~~ | Platform specialist | **DONE** `200 {"status":"ok"}` — April 29, 2026 | Cron running every 5 min |
| OWR-007 | ~~Trigger first `render-video.yml` end-to-end run~~ | Video platform specialist | **DONE** Stream UID `3cf60300e92ad73fe40f0ba7796553f0` — April 29, 2026 | Embed: `iframe.videodelivery.net/3cf60300e92ad73fe40f0ba7796553f0` |
| OWR-008 | ~~Set `LANDING_VIDEO_STREAM_UID` for SelfPrime~~ | SelfPrime specialist | **DONE** Secret set + Cloudflare Stream iframe wired into `selfprime.net` hero — April 29, 2026 | ✅ Full site deployed: CSS, JS, all pages + Stream embed live |
| OWR-014 | Fix `/login` and `/dashboard` 404s (Phase 1) | SelfPrime specialist | **DONE** `_redirects` added to `prime-self-ui`; `/login` → `/?modal=login 302`, `/dashboard` → `/?start=1 302` — April 29, 2026 | `curl -I selfprime.net/login` returns 302 ✅ |
| OWR-015 | Phase 2 Playwright smoke gate (14 tests, 3 browsers) | SelfPrime specialist | **DONE** `apps/prime-self-smoke` created; all 14 tests green across chromium-desktop, mobile-chrome, mobile-safari — April 29, 2026 | Run ID 25120316725 ✅ |
| OWR-016 | Phase 3 axe accessibility gate (6 pages, chromium) | SelfPrime specialist | **DONE** `tests/accessibility.spec.ts`; 0 critical/serious violations; `a11y` CI job added to smoke workflow — April 29, 2026 | Run ID 25120669481 ✅ |
| OWR-005 | ~~Run schedule-worker database migration~~ | Video platform specialist | **DONE** `{"migrated":true,"statements":6}` — April 29, 2026 | Run ID 25121132381, workflow `migrate-schedule-worker.yml` ✅ |
| OWR-006 | ~~Complete R2 bucket and production video storage secrets~~ | Infrastructure specialist | **DONE** R2 + Cloudflare Stream confirmed working — render-video run 25120264469 succeeded (R2 upload + Stream registration) — April 29, 2026 | All R2/Stream secrets live ✅ |
| OWR-009 | ~~Phase 6 infrastructure provisioning across app repos~~ | Infrastructure specialist | **DONE** All Hyperdrive IDs + connection strings confirmed in Factory secrets — April 29, 2026 | HYPERDRIVE_* secrets present for: wordis-bond, cypher-healing, ijustus, the-calling, neighbor-aid, prime-self, factory-core, xico-city ✅ |
| OWR-010 | Phase 7 app scaffolding validation | App agents | Waiting on Phase 6 completion | `phase-7-validate.js --all` passes |
| OWR-011 | Admin Studio command plane for GUI AI commands | Admin Studio specialist | Planned / partially scaffolded | Command schema, dry-run previews, audit logging, and branch-based PR flow implemented |
| OWR-012 | Function manifest adoption across apps | Platform + app agents | In progress in Studio Core concepts | Each live app exposes crawlable manifest with owner, auth, reversibility, SLO, and smoke probes |
| OWR-017 | Refresh active agent prompts for current execution model | Coordinator | **DONE** Active prompt index and success contracts added; stale Stage 1 prompts marked historical — April 29, 2026 | Future agents start from `prompts/README.md` and `prompts/AGENT_SUCCESS_CONTRACT.md` |
| OWR-018 | Restore `@latimer-woods-tech/llm` runtime dependency classification | Package specialist | **DONE locally** `errors` and `logger` restored to runtime dependencies; llm gates passed during lockfile regeneration — April 29, 2026 | Commit package fix and publish audit when ready |
| OWR-019 | Backfill `@latimer-woods-tech/llm` changelog and release evidence | Package specialist | **DONE locally** changelog documents `0.2.0`, provider failover, runtime deps, and verification — April 29, 2026 | Commit with OWR-018 and confirm publish readiness |
| OWR-020 | Add cross-package integration CI | Platform specialist | **DONE** package chain build and cross-package smoke passed locally and in Actions — April 29, 2026 | Run 25124117458 passed for `package-integration.yml`; keep workflow required for package-sensitive PRs |
| OWR-021 | Harden Admin Studio command-plane blockers | Admin Studio specialist | Required; auth, smoke auth, LLM-backed failure analysis, and UI tabs remain partially scaffolded | Real auth, protected smoke runner, code/AI/functions tab evidence, and audit tests pass |
| OWR-022 | Document workflow coordination and deployment gates | DevOps specialist | **MATRIX CREATED** `docs/operations/WORKFLOW_COORDINATION_MATRIX.md` documents critical workflows, deploy gates, coordination rules, and immediate workflow backlog; shared deploy-gate implementation still required | Deploy workflows reference common health-gate pattern and dashboard records run IDs/statuses |
| OWR-023 | Real-credential live-site auth e2e tests (prime-self-ui) | SelfPrime specialist | **DONE** `SMOKE_USER_EMAIL`/`SMOKE_USER_PASSWORD` secrets set; all localhost testing removed; `playwright.config.mjs` targets `selfprime.net` only; URL assertions fixed for Cloudflare clean URLs + `_redirects` chain — April 29, 2026 | Run ID 25123827532 ✅ all 4 tests green (invalid login, valid login + localStorage, dashboard redirect, public nav) |
| OWR-024 | WCAG 2.4.7 button focus indicators + form label verification | SelfPrime specialist | **DONE** Added 3px solid focus outline to all `.button` and `.icon-button` elements (outline: 3px solid rgba(126, 224, 198, 0.68); outline-offset: 2px); form labels already properly associated with inputs; deployed to production — April 29, 2026 | Run ID 25127216737 ✅ all tests green; `curl selfprime.net/assets/css/site.css | grep button:focus` confirms live |
| OWR-024 | Execute Practitioner Video Studio revenue ready-state plan | Coordinator + revenue specialist teams | **PLAN CREATED** `docs/revenue/PRACTITIONER_VIDEO_STUDIO_READY_STATE_PLAN.md` defines the cohesive best-practice buildout from verified video foundation to paid self-serve launch | Close phases in order: checkout/webhook/entitlements/credits → self-serve first render → dashboard/operator MVP → observability/cost/failure recovery → legal/trust → launch/acquisition |
| OWR-025 | Complete Xico City through World Class 360 | Coordinator + Xico specialist teams | **REVIEW UPDATED** `docs/revenue/XICO_CITY_TRANCHE_REVIEW.md` now supersedes MVP-only framing; transaction-ready MVP is the first proof gate, full 12-slice World Class 360 is the target | Stabilize CI/deps/routes/schema → deploy health/ready → auth/profile → host onboarding/catalog → discovery/booking checkout → reviews/subscriptions/payouts/curator tooling → compliance/PWA polish |
| OWR-026 | Operate from World Class 360 task dashboard | Coordinator + all specialist teams | **DASHBOARD CREATED** `docs/operations/WORLD_CLASS_360_TASK_DASHBOARD.md` loads W360-001 through W360-030, Xico full-build slices, Practitioner Video Studio slices, Admin Studio slices, docs hygiene, escaped items, and immediate execution order | Keep dashboard current as work closes; next close Xico repo stabilization and Practitioner Studio entitlement bridge |
| OWR-027 | Classify stale and canonical documents | Coordinator + docs specialist | **INDEX CREATED** `docs/DOCUMENT_STATUS_INDEX.md` classifies canonical, active reference, historical, and archive-candidate docs for the World Class 360 iteration | Add historical banners or archive folders after coordinator review |
| OWR-028 | Break World Class 360 work into disciplines | Coordinator + discipline leads | **DISCIPLINE MODEL CREATED** `docs/operations/WORLD_CLASS_360_DISCIPLINE_BREAKDOWN.md` defines D01-D14 and maps W360 items, apps, templates, standards, and evidence by discipline | Assign each W360 item a lead discipline, reviewer discipline, risk tier, and evidence requirement |
| OWR-029 | Expand W360 scope for all apps, templates, standards, and configs | Coordinator + platform/docs specialists | **SCOPE REVIEW CREATED** `docs/operations/WORLD_CLASS_360_SCOPE_GAP_REVIEW.md`; W360-031 through W360-038 added to the active dashboard | Close portfolio app registry, template pack, standards catalog, config normalization, app graduation gates, support runbooks, and brand/design system |
| OWR-030 | Build the world-class UI/UX operating plan and execution queue | Coordinator + UX/frontend/platform leads | **PLAN CREATED** in this dashboard under `World-Class UI/UX Operating Plan`; holistic system now defines outcomes, architecture layers, workstreams, release gates, and delivery sequence | Staff W360-039 through W360-045 and attach measurable UX evidence to each surface before calling it world-class |

### Confirmed Done / Undone / Unrealized

### April 29 Reassessment — Changes Since Prior Deep Dive

| Domain | What improved | Still unresolved | Recommendation | Evidence / verification |
|---|---|---|---|---|
| Live video platform | Schedule migration, R2/Stream path, first successful renders, SelfPrime Stream embed, and synthetic monitor are now proven | Failure replay and operator-facing render exception handling still need a durable workflow | Treat video as `verified` for happy path and keep failure recovery as open work | `render-video.yml` runs `25120264469` and `25122396643`; direct health checks returned `200` for `schedule-worker`, `video-cron`, and `synthetic-monitor` on Apr 29 |
| Prompting / agent success | Active prompts now exist for agent success contract, OWR coordination, Phase E video/revenue work, and Admin Studio command-plane work | Old Stage 1 prompts remain historical and should not drive current implementation | Require future agents to start from `prompts/README.md` and quote the relevant prompt contract in their plan | `prompts/README.md`, `prompts/AGENT_SUCCESS_CONTRACT.md`, `prompts/OWR_COORDINATOR_PROMPT.md`, `prompts/PHASE_E_VIDEO_REVENUE_PROMPT.md`, `prompts/ADMIN_STUDIO_COMMAND_PLANE_PROMPT.md` |
| Package dependency safety | `@latimer-woods-tech/llm` runtime dependency misclassification and changelog gap were corrected; cross-package smoke CI was added and passed | Keep the workflow active for package-sensitive PRs and publishing prep | Use the workflow as the runtime dependency drift gate before package publish-sensitive changes | `packages/llm/package.json`, `packages/llm/CHANGELOG.md`, `.github/workflows/package-integration.yml`, `scripts/package-integration-smoke.mjs`; llm lint/typecheck/test/build passed during `npm install` prepublish on Apr 29; local package chain build + smoke passed; Actions run 25124117458 passed |
| Smoke and accessibility | Prime Self smoke/a11y gates, synthetic monitor, and real-credential auth e2e (OWR-023) represent a stronger live-quality loop | Coverage is still uneven across apps; app-level analytics event verification is not a release gate | Make smoke/a11y/event proof mandatory for app launch gates | `apps/prime-self-smoke`, `.github/workflows/smoke-prime-self.yml`, `apps/synthetic-monitor`, `Latimer-Woods-Tech/prime-self-ui` run 25123827532 |
| Admin Studio | Control-plane requirements are now clearer and prompt-backed | Production command-plane safety remains incomplete: real auth, RBAC, dry-run, audit, smoke auth, UI tabs, and PR/deploy governance | Sequence Admin Studio work through the command-plane prompt; do not allow production mutation until safety model passes tests | `prompts/ADMIN_STUDIO_COMMAND_PLANE_PROMPT.md`, `apps/admin-studio`, `apps/admin-studio-ui`, `packages/studio-core` |
| Workflow operations | `render-video.yml` already has job-ID concurrency and successful run evidence | Workflow inventory, deployment dependencies, metric freshness, and recovery playbooks are not centralized | Create workflow coordination doc and pre-deploy health gate pattern | `.github/workflows/render-video.yml`, `.github/workflows/`, `scripts/phase-6-orchestrator.mjs` |

### Reassessment Priority Stack

| Priority | Action | Owner mode | Exit criteria |
|---|---|---|---|
| P0 | Commit the `@latimer-woods-tech/llm` runtime dependency and changelog fix | Package specialist | `llm` quality gates pass; changelog has `0.2.0`; package-lock shows runtime deps |
| P0 | Enforce the new active prompt contract for all future agents | Coordinator | Every new task plan cites an active prompt and dashboard/OWR item before edits |
| P1 | Build cross-package integration CI | Platform specialist | Workflow and smoke script exist; CI catches runtime dependency drift and validates package chain composition |
| P1 | Create workflow coordination/deploy-gate documentation | DevOps specialist | Workflow trigger/order/recovery matrix exists and deploy workflows reference health gates |
| P1 | Convert Admin Studio command-plane requirements into tests and protected routes | Admin Studio specialist | Real auth, dry-run, audit, smoke auth, RBAC, and rollback evidence exist |
| P2 | Replace stale historical docs or mark them non-canonical | Coordinator + docs | `PROJECT_STATUS.md`, runbooks, and VideoKing baseline clearly reference the dashboard as current truth |

#### Done

- Phase B dashboard initiatives are documented as 28/28 complete.
- Core package publish chain was repaired; `@latimer-woods-tech/schedule@0.2.1` and `@latimer-woods-tech/video@0.2.0` are published.
- `schedule-worker` and `video-cron` deploy workflows have successful runs.
- Direct HTTP health checks for `schedule-worker` and `video-cron` returned `200` on Apr 29.
- Worker service registry entries exist for `prime-self`, `schedule-worker`, `video-cron`, and the `videoking` reference entry.
- Admin Studio master plan exists with environment safety, code, test, deploy, database, content, operations, and AI-assisted workflows.

#### Undone

- Consolidated ownership cleanup is not finished; there are uncommitted local changes and generated artifacts.
- Render failure recovery, replay, and operator escalation are not yet proven as a full drill.
- Phase 7 app scaffolding validation remains open after infrastructure confirmation.
- Admin Studio GUI AI commands are not yet a production control surface.
- App function manifests and smoke probes are not yet fully adopted across every app.
- Workflow coordination and metric freshness are not yet centrally documented.

#### Unrealized / Not Yet Designed Deeply Enough

- A durable command schema for Admin Studio AI actions: every GUI AI command needs intent, target repo/path, environment, risk tier, dry-run output, approval policy, audit event, rollback plan, and PR/deploy linkage.
- A portfolio dependency graph that answers which apps consume which packages, Workers, secrets, queues, databases, R2 buckets, Pages projects, and workflows.
- A formal task object model that Studio can read/write: work item, owner, scope paths, status, blockers, verification evidence, linked commits, linked workflow runs, and linked endpoints.
- A cross-repo release train UI that coordinates package publish order, app lockfile updates, staging deploys, production deploys, smoke tests, and rollbacks.
- A governance rule that all future agents update machine-readable status through Studio or a single dashboard-backed API instead of creating ad hoc markdown summaries.

### Admin Studio Command-Plane Requirements

The Admin Studio should eventually manage this process through GUI AI commands, but only after it implements these standard functions:

| Function | Minimum capability | Safety requirement |
|---|---|---|
| Work register | Create, update, assign, block, unblock, and close tasks | Coordinator approval for status changes touching roadmap or production |
| Repo inventory | List repos, packages, Workers, Pages apps, databases, secrets, workflows, and consumers | Read-only by default; writes go through PRs |
| AI command intake | Convert natural-language commands into structured action plans | Always show target environment, files, risks, and dry-run diff before execution |
| Path ownership | Claim/release file globs for specialist agents | Block conflicting writes unless coordinator overrides |
| Code changes | Branch, edit, test, commit, and open PR | Never commit directly to `main`; use optimistic concurrency and PR review |
| Test runner | Run selected suites and stream results | Persist run IDs, logs, coverage, and failure analysis |
| Deploy control | Trigger staging/production deploys and watch logs | Production deploy requires CI green, smoke pass, type-to-confirm, and rollback link |
| Endpoint verification | Run direct `curl`/HTTP probes against service registry endpoints | CI green is insufficient; record observed HTTP status and timestamp |
| Audit log | Record every mutating Studio action | Redact secrets; include user, env, target, command, result, and request ID |
| Rollback | Generate and execute rollback steps | Must show reversibility tier and required approvals before action |

---

## Implementation Dashboard

### Phase E Addendum — SelfPrime × VideoKing Synergy

| ID | Initiative | Why It Matters | Factory Support Contribution | App Contribution | Exit Criteria | Status |
|---|---|---|---|---|---|---|
| E0.1 | Reconcile shared video Worker registry | Prevents hidden dependencies and broken rename/deploy flows | Add `schedule-worker` and `video-cron` to the service registry with owners, consumers, endpoints, and secrets | Confirm SelfPrime and admin consumers use registry-approved URLs | Registry entries exist and remain current | ✅ Complete |
| E0.2 | Verify shared video Worker health | Product rollout must not depend on undeployed or unreachable services | Deploy Workers after Hyperdrive IDs and secrets are configured | Block SelfPrime video UX until shared services return live `200` health checks | Both `/health` URLs return `200` via direct HTTP verification | ✅ Complete: both health checks returned `200` on Apr 29 |
| E0.3 | Harden schedule pipeline for app tenancy | Private SelfPrime data must not leak into shared services | Add app-scoped auth, sanitized context refs, structured logs, and events | SelfPrime sends minimal generation briefs and owns private chart data | Synthetic job completes or fails with audit trail; no raw private chart payload in shared queue | ✅ Complete: migration ran (6 statements, run 25121132381); render-video run 25120264469 registered job end-to-end with no raw chart payload |
| E0.4 | Add reusable output validation gates | AI outputs must be measurable before they reach users | Add `@latimer-woods-tech/validation` for deterministic quality checks, prompt-leak detection, placeholder detection, and unsafe-advice detection | SelfPrime configures required sections, chart facts, and brand voice terms for synthesis outputs | Package gates pass and SelfPrime can consume shared validators in CI/synthetic monitors | ✅ Complete: package added and verified Apr 29 |
| E0.5 | Add live synthetic monitor Worker | Production health should be continuously checked, not manually remembered | Add `synthetic-monitor` Worker with cron-based route checks and service registry entry | SelfPrime routes/API health become monitor targets before world-class launch | `/health` and `/checks/run` exist; deploy then verify via direct HTTP | ✅ Complete: deployed and both endpoints returned `200` on Apr 29 |

### T1 — Product + UX Operating System

| ID | Initiative | Why It Matters | Factory Support Contribution | Core App Contribution | Exit Criteria | Status |
|---|---|---|---|---|---|---|
| T1.1 | Define design principles and product quality rubric | Prevents "feature-complete but mediocre" outcomes | Provide shared rubric template and review checklist | Apply rubric to feed, player, creator dashboard, checkout, admin flows | Rubric published and used in reviews | ✅ Complete |
| T1.2 | Build a journey map for top 8 user and operator flows | Creates clarity for UX, instrumentation, and testing | Provide journey template and KPI mapping pattern | Map anonymous viewer, signup, subscription, unlock, creator upload, connect onboarding, payout ops, moderation ops | Journey pack approved | ✅ Complete |
| T1.3 | Establish accessibility baseline | Accessibility must be built in, not bolted on | Shared audit checklist and CI expectations | Audit and remediate app journeys for WCAG 2.2 AA essentials | Accessibility backlog ranked and baselined | ✅ Complete |
| T1.4 | Define design system scope | Gives UI a coherent language and reduces design drift | Decide what tokens/patterns belong in Factory vs app | Build app-level component inventory and identify reusable primitives | Reuse strategy approved | ✅ Complete |

### T2 — Core App Engineering Excellence

| ID | Initiative | Why It Matters | Factory Support Contribution | Core App Contribution | Exit Criteria | Status |
|---|---|---|---|---|---|---|
| T2.1 | Refresh the app engineering baseline | Current tracker is stale and under-represents Phase 4 reality | Shared audit format for architecture, quality, reliability | Re-baseline videoking docs, risk register, and open defects | Baseline doc updated | ✅ Complete |
| T2.2 | Add regression tests for money-moving workflows | Monetization defects are high-cost and trust-destroying | Shared testing patterns for payments/webhooks/payouts | Add focused tests for subscriptions, unlocks, payouts, DLQ recovery | Critical flows test-covered | ✅ Complete |
| T2.3 | Introduce performance budgets | Keeps quality from regressing during feature growth | Define budgets and CI reporting format | Apply budgets to worker API latency and web vitals | Budgets enforced in CI | ✅ Complete |
| T2.4 | Normalize architectural decision records | Important design choices need durable rationale | ADR template and review expectations | Create ADRs for payout model, realtime persistence, and monetization architecture | ADR set complete for critical decisions | ✅ Complete |

### T3 — Monetization + Operator Maturity

| ID | Initiative | Why It Matters | Factory Support Contribution | Core App Contribution | Exit Criteria | Status |
|---|---|---|---|---|---|---|
| T3.1 | Finish creator connected-account onboarding as a full journey | The current plan recognizes the need, but not the full UX and ops workflow | Shared Stripe Connect guidance and error-state conventions | Build creator onboarding, status refresh, remediation, and support states | Connected-account journey complete | ✅ Complete |
| T3.2 | Make payout operations operator-grade | Revenue systems need auditability and recovery, not just API success | Shared audit/event conventions and DLQ patterns | Build payout ops dashboard, batch review, retry/recovery flows, and reporting | Operator flow validated end to end | ✅ Complete |
| T3.3 | Instrument the monetization funnel | Best practice requires measurement of every trust and conversion step | Shared analytics contract and naming rules | Track checkout, onboarding, unlock, renewal, churn, payout friction | Funnel visible in dashboards | ✅ Complete |
| T3.4 | Establish revenue integrity reviews | Best-in-class monetization includes reconciliation discipline | Shared process for weekly reconciliation and exception review | Verify earnings, payouts, failed transfers, and DLQ recovery weekly | Revenue integrity cadence active | ✅ Complete |

### T4 — Factory Platform Enablement

| ID | Initiative | Why It Matters | Factory Support Contribution | Core App Contribution | Exit Criteria | Status |
|---|---|---|---|---|---|---|
| T4.1 | Map Factory packages to app delivery concerns | Avoids duplicated logic and unclear ownership | Build a package-to-capability matrix | Consume the matrix in app planning and backlog shaping | Matrix published and adopted | ✅ Complete |
| T4.2 | Add front-end quality standards to Factory support | Current Factory plan is excellent on infra, thinner on experience quality | Add design/accessibility/performance standards to templates and docs | Align app implementation and reviews to those standards | Standards included in scaffold/runbooks | ✅ Complete |
| T4.3 | Build reusable operator patterns | Admin and ops surfaces recur across apps | Define shared patterns for tables, filters, status chips, runbooks, audit states | Apply pattern set in videoking admin/operator UI | Operator pattern library documented | ✅ Complete |
| T4.4 | Prepare Factory Admin roadmap linkage | Portfolio-level operations should connect to app-level health | Define portfolio dashboard requirements | Expose app-level events and KPIs needed by Factory Admin | Admin integration plan ready | ✅ Complete |

### T5 — Reliability, Security, and Observability

| ID | Initiative | Why It Matters | Factory Support Contribution | Core App Contribution | Exit Criteria | Status |
|---|---|---|---|---|---|---|
| T5.1 | Define service-level objectives and error budgets | Reliability must be measurable | Shared SLO framework and alerting thresholds | Apply SLOs to auth, video playback, payments, webhooks, payouts | SLO doc and dashboard complete | ✅ Complete |
| T5.2 | Complete observability from user action to operator recovery | Best practice requires full traceability | Shared event, log, and correlation conventions | Instrument frontend journeys, worker operations, DLQ, and payout handling | End-to-end observability map complete | ✅ Complete |
| T5.3 | Formalize incident, rollback, and postmortem flow | Needed for trust and scale | Shared runbook and postmortem template | Add app-specific rollback and operator triage procedures | Incident process approved | ✅ Complete |
| T5.4 | Security and privacy review pass | Growth and monetization increase exposure | Shared checklist for auth, secrets, payments, PII, abuse prevention | Run a review on auth, payments, moderation, analytics, and storage surfaces | Security review backlog completed | ✅ Complete |

### T6 — Delivery Process and Release Governance

| ID | Initiative | Why It Matters | Factory Support Contribution | Core App Contribution | Exit Criteria | Status |
|---|---|---|---|---|---|---|
| T6.1 | Define Definition of Ready / Done | Prevents ambiguous starts and weak finishes | Publish shared gates | Use gates for every app feature and infrastructure change | Gates adopted by team | ✅ Complete |
| T6.2 | Create a lightweight RFC + design review process | Major changes need coherence before coding starts | Shared RFC template and routing rules | Use RFCs for monetization, UX redesign, and admin/operator work | Review process active | ✅ Complete |
| T6.3 | Formalize release train and verification flow | Production confidence should not depend on memory | Shared staging, canary, smoke, rollback checklist | Use in app releases, especially payment or auth changes | Release runbook active | ✅ Complete |
| T6.4 | Track delivery KPIs | World-class process is measured | Shared dashboard fields and targets | Track lead time, change failure rate, rollback rate, escaped defects | KPI review cadence active | ✅ Complete |

### T7 — Documentation and Knowledge Management

| ID | Initiative | Why It Matters | Factory Support Contribution | Core App Contribution | Exit Criteria | Status |
|---|---|---|---|---|---|---|
| T7.1 | Consolidate source-of-truth docs | Current status is spread across multiple artifacts | Update root docs to point here for implementation planning | Align app docs with the same hierarchy | Source-of-truth hierarchy clear | ✅ Complete |
| T7.2 | Refresh app docs for Phase 4 reality | Prevents planning drift and onboarding confusion | Shared doc quality checklist | Update app README, engineering docs, improvement tracker, and operator docs | App docs current | ✅ Complete |
| T7.3 | Add implementation scorecard | Keeps progress transparent without re-reading all docs | Shared scorecard format | Report status weekly against this dashboard | Scorecard live | ✅ Complete |

---

## Sequencing and Dependencies

### Immediate Sequence
1. T1.1, T1.2, T2.1, T6.1, T7.1
2. T4.1, T4.2, T5.1, T6.2
3. T2.2, T3.1, T3.2, T5.2
4. T1.3, T1.4, T3.3, T6.3
5. T3.4, T4.3, T4.4, T5.3, T5.4, T6.4, T7.2, T7.3

### Hard Dependencies
- Monetization/operator maturity depends on refreshed engineering baseline and test coverage.
- Shared design/process improvements must land before large UI redesign work starts.
- Factory Admin linkage depends on standardized app telemetry and operator data.
- Release governance depends on having SLOs and observable verification points.

---

## Success Metrics

### Product and UX
- Core journey task success rate > 90%
- Conversion lift on key monetization flows
- WCAG 2.2 AA issues at zero for critical flows
- Design consistency scorecard adopted across new surfaces

### Engineering
- Zero critical regressions in auth and money-moving flows
- Critical workflow tests in place for subscriptions, unlocks, payouts, and DLQ recovery
- p95 API latency targets defined and tracked
- Performance budgets enforced in CI

### Operations
- SLOs published for critical services
- Rollback path documented and verified for every production release type
- Mean time to detect and mean time to recover tracked for critical incidents
- Weekly revenue integrity review completed with exception log

### Platform
- Every app-facing Factory capability has an owner, contract, and usage guidance
- Shared templates include UX, accessibility, observability, and release expectations
- Factory Admin plan is connected to app telemetry and operator workflows

---

## Governance Cadence

### Weekly
- Product/design/engineering review against this dashboard
- Reliability and monetization exceptions review
- Documentation freshness review for any changed source of truth

### Biweekly
- Architecture and RFC review
- Design system and UX debt review
- Release quality review with change failure and rollback metrics

### Monthly
- Portfolio review: platform leverage, app health, revenue integrity, operational burden
- Dashboard reprioritization based on metrics and incidents

---

## Definition of Ready

A work item is ready only when:
- the user or operator outcome is explicit,
- the owning scope is assigned to Factory support or the app,
- dependencies are named,
- success metrics are defined,
- and design, data, and operational implications are understood.

## Definition of Done

A work item is done only when:
- implementation is merged,
- validation is executed,
- docs and runbooks are updated,
- observability is in place,
- and the relevant dashboard metric or exit criterion is updated.

---

## Recommended First Implementation Slice

If execution starts later, begin here in order:
1. Re-baseline videoking documentation and open risks.
2. Publish the shared design, accessibility, and release rubrics.
3. Add focused regression tests for subscriptions, payouts, and DLQ recovery.
4. Design the creator onboarding and payout operations journeys end to end.
5. Stand up the first implementation scorecard tied to this dashboard.

---

## Planning Note

This document is intentionally implementation-oriented. It does **not** authorize execution by itself. It exists so implementation can begin later with one cohesive, measurable plan across Factory support and the core app.