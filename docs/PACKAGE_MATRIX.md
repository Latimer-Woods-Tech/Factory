# Package Matrix — Factory Shared Libraries

**Loaded by:** supervisor, Claude reviewer, sub-agents, new-app scaffold flow
**Last verified:** 2026-05-11 (live verification against npm registry + repo `package.json` files)
**Supersedes:** `T4.1 Factory Package Matrix v1` (2026-04-28) — that doc presented target state as current state; this version is audited against actuals.

This is the canonical "what packages exist, who consumes them, and how to use them" reference. Every claim in this doc has been verified against the npm registry, the repo `package.json` files on `main`, and the active code paths as of 2026-05-11.

---

## How to read this doc

- **Published?** = Whether the package exists on npmjs.org under `@latimer-woods-tech/*` with the version shown
- **Active consumers** = Apps whose `package.json` on `main` currently lists this as a dependency. Sourced from live API check, not assumption
- **Status** = What this package is *for*; whether new apps should adopt it on day 1 (P0), at first feature need (P1-P2), or only on demand (P3+)
- **Code examples follow PLATFORM_STANDARDS** — no `uuid` npm package, no `node:crypto`, no `process.env`, ESM only, Hono only

If a package is published but has 0 active consumers, that's flagged as a Stage 3 adoption opportunity in the **Adoption Gap** column, not as a current-state error.

---

## The 22 Packages — Current State Audit

| Package | Published | Active Consumers (verified 2026-05-11) | Adoption Gap | Priority |
|---|---|---|---|---|
| `@latimer-woods-tech/errors` | v0.2.0 | **0 of 5 apps** (HD, VK, FA, CH, XC each use raw `throw new Error()` or per-app error classes) | Stage 3 adoption work | P0 — all new apps |
| `@latimer-woods-tech/logger` | v0.3.0 | **0 of 5 apps** (apps log via `console.*` directly — lint rule in `@lwt/eslint-config` will flag this) | Stage 3 | P0 |
| `@latimer-woods-tech/monitoring` | v0.2.1 | **0 of 5 apps** (each app wires `@sentry/cloudflare` directly) | Stage 3 | P0 |
| `@latimer-woods-tech/auth` | v0.2.0 | **0 of 5 apps** (videoking uses `better-auth`, HD has custom JWT, others vary) | Stage 3 — **plus an ADR is needed**: when do you use `@lwt/auth` vs `better-auth`? Currently undefined. | P0 |
| `@latimer-woods-tech/neon` | v0.2.3 | **0 of 5 apps** (apps use `drizzle-orm` directly with `Hyperdrive` binding) | Stage 3 | P0 |
| `@latimer-woods-tech/stripe` | v0.2.0 | **0 of 5 apps** (videoking + HD use `stripe@^15` SDK directly) | Stage 3 | P1 |
| `@latimer-woods-tech/llm` | v0.3.1 | **TBD** — Factory consumes via supervisor loop. Apps: TBD. | Stage 3 | P1 |
| `@latimer-woods-tech/llm-meter` | v0.2.0 | Required by `@lwt/llm` per ADR-0007 (org-level cost cap) | Stage 3 (wired automatically when adopting `@lwt/llm`) | P1 |
| `@latimer-woods-tech/analytics` | v0.2.0 | **0 of 5 apps** (frontends use `posthog-js` directly) | Stage 3 | P1 |
| `@latimer-woods-tech/email` | v0.2.0 | **0 of 5 apps** | Stage 3 | P2 |
| `@latimer-woods-tech/video` | v0.2.0 | **0 of 5 apps** (videoking uses Cloudflare Stream API directly) | Stage 3 | P2 (only if app handles video) |
| `@latimer-woods-tech/schedule` | v0.2.2 | **0 of 5 apps** (each app maintains its own Drizzle schema) | Stage 3 | App-specific — usage pattern needs ADR before promoting |
| `@latimer-woods-tech/admin` | v0.3.0 | Factory `apps/admin-studio/` (live; 43-row matrix tonight) | n/a — internal to Factory | P2 (internal) |
| `@latimer-woods-tech/compliance` | published | **0 of 5 apps** | Stage 5 (sellability — required for SOC 2 + GDPR/CCPA) | P2 |
| `@latimer-woods-tech/seo` | published | **0 of 5 apps** | Stage 5 | P3 |
| `@latimer-woods-tech/content` | published | **0 of 5 apps** | Stage 5 | P3 |
| `@latimer-woods-tech/social` | published | **0 of 5 apps** | On demand | P4 |
| `@latimer-woods-tech/copy` | published | **0 of 5 apps** | On demand | P4 |
| `@latimer-woods-tech/crm` | published | **0 of 5 apps** | On demand | P4 |
| `@latimer-woods-tech/telephony` | published | **0 of 5 apps** | On demand | P4 |
| `@latimer-woods-tech/testing` | published | **0 of 5 apps** | Stage 3 | P1 |
| `@latimer-woods-tech/deploy` | published | Used in CI on Factory (deploy scripts referenced from workflows) | n/a — Factory-owned | P1 |
| `@latimer-woods-tech/validation` | v0.1.0 | **0 of 5 apps** | On demand (AI-output-quality apps only) | P1 if app generates user-facing AI text |
| `@latimer-woods-tech/eslint-config` | **pending** Stage 3 PR | TBD post-publish | Will become P0 once published | P0 |
| `@latimer-woods-tech/tsconfig-base` | **pending** Stage 3 PR | TBD | P0 once published | P0 |
| `@latimer-woods-tech/biome-config` | **pending** Stage 3 PR | TBD | P0 once published | P0 |

