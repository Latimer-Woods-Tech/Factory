# coh (cipher-of-healing) — Functions & Features Matrix

**Date**: 2026-05-19
**Repo**: `Latimer-Woods-Tech/coh`
**Worker name**: `coh` (also published as `cypher-healing` per `docs/service-registry.yml`)
**Canonical domain**: `https://api.cipherofhealing.com` · workers.dev: `https://cypher-healing.adrper79.workers.dev`
**Source enumerated from**: `src/index.ts`, `src/routes/*.ts`, `src/middleware/*.ts`, `src/utils/*.ts`, `src/db/schema.ts`, `test/**`

## Authority

This file is the **canonical functional matrix for `Latimer-Woods-Tech/coh`**. It supersedes
`.bootstrap/cypher-healing/FUNCTIONS_MATRIX.md`, which describes an older, distinct repo
(a multi-tenant practitioner SaaS scaffold with `tenants/clients/bookings/courses` tables and
`X-Tenant-Id` isolation) that does not match the shipped coh product and may be archived.

The shipped coh product is a **single-tenant, five-stream personal brand platform** for one
creator (no tenant header, `users.role` admin model, unified schema with `users.stripeCustomerId`).

## Five-stream summary

coh ships five product streams on one Hono Worker, unified via the `users` table and an
append-only `activity_log`: **The Chair** (1-on-1 booking — `/api/booking`), **The Vault**
(commerce + downloads — `/api/store`), **The Academy** (LMS — `/api/academy`), **The Stage**
(live events/webinars — `/api/events`), and **Inner Circle** (subscriptions/memberships —
`/api/subscriptions`). Cross-cutting surfaces: `/api/auth`, `/api/show` (podcast/episodes —
not in CLAUDE.md's stream list but shipped), `/api/comms` (RTC + reminders), `/api/admin/*`
(role-gated admin), `/api/webhooks/stripe` (single endpoint that dispatches multiple Stripe
event types), and `/api/admin/db` + `/__db` (ops-only bootstrap).

## Status legend

- ✅ — handler exists AND a test in `test/**` directly exercises the route
- 🚧 — handler exists, no direct route-level test (helper-only or middleware-only tests don't count)
- ❌ — referenced in CLAUDE.md / roadmap but no handler in `src/routes/`
- 🔍 — could not fully enumerate or status is genuinely unclear

## Weight scale

1 = infra / utility · 2 = internal admin · 3 = standard feature · 4 = customer-visible UX · 5 = critical-path revenue / auth / payment

## Test coverage inventory (what actually exists in `test/`)

| Test file | Exercises |
|---|---|
| `test/routes/booking-availability.test.ts` | **Pure helper only** — `computeAvailableSlots()` re-implemented in the test file; does NOT call `GET /availability` |
| `test/middleware/rate-limit.test.ts` | `createRateLimitMiddleware` against a mock KV |
| `test/utils/auth.test.ts` | `createToken/verifyToken/hashPassword/verifyPassword/extractToken` from `src/utils/auth.ts` |
| `test/utils/logger.test.ts` | `src/utils/logger.ts` console output |
| `test/webhooks/idempotency.test.ts` | KV contract for `stripe:webhook:processed:{eventId}` — does NOT call `POST /api/webhooks/stripe` |

Sprint PRs in flight (coh#48 safety net, coh#49 17 new tests, coh#50 dual-domain, coh#51 Stripe fixes) may add additional coverage; this matrix reflects the **merged-to-main** surface as of 2026-05-19.

---

## 1. Platform / Cross-cutting

| ID | Stream | Surface | File | Weight | Status | Test coverage | Notes |
|---|---|---|---|---|---|---|---|
| COH-PLAT-001 | platform | `GET /` — API root + endpoint catalog | `src/index.ts:47-69` | 1 | 🚧 | none | Returns operational metadata + endpoint map; advertises self as `/health` substitute |
| COH-PLAT-002 | platform | `GET /api/docs` — API documentation JSON | `src/index.ts:72-121` | 1 | 🚧 | none | Static metadata blob |
| COH-PLAT-003 | platform | Hono app bootstrap + route mounts | `src/index.ts:29-148` | 1 | 🚧 | none | 18 route mounts; order-sensitive (admin sub-paths before catch-all) |
| COH-PLAT-004 | platform | Global middleware: logger / prettyJSON / responseMiddleware / cors | `src/index.ts:32-44` | 1 | 🚧 | none | CORS origin from `c.env.CORS_ORIGIN`; exposes `X-RateLimit-*` headers |
| COH-PLAT-005 | platform | 404 handler | `src/index.ts:151-157` | 1 | 🚧 | none | `errorResponse` with `ErrorCodes.NOT_FOUND` |
| COH-PLAT-006 | platform | onError catch-all | `src/index.ts:160` | 1 | 🚧 | none | `createErrorHandler(ENVIRONMENT === 'development')` |
| COH-PLAT-007 | platform | Scheduled handler — appointment reminders | `src/index.ts:164-166` | 3 | 🚧 | none | `sendAppointmentReminders(env)` via `src/utils/reminders.ts`; wired to wrangler cron |
| COH-PLAT-008 | platform | **MISSING** `/health` endpoint | — | 5 | ❌ | none | CLAUDE.md says `curl https://coh.adrper79.workers.dev/health` is the fix-verification contract; no `/health` handler exists in `src/index.ts`. `GET /` works but is not `/health`. **Anomaly worth fixing in sprint.** |

## 2. Middleware (cross-cutting surfaces)

| ID | Stream | Surface | File | Weight | Status | Test coverage | Notes |
|---|---|---|---|---|---|---|---|
| COH-MW-001 | platform | `authMiddleware` — JWT verify from `Authorization: Bearer …` | `src/middleware/auth.ts` | 5 | 🚧 | `test/utils/auth.test.ts` covers token primitives only, not the middleware |
| COH-MW-002 | platform | `optionalAuth` — auth if present, pass-through if absent | `src/middleware/auth.ts` | 4 | 🚧 | none |
| COH-MW-003 | platform | `adminOnly` — role gate (`userRole === 'admin'`) | `src/middleware/auth.ts` | 5 | 🚧 | none |
| COH-MW-004 | platform | `createRateLimitMiddleware` — KV-backed per-namespace limiter | `src/middleware/rate-limit.ts` | 4 | ✅ | `test/middleware/rate-limit.test.ts` | Used by `authWriteRateLimit` and `bookingWriteRateLimit` |
| COH-MW-005 | platform | `responseMiddleware` — request ID + envelope helpers | `src/middleware/response.ts` | 2 | 🚧 | none |
| COH-MW-006 | platform | `createErrorHandler` + `ErrorCodes` | `src/middleware/errors.ts` | 3 | 🚧 | none |

## 3. Auth (`/api/auth`)

| ID | Stream | Surface | File | Weight | Status | Test coverage | Notes |
|---|---|---|---|---|---|---|---|
| COH-AUTH-001 | auth | `POST /api/auth/signup` | `src/routes/auth.ts:51` | 5 | 🚧 | none | Rate-limited via `authWriteRateLimit`; Zod `signupSchema` |
| COH-AUTH-002 | auth | `POST /api/auth/login` | `src/routes/auth.ts:107` | 5 | 🚧 | none | Rate-limited; sets session in KV |
| COH-AUTH-003 | auth | `POST /api/auth/refresh-token` | `src/routes/auth.ts:166` | 5 | 🚧 | none | |
| COH-AUTH-004 | auth | `GET /api/auth/me` | `src/routes/auth.ts:198` | 4 | 🚧 | none | Requires `authMiddleware` |
| COH-AUTH-005 | auth | `PUT /api/auth/me` — update profile | `src/routes/auth.ts:231` | 4 | 🚧 | none | |
| COH-AUTH-006 | auth | `POST /api/auth/forgot-password` | `src/routes/auth.ts:263` | 4 | 🚧 | none | Resend email |
| COH-AUTH-007 | auth | `POST /api/auth/reset-password` | `src/routes/auth.ts:293` | 5 | 🚧 | none | Token-based reset |
| COH-AUTH-008 | auth | `POST /api/auth/magic-link/request` | `src/routes/auth.ts:318` | 4 | 🚧 | none | |
| COH-AUTH-009 | auth | `POST /api/auth/magic-link/verify` | `src/routes/auth.ts:356` | 5 | 🚧 | none | |
| COH-AUTH-010 | auth | `POST /api/auth/logout` | `src/routes/auth.ts:395` | 3 | 🚧 | none | Clears KV session |

## 4. Subscriptions / Inner Circle (`/api/subscriptions`)

| ID | Stream | Surface | File | Weight | Status | Test coverage | Notes |
|---|---|---|---|---|---|---|---|
| COH-IC-001 | inner-circle | `GET /api/subscriptions/plans` — public plan list | `src/routes/subscriptions.ts:14` | 3 | 🚧 | none | From `membership_plans` table |
| COH-IC-002 | inner-circle | `GET /api/subscriptions/my-subscription` | `src/routes/subscriptions.ts:21` | 4 | 🚧 | none | |
| COH-IC-003 | inner-circle | `POST /api/subscriptions/subscribe` — Stripe checkout session | `src/routes/subscriptions.ts:33` | 5 | 🚧 | none | Critical-path revenue |
| COH-IC-004 | inner-circle | `POST /api/subscriptions/cancel` | `src/routes/subscriptions.ts:94` | 5 | 🚧 | none | |

## 5. The Show / Podcast (`/api/show`)

> Not enumerated in CLAUDE.md's five-stream table — episodes table + show routes are an extra surface beyond the documented streams.

| ID | Stream | Surface | File | Weight | Status | Test coverage | Notes |
|---|---|---|---|---|---|---|---|
| COH-SHOW-001 | show | `GET /api/show/` — list published episodes | `src/routes/show.ts:13` | 3 | 🚧 | none | Pagination |
| COH-SHOW-002 | show | `GET /api/show/:slug` — episode detail | `src/routes/show.ts:46` | 3 | 🚧 | none | `optionalAuth` |
| COH-SHOW-003 | show | `POST /api/show/:slug/view` — view counter | `src/routes/show.ts:79` | 2 | 🚧 | none | Anonymous tracking |
| COH-SHOW-004 | show | `POST /api/show/` — create episode (admin) | `src/routes/show.ts:92` | 3 | 🚧 | none | `authMiddleware + adminOnly` |
| COH-SHOW-005 | show | `PUT /api/show/:id` — update episode (admin) | `src/routes/show.ts:124` | 3 | 🚧 | none | |
| COH-SHOW-006 | show | `POST /api/show/:id/publish` — publish gate (admin) | `src/routes/show.ts:150` | 3 | 🚧 | none | |

## 6. The Chair / Booking (`/api/booking`)

| ID | Stream | Surface | File | Weight | Status | Test coverage | Notes |
|---|---|---|---|---|---|---|---|
| COH-CHAIR-001 | chair | `GET /api/booking/services` — list active services | `src/routes/booking.ts:21` | 4 | 🚧 | none | Pagination |
| COH-CHAIR-002 | chair | `GET /api/booking/availability` — slot computation | `src/routes/booking.ts:38` | 5 | 🚧 | `test/routes/booking-availability.test.ts` tests a re-implementation of the helper, NOT the route handler. Honest status is 🚧 |
| COH-CHAIR-003 | chair | `POST /api/booking/appointments` — create + Stripe checkout | `src/routes/booking.ts:94` | 5 | 🚧 | none | Rate-limited via `bookingWriteRateLimit`; `authMiddleware`; writes `activity_log` |
| COH-CHAIR-004 | chair | `GET /api/booking/appointments` — user's appointments | `src/routes/booking.ts:230` | 4 | 🚧 | none | |
| COH-CHAIR-005 | chair | `PATCH /api/booking/appointments/:id/cancel` | `src/routes/booking.ts:248` | 5 | 🚧 | none | State machine entry |

## 7. The Vault / Store (`/api/store`)

| ID | Stream | Surface | File | Weight | Status | Test coverage | Notes |
|---|---|---|---|---|---|---|---|
| COH-VAULT-001 | vault | `GET /api/store/products` — public catalog | `src/routes/store.ts:15` | 4 | 🚧 | none | Pagination |
| COH-VAULT-002 | vault | `GET /api/store/products/:slug` — product detail | `src/routes/store.ts:37` | 4 | 🚧 | none | |
| COH-VAULT-003 | vault | `GET /api/store/categories` | `src/routes/store.ts:47` | 3 | 🚧 | none | |
| COH-VAULT-004 | vault | `POST /api/store/validate-coupon` | `src/routes/store.ts:54` | 4 | 🚧 | none | |
| COH-VAULT-005 | vault | `POST /api/store/orders` — checkout + Stripe session | `src/routes/store.ts:87` | 5 | 🚧 | none | `authMiddleware`; cross-sell via `sourceAppointmentId`; writes `activity_log` |
| COH-VAULT-006 | vault | `GET /api/store/orders` — user's order history | `src/routes/store.ts:290` | 4 | 🚧 | none | |

## 8. The Academy / LMS (`/api/academy`)

| ID | Stream | Surface | File | Weight | Status | Test coverage | Notes |
|---|---|---|---|---|---|---|---|
| COH-ACAD-001 | academy | `GET /api/academy/courses` — list published courses | `src/routes/academy.ts:12` | 4 | 🚧 | none | |
| COH-ACAD-002 | academy | `GET /api/academy/courses/:slug` — course detail | `src/routes/academy.ts:29` | 4 | 🚧 | none | `optionalAuth`; surfaces enrollment status |
| COH-ACAD-003 | academy | `POST /api/academy/courses/:slug/enroll` — Stripe checkout (paid) or free enroll | `src/routes/academy.ts:77` | 5 | 🚧 | none | `authMiddleware`; writes `activity_log` |
| COH-ACAD-004 | academy | `POST /api/academy/lessons/:lessonId/complete` — progress tracker | `src/routes/academy.ts:156` | 4 | 🚧 | none | Triggers Inner Circle eligibility logic per CLAUDE.md |
| COH-ACAD-005 | academy | `GET /api/academy/enrollments` — user's enrollments | `src/routes/academy.ts:183` | 4 | 🚧 | none | |

## 9. The Stage / Events (`/api/events`)

| ID | Stream | Surface | File | Weight | Status | Test coverage | Notes |
|---|---|---|---|---|---|---|---|
| COH-STAGE-001 | stage | `GET /api/events/` — public event list | `src/routes/events.ts:29` | 4 | 🚧 | none | |
| COH-STAGE-002 | stage | `GET /api/events/:slug` — event detail | `src/routes/events.ts:53` | 4 | 🚧 | none | `optionalAuth` |
| COH-STAGE-003 | stage | `POST /api/events/:slug/register` — Stripe checkout (paid) or free register | `src/routes/events.ts:80` | 5 | 🚧 | none | `authMiddleware`; intake responses for consultations; capacity check |
| COH-STAGE-004 | stage | `GET /api/events/my/registrations` | `src/routes/events.ts:219` | 4 | 🚧 | none | |

## 10. Communications / RTC (`/api/comms`)

| ID | Stream | Surface | File | Weight | Status | Test coverage | Notes |
|---|---|---|---|---|---|---|---|
| COH-COMMS-001 | platform | `POST /api/comms/appointments/send-reminders` — admin batch | `src/routes/communications.ts:14` | 3 | 🚧 | none | `authMiddleware` + inline admin role check; Telnyx SMS |
| COH-COMMS-002 | platform | `POST /api/comms/events/send-reminders` — admin batch | `src/routes/communications.ts:88` | 3 | 🚧 | none | Telnyx SMS via `buildEventReminder` |
| COH-COMMS-003 | platform | `POST /api/comms/events/:eventId/video-room` — admin creates Telnyx RTC room | `src/routes/communications.ts:156` | 4 | 🚧 | none | Persists `telnyxRoomName/Id` on event |
| COH-COMMS-004 | platform | `GET /api/comms/events/:eventId/video-room` — registered attendee fetches token | `src/routes/communications.ts:207` | 4 | 🚧 | none | Registration gate; per-user token mint |

## 11. Webhooks (`/api/webhooks`)

| ID | Stream | Surface | File | Weight | Status | Test coverage | Notes |
|---|---|---|---|---|---|---|---|
| COH-WH-001 | webhooks | `POST /api/webhooks/stripe` — signature verify + dispatch | `src/routes/webhooks.ts:33` | 5 | 🚧 | none | Verifies via `constructEventAsync(STRIPE_WEBHOOK_SECRET)` |
| COH-WH-002 | webhooks | Stripe idempotency cache (`stripe:webhook:processed:{id}`, 14d TTL) | `src/routes/webhooks.ts:10-23,55-57` | 5 | ✅ | `test/webhooks/idempotency.test.ts` covers the KV contract directly (not the route, but covers the contract that the route relies on) |
| COH-WH-003 | webhooks | Dispatch: `checkout.session.completed` — order paid | `src/routes/webhooks.ts:59` | 5 | 🚧 | none | |
| COH-WH-004 | webhooks | Dispatch: `checkout.session.completed` — appointment / enrollment / event registration / subscription paths | `src/routes/webhooks.ts:362` | 5 | 🚧 | none | Multiple metadata-routed branches |
| COH-WH-005 | webhooks | Dispatch: `charge.refunded` | `src/routes/webhooks.ts:396` | 5 | 🚧 | none | |
| COH-WH-006 | webhooks | Dispatch: `payment_intent.payment_failed` | `src/routes/webhooks.ts:447` | 4 | 🚧 | none | |
| COH-WH-007 | webhooks | Dispatch: `customer.subscription.updated` | `src/routes/webhooks.ts:492` | 5 | 🚧 | none | |
| COH-WH-008 | webhooks | Dispatch: `customer.subscription.deleted` | `src/routes/webhooks.ts:521` | 5 | 🚧 | none | |

## 12. Admin — Courses (`/api/admin/courses` etc.)

> All `admin.*` routes go through `authMiddleware` + admin role enforcement applied at the sub-app level. Mounted via `app.route('/api/admin', adminCourse)`.

| ID | Stream | Surface | File | Weight | Status | Test coverage | Notes |
|---|---|---|---|---|---|---|---|
| COH-ADM-CRS-001 | admin | `GET /api/admin/courses` | `src/routes/admin-course.ts:27` | 2 | 🚧 | none | |
| COH-ADM-CRS-002 | admin | `POST /api/admin/courses` | `src/routes/admin-course.ts:55` | 3 | 🚧 | none | `activity_log` write |
| COH-ADM-CRS-003 | admin | `GET /api/admin/courses/:id` | `src/routes/admin-course.ts:98` | 2 | 🚧 | none | |
| COH-ADM-CRS-004 | admin | `PUT /api/admin/courses/:id` | `src/routes/admin-course.ts:128` | 3 | 🚧 | none | |
| COH-ADM-CRS-005 | admin | `POST /api/admin/courses/:id/publish` | `src/routes/admin-course.ts:164` | 3 | 🚧 | none | Publish gate |
| COH-ADM-CRS-006 | admin | `DELETE /api/admin/courses/:id` | `src/routes/admin-course.ts:192` | 3 | 🚧 | none | |
| COH-ADM-CRS-007 | admin | `POST /api/admin/courses/:courseId/modules` | `src/routes/admin-course.ts:213` | 2 | 🚧 | none | |
| COH-ADM-CRS-008 | admin | `PUT /api/admin/modules/:id` | `src/routes/admin-course.ts:253` | 2 | 🚧 | none | |
| COH-ADM-CRS-009 | admin | `DELETE /api/admin/modules/:id` | `src/routes/admin-course.ts:276` | 2 | 🚧 | none | |
| COH-ADM-CRS-010 | admin | `POST /api/admin/modules/:moduleId/lessons` | `src/routes/admin-course.ts:299` | 2 | 🚧 | none | |
| COH-ADM-CRS-011 | admin | `PUT /api/admin/lessons/:id` | `src/routes/admin-course.ts:349` | 2 | 🚧 | none | |
| COH-ADM-CRS-012 | admin | `DELETE /api/admin/lessons/:id` | `src/routes/admin-course.ts:376` | 2 | 🚧 | none | |
| COH-ADM-CRS-013 | admin | `GET /api/admin/enrollments` | `src/routes/admin-course.ts:404` | 2 | 🚧 | none | |
| COH-ADM-CRS-014 | admin | `POST /api/admin/enrollments` — manual enroll | `src/routes/admin-course.ts:443` | 3 | 🚧 | none | |
| COH-ADM-CRS-015 | admin | `PUT /api/admin/enrollments/:id` | `src/routes/admin-course.ts:470` | 2 | 🚧 | none | |
| COH-ADM-CRS-016 | admin | `GET /api/admin/students/:userId/progress/:courseId` | `src/routes/admin-course.ts:500` | 2 | 🚧 | none | |
| COH-ADM-CRS-017 | admin | `GET /api/admin/analytics` | `src/routes/admin-course.ts:555` | 2 | 🚧 | none | |

## 13. Admin — Booking (`/api/admin/booking`)

| ID | Stream | Surface | File | Weight | Status | Test coverage | Notes |
|---|---|---|---|---|---|---|---|
| COH-ADM-BOOK-001 | admin | `GET /api/admin/booking/appointments` | `src/routes/admin-booking.ts:17` | 2 | 🚧 | none | |
| COH-ADM-BOOK-002 | admin | `PATCH /api/admin/booking/appointments/:id` | `src/routes/admin-booking.ts:45` | 3 | 🚧 | none | State updates |
| COH-ADM-BOOK-003 | admin | `GET /api/admin/booking/services` | `src/routes/admin-booking.ts:74` | 2 | 🚧 | none | |
| COH-ADM-BOOK-004 | admin | `POST /api/admin/booking/services` | `src/routes/admin-booking.ts:80` | 3 | 🚧 | none | |
| COH-ADM-BOOK-005 | admin | `PUT /api/admin/booking/services/:id` | `src/routes/admin-booking.ts:105` | 3 | 🚧 | none | |
| COH-ADM-BOOK-006 | admin | `DELETE /api/admin/booking/services/:id` | `src/routes/admin-booking.ts:125` | 3 | 🚧 | none | |
| COH-ADM-BOOK-007 | admin | `GET /api/admin/booking/availability` | `src/routes/admin-booking.ts:140` | 2 | 🚧 | none | |
| COH-ADM-BOOK-008 | admin | `POST /api/admin/booking/availability` | `src/routes/admin-booking.ts:146` | 3 | 🚧 | none | |
| COH-ADM-BOOK-009 | admin | `PUT /api/admin/booking/availability/:id` | `src/routes/admin-booking.ts:158` | 3 | 🚧 | none | |

## 14. Admin — Store (`/api/admin/store`)

| ID | Stream | Surface | File | Weight | Status | Test coverage | Notes |
|---|---|---|---|---|---|---|---|
| COH-ADM-STR-001 | admin | `GET /api/admin/store/products` | `src/routes/admin-store.ts:17` | 2 | 🚧 | none | |
| COH-ADM-STR-002 | admin | `POST /api/admin/store/products` | `src/routes/admin-store.ts:32` | 3 | 🚧 | none | |
| COH-ADM-STR-003 | admin | `PUT /api/admin/store/products/:id` | `src/routes/admin-store.ts:61` | 3 | 🚧 | none | |
| COH-ADM-STR-004 | admin | `DELETE /api/admin/store/products/:id` | `src/routes/admin-store.ts:87` | 3 | 🚧 | none | |
| COH-ADM-STR-005 | admin | `POST /api/admin/store/categories` | `src/routes/admin-store.ts:102` | 2 | 🚧 | none | |
| COH-ADM-STR-006 | admin | `GET /api/admin/store/orders` | `src/routes/admin-store.ts:117` | 2 | 🚧 | none | |
| COH-ADM-STR-007 | admin | `PATCH /api/admin/store/orders/:id` | `src/routes/admin-store.ts:135` | 3 | 🚧 | none | Order state machine |
| COH-ADM-STR-008 | admin | `GET /api/admin/store/coupons` | `src/routes/admin-store.ts:163` | 2 | 🚧 | none | |
| COH-ADM-STR-009 | admin | `POST /api/admin/store/coupons` | `src/routes/admin-store.ts:169` | 3 | 🚧 | none | |
| COH-ADM-STR-010 | admin | `PUT /api/admin/store/coupons/:id` | `src/routes/admin-store.ts:190` | 3 | 🚧 | none | |

## 15. Admin — Events / Users (`/api/admin` — `adminEvents` sub-app)

| ID | Stream | Surface | File | Weight | Status | Test coverage | Notes |
|---|---|---|---|---|---|---|---|
| COH-ADM-EVT-001 | admin | `GET /api/admin/events` | `src/routes/admin-events.ts:19` | 2 | 🚧 | none | |
| COH-ADM-EVT-002 | admin | `POST /api/admin/events` | `src/routes/admin-events.ts:34` | 3 | 🚧 | none | |
| COH-ADM-EVT-003 | admin | `PUT /api/admin/events/:id` | `src/routes/admin-events.ts:67` | 3 | 🚧 | none | |
| COH-ADM-EVT-004 | admin | `PATCH /api/admin/events/:id/status` | `src/routes/admin-events.ts:97` | 3 | 🚧 | none | Publish/unpublish |
| COH-ADM-EVT-005 | admin | `GET /api/admin/events/:id/registrations` | `src/routes/admin-events.ts:121` | 2 | 🚧 | none | |
| COH-ADM-EVT-006 | admin | `GET /api/admin/users` | `src/routes/admin-events.ts:147` | 2 | 🚧 | none | |
| COH-ADM-EVT-007 | admin | `GET /api/admin/users/:id` | `src/routes/admin-events.ts:172` | 2 | 🚧 | none | |
| COH-ADM-EVT-008 | admin | `PATCH /api/admin/users/:id` | `src/routes/admin-events.ts:196` | 3 | 🚧 | none | Role + status changes |

## 16. Admin — Audio (`/api/admin/audio`)

> ElevenLabs narration pipeline. Each handler does its own `userRole === 'admin'` check inline.

| ID | Stream | Surface | File | Weight | Status | Test coverage | Notes |
|---|---|---|---|---|---|---|---|
| COH-ADM-AUD-001 | admin | `POST /api/admin/audio/test` — preview voice synthesis | `src/routes/admin-audio.ts:25` | 2 | 🚧 | none | |
| COH-ADM-AUD-002 | admin | `POST /api/admin/audio/lessons/:lessonId` — generate lesson audio | `src/routes/admin-audio.ts:86` | 3 | 🚧 | none | Writes to R2 |
| COH-ADM-AUD-003 | admin | `POST /api/admin/audio/batch` — batch generation | `src/routes/admin-audio.ts:184` | 3 | 🚧 | none | |
| COH-ADM-AUD-004 | admin | `GET /api/admin/audio/status` — pipeline status | `src/routes/admin-audio.ts:306` | 2 | 🚧 | none | |

## 17. Admin — Seed (`/api/admin/seed`)

| ID | Stream | Surface | File | Weight | Status | Test coverage | Notes |
|---|---|---|---|---|---|---|---|
| COH-ADM-SEED-001 | admin | `POST /api/admin/seed` — seed demo data | `src/routes/admin-seed.ts:23` | 1 | 🚧 | none | `authMiddleware + adminOnly` |
| COH-ADM-SEED-002 | admin | `GET /api/admin/seed/status` | `src/routes/admin-seed.ts:414` | 1 | 🚧 | none | |

## 18. Ops — DB bootstrap (`/api/admin/db` + `/__db`)

> Same `adminDb` sub-app mounted at both paths. Used for cold-start migration + Stripe product bootstrap. The `/__db` mount precedes admin auth middleware — confirm gating before exposing publicly.

| ID | Stream | Surface | File | Weight | Status | Test coverage | Notes |
|---|---|---|---|---|---|---|---|
| COH-OPS-DB-001 | ops | `POST /api/admin/db/migrate` (also `POST /__db/migrate`) | `src/routes/admin-db.ts:19` | 1 | 🚧 | none | Applies Drizzle migrations |
| COH-OPS-DB-002 | ops | `POST /api/admin/db/reset` (also `POST /__db/reset`) | `src/routes/admin-db.ts:91` | 1 | 🚧 | none | Destructive — confirm guard before relying |
| COH-OPS-DB-003 | ops | `POST /api/admin/db/stripe-bootstrap` (also `POST /__db/stripe-bootstrap`) | `src/routes/admin-db.ts:128` | 1 | 🚧 | none | Creates Stripe products + prices |
| COH-OPS-DB-004 | ops | `GET /api/admin/db/ping` (also `GET /__db/ping`) | `src/routes/admin-db.ts:262` | 1 | 🚧 | none | DB connectivity probe |

## 19. SEO (no auth)

| ID | Stream | Surface | File | Weight | Status | Test coverage | Notes |
|---|---|---|---|---|---|---|---|
| COH-SEO-001 | platform | `GET /robots.txt` | `src/routes/seo.ts:9` | 1 | 🚧 | none | |
| COH-SEO-002 | platform | `GET /sitemap.xml` | `src/routes/seo.ts:17` | 2 | 🚧 | none | |

## 20. Utility surfaces (non-route)

> Imported and called by routes; not directly mounted but represent shipped functional surface.

| ID | Stream | Surface | File | Weight | Status | Test coverage | Notes |
|---|---|---|---|---|---|---|---|
| COH-UTIL-001 | platform | `src/utils/auth.ts` — token + password primitives | `src/utils/auth.ts` | 5 | ✅ | `test/utils/auth.test.ts` |
| COH-UTIL-002 | platform | `src/utils/logger.ts` | `src/utils/logger.ts` | 1 | ✅ | `test/utils/logger.test.ts` |
| COH-UTIL-003 | platform | `src/utils/email.ts` — Resend wrappers + templates | `src/utils/email.ts` | 3 | 🚧 | none |
| COH-UTIL-004 | platform | `src/utils/telnyx.ts` — SMS + RTC room creation | `src/utils/telnyx.ts` | 3 | 🚧 | none |
| COH-UTIL-005 | platform | `src/utils/elevenlabs.ts` — narration synthesis | `src/utils/elevenlabs.ts` | 2 | 🚧 | none |
| COH-UTIL-006 | platform | `src/utils/reminders.ts` — scheduled handler entry point | `src/utils/reminders.ts` | 3 | 🚧 | none |
| COH-UTIL-007 | platform | `src/utils/sentry.ts` — error reporting helper | `src/utils/sentry.ts` | 1 | 🚧 | none |
| COH-UTIL-008 | platform | `src/utils/validation.ts` — shared Zod schemas | `src/utils/validation.ts` | 2 | 🚧 | none |

## 21. Data layer

| ID | Stream | Surface | File | Weight | Status | Test coverage | Notes |
|---|---|---|---|---|---|---|---|
| COH-DATA-001 | platform | Drizzle schema — 21 tables | `src/db/schema.ts` | 5 | 🚧 | none | users, services, availability_slots, appointments, product_categories, products, orders, order_items, courses, course_modules, lessons, enrollments, lesson_progress, events, event_registrations, membership_plans, subscriptions, activity_log, email_campaigns, episodes, coupons |
| COH-DATA-002 | platform | `createDb()` — Hyperdrive/Neon connection | `src/db/index.ts` (inferred) | 5 | 🚧 | none | Used by every route file |
| COH-DATA-003 | platform | Drizzle migrations directory | `drizzle/` | 5 | 🚧 | none | Applied via `/api/admin/db/migrate` |

---

## Handler count by section (route handlers only — excludes utilities + data)

| Section | Handlers |
|---|---|
| 1. Platform | 8 (incl. 1 ❌ missing `/health`) |
| 2. Middleware | 6 |
| 3. Auth | 10 |
| 4. Subscriptions / Inner Circle | 4 |
| 5. The Show | 6 |
| 6. The Chair / Booking | 5 |
| 7. The Vault / Store | 6 |
| 8. The Academy | 5 |
| 9. The Stage / Events | 4 |
| 10. Comms / RTC | 4 |
| 11. Webhooks | 8 (1 route + idempotency + 6 dispatch branches) |
| 12. Admin — Courses | 17 |
| 13. Admin — Booking | 9 |
| 14. Admin — Store | 10 |
| 15. Admin — Events/Users | 8 |
| 16. Admin — Audio | 4 |
| 17. Admin — Seed | 2 |
| 18. Ops — DB | 4 |
| 19. SEO | 2 |
| 20. Utilities | 8 |
| 21. Data layer | 3 |
| **Total rows** | **133** |

## Status distribution

- ✅ Shipped & tested: 4 (rate-limit MW, webhook idempotency contract, utils/auth, utils/logger)
- 🚧 Shipped, tests pending: 128
- ❌ Not started / missing: 1 (`/health` endpoint contract from CLAUDE.md is absent)
- 🔍 Unknown: 0

The current direct route-test coverage is **0 of ~95 HTTP route handlers**. The 5 baseline tests
exercise the surrounding primitives (token, hash, logger, rate-limit middleware, KV idempotency
contract). Sprint PRs coh#48 (safety net) and coh#49 (220 tests) are explicitly intended to close
this gap; this matrix should be re-run after they merge.
