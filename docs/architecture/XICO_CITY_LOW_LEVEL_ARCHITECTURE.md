# DJMEXXICO (xico-city) Low-Level Architecture

**Date:** 2026-05-05
**Updated:** 2026-05-05 — product identity corrected to DJMEXXICO; code fixes applied.
**Status:** Canonical for xico-city technical design and ecosystem integration map.
**Scope:** Requirements completeness, system boundaries, runtime topology, data model, API contracts, and Factory ecosystem dependencies.

---

## 1. Executive Answer

### Are core requirements, architecture, and design complete?

Not yet.

- Product requirements are detailed and locked in `BUILD_PLAN_v2.md` (DJMEXXICO canonical spec).
- Architecture intent exists across multiple docs, but there was no single low-level canonical spec in Factory.
- Runtime code partially reflects the correct architecture; gaps remain at auth layer and processor integration.

This document is the canonical low-level architecture reference.

### Do we know what xico-city connects to in the greater ecosystem?

Yes. Connections are now explicit in this document and in `docs/service-registry.yml`.

Canonical public domain: `xicocity.com`.

---

## 2. Canonical Product Intent

**DJMEXXICO is a creative economy operating system for artists**, NOT a Mexico City experiences marketplace.

`BUILD_PLAN_v2.md` §1.2 is explicit: "This is not a Mexico City booking app. Any document describing it as one is wrong and must be corrected."

Product scope:

- 11 artist roles across music, visual art, and performance (Producer, Vocalist, DJ, VJ, Songwriter, Engineer, Visual Artist, Curator, A&R, Supervisor, Promoter)
- Artists upload raw material → platform processes → production-ready assets → marketplace
- Buyers discover and purchase via Stripe Checkout; sellers connect Stripe Connect
- Audio/image/video processing runs on Hetzner CX32 Python worker (librosa, Demucs, Pillow, ffmpeg) — not in the Worker
- Build-time LLM orchestration: OPUS→HAIKU loop (claude-opus-4-5 → claude-haiku-4-5)

Source-of-truth docs:

- `Latimer-Woods-Tech/xico-city/BUILD_PLAN_v2.md` — canonical product spec (wins on all conflicts)
- `Latimer-Woods-Tech/xico-city/legacy/DJMEXXICO_BuildRequirements_v1.md` — full business rules and ACs ("the build bible")
- `docs/service-registry.yml` (Factory) — infrastructure registry

**Prior Factory docs describing xico-city as a "Mexico City experiences marketplace" were incorrect and have been corrected.**

---

## 3. Known Divergences (Fixed 2026-05-05)

| Issue | Status | Resolution |
|---|---|---|
| `wrangler.jsonc` `nodejs_compat` flag | **Fixed** | Removed — violates Factory hard constraint |
| `/ready` route returned health payload (bug: `/ready/ready` was real readiness) | **Fixed** | Split into `createHealthRouter` (`/health`) and `createReadinessRouter` (`/ready`) |
| `xicocity.com` not wired in `wrangler.jsonc` | **Fixed** | Added `custom_domains: ["xicocity.com"]` for production; `staging.xicocity.com` for staging env |
| Factory docs described wrong product | **Fixed** | Architecture doc rewritten to DJMEXXICO identity |
| Auth layer: code uses `@latimer-woods-tech/auth` JWT, spec requires Lucia Auth v3 | **Open** | Requires migration to Lucia Auth v3 (Neon-backed sessions, Argon2id passwords) |
| Schema tables reflect experiences/bookings, not DJMEXXICO asset/job model | **Open** | Schema migration required once DJMEXXICO S-00 implementation begins |
| Staging worker endpoint returning 404 | **Open** | Needs fresh staging deploy after wrangler.jsonc fixes |

---

## 4. Requirements Completion Matrix (DJMEXXICO Canonical)

| Area | Required | Status | Notes |
|---|---|---|---|
| S-00 Foundations | Health, env typing, schema baseline, CI baseline | Partial | Health fixed; readiness fixed; staging not live. |
| Auth | Lucia Auth v3 — sessions, Argon2id, Http-only cookies | Not started | Current code uses JWT; migration to Lucia required per spec. |
| Asset upload pipeline | Upload → analysis → slice → asset publish | Not started | Requires Hetzner worker integration via Cloudflare Queues. |
| Marketplace | Asset discovery, FTS, pgvector similarity, purchase | Not started | Defined in build bible; not yet implemented. |
| Stripe payments | Checkout + Connect + idempotent webhook | Partial | `stripe_events` table exists; end-to-end flow not proven. |
| Audio processing | librosa / Demucs / Essentia on Hetzner CX32 | Not started | Python worker, separate compute, queues integration. |
| Visual processing | Pillow / AI cover art (Replicate/FLUX/SDXL) / VJ packs | Not started | Defined in BUILD_PLAN_v2. |
| Role subscriptions | free / creator / pro tiers + entitlements | Not started | Defined in BUILD_PLAN_v2 §1.3. |
| Payouts | Stripe Connect transfers + reconciliation | Planned | Defined in build bible. |
| Compliance | GDPR / DMCA / moderation evidence | Planned | Defined in build bible. |
| PWA | Mobile-first + WCAG 2.2 AA | Planned | React 18 + Cloudflare Pages. |

---

## 5. Target Runtime Topology

### 5.1 API Worker (Cloudflare Workers + Hono v4)

1. Client surfaces (web PWA) call DJMEXXICO Worker API.
2. Worker enforces auth (Lucia sessions — target state), business rules, rate limits.
3. Worker reads/writes Neon Postgres via Hyperdrive `DB` binding.
4. Worker writes presigned R2 URLs for asset storage.
5. Worker executes Stripe Checkout, Connect, and webhook handling.
6. Worker enqueues processing jobs via Cloudflare Queues to Hetzner worker.

