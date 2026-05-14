# Factory / apps/admin-studio — Functions & Features Matrix
**Date**: 2026-05-11
**Repo**: Latimer-Woods-Tech/Factory (`apps/admin-studio/`)
**Status**: Rebuilt from static scan against new schema. Hono worker on Cloudflare. 27 route/middleware modules, 6 D1 migrations, 6 vitest test files. Target path: `apps/admin-studio/docs/FUNCTIONS_MATRIX.md`.
**Owner Convention**: human owner = @adrper79-dot, bot owner = @factory-cross-repo[bot]
**Weight scale**: 1 (infra/utility) · 2 (internal admin) · 3 (standard feature) · 4 (customer-visible UX) · 5 (payment/auth/data-loss path)

## Status legend (strict, single meaning per emoji)
- ✅ — automated test exists AND latest CI run on main is green AND no unresolved Sentry issues touching this row's endpoint
- ⚠️ — passes tests but has open Sentry issues OR known issues in production
- ❌ — automated test missing, OR CI failing, OR confirmed broken in production
- 🔍 — not yet verified (default for new rows; auto-set when Last Verified > 30 days)

## 1. Health, Auth & Session
| ID | Feature | Endpoint/Component | Manual Test | Automated Test | Status | Owner | Last Verified | Issue/PR | Weight | Notes |
|---|---|---|---|---|---|---|---|---|---|---|
| FA-HEALTH-001 | Health check | `GET /health` — `src/index.ts` | 🔍 TODO | — | 🔍 | @adrper79-dot | 2026-05-11 | — | 1 | Returns env/service/timestamp |
| FA-AUTH-001 | Auth routes | `/auth/*` → `src/routes/auth.ts` | 🔍 TODO | `src/routes/auth.test.ts` | 🔍 | @adrper79-dot | 2026-05-11 | — | 5 | Has tests |
| FA-AUTH-002 | `/me` profile | `/me/*` → `src/routes/me.ts` | 🔍 TODO | — | 🔍 | @adrper79-dot | 2026-05-11 | — | 5 | Requires env context |
| FA-AUTH-003 | Env context middleware | `src/middleware/env-context.ts` | 🔍 TODO | — | 🔍 | @adrper79-dot | 2026-05-11 | — | 5 | Gates most routes |
| FA-AUTH-004 | Audit middleware | `src/middleware/audit.ts` | 🔍 TODO | — | 🔍 | @adrper79-dot | 2026-05-11 | — | 2 | Applied to mutating routes |
| FA-AUTH-005 | Require-confirmation middleware | `src/middleware/require-confirmation.ts` | 🔍 TODO | `src/middleware/require-confirmation.test.ts` | 🔍 | @adrper79-dot | 2026-05-11 | — | 5 | Data-loss guard |
| FA-AUTH-006 | CORS middleware | `src/middleware/cors.ts` | 🔍 TODO | — | 🔍 | @adrper79-dot | 2026-05-11 | — | 1 | |
| FA-AUTH-007 | Request ID middleware | `src/middleware/request-id.ts` | 🔍 TODO | — | 🔍 | @adrper79-dot | 2026-05-11 | — | 1 | |
| FA-AUTH-008 | HMAC utility | `src/lib/hmac.ts` | — | — | 🔍 | @adrper79-dot | 2026-05-11 | — | 5 | Webhook signing |

## 2. Public Manifest & Function Catalog
| ID | Feature | Endpoint/Component | Manual Test | Automated Test | Status | Owner | Last Verified | Issue/PR | Weight | Notes |
|---|---|---|---|---|---|---|---|---|---|---|
| FA-CAT-001 | Public manifest | `/manifest/*` → `src/routes/manifest.ts` | 🔍 TODO | — | 🔍 | @adrper79-dot | 2026-05-11 | — | 2 | Crawlable, no auth |
| FA-CAT-002 | Function catalog | `/catalog/*` → `src/routes/catalog.ts` + `lib/catalog-store.ts` | 🔍 TODO | — | 🔍 | @adrper79-dot | 2026-05-11 | — | 2 | Migration 0005 |
| FA-CAT-003 | App registry | `src/lib/app-registry.ts` | — | `src/lib/app-registry.test.ts` | 🔍 | @adrper79-dot | 2026-05-11 | — | 2 | Has tests |
| FA-CAT-004 | Apps list | `/apps/*` → `src/routes/apps.ts` | 🔍 TODO | — | 🔍 | @adrper79-dot | 2026-05-11 | — | 2 | |

