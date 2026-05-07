# Capricast (videoking) — Standing Orders

> Canonical reference for all agents, engineers, and AI tools working in this repository.
> Architecture: `docs/architecture/` | Factory constraints: `docs/STACK.md` | Operating rules: `docs/supervisor/FRIDGE.md`

## Mission

Capricast is a short-form creator video platform — TikTok-class feature set, $0 third-party SDK budget.
Monorepo: Next.js 15 frontend on Cloudflare Pages + Hono Worker API backend.
Brand: capricast.com | Repo slug: videoking (historical)

## Stack

| Layer | Technology |
|-------|-----------|
| Monorepo | pnpm workspaces + Turborepo |
| Frontend | Next.js 15 (App Router) — Cloudflare Pages |
| Backend | Cloudflare Workers (Hono) + Durable Objects |
| Database | Neon PostgreSQL via Cloudflare Hyperdrive + Drizzle ORM |
| Video | Cloudflare Stream + R2 |
| Auth | BetterAuth (intentional deviation from Factory JWT — do NOT flag) |
| Payments | Stripe Connect (Express) |
| Realtime | Durable Objects WebSocket Hibernation API + Cloudflare Calls SFU |
| Styling | Tailwind CSS |
| Analytics | PostHog client + PostHog server-side via waitUntil() |

## Hard Constraints — Worker Only (apps/worker/)

- No `process.env` in Worker code — use Hono bindings (`c.env.VAR`)
- No Node.js built-ins in Worker code (`fs`, `path`, `crypto`) — use Web APIs
- No `Buffer` in Worker code — use `TextEncoder` / `TextDecoder` / `Uint8Array`
- No raw `fetch` without explicit error handling
- Secrets via `wrangler secret put` — never in `wrangler.toml` [vars] or source
- Stripe webhook handlers must verify the Stripe signature before processing
- Durable Objects state mutated only from within the DO class (actor isolation)
- All WebSocket connections must use the Hibernation API

## Key Divergences from Factory Defaults — Do NOT flag these as violations

- **Auth**: BetterAuth instead of Factory JWT. Intentional for this repo.
- **Frontend env vars**: `process.env.NEXT_PUBLIC_*` and `import.meta.env.*` ARE valid in `apps/web/` (Next.js App Router). Only flag `process.env` in `apps/worker/` source files.
- **Next.js**: `apps/web/` is a Next.js app. This is expected. Do NOT flag Next.js as a banned framework for this repo — the "no Next.js" rule applies to Worker routing only.
- **Monorepo**: Turborepo + pnpm, not Factory npm workspace pattern.

## Apps

| App | Path | Deploy target |
|-----|------|---------------|
| Web frontend | `apps/web/` | Cloudflare Pages at capricast.com |
| Worker API | `apps/worker/` | Cloudflare Workers at api.capricast.com |
| DB package | `packages/db/` | Drizzle schema + migrations |

## Commit Format

`type(scope): description`

Scopes: `web`, `worker`, `auth`, `stripe`, `stream`, `r2`, `do`, `db`, `docs`, `ci`
Types: `feat`, `fix`, `refactor`, `test`, `docs`, `perf`, `chore`
