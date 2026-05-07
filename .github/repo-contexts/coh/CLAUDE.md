# CypherOfHealing.com — Standing Orders

> Canonical reference for all agents, engineers, and AI tools working in this repository.
> Read `README.md` for the full product vision and `docs/` for engineering detail.

## Mission

CypherOfHealing.com (coh) is a five-stream personal brand platform built on the
philosophy "the outer is a reflection of the inner." Five product streams serve
the creator's audience across healing, commerce, education, live events, and
high-touch consultation:

| Stream | Description |
|--------|-------------|
| **The Chair** | Booking platform for 1-on-1 healing sessions |
| **The Vault** | Digital product store (courses, downloads, memberships) |
| **The Academy** | LMS — structured course delivery with progress tracking |
| **The Stage** | Live webinars and events with registrations |
| **Inner Circle** | High-ticket private consultation program |

All five streams share a unified users table with `stripeCustomerId`. Cross-stream
activity is tracked through the `activity_log` table which can trigger actions across
streams (e.g. course completion unlocking Inner Circle eligibility).

## Stack

| Layer | Technology |
|-------|-----------|
| Backend Runtime | Cloudflare Workers |
| Backend Router | Hono |
| Frontend | React 18 + Vite + Tailwind CSS + Framer Motion |
| Frontend Deploy | Cloudflare Pages |
| Database | Neon Postgres + Drizzle ORM |
| Auth | Workers KV sessions |
| Payments | Stripe (subscriptions + one-time + Connect) |
| Email | Resend |
| Storage | Cloudflare R2 (media uploads) |
| CI/CD | GitHub Actions |

## Hard Constraints

- No `process.env` — use `c.env.VAR` (Hono Worker) or `import.meta.env.VAR` (Vite)
- No Node.js built-ins in Worker code (`fs`, `path`, `crypto`) — use Web APIs
- No `Buffer` — use `TextEncoder` / `TextDecoder` / `Uint8Array`
- No raw `fetch` without error handling
- Secrets via `wrangler secret put` — never in `wrangler.toml` or source
- Stripe webhook handlers must verify the signature before processing any payload
- Cross-stream triggers always written to `activity_log` before executing downstream effects
- The `activity_log` table is append-only — no updates or deletes

## Surfaces

| Surface | URL |
|---------|-----|
| Production | https://cypherofhealing.com |
| Worker API health | `curl https://coh.adrper79.workers.dev/health` |

A fix is done when `curl https://coh.adrper79.workers.dev/health` returns `200`.

## Commands

```bash
# Backend
npm run dev         # wrangler dev
npm run deploy      # wrangler deploy
npm run typecheck   # TypeScript strict — zero errors required

# Frontend
cd client && npm run dev     # Vite dev server
cd client && npm run build   # Vite production build
cd client && npm run deploy  # wrangler pages deploy dist/
```

## Schema Overview

- `users` — unified across all five streams, includes `stripeCustomerId`
- `bookings` — The Chair sessions
- `products`, `purchases` — The Vault
- `courses`, `modules`, `lessons`, `enrollments`, `progress` — The Academy
- `events`, `registrations` — The Stage
- `memberships`, `consultations` — Inner Circle
- `activity_log` — cross-stream event log, append-only

## Session Start Checklist

1. Read `README.md` — five-stream product vision
2. Run `npm run typecheck` — note existing errors
3. Read `src/index.ts` (or `src/app.ts`) — middleware wiring and route mounts
4. Identify which stream you are working on before touching schema or routes
5. Check `git log --oneline -10` — understand recent changes
6. For cross-stream work: read the `activity_log` schema before writing triggers

## Commit Format

`type(scope): description`

Scopes: `chair`, `vault`, `academy`, `stage`, `inner-circle`, `auth`, `db`, `stripe`, `email`, `client`, `docs`
Types: `feat`, `fix`, `refactor`, `test`, `docs`, `perf`, `chore`