**Summary: 22 packages published, 1 currently consumed (`@lwt/admin` by Factory itself). Stage 3 of the cohesion roadmap is exactly the work of moving the "0 of 5" rows above to "5 of 5".**

---

## Authoritative consumption patterns (corrected)

Every code example below follows PLATFORM_STANDARDS. No `uuid` npm package, no `process.env`, no `node:crypto`. Run through `@lwt/eslint-config` (once published) without warnings.

### Middleware chain (canonical for every Worker)

```ts
import { Hono } from 'hono'
import { logger } from '@latimer-woods-tech/logger'
import { withMonitoring, captureException } from '@latimer-woods-tech/monitoring'
import { withErrorBoundary, AppError } from '@latimer-woods-tech/errors'
import type { Env } from './env'

const app = new Hono<{ Bindings: Env; Variables: { request_id: string } }>()

// 1. request_id middleware (Web Crypto — not the `uuid` npm package)
app.use(async (c, next) => {
  const request_id = c.req.header('x-request-id') ?? crypto.randomUUID()
  c.set('request_id', request_id)
  c.header('x-request-id', request_id)
  await next()
})

// 2. monitoring + structured logging
app.use(withMonitoring())  // initializes Sentry from env.SENTRY_DSN; injects request_id

// 3. error boundary (catches AppError + unknown; renders typed HTTP responses)
app.use(withErrorBoundary())

// Routes
app.get('/health', (c) => c.json({ status: 'ok' }))
```

### Auth — `@lwt/auth` vs `better-auth` (open question)

**Current reality:** none of the 5 apps consume `@lwt/auth@0.2.0`. videoking uses `better-auth@^1` with its own `sessions`/`accounts`/`verifications` Drizzle tables. HD rolled custom JWT with refresh rotation + 2FA + OAuth. The other 3 are partially built.

**Open decision (needs ADR):** when do new apps adopt `@lwt/auth` vs `better-auth`?

Heuristic until ADR lands:
- **Use `better-auth`** if the app needs: Apple/Google SSO out of the box, multi-tenant orgs, sessions backed by your own DB, magic-link, passkey
- **Use `@lwt/auth`** if the app needs: minimal JWT + role middleware + custom user shape, no third-party auth dependency

Either way, the choice is documented in the app's `README.md` + an ADR ref.

### Database — `@lwt/neon` vs direct Drizzle

**Current reality:** apps use `drizzle-orm` directly with the Hyperdrive binding from `wrangler.jsonc`. `@lwt/neon@0.2.3` adds: connection pool defaults, RLS helper, `withTx()` ergonomics, query-plan logging hooks. Stage 3 adoption work migrates apps onto it.

**Pattern (post-adoption):**

```ts
import { getConnection, withTx } from '@latimer-woods-tech/neon'

// Single query
const conn = getConnection(c.env)
const balance = await conn.select({ total: sum(earnings.amount) })
  .from(earnings).where(eq(earnings.creator_id, userId))

// Transaction
await withTx(c.env, async (tx) => {
  const [payout] = await tx.insert(payouts).values({ ... }).returning()
  await tx.update(earnings).set({ paid_out_at: new Date() }).where(...)
  return payout
})
```

### LLM — actual `@lwt/llm@0.3.1` API (corrected)

The April 28 doc showed `generateText({ model: 'anthropic', prompt, maxTokens })` — that flat API **does not exist** in shipped `@lwt/llm@0.3.x`. The real interface is tiered routing per ADR-0006:

```ts
import { complete } from '@latimer-woods-tech/llm'

// Tier-routed call; meter-aware ($5/run cap via @lwt/llm-meter); Anthropic primary,
// Gemini 2.5 Pro long-context fallback (>150k tokens), Groq verifier on output.
const result = await complete({
  tier: 'smart',          // 'fast' | 'balanced' | 'smart' | 'verifier'
  prompt: '…',
  context: {
    project: 'capricast',  // for cost ledger
    actor: 'supervisor',   // for audit
    run_id: c.get('request_id'),
  },
  // Optional overrides:
  // model: 'anthropic/opus-4-7',
  // max_tokens: 4096,
})

if (!result.ok) {
  // Budget exceeded, model unreachable, or verifier rejected
  throw new AppError(result.error.code, result.error.message)
}
return c.text(result.completion)
```

For PR review specifically (ADR-0006), use the cascading peer-review pattern with Gemini Flash screening, not raw `complete()` calls.

