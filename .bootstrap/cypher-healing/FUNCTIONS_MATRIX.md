# cypher-healing — Functions & Features Matrix

> ⚠️ **Superseded — see `.bootstrap/coh/FUNCTIONS_MATRIX.md`** for the live cypher-of-healing
> product (`Latimer-Woods-Tech/coh`, deployed at `https://api.cipherofhealing.com`). The matrix
> below describes an older, distinct scaffold — a multi-tenant practitioner SaaS spec with
> `tenants/clients/bookings/courses` tables and `X-Tenant-Id` isolation — that does not match
> the shipped coh product (single-tenant five-stream personal-brand platform with a unified
> `users` table). This file is kept because some legacy planning still references it, but it
> should be treated as historical and may be archived once those references are migrated.

**Date**: 2026-05-11 (reconciled 2026-05-19)
**Repo**: Latimer-Woods-Tech/cypher-healing
**Status**: Rebuilt with full handler enumeration from `src/index.ts`, `src/routes/{tenants,clients,bookings,courses}.ts`, and `src/db/schema.ts`. Hono worker on Cloudflare with Neon (Drizzle), multi-tenant (`X-Tenant-Id`).
**Owner Convention**: human owner = @adrper79-dot, bot owner = @factory-cross-repo[bot]
**Weight scale**: 1 (infra/utility) · 2 (internal admin) · 3 (standard feature) · 4 (customer-visible UX) · 5 (payment/auth/data-loss path)

> **Reconciliation note — 2026-05-19:** The product that actually shipped to production under the "cypher-of-healing" banner is the `Latimer-Woods-Tech/coh` repo (a five-stream personal brand platform — Chair / Vault / Academy / Stage / Inner Circle — at `https://api.cypherofhealing.com`). This matrix describes a *different* surface — the older `Latimer-Woods-Tech/cypher-healing` multi-tenant scaffold at `api.cipherofhealing.com`. The 36 rows below are **not** the shipped surface of coh and the row-by-row status reconciliation requested for coh therefore cannot be applied here without first auditing the cypher-healing repo on its own terms.
>
> **What is happening on coh right now:** test coverage sprint in progress on branch `worldclass/test-coverage`; safety-net sprint on `worldclass/safety-net`; planning reconciliation on `worldclass/planning-reconcile` (this PR). See [`docs/runbooks/coh-world-class-sprint.md`](../../docs/runbooks/coh-world-class-sprint.md) for the full sprint scope. The shipped surface of coh (17 route files in `src/routes/` covering auth, booking, store, academy, events, show, subscriptions, webhooks, communications, plus eight `admin-*` routes) is **not enumerated below** — that work belongs in a fresh `.bootstrap/coh/FUNCTIONS_MATRIX.md` once the two-app naming collision is resolved.
>
> **Test coverage of the actual coh repo (verified 2026-05-19 against `Latimer-Woods-Tech/coh@ceab479`):** 5 test files present — `test/utils/auth.test.ts`, `test/utils/logger.test.ts`, `test/middleware/rate-limit.test.ts`, `test/routes/booking-availability.test.ts`, `test/webhooks/idempotency.test.ts`. Estimated ~5% line coverage; Team B sprint targets 70% by end of sprint and 90% for world-class.
>
> Rows below remain at 🔍 because nobody has done a fresh verification pass on the *cypher-healing* (not *coh*) repo since 2026-05-11. Do not interpret these 🔍s as a status for coh.

## Status legend (strict, single meaning per emoji)
- ✅ — automated test exists AND latest CI run on main is green AND no unresolved Sentry issues touching this row's endpoint
- ⚠️ — passes tests but has open Sentry issues OR known issues in production
- ❌ — automated test missing, OR CI failing, OR confirmed broken in production
- 🔍 — not yet verified (default for new rows; auto-set when Last Verified > 30 days)

## 1. Platform / Cross-cutting
| ID | Feature | Endpoint/Component | Manual Test | Automated Test | Status | Owner | Last Verified | Issue/PR | Weight | Notes |
|---|---|---|---|---|---|---|---|---|---|---|
| CH-PLAT-001 | Health check | `GET /health` — `src/index.ts` | 🔍 TODO | `src/index.test.ts` | 🔍 | @adrper79-dot | 2026-05-11 | — | 1 | Returns `{status, worker, env}` |
| CH-PLAT-002 | Worker bootstrap / router wiring | `src/index.ts` | 🔍 TODO | `src/index.test.ts` | 🔍 | @adrper79-dot | 2026-05-11 | — | 1 | Hono app assembly |
| CH-PLAT-003 | Env bindings typing | `src/env.ts` | — | — | 🔍 | @adrper79-dot | 2026-05-11 | — | 1 | |
| CH-PLAT-004 | Global error boundary | `withErrorBoundary()` in `index.ts` | 🔍 TODO | — | 🔍 | @adrper79-dot | 2026-05-11 | — | 1 | Handles `FactoryBaseError` |
| CH-PLAT-005 | onError catch-all | `app.onError` in `index.ts` | 🔍 TODO | — | 🔍 | @adrper79-dot | 2026-05-11 | — | 1 | Maps `FactoryBaseError` status |

