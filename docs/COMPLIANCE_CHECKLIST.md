# New-Repo Compliance Checklist

**Authoritative sources:** [`docs/PLATFORM_STANDARDS.md`](./PLATFORM_STANDARDS.md) · [`docs/runbooks/add-new-app.md`](./runbooks/add-new-app.md)
**Version:** 2026-06-09 · tracks PLATFORM_STANDARDS.md v1.1
**Scope:** Every new standalone product repo (Cloudflare Workers app). Package-specific gates are in [§Q](#q-package-publication-gates-monorepo-packages-only).

> **How this stays current:**
> - When `PLATFORM_STANDARDS.md` changes → update this file in the **same PR**, referencing the §X that changed.
> - When `add-new-app.md` steps change → update §A in the same PR.
> - The `scripts/platform_conformance.py` workflow is the machine enforcement. This checklist is the human explainer. They must agree.
> - Quarterly review per [`PLATFORM_STANDARDS.md` §How this evolves](./PLATFORM_STANDARDS.md).

---

## A. Infrastructure
*Complete before writing any app code. Source: [`docs/runbooks/add-new-app.md`](./runbooks/add-new-app.md).*

- [ ] Rate limiter IDs reserved from `docs/runbooks/add-new-app.md` registry — allocate **one ID per rate limiter type per environment** (minimum: 2 per app: 1 prod + 1 staging); update the registry table in the same PR
- [ ] Neon project created; connection string stored in Factory Secrets as `{APP_UPPER}_CONNECTION_STRING`
- [ ] GitHub repo created: `gh repo create Latimer-Woods-Tech/{app} --private`
- [ ] Hyperdrive instance created; UUID extracted from CI logs; stored as `HYPERDRIVE_{APP_UPPER}` in Factory Secrets
- [ ] `JWT_SECRET_{APP_UPPER}` (random 32-byte base64) added to Factory Secrets
- [ ] `SENTRY_DSN_{APP_UPPER}` added to Factory Secrets
- [ ] `create-hyperdrive.mjs`, `write-schema.mjs`, `add-app-deps.mjs` updated in `packages/deploy/scripts/`
- [ ] `scaffold-{app}.yml` + `setup-{app}-secrets.yml` workflow files created in Factory
- [ ] `.github/repo-contexts/{app}/CLAUDE.md` created in Factory (CI `validate` job fails without this)
- [ ] Entry added to `docs/service-registry.yml` with branded `url` (not `.workers.dev`)
- [ ] Entry added to `docs/app-lifecycle.yml`
- [ ] `docs/runbooks/github-secrets-and-tokens.md` updated to list new app's secrets

---

## B. Stack (§1)

- [ ] `wrangler.jsonc` at repo root (not `wrangler.toml`)
- [ ] `"type": "module"` in `package.json`; TypeScript configured with `strict: true`, `noUncheckedIndexedAccess: true`, `noImplicitOverride: true`
- [ ] Hono router in `src/index.ts`; no Express, Fastify, Next.js, or raw `Request`/`Response` routing
- [ ] Typed `Env` interface exported from `src/env.ts`; every binding, secret, and var declared there
- [ ] Neon Postgres accessed via Hyperdrive binding: `env.DB` declared in `Env` interface and `wrangler.jsonc` `[[hyperdrive]]` block; Hyperdrive UUID from `docs/runbooks/add-new-app.md` §Step 5
- [ ] All LLM calls routed through `@latimer-woods-tech/llm` (no direct Anthropic/OpenAI SDK imports in app code)

## C. Code Patterns (§2)

- [ ] `@latimer-woods-tech/errors` — all thrown errors extend `FactoryBaseError`; no `throw new Error()`
- [ ] `@latimer-woods-tech/logger` — no `console.*` in production code (lint-enforced)
- [ ] `@latimer-woods-tech/monitoring` — in the middleware chain; initializes Sentry + PostHog
- [ ] `@latimer-woods-tech/auth` — JWT, OAuth flows, and session middleware; no hand-rolled JWT
- [ ] `withRetry` from `@latimer-woods-tech/errors` — wraps every network call to an external service
- [ ] Webhook handlers use idempotency: event ID recorded to DB before processing; safe to replay
- [ ] Request-ID middleware: generates a UUIDv7 `request_id`, attaches to context, included in every log line
- [ ] ESLint passes with zero warnings (`--max-warnings 0`); no `eslint-disable` without an ADR

## D. Workers Runtime Hard Stops (§1, §15)
*These are the most-violated CF Workers constraints. All are CI blockers.*

- [ ] No `process.env` — use `c.env.VAR` (Hono) or `env.VAR` (Worker bindings)
- [ ] No Node.js built-ins (`fs`, `path`, `crypto`) — use `crypto.subtle`, `TextEncoder`, `Uint8Array`
- [ ] No `Buffer` — use `Uint8Array`, `TextEncoder`, or `TextDecoder`
- [ ] No CommonJS `require()` — ESM `import`/`export` only
- [ ] No raw `fetch` without explicit error handling (`.catch()` or try/catch wrapping every call)
- [ ] No secrets in source code or in `wrangler.jsonc` `vars` block; secrets go through wrangler secret put or GCP SM
- [ ] No `*.workers.dev` URLs in any user-facing HTML, JS, API client, or env var shipped to end users

---

## E. Tests (§3)

- [ ] Vitest configured with `--maxWorkers=1` (deterministic, no parallel-test flakiness)
- [ ] Coverage thresholds set in `vitest.config.ts`: ≥80% line / ≥85% branch / ≥70% function (ratchet to 90/90/85 once stable)
- [ ] At least one Playwright tier present; `smoke` is mandatory
- [ ] axe-core integrated into the Playwright `a11y` tier
- [ ] Every route has at least one test; coverage delta < 0 fails the build

## F. Observability (§4)

- [ ] Sentry initialized via `@lwt/monitoring` in the Worker entry point; DSN sourced from `SENTRY_DSN` env var
- [ ] Sentry sourcemap upload step in the deploy workflow (`sentry-cli sourcemaps upload`)
- [ ] Structured JSON log lines: `timestamp`, `level`, `request_id`, `route`, `latency_ms`, `event` fields
- [ ] PostHog product events via `@lwt/monitoring.track(event, props)`
- [ ] `docs/SLO.md` present in repo, declaring p95 budgets per route
- [ ] `/health` endpoint returns `{"status":"ok"}` with HTTP 200

## G. Security (§5)

- [ ] CodeQL workflow runs on every PR and nightly on `main`
- [ ] `npm audit --audit-level=high` runs in CI; any new high/critical CVE fails the build
- [ ] No long-lived NPM tokens — OIDC trusted publisher configured for npm publish
- [ ] Cross-repo operations use the `factory-cross-repo` GitHub App, not personal PATs
- [ ] Branch protection: 1 CODEOWNER approval required, stale reviews dismissed, linear history enforced, force-push blocked

## H. Schema (§6)

- [ ] Migration files in `migrations/NNNN_description.sql`, numbered sequentially, immutable once merged
- [ ] Every migration includes a `-- ROLLBACK:` block (or `-- ROLLBACK: NONE — irreversible, see ADR-NNNN`)
- [ ] Migrations validated before touching production: Neon → run against staging/ephemeral branch first; D1 → `wrangler d1 execute --dry-run` in CI (see `docs/runbooks/database.md`)

## I. Workflows (§7)

- [ ] Deploy workflow calls `_app-deploy.yml` reusable from Factory
- [ ] CI workflow calls `_app-ci.yml` reusable from Factory
- [ ] Total workflow files ≤ 5; consolidate before adding a sixth
- [ ] Branch protection configuration matches the canonical Factory pattern (1 CODEOWNER approval, dismiss stale, linear history, no force-push)
- [ ] Org-required workflows present (enforced after Stage 4): `completion-tracker-notify.yml`, `platform-conformance.yml`, `definition-of-done.yml`

## J. Release (§8)

- [ ] `CHANGELOG.md` at repo root; updated in the same PR as every change
- [ ] Semver tags, signed via `actions/create-github-app-token`
- [ ] ADR filed under `docs/adr/` for any change touching migrations, new packages, billing flows, auth flows, or public API contracts

## K. Performance (§9)

- [ ] p95 latency budgets declared in `docs/SLO.md`: reads ≤200ms warm / writes ≤800ms warm / webhooks ≤3s / LLM routes documented per-route
- [ ] Cloudflare Synthetic Monitoring: 1 check/min from 3 geos, targeting `/health`
- [ ] Worker init < 50ms; heavy work lazy-loaded

## L. Privacy (§10)

- [ ] `docs/PII_INVENTORY.md` present (required if the Worker stores any PII); lists every field, its table/column or KV/R2 key, and retention period
- [ ] DSR endpoints present: `GET /privacy/export` and `POST /privacy/delete`
- [ ] `@lwt/compliance.auditLog()` called on every mutating admin route
- [ ] `docs/RETENTION.md` defines data retention policy

## M. Feature Registry (§11)

- [ ] `feature-registry.yml` at repo root
- [ ] Required fields present: `app`, `name`, `domain`, `stage`, `cohesion`, `description`, `roadmap`, `features`, `packages`
- [ ] At least one `roadmap` entry; every entry has both `status` and `quarter` fields
- [ ] `cohesion` is a number between 0 and 100

## N. Network Layer (§12)

- [ ] `FACTORY_NETWORK_TOKEN` added as a wrangler secret (plaintext only in GCP SM + wrangler secrets; SHA-256 hash in `factory_app_keys` DB only; never in source)
- [ ] `src/lib/network.ts` with `fireNetworkEvent()` and `fireNetworkSignal()` helpers (see [`docs/planning/factory-network-layer.md`](./planning/factory-network-layer.md) §7 for the canonical template)
- [ ] Events are fired at the locations declared in `docs/registry/network-events.yml` for this app; event names match the registry exactly
- [ ] `POST /api/internal/signal` route wired, validating the `X-Factory-Signal-Key` header (403 on mismatch)
- [ ] `FACTORY_SIGNAL_KEY` added as a wrangler secret and to the deploy workflow secrets sync
- [ ] `networkTokenConfigured: true` set in `docs/app-lifecycle.yml` after verified

## O. Worker Domain Policy (§15)

- [ ] `workers_dev = false` in the `[env.production]` block of `wrangler.jsonc`
- [ ] Routes declared via `routes = []` in `wrangler.jsonc` (not managed in the CF dashboard)
- [ ] DNS CNAME (`{subdomain} → {account}.workers.dev`) created **before** the first `wrangler deploy` with `routes[]` — creating CNAME after causes a route conflict (see `PLATFORM_STANDARDS.md` §15.4)
- [ ] Branded custom domain live: `wrangler deploy` completes, `curl https://{branded-domain}/health` returns 200
- [ ] `docs/service-registry.yml` entry uses the branded domain URL, not the `.workers.dev` fallback

---

## P. UI/UX — customer-facing surfaces only (§13)
*Skip for API-only Workers.*

- [ ] `@latimer-woods-tech/ui-tokens` for all colors, spacing, and font sizes (no hard-coded hex values)
- [ ] `@latimer-woods-tech/design-system` for components; no per-app Button/Input/Modal reinvention
- [ ] axe-core: zero violations on all critical paths (login, signup, checkout, primary feature)
- [ ] Lighthouse Performance post-deploy: ≥85 on app pages, ≥95 on marketing pages
- [ ] Initial JS bundle ≤150KB gzipped per route

---

## Q. Package publication gates (monorepo packages only)
*For `@latimer-woods-tech/*` packages published to npm. These apply in addition to §B–G above.*

- [ ] `tsup` build produces a clean `dist/` with zero errors
- [ ] TypeScript: zero errors (`npm run typecheck`)
- [ ] ESLint: zero warnings (`--max-warnings 0`)
- [ ] Unit coverage: ≥90% lines and functions, ≥85% branches
- [ ] JSDoc: ≥90% of exported symbols carry a one-line doc comment
- [ ] `CHANGELOG.md` updated; version bumped in `package.json` (semver)
- [ ] Published via the `publish.yml` OIDC workflow — never via local `npm publish` or long-lived NPM token

---

## Conformance score guide

The `scripts/platform_conformance.py` workflow scores every PR. Repos below 70 have deploys blocked at Stage 4+; advisory-only before Stage 4. Each dimension maps directly to a `PLATFORM_STANDARDS.md` section — open that section for the rationale behind each check.

| § | Dimension | Weight | Key checks |
|--:|---|--:|---|
| 1 | Stack | 10 | wrangler.jsonc valid · ESM only · no `node:crypto` · Hono present |
| 2 | Code patterns | 15 | `@lwt/logger` · `@lwt/errors` · idempotent webhooks · request_id middleware · ESLint 0 warnings |
| 3 | Tests | 15 | Vitest deterministic · Playwright tiers present · coverage ≥ floor · every route tested |
| 4 | Observability | 10 | Sentry init · sourcemap upload · structured logs · `docs/SLO.md` present |
| 5 | Security | 15 | CodeQL workflow · npm audit · OIDC publish · secret-scanning on |
| 6 | Schema | 5 | Expand/contract pattern · rollback docs on every migration · dry-run in CI |
| 7 | Workflows | 10 | Uses `_app-*` reusables · ≤5 files · branch protection matches canonical |
| 8 | Release | 5 | Semver tags · CHANGELOG present · ADRs linked where required |
| 9 | Performance | 10 | SLO budgets declared · synthetic checks live · smoke + canary green |
| 10 | Privacy | 5 | PII inventory present · DSR endpoints present · audit log on admin routes |
| 11 | Feature Registry | 5 | `feature-registry.yml` valid · cohesion score present and numeric |
| 12 | Network Events | 5 | `FACTORY_NETWORK_TOKEN` wired · events match registry · `/api/internal/signal` live |