### 5.2 Hetzner CX32 Python Worker (External Compute)

- Audio: librosa, pydub, pyloudnorm, Demucs, Essentia, mutagen, ffmpeg
- Visual: Pillow, Replicate/FLUX/SDXL, ffmpeg
- Communicates with Cloudflare Worker via Cloudflare Queues and direct HTTP (`PROCESSOR_URL`)
- Cannot run inside a Cloudflare Worker — documented waiver in `BUILD_PLAN_v2.md` §2

### 5.3 LLM (Build-Time Only)

- OPUS→HAIKU orchestration loop (claude-opus-4-5 → claude-haiku-4-5 → OPUS review)
- Not a runtime dependency; not exposed to end users in v1

---

## 6. Low-Level Component Design

### 6.1 HTTP/API Layer

- Framework: Hono v4
- Global error handling via `@latimer-woods-tech/errors`
- Sentry middleware via `@latimer-woods-tech/monitoring`
- Auth: **Lucia Auth v3** (Neon sessions, Argon2id) — per `BUILD_PLAN_v2.md` §2 auth row

Required base routes:

- `GET /health` → liveness (always 200 if Worker is running)
- `GET /ready` → readiness probes (DB + processor bindings; 200/503)
- `GET /factory/compat` → integration contract compat info
- `GET /api/me` → authenticated payload (temporary; will be replaced by Lucia session routes)

### 6.2 Data Layer (Target State — Requires Schema Migration)

Current schema reflects experiences/bookings tables (wrong product). Target DJMEXXICO schema per build bible:

- `users`, `sessions` (Lucia-compatible)
- `artists`, `artist_roles`
- `assets`, `asset_versions`, `asset_tags`
- `jobs` (processing queue jobs)
- `listings`, `purchases`
- `stripe_events` (idempotent Stripe ingestion)
- `subscriptions`
- `factory_events` (mandatory for Factory analytics ledger)

### 6.3 Security and Secrets

- No secrets in source or `wrangler.jsonc` vars.
- Worker secrets via `wrangler secret put` / GitHub Actions.
- Auth secret rotation per environment; Lucia session store in Neon.

### 6.4 Observability

- Sentry DSN required (Worker boots Sentry on first request).
- PostHog + `factory_events` both required.
- `/health` and `/ready` are mandatory deployment gates.

---

## 7. Ecosystem Integration Map

| Integration | Purpose | Boundary |
|---|---|---|
| `@latimer-woods-tech/errors` | Typed errors and safe API responses | Runtime |
| `@latimer-woods-tech/monitoring` | Sentry integration | Runtime |
| `@latimer-woods-tech/logger` | Structured JSON logs | Runtime |
| `@latimer-woods-tech/neon` | DB adapter patterns for Hyperdrive/Drizzle | Runtime |
| `@latimer-woods-tech/stripe` | Checkout/connect/webhook integration | Runtime |
| `@latimer-woods-tech/email` | Transactional messaging (Resend) | Runtime |
| `@latimer-woods-tech/analytics` | PostHog + `factory_events` contract | Runtime |
| `@latimer-woods-tech/llm` | Build-time OPUS→HAIKU loop | Build-time only in v1 |
| Cloudflare Worker `xico-city` | Public API surface | Primary runtime service |
| Cloudflare Worker `xico-city-staging` | Staging API surface | Non-production runtime |
| Neon Postgres via Hyperdrive `DB` | Primary relational data | External managed DB |
| Hetzner CX32 Python worker | Audio/image/video processing | External compute (documented waiver) |
| Cloudflare R2 | Asset storage (presigned URLs) | External storage |
| Cloudflare Queues + DLQ | Job dispatch to processor | Internal queueing |
| Replicate API | AI cover art generation (FLUX/SDXL) | External AI service |
| Admin Studio + SLO probes | Operator/monitoring consumers | Cross-app operational dependency |

---

## 8. Verification Snapshot (2026-05-06)

- `https://xico-city.adrper79.workers.dev/health` → `200` ✅
- `https://xico-city.adrper79.workers.dev/ready` → `200` ✅ (route fix confirmed)
- `https://xico-city-staging.adrper79.workers.dev/health` → `200` ✅
- `https://xico-city-staging.adrper79.workers.dev/ready` → `200` ✅
- `https://xicocity.com/health` → `200` ✅ (custom domain live-verified 2026-05-06)

---

## 9. Remaining Open Work

1. **Migrate auth from `@latimer-woods-tech/auth` JWT to Lucia Auth v3** — per `BUILD_PLAN_v2.md` §2. Current code is a temporary stub.
2. **Migrate schema from experiences/bookings to DJMEXXICO asset/job model** — current `src/db/schema.ts` is wrong for DJMEXXICO; requires new Drizzle schema + migration.
3. **Redeploy staging** — `wrangler deploy --env staging` after `wrangler.jsonc` fix to restore 200 at `/health`.
4. **Verify `xicocity.com` custom domain** — redeploy production with `custom_domains` in `wrangler.jsonc`; run `curl https://xicocity.com/health` for 200 confirmation; update registry status.
5. **Wire Cloudflare Queues + DLQ** — job dispatch to Hetzner processor is not yet configured.
6. **Schema migration** — replace experiences-era tables with DJMEXXICO canonical schema.

---

This file is the canonical low-level architecture and integration map for the DJMEXXICO worker (`xico-city`) inside Factory until superseded by a newer architecture version.

This file is the canonical low-level architecture and integration map for the DJMEXXICO worker (`xico-city`) inside Factory until superseded by a newer architecture version.