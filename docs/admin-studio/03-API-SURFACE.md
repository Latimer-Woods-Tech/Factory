# Admin Studio — API Surface

Grouped reference for the `admin-studio` Worker. All routes are JSON unless noted.

> **Canonical, machine-readable surface:** [`apps/admin-studio/src/routes/manifest.ts`](../../apps/admin-studio/src/routes/manifest.ts), served at `GET /manifest` for catalog crawlers. This doc is the human-readable companion; if the two diverge, the manifest + the route mounts in [`src/index.ts`](../../apps/admin-studio/src/index.ts) win.

> **Status (2026-06):** Live in production at `api.apunlimited.com`. ~29 route groups across auth, observability, test-running, the repo/AI editor, deploy control, capability provisioning, governance, and privacy. This is no longer the Phase-A stub the earlier version of this doc described.

## Auth model

Every authenticated route runs `envContextMiddleware`, which verifies an env-locked HS256 JWT and rejects tokens whose `env` claim ≠ the worker's `STUDIO_ENV` (`403`). Mutating routes additionally run `auditMiddleware` (append-only `studio_audit_log`) and, where destructive, `requireConfirmation` (tiered per env × reversibility — see [02-OPERATOR-QUICK-REF.md](./02-OPERATOR-QUICK-REF.md)).

## Route groups

### Public (no JWT)
| Method | Path | Notes |
| ------ | ---- | ----- |
| GET | `/health` | Liveness + bound `STUDIO_ENV` (curl-verify target) |
| POST | `/auth/login` | Env-locked JWT (email/password); also `POST /auth/google` (OAuth) |
| GET | `/manifest` | Crawlable function manifest |
| POST | `/webhooks/studio-tests` | GitHub Actions test-run callback (HMAC-signed) |
| POST | `/webhooks/studio-subscriptions` | Studio's **own** SaaS billing → entitlements (Stripe-signed) |

### Observability & ops (read-mostly)
| Path | Purpose |
| ---- | ------- |
| `/me` | Current session → profile |
| `/apps` | Cross-app `/health` fan-out (`/apps/health`) + CF deploy versions (`/apps/versions`) |
| `/observability` | Sentry issues, PostHog tiles, telemetry-coverage matrix |
| `/slo` | Availability + error-budget burn per app |
| `/synthetic` | Synthetic user-journey probes with pass/fail trend |
| `/audit` | Paginated audit-log viewer |
| `/timeline` | Merged audit + Sentry + deploy stream |
| `/smoke` | Smoke-probe runner (specs from the function catalog) |
| `/catalog` | Crawled per-app `/manifest` inventory |

### Build / ship
| Path | Purpose |
| ---- | ------- |
| `/tests` | Dispatch test workflows; live SSE results |
| `/deploys` | Trigger deploys (tiered confirmation); history via `/apps/versions` |
| `/ai` | Streaming AI chat + tool use. `POST /ai/proposals` (diff/PR) is **still stubbed** |
| `/repo` | GitHub branches/tree/file reads + commit + PR (feature branches only) |

### Capability Studio
| Path | Purpose |
| ---- | ------- |
| `/capabilities` | Browse governed concepts; resolve → preview → handoff → provision-staging; graph CRUD/compile. See [golden design](../CAPABILITY_DESIGN_STUDIO_GOLDEN_DESIGN.md). |

### Governance
| Path | Purpose |
| ---- | ------- |
| `/api/flags` | Flagship feature-flag panel (list / activity / toggle / rollout) |
| `/v1/blocking` | Gates currently blocking deploys (reads `FACTORY_DB`) |
| `/v1/command-center` | Factory runs / gates / artifacts view |
| `/training-library`, `/jobs` | Proxy to schedule-worker |

### Privacy / compliance
| Path | Purpose |
| ---- | ------- |
| `/dsr` | Data-subject-request listing (`@latimer-woods-tech/compliance`) |
| `/privacy` | `GET /export` + `DELETE /delete` — **stub payloads today** (GDPR contract reachable; full implementation tracked in GAP register) |

> **Removed 2026-06 (#1790):** the creator-economy surface (`/api/creator/onboarding`, `/api/admin/creators`, `/api/admin/payouts`, `/webhooks/stripe-connect`). It was an orphaned third Stripe Connect implementation duplicating Capricast and SelfPrime on the shared `acct_1SlCcFAW1229TZte` platform. Connect onboarding now lives in the shared [`@latimer-woods-tech/stripe`](../../packages/stripe/) package (#1791).

## Error envelope

```json
{ "error": "human-readable message", "requestId": "uuid", "detail": "extra info (non-prod only)" }
```

## Status codes

| Code | Meaning |
| ---- | ------- |
| 200 | OK |
| 204 | No Content (CORS preflight) |
| 400 | Validation failure |
| 401 | Missing/invalid/expired JWT — UI auto-logs-out |
| 403 | Token env ≠ worker env, or insufficient role |
| 412 | **Confirmation required** — see `tier` and `action` fields |
| 500 | Server error — `requestId` for log correlation |

## 412 Confirmation flow

A confirmation-gated route first returns `412` with `{ tier, reversibility, action, expectedTokenHint }`. The UI shows the modal, computes the confirm token, and retries with `X-Confirmed: true` (tier 1) or `X-Confirm-Token: <hex>` (tier ≥ 2). Full header contract: [02-OPERATOR-QUICK-REF.md](./02-OPERATOR-QUICK-REF.md).
