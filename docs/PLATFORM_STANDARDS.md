# Platform Standards — Latimer-Woods-Tech

**Version:** v1 · **Date:** 2026-05-11 · **Status:** Authoritative · **Conflicts:** `docs/supervisor/FRIDGE.md` wins; this doc wins over older scattered architecture notes; ADRs in `docs/adr/` win over this doc when explicitly marked superseding.

This is the single source of truth for how every Latimer-Woods-Tech repo, package, workflow, and feature is built. Every PR is audited against it (`platform-conformance.yml`). Every AI agent reads it as a hard constraint. Every new repo inherits it by default.

If a rule isn't here, it's not a rule. If a rule is here and you need to break it, open an ADR — don't just do it.

---

## 1. Stack

- **Runtime:** Cloudflare Workers. Node-style runtime targets allowed only in build tooling, never in production code.
- **HTTP:** Hono. No Express, no Fastify, no raw `Request`/`Response` glue for new routes.
- **Crypto:** Web Crypto (`crypto.subtle`). Never `node:crypto`.
- **Modules:** ESM only. No CommonJS in new code. Existing CJS code is grandfathered until its next major refactor.
- **Language:** TypeScript strict (`strict: true`, `noUncheckedIndexedAccess: true`, `noImplicitOverride: true`).
- **Package manager:** pnpm + workspaces. No npm or yarn at root.
- **Databases:** D1 for transactional, Neon (Postgres) via Hyperdrive for relational, KV for hot config, R2 for blobs, Durable Objects for stateful real-time.
- **AI:** All LLM calls via `@latimer-woods-tech/llm`. Tiered routing (fast / balanced / smart / verifier). Anthropic primary, Gemini long-context fallback, Groq verifier. No direct vendor SDKs.
- **Realtime:** `@latimer-woods-tech/realtime` (when published) for DO Room/Presence/Conference patterns.

## 2. Code patterns

- **Env typing:** every Worker exports a typed `Env` interface. Bindings, secrets, vars all explicit.
- **Logging:** `@latimer-woods-tech/logger` only. No `console.*` in production code (lint-enforced).
- **Errors:** `@latimer-woods-tech/errors` for all structured errors. `FactoryBaseError` hierarchy. Never throw raw `Error`.
- **Retry:** `withRetry` from `@latimer-woods-tech/errors` for any network call to an external service. Jittered exponential backoff. Idempotency key required for retryable mutations.
- **Webhooks:** `withIdempotency(eventId, handler)` from `@latimer-woods-tech/webhooks` (when published; today, from `@lwt/stripe` and `@lwt/auth`). Record event ID before processing. Safe on retry.
- **Auth:** `@latimer-woods-tech/auth` for JWT, OAuth flows, session middleware. No hand-rolled JWT verification.
- **Billing:** `@latimer-woods-tech/stripe` for Stripe interactions. Price IDs from env. Never hardcode price IDs in code.
- **Monitoring:** `@latimer-woods-tech/monitoring` wires Sentry + PostHog. Every Worker includes this in its middleware chain.
- **Multi-tenant:** every Worker that holds tenant data resolves tenant via `X-Tenant-Id` header + `resolveTenant()` from `@lwt/auth`. No implicit tenant fallback.
- **Request ID:** every request gets a `request_id` (UUIDv7) attached by middleware. Logged on every line. Propagated downstream.

## 3. Tests

- **Unit:** Vitest with `--maxWorkers=1` for deterministic mode. Coverage floor 80% line / 85% branch / 70% function, ratcheting to 90/90/85 once stable.
- **Integration:** Playwright for every Worker that exposes HTTP. Tiers: `smoke`, `gate`, `a11y`, `visual`. At least `smoke` mandatory.
- **Accessibility:** axe-core integrated into Playwright `a11y` tier. WCAG 2.2 AA target. Zero violations on critical paths.
- **Coverage in CI:** every PR reports coverage delta. Delta < 0 fails the build unless an ADR justifies it.
- **Every route has a test.** New route without a test fails conformance.

## 4. Observability

