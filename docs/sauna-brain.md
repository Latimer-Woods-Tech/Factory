# Sauna Brain Sync
**Generated:** 2026-06-14T14:03:11.620Z

## Current priorities
- **Restoring Namecheap Hosting for cypherofhealing.com:** Manually renewing/restoring the hosting package.
- **Updating Vercel Billing details:** Updating card details to prevent impending project shutdown.
- **Fixing selfprime.net Neon HTTP 530 Database Errors:** Swapping the serverless HTTP driver for postgres.js.
- **Migrating Custom LLM Cost Controls:** Migrating custom LLM daily usage checks to Cloudflare's native AI Gateway Spend Limits.
- **Time-sensitive follow-ups:** Merging HumanDesign PR #548, Fixing HumanDesign PR #546 Tests.

## Open agent-task issues
- [#1694] [Sentry/node-cloudflare-pages] Error: LLM synthesis exceeded 110s timeout (last provider: anthropic)
- [#1659] [Sentry/cypher-healing-worker] Error: Failed query: select "id", "email", "password_hash", "name", "avatar_url", "role", "stripe_customer_id", "membership_tier", "phone", "sms_opt_in", "voice_opt_in", "telnyx_contact_id", "preferences", "referral_code", "referred_by", "last_active_at", "ema...
- [#1033] Pass 1 (Phase A) — Admin read-layer walking skeleton
- [#898] FUTURE: Capricast R2 bucket rename from videoking-r2 to capricast-r2
- [#814] P1 — SUPERVISOR-002: Templates don't match Sprint 2 implementation issues
- [#753] feat: Stage 3 — adopt shared @lwt/{eslint-config,biome-config,tsconfig-base} across portfolio
- [#724] feat(types): add typed Env interface across portfolio (conformance fix)
- [#657] feat(analytics): PostHog funnel definitions for monetization paths (G34)
- [#647] docs(cross-repo): link every CLAUDE.md to factory canonical docs (Sauna ↔ Claude Code bridge)
- [#646] Tier 1: Cypher of Healing — verify deployment + add health endpoint

## ADR index
- **0000-template.md**: Status: Unknown
- **0001-cohesion-architecture.md**: Status: Unknown
- **0002-operating-framework.md**: Status: Unknown
- **0003-claude-as-primary-reviewer.md**: Status: Unknown
- **0004-subagent-fanout-pattern.md**: Status: Unknown
- **0005-pr-size-budget.md**: Status: Unknown
- **0006-cascading-multi-agent-review.md**: Status: Unknown
- **0007-auto-fix-resolvable-ci-failures.md**: Status: Unknown
- **0008-ui-ux-foundations.md**: Status: Unknown
- **0009-cloudflare-workers-only.md**: Status: Unknown
- **0010-hono-router.md**: Status: Unknown
- **0011-llm-package-not-direct-calls.md**: Status: Unknown
- **0012-dependency-version-policy.md**: Status: Unknown

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
- Router: Hono only — never Express, Fastify, or Next.js
- Crypto: Web Crypto API only
- Runtime: Cloudflare Workers only — no Node servers
- Env: c.env / env.* — never process.env
- Modules: ESM only — no CommonJS
- Database: Drizzle ORM via Hyperdrive binding (env.DB)
- Secrets: Worker secrets / org secrets only
- Packages: Use @latimer-woods-tech/* for all cross-cutting concerns
- Env names: staging or production only
- Secret names: CF_API_TOKEN / CF_ACCOUNT_ID
- Worker URLs: https://<name>.adrper79.workers.dev
- Commits: Conventional Commits — feat(scope): subject
- PR size: ≤50 lines (Green) / ≤200 lines (Yellow) / ≤500 lines (Red)
- No new shared package or major version bump without ADR

## Revenue state
Pre-revenue early-stage. 1 historical paying customer ($12 MRR, churned). May 2026 = $0 active with $19 trialing reactivation pending. Product shell is still not ready enough to treat zero revenue as pure demand failure.

## Open decisions
- Weekly review cadence is currently under review (skipped 2026-05-11).
- Street-hook experiments (QR-led curiosity flyers) for selfprime.net top-of-funnel are being considered.
- Swapping serverless HTTP driver vs bypassing Hyperdrive for Neon 530 errors.
