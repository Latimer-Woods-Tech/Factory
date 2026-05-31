# Factory apps + packages KPI brief

**Surface:** `apps/*` (14 workers + frontends) + `packages/*` (~30 internal packages)
**Pattern:** Each app is an isolated Cloudflare Worker (or Pages app) deployed via its own pipeline; packages are local-only npm packages with shared infra (`monitoring`, `analytics`, `logger`, `llm-meter`).

---

## Summary by app

| App | Routes | `/health` | Crons | Sentry | Analytics | Top KPI status |
|-----|--------|-----------|-------|--------|-----------|----------------|
| `admin-studio` | 16+ | ✓ | 2× daily | ✓ | audit logs | LIVE_WITH_KPI |
| `admin-studio-ui` | 0 (SPA) | ✗ | — | n/a | n/a | LIVE_NO_KPI |
| `browser-agent` | unknown | ✗ | — | n/a | n/a | NOT_INSTRUMENTED |
| `daily-brief` | 1 | ✗ | 1× daily 11:00 UTC | partial | partial | LIVE_NO_KPI |
| `lead-gen` | 0 (queue producer) | ✗ | 1× daily 10:00 UTC | n/a | n/a | LIVE_NO_KPI |
| `latwoodtech-web` | static | ✗ | — | n/a | n/a | LIVE_NO_KPI |
| `prime-self-reference` | unknown | ✗ | — | n/a | n/a | NOT_INSTRUMENTED |
| `prime-self-smoke` | 0 (test runner) | ✗ | — | n/a | n/a | LIVE_NO_KPI |
| `schedule-worker` | 8 | ✓ (`/health` + `/stripe/health`) | — | ✗ | ✗ | LIVE_NO_KPI |
| `supervisor` | 1+ (DO) | ✗ | weekly 11 UTC weekdays | n/a | n/a | LIVE_WITH_KPI |
| `synthetic-monitor` | 1+ | ✗ | every 5min | ✗ | ✗ | LIVE_NO_KPI |
| `video-cron` | 3 | ✓ | hourly | ✗ | ✗ | LIVE_NO_KPI |
| `video-studio` | 0 (Remotion engine) | ✗ | — | n/a | n/a | DEAD |
| `webhook-fanout` | 2 | ✓ | — | ✗ | ✓ (PostHog) | LIVE_WITH_KPI |

See [`inventory.tsv`](inventory.tsv) (rows `F-FAPP-001` through `F-FAPP-050`).

**Cross-cutting:** 8 of 14 apps lack a `/health` endpoint. Only `admin-studio` has explicit Sentry init. Only `webhook-fanout` emits PostHog events. `admin-studio` is the only app with structured audit logs.

---

## Per-app one-liners

- **`admin-studio`** — Central API worker. 16+ routes (tests, deploys, AI ops, audit, timeline, capabilities, manifest crawling). Digest crons 2× daily. Core operator interface.
- **`admin-studio-ui`** — Vite SPA. Hardcoded URLs to `admin-studio` (no `/api` prefix, no secrets). Env state in Zustand session.
- **`browser-agent`** — Playwright on GCP Cloud Run (factory-495015). Headless browser journeys. Auth via `supervisor-sa` impersonation. Helper: [`scripts/test-site.sh`](../../scripts/test-site.sh).
- **`daily-brief`** — Daily email + audio summarizer. GitHub + News API ingest, ElevenLabs TTS, Resend email.
- **`latwoodtech-web`** — Static landing page.
- **`lead-gen`** — Lead capture queue producer (`factory-lead-gen-queue`).
- **`prime-self-reference`** — Reference data (no `wrangler.jsonc` found — likely data-only package).
- **`prime-self-smoke`** — Playwright smoke tests for `selfprime.net` production.
- **`schedule-worker`** — Video render job scheduler. `/jobs` API: GET pending, POST schedule, PATCH status. Single source of truth for render state.
- **`supervisor`** — Factory governance orchestrator (Phase 1 scaffolding). Durable Objects, weekly scheduled. GitHub App + Slack integration.
- **`synthetic-monitor`** — 5-minute liveness + journey monitor. Puppeteer. Snapshots in `MONITOR_KV`.
- **`video-cron`** — Hourly dispatcher. Polls `schedule-worker` for pending jobs, dispatches GH Actions `render-video.yml`.
- **`video-studio`** — Remotion composition engine. No HTTP routes — invoked from GH Actions runner.
- **`webhook-fanout`** — Stripe webhook ingress + fan-out. Writes `factory_events` D1 + PostHog + Resend lifecycle emails. Idempotency via KV.

---

## Top 10 highest-value KPIs not measured

