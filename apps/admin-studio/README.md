# Factory Admin Studio

Browser-based control plane for the Factory monorepo. Operate apps, run tests, edit code with AI, deploy — all without leaving the browser, with **environment-safe** defaults.

> 📘 **Plan & specs**: see [`docs/admin-studio/00-MASTER-PLAN.md`](../../docs/admin-studio/00-MASTER-PLAN.md) and [`docs/admin-studio/01-ENVIRONMENT-SAFETY.md`](../../docs/admin-studio/01-ENVIRONMENT-SAFETY.md).

---

## What's in this folder

This is the **API Worker**. It handles auth, audit, environment context enforcement, and proxies actions to GitHub Actions / Cloudflare / Neon.

The UI lives at [`apps/admin-studio-ui`](../admin-studio-ui/).
Shared types live at [`packages/studio-core`](../../packages/studio-core/).

```
apps/admin-studio/
├── src/
│   ├── index.ts                       # Hono entrypoint
│   ├── env.ts                         # Worker bindings/secrets typing
│   ├── types.ts                       # Hono AppEnv (Bindings + Variables)
│   ├── middleware/
│   │   ├── cors.ts                    # Strict allow-list CORS
│   │   ├── request-id.ts              # X-Request-Id correlation
│   │   ├── env-context.ts             # JWT verify + cross-env attack guard
│   │   ├── audit.ts                   # Append to studio_audit_log
│   │   └── require-confirmation.ts    # Enforce confirmation tier per env+reversibility
│   └── routes/
│       ├── auth.ts                    # POST /auth/login (env-locked JWT)
│       ├── me.ts                      # GET  /me/  current session
│       ├── tests.ts                   # POST /tests/runs (dispatch suites)
│       ├── deploy.ts                  # POST /deploys (tiered confirmation)
│       └── ai.ts                      # POST /ai/chat (LLM proxy)
└── migrations/
    └── 0001_studio_audit_log.sql      # Append-only audit table
```

## Status

This Worker is **live in production** (`api.apunlimited.com`) with ~29 routes spanning auth, observability, the test runner, the repo/AI editor, deploy control, capability provisioning, governance, and privacy. The original Phase A–H plan (see Roadmap below) is **largely delivered** — this is no longer a stub. The machine-readable surface is [`src/routes/manifest.ts`](./src/routes/manifest.ts) (served at `GET /manifest`); a grouped reference lives in [`docs/admin-studio/03-API-SURFACE.md`](../../docs/admin-studio/03-API-SURFACE.md).

Core safeguards that gate every mutating route (all live):

1. `POST /auth/login` — issues an env-locked HS256 JWT (Web Crypto, no `jsonwebtoken`)
2. JWT middleware rejects cross-env tokens with `403 Environment mismatch`
3. Session expiry: 4h prod, 24h staging/local
4. `requireConfirmation` middleware enforces tier-based confirmation per env+reversibility matrix
5. `auditMiddleware` redacts secrets and emits structured log entries
6. UI ([`apps/admin-studio-ui`](../admin-studio-ui/)) login flow forces env selection before sign-in
7. Persistent `EnvironmentBanner` component (gray=local, amber=staging, red=production)
8. `ConfirmDialog` with type-to-confirm + cooldown timer for tier 2/4 actions
9. `/health` returns the worker's bound `STUDIO_ENV` for `curl`-based verification

## Local dev

```bash
# 1. Worker (this folder)
cd apps/admin-studio
cp .dev.vars.example .dev.vars   # fill JWT_SECRET, GITHUB_TOKEN, ANTHROPIC_API_KEY, STUDIO_WEBHOOK_SECRET
npm install
npm run dev                       # → http://localhost:8787

# 2. UI (in another shell)
cd apps/admin-studio-ui
npm install
npm run dev                       # → http://localhost:5173 (proxies /api → :8787)
```

Health check:

```bash
curl http://localhost:8787/health
# { "status":"ok", "env":"local", "service":"admin-studio", ... }
```

## Deploy

```bash
# Staging
npm run deploy:staging
curl https://api.admin.latimerwoods.dev/health

# Production (requires owner role + type-to-confirm in UI)
npm run deploy:production
curl https://api.apunlimited.com/health
```

⚠ Before deploy: set `hyperdrive.id` for both envs in [`wrangler.jsonc`](./wrangler.jsonc) and run `wrangler secret put` for `JWT_SECRET`, `GITHUB_TOKEN`, `ANTHROPIC_API_KEY`, and `STUDIO_WEBHOOK_SECRET`.

## Quality gates

```bash
npm run typecheck     # zero errors
npm test              # 90%+ coverage target
npm run lint          # zero warnings (--max-warnings 0)
```

## Hard constraints (enforced)

- Cloudflare Workers runtime only — no Node.js APIs
- Hono router only
- Web Crypto for JWT — no `jsonwebtoken`
- ESM-only — no `require()`
- All secrets via `wrangler secret put` — never in `wrangler.jsonc` `vars`
- All mutating routes must call `requireConfirmation()` with their reversibility tier

## Roadmap

| Phase | Scope                                                | Status         |
|-------|------------------------------------------------------|----------------|
| A     | Foundation: auth (+ Google OAuth), env safety, audit middleware, UI shell | ✅ shipped |
| B     | Observability: Sentry issues, PostHog tiles, app health, SLO, synthetic journeys | ✅ shipped |
| C     | GitHub Actions test-runner + SSE streaming           | ✅ shipped     |
| D     | Deploy control + version history (`/apps/versions`) + canary rollback | ✅ shipped (standalone secret-rotation cron) |
| E     | AI chat + repo editor (Monaco) + tool use            | ✅ shipped; diff/PR `/ai/proposals` still stubbed |
| F     | Multi-app dashboard + function catalog + smoke tests | ✅ shipped     |
| G     | Confirmation tiers + Slack alerts; two-person (tier-3) approvals | 🚧 partial |
| H     | Command center, themes, keyboard/a11y polish         | 🚧 partial     |
| —     | **Capability Studio** — governed provisioning + graph composer (not in original plan; [golden design](../../docs/CAPABILITY_DESIGN_STUDIO_GOLDEN_DESIGN.md)) | ✅ shipped |
| —     | **Governance** — feature flags, blocking gates, command center | ✅ shipped |
| —     | **Privacy/DSR**, daily digest, training-library proxy | ✅ wired (`/privacy` export/delete return stub payloads — see GAP) |
| —     | ~~Creator-economy / Stripe Connect~~                 | ❌ removed (#1790) — duplicated Capricast & SelfPrime on the shared `acct_1SlCcFAW1229TZte` platform |

See [`docs/admin-studio/00-MASTER-PLAN.md`](../../docs/admin-studio/00-MASTER-PLAN.md) for the full feature inventory and [`03-API-SURFACE.md`](../../docs/admin-studio/03-API-SURFACE.md) for the live route reference.
