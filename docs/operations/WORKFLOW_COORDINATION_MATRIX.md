# Workflow Coordination Matrix

**Last updated:** April 29, 2026  
**Scope:** Factory World Class 360 execution  
**Purpose:** prevent workflow collisions, missing deploy gates, and undocumented verification gaps.

---

## Coordination Rules

1. No production deploy is complete until direct HTTP verification records the expected status code.
2. Package-sensitive changes must run package integration before app lockfile/deploy work.
3. App deploy workflows must not rely on green CI alone; they must verify health/readiness endpoints.
4. Revenue, auth, webhook, payout, and AI-render workflows require replay/failure evidence before public launch.
5. Workflow changes must update this matrix when trigger order, dependencies, or verification gates change.

---

## Critical Workflow Matrix

| Workflow / system | Repo or path | Trigger | Depends on | Required verification | W360 / OWR link |
|---|---|---|---|---|---|
| Package integration CI | `.github/workflows/package-integration.yml` | PR / package-sensitive changes | Published/local package graph | Package chain build + cross-package smoke passes | OWR-020, W360-022 |
| Render video | `.github/workflows/render-video.yml` | `workflow_dispatch` from schedule-worker/video-cron | R2, Cloudflare Stream, ElevenLabs, Anthropic, schedule-worker job API | Job reaches `done`, Stream UID exists, R2 upload succeeds, PostHog event emitted | OWR-007, W360-023 |
| Schedule Worker deploy | `apps/schedule-worker` workflow | Push / manual deploy | Hyperdrive binding, DB migration, service token secrets | `curl https://schedule.latwoodtech.work/health` returns `200` | OWR-005, OWR-007 |
| Video Cron deploy | `apps/video-cron` workflow | Push / manual deploy | Schedule Worker URL/token, cron config | `curl https://video-cron.latwoodtech.work/health` returns `200` | OWR-007 |
| Synthetic Monitor deploy | `apps/synthetic-monitor` workflow | Push / manual deploy | Target registry entries | `/health` and `/checks/run` return `200`; cron schedule active | OWR-013, W360-023 |
| SelfPrime UI smoke | `apps/prime-self-smoke` / external `prime-self-ui` workflow | Pull request / deploy | `selfprime.net`, real smoke credentials | Live Playwright tests pass against `selfprime.net`; no localhost target | OWR-015, OWR-023 |
| SelfPrime accessibility | `apps/prime-self-smoke` a11y job | PR / deploy | Live SelfPrime pages | 0 critical/serious axe violations | OWR-016 |
| Practitioner Studio checkout/webhook | To be implemented | Stripe event / deploy | Stripe products, webhook signing secret, entitlement schema | Idempotent webhook test, bad signature rejected, credits granted once | OWR-024, W360-005, W360-008 |
| Practitioner Studio first render | To be implemented | User request after entitlement check | Credits, schedule-worker, render workflow | Job creation, credit debit, completion, failure refund/replay tested | OWR-024, W360-009 |
| Admin Studio command plane | `apps/admin-studio`, `apps/admin-studio-ui`, `packages/studio-core` | Authenticated operator command | RBAC, dry-run, audit log, branch/PR model | Protected route tests, dry-run evidence, audit event, no direct prod mutation | OWR-021, W360-006 |
| Xico CI | `C:\Users\Ultimate Warrior\Documents\GitHub\xico-city\.github\workflows\ci.yml` | PR / push | Lockfile, exact deps, lint/build scripts | `npm ci`, typecheck, lint, tests, forbidden API check, registry validation, build pass | OWR-025, W360-003 |
| Xico deploy | `C:\Users\Ultimate Warrior\Documents\GitHub\xico-city\.github\workflows\deploy.yml` | Main/staging deploy | Xico CI, Cloudflare secrets, Hyperdrive | `/health` and `/ready` return expected status via deployed Worker URL | OWR-025, W360-004 |
| Xico commerce workflows | Xico app to implement | Checkout/webhook/booking/payout events | Stripe Connect, booking ledger, idempotency table | Booking checkout, webhook replay, refund/cancel, payout report tests pass | OWR-025, W360-015, W360-018 |

---

## Required Deploy Gate Pattern

Every deploy workflow should expose or call a gate with these fields:

| Field | Requirement |
|---|---|
| Service name | Must match `docs/service-registry.yml` if it is a Factory-managed service |
| Environment | staging or production |
| Expected endpoint | Full HTTPS URL |
| Expected status | Usually `200`; auth-negative tests may require `401` |
| Command evidence | Captured run step or direct curl output |
| Timestamp | UTC timestamp of observed result |
| Run ID | GitHub Actions run ID or local evidence note |
| Rollback link | Workflow or documented rollback steps |

---

## Immediate Coordination Backlog

| ID | Task | Exit criteria |
|---|---|---|
| WCM-001 | Add deploy-gate helper script or reusable workflow | At least one Worker deploy consumes a shared health gate |
| WCM-002 | Add analytics event verification gate | Critical launch flows assert required PostHog/factory_events events |
| WCM-003 | Add webhook replay drills | Stripe/video webhook replay documented and testable |
| WCM-004 | Add failure-recovery drills | Render failure and checkout failure paths have operator recovery evidence |
| WCM-005 | Add Xico CI repair evidence | Xico `npm ci`, typecheck, lint, test, build pass from clean checkout |

---

## Conflict Prevention

Before editing any workflow, record:

1. Workflow file path.
2. Owning OWR/W360 item.
3. Downstream services touched.
4. Required secrets.
5. Direct verification endpoint.
6. Rollback path.

If two agents need the same workflow, the coordinator assigns one owner and one reviewer.
