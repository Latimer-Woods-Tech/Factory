# PR 3k — `@lwt/attribution` Package

**Status:** Drafted · **Depends on:** 3b (touch columns on `crm_leads`)
**Owner package:** `@latimer-woods-tech/attribution` (NEW) · **Effort:** 3 days
**Branch:** `marketing/3k-attribution` · **Bottleneck:** NO

## 1. Goal

Implement the attribution model from [`ATTRIBUTION.md`](../ATTRIBUTION.md) end-to-end as a single package. Three responsibilities, one substrate:

1. **Source dedup registry** ([`source-map.ts`](../../../packages/attribution/src/source-map.ts)) — host → canonical source per [`ATTRIBUTION.md §3`](../ATTRIBUTION.md#3-source-dedup-registry)
2. **UTM capture middleware** — Hono middleware that reads UTM params + `Referer`, normalizes via source-map, persists to session
3. **Touch-stamping service** — server-side functions called from auth signup, login, conversion webhooks to update `crm_leads.first_touch_*` / `last_touch_*` per the dual-model rules in [`ATTRIBUTION.md §4`](../ATTRIBUTION.md#4-touch-stamping-rules) and the [2026-05-18 attribution ADR](../../decisions/2026-05-18-attribution-model.md)

No new DDL — the package reads and writes only columns added by [PR 3b](./3b-icp-dimension.md).

## 2. Non-goals

- ❌ Multi-touch attribution (Markov / time-decay / U-shape) — Phase 2 per ADR.
- ❌ Cross-device user merging — handled by auth at `user_id` resolution; this package only reads `(user_id, app_id)` and writes touches.
- ❌ Bot filtering — assumed already applied upstream (`factory_events.bot=true` rows excluded); package trusts caller.
- ❌ A new touch event table — `touch_history` JSONB on `crm_leads` is the substrate (capped at 50 entries per PR 3b).
- ❌ Pre-2026-05-18 backfill — explicit out-of-scope per ADR.
- ❌ Client-side cookie/localStorage logic — that lives in app frontends; this package is server-only (Hono middleware + DB writes).

## 3. Dependencies

Files the executor MUST read:

- [`ATTRIBUTION.md`](../ATTRIBUTION.md) — full spec; this package implements it 1:1
- [`docs/decisions/2026-05-18-attribution-model.md`](../../decisions/2026-05-18-attribution-model.md) — dual-model ADR
- [`CAMPAIGN_TAGGING.md`](../CAMPAIGN_TAGGING.md) — 5-tuple including `utm_campaign`
- [`packages/crm/src/index.ts`](../../../packages/crm/src/index.ts) — `crm_leads` schema after PR 3b
- [`packages/neon/src/index.ts`](../../../packages/neon/src/index.ts) — `FactoryDb`, `sql`, `withTenant`
- [`packages/errors/`](../../../packages/errors/) — error classes
- [`packages/logger/`](../../../packages/logger/) — structured logging
- [`CLAUDE.md`](../../../CLAUDE.md) — Workers runtime, ESM only, no `process.env`, no Node built-ins

## 4. Migrations

**None.** Package reads/writes columns added by PR 3b. This PR is code-only.

If validation reveals a missing column at runtime, the package throws `InternalError(MIGRATION_MISSING)` with a clear message pointing to PR 3b rather than auto-creating columns.

## 5. API shape

```ts
// packages/attribution/src/index.ts

import type { Context, MiddlewareHandler } from 'hono';
import type { FactoryDb } from '@latimer-woods-tech/neon';

/** Canonical, deduped source — the values that end up in crm_leads.{first,last}_touch_source. */
export type CanonicalSource =
  | 'x' | 'linkedin' | 'youtube' | 'tiktok' | 'instagram' | 'reddit' | 'substack'
  | 'astrology_podcast' | 'astrology_hub' | 'organic_search' | 'paid_search'
  | 'referral' | 'direct' | 'unknown'
  | `email_${string}`;                    // dynamic — any utm_source matching email_*

/** A single resolved touch — what the package captures or stamps. */
export interface TouchInfo {
  source: CanonicalSource;
  campaign?: string;                       // utm_campaign / campaign_id per CAMPAIGN_TAGGING.md
  medium?: string;                         // utm_medium
  content?: string;                        // utm_content (cell key)
  term?: string;                           // utm_term (sub-segment / A/B arm)
  at: Date;
  /** True when the source was derived from UTM (high trust); false when only Referer was present (low trust). */
  highTrust: boolean;
}

/** Read UTM params + Referer from an inbound request; normalize source via source-map.
 *  Pure — does not touch DB. Used inside the middleware AND by webhook handlers
 *  that receive a captured-touch payload from the frontend. */
export function captureUtmFromRequest(req: Request): TouchInfo;

/** Hono middleware. Reads UTM + Referer, attaches a TouchInfo to c.var.touch.
 *  Persists to a signed cookie `lwt_last_touch` and (if absent) `lwt_first_touch`,
 *  so SPAs that don't round-trip through the server still see the touch on the next request.
 *  Cookie names + signing key are config-driven; no `process.env`. */
export function utmCaptureMiddleware(opts: {
  cookieSigningKey: string;
  firstTouchCookieName?: string;            // default 'lwt_first_touch'
  lastTouchCookieName?: string;             // default 'lwt_last_touch'
}): MiddlewareHandler;

/** Stamp first_touch_* if currently NULL; no-op otherwise.
 *  Idempotent. Safe to call on every signup, every login, every conversion. */
export async function stampFirstTouch(
  db: FactoryDb,
  opts: { tenantId: string; userId: string; appId: string; touch: TouchInfo },
): Promise<void>;

/** Stamp last_touch_* unless the incoming touch is `direct` AND a known source already exists.
 *  Also appends to touch_history (capped at 50; oldest evicted).
 *  Idempotent within the same (source, campaign, at) tuple — duplicate stamps are no-ops. */
export async function stampLastTouch(
  db: FactoryDb,
  opts: { tenantId: string; userId: string; appId: string; touch: TouchInfo },
): Promise<void>;

/** Convenience: read first + last + history for a single lead. */
export interface AttributionView {
  userId: string;
  appId: string;
  cellKey: string;
  first: { source: CanonicalSource; campaign?: string; at: Date } | null;
  last: { source: CanonicalSource; campaign?: string; at: Date } | null;
  history: Array<{ source: CanonicalSource; campaign?: string; at: Date }>;
}

export async function getAttributionForLead(
  db: FactoryDb,
  opts: { tenantId: string; userId: string; appId: string },
): Promise<AttributionView>;

/** Per-cell × channel monthly allocation view — implements the table in ATTRIBUTION.md §7. */
export interface AllocationRow {
  cellKey: string;
  source: CanonicalSource;
  newPaid: number;
  d30RetentionPct: number;
  cacCents: number;
  ltvCents: number;
  ltvCacRatio: number | null;               // null when CAC = 0 (earned)
}

export async function getCellChannelAllocation(
  db: FactoryDb,
  opts: { tenantId: string; cellKey: string; period: { start: Date; end: Date } },
): Promise<{ rows: AllocationRow[] }>;

// packages/attribution/src/source-map.ts

/** Host substring → canonical source. Substring match (case-insensitive) on hostname. */
export const HOST_TO_SOURCE: ReadonlyArray<readonly [hostPattern: RegExp, source: CanonicalSource]>;

/** utm_source value → canonical source. Exact, lowercased match. */
export const UTM_SOURCE_TO_SOURCE: Readonly<Record<string, CanonicalSource>>;

/** Resolve a raw hostname to a canonical source, defaulting to 'direct' for empty/null
 *  and 'unknown' for hostnames not in the map. */
export function resolveSourceFromHost(host: string | null | undefined): CanonicalSource;

/** Resolve a utm_source value to a canonical source. */
export function resolveSourceFromUtm(utmSource: string | null | undefined): CanonicalSource;
```

### 5.1 Source-map auto-update mechanism

Unknown hosts producing ≥10 visits in any rolling 7-day window auto-open a draft PR proposing classification, per [`ATTRIBUTION.md §3`](../ATTRIBUTION.md#3-source-dedup-registry). Mechanism:

| Component | Where | Responsibility |
|---|---|---|
| Visit counter | `factory_events` query, run by a cron Worker in `apps/marketing-supervisor` (PR 3e) | Group by `referer_host` where `resolved_source = 'unknown'`; window = trailing 7 days |
| Threshold check | Same Worker | Emit one draft-PR proposal per host that crosses ≥10 visits and is not already pending |
| Draft PR opener | A GitHub App with `pull-requests: write` (existing `factory-bot` app per [`docs/runbooks/github-secrets-and-tokens.md`](../../runbooks/github-secrets-and-tokens.md)) | Opens a PR on `Latimer-Woods-Tech/Factory` adding `[hostPattern, 'unknown']` to `HOST_TO_SOURCE` with a comment block listing visit count + sample paths. Operator edits the source assignment before merging |
| Dedupe + cooldown | Worker reads existing open PRs labeled `attribution:source-map`; skips hosts already pending. After merge, a 30-day cooldown prevents flapping if the host re-appears below threshold |
| Cron schedule | `0 13 * * *` (daily 13:00 UTC) via the supervisor Worker cron trigger | One scan per day; lightweight enough not to need its own Worker |

The PR template lives at [`.github/PULL_REQUEST_TEMPLATE/attribution-source-map.md`](../../../.github/PULL_REQUEST_TEMPLATE/attribution-source-map.md) (added by this PR). Auto-merge is **disabled** — the source assignment is a judgement call that must be human-reviewed.

## 6. Test plan

- **Unit tests** (Vitest, 90%+ coverage):
  - `resolveSourceFromHost` returns the right canonical source for every entry in `ATTRIBUTION.md §3`
  - `resolveSourceFromHost` returns `'direct'` for null/empty, `'unknown'` for unmapped hosts
  - `resolveSourceFromUtm` handles `email_*` dynamic prefix (returns `email_practitioner_welcome_v1` for that input)
  - `captureUtmFromRequest` extracts all 5 UTMs + sets `highTrust: true` when any UTM present
  - `captureUtmFromRequest` falls back to Referer with `highTrust: false` when no UTM
  - `captureUtmFromRequest` returns `source: 'direct'` when no UTM and no Referer
  - `stampFirstTouch` sets columns when NULL; no-op when set (key correctness — first-touch immutable per ADR)
  - `stampLastTouch` updates when incoming source is non-direct
  - `stampLastTouch` does NOT overwrite a known source with `direct` (the load-bearing rule from ATTRIBUTION §4)
  - `stampLastTouch` appends to `touch_history`; evicts oldest beyond 50 entries
  - `stampLastTouch` is idempotent within (source, campaign, minute-precision-at) — duplicate stamps within 60s are deduped
  - `getAttributionForLead` returns NotFoundError for unknown (userId, appId)
  - `getCellChannelAllocation` math matches the SQL in `ATTRIBUTION.md §5` (verified against a fixture dataset)
- **Middleware integration tests** (`@cloudflare/vitest-pool-workers`):
  - GET `/?utm_source=linkedin&utm_campaign=foo` → `c.var.touch.source === 'linkedin'`, cookies set
  - Second GET without UTM but with first-touch cookie → cookie preserved, no `stampFirstTouch` call from middleware (writes only happen on explicit server-side stamp calls)
  - Cookie tamper (modified signature) → cookie rejected, treated as no prior touch
- **End-to-end test** (vitest + mocked DB):
  - User lands via LinkedIn UTM → `stampFirstTouch` writes `linkedin`
  - User returns direct → `stampLastTouch` does NOT overwrite (still `linkedin`)
  - User returns via email click → `stampLastTouch` overwrites to `email_practitioner_welcome_v1`
  - Final state: first=linkedin, last=email_*, history has 3 entries
- **Coverage:** ≥90% lines, ≥85% branches

## 7. Verification

After deploy to staging (assumes `selfprime-staging` Worker registers the middleware):

```bash
# 1. UTM capture — fresh session
curl -sS -c /tmp/jar.txt "https://staging.selfprime.net/?utm_source=linkedin&utm_medium=social&utm_campaign=2026-q3-practitioner-design-partners&utm_content=practitioner" \
  -o /dev/null -w "%{http_code}\n"
# Expect: 200

# Inspect cookies
grep -E "lwt_(first|last)_touch" /tmp/jar.txt
# Expect: both cookies set with the linkedin/campaign tuple (signed)

# 2. Server-side stamp (test endpoint)
curl -sS -X POST https://staging.selfprime.net/test/stamp-touch \
  -H "Content-Type: application/json" \
  -d '{"userId":"u-attr-test","appId":"selfprime","source":"linkedin","campaign":"2026-q3-practitioner-design-partners"}'

# Verify
psql $STAGING_DATABASE_URL -c "SELECT first_touch_source, last_touch_source, jsonb_array_length(touch_history) FROM crm_leads WHERE user_id = 'u-attr-test';"
# Expect: first=linkedin, last=linkedin, history length=1

# 3. Direct does NOT overwrite
curl -sS -X POST https://staging.selfprime.net/test/stamp-touch \
  -d '{"userId":"u-attr-test","appId":"selfprime","source":"direct"}'

psql $STAGING_DATABASE_URL -c "SELECT first_touch_source, last_touch_source FROM crm_leads WHERE user_id = 'u-attr-test';"
# Expect: first=linkedin, last=linkedin (UNCHANGED — this is the key correctness check)

# 4. Email overwrites last but not first
curl -sS -X POST https://staging.selfprime.net/test/stamp-touch \
  -d '{"userId":"u-attr-test","appId":"selfprime","source":"email_practitioner_welcome_v1","campaign":"2026-q3-practitioner-design-partners"}'

psql $STAGING_DATABASE_URL -c "SELECT first_touch_source, last_touch_source FROM crm_leads WHERE user_id = 'u-attr-test';"
# Expect: first=linkedin, last=email_practitioner_welcome_v1

# 5. Allocation view
curl -sS "https://staging.selfprime.net/test/allocation?cellKey=selfprime:practitioner&start=2026-05-01&end=2026-05-31" | jq .
# Expect: rows array with the channels from §7 fixture; sums match the SQL in ATTRIBUTION.md §5
```

Expected `/health` endpoint on the consumer Worker: returns 200 with `{"attribution":"ok","sourceMapVersion":"<git-sha>","pendingUnknownHosts":N}`.

## 8. Acceptance criteria

- [ ] Source-map covers every entry in [`ATTRIBUTION.md §3`](../ATTRIBUTION.md#3-source-dedup-registry)
- [ ] `captureUtmFromRequest` correctly classifies UTM-tagged, Referer-only, and bare-direct requests
- [ ] `stampFirstTouch` is immutable — verified by negative test (second call with different source does NOT overwrite)
- [ ] `stampLastTouch` does NOT overwrite known source with `direct` — verified by curl step 3 above
- [ ] `touch_history` JSONB cap at 50 entries enforced
- [ ] Middleware signs cookies (HMAC-SHA256 via Web Crypto); tampered cookies rejected
- [ ] `getCellChannelAllocation` output matches `ATTRIBUTION.md §5` SQL on a 200-row fixture
- [ ] Source-map auto-update mechanism wired: cron query → draft PR via factory-bot GitHub App; cooldown + dedupe logic exists; PR template lands at `.github/PULL_REQUEST_TEMPLATE/attribution-source-map.md`
- [ ] No DDL — runtime check throws `MIGRATION_MISSING` if PR 3b columns absent
- [ ] Test coverage ≥90% lines, ≥85% branches
- [ ] Zero `any` in public API; zero `process.env`; no Node built-ins; ESM only
- [ ] Verification curl sequence above (5 steps) succeeds end-to-end in staging
- [ ] [PR 3j (referrals)](./3j-referrals.md) `recordPayment` switched from direct-write to `stampLastTouch` call (cross-PR TODO resolved)
- [ ] CHANGELOG.md + semver bump (minor — new package)

## 9. File list

```
packages/attribution/
  package.json                          # NEW — deps on errors, neon, logger, hono (peer)
  tsup.config.ts
  src/
    index.ts                            # NEW — public API re-exports
    types.ts                            # NEW — TouchInfo, CanonicalSource, AttributionView, AllocationRow
    source-map.ts                       # NEW — HOST_TO_SOURCE, UTM_SOURCE_TO_SOURCE, resolveSourceFromHost/Utm
    capture.ts                          # NEW — captureUtmFromRequest
    middleware.ts                       # NEW — utmCaptureMiddleware (Hono)
    stamp.ts                            # NEW — stampFirstTouch, stampLastTouch
    queries.ts                          # NEW — getAttributionForLead, getCellChannelAllocation
    cookies.ts                          # NEW — sign/verify via Web Crypto HMAC-SHA256
  test/
    source-map.test.ts                  # NEW
    capture.test.ts                     # NEW
    middleware.test.ts                  # NEW — Workers pool
    stamp.test.ts                       # NEW
    queries.test.ts                     # NEW (with fixture)
    integration.test.ts                 # NEW — end-to-end touch flow
    fixtures/
      allocation-fixture.sql            # NEW — 200-row dataset for queries test
  CHANGELOG.md                          # NEW

.github/
  PULL_REQUEST_TEMPLATE/
    attribution-source-map.md           # NEW — template for auto-opened source-map PRs

apps/marketing-supervisor/               # consumer — adds the cron handler
  src/handlers/source-map-scan.ts       # NEW — daily scan + draft-PR opener
```

## 10. Risks + mitigations

| Risk | Mitigation |
|---|---|
| `stampLastTouch` race when two requests stamp simultaneously | Use `UPDATE ... WHERE last_touch_at IS NULL OR last_touch_at < $1` with `RETURNING` — last writer wins for true concurrent; idempotent for retries |
| `touch_history` JSONB grows unbounded if cap logic has a bug | DB write uses `jsonb_path_query_array(... LIMIT 50)` server-side; defense in depth beyond app-layer trim |
| Referer header stripped by browser policies (Referrer-Policy: no-referrer) | Treated as direct (`highTrust: false`); UTM is the high-trust signal; document in package README |
| Cookie signing key rotation | Two-key rotation supported (`current` + `previous`); cookies signed with current, verified against either; rotation by config swap |
| Unknown-host auto-PR spam during a launch | Cooldown of 30 days post-merge per host; daily cap of 5 new PRs across the system (configurable) |
| Bot traffic stamping touches | Upstream contract: callers are responsible for filtering `bot=true` rows before invoking stamps; package documents this clearly |
| `email_*` dynamic source proliferation | Acceptable — the prefix carries the sequence name; downstream reporting groups by `email_*` prefix when needed |
| Source-map merge conflicts when 2 PRs open same day | Auto-opened PRs include a single map entry only; rebases are trivial; bot retries once on conflict |

## 11. Cross-references

- [`ATTRIBUTION.md`](../ATTRIBUTION.md) — full spec implemented here
- [`docs/decisions/2026-05-18-attribution-model.md`](../../decisions/2026-05-18-attribution-model.md) — dual-model ADR
- [`CAMPAIGN_TAGGING.md`](../CAMPAIGN_TAGGING.md) — 5-tuple convention
- [`CHANNEL_DOCTRINE.md`](../CHANNEL_DOCTRINE.md) — channel state machine consumes allocation view
- [`KPI_DECOMPOSITION.md`](../KPI_DECOMPOSITION.md) — decomposition queries call into this package
- [PR 3b — ICP dimension](./3b-icp-dimension.md) — schema substrate
- [PR 3e — supervisor Worker](./3e-supervisor-worker.md) — cron host of the source-map scan
- [PR 3j — referrals](./3j-referrals.md) — consumes `stampLastTouch` for referral conversions
- [`packages/crm/src/index.ts`](../../../packages/crm/src/index.ts) — `crm_leads` after PR 3b
- [`packages/analytics/src/index.ts`](../../../packages/analytics/src/index.ts) — `factory_events` substrate for source-map scan
- [`CLAUDE.md`](../../../CLAUDE.md) — hard constraints + verification requirement
