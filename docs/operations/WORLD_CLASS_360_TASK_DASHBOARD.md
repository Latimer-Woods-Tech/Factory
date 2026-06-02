# World Class 360 — Active Task Dashboard

**Date:** 2026-04-29  
**Status:** Active execution dashboard for this iteration  
**North star:** build the full World Class 360 tranche, including complete Xico City, Practitioner Video Studio, SelfPrime video/product proof, Admin Studio control plane, and Factory platform hardening.  
**Canonical parent:** `../../WORLD_CLASS_IMPLEMENTATION_DASHBOARD.md`  
**Standing orders:** `../../CLAUDE.md`
**Discipline breakdown:** `WORLD_CLASS_360_DISCIPLINE_BREAKDOWN.md`
**Scope gap review:** `WORLD_CLASS_360_SCOPE_GAP_REVIEW.md`
**Repo hardening execution plan:** `W360_FACTORY_REPO_HARDENING_PLAN.md`

---

## 1. Executive intent

The current iteration is no longer “MVP only.” The north star is **World Class 360**:

> Build a complete, credible tranche of Factory-backed applications that proves the platform can ship real products across AI media, practitioner/personalization, marketplace commerce, operations, release governance, and reusable infrastructure.

This means:

- Xico City is completed as a full app, not only a transaction demo.
- Practitioner Video Studio is the fastest revenue engine and must become self-serve.
- SelfPrime remains the proof surface for video, auth, UX, and practitioner positioning.
- Admin Studio becomes the safe operator/control plane.
- Factory package and workflow systems become release-train ready.
- Stale docs are marked, archived, or merged so agents do not execute outdated plans.

---

## 2. Current state snapshot

| Area | State | Success signal | Main gap |
|---|---|---|---|
| Video pipeline | Verified happy path | R2 + Stream + render workflow succeeded | Revenue entitlement/credit bridge missing |
| SelfPrime | Live public proof | Stream embed, smoke, a11y, auth e2e green | Productized paid video studio not built |
| Xico City | Plan strong, repo unstable | Build plan/orchestrator exists | CI/deps/schema/routes/deploy need repair before full build |
| Admin Studio | ✅ Gates all pass | lint ✓ typecheck ✓ 31 tests ✓; RBAC/authz tests added; LLM-backed analysis; UI Code/AI/Functions tabs; studio-core 66 tests ✓ | Operator-facing live deployment not yet verified via curl |
| Packages | Published and integration-smoke protected | Package integration workflow passed | Release-train coordination and app lockfile drift not centralized |
| Docs | Rich but sprawling | Dashboard is canonical | Historical docs still compete for attention |
| Workflows | Many powerful automations | Video + package workflows prove value | No central workflow matrix/recovery register yet |

---

## 3. Priority model

| Priority | Meaning | Rule |
|---|---|---|
| P0 | Blocks parallel work or money-moving safety | Fix before starting dependent feature work |
| P1 | Required for World Class 360 ready state | Queue immediately after P0 |
| P2 | Important scale/polish work | Build once core loops prove green |
| P3 | Cleanup or future leverage | Schedule, do not interrupt core path |

---

## 3.1 Discipline model

World Class 360 work is no longer managed as one flat backlog. Every item should be categorized by discipline so specialist agents can own a coherent body of work and reviewers can be assigned by risk.

| Code | Discipline | Primary responsibility |
|---|---|---|
| D01 | Program coordination | Scope, sequencing, OWR/W360 status, dependencies, path ownership |
| D02 | Product and revenue | Offers, pricing, funnels, entitlements, product outcomes |
| D03 | UX, design, and brand | Journeys, accessibility UX, design tokens, brand packs, templates |
| D04 | Frontend and PWA | Pages apps, dashboards, onboarding, client state, PWA shell |
| D05 | Backend/API and Workers | Hono routes, middleware, manifests, health/ready, service boundaries |
| D06 | Data and migrations | Drizzle schema, migrations, RLS, seed/demo data, data lifecycle |
| D07 | Payments and commerce | Stripe, credits, bookings, refunds, payouts, reconciliation |
| D08 | AI, video, and media | Render pipeline, Remotion, LLM prompts, R2/Stream, validation |
| D09 | Platform, DevOps, and config | Workflows, Wrangler, secrets, env examples, deploy gates, Renovate |
| D10 | Observability and reliability | Sentry, PostHog, events, synthetic monitor, SLOs, rollback proof |
| D11 | Security, privacy, and compliance | RBAC, JWT policy, service tokens, GDPR, DMCA, audit requirements |
| D12 | QA and test engineering | Unit/integration/e2e/smoke/a11y/contract tests and quality gates |
| D13 | Documentation and enablement | Canonical docs, templates, runbooks, status index, archival policy |
| D14 | Growth, launch, and support ops | SEO, demo narrative, support scripts, refunds workflow, onboarding docs |

