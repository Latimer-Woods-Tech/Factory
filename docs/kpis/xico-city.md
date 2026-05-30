# xico-city (DJMEXXICO) KPI brief

**Repo:** [`Latimer-Woods-Tech/xico-city`](https://github.com/Latimer-Woods-Tech/xico-city)
**Live:** not yet deployed (pre-production)
**Canonical spec:** [`DJMEXXICO_BuildRequirements_v1.md`](../../../xico-city/DJMEXXICO_BuildRequirements_v1.md)
**Status:** S-00 (Foundations) — 5 of ~150 planned features COMPLETE, ~10 BRIEFED, the rest PLANNED

---

## Purpose

DJMEXXICO is a **creative-economy operating system** for musicians, producers, vocalists, engineers, VJs, DJs, and promoters. **Not** a marketplace — that clarification was ratified in PR #230 (2026-05-09). The platform is built on a two-model LLM loop (Claude Opus as architect, Claude Haiku as executor) and ships across 29 slices with strict dependency ordering. Currently pre-production: schema and CI/CD scaffolded; first user-facing slice (S-01 audio slicer) is ~2–4 weeks away assuming the GCP Cloud Run processor is deployed and tested.

---

## Architecture

| Layer | Technology | Notes |
|-------|-----------|-------|
| Frontend | Cloudflare Pages + React 18 + TS strict | WaveSurfer.js 7+ for all waveforms |
| API | Cloudflare Workers + Hono | `/v1/` prefix, Zod validation, Drizzle ORM |
| Auth | **BetterAuth** (Neon-backed sessions) | HttpOnly cookies, server-side revocable |
| Database | Neon Postgres 16 + pgvector | 3 branches (main / staging / dev); Hyperdrive binding |
| Queue | Cloudflare Queues | Worker producer; Cloud Run consumer |
| Storage | Cloudflare R2 | Direct presigned uploads (Worker never sees bytes) |
| Processor | **GCP Cloud Run (Python 3.11)** | librosa, Demucs, Essentia, pyloudnorm, ffmpeg; ratified in spec |
| Payments | Stripe + Stripe Connect (Express) | Seller payouts gate marketplace launch |
| LLM | Anthropic Opus (architect) + Haiku (executor) | OPUS task brief → HAIKU implement → OPUS review |

Worker dispatches jobs to Cloud Run via HMAC-SHA256 signed `POST /jobs/process`. Cloud Run callbacks Worker on completion. Watchdog cron sweeps stuck jobs every 5 minutes.

---

## Summary by category

| Category | LIVE_WITH_KPI | LIVE_NO_KPI | NOT_INSTRUMENTED | PLANNED | Total |
|----------|---------------|-------------|------------------|---------|-------|
| user-facing | 0 | 3 (uploads, jobs, search) | 8 (auth, roles, listings, vocal) | 2 (stem, cover) | 13 |
| financial | 0 | 1 (Stripe webhook idempotency) | 3 (connect, checkout, download) | 0 | 4 |
| monitoring | 0 | 4 (health, sentry, CI, deploy) | 0 | 0 | 4 |
| data | 1 (watchdog cron) | 0 | 0 | 3 (DA / CS / AL) | 4 |
| integration | 0 | 2 (processor, idempotency) | 0 | 0 | 2 |
| compliance | 0 | 0 | 0 | 4 (GDPR / DMCA / consent / safety) | 4 |
| **Total** | **1** | **10** | **11** | **9** | **31** |

See [`inventory.tsv`](inventory.tsv) (rows `F-XC-001` through `F-XC-031`).

---

## Build order (from spec)

Foundation slices must complete before any other slice. Each gate requires E2E passing:

| Order | Slice | Gate to next |
|-------|-------|--------------|
| 1 | S-01 Slicer to Asset (11 features) | All 11 COMPLETE + E2E Playwright passing |
| 2 | S-02 Stem Separation | Demucs running on Cloud Run |
| 3 | S-03 Vocal Workspace | Vocal pipeline validated |
| 4 | MO Monetization | Stripe Connect + payout flow tested |
| 5 | NT Notifications | In-app + email firing correctly |
| 6 | OB Onboarding | 11 creator roles complete |
| 7 | CS Content Safety | Report + moderation + strike system live |
| 8 | DA Data & Privacy | GDPR export + deletion E2E tested |

**No feature from slice N+1 starts until all of slice N is COMPLETE.** This is the project's primary risk-management invariant.

---

## Top 10 highest-value KPIs not currently measured

1. **S-01 Completion Rate** — % of S-01 features marked COMPLETE. Leading indicator of pipeline viability.
2. **Upload → Slice → Asset E2E Success** — Critical user journey from spec. Must pass before any other slice.
3. **Worker Job Success Rate by kind** (slice, stem_separate, vocal_process, image_process, analysis). Currently a black box; only Cloud Run logs exist.
4. **R2 Presigned Upload Confirmation Rate** — Client never sends bytes to Worker; direct-to-R2 must be reliable.
5. **Stripe Connect Onboarding Completion** — MO gate; seller payouts can't launch without it.
6. **Demucs Model Load + Stem Separation Latency** — S-02 gate; ~1GB model weights.
7. **WaveSurfer Cut Review Interaction Rate** — Most complex frontend component in S-01. UX guardrail: confirm disabled until user interacts.
8. **Neon Migration Rollback Success** — Every migration must include rollback; tested dev → staging → prod.
9. **Feature Registry Completeness** — ~150 features defined; current kanban tracks ~10. Meta-KPI for planning hygiene.
10. **Cloud Run Worker Disk Cleanup Rate** — Temp files in `/tmp/{job_id}/` must be cleaned on every code path (success / fatal / retryable). Disk exhaustion kills the worker.

---

## Surprising findings

1. **`factory_events` table exists but is unused.** Schema includes it; spec mandates posting 12 event types; no route handlers emit to it. A ~200-line refactor opportunity waiting to be discovered.

2. **PostHog is specified but not integrated.** `BUILD_PLAN §4.2` lists PostHog client events. `package.json` has `@latimer-woods-tech/analytics`. But no actual `posthog()` calls in `src/routes/`. Likely dead code or awaiting refactor.

3. **Stripe webhook is idempotent by design but untested.** `stripe_events` `PRIMARY KEY` on `event_id` guarantees no duplicate processing, but there's no test asserting this.

4. **Processor dispatch has no timeout.** Worker posts to Cloud Run and waits for 202; if Cloud Run is down, the request will hang until Workers' 120s timeout. No circuit breaker or upstream health check.

5. **Session revocation is server-side but not audited.** Sessions are revocable, but no `sessions.revoked_reason` column or `factory_events.session.revoked` event. Why a session was revoked is not recoverable.

6. **Kanban is not the source of truth.** Spec explicitly: "The feature registry is the source of truth. If something is not in the registry, it does not exist as a build requirement." `DJMEXXICO_FeatureRegistry_v3.xlsx` and `DJMEXXICO_BuildRequirements_v1.md` are canonical; `registry/features.yaml` is a partial view.

7. **Two-model LLM loop is load-bearing.** Every feature: OPUS task brief → HAIKU implement → OPUS review. HAIKU never proceeds on ambiguity; clarification request is the correct output. This is the defined build process, not scaffolding.

---

## Blind spots

1. **Audio processing pipeline not deployed.** Demucs, librosa, ffmpeg are in requirements but Cloud Run service URL is stubbed.
2. **Marketplace end-to-end untested.** Upload → slice → listing → checkout → license → download is a 6-step journey; only steps 1–3 are live.
3. **BetterAuth migration risk.** PR #238 BetterAuth migration may be partially merged; final state unclear.
4. **No load testing.** Rate limits exist in `wrangler.toml` (AUTH 10/15m, API 600/m) but no simulation of 100+ concurrent creators.
5. **Cron jobs have a single point of failure.** `watchdog` is the only cron live; future crons (`gdpr-erase`, `payout-recon`) are PLANNED. If watchdog fails, stuck jobs accumulate indefinitely.

---

## Conclusion

xico-city is **technically sound but functionally incomplete**. Foundation layer (S-00) is solid; the Workers + Cloud Run split is the right call; schema is normalized and indexed correctly. But **ledger instrumentation is a gap** — `factory_events` exists but is empty, PostHog is missing, SLOs are drafted but not enforced.

The project is ~2–3 weeks from shipping S-01 (upload → slice → render) **assuming Cloud Run processor is deployed and tested**. Every feature from S-01 onward depends on `factory_events` flowing — that's the critical unblocked task.