- **Sentry:** every Worker initializes Sentry via `@lwt/monitoring` in its entry point. DSN from env (`SENTRY_DSN_*`). Sourcemap upload mandatory on every deploy (`sentry-cli sourcemaps upload`).
- **Structured logs:** JSON lines via `@lwt/logger`. Fields: `timestamp`, `level`, `request_id`, `tenant_id?`, `user_id?`, `route`, `latency_ms`, `event`.
- **Metrics:** PostHog for product events (`@lwt/monitoring.track(event, props)`). Sentry for errors. Cloudflare Analytics for infrastructure.
- **Per-route p95 budgets:** declared in `docs/SLO.md` per repo. Enforced by post-deploy canary; auto-rollback if exceeded by 1.5x for 10 minutes.

## 5. Security

- **Audits:** `npm audit --audit-level=high` on every PR. New high-or-critical CVE fails the build.
- **CodeQL:** required workflow on every PR + nightly on main.
- **Secrets:** no long-lived tokens in CI. Use OIDC + Trusted Publishers for npm. Use `factory-cross-repo` GitHub App for cross-repo work. Never commit secrets; secret-scanning + push-protection enabled org-wide.
- **Dependencies:** Renovate at org level. Minor + patch auto-merge for `@lwt/*` internal. Major requires ADR.
- **Vulnerable dep response:** P0 if exploitable in production code path. SLA: 24h to merge fix or document mitigation.

## 6. Schema

- **Migrations:** SQL files under `migrations/`. Naming: `NNNN_description.sql`. Numbered, sequential, immutable once merged.
- **Pattern:** Expand → Contract. Additive-only changes deployable to prod. Destructive changes (drop column, rename) require a two-phase migration with both versions running simultaneously for ≥1 deploy cycle.
- **Rollback:** every migration includes `-- ROLLBACK:` block with the inverse statement, or `-- ROLLBACK: NONE — irreversible, see ADR-NNNN` referring to an approved ADR.
- **Dry-run:** `wrangler d1 execute --dry-run` required in CI before deploy.

## 7. Workflows

- **Reusables in factory:** `_app-ci.yml`, `_app-deploy.yml`, `_app-prod-canary.yml`, `_app-reliability-gate.yml`. Caller workflows in product repos invoke these.
- **Workflow count per repo:** ≤5 workflow files. Anything more requires consolidation or ADR.
- **Required org workflows:** `completion-tracker-notify.yml`, `platform-conformance.yml` (after Stage 4), `definition-of-done.yml` (after Stage 4).
- **Branch protection:** identical across repos. 1 CODEOWNER approval. Dismiss stale reviews. Linear history. No force-push.
- **Allowed actions:** `local_only` for product repos. `all` only for Factory.
- **Bypass list:** `@adrper79-dot` + `factory-cross-repo[bot]` for the existing approved-PR auto-merge flow.

## 8. Release