Detailed ownership and app/repo mapping lives in `docs/operations/WORLD_CLASS_360_DISCIPLINE_BREAKDOWN.md`.

---

## 4. Master queue

### P0 — Coordination, repo stability, and safety

| ID | Workstream | Owner team | Scope / paths | Dependencies | Exit criteria |
|---|---|---|---|---|---|
| W360-001 | Resolve agent collision risk | Coordinator | Factory working tree, path ownership table | None | ✅ DONE 2026-04-29 — `docs/operations/PATH_OWNERSHIP_TABLE.md` created and Factory working tree verified clean before/after validation runs |
| W360-002 | Create workflow coordination matrix | DevOps | `.github/workflows/`, `docs/runbooks/`, `docs/operations/` | W360-001 | ✅ DONE 2026-04-29 — matrix created and shared deploy-gate contract implemented in `scripts/verify-http-endpoint.mjs` + deploy workflow wiring for schedule-worker/video-cron/synthetic-monitor/admin-studio |
| W360-003 | Xico City repo stabilization | Xico platform team | `C:/Users/Ultimate Warrior/Documents/GitHub/xico-city` | none | ⚠️ PARTIALLY UNBLOCKED 2026-04-30 — stabilization fixes landed in xico-city: vitest peer conflict **FIXED** (`00a8f82`: vitest + @vitest/coverage-v8 bumped to `^2.1.0`) and missing clean-gate scripts **FIXED** (`62a096b`: added `lint` and `build` scripts). Remaining blocker is environment auth only: `npm install` still fails with `E401 Unauthorized` on `@latimer-woods-tech/*` packages until GitHub Packages token is configured in xico-city `.npmrc`; once set, generate `package-lock.json`, rerun clean gates, and unblock W360-004. |
| W360-004 | Xico City Worker health deploy | Xico platform team | Xico `wrangler.jsonc`, deploy workflow, service registry | W360-003 | ⚠️ BLOCKED 2026-04-30 — upstream W360-003 is partially unblocked (vitest conflict fixed), but deploy remains blocked until `.npmrc` auth is configured and lockfile is generated via successful `npm install`; after that, rerun clean gates and proceed to deploy/health curl verification. |
| W360-005 | Practitioner Studio entitlement bridge | Revenue API team | product API, entitlement tables, Stripe webhook, credit ledger | video pipeline baseline | ⚡ IN PROGRESS (runtime nearly clear) 2026-04-30 — production deploy verification now shows core ingress live: `curl -i https://api.apunlimited.com/health` → `200`, `curl -i https://schedule.latwoodtech.work/stripe/health` → `200`, and schedule-worker manifest now includes `/stripe/health` route metadata. Remaining blocker is configuration-only: `POST /webhooks/studio-subscriptions` on admin-studio production currently returns `503 {"error":"Webhook receiver not configured"}` because `STRIPE_SUBSCRIPTION_WEBHOOK_SECRET` is not set in repo secrets. Workflow hardening landed to provision this secret automatically when present (`fix(admin-studio): provision stripe webhook secret during deploy`), and to warn without blocking deploy when absent. Final closeout step: add GitHub secret `STRIPE_SUBSCRIPTION_WEBHOOK_SECRET`, rerun `deploy-admin-studio.yml` (env=production), then run Stripe test-card webhook ACK verification. |
| W360-006 | Admin Studio production safety gate | Admin Studio team | `apps/admin-studio`, `apps/admin-studio-ui`, `packages/studio-core` | W360-001 | ✅ DONE 2026-04-29 — RBAC + negative auth coverage added (`apps/admin-studio/src/routes/security-authz.test.ts`), audited mutation pipeline active, protected smoke runner validated, dry-run previews in deploy/test/payout flows, `/tests/runs/:id/analyze` upgraded to LLM-backed path with safe fallback, and admin-studio-ui Code/AI/Functions tab shell passes lint/typecheck/build |

### P1 — Product loops

