# Sauna Brain

**Generated:** 2026-06-07T14:02:23.274Z

## Current priorities
- **selfprime/HumanDesign canary is recovering, not done.** In 24h, 19 HumanDesign PRs merged, mostly P0 routing surgery (#420 SPA catch-all + API routing, #428 dynamic routes 404 fix, #427 staging DB isolation, #429 CI tests candidate build, #425 secret-sync fixes). Yesterday's 3 red canary probes are down to one red suite on main: `Practitioner Flows`. Verify live reading loads before Monday.
- **Machine-vs-customer tension persists.** capricast (video) pulled 35 merges in 24h (editor pipeline, duet/stitch templates, live-room Durable Objects) — the video wave is back, contradicting last week's "videoking quiet." Revenue-adjacent selfprime got firefighting, not features.
- **Marketing block at risk again.** Monday 8–10 Digital Marketing overlaps Factory Monday Review at 9 — same collision that's eaten the block two weeks running. Highest-leverage move: move the Factory Review.

## Revenue state
- **Revenue: $0.** Stripe: 0 active, 0 trialing, 3 canceled, 0 charges in 24h. May's $19 trialing reactivation (jg01@me.com) did NOT convert.

## Open decisions
- **cypher-healing (client site) main RED** — both `ci` and `deploy` failing. Paying client. Diagnose.
- **Factory main**: `probe` failure; Playwright smokes cancelled (likely superseded, not true failures).
- **Namecheap hosting failed to auto-renew** (blackkryptonians account, Jun 6) — could drop a site. Check card on file.
- **Open PRs: 109 org-wide** (down from 145). 58 are dependabot bot bumps — real human-review pile is ~50.
- **Cloudflare AI Gateway Spend Limits** (open beta, Jun 5) — native dollar caps + fallback routing replace `@lwt/llm-meter` $5/run cap and June 4 hand-rolled fallback. Migration candidate.
- **GCP service-account key rotation** (`76bc15364b7d…`) — Red-tier, human-only, overdue.
- **Cloudflare payment due ~June 18** (personal account) — confirm card on file.

## Open agent-task issues
- [#1462](https://github.com/Latimer-Woods-Tech/Factory/issues/1462) [Sentry/node-cloudflare-pages] DatabaseError: relation "analytics_events" does not exist
- [#1461](https://github.com/Latimer-Woods-Tech/Factory/issues/1461) [Sentry/node-cloudflare-pages] DatabaseError: relation "practitioner_reviews" does not exist
- [#1430](https://github.com/Latimer-Woods-Tech/Factory/issues/1430) [Sentry/node-cloudflare-pages] ErrorEvent: Uncaught TypeError: Failed to establish the WebSocket connection: expected server to reply with HTTP status code 101 (switching protocols), but received 530 instead.
- [#1356](https://github.com/Latimer-Woods-Tech/Factory/issues/1356) [Sentry/node-cloudflare-pages] DOMException: The operation was aborted
- [#1342](https://github.com/Latimer-Woods-Tech/Factory/issues/1342) [Sentry/prime-self-web] prime-self-web frontend Sentry wiring verification (2026-06-03)
- [#1270](https://github.com/Latimer-Woods-Tech/Factory/issues/1270) [Sentry/node-cloudflare-pages] Error: Connection terminated unexpectedly
- [#1269](https://github.com/Latimer-Woods-Tech/Factory/issues/1269) [Sentry/node-cloudflare-pages] ErrorEvent: Uncaught TypeError: Failed to establish the WebSocket connection: expected server to reply with HTTP status code 101 (switching protocols), but received 520 instead.
- [#1258](https://github.com/Latimer-Woods-Tech/Factory/issues/1258) [Sentry/node-cloudflare-pages] ErrorEvent: Uncaught TypeError: Failed to establish the WebSocket connection: expected server to reply with HTTP status code 101 (switching protocols), but received 520 instead.
- [#1242](https://github.com/Latimer-Woods-Tech/Factory/issues/1242) [Sentry/node-cloudflare-pages] TypeError: Cannot read properties of undefined (reading 'split')
- [#1236](https://github.com/Latimer-Woods-Tech/Factory/issues/1236) [Sentry/node-cloudflare-pages] DatabaseError: relation "video_object" does not exist

## ADR index
- **0000-template.md**: ** Proposed | Accepted | Superseded by ADR-NNNN | Deprecated
- **0001-cohesion-architecture.md**: ** Accepted
- **0002-operating-framework.md**: ** Accepted
- **0003-claude-as-primary-reviewer.md**: ** Accepted
- **0004-subagent-fanout-pattern.md**: ** Accepted
- **0005-pr-size-budget.md**: ** Accepted
- **0006-cascading-multi-agent-review.md**: ** Accepted
- **0007-auto-fix-resolvable-ci-failures.md**: ** Accepted
- **0008-ui-ux-foundations.md**: ** Accepted
- **0009-cloudflare-workers-only.md**: ** Accepted
- **0010-hono-router.md**: ** Accepted
- **0011-llm-package-not-direct-calls.md**: ** Accepted
- **0012-dependency-version-policy.md**: Unknown

## Packages that exist
- admin
- agent
- analytics
- auth
- biome-config
- bodygraph
- browser
- compliance
- content
- copy
- creator
- crm
- deploy
- design-system
- design-tokens
- email
- entitlements
- errors
- eslint-config
- flags
- llm-meter
- llm
- logger
- monitoring
- neon
- protocol
- realtime
- schedule
- seo
- social
- stripe
- studio-core
- telephony
- testing
- tsconfig-base
- ui
- validation
- video-studio
- video

## Hard rules
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