## 2. Authentication, Rate Limiting & Analytics
| ID | Feature | Endpoint/Component | Manual Test | Automated Test | Status | Owner | Last Verified | Issue/PR | Weight | Notes |
|---|---|---|---|---|---|---|---|---|---|---|
| CH-AUTH-001 | JWT middleware | `jwtMiddleware(JWT_SECRET)` on `/api/*` | 🔍 TODO | — | 🔍 | @adrper79-dot | 2026-05-11 | — | 5 | From `@latimer-woods-tech/auth` |
| CH-AUTH-002 | Auth rate limiter | `/auth/*` — `AUTH_RATE_LIMITER.limit` | 🔍 TODO | — | 🔍 | @adrper79-dot | 2026-05-11 | — | 5 | CF rate-limit binding; 429 |
| CH-AUTH-003 | User identify on `/api/*` | post-auth middleware → `analytics.identify` | 🔍 TODO | — | 🔍 | @adrper79-dot | 2026-05-11 | — | 2 | |
| CH-AUTH-004 | Tenant resolution | `X-Tenant-Id` header check — `resolveTenant()` in each router | 🔍 TODO | — | 🔍 | @adrper79-dot | 2026-05-11 | — | 5 | Multi-tenant isolation; throws if missing |
| CH-AUTH-005 | Sentry monitoring middleware | `sentryMiddleware` in `index.ts` | 🔍 TODO | — | 🔍 | @adrper79-dot | 2026-05-11 | — | 1 | |
| CH-AUTH-006 | Analytics init + page tracking | `initAnalytics()` + `analytics.page` on every request | 🔍 TODO | — | 🔍 | @adrper79-dot | 2026-05-11 | — | 1 | PostHog + D1 |

## 3. Tenants
| ID | Feature | Endpoint/Component | Manual Test | Automated Test | Status | Owner | Last Verified | Issue/PR | Weight | Notes |
|---|---|---|---|---|---|---|---|---|---|---|
| CH-TEN-001 | Create tenant | `POST /api/tenants` — validates `name`, `subdomain`, `plan ∈ {starter,pro,enterprise}`; returns 201 | 🔍 TODO | — | 🔍 | @adrper79-dot | 2026-05-11 | — | 5 | `tenants` table; subdomain unique |
| CH-TEN-002 | Get tenant by id | `GET /api/tenants/:id` — 200/404 | 🔍 TODO | — | 🔍 | @adrper79-dot | 2026-05-11 | — | 4 | No tenant-scope check (read by id) |

## 4. Clients
| ID | Feature | Endpoint/Component | Manual Test | Automated Test | Status | Owner | Last Verified | Issue/PR | Weight | Notes |
|---|---|---|---|---|---|---|---|---|---|---|
| CH-CLI-001 | Create client | `POST /api/clients` — requires `X-Tenant-Id`; validates `firstName/lastName/email`; 201 | 🔍 TODO | — | 🔍 | @adrper79-dot | 2026-05-11 | — | 5 | Tenant-scoped insert |
| CH-CLI-002 | List clients (per tenant) | `GET /api/clients` — requires `X-Tenant-Id`; 200 with rows[] | 🔍 TODO | — | 🔍 | @adrper79-dot | 2026-05-11 | — | 4 | |
| CH-CLI-003 | Get client by id | `GET /api/clients/:id` — tenant-scoped; 200/404 | 🔍 TODO | — | 🔍 | @adrper79-dot | 2026-05-11 | — | 4 | |