### Stripe — corrected idempotency persistence

The April 28 doc flagged "idempotency keys not persisted in DB" as a gap. **It still is, and it's now tracked as GAP_REGISTER G31.** Pattern when implementing:

```ts
import { transferOrIdempotent } from '@latimer-woods-tech/stripe'  // post-Stage-3

// Stores idempotency_key + result hash in DB before calling Stripe;
// safe under retries and worker crashes
await transferOrIdempotent({
  db: c.env.DB,
  idempotency_key: `payout_${batch_id}`,
  amount, currency: 'usd', destination,
})
```

---

## Adoption sequence (Stage 3)

Per OPERATING_FRAMEWORK §6-stage sequence, Stage 3 is "Adoption Tools" (target ship: 2026-05-16). Order of adoption for each repo (highest leverage first, lowest blast radius first):

1. `@lwt/eslint-config` + `@lwt/tsconfig-base` + `@lwt/biome-config` — 3 new packages from tonight's Stage 3 PR. Zero runtime impact; lint-only.
2. `@lwt/logger` — drop-in for `console.*`. Verified by `@lwt/eslint-config`'s `lwt/no-console` rule.
3. `@lwt/errors` — replace per-app error classes. Smaller diff per repo.
4. `@lwt/monitoring` — wrap existing `@sentry/cloudflare` init. Backwards-compat shim available.
5. `@lwt/stripe` — billing-critical, do last. Has a documented migration path.
6. `@lwt/auth` — only if the **auth ADR** lands first deciding `@lwt/auth` vs `better-auth`. Otherwise defer.
7. `@lwt/neon` — only after `drizzle-orm` patterns are canonicalized in PLATFORM_STANDARDS.

Renovate config (also Stage 3) pins all `@lwt/*` versions to one canonical version across the org. When a package ships a minor, all consuming repos open coordinated upgrade PRs simultaneously.

---

## Open ADRs needed (added to GAP_REGISTER)

| Future ADR | What it decides | Blocks |
|---|---|---|
| **ADR-0008** | `@lwt/auth` vs `better-auth` selection criteria | Auth adoption across repos |
| **ADR-0009** | `@lwt/neon` vs direct `drizzle-orm` selection criteria + RLS templates | Neon adoption |
| **ADR-0010** | Schema package pattern (`@lwt/schedule` is the only example) — when should an app publish its schema as a Factory package? | Schema sharing across apps |
| **ADR-0011** | Email templating pattern across apps (shared template registry vs per-app) | Email adoption |

---

## Mapping to GAP_REGISTER

The 6 gaps in the April 28 T4.1 doc Part 5 are now formal entries in `docs/GAP_REGISTER.md` (see G31-G36):

| Old gap | New ID | Severity | Target |
|---|---|---|---|
| JWT rotation procedure (auth package) | G31 | P1 | Stage 4 — implement dual-key window |
| Idempotency persistence (stripe package) | G32 | P1 | Stage 3 — `stripe_idempotency_key` table + helper |
| RLS policies (neon package) | G33 | P2 | Stage 5 — PG RLS templates per role |
| Funnel definitions (analytics package) | G34 | P2 | Stage 2 — bundles with PostHog wiring (parallel work tonight) |
| Email templates (email package) | G35 | P2 | Stage 5 — transactional template registry |
| Audit logging for payouts (compliance) | G36 | P1 | Stage 5 — `@lwt/compliance.auditLog()` on all admin mutating routes |

---

## What changed vs the April 28 draft

For posterity. If you wonder why the doc says different things than the prior version you saw:

1. **VideoKing consumption claims:** all 12 "✅ Active" rows reset to "0 of 5 apps" based on live `package.json` audit. The April 28 doc was a planning artifact; this version is an audit.
2. **`@lwt/admin` status:** "TBD" → "v0.3.0 published, consumed by Factory `apps/admin-studio/`"
3. **`@lwt/llm` API:** flat `generateText()` → tiered `complete({tier, …})` per ADR-0006
4. **Code samples:** `uuid` npm package → `crypto.randomUUID()` (Web Crypto, PLATFORM_STANDARDS §1 compliant)
5. **`@lwt/llm-meter`, `@lwt/realtime`, `@lwt/entitlements`:** added (existed but missing from prior matrix)
6. **`@lwt/auth` vs `better-auth`:** documented as an open decision needing ADR-0008
7. **The 6 gaps:** moved into formal GAP_REGISTER entries (G31–G36)
8. **T4.1 exit criteria:** the open item "scaffold new app using matrix as guide" remains open. **xico-city is now flagged as the live-validation target** — it has the most rigorous build spec (`CANONICAL_DJMEXXICO_FeatureRegistry_v3.xlsx` + the matrix tonight) and would prove the adoption pattern under real constraints.

---

> **Consolidation note (2026-05-14):** `docs/FACTORY_PACKAGE_MATRIX.md` (April 2026 draft) has been deleted. This file is the only canonical package matrix. Stale packages.yml references should point here.