1. **Schedule Worker Job Success Rate** — Critical path for video pipeline. No KPI on `/jobs/pending` or PATCH success.
2. **Video Cron Dispatch Success Rate** — Hourly job dispatch → GH Actions has no observability.
3. **Admin Studio Route p95 Latency** — 16 routes with no SLO.
4. **Digest Cron Completion** — Two daily emails; no measurement of actual send.
5. **`factory_events` Insertion Latency** — D1 writes; no p50/p95.
6. **Stripe Webhook Deduplication Accuracy** — Idempotency KV works but no audit of duplicate rejection rate.
7. **Synthetic Monitor Manifest Coverage** — `/manifest` ingestion success not measured.
8. **Lead Gen Queue Throughput** — Producer runs daily; consumer latency unknown.
9. **Admin UI RUM** — No real-user-monitoring (LCP, CLS, FID).
10. **Browser Agent Job Completion Rate** — GCP Cloud Run service uptime unknown.

---

## Package signal producers

These packages emit KPI-able signals:

| Package | Signal | Notes |
|---------|--------|-------|
| `@latimer-woods-tech/monitoring` | Sentry — `initMonitoring`, `captureError` | Cloudflare-compatible |
| `@latimer-woods-tech/analytics` | `factory_events` D1 + PostHog | Custom event helpers |
| `@latimer-woods-tech/logger` | Structured JSON logs + `request_id` tagging | Integrates with Sentry |
| `@latimer-woods-tech/llm-meter` | Token usage tracking | Meters Anthropic / Groq / Vertex calls |
| `@latimer-woods-tech/errors` | Error type classification | `ValidationError`, `AuthError`, etc. |
| `@latimer-woods-tech/schedule` | Render job state machine | `getPendingJobs`, `updateJobStatus` |
| `@latimer-woods-tech/studio-core` | Manifest + capability schemas | Used by `admin-studio` + crawlers |

Other packages (`auth`, `neon`, `stripe`, `compliance`, `flags`, `llm`, `content`, `validation`, `design-tokens`, etc.) are pure infra — no signals emitted, but they shape what downstream apps can measure.

---

## Surprising findings

1. **`prime-self-reference` has no `wrangler.jsonc`** — Listed in apps/ but appears to be a data-only package, not a deployed worker. Verify.
2. **`admin-studio-ui` has no `/health`** — Pages SPA, hardcoded URLs to `admin-studio`. No external way to verify the deploy is alive.
3. **`schedule-worker` has no Sentry** — Core data service (render jobs), 8 routes, zero error monitoring. **High risk.**
4. **`supervisor` is Phase 1 scaffolding** — Scheduled weekly. Durable Objects + LLM ledger + GitHub App auth in place, but no observable user flows yet.
5. **`video-cron` + `daily-brief` log to stdout only** — Console JSON strings, not searchable in CloudFlare Logs without log push.
6. **`webhook-fanout` uses `Promise.allSettled`** — Fan-out partial failures logged but not surfaced to Sentry. If PostHog fails, `factory_events` still attempted (good), but the partial failure is invisible.
7. **`synthetic-monitor` stores snapshots in KV, not queryable** — `/diagnostics` endpoint aggregates 24h snapshots; raw data not persisted to D1 for alerting.
8. **`video-studio` is dead code in isolation** — No HTTP routes, never invoked except from the GH Actions runner. The KPI is on the runner job, not on this worker.

---

## Blind spots

1. **No RUM.** Admin UI has zero observability into user experience. Missing LCP / CLS / FID.
2. **No DB query observability.** `neon` creates connections; query latency, lock contention, pool exhaustion unmeasured.
3. **No feature flag impact measurement.** `FLAGS` D1 binding exists, but flag state changes aren't linked to user behavior changes.
4. **No queue processing SLO.** `lead-gen` queues tasks; consumer unknown. Lead capture latency (form → action) unmeasured.
5. **No GitHub Actions dispatch feedback.** `video-cron` dispatches `render-video.yml` and never polls result. Fire-and-forget.
6. **No external API latency tracking.** News API, GitHub API, ElevenLabs TTS calls in `daily-brief` — no timeout or retry metrics.
7. **No auth failure audit.** `admin-studio` enforces `ALLOWED_ORIGINS` + auth context, but failed attempts aren't logged to a queryable table.
8. **Supervisor state leaks.** Durable Objects + in-memory SQLite = data lost on eviction. No persistence signal for long-running runs.

---

## Recommended next actions

1. **Add `/health` to every worker.** 8 of 14 lack one. The Verification Requirement in CLAUDE.md is unenforceable without it.
2. **Wire Sentry into `schedule-worker` first.** It's the highest-risk app with zero error monitoring.
3. **Persist synthetic-monitor results to D1.** KV snapshots can't be queried for trend or alerting.
4. **Add `factory_events` write latency to `webhook-fanout` instrumentation.** That's the central event table — its insert SLO is a portfolio-level concern.