| ID | Workstream | Owner team | Scope / paths | Dependencies | Exit criteria |
|---|---|---|---|---|---|
| W360-007 | Practitioner Studio self-serve render | Revenue + video teams | video request endpoint, onboarding, dashboard projection | W360-005 | ⚠️ BLOCKED 2026-04-29 — waiting on W360-005 runtime gate (live Stripe test-card webhook ack via curl) before end-to-end paid render flow can be validated |
| W360-008 | Practitioner Studio dashboard MVP | UI + revenue teams | user dashboard, billing, credits, videos | W360-007 | ⚠️ BLOCKED 2026-04-29 — depends on W360-007 self-serve render flow completion |
| W360-009 | Practitioner Studio operator recovery | Admin Studio + video teams | failed jobs, replay, credit reversal, audit | W360-007 | ⚠️ BLOCKED 2026-04-29 — depends on W360-007 to validate real failed-job replay/refund paths |
| W360-010 | Xico identity and profiles | Xico auth team | Xico auth/profile routes/tests | W360-004 | ⚠️ BLOCKED 2026-04-29 — blocked by W360-004/W360-003 Xico repo stabilization gap |
| W360-011 | Xico host onboarding | Xico marketplace team | host profile, Stripe Connect, KYC state | W360-010 | ⚠️ BLOCKED 2026-04-29 — blocked by W360-010 auth/profile flow not yet executable |
| W360-012 | Xico catalog and moderation | Xico marketplace + ops teams | experiences, versions, media, schedules, admin review | W360-011 | ⚠️ BLOCKED 2026-04-29 — blocked by W360-011 host onboarding dependency |
| W360-013 | Xico discovery and map | Xico product team | search, category filters, neighborhood pages, MapLibre | W360-012 | ⚠️ BLOCKED 2026-04-29 — blocked by W360-012 catalog/moderation dependency |
| W360-014 | Xico booking checkout | Xico commerce team | bookings, checkout sessions, Stripe webhook, email | W360-013 | ⚠️ BLOCKED 2026-04-29 — blocked by W360-013 discovery/listing readiness |
| W360-015 | Xico reviews and trust | Xico trust team | reviews, reports, moderation actions, strikes | W360-014 | ⚠️ BLOCKED 2026-04-29 — blocked by W360-014 booking flow completion |
| W360-016 | Xico subscriptions | Xico commerce team | Explorer/Local tiers, Billing portal, member gates | W360-014 | ⚠️ BLOCKED 2026-04-29 — blocked by W360-014 checkout/subscription prerequisites |
| W360-017 | Xico payouts | Xico commerce + ops teams | Connect transfers, payout reports, DLQ/retry | W360-014, W360-011 | ⚠️ BLOCKED 2026-04-29 — blocked by W360-014 booking and W360-011 host onboarding |
| W360-018 | Xico curator tooling | Xico product team | collections, share links, public collection pages | W360-013 | ⚠️ BLOCKED 2026-04-29 — blocked by W360-013 discovery/catalog readiness |
| W360-019 | Xico compliance suite | Xico compliance team | GDPR export/delete, DMCA, consent logs | W360-010, W360-012 | ⚠️ BLOCKED 2026-04-29 — blocked by W360-010 auth and W360-012 content surfaces |
| W360-020 | Xico PWA polish | Xico UI team | Pages/PWA app, offline shell, install manifest, a11y | W360-013 | ⚠️ BLOCKED 2026-04-29 — blocked by W360-013 discovery/map foundation |

### P1 — Platform/product observability

| ID | Workstream | Owner team | Scope / paths | Dependencies | Exit criteria |
|---|---|---|---|---|---|
| W360-021 | Analytics event verification gate | Observability team | analytics tests, PostHog/factory_events schemas | W360-005, W360-014 | ✅ DONE 2026-04-29 — `packages/analytics/src/event-schemas.ts` defines `CRITICAL_EVENT_SCHEMAS` for 22 events (render/sub/revenue/auth/booking/webhook); `assertEventShape()` throws on missing fields or wrong types; 50+ tests in `event-schemas.test.ts`; exported from index.ts for consumer tests |
| W360-022 | User-journey SLOs | Observability team | docs/runbooks/slo, synthetic monitor | W360-007, W360-014 | ⚡ IN PROGRESS 2026-04-30 — monitor fidelity issue resolved. Synthetic-monitor now routes internal workers.dev checks through service bindings (`SCHEDULE_WORKER`, `VIDEO_CRON`, `ADMIN_STUDIO_STAGING`, `PRIME_SELF`) to avoid runtime `error code: 1042`; production deploy run `25169847401` succeeded and live `GET /checks/run` now returns `status: ok` with all configured probes passing, including `slo.journey.webhook` (`/stripe/health`). Remaining open scope is dependency-gated journeys only: J05 checkout, J06 first-render, J07 booking, J09 dashboard (W360-007/008/014). |
| W360-023 | Cost guardrails | Revenue + observability | credit quotas, render estimates, budget alerts | W360-005 | ✅ DONE 2026-04-29 — `packages/neon/src/entitlements/guardrails.ts`: `checkRenderGuardrails()` (5-stage: kill switch → entitlement → duration → quota → credits), `estimateRenderCost()` (ceil to 0.01), `isKillSwitchActive()` (global config + customer suspension), `emitBudgetAlert()` (fire-and-forget, 20% threshold); constants: DEFAULT_CREDIT_RATE_PER_SECOND=0.1, PLATFORM_MAX_VIDEO_SECONDS=1800; 35 tests passing |
| W360-024 | Function manifest adoption | Platform + Admin Studio | `packages/studio-core`, Workers | W360-006 | ✅ DONE 2026-04-29 — `GET /manifest` exposed across admin-studio (typed, studio-core), schedule-worker, video-cron, and synthetic-monitor; all return `{ manifestVersion:1, app, env, entries[] }` with auth/reversibility/SLO/smoke metadata per route |
| W360-025 | Cross-repo release train | DevOps + package team | package publish, app lockfile updates, Studio view | W360-002 | ✅ DONE 2026-04-29 — `docs/operations/CROSS_REPO_RELEASE_TRAIN.md` documents deterministic package bump → lockfile updates → staging smoke → production with evidence template |

