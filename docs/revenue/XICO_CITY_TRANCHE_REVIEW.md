# DJMEXXICO (xico-city) — Tranche Opportunity Review

**Date:** 2026-04-29
**Updated:** 2026-05-05 — product identity corrected to DJMEXXICO per `BUILD_PLAN_v2.md`.
**Reviewed repo:** `Latimer-Woods-Tech/xico-city`
**Verdict:** promising tranche asset and now committed to the full World Class 360 build, but not ready until the foundation is repaired first.

Canonical technical design reference: `docs/architecture/XICO_CITY_LOW_LEVEL_ARCHITECTURE.md`.

> **Product identity note:** This repo was previously described in Factory docs as a "Mexico City experiences marketplace." That description was incorrect. The canonical product is **DJMEXXICO — a creative economy operating system for artists** (11 roles: Producer, Vocalist, DJ, VJ, Songwriter, Engineer, Visual Artist, Curator, A&R, Supervisor, Promoter). See `BUILD_PLAN_v2.md` §1.2 in the xico-city repo for the explicit correction.

> **April 29 decision:** Build DJMEXXICO (xico-city) all the way through the World Class 360 plan. The transaction-ready MVP (S-00→S-01: audio upload → slice → asset → marketplace) remains the first proof gate, not the final target.

---

## 1. Executive verdict

DJMEXXICO is promising because it can become the **creative economy vertical** in the Factory tranche:

- artists upload raw material (audio, video, image) → platform processes → production-ready assets → marketplace,
- buyers discover rights-declared assets via search (FTS, Camelot key, pgvector similarity),
- Stripe Checkout and Stripe Connect create real transaction flow,
- Factory video automation can generate artist promo and asset preview videos,
- Factory analytics/CRM can measure asset publish rates, sales, and LTV,
- Admin Studio can operate moderation, DMCA handling, payouts, and health.

Audio/image/video processing runs on a Hetzner CX32 Python worker (librosa, Demucs, Pillow, ffmpeg) — outside the Cloudflare Worker. This is a documented deviation from Factory Workers-only standing orders; the compute requirement physically cannot run in a Worker.

Recommended tranche role:

> DJMEXXICO (xico-city) should be the creative-economy platform completed before tranche build-up. Completion means the full 11-slice plan: foundations, auth (Lucia v3), asset upload pipeline, marketplace discovery, Stripe payments, audio/visual processing, role subscriptions, payouts, compliance, and PWA polish.

---

## 2. How it fits the Factory portfolio

| Factory asset | DJMEXXICO use |
|---|---|
| `@latimer-woods-tech/errors` | Worker error boundary and typed API responses |
| `@latimer-woods-tech/monitoring` | Sentry Worker instrumentation |
| `@latimer-woods-tech/logger` | Structured JSON logging |
| `@latimer-woods-tech/stripe` | asset checkout, subscriptions, Connect payouts |
| `@latimer-woods-tech/neon` | asset/job data, audit ledger, sessions |
| `@latimer-woods-tech/analytics` | upload → purchase funnel, artist activation, LTV |
| `@latimer-woods-tech/email` | purchase confirmation, job status, payout notices |
| `@latimer-woods-tech/content` / `copy` / `seo` | experience pages, neighborhood pages, programmatic SEO |
| `@latimer-woods-tech/video` / `schedule` | AI-generated listing videos and neighborhood guides |
| `@latimer-woods-tech/compliance` | consent, deletion, DMCA, dispute/audit trail |
| Admin Studio | operator workflows for moderation, bookings, refunds, hosts, payouts |

### Unique portfolio value

Xico City adds something the other apps do not: **real-world commerce and marketplace transaction data**. That improves the tranche story because it proves Factory can support:

- subscriptions,
- one-time payments,
- booking lifecycle,
- host onboarding,
- reviews/trust,
- payout operations,
- location/search UX,
- compliance and support workflows.

---

## 3. Product promise

The strongest product angle is not “generic travel marketplace.” That is too broad and competitive.

Better wedge:

> Curated Mexico City experiences with high-trust hosts, AI-assisted listing media, and simple booking.

Best initial verticals:

1. Food and neighborhood walks.
2. Wellness and practitioner experiences.
3. Culture/nightlife micro-events.
4. Creator-led local experiences.

