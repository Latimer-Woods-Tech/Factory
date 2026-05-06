# NicheStream (videoking) — Standing Orders

> Canonical reference for all agents, engineers, and AI tools working in this repository.
> Read `docs/ARCHITECTURE.md` for the system model and `docs/ENGINEERING.md` for code conventions.

## Mission

NicheStream is a hyper-niche interactive video platform built on the Cloudflare edge stack.
Stream, interact, and monetize — all in real time. Operates as a monorepo with a Next.js
frontend on Cloudflare Pages and a Hono Worker API backend.

## Stack

| Layer | Technology |
|-------|-----------|
| Monorepo | pnpm workspaces + Turborepo |
| Frontend | Next.js 15 (App Router) — Cloudflare Pages |
| Backend | Cloudflare Workers (Hono) + Durable Objects |
| Database | Neon PostgreSQL via Cloudflare Hyperdrive + Drizzle ORM |
| Video | Cloudflare Stream |
| Storage | Cloudflare R2 |
| Auth | BetterAuth |
| Payments | Stripe Connect (Express) |
| Realtime | Durable Objects WebSocket Hibernation API |
| Styling | Tailwind CSS |

## Hard Constraints

- No `process.env` in Worker code — use Hono bindings (`c.env.VAR`)
- `import.meta.env.VAR` is valid in the Next.js frontend (Vite/Next env model)
- No Node.js built-ins in Worker code (`fs`, `path`, `crypto`) — use Web APIs
- No `Buffer` in Worker code — use `TextEncoder` / `TextDecoder` / `Uint8Array`
- No raw `fetch` without error handling
- Secrets via `wrangler secret put` — never in `wrangler.toml` or source
- Stripe webhook handlers must verify signature with BetterAuth/Stripe SDK before processing
- Durable Objects state must only be mutated from within the DO class (actor isolation)
- All WebSocket connections must use the Hibernation API — never hold connections open across requests

## Key Divergence from Factory Defaults

- **Auth**: Uses BetterAuth, not Factory's JWT self-managed Web Crypto API approach. This is intentional for this repo — do not flag BetterAuth usage as a violation.
- **Frontend**: Next.js 15 (App Router), not a plain Vite SPA. `process.env` / `import.meta.env` are valid in Next.js frontend code — only flag `process.env` in Worker source files.
- **Monorepo tooling**: Turborepo + pnpm, not the Factory npm workspace pattern.

## Apps

| App | Path | Deploy |
|-----|------|--------|
| Web frontend | `apps/web/` | Cloudflare Pages |
| Worker API | `apps/worker/` | Cloudflare Workers |

## Surfaces

| Surface | URL |
|---------|-----|
| Production | NicheStream production domain |
| Worker health | `curl https://{worker-name}.adrper79.workers.dev/health` |

## Pre-Deploy Validation

```bash
pnpm pre-deploy-check   # validates env vars, static files, no localhost hardcoded
```

Runs automatically in GitHub Actions on every push to `main`.

## Commit Format

`type(scope): description`

Scopes: `web`, `worker`, `auth`, `stripe`, `stream`, `r2`, `do`, `db`, `docs`
Types: `feat`, `fix`, `refactor`, `test`, `docs`, `perf`, `chore`
