# Service Level Objectives — Factory Admin Studio

> Canonical SLO document for `apps/admin-studio` (Cloudflare Worker
> `admin-studio-production`, custom domain `https://admin.latwoodtech.work`).
> The runbook with alert wiring and incident response procedures lives at
> [`docs/runbooks/slo.md`](./runbooks/slo.md). This file is the *machine-readable*
> source of truth that the Stage 1 conformance scorer
> (`scripts/platform_conformance.py`) reads to score the Observability and
> Performance dimensions.

*Last reviewed: 2026-05-15 — owner: Factory Platform*

---

## Scope

Factory Admin Studio is an **internal operator console** used by Factory
engineers and the founder to run the supervisor loop, push deploys, run smoke
tests, and read audit timelines. It is not directly customer-facing, so the
SLO targets are intentionally tighter than the customer apps' targets on
latency but slightly looser on availability (since downtime here does not
break end-user flows).

## Availability target

| Dimension | Target | Window | Measured by |
|---|---|---|---|
| Worker availability | **≥ 99.5 %** | Rolling 30 d | Cloudflare Workers Analytics (non-5xx / total) |
| Custom-domain reachability | **≥ 99.9 %** | Rolling 30 d | External synthetic probe (`/health` from GH Actions) |
| Cron-handler success | **≥ 99 %** | Rolling 7 d | `factory_events.cron.completed` PostHog event |

### Error budget

With a **99.5 %** availability target the monthly error budget is
**~3.6 hours** of downtime (or 0.5 % of all requests). Alert burn-rate at
**5× budget** (would deplete in < 2 days) triggers a P2.

## Latency targets

| Endpoint class | **p50** | **p95** | **p99** | Window |
|---|---|---|---|---|
| Reads (`GET /me`, `/audit`, `/timeline`) | < 100 ms | < 300 ms | < 500 ms | 24 h |
| Writes (`POST /deploys`, `/tests/runs`) | < 200 ms | < 500 ms | < 1 s | 24 h |
| AI (`POST /ai/chat`) | < 1 s | < 3 s | < 8 s | 24 h |
| Webhooks (Stripe `/webhooks/*`) | < 150 ms | < 400 ms | < 800 ms | 24 h |

The **p95 / 500 ms** budget for non-AI writes is the headline number alerted on.
AI endpoints are intentionally excluded from the p95 budget because they are
dominated by Anthropic/Grok/Groq round-trip latency.

## Quality / freshness

| Signal | Target | Window |
|---|---|---|
| Digest email delivered on cron | ≥ 95 % of expected fires | 7 d |
| Synthetic-journey monitor green | ≥ 90 % of 5-min checks | 24 h |
| Audit write success | 100 % | per-deploy |

## Sentry & observability

Sentry is wired via `@latimer-woods-tech/monitoring` (`withSentry` +
`sentryMiddleware`). Required env:

- `SENTRY_DSN` (Worker secret) — present in staging + production.
- `BUILD_SHA` (Worker var, set in deploy workflow) — becomes the Sentry
  release tag so sourcemaps resolve.
- Sourcemaps are uploaded by the deploy workflow's `Upload sourcemaps` step.

Alert thresholds (configured in Sentry UI for project `admin-studio`):

| Alert | Condition | Priority |
|---|---|---|
| Error spike | > 10 unique errors / 5 min | P2 |
| 5xx rate | > 1 % of requests over 5 min | P2 |
| New `InternalError` | First-seen, env = production | P3 |

## Incident response

See [`docs/runbooks/slo.md`](./runbooks/slo.md) for the canonical
**P1 / P2 / P3 / P4** triage matrix and the `wrangler rollback` procedure.
A failed canary auto-rolls the worker via `.github/workflows/_canary-watch.yml`
(only when `previous_version_id` was captured pre-deploy).

## Review cadence

This document is reviewed **quarterly** by the Factory Platform owner.
Substantive changes to targets require an ADR.