## 3. Test Runs & Deploys (CI/CD surface)
| ID | Feature | Endpoint/Component | Manual Test | Automated Test | Status | Owner | Last Verified | Issue/PR | Weight | Notes |
|---|---|---|---|---|---|---|---|---|---|---|
| FA-CICD-001 | Test runs API | `/tests/*` → `src/routes/tests.ts` + `lib/test-store.ts` | 🔍 TODO | — | 🔍 | @adrper79-dot | 2026-05-11 | — | 2 | Migration 0004 |
| FA-CICD-002 | Deploys API | `/deploys/*` → `src/routes/deploy.ts` | 🔍 TODO | `src/routes/deploy.test.ts` | 🔍 | @adrper79-dot | 2026-05-11 | — | 5 | Audit-gated; data-loss path |
| FA-CICD-003 | GitHub dispatch | `src/lib/github-dispatch.ts` | 🔍 TODO | — | 🔍 | @adrper79-dot | 2026-05-11 | — | 2 | Triggers workflows |
| FA-CICD-004 | GitHub API wrapper | `src/lib/github-api.ts` | 🔍 TODO | — | 🔍 | @adrper79-dot | 2026-05-11 | — | 2 | |
| FA-CICD-005 | Repo API | `/repo/*` → `src/routes/repo.ts` | 🔍 TODO | — | 🔍 | @adrper79-dot | 2026-05-11 | — | 2 | Audit-gated |
| FA-CICD-006 | Studio tests webhook | `POST /webhooks/studio-tests` → `src/routes/webhooks-studio-tests.ts` | 🔍 TODO | — | 🔍 | @adrper79-dot | 2026-05-11 | — | 5 | Public, signed |
| FA-CICD-007 | Deployment verification script | `scripts/verify-deployment.mjs` | 🔍 TODO | — | 🔍 | @adrper79-dot | 2026-05-11 | — | 2 | CLI helper |
| FA-CICD-008 | Service registry check script | `scripts/check-service-registry.mjs` | 🔍 TODO | — | 🔍 | @adrper79-dot | 2026-05-11 | — | 2 | |

## 4. AI Analysis & Audit Trail
| ID | Feature | Endpoint/Component | Manual Test | Automated Test | Status | Owner | Last Verified | Issue/PR | Weight | Notes |
|---|---|---|---|---|---|---|---|---|---|---|
| FA-AI-001 | AI routes | `/ai/*` → `src/routes/ai.ts` | 🔍 TODO | — | 🔍 | @adrper79-dot | 2026-05-11 | — | 2 | Audit-gated |
| FA-AI-002 | AI analysis cycle (cron) | `runAnalysisCycle` from `routes/ai.ts` | 🔍 TODO | — | 🔍 | @adrper79-dot | 2026-05-11 | — | 2 | |
| FA-AI-003 | Audit log API | `/audit/*` → `src/routes/audit.ts` + `lib/audit-store.ts` | 🔍 TODO | — | 🔍 | @adrper79-dot | 2026-05-11 | — | 5 | Migration 0001; compliance |
| FA-AI-004 | Timeline API | `/timeline/*` → `src/routes/timeline.ts` | 🔍 TODO | — | 🔍 | @adrper79-dot | 2026-05-11 | — | 2 | |