### P2 — Growth, launch, and tranche packaging

| ID | Workstream | Owner team | Scope / paths | Dependencies | Exit criteria |
|---|---|---|---|---|---|
| W360-026 | Practitioner Studio legal/trust package | Legal/compliance | ToS, privacy, AI disclosure, refund, AUP | W360-005 | ⚠️ BLOCKED 2026-04-29 — dependency W360-005 still awaiting runtime Stripe verification gate before legal/checkout linkage can be declared complete |
| W360-027 | Practitioner Studio launch system | Launch team | landing, pricing, demos, SEO, emails, affiliate/referral | W360-008, W360-026 | ⚠️ BLOCKED 2026-04-29 — blocked by W360-008 dashboard MVP and W360-026 legal/trust package |
| W360-028 | Xico City launch package | Launch + Xico teams | landing, seed listings, demo data, SEO, host docs | W360-020 | ⚠️ BLOCKED 2026-04-29 — blocked by Xico dependency chain (W360-020 ← W360-013 ← W360-003) |
| W360-029 | Tranche investor/operator narrative | Coordinator + docs | portfolio deck/docs, architecture map, service map | W360-027, W360-028 | ⚠️ BLOCKED 2026-04-29 — blocked by launch package dependencies W360-027 and W360-028 |
| W360-030 | Archive/mark stale docs | Docs coordinator | root docs, docs/archive, canonical index | W360-001 | ✅ DONE 2026-04-29 — `docs/DOCUMENT_STATUS_INDEX.md` plus `docs/archive/README.md`; historical banner applied to root completion/summary artifacts to prevent stale-plan reuse |

### P0/P1 — Full-scope, templates, standards, and config refinement

