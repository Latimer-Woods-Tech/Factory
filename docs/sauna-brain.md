# Sauna Brain — Factory Operating Snapshot

**Generated:** 2026-05-24T14:01:18.238Z

_Auto-synced from Sauna's workspace memory + live GitHub state. Do not edit by hand — regenerated weekly._

> Note: `docs/sauna-brain.md` is an operating snapshot only. It is not the primary
> source of truth for service registration, worker URLs, monitor targets, or
> alert configuration. Use `docs/service-registry.yml`, `packages/deploy/scripts/setup-sentry-alerts.mjs`,
> and the workflow validation scripts in this repo for that contract.

## Current priorities

- **Day 22 at zero new paying customers.** Stripe balance -$0.92, 0 charges last 24h, latest 3 subs all canceled. ChartMogul flat. The build/sell gap is the only metric moving the wrong way.
- **Selfprime brand-voice scrub** still pending — audit live copy + HumanDesign repo for "AI / algorithm / generated / automated" violations.
- **Factory PR #900** — feat(llm): G8 LLM cost cap. open / blocked. Auto-merge enabled, one required check still red.
- **Factory PR #901** — feat(capabilities): catalog JSON + privacy routes. open / dirty. Needs rebase.
- **Scheduled-workflow red streak** still active on main (Smoke Prime Self, Launch Readiness, Auto-dispatch, smoke admin-studio, Supervisor Template Author) despite #908 merging.
- **Bot replan loop** — factory-cross-repo[bot] posting duplicate supervisor plans / template-authoring failures on #541, #542, #589, #591.

## Open agent-task issues (top 10 by creation date)