## 5. Observability, SLO & Ops
| ID | Feature | Endpoint/Component | Manual Test | Automated Test | Status | Owner | Last Verified | Issue/PR | Weight | Notes |
|---|---|---|---|---|---|---|---|---|---|---|
| FA-OBS-001 | Observability API | `/observability/*` → `src/routes/observability.ts` | 🔍 TODO | `src/routes/observability.test.ts` | 🔍 | @adrper79-dot | 2026-05-11 | — | 2 | Has tests |
| FA-OBS-002 | SLO API | `/slo/*` → `src/routes/slo.ts` | 🔍 TODO | — | 🔍 | @adrper79-dot | 2026-05-11 | — | 2 | |
| FA-OBS-003 | Schema readiness | `src/lib/schema-readiness.ts` | 🔍 TODO | — | 🔍 | @adrper79-dot | 2026-05-11 | — | 2 | |
| FA-OBS-004 | Smoke tests API | `/smoke/*` → `src/routes/smoke.ts` | 🔍 TODO | — | 🔍 | @adrper79-dot | 2026-05-11 | — | 2 | Audit-gated |
| FA-OBS-005 | Synthetic checks | `/synthetic/*` → `src/routes/synthetic.ts` | 🔍 TODO | — | 🔍 | @adrper79-dot | 2026-05-11 | — | 2 | Audit-gated |
| FA-OBS-006 | Ops runbooks | `/ops/*` → `src/routes/ops.ts` | 🔍 TODO | — | 🔍 | @adrper79-dot | 2026-05-11 | — | 2 | Audit-gated |

## 6. Creators, Payouts & Stripe Connect
| ID | Feature | Endpoint/Component | Manual Test | Automated Test | Status | Owner | Last Verified | Issue/PR | Weight | Notes |
|---|---|---|---|---|---|---|---|---|---|---|
| FA-PAY-001 | Creator onboarding | `/api/creator/onboarding/*` → `src/routes/creator-onboarding.ts` | 🔍 TODO | — | 🔍 | @adrper79-dot | 2026-05-11 | — | 5 | Migration 0002 |
| FA-PAY-002 | Admin creators | `/api/admin/creators/*` → `src/routes/creators.ts` | 🔍 TODO | — | 🔍 | @adrper79-dot | 2026-05-11 | — | 2 | |
| FA-PAY-003 | Admin payouts | `/api/admin/payouts/*` → `src/routes/payouts.ts` | 🔍 TODO | — | 🔍 | @adrper79-dot | 2026-05-11 | — | 5 | Migration 0003 |
| FA-PAY-004 | Stripe Connect webhooks | `POST /webhooks/stripe-connect` → `src/routes/webhooks-stripe-connect.ts` | 🔍 TODO | — | 🔍 | @adrper79-dot | 2026-05-11 | — | 5 | Public, signed |
| FA-PAY-005 | Studio subscriptions webhook | `POST /webhooks/studio-subscriptions` → `src/routes/webhooks-studio-subscriptions.ts` | 🔍 TODO | — | 🔍 | @adrper79-dot | 2026-05-11 | — | 5 | Public, signed |

## 7. Feature Flags, DSR & Digest
| ID | Feature | Endpoint/Component | Manual Test | Automated Test | Status | Owner | Last Verified | Issue/PR | Weight | Notes |
|---|---|---|---|---|---|---|---|---|---|---|
| FA-FLG-001 | Flagship / feature flags | `/api/flags/*` → `src/routes/flagship.ts` | 🔍 TODO | — | 🔍 | @adrper79-dot | 2026-05-11 | — | 2 | Audit-gated |
| FA-FLG-002 | Data Subject Requests | `/dsr/*` → `src/routes/dsr.ts` | 🔍 TODO | — | 🔍 | @adrper79-dot | 2026-05-11 | — | 5 | Compliance + data-loss |
| FA-FLG-003 | Digest orchestrator | `runDigest()` — `src/digest/index.ts` | 🔍 TODO | — | 🔍 | @adrper79-dot | 2026-05-11 | — | 2 | Cron |
| FA-FLG-004 | Digest collect | `src/digest/collect.ts` | — | — | 🔍 | @adrper79-dot | 2026-05-11 | — | 2 | |
| FA-FLG-005 | Digest render | `src/digest/render.ts` | — | — | 🔍 | @adrper79-dot | 2026-05-11 | — | 2 | |
| FA-FLG-006 | Digest audio (TTS) | `src/digest/audio.ts` | — | — | 🔍 | @adrper79-dot | 2026-05-11 | — | 2 | |
| FA-FLG-007 | Digest send | `src/digest/send.ts` | — | — | 🔍 | @adrper79-dot | 2026-05-11 | — | 2 | |