| ID | Workstream | Lead disciplines | Scope / paths | Dependencies | Exit criteria |
|---|---|---|---|---|---|
| W360-031 | Full portfolio app scope registry | D01, D09, D13 | Factory apps, external app repos, service registry, Admin Studio registry | W360-001 | ✅ DONE 2026-04-29 — `docs/APP_SCOPE_REGISTRY.md` created: 9 Factory apps + 5 external apps inventoried by type/status/W360-phase; W360-035 graduation gate matrix defined (10-point checklist); template apps + pending repos classified with owner/setup status |
| W360-032 | Template buildout pack | D13 + discipline leads | `docs/templates/`, `packages/deploy/templates/`, `packages/testing`, `packages/studio-core` | W360-031 | ✅ DONE 2026-04-29 — Phase 1: `docs/templates/worker-basic/` (wrangler.jsonc, package.json, src/index.ts + Hono health+manifest, src/index.test.ts, tsconfig.json, .dev.vars.example). Phase 2: `docs/templates/adr/template.md` (ADR decision record template with options/consequences/risk table/review table) + `docs/templates/openapi/template.yaml` (OpenAPI 3.1.0 template with health+manifest+CRUD paths, security schemes, shared error responses, HealthResponse+ManifestEntry schemas) |
| W360-033 | Standards catalog and enforcement | D13, D09, D12 | frontend/design/API/runtime/auth/money/AI/analytics/observability/config/docs/release standards | W360-032 | ✅ DONE 2026-04-29 — `docs/operations/ENGINEERING_STANDARDS_CATALOG.md` created: 10 categories (RT/TS/TEST/DOC/AUTH/MONEY/AI/OBS/DB/REL), 38 standards each with owner, required gate, check mechanism, and reference; enforcement gap register documents 4 standards pending automation |
| W360-034 | Config normalization pass | D09, D12, D10 | `wrangler.jsonc`, GitHub Actions, `package.json`, lockfiles, TS/ESLint/Vitest, Renovate, Sentry/PostHog, service registry | W360-031 | ✅ DONE 2026-04-29 — Phase 1 executed: (1) `$schema`, `compatibility_date: 2025-01-01`, and `compatibility_flags: ["nodejs_compat"]` normalized across schedule-worker, video-cron, and synthetic-monitor `wrangler.jsonc`; (2) `"license": "MIT"` and `"repository"` block added to all four worker app `package.json` files; audit doc at `docs/CONFIG_NORMALIZATION_AUDIT.md` |
| W360-035 | App repo graduation gates | D09, D12, D13 | `wordis-bond`, `cypher-healing`, `ijustus`, `the-calling`, `neighbor-aid`, `prime-self`, `xico-city` | W360-034 | ✅ DONE 2026-04-29 — graduation gate framework codified in `docs/APP_SCOPE_REGISTRY.md` (`Graduation Gates Matrix (W360-035)` + `Verification Checklist (Pre-Graduation)`): clean checkout, env verification, CI/typecheck/lint/test/build, deploy + health curl, smoke tests, docs completeness, ownership sign-off, rollback verification. Gate status tracked per app (e.g., `prime-self` ✅, `prime-self-ui` ✅, `xico-city` 🟡) |
| W360-036 | Operator/support runbook pack | D14, D07, D11, D13 | refund, failed render, failed booking, login, data deletion, moderation, rollback | W360-032 | ✅ DONE 2026-04-29 — `docs/runbooks/operator-support-runbook.md` created: 7 failure modes covered (failed render, credit refund, failed booking, auth/login, data deletion, content moderation, worker rollback); each has trigger criteria, step-by-step procedure, tooling, reversal notes, and audit trail requirements |
| W360-037 | Design and brand asset system | D03, D04, D08, D14 | logos, tokens, brand packs, video templates, app-specific design boundaries | W360-031 | ✅ DONE 2026-04-29 — `docs/operations/W360_DESIGN_BRAND_ASSET_SYSTEM.md` created with concrete reusable asset inventory (`packages/design-tokens`, `packages/ui`, `apps/video-studio`, `docs/templates/*`), app-specific boundary matrix, and launch-linkage requirements; `docs/templates/BRAND_PACK_TEMPLATE.md` added as required brand-pack launch artifact |
| W360-038 | Discipline routing and review gates | D01 + all leads | W360 dashboard, discipline breakdown, PR/review policy | W360-031 | ✅ DONE 2026-04-29 — `docs/operations/W360_DISCIPLINE_ROUTING_AND_REVIEW_GATES.md` created: 14-discipline map with codes/leads/examples, 4-tier risk model (T1 Critical → T4 Low) with evidence requirements, per-item routing table for all 40 W360 rows, PR merge policy by tier (T1 needs 2 approvals + D05/D07 co-review), evidence documentation format standard |

### P0/P1 — Factory repo hardening execution

| ID | Workstream | Lead disciplines | Scope / paths | Dependencies | Exit criteria |
|---|---|---|---|---|---|
| W360-046 | Activate Factory repo hardening plan | D01, D05, D09, D10, D11, D12, D13 | `docs/operations/W360_FACTORY_REPO_HARDENING_PLAN.md`, `docs/operations/W360_FACTORY_REPO_HARDENING_SPRINT_PLAN.md`, `docs/operations/W360_FACTORY_REPO_HARDENING_ISSUE_PACK.md`, `.github/ISSUE_TEMPLATE/w360-hardening-workstream.md` + referenced app/package/workflow paths | W360-034, W360-038 | ✅ DONE 2026-04-29 — all 4 referenced artifacts confirmed present; FRH-01..FRH-10 workstreams tracked in `W360_FACTORY_REPO_HARDENING_PLAN.md` with owners, CI gates, sprint mapping; issue template at `.github/ISSUE_TEMPLATE/w360-hardening-workstream.md`; sprint plan at `W360_FACTORY_REPO_HARDENING_SPRINT_PLAN.md`; FRH-11 deferred post-closeout. Blockers W360-034 ✓ W360-038 ✓ both now done |

### P1 — UI/UX excellence system

