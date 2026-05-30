# capricast KPI brief

**Repo:** [`Latimer-Woods-Tech/capricast`](https://github.com/Latimer-Woods-Tech/capricast) (Pages project: `videoking` — rename incomplete)
**Live:** [capricast.com](https://capricast.com)
**Priority:** Stage 2 (video publishing platform)
**First live video:** 2026-05-20 (`capricast.com/watch/5209dd21-71a8-4ee4-afeb-0c030ade1a70`)

---

## Purpose

Capricast receives rendered videos from Factory's render pipeline via `POST /api/admin/videos/import`, publishes them as watch pages with `VideoObject` JSON-LD, and serves creator dashboards, analytics, and monetization surfaces. It is the audience-facing delivery layer for the Factory → Capricast video pipeline.

---

## Summary by category

| Category | Features | LIVE_WITH_KPI | LIVE_NO_KPI | NOT_INSTRUMENTED |
|----------|----------|---------------|-------------|------------------|
| user-facing | 18 | 5 | 10 | 3 |
| data | 16 | 8 | 6 | 2 |
| integration | 8 | 4 | 4 | 0 |
| monitoring | 8 | 5 | 3 | 0 |
| **Total** | **50** | **22** | **23** | **5** |

See [`inventory.tsv`](inventory.tsv) (rows `F-CAP-001` through `F-CAP-050`).

---

## Pipeline-receiver KPIs (Factory → Capricast health)

| Signal | Proposed KPI | Threshold | Window | Status |
|--------|--------------|-----------|--------|--------|
| `POST /api/admin/videos/import` 201 | Import Success Rate | ≥99.5% | rolling 30d | LIVE_WITH_KPI |
| `POST /api/admin/videos/:id/sync-captions` | Transcript Sync Time-to-Publish | <5min median | per video | LIVE_NO_KPI |
| Watch page → `VideoObject` JSON-LD | JSON-LD Schema Validity | 100% conformance | per video | LIVE_WITH_KPI |
| Import → public watch page | Video Publish Latency | <1h | rolling 24h | LIVE_NO_KPI |

**Gap.** No correlation between Factory's render completion timestamp and Capricast's first-watch timestamp. Adding `factory_render_completed_at` to the import body would close this.

---

## Audience-facing KPIs

| Signal | Proposed KPI | Threshold | Window | Status |
|--------|--------------|-----------|--------|--------|
| Watch page render | Watch Page Load p95 | <1s | rolling 7d | LIVE_NO_KPI |
| `posthog.capture("video_played")` | Video Playback Success Rate | ≥99% | rolling 7d | LIVE_NO_KPI |
| `growth_events.watch_checkpoint` | Viewer Retention at 50% | ≥60% | rolling 90d | LIVE_WITH_KPI |
| `videos.views_count` increments | View Count Path Reliability | 100% | per play | NOT_INSTRUMENTED |
| Feed cold-start (`/api/feed`) | Feed Personalization Fallback Rate | <5% | rolling 7d | LIVE_NO_KPI |

**Gap.** PostHog events fire client-side but no backend confirmation exists — drift between PostHog play count and Cloudflare Stream view count is invisible. `videos.views_count` columns exist but no `UPDATE` paths were found in read-only search — view counters may be wired but undiscovered, or wired through Cloudflare Stream API (dashboard-only, not persisted).

---

## Creator-economy KPIs

Capricast has a sophisticated earnings + payout layer that's only partly measured:

| Signal | Proposed KPI | Threshold | Window | Status |
|--------|--------------|-----------|--------|--------|
| `earnings.type` distribution | Revenue Mix (sub / unlock / tip / ad) | informational | rolling 30d | LIVE_WITH_KPI |
| `cohortTracking` | D7/D14/D30 Retention | ≥70% D7 | rolling 30d | LIVE_NO_KPI |
| `churnTracking` | Churn Rate | <5% | rolling 30d | LIVE_NO_KPI |
| `payout_runs.status` | Payout Time-to-Creator | ≤3 business days | rolling 30d | LIVE_NO_KPI |
| `admin/analytics/arpu` endpoint | ARPU | ≥$2.00 | rolling 30d | LIVE_NO_KPI |

---

## Top 5 highest-value KPIs not measured

1. **Video Publish Latency end-to-end (Factory → Capricast → watchable)** — no timestamp correlation across the boundary.
2. **Transcript Presence Rate** — fire-and-forget `/sync-captions` returns 202 (pending) with no retry/dead-letter; videos may ship without transcripts. Direct SEO impact on `VideoObject.transcript` field.
3. **Chat/Polls real-time engagement** — `chat_messages`, `polls`, `poll_votes` tables exist for Durable Object `VideoRoom` features, no aggregation.
4. **Creator-to-Video revenue attribution** — `earnings.creatorId` is tracked but no `trigger_video_id`. Can't compute revenue per video published.
5. **A/B test variant lift** — `experiments` router is a placeholder; no measurement of variant assignment or behavioral lift.

---

## Surprising findings

1. **videoking → capricast rename incomplete.** Cloudflare Pages project is still named `videoking`. Codebase uses `capricast` everywhere. Branding URL is `capricast.com`. Infrastructure deployment binding lags.

2. **`views_count` / `likes_count` columns present, but no `UPDATE` path found.** Either:
   - Incremented in a route not surfaced by read-only search (queue consumer, Durable Object)
   - Synced from Cloudflare Stream via `getVideoAnalytics()` for dashboard reads only (not persisted)
   - Placeholder columns awaiting wiring
   Verify before relying on `videos.views_count` as a KPI source.

3. **Transcript sync is fire-and-forget.** `POST /admin/videos/:id/sync-captions` returns 202 with no retry or dead-letter mechanism. Failed syncs leave `videos.transcript` `NULL`. SEO crawler sees empty `<script type="application/ld+json">` blocks.

4. **Admin endpoints use bearer token, not session.** `Authorization: Bearer <CAPRICAST_PUBLISH_TOKEN>` for `/admin/*`. Returns 401 if token unset. Token rotation/audit not visible in code (likely in Wrangler secrets management).

5. **Feed requires `x-user-id` header but silently degrades when absent.** Anonymous users get trending feed; no 401, no clear telemetry that anonymous traffic is hitting the personalized path.

6. **CORS failures on `/api/notifications` and `/api/auth/entitlements`** — user reported console errors. Worker not emitting `Access-Control-Allow-Origin` for these routes. Per CLAUDE.md hard constraint: CORS origin must be explicit allowlist when `credentials: true`. This is a production bug, not a KPI gap.

7. **PWA icon 404.** `icon-192.png` referenced in `apps/web/public/manifest.json` but file missing. Matches user console error.

8. **React hydration error #418 on watch pages.** Text content mismatch between server render and client. Likely cause: date formatting, `Math.random()`, or browser-only API used during render. `apps/web/src/app/watch/[videoId]/page.tsx` is the likely culprit given VideoObject JSON-LD generation includes timestamps.

---

## Blind spots

- **Cloudflare Stream webhook integration** — no visible polling or webhook handler for Stream upload state. Are videos waiting on Stream `processing → ready`? No SLO on Stream readiness.
- **Embedding pipeline** — `POST /videos` queues to `EMBEDDING_QUEUE` but no visible consumer handler. Embedding status (tagged + vectorized) not persisted. Feed ranking may serve un-embedded videos.
- **Sentry scope** — `sentryMiddleware` attached globally, but no explicit spans/breadcrumbs for DB query performance, Cloudflare API latencies, or JSON-LD rendering.
- **Payouts drift risk** — `payout_runs` + reconciliation exist but no automated nightly Stripe reconciliation; manual intervention required?
- **CORS allowlist** — hardcoded to `APP_BASE_URL` + localhost. New deploy targets fail silently until env var updated.

---

## Immediate actions (from user console errors)

| Error | Root cause | Fix location |
|-------|------------|--------------|
| CORS on `/api/notifications` | Worker missing `Access-Control-Allow-Origin` for this route | `apps/worker/src/index.ts` CORS middleware |
| CORS on `/api/auth/entitlements` | Same | `apps/worker/src/routes/auth.ts` |
| `icon-192.png` 404 | File missing from `public/` | Add icon or fix `manifest.json` |
| React #418 (text mismatch) | Hydration drift on watch page | `apps/web/src/app/watch/[videoId]/page.tsx` — audit for `new Date()`, `Math.random()`, `window.*` in render |
