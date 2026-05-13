# Prime Self — Standing Orders

> Canonical reference for all agents, engineers, and AI tools working in this repository.
> Read `docs/OVERVIEW.md` (documentation map) and `ARCHITECTURE.md` (system model) first.

## Mission

Prime Self (selfprime.net) is a practitioner-first B2B2C platform for generating
structured chart data, AI-assisted interpretations, client deliverables, and practitioner
workflows. Three shells — personal, practitioner, and guided-client — serve different
audiences but share one deterministic calculation engine.

All chart calculations must be deterministic: same input always produces the same output.
Verification anchors AP and 0921 (see README) must match on every release.

## Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Cloudflare Workers (V8 isolates) |
| Router | Vanilla JS table-driven router (`workers/src/index.js`) |
| Database | Neon PostgreSQL pooled via `NEON_CONNECTION_STRING` secret |
| Cache | Workers KV (chart + geocode, 30-day TTL) |
| Storage | Cloudflare R2 (PDF exports) |
| LLM | Anthropic Claude (2-retry) → xAI Grok 4 Fast → Groq |
| Auth | PBKDF2-SHA256 passwords + HS256 JWT |
| SMS | Telnyx |
| Frontend | Vanilla HTML/CSS/JS, Vite bundling, three-shell SPA (`client/`) |
| Tests | Vitest deterministic suite + Playwright browser smoke |

## Hard Constraints

- No `process.env` anywhere; use `env.VAR` in Workers, `import.meta.env.VAR` in Vite
- No Node.js built-ins (`fs`, `path`, `crypto`); use Web Crypto API
- No framework rewrites; the router is a table-driven JS object, not Hono or Express
- The engine (`src/engine/`) must remain pure and deterministic; no LLM calls inside it
- LLM calls belong only in `workers/src/lib/llm.js` with the 3-provider failover chain
- No `Buffer`; use `TextEncoder` / `TextDecoder` / `Uint8Array`
- Secrets set via `wrangler secret put` from inside `workers/` — never in `wrangler.toml`
- No raw `fetch` without explicit error handling

## Surfaces

| Surface | URL |
|---------|-----|
| Production frontend | https://selfprime.net |
| Worker API | https://prime-self-api.adrper79.workers.dev |
| Health check | https://api.selfprime.net/health |

A fix is done when `curl https://api.selfprime.net/health` returns `200`.
CI green is not the same as working.

## Deploy

```bash
cd workers && npx wrangler deploy      # API
npm run deploy:frontend                # build + wrangler pages deploy from repo root
```

## Test

```bash
npx vitest run                 # Full deterministic suite — must pass before any PR
npm run test:deterministic     # Canonical framework tests
npm run verify:launch          # Pre-release sweep — run before production deploy
```

## Quality Gates

- `npx vitest run` passes with zero failures
- Verification anchors AP (Aug 5 1979, Tampa) and 0921 (Sep 21 1983, Naples) match
- No new `any` casts without a justification comment
- LLM synthesis changes require re-verifying against a reference chart

## Session Start Checklist

1. Read `docs/OVERVIEW.md` — documentation map and canonical ownership
2. Read `ARCHITECTURE.md` — system model, runtime structure, data flow
3. Run `npx vitest run` — note current pass/fail baseline
4. Read `FEATURE_CHECKLIST.md` — current product surface inventory
5. Check `git log --oneline -10` — understand recent changes
6. For engine changes: read `src/engine/index.js` (`calculateFullChart`) before touching anything

## Key Docs

| Doc | Purpose |
|-----|---------|
| `docs/OVERVIEW.md` | Documentation map — read first |
| `ARCHITECTURE.md` | System design and data flow |
| `FEATURE_CHECKLIST.md` | Current product surface |
| `docs/API_GENERATED.md` | Live route inventory |
| `docs/OPERATION.md` | Deployment, secrets, monitoring |
| `RUNBOOK.md` | Incident quick reference |
| `MASTER_BACKLOG_SYSTEM_V2.md` | Full backlog |
| `docs/SHELL_INFORMATION_ARCHITECTURE.md` | Three-shell IA and routing |
| `docs/TIER_ENFORCEMENT.md` | Entitlement and access rules |
| `docs/DATABASE_ARCHITECTURE.md` | Schema and query patterns |

## Agent Protocol

See `.github/AGENT_PROTOCOL.md`. Agents claim issues before starting, post `/status` comments
at start/blocker/done, open PRs and do not merge. Protocol violations are task failures.

## Commit Format

`type(scope): description`

Scopes: `engine`, `workers`, `client`, `db`, `llm`, `auth`, `sms`, `tests`, `docs`
Types: `feat`, `fix`, `refactor`, `test`, `docs`, `perf`, `chore`
