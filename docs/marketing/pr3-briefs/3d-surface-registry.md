# PR 3d — Surface Registry (URL → cell routing in `@lwt/content`)

**Status:** Drafted · **Depends on:** 3b (ICP dimension data exists)
**Owner package:** `@latimer-woods-tech/content` · **Effort:** 2 days
**Branch:** `marketing/3d-surface-registry` · **Bottleneck:** NO — parallel with 3e/3f/3h/3i/3j

## 1. Goal

Give the marketing system a deterministic answer to "which ICP cell owns this URL, and which voice should render it?" so landing pages (3c/3h), embeds (3i), referrals (3j), supervisor publishing (3e), and attribution (3k) share one source of truth.

Ship:

- YAML registry at [`docs/marketing/surfaces/*.yaml`](../surfaces/) — one file per public domain — encoding [`CHANNEL_DOCTRINE.md §4`](../CHANNEL_DOCTRINE.md#4-channel-surface-conventions).
- Pure TS resolver in [`packages/content/src/surfaces.ts`](../../../packages/content/src/) — `getCellForUrl`, `getDefaultVoiceForCell`, `resolveSurface`.
- Hono middleware `surfaceContext()` that sets `c.set('cell', ...)` + `c.set('voiceKey', ...)` on every request.
- Per-domain defaults: `selfprime.net → selfprime:consumer`; `cipherofhealing.com → cypher:seeker`.
- Bi-modal landings (`selfprime.net/find` publisher vs visitor fork per CHANNEL_DOCTRINE §4).

**Package-vs-fold decision:** fold into `@lwt/content` rather than create a new `@lwt/surfaces`. After PR 3b, `@lwt/content` already owns `ContentItem.{cell_key,channel,campaign_id}` — keeping "what" + "where" in one place avoids a 25th package and a new dep edge in [`CLAUDE.md` package order](../../../CLAUDE.md#package-dependency-order).

## 2. Non-goals

- ❌ Runtime DB-backed registry (YAML at build-time is enough; DB override is a follow-up)
- ❌ Rewriting existing landing-page workers (consumers adopt the middleware in their own PRs)
- ❌ Per-user personalisation (cell is URL-derived; bi-modal fork uses *intent signal* — referrer/UTM)
- ❌ Multi-tenant cell overrides (cells are portfolio-wide)
- ❌ Replacing `@lwt/social`'s publish primitives — surface registry is read-only routing
- ❌ Schema changes (PR 3b already shipped `cell_key`)

## 3. Dependencies

Files the executor MUST read:

- [`packages/content/src/index.ts`](../../../packages/content/src/index.ts) — host package
- [`CHANNEL_DOCTRINE.md §4`](../CHANNEL_DOCTRINE.md#4-channel-surface-conventions) — the table this PR encodes
- [`VOICES.md §1–§2`](../VOICES.md) — voice key fallback chain
- [`ICP_MATRIX.md`](../ICP_MATRIX.md) — canonical cell keys (`{product}:{icp}`)
- [`CAMPAIGN_TAGGING.md §3`](../CAMPAIGN_TAGGING.md#3-where-the-tag-lives) — `surface` field semantics + `unknown` sentinel
- [`CONSTITUTION.md §5`](../CONSTITUTION.md#5-channel-allowlist--readiness-gates) — readiness gating
- [`CLAUDE.md`](../../../CLAUDE.md) — Workers runtime, no Node built-ins, no `process.env`, ESM only
- [`docs/service-registry.yml`](../../service-registry.yml) — canonical domain list (build-time cross-check)

## 4. Migrations

**No DDL.** YAML + code only. Rollback = revert YAML in git.

`tsup` reads `docs/marketing/surfaces/*.yaml` at build time and emits `dist/surfaces.generated.ts` (same pattern as `apps/supervisor/src/planner/templates.generated.json`). Workers cannot read files at runtime ([CLAUDE.md](../../../CLAUDE.md#hard-constraints)).

```yaml
# docs/marketing/surfaces/selfprime.net.yaml
domain: selfprime.net
default_cell: selfprime:consumer
default_voice_key: prime_self:consumer
routes:
  - pattern: /practitioners/*
    cell: selfprime:practitioner
    voice_key: prime_self:practitioner
    readiness: earned_active

  - pattern: /find
    cell: selfprime:practitioner        # publisher mode
    voice_key: prime_self:practitioner
    readiness: earned_active
    bimodal:
      fork_on: referrer
      visitor:
        when: "referrer !startswith https://selfprime.net/practitioners/"
        cell: selfprime:consumer
        voice_key: prime_self:consumer

  - pattern: /r/:practitioner/:reading
    cell: selfprime:consumer
    voice_key: prime_self:consumer
    readiness: earned_active

  - pattern: /embed/*
    cell: selfprime:consumer
    voice_key: prime_self:consumer
    readiness: discovery
    bimodal:
      fork_on: referrer_host
      visitor:
        when: "referrer_host matches *.cipherofhealing.com"
        cell: cypher:seeker
        voice_key: cypher_seeker
```

Patterns: [`URLPattern`](https://developer.mozilla.org/en-US/docs/Web/API/URLPattern) syntax — Workers-native, no Node dep. Glob `*` and named groups `:slug` only — no regex.

## 5. API shape

```ts
// packages/content/src/surfaces.ts
export type CellKey = string;        // per ICP_MATRIX, `{product}:{icp}`
export type VoiceKey = string;       // per VOICES.md
export type ReadinessState = 'not_started' | 'discovery' | 'earned_active' | 'paid_ready' | 'paid_active';

export interface SurfaceRoute {
  pattern: string;                   // URLPattern, no scheme/host
  cell: CellKey;
  voiceKey: VoiceKey;
  readiness: ReadinessState;
  bimodal?: {
    forkOn: 'referrer' | 'referrer_host' | 'utm_source' | 'utm_content';
    visitor: { when: string; cell: CellKey; voiceKey: VoiceKey };  // when DSL — see §5.1
  };
}

export interface DomainRegistry {
  domain: string;
  defaultCell: CellKey;
  defaultVoiceKey: VoiceKey;
  routes: SurfaceRoute[];
}

export interface ResolvedSurface {
  cell: CellKey;
  voiceKey: VoiceKey;
  readiness: ReadinessState;
  matchedPattern: string;            // 'default' if domain-default fallback
  forkedToVisitor: boolean;
  surface: string;                   // pattern, not concrete path — bounded cardinality for CAMPAIGN_TAGGING
}

export interface ResolveContext {
  referrer?: string;
  utm?: { source?: string; content?: string; campaign?: string };
}

/** Domain default if no pattern matches; `unknown` sentinel if domain unmapped. */
export function getCellForUrl(url: string | URL, ctx?: ResolveContext): CellKey;

/** Fallback chain: registered voice for cell → `{product}:default` → `default`. */
export function getDefaultVoiceForCell(cell: CellKey): VoiceKey;

export function resolveSurface(url: string | URL, ctx?: ResolveContext): ResolvedSurface;
export function getRegistry(domain: string): DomainRegistry | undefined;
export function listDomains(): string[];
```

### 5.1 `when` expression DSL

Tiny, deterministic, no `eval`. Three operators, AND-only composition (newline-separated). No OR, no nesting; any future expansion requires an ADR.

| Operator | Example | Semantics |
|---|---|---|
| `startswith` / `!startswith` | `referrer startswith https://selfprime.net/practitioners/` | String prefix |
| `matches` / `!matches` | `referrer_host matches *.cipherofhealing.com` | Glob (single `*`) |
| `equals` / `!equals` | `utm_source equals practitioner-share` | Exact match |

### 5.2 Hono middleware

```ts
// packages/content/src/surfaces.middleware.ts
import type { MiddlewareHandler } from 'hono';

export function surfaceContext(opts?: {
  domainFromHost?: (host: string) => string;            // default: c.req.header('host')
  onResolve?: (r: ResolvedSurface, url: URL) => void;   // structured log hook
}): MiddlewareHandler;
```

Sets `cell`, `voiceKey`, `surface`, `forkedToVisitor` on the Hono context. Missing `Host` header resolves to `unknown` cell + `default` voice (no throw).

## 6. Test plan

- **Unit tests** (Vitest, 95%+ lines / 90%+ branches):
  - `getCellForUrl('https://selfprime.net/practitioners/jane')` → `selfprime:practitioner`
  - `getCellForUrl('https://selfprime.net/')` → `selfprime:consumer` (domain default)
  - `getCellForUrl('https://unknown.example/foo')` → `unknown` (per [CAMPAIGN_TAGGING.md §5](../CAMPAIGN_TAGGING.md#5-reserved-keys-dont-use-these-as-values))
  - `/find` no referrer → `selfprime:practitioner` (publisher)
  - `/find` ref=`google.com` → `selfprime:consumer` (visitor fork)
  - `/find` ref=`selfprime.net/practitioners/jane` → `selfprime:practitioner` (own-dir)
  - `/embed/chart` ref host=`x.cipherofhealing.com` → `cypher:seeker` (cross-cell)
  - `getDefaultVoiceForCell('selfprime:practitioner')` → `prime_self:practitioner`
  - `getDefaultVoiceForCell('selfprime:unknown_icp')` → `prime_self:default` (fallback)
  - `getDefaultVoiceForCell('made:up:cell')` → `default` (terminal)
  - `resolveSurface.surface` returns *pattern*, not concrete path
  - `when` DSL: each operator covered; malformed expression fails tsup build (negative fixture)
  - Glob doesn't over-match (`/practitioners/*` ≠ `/practice/foo`)
  - URLPattern named groups (`:practitioner`) extracted onto context
- **Middleware integration** (`@cloudflare/vitest-pool-workers`):
  - `surfaceContext()` sets `c.get('cell')` correctly across representative URLs
  - `onResolve` fires once per request
  - Missing `Host` header → `unknown` cell, no throw
- **Build test:** invalid YAML (missing `cell`, unregistered voice key, unknown signal in `forkOn`) fails `tsup build` with file:line error
- **Snapshot test:** `surfaces.generated.ts` matches checked-in snapshot

## 7. Verification

After deploying any worker that mounts the middleware (recommend `apps/admin-studio` with an `/_surface` introspection endpoint gated by `JWT_SECRET`):

```bash
# Domain default
curl -i -H "Host: selfprime.net" https://admin-studio-staging.adrper79.workers.dev/_surface
# Expect: 200 { "cell":"selfprime:consumer", "voiceKey":"prime_self:consumer", "matchedPattern":"default" }

# Practitioner subroute
curl -i -H "Host: selfprime.net" https://admin-studio-staging.adrper79.workers.dev/practitioners/jane/_surface
# Expect: cell=selfprime:practitioner, voiceKey=prime_self:practitioner

# Bi-modal — publisher
curl -i -H "Host: selfprime.net" https://admin-studio-staging.adrper79.workers.dev/find/_surface
# Expect: cell=selfprime:practitioner, forkedToVisitor=false

# Bi-modal — visitor fork
curl -i -H "Host: selfprime.net" -H "Referer: https://google.com/" \
  https://admin-studio-staging.adrper79.workers.dev/find/_surface
# Expect: cell=selfprime:consumer, forkedToVisitor=true

# Cross-domain
curl -i -H "Host: cipherofhealing.com" https://admin-studio-staging.adrper79.workers.dev/_surface
# Expect: cell=cypher:seeker, voiceKey=cypher_seeker

# Unknown domain
curl -i -H "Host: example.com" https://admin-studio-staging.adrper79.workers.dev/_surface
# Expect: cell=unknown, voiceKey=default
```

## 8. Acceptance criteria

- [ ] `docs/marketing/surfaces/` exists with one YAML per registered domain (min: `selfprime.net.yaml`, `cipherofhealing.com.yaml`)
- [ ] Every cell key in YAML exists in [`ICP_MATRIX.md`](../ICP_MATRIX.md) — build-time check
- [ ] Every voice key in YAML is registered in `voiceProfiles` from PR 3c — build-time check
- [ ] `getCellForUrl`, `getDefaultVoiceForCell`, `resolveSurface`, `getRegistry`, `listDomains` all exported from `@latimer-woods-tech/content/surfaces`
- [ ] `surfaceContext()` exported from `@latimer-woods-tech/content/surfaces.middleware`
- [ ] Bi-modal `selfprime.net/find` fork works
- [ ] Domain-default fallback works for unmapped paths
- [ ] Unknown-domain returns `unknown` sentinel (no throw)
- [ ] Test coverage ≥95% lines, ≥90% branches
- [ ] Zero `any` in public API; zero `process.env`; zero Node built-ins
- [ ] Verification curl sequence above succeeds in staging
- [ ] `CHANGELOG.md` in `@lwt/content`; minor version bump (additive)
- [ ] Build-time validator rejects: missing `cell`, unregistered voice key, malformed `when`, unknown signal in `forkOn`

## 9. File list

```
packages/content/
  src/
    index.ts                       # re-export surfaces API
    surfaces.ts                    # NEW — resolveSurface + lookups
    surfaces.middleware.ts         # NEW — Hono middleware factory
    surfaces.when.ts               # NEW — when DSL parser + evaluator
    surfaces.generated.ts          # GENERATED at build time from YAML
  test/
    surfaces.test.ts               # NEW
    surfaces.middleware.test.ts    # NEW
    surfaces.when.test.ts          # NEW
    fixtures/malformed.yaml        # NEW — negative-test fixture
  scripts/
    build-surfaces.mjs             # NEW — tsup pre-step

docs/marketing/surfaces/
  selfprime.net.yaml               # NEW — required
  cipherofhealing.com.yaml         # NEW — required
  factory-internal.yaml            # NEW
  README.md                        # NEW
```

## 10. Risks + mitigations

| Risk | Mitigation |
|---|---|
| URLPattern unavailable on older CF runtime | `compatibility_date` already ≥ 2024-09; add `compatibility_flags: ["url_pattern"]` only if a consumer's wrangler lags |
| Cardinality explosion on `surface` tag | `surface` returns the *pattern*, not the concrete path — bounded (<50 today) |
| Bi-modal fork mis-routes a real visitor | DSL is intentionally restricted; AND-only; `onResolve` logs every fork; tripwire in [`MARKETING_SUPERVISOR.md §8`](../MARKETING_SUPERVISOR.md#8-failure-modes--recovery) monitors fork-rate anomalies |
| Drift from [`CHANNEL_DOCTRINE.md §4`](../CHANNEL_DOCTRINE.md#4-channel-surface-conventions) | Build-time validator cross-checks YAML against doc table; doc-without-YAML edits fail CI |
| Consumer worker forgets middleware | Audit baked into 3e supervisor health check; admin-studio shows missing-surface workers |
| Operator needs production override | Defer: DB-backed override read at warm-cache TTL. Out of scope |
| YAML size pressure on script-size budget | YAML dev-only; emitted `.generated.ts` gzipped <10 KB for current registry |

## 11. Cross-references

- [`CHANNEL_DOCTRINE.md §4`](../CHANNEL_DOCTRINE.md#4-channel-surface-conventions) — table this PR encodes
- [`CHANNEL_DOCTRINE.md §5`](../CHANNEL_DOCTRINE.md#5-readiness-gate-progression-constitution-5-operationalized) — readiness states
- [`VOICES.md`](../VOICES.md) — voice key fallback chain
- [`ICP_MATRIX.md`](../ICP_MATRIX.md) — canonical cell keys
- [`CAMPAIGN_TAGGING.md §3`](../CAMPAIGN_TAGGING.md#3-where-the-tag-lives) — `surface` consumers
- [`CONSTITUTION.md §5`](../CONSTITUTION.md#5-channel-allowlist--readiness-gates) — readiness gating
- [`packages/content/src/index.ts`](../../../packages/content/src/index.ts) — host package
- [`CLAUDE.md`](../../../CLAUDE.md) — hard constraints + verification requirement
- PR 3b (predecessor — `cell_key` data) · PR 3c (voice profile registry consulted) · PR 3e (supervisor uses `resolveSurface` for publishing) · PR 3i (embed worker mounts middleware first)