- **Versioning:** semver. Major requires ADR.
- **CHANGELOG.md:** every package keeps one. Updated in the same PR as the change.
- **Tags:** signed tags via `actions/create-github-app-token`. No personal access tokens for release.
- **Published packages:** `@latimer-woods-tech/*` on npmjs.org, public, with provenance via Trusted Publishers (per PR #584).
- **ADR for architectural decisions:** required when PR touches `migrations/**`, `packages/**` (new package or major version), `wrangler.jsonc` bindings, auth/billing flows, or public API contracts.

## 9. Performance

- **Latency budgets** (p95) per route:
  - Read paths: 200ms warm, 500ms cold
  - Write paths: 800ms warm, 1500ms cold
  - Webhook handlers: 3s p95 (Stripe retries after 5s)
  - LLM-backed routes: documented per route, default 10s p95
- **SLO target:** 99.9% availability per Worker (43m/month downtime budget).
- **Synthetic checks:** 1/minute from 3 geos via Cloudflare Synthetic Monitoring. Alerts via `@lwt/monitoring`.
- **Cold-start optimization:** Workers init under 50ms. Heavy work lazy-loaded.

## 10. Privacy

- **PII inventory:** every Worker that stores PII maintains `docs/PII_INVENTORY.md` listing fields, location (table/column or KV/R2), retention period.
- **DSR endpoints:** `GET /api/me/export` and `DELETE /api/me` required on every Worker that stores per-user PII. Verified by conformance.
- **Audit log:** `@lwt/compliance.auditLog(action, actor, target, metadata)` on every mutating admin route. Retention 1 year minimum.
- **Data retention policy:** per Worker, in `docs/RETENTION.md`. Default: 7 years for billing records, 30 days for soft-deleted user data, 90 days for logs.
- **Encryption:** at rest (Cloudflare default), in transit (TLS 1.3 only). No plain-text PII in logs.

---

## How this evolves

- This file is versioned. Changes via PR + ADR.
- Standards that nobody meets within 90 days get re-evaluated: either drop them, or invest to fix.
- New production incidents become candidate new standards. Recurring incidents (≥3 in a quarter) become required new standards.
- Quarterly review (per OPERATING_FRAMEWORK §quarterly): drop, add, evolve.

## Active ADRs that override or refine this doc

(Populated as ADRs land. Format: `ADR-NNNN: short title (status)`.)

- `ADR-0001: Cohesion architecture` — three lines of defense, lives in factory.
- `ADR-0002: Operating framework` — milestone-based execution model.

---

## Conformance audit dimensions

The conformance workflow (M1) scores each repo against these dimensions. Sample checks below; full check list in `scripts/platform_conformance.py`.

| § | Dimension | Weight | Sample checks |
|---:|---|---:|---|
| 1 | Stack | 10 | wrangler.jsonc valid, ESM only, no node:crypto, Hono present |
| 2 | Code patterns | 15 | @lwt/logger consumed, @lwt/errors consumed, idempotent webhooks, request_id middleware |
| 3 | Tests | 15 | vitest deterministic, playwright tiers present, coverage ≥ floor, every route tested |
| 4 | Observability | 10 | Sentry init, sourcemap upload step, structured logs, SLO doc present |
| 5 | Security | 15 | CodeQL workflow, npm audit step, OIDC publish (no long-lived NPM_TOKEN), secret-scanning on |
| 6 | Schema | 5 | Expand/contract pattern, rollback documented, dry-run in CI |
| 7 | Workflows | 10 | Uses `_app-*` reusables, ≤5 caller files, branch protection identical to canonical |
| 8 | Release | 5 | semver tags, CHANGELOG present, ADRs link from PRs that need them |
| 9 | Performance | 10 | SLO budgets declared, synthetic checks live, smoke + canary green |
| 10 | Privacy | 5 | PII_INVENTORY present, DSR endpoints present where required, audit log middleware on admin routes |

Each repo's score = weighted average across dimensions. Anything < 70 blocks deploys (after Stage 4 enforcement; advisory before).


---

## 11. PR size budget

Every PR has a hard size budget by tier. Bigger work decomposes before opening. Atomic PRs review in seconds; sprawling PRs hide bugs and slow merge throughput.

| Tier | Path scope (per CODEOWNERS) | Max diff lines (added + removed) |
|---|---|---:|
| **Green** | `docs/**`, `*.md`, `session/**`, generated docs | ≤ 50 |
| **Yellow** | `apps/*/src/**`, `client/**`, `tests/**`, non-critical worker routes | ≤ 200 |
| **Red** | `.github/workflows/**`, `packages/**`, `migrations/**`, billing, wrangler bindings, auth flows | ≤ 500 |

Exceptions require the `size-exception-approved` label, which CODEOWNERS-approval can apply, with a comment explaining why the decomposition isn't worth it.

Decomposition strategies the supervisor and sub-agents use:
- Split by file (each file → its own atomic PR if independent)
- Split by concern (test scaffolding PR → implementation PR → docs PR)
- Stack PRs (open #2 against #1's branch, merge in order)
- Use `[stack: N of M]` in PR title to declare the sequence

The `pr-size-guard.yml` workflow (Stage 4) enforces this as a required status check. Until then, treat it as advisory + reviewer discretion.

See ADR-0005 for the full decision context.