The wellness/practitioner vertical has the strongest synergy with SelfPrime and Practitioner Video Studio.

---

## 4. Current repo state

### Strong

- The build plan is unusually mature: product, stack, architecture, observability, security, SLOs, compliance, DR, feature registry, and orchestrator are documented.
- The repo has a feature registry with 12 slices from foundations to PWA polish.
- S-00 implementation exists on main with Worker entry, health route, Sentry middleware, schema, CI, deploy workflow, and basic test.
- The product concept maps well to existing Factory packages.

### Not ready

The repo is currently not executable/releasable:

- no `package-lock.json`, so `npm ci` fails locally and in Actions,
- dependencies are not installed, so typecheck/test cannot run,
- latest GitHub Deploy/CI/Registry workflows are failing at dependency install,
- CI references `npm run lint` and `npm run build`, but the app package does not define those scripts,
- dependency versions use semver ranges instead of exact Factory pins,
- `wrangler.jsonc` enables `nodejs_compat`, which conflicts with the intended Workers-safe constraint posture,
- `/ready` appears mis-mounted: the router defines `/ready`, then the same router is mounted at `/ready`, making the real readiness route likely `/ready/ready` while `/ready` returns the health root,
- runtime code uses `global`, `global as any`, and console logging in production paths,
- schema has likely compile issues in table callbacks that reference `table` without receiving it in some callback parameters,
- no Drizzle migration SQL is committed despite schema acceptance criteria,
- no live `curl /health` verification exists for Xico City,
- no frontend/PWA exists,
- no booking checkout, host onboarding, or Stripe webhook implementation exists yet.

---

## 5. Opportunity assessment

### Promise score: 8.5/10

Xico City is promising as a tranche asset if built with strong operating discipline. It has a clear monetization path:

- booking fee / take rate,
- host subscription for better listings,
- traveler subscription for curated drops/member pricing,
- paid promo video generation for hosts,
- sponsored experiences or featured placements,
- affiliate partnerships later.

### Execution risk score: 7/10

Risk is high because marketplace apps create operational drag:

- supply acquisition,
- refunds/cancellations,
- disputes,
- no-shows,
- safety/trust,
- payout issues,
- customer support,
- local regulatory ambiguity.

### Strategic fit score: 8/10

It fits the Factory tranche as the **marketplace proof point**, while Practitioner Video Studio is the **fastest cash-flow proof point**.

### ADHD/introvert fit score: 5/10 unless heavily automated

A broad local marketplace is not ideal for introverted/no-outreach execution. The mitigation is to make host onboarding, demo content, SEO, listing media, booking support, refunds, and operator review workflows as self-serve and automated as possible.

---

## 6. Completion definition

World Class 360 defines Xico completion as all 12 planned slices. The transaction-ready MVP is still the first milestone because it proves the money path before the full marketplace expands.

First milestone — **Transaction-Ready Xico MVP**:

1. Public landing and category pages.
2. Auth/register/login/profile.
3. Host onboarding with Stripe Connect test mode.
4. Host creates an experience listing.
5. Admin approves listing.
6. Visitor browses/searches listing.
7. Visitor books with Stripe Checkout test mode.
8. Stripe webhook confirms booking idempotently.
9. Email confirmation sends.
10. Admin can see bookings and failed webhooks.
11. PostHog/factory_events capture the funnel.
12. `/health` and `/ready` return correct status and are curl-verified.
13. Basic PWA/mobile shell passes smoke and accessibility checks.

This is enough to show tranche value while the remaining slices continue.

Final World Class 360 completion adds:

1. Reviews and trust workflows.
2. Explorer/Local subscriptions.
3. Host payouts and payout reports.
4. Curator collections.
5. DMCA/GDPR/consent flows.
6. Installable PWA shell.
7. Accessibility and performance gates.
8. Synthetic monitoring and user-journey SLOs.
9. Admin Studio operator hooks.
10. Seed/demo data and launch package.

---

## 7. Required repair sequence

### Phase X0 — Stabilize repo and CI

Owner: Platform agent  
Duration: 0.5–1 day  
Exit: CI green on main.

Tasks:

- Generate and commit `package-lock.json`.
- Fix GitHub Packages auth and `npm ci`.
- Add missing `lint` and `build` scripts or remove CI references until implemented.
- Pin `@latimer-woods-tech/*` versions exactly.
- Remove `nodejs_compat` unless a documented waiver exists.
- Fix `/ready` route mounting.
- Remove `global as any` and production console calls.
- Fix schema table callbacks.
- Add tests for `/health` and `/ready`.
- Run typecheck, test, registry validation, forbidden API check.

### Phase X1 — True foundations

Owner: Foundation agent  
Duration: 1–2 days  
Exit: deployed Worker `/health` and `/ready` verified with direct HTTP.

Tasks:

- Harden `Env` bindings.
- Add Sentry without globals.
- Add Drizzle migration generation.
- Add deploy workflow with correct staging/production URL selection.
- Add service registry entry in Factory if the Worker is deployed.

### Phase X2 — Identity and profiles

Owner: Auth agent  
Duration: 2–3 days  
Exit: register → login → refresh → `/api/me` smoke passes.

Tasks:

- Register.
- Login.
- Refresh rotation.
- Logout/session revoke.
- Profile update.
- Rate-limit auth routes.
- Emit auth events.

### Phase X3 — Host onboarding and catalog

Owner: Marketplace supply agent  
Duration: 3–5 days  
Exit: host can create listing and admin can approve.

Tasks:

- Host profile.
- Stripe Connect onboarding test mode.
- Experience create/edit/version.
- Schedule slots.
- Media placeholder or R2 upload.
- Admin moderation queue.

### Phase X4 — Discovery and booking

Owner: Commerce agent  
Duration: 3–5 days  
Exit: visitor can book in Stripe test mode and booking becomes confirmed from webhook.

Tasks:

- Public listing pages/API.
- Search/filter minimal path.
- Booking transaction.
- Stripe Checkout.
- Signed webhook.
- Idempotent `stripe_events`.
- Booking confirmation email.
- Cancellation/refund placeholder.

### Phase X5 — Reviews, subscriptions, payouts, and curator tooling

Owner: Xico product + commerce agents  
Duration: 5–10 days  
Exit: reviews, subscriptions, payouts, and curator collections pass integration tests.

Tasks:

- Verified-booking reviews.
- Review reports and moderation actions.
- Explorer/Local subscription plans.
- Stripe Billing portal.
- Member-only listing/price gates.
- Host payout ledger and Stripe Connect transfer path.
- Payout reports and CSV export.
- Curator collections and public share pages.

### Phase X6 — Compliance and World Class 360 PWA polish

Owner: UX/Ops agent  
Duration: 5–8 days  
Exit: World Class 360-ready app.

Tasks:

- Mobile-first PWA shell.
- SEO pages for neighborhoods/categories.
- GDPR export/delete.
- DMCA/takedown intake.
- Consent logs UI.
- Smoke tests.
- Accessibility test.
- Synthetic monitor target.
- Admin/operator runbook.
- Demo data seed.

---

## 8. Synergy opportunities to capture

### Xico City × Practitioner Video Studio

Hosts can buy AI-generated listing videos:

- experience promo video,
- host intro video,
- neighborhood guide,
- post-booking recap.

This turns Practitioner Video Studio into a revenue tool inside Xico, not a separate distraction.

### Xico City × SelfPrime

SelfPrime practitioners can become Xico wellness hosts:

- Human Design reading sessions,
- wellness workshops,
- local retreats,
- private client experiences.

### Xico City × VideoKing patterns

Borrow:

- creator onboarding,
- payout audit,
- moderation queue,
- DLQ/retry patterns,
- revenue integrity review.

Do not couple runtime.

### Xico City × Admin Studio

Use Admin Studio as operator console for:

- host approvals,
- booking failures,
- webhook replay,
- refunds/disputes,
- payout status,
- SLO and synthetic checks.

---

## 9. Go/no-go decision

### Go, with full World Class 360 scope

Xico City is worth completing before pausing app expansion because it rounds out the tranche with a marketplace/commerce asset.

### Guardrail

A full marketplace build adds operational risk. The mitigation is not to shrink the target; it is to enforce strict slices, quality gates, direct verification, and operator tooling before public launch.

Recommended decision:

> Complete Xico City through the full World Class 360 plan, while using the transaction-ready MVP as the first gate and Practitioner Video Studio as the parallel revenue engine.