- [#916](https://github.com/Latimer-Woods-Tech/Factory/issues/916) [Sentry/cypher-healing-worker] error: password authentication failed for user 'neondb_owner' — labels: bug, priority:P1, supervisor:approved-source, agent:claimed:supervisor, source:sentry, status:in_progress
- [#912](https://github.com/Latimer-Woods-Tech/Factory/issues/912) [Sentry/node-cloudflare-pages] DatabaseError: invalid input syntax for type uuid: "me" — labels: bug, priority:P1, supervisor:approved-source, agent:claimed:supervisor, source:sentry, status:in_progress
- [#898](https://github.com/Latimer-Woods-Tech/Factory/issues/898) FUTURE: Capricast R2 bucket rename from videoking-r2 to capricast-r2 — labels: enhancement, priority:P2, source:human, supervisor:approved-source, supervisor:no-template
- [#879](https://github.com/Latimer-Woods-Tech/Factory/issues/879) [Sentry/node-cloudflare-pages] DatabaseError: invalid input syntax for type uuid: "list" — labels: bug, priority:P1, supervisor:approved-source, agent:claimed:supervisor, source:sentry, status:in_progress
- [#878](https://github.com/Latimer-Woods-Tech/Factory/issues/878) [Sentry/node-cloudflare-pages] DatabaseError: invalid input syntax for type uuid: "today-hint" — labels: bug, priority:P1, supervisor:approved-source, agent:claimed:supervisor, source:sentry, status:in_progress
- [#877](https://github.com/Latimer-Woods-Tech/Factory/issues/877) [Sentry/node-cloudflare-pages] DatabaseError: bind message supplies 1 parameters, but prepared statement "" requires 2 — labels: bug, priority:P1, supervisor:approved-source, agent:claimed:supervisor, source:sentry, status:in_progress
- [#876](https://github.com/Latimer-Woods-Tech/Factory/issues/876) [Sentry/node-cloudflare-pages] Error: Invalid timezone: America/New_York — labels: bug, priority:P1, supervisor:approved-source, agent:claimed:supervisor, source:sentry, status:in_progress
- [#814](https://github.com/Latimer-Woods-Tech/Factory/issues/814) P1 — SUPERVISOR-002: Templates don't match Sprint 2 implementation issues — labels: enhancement, priority:P1, supervisor:approved-source, agent:claimed:supervisor, status:in_progress
- [#779](https://github.com/Latimer-Woods-Tech/Factory/issues/779) [supervisor] Review limit reached: PR #778 — fix(ci): drop Node 24 to 22 on wedged workflows + add admin-studio smoke probe — labels: hardening, priority:P0, llm, status:blocked, supervisor:approved-source, agent:claimed:supervisor, status:in_progress, supervisor:review-limit-reached
- [#753](https://github.com/Latimer-Woods-Tech/Factory/issues/753) feat: Stage 3 — adopt shared @lwt/{eslint-config,biome-config,tsconfig-base} across portfolio — labels: priority:P1, supervisor:approved-source, supervisor:no-template, area:platform

## ADR index

- `0000-template.md` —  Proposed | Accepted | Superseded by ADR-NNNN | Deprecated
- `0001-cohesion-architecture.md` —  Accepted
- `0002-operating-framework.md` —  Accepted
- `0003-claude-as-primary-reviewer.md` —  Accepted
- `0004-subagent-fanout-pattern.md` —  Accepted
- `0005-pr-size-budget.md` —  Accepted
- `0006-cascading-multi-agent-review.md` —  Accepted
- `0007-auto-fix-resolvable-ci-failures.md` —  Accepted
- `0008-ui-ux-foundations.md` —  Accepted
- `0009-cloudflare-workers-only.md` — unknown
- `0010-hono-router.md` — unknown
- `0011-llm-package-not-direct-calls.md` — unknown
- `0012-dependency-version-policy.md` — Accepted

## Packages that exist (`packages/`)

- `@lwt/admin`
- `@lwt/analytics`
- `@lwt/auth`
- `@lwt/biome-config`
- `@lwt/browser`
- `@lwt/compliance`
- `@lwt/content`
- `@lwt/copy`
- `@lwt/creator`
- `@lwt/crm`
- `@lwt/deploy`
- `@lwt/design-system`
- `@lwt/design-tokens`
- `@lwt/email`
- `@lwt/entitlements`
- `@lwt/errors`
- `@lwt/eslint-config`
- `@lwt/flags`
- `@lwt/llm`
- `@lwt/llm-meter`
- `@lwt/logger`
- `@lwt/monitoring`
- `@lwt/neon`
- `@lwt/protocol`
- `@lwt/realtime`
- `@lwt/schedule`
- `@lwt/seo`
- `@lwt/social`
- `@lwt/stripe`
- `@lwt/studio-core`
- `@lwt/telephony`
- `@lwt/testing`
- `@lwt/tsconfig-base`
- `@lwt/ui`
- `@lwt/validation`
- `@lwt/video`

## Hard rules (condensed from `docs/supervisor/CONTEXT.md`)

- **Router:** Hono only — never Express, Fastify, or Next.js
- **Crypto:** Web Crypto API only — never `node:crypto`, `jsonwebtoken`
- **Runtime:** Cloudflare Workers only — no Node servers, no `require`, no `Buffer`, no `fs`/`path`
- **Env:** `c.env` / `env.*` — never `process.env`
- **Modules:** ESM only — no CommonJS
- **Database:** Drizzle ORM via Hyperdrive binding (`env.DB`) — never raw connection strings, never unparameterized queries
- **Secrets:** Worker secrets / org secrets only — never in code, docs, issue bodies, or commits
- **Packages:** Use `@latimer-woods-tech/*` for all cross-cutting concerns — never reinvent
- **Env names:** `staging` or `production` only — never `prod`, `dev`, `preview`, `preprod`
- **Secret names:** `CF_API_TOKEN` / `CF_ACCOUNT_ID` — never `CLOUDFLARE_API_TOKEN`

## Revenue state

- **Stripe:** balance -$0.92, 0 charges in last 24h, latest 3 subscriptions all canceled.
- **ChartMogul:** $0 MRR / 0 active / 0 trialing (custom data source `ds_036fc9e8…`); March $12 → April $0 churn → May $19 trialing sub canceled 2026-05-27. No active revenue signals.
- **Loops:** 4 contacts seeded with subscription metadata; 4 lifecycle templates still TODO.
- **Day 25:** zero new paying customers. The $19 HumanDesign Explorer trial canceled 2026-05-27 — 0 active subscribers, 0 trialing, 3 canceled in the active window. Operating Framework Stage 2 (revenue surfaces) is the explicit gate.

## Open decisions

- **Machine vs. customer focus** — explicit decision-of-the-month per Operating Framework: continue Stage 3 package wave, or pause and run a Stage 2 acquisition sprint on selfprime.net.
- **Selfprime acquisition design** — GEO citations, practitioner outreach, Reddit/community presence, astrology + bodygraph crossover content, Discord Free Chart Friday, QR-led street-hook flyers (candidate experiment).
- **Stripe Projects + Cloudflare ACP** — selfprime is ~1 ADR + 1 wrangler change from being ACP-payable. Worth doing now or after Stage 2?
- **GCP service account key `76bc15364b7d…`** — 23 days old, rotate ASAP.
- **Sentry filter sanity** — 24h query returns 0 issues while prod smokes are red; filter is likely too narrow.
- **Cohesion debt** — duplicate `PACKAGE_MATRIX` files + 4 duplicate ADR-prefix conflicts tracked in Factory #640.
- **`auto-merge-approved-prs.yml`** redundant with PR #550 poller — stage-delete after one clean tick.

---

_Source: Sauna workspace memory (`memory/RECENT_ACTIVITY.md`, `memory/COMPANY.md`, `memory/SAUNA_TOOLS.md`) + live GitHub API at generation time._