## 5. Bookings
| ID | Feature | Endpoint/Component | Manual Test | Automated Test | Status | Owner | Last Verified | Issue/PR | Weight | Notes |
|---|---|---|---|---|---|---|---|---|---|---|
| CH-BOOK-001 | Create booking | `POST /api/bookings` — validates `clientId/sessionType/scheduledAt`; verifies client tenant; 201 | 🔍 TODO | — | 🔍 | @adrper79-dot | 2026-05-11 | — | 5 | Cross-tenant guard |
| CH-BOOK-002 | List bookings (per tenant) | `GET /api/bookings` — tenant-scoped; 200 | 🔍 TODO | — | 🔍 | @adrper79-dot | 2026-05-11 | — | 4 | |
| CH-BOOK-003 | Get booking by id | `GET /api/bookings/:id` — tenant-scoped; 200/404 | 🔍 TODO | — | 🔍 | @adrper79-dot | 2026-05-11 | — | 4 | |
| CH-BOOK-004 | Update booking status | `PATCH /api/bookings/:id/status` — status ∈ {pending,confirmed,completed,cancelled}; sets `completedAt` + optional `recordingUrl` on completion | 🔍 TODO | — | 🔍 | @adrper79-dot | 2026-05-11 | — | 5 | State machine; data-write |

## 6. Courses
| ID | Feature | Endpoint/Component | Manual Test | Automated Test | Status | Owner | Last Verified | Issue/PR | Weight | Notes |
|---|---|---|---|---|---|---|---|---|---|---|
| CH-COURSE-001 | Create course | `POST /api/courses` — requires `X-Tenant-Id` + `title`; defaults `priceUsd=0`, `modules=[]`; 201 | 🔍 TODO | — | 🔍 | @adrper79-dot | 2026-05-11 | — | 4 | |
| CH-COURSE-002 | List courses (per tenant) | `GET /api/courses` — tenant-scoped; 200 | 🔍 TODO | — | 🔍 | @adrper79-dot | 2026-05-11 | — | 4 | |
| CH-COURSE-003 | Get course by id | `GET /api/courses/:id` — tenant-scoped; 200/404 | 🔍 TODO | — | 🔍 | @adrper79-dot | 2026-05-11 | — | 4 | |
| CH-COURSE-004 | Update course status | `PATCH /api/courses/:id/status` — status ∈ {draft,published} | 🔍 TODO | — | 🔍 | @adrper79-dot | 2026-05-11 | — | 4 | Publish gate |

## 7. Data Layer & Ops
| ID | Feature | Endpoint/Component | Manual Test | Automated Test | Status | Owner | Last Verified | Issue/PR | Weight | Notes |
|---|---|---|---|---|---|---|---|---|---|---|
| CH-DATA-001 | Drizzle schema | `src/db/schema.ts` — tenants/clients/bookings/courses | — | — | 🔍 | @adrper79-dot | 2026-05-11 | — | 5 | Tenant cascade on delete |
| CH-DATA-002 | Initial migration | `src/db/migrations/0000_white_medusa.sql` | 🔍 TODO | — | 🔍 | @adrper79-dot | 2026-05-11 | — | 5 | |
| CH-DATA-003 | Drizzle config | `drizzle.config.ts` | — | — | 🔍 | @adrper79-dot | 2026-05-11 | — | 1 | |
| CH-DATA-004 | Wrangler deployment config | `wrangler.jsonc` | 🔍 TODO | — | 🔍 | @adrper79-dot | 2026-05-11 | — | 1 | |

## 8. CI, Runbooks & Dev Ergonomics
| ID | Feature | Endpoint/Component | Manual Test | Automated Test | Status | Owner | Last Verified | Issue/PR | Weight | Notes |
|---|---|---|---|---|---|---|---|---|---|---|
| CH-OPS-001 | CI workflow | `.github/workflows/ci.yml` | 🔍 TODO | — | 🔍 | @adrper79-dot | 2026-05-11 | — | 1 | |
| CH-OPS-002 | Deploy workflow | `.github/workflows/deploy.yml` | 🔍 TODO | — | 🔍 | @adrper79-dot | 2026-05-11 | — | 1 | |
| CH-OPS-003 | Getting-started runbook | `docs/runbooks/getting-started.md` | — | — | 🔍 | @adrper79-dot | 2026-05-11 | — | 1 | |
| CH-OPS-004 | Deployment runbook | `docs/runbooks/deployment.md` | — | — | 🔍 | @adrper79-dot | 2026-05-11 | — | 1 | |
| CH-OPS-005 | Database runbook | `docs/runbooks/database.md` | — | — | 🔍 | @adrper79-dot | 2026-05-11 | — | 1 | |
| CH-OPS-006 | Secret rotation runbook | `docs/runbooks/secret-rotation.md` | — | — | 🔍 | @adrper79-dot | 2026-05-11 | — | 1 | |
| CH-OPS-007 | SLO runbook | `docs/runbooks/slo.md` | — | — | 🔍 | @adrper79-dot | 2026-05-11 | — | 1 | |
| CH-OPS-008 | Renovate config | `renovate.json` | — | — | 🔍 | @adrper79-dot | 2026-05-11 | — | 1 | |