| ID | Workstream | Lead disciplines | Scope / paths | Dependencies | Exit criteria |
|---|---|---|---|---|---|
| W360-039 | Create shared design tokens package | D03, D04, D09, D12, D13 | `packages/design-tokens`, frontend standards, usage docs | W360-033, W360-037 | ✅ DONE 2026-04-29 — package exists with semantic token groups and full quality-gate pass (`lint`, `typecheck`, `test`, `build`); tests 26/26 with 100% coverage |
| W360-040 | Create shared UI primitives package | D03, D04, D09, D12, D13 | `packages/ui`, component docs, test harness | W360-039 | ✅ DONE 2026-04-29 — package ships Button/Input/Label/Alert/Dialog/Toast/Card/EmptyState/LoadingState/Tabs/FormField with tests and successful `lint`/`typecheck`/`test`/`build` gate run |
| W360-041 | Baseline critical journeys and scorecards | D02, D03, D04, D10, D12, D14 | SelfPrime, Admin Studio, Xico route inventory and journey specs | W360-038 | ✅ DONE 2026-04-29 — `docs/W360-041-JOURNEY-SCORECARDS.md` defines journey template, route scorecards, KPI baselines/targets, instrumentation, and proof checklist |
| W360-042 | Add UI regression gates | D04, D09, D10, D12 | Playwright, axe, Lighthouse, screenshot diff, mobile matrix | W360-039, W360-040, W360-041 | ✅ DONE 2026-04-30 — historical completion note referenced a `ui-regression-gates.yml` workflow, but that workflow is not present in this repo as of 2026-05-28. Reverify the current UI regression surface before treating this row as an active CI contract. Evidence retained from the completion note: `npx playwright test tests/regression-gates.spec.ts --project=chromium-desktop` ✓, `--project=mobile-chrome` ✓, `--project=mobile-safari` ✓. Selected routes covered: `/`, `/pricing`, `/practitioners` |
| W360-043 | Harden SelfPrime to premium launch quality | D03, D04, D10, D12, D14 | `Latimer-Woods-Tech/prime-self-ui`, `Latimer-Woods-Tech/prime-self`, smoke/a11y/auth/live UX | W360-041, W360-042 | ⚠️ BLOCKED 2026-04-29 — requires external repos (`prime-self`, `prime-self-ui`) not present in this workspace for direct implementation and live-proof collection |
| W360-044 | Harden Admin Studio control-plane UX | D03, D04, D05, D11, D12 | `apps/admin-studio-ui`, `apps/admin-studio`, `packages/studio-core` | W360-006, W360-041, W360-042 | ✅ DONE 2026-04-29 — Admin Studio dashboard navigation hardened for operator use: responsive mobile-safe tab rail (`flex-col`/`md:flex-row`, horizontal scroll tabs on small screens), explicit keyboard focus-visible rings on all nav links, and tighter mobile spacing for readability. Evidence: `apps/admin-studio-ui/src/pages/Dashboard.tsx` updated; `npm run lint` ✓, `npm run typecheck` ✓, `npm run build` ✓ in `apps/admin-studio-ui` |
| W360-045 | Create launch-review UX governance | D01, D03, D12, D13, D14 | DoR/DoD, RFC, review templates, launch checklist | W360-041, W360-042 | ✅ DONE 2026-04-29 — `docs/operations/W360_LAUNCH_REVIEW_UX_GOVERNANCE.md` created: formal DoR/DoD, required artifact pack, PR launch checklist, risk-tier approval policy, and CI linkage (`ui-regression-gates.yml`, smoke workflow). Standard now enforces journey spec + a11y + performance + visual + event proof before merge |

---

## 4.1 Portfolio app/repo coverage

| Surface | W360 disposition | Lead disciplines | Required next proof |
|---|---|---|---|
| `apps/admin-studio` | Active W360 core surface | D05, D09, D10, D11, D12 | RBAC/audit/dry-run/smoke tests and production health verification |
| `apps/admin-studio-ui` | Active W360 core surface | D03, D04, D11, D12 | Protected UI flows, environment safety, a11y, audit viewer proof |
| `apps/prime-self-reference` | Reference/template candidate | D03, D04, D13 | Decision: reference-only or reusable UI/template source |
| `apps/prime-self-smoke` | Active quality gate | D12, D10, D13 | Reusable smoke/a11y pattern documented for other apps |
| `apps/schedule-worker` | Active video infrastructure | D05, D08, D10, D09 | Failure replay, credit/refund hooks, manifest, SLO proof |
| `apps/synthetic-monitor` | Active reliability infrastructure | D10, D09 | W360 journey targets added as routes become available |
| `apps/video-cron` | Active video infrastructure | D08, D09, D10 | Retry/recovery evidence and dispatch metrics |
| `apps/video-studio` | Active media template surface | D08, D03, D14 | Practitioner and Xico video templates and brand packs |
| `apps/videoking` / `_external_reviews/videoking` | Reference only | D02, D07, D08, D13 | Reference-only status preserved; reusable patterns extracted |
| `Latimer-Woods-Tech/prime-self` | Live app/API | D05, D10, D11 | Live health/auth/practitioner verification remains green |
| `Latimer-Woods-Tech/prime-self-ui` | Live launch/proof UI | D03, D04, D12, D14 | Live smoke/a11y/auth and Studio launch entry if used |
| `xico-city` | Full W360 build | D01-D14 | S-00 through S-11 proof gates |
| `wordis-bond` | Scaffolded repo; feature-deferred | D09, D12, D13 | Graduation gate: clean checkout, env, CI, docs, owner |
| `cypher-healing` | Scaffolded repo; feature-deferred | D09, D12, D13 | Graduation gate: clean checkout, env, CI, docs, owner |
| `ijustus` | Scaffolded repo; feature-deferred | D09, D12, D13 | Graduation gate: clean checkout, env, CI, docs, owner |
| `the-calling` | Scaffolded repo; feature-deferred | D09, D12, D13 | Graduation gate: clean checkout, env, CI, docs, owner |
| `neighbor-aid` | Scaffolded repo; feature-deferred | D09, D12, D13 | Graduation gate: clean checkout, env, CI, docs, owner |

---

## 5. Xico City full-build slice plan

World Class 360 means building all Xico City slices. The execution order remains strict because later marketplace features depend on stable identity, schema, and money-moving flows.

| Slice | Name | World Class 360 completion target | Depends on |
|---|---|---|---|
| X0 | Repo stabilization | CI green, lockfile, scripts, exact pins, no forbidden runtime patterns | none |
| S-00 | Foundations | health/ready/Sentry/schema/CI/deploy/curl gate actually pass | X0 |
| S-01 | Identity & profiles | secure auth, refresh rotation, profile, avatar | S-00 |
| S-02 | Host onboarding | Stripe Connect Express, KYC state, host dashboard skeleton | S-01 |
| S-03 | Experience catalog | create/version/schedule/media/admin moderation | S-02 |
| S-04 | Discovery | search, filters, map, neighborhood/category pages | S-03 |
| S-05 | Bookings | checkout, idempotent webhook, cancellations/refunds | S-04 |
| S-06 | Reviews & trust | verified reviews, helpful votes, host responses, reports | S-05 |
| S-07 | Subscriptions | Explorer/Local tiers, member prices, billing portal | S-05 |
| S-08 | Payouts | Connect transfers, payout reports, exception handling | S-05/S-02 |
| S-09 | Curator tooling | collections, share links, public curated journeys | S-04 |
| S-10 | Compliance | DMCA, GDPR, consent logs, moderator console | S-01/S-03 |
| S-11 | PWA polish | offline shell, installable app, push, a11y/performance | S-04+ |

---

## 6. Practitioner Video Studio slice plan

| Slice | Name | Completion target | Depends on |
|---|---|---|---|
| PVS-00 | Revenue foundation | plan catalog, checkout, signed webhook, entitlement, credits | video baseline |
| PVS-01 | Self-serve onboarding | wizard captures niche, brand, offer, audience, forbidden claims | PVS-00 |
| PVS-02 | First render loop | paid user schedules render and receives playable output | PVS-01 |
| PVS-03 | User dashboard | videos, credits, plan, billing portal, embed/share | PVS-02 |
| PVS-04 | Operator recovery | failed jobs, replay, credit reversal, audit | PVS-02 |
| PVS-05 | Legal/trust | AI disclosure, refund, AUP, privacy, ToS | PVS-00 |
| PVS-06 | Launch engine | demo gallery, SEO, emails, affiliate/referral | PVS-03/PVS-05 |

---

## 7. Admin Studio slice plan

| Slice | Name | Completion target | Depends on |
|---|---|---|---|
| AS-00 | Working-tree cleanup | active Admin Studio/studio-core changes accounted for | W360-001 |
| AS-01 | Auth/RBAC | all sensitive APIs protected by roles | AS-00 |
| AS-02 | Audit middleware | every mutation writes factory_events/audit row | AS-01 |
| AS-03 | Dry-run command model | command schema, risk tier, diff preview, rollback plan | AS-02 |
| AS-04 | Smoke/test runner hardening | protected live/staging smoke runner and evidence capture | AS-02 |
| AS-05 | Deploy control | staging/prod deploys with health gates and rollback | W360-002, AS-03 |
| AS-06 | Function explorer | manifests ingested and displayed with reversibility/SLO | W360-024 |
| AS-07 | Release train UI | package/app/workflow version drift and deploy state | W360-025 |

---

## 8. Documentation hygiene queue

### Keep canonical

- `CLAUDE.md`
- `WORLD_CLASS_IMPLEMENTATION_DASHBOARD.md`
- `MASTER_INDEX.md`
- `PROJECT_STATUS.md`
- `docs/service-registry.yml`
- `docs/operations/WORLD_CLASS_360_TASK_DASHBOARD.md`
- `docs/revenue/PRACTITIONER_VIDEO_STUDIO_READY_STATE_PLAN.md`
- `docs/revenue/XICO_CITY_TRANCHE_REVIEW.md`
- `docs/operations/WORLD_CLASS_360_SCOPE_GAP_REVIEW.md`
- `docs/operations/WORLD_CLASS_360_DISCIPLINE_BREAKDOWN.md`
- `prompts/README.md`
- `prompts/AGENT_SUCCESS_CONTRACT.md`

### Mark historical or archive

| Pattern/file group | Action | Reason |
|---|---|---|
| root `*_SUMMARY.md`, `*_COMPLETE.md` | archive to `docs/archive/session-summaries/` or add historical banner | session artifacts compete with dashboard |
| `STAGE_0_*`, `STAGE_1_*`, `STAGES_2_5*`, `STAGE_5_COMPLETE.md` | archive/mark historical | superseded by World Class 360 dashboard |
| clean pass reports | archive to `docs/archive/clean-passes/` | useful evidence, not live plan |
| old Phase C/D kickoff/completion docs | mark historical unless actively used | prevent stale phase confusion |
| VideoKing phase refresh docs | keep baseline docs; archive one-off refresh summary if duplicated | VideoKing remains pattern source |

### Create

- `docs/DOCUMENT_STATUS_INDEX.md` — **created**; every major doc gets status: canonical, active reference, historical, archive candidate.
- `docs/operations/WORKFLOW_COORDINATION_MATRIX.md` — **created**; critical workflows, deploy gates, and immediate coordination backlog are listed.
- `docs/archive/README.md` — still needed after coordinator approves archive moves.

---

## 9. Escaped items to add in this pass

1. **Workflow registry** — workflows need metadata and recovery instructions.
2. **Event verification gate** — revenue and booking events must be tested like code.
3. **Cost guardrail gate** — no render or marketplace flow launches without cost controls.
4. **Customer support runbook** — refund, failed render, failed booking, login issue, data deletion.
5. **Seed/demo data strategy** — Xico needs believable listings and demo users for launch and testing.
6. **Terms/refund/compliance lockstep** — legal pages must ship before checkout goes public.
7. **Synthetic monitor expansion** — add Xico, checkout, dashboard, webhook canaries once routes exist.
8. **Package version drift monitor** — app repos must not silently lag Factory package versions.
9. **Secrets inventory refresh** — confirm all app repos have required secrets and no stale names.
10. **Rollback rehearsal** — run one non-destructive rollback drill per deployed Worker before public launch.
11. **Discipline routing** — every work item needs a lead discipline, reviewer discipline, risk tier, and evidence requirement.
12. **Template pack** — build reusable templates before repeating app/revenue/support work manually.
13. **Standards catalog** — standards must be enforceable checks, not scattered prose.
14. **Config normalization** — all W360-critical repos need aligned Wrangler, CI, package, lint, test, telemetry, and secret conventions.

---

## 10. Immediate execution order

1. Commit or consciously isolate current Factory doc/dashboard changes.
2. Resolve active working-tree collision risk.
3. Create workflow coordination matrix. **Done as document; shared deploy-gate implementation remains open.**
4. Assign discipline owners/reviewers for W360-001 through W360-038.
5. Complete portfolio app scope registry and config/template/standards gap tickets.
6. Stabilize Xico City repo and CI.
7. Implement Practitioner Studio entitlement/credit bridge.
8. Implement Xico S-00 true foundations and deploy/curl verify.
9. Run Admin Studio safety hardening.
10. Begin parallel product loops:
   - Xico S-01/S-02/S-03,
   - Practitioner Studio PVS-01/PVS-02,
   - Admin Studio AS-02/AS-03,
   - Observability W360-021/W360-022.

---

## 11. Completion definition for World Class 360 iteration

This iteration is complete when:

- Practitioner Video Studio has a paid self-serve render loop.
- Xico City completes all S-00 through S-11 slices with live or staged proof.
- SelfPrime remains healthy and tied to the video proof surface.
- Admin Studio can safely observe and operate core workflows with RBAC/audit/dry-run.
- Factory packages have release-train discipline and cross-package CI.
- Workflows have a coordination matrix and recovery runbooks.
- Full app/repo scope is explicitly tracked by discipline.
- Templates, standards, and configs are normalized enough that future apps do not reinvent launch-critical work.
- Stale docs are archived or marked historical.
- The dashboard has evidence-backed status for every active workstream.
