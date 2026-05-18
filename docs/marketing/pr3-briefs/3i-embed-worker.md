# PR 3i — Embed Worker (Chart-Calc Widgets)

**Status:** Drafted · **Depends on:** 3b (ICP dimension + attribution columns)
**Owner packages:** `@latimer-woods-tech/crm`, `@latimer-woods-tech/analytics`, `@latimer-woods-tech/seo` · **New app:** `apps/embed-worker/`
**Effort:** 3 days · **Branch:** `marketing/3i-embed-worker`

## 1. Goal

A practitioner pastes one tag on their own site:

```html
<script src="https://embed.selfprime.net/v1/chart.js"
        data-embed-token="emb_live_pk_..." async></script>
<div data-selfprime-chart></div>
```

That renders a chart-calculator widget hosted by Selfprime, in an iframe sandbox, branded with the practitioner's colors + CTA. Each calc captures a lead and routes it back as a `crm_leads` row in the `selfprime:consumer` cell with `first_touch_source='embed'` and `first_touch_campaign={practitioner_slug}`, per [`icp/selfprime-practitioner.md §5`](../icp/selfprime-practitioner.md#5-built-in-growth-hooks-practitioner-specific) and the consumer-arrival path in [`icp/selfprime-consumer.md §5`](../icp/selfprime-consumer.md#5-built-in-growth-hooks-consumer-specific).

Per [`CLAUDE.md`](../../../CLAUDE.md), the production custom domain is `embed.selfprime.net`. `*.workers.dev` is never written into the snippet, the loader, or any documentation a practitioner sees.

## 2. Non-goals

- Real chart math. Chart engine is treated as an upstream dependency; v1 ships a `ChartEngine` interface with a mock impl behind it (live ephemeris service is a flagged follow-up).
- Multi-tenant per-end-user accounts inside the embed (each calc = anonymous lead until conversion).
- WYSIWYG embed designer (brand config via admin-studio for v1).
- Native mobile-app embeds (web only).
- Cross-origin `postMessage` for parent-page integration beyond a one-way `embed:loaded` event.

## 3. Dependencies

- [`packages/crm/src/index.ts`](../../../packages/crm/src/index.ts) — `trackLead`, `stampTouch` (post-3b accept `cellKey` + attribution fields).
- [`packages/analytics/src/event-schemas.ts`](../../../packages/analytics/src/event-schemas.ts) — event schema; register `embed_chart_calculated`.
- [`packages/seo/src/index.ts`](../../../packages/seo/src/index.ts) — meta tags for the iframe document.
- [`CONSTITUTION.md §3`](../CONSTITUTION.md#3-budget-caps) — free-tier abuse → rate-limit contract.
- [`CONSTITUTION.md §6`](../CONSTITUTION.md#6-data-consent-compliance) — email collection requires explicit consent.
- [`CAMPAIGN_TAGGING.md §3`](../CAMPAIGN_TAGGING.md#3-where-the-tag-lives) · [`ATTRIBUTION.md §4`](../ATTRIBUTION.md#4-touch-stamping-rules) · [`CLAUDE.md`](../../../CLAUDE.md).

## 4. Migrations

```sql
-- apps/embed-worker/migrations/001_embed_tokens.sql

CREATE TABLE IF NOT EXISTS embed_tokens (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id            TEXT NOT NULL,
  practitioner_user_id TEXT NOT NULL,
  practitioner_slug    TEXT NOT NULL,
  token_prefix         TEXT NOT NULL,                          -- e.g. 'emb_live_pk_'
  token_hash           TEXT NOT NULL,                          -- SHA-256 of full token
  brand_color_primary  TEXT NOT NULL DEFAULT '#111827',
  brand_color_accent   TEXT NOT NULL DEFAULT '#6366F1',
  cta_label            TEXT NOT NULL DEFAULT 'Get your full reading',
  cta_url              TEXT,
  allowed_origins      TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],-- empty = any
  daily_calc_cap       INTEGER NOT NULL DEFAULT 500,
  state                TEXT NOT NULL DEFAULT 'active'
                         CHECK (state IN ('active','revoked','suspended')),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at           TIMESTAMPTZ,
  last_used_at         TIMESTAMPTZ,
  UNIQUE (token_hash)
);
CREATE INDEX idx_embed_tokens_practitioner ON embed_tokens (tenant_id, practitioner_user_id);
CREATE INDEX idx_embed_tokens_active_hash ON embed_tokens (token_hash) WHERE state = 'active';
ALTER TABLE embed_tokens ENABLE ROW LEVEL SECURITY;
CREATE POLICY embed_tokens_tenant_isolation ON embed_tokens
  USING (tenant_id = current_setting('app.tenant_id', TRUE));

CREATE TABLE IF NOT EXISTS embed_calc_events (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  embed_token_id  UUID NOT NULL REFERENCES embed_tokens(id) ON DELETE CASCADE,
  occurred_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ip_hash         TEXT NOT NULL,
  ua_class        TEXT,
  referrer_host   TEXT,
  lead_id         UUID,
  outcome         TEXT NOT NULL
                    CHECK (outcome IN ('calc_only','lead_captured','rate_limited','origin_blocked','token_invalid'))
);
CREATE INDEX idx_embed_calc_events_token_time ON embed_calc_events (embed_token_id, occurred_at DESC);
CREATE INDEX idx_embed_calc_events_ip_window ON embed_calc_events (ip_hash, occurred_at DESC);

-- ROLLBACK: drop calc_events indexes/table; drop embed_tokens policy/indexes/table.
```

`crm_leads` rows use the columns added in PR 3b — no further DDL.

## 5. API shape

```ts
// packages/crm/src/embed-tokens.ts

export interface EmbedToken {
  id: string; tenantId: string; practitionerUserId: string; practitionerSlug: string;
  brandColorPrimary: string; brandColorAccent: string;
  ctaLabel: string; ctaUrl?: string;
  allowedOrigins: string[]; dailyCalcCap: number;
  state: 'active' | 'revoked' | 'suspended';
  createdAt: Date; lastUsedAt?: Date;
}

/** Mints a token; raw value returned exactly once. Only the hash is persisted. */
export async function issueEmbedToken(
  db: FactoryDb,
  opts: {
    tenantId: string; practitionerUserId: string; practitionerSlug: string;
    brandColorPrimary?: string; brandColorAccent?: string;
    ctaLabel?: string; ctaUrl?: string;
    allowedOrigins?: string[]; dailyCalcCap?: number;
  },
): Promise<{ token: string; record: EmbedToken }>;

/** O(1) lookup by SHA-256(token); null on missing or non-active. */
export async function verifyEmbedToken(db: FactoryDb, rawToken: string): Promise<EmbedToken | null>;
export async function revokeEmbedToken(db: FactoryDb, tenantId: string, tokenId: string): Promise<void>;
```

`apps/embed-worker/` routes (Hono, custom domain `embed.selfprime.net`):

- `GET /v1/chart.js` — minified loader (≤10 KB gzipped), `Cache-Control: public, max-age=3600`. Injects an iframe at `/v1/chart/iframe?token=...` into `<div data-selfprime-chart>`.
- `GET /v1/chart/iframe` — server-rendered iframe HTML with brand colors + CTA. `<head>` uses `generateMetaTags` + `<meta name="robots" content="noindex">`. CSP `frame-ancestors {allowed_origins or *}`.
- `POST /v1/chart/calculate` — body `{ token, birthDate, birthTime, birthLat, birthLng, email?, consent? }`. Pipeline:
  1. `verifyEmbedToken(token)` → 401 if invalid.
  2. Origin allowlist check (`Origin`/`Referer`) → 403 if blocked.
  3. Rate limit (three layers, §below).
  4. `ChartEngine.calculate(...)` — mock for v1.
  5. If `email` present AND `consent === true` → `trackLead({ source: 'embed', cellKey: 'selfprime:consumer', firstTouchSource: 'embed', firstTouchCampaign: token.practitionerSlug })` + `stampTouch(...)`.
  6. Insert `embed_calc_events` row.
  7. PostHog `embed_chart_calculated` with `cell_key='selfprime:consumer'`, `product='selfprime'`, `icp='consumer'`, `channel='embed'`, `campaign_id=token.practitionerSlug`.
- `GET /health` — `{ "status": "ok", "chartEngine": "mock" | "live" }`.

**Rate limiters** (Cloudflare RL bindings, per [`CONSTITUTION.md §3`](../CONSTITUTION.md#3-budget-caps)):

| Binding | Key | Budget |
|---|---|---|
| `PER_TOKEN_RL` | `embed_token_id` | `daily_calc_cap` per 24h (default 500) |
| `PER_IP_RL` | `ip_hash` | 20 calc / 1h |
| `GLOBAL_RL` | worker-wide | 5000 calc / 60s |

Returned snippet (issued by admin-studio) contains no `*.workers.dev` URL:

```html
<script src="https://embed.selfprime.net/v1/chart.js"
        data-embed-token="emb_live_pk_..." async></script>
<div data-selfprime-chart></div>
```

## 6. Test plan

- **Unit (Vitest ≥90% lines / ≥85% branches):**
  - `issueEmbedToken` returns raw token once; `verifyEmbedToken` finds it; reject after `revokeEmbedToken`.
  - Token hash is SHA-256; raw never stored.
  - `verifyEmbedToken` rejects `state IN ('revoked','suspended')`.
  - Origin allowlist: empty = any; populated rejects non-matching.
  - Per-IP cap: 21st calc in the hour → `outcome='rate_limited'`.
  - Per-token daily cap: N+1 calc on `daily_calc_cap=N` → `'rate_limited'`.
  - `POST /v1/chart/calculate` without email → calc returned, no `crm_leads` row.
  - With email + `consent=true` → `crm_leads` row carrying the attribution stamp.
  - With email but `consent=false` → calc returned, no row (recorded as `calc_only`).
  - RLS blocks cross-tenant `verifyEmbedToken` (returns null).
- **Integration (`@cloudflare/vitest-pool-workers`):** issue → GET `/v1/chart.js` → GET `/v1/chart/iframe?token=...` → POST `/v1/chart/calculate` → `crm_leads` row visible with `first_touch_source='embed'`, `first_touch_campaign='sarah-astrology'`, `cell_key='selfprime:consumer'`.
- **Schema:** `embed_chart_calculated` carries the full 5-tuple per [`CAMPAIGN_TAGGING.md §3`](../CAMPAIGN_TAGGING.md#3-where-the-tag-lives).
- **Size:** loader response ≤ 10 KB gzipped (assertion via `TextEncoder`).
- **Security:** snapshot test on `Content-Security-Policy: frame-ancestors ...` derived from allowlist; SQLi tests on `birthDate`/`birthLat`.

## 7. Verification

After deploy to `embed.staging.selfprime.net`:

```bash
# 1. Mint a token
curl -X POST https://marketing-supervisor.adrper79.workers.dev/embed/tokens \
  -H "Authorization: Bearer $WORKER_API_TOKEN" \
  -d '{"tenantId":"test","practitionerUserId":"u_prac_1",
       "practitionerSlug":"sarah-astrology",
       "ctaLabel":"Book a reading with Sarah",
       "allowedOrigins":["https://sarahastrology.example.com"],
       "dailyCalcCap":500}'
# Expect: { token: "emb_live_pk_...", record: {...} } — raw token returned exactly once.

# 2. Loader is small + cacheable
curl -sI https://embed.staging.selfprime.net/v1/chart.js | grep -E 'HTTP|Cache-Control'
curl -s --compressed https://embed.staging.selfprime.net/v1/chart.js | wc -c
# Expect: 200; Cache-Control: public, max-age=3600; size ≤ 10000 bytes.

# 3. Iframe shows practitioner branding
curl -s "https://embed.staging.selfprime.net/v1/chart/iframe?token=emb_live_pk_..." | grep "Book a reading with Sarah"

# 4. Lead capture
curl -X POST https://embed.staging.selfprime.net/v1/chart/calculate \
  -H "Origin: https://sarahastrology.example.com" \
  -d '{"token":"emb_live_pk_...","birthDate":"1990-03-14","birthTime":"08:30",
       "birthLat":40.71,"birthLng":-74.01,"email":"client@example.com","consent":true}'
psql $STAGING_DATABASE_URL -c "SELECT first_touch_source, first_touch_campaign, cell_key
                               FROM crm_leads WHERE app_id='selfprime'
                               ORDER BY created_at DESC LIMIT 1;"
# Expect: first_touch_source='embed', first_touch_campaign='sarah-astrology', cell_key='selfprime:consumer'.

# 5. Rate-limit fires
for i in {1..25}; do curl -s -o /dev/null -w "%{http_code}\n" \
  -X POST https://embed.staging.selfprime.net/v1/chart/calculate \
  -H "Origin: https://sarahastrology.example.com" \
  -d '{"token":"emb_live_pk_...","birthDate":"1990-03-14","birthTime":"08:30","birthLat":40.71,"birthLng":-74.01}'; done
# Expect: first 20 → 200; remainder → 429.

# 6. Origin blocked
curl -X POST https://embed.staging.selfprime.net/v1/chart/calculate \
  -H "Origin: https://malicious.example.com" \
  -d '{"token":"emb_live_pk_..."}'
# Expect: 403.

# 7. Revoke
curl -X POST https://marketing-supervisor.adrper79.workers.dev/embed/tokens/revoke \
  -d '{"tenantId":"test","tokenId":"..."}'
curl -X POST https://embed.staging.selfprime.net/v1/chart/calculate -d '{"token":"emb_live_pk_..."}'
# Expect: 401.
```

`/health`: `200` with `{"status":"ok","chartEngine":"mock"}` until live ephemeris service is wired.

## 8. Acceptance criteria

- [ ] DDL migrations land, idempotent, rollback tested.
- [ ] Worker deployed at `embed.selfprime.net` (prod) and `embed.staging.selfprime.net` (staging); no `*.workers.dev` in snippet, loader, or `docs/service-registry.yml#consumers`.
- [ ] Loader `chart.js` ≤10 KB gzipped (test-asserted).
- [ ] Raw embed token returned exactly once at issuance; only SHA-256 hash persisted.
- [ ] Three layers of rate limiting bound (per-token daily, per-IP hourly, global per-minute) per [`CONSTITUTION.md §3`](../CONSTITUTION.md#3-budget-caps).
- [ ] Origin allowlist enforced; empty array = any (explicit operator opt-out).
- [ ] `crm_leads` row carries `cell_key='selfprime:consumer'`, `first_touch_source='embed'`, `first_touch_campaign={practitioner_slug}`, `last_touch_source='embed'`, `last_touch_campaign={practitioner_slug}` per [`ATTRIBUTION.md §4`](../ATTRIBUTION.md#4-touch-stamping-rules).
- [ ] `embed_chart_calculated` event registered in [`packages/analytics/src/event-schemas.ts`](../../../packages/analytics/src/event-schemas.ts) with the full 5-tuple.
- [ ] Email collection requires `consent === true`; without it the calc still returns, no `crm_leads` row created.
- [ ] `ChartEngine` interface implemented; mock returns deterministic output; live wiring flagged as follow-up.
- [ ] RLS verified for `embed_tokens` cross-tenant lookup.
- [ ] Coverage ≥90% lines / ≥85% branches.
- [ ] Verification curl sequence above succeeds end-to-end in staging.
- [ ] Rate-limiter id reserved in [`docs/runbooks/add-new-app.md`](../../runbooks/add-new-app.md) registry.
- [ ] `docs/service-registry.yml` updated with the new worker + custom domain.
- [ ] CHANGELOG + minor semver bump in `@lwt/crm`.

## 9. File list

```
apps/embed-worker/                               # NEW
  src/{index.ts,loader.ts,iframe-render.ts,chart-engine.ts,rate-limit.ts}
  wrangler.jsonc                                 # custom domain embed.selfprime.net; RL bindings
  migrations/001_embed_tokens.sql                # NEW
  test/{loader.test.ts,iframe.test.ts,calculate.integration.test.ts,rate-limit.test.ts,security.test.ts}

packages/crm/
  src/embed-tokens.ts                            # NEW
  src/index.ts                                   # extend trackLead source set with 'embed'
  test/embed-tokens.test.ts                      # NEW

packages/analytics/
  src/event-schemas.ts                           # register embed_chart_calculated
  test/event-schemas.test.ts                     # extend

docs/service-registry.yml                        # add embed-worker
docs/runbooks/add-new-app.md                     # bump rate-limiter id registry
```

## 10. Risks + mitigations

| Risk | Mitigation |
|---|---|
| No live chart-math service exists yet | `ChartEngine` interface + mock impl; surfaced in `/health`. Live wiring is a follow-up via a Node-runtime service the Worker calls over HTTPS (Workers can't run native ephemeris code). |
| Free-tier LLM budget drained via mass calc | Three-layer rate limit per [`CONSTITUTION.md §3`](../CONSTITUTION.md#3-budget-caps). LLM is **not** in the calc hot path — copy is pre-generated. |
| Embed token leaked from practitioner's source | Token is public by design; scoped (rate cap + origin allowlist + revocable). Raw value shown once; rotation via admin-studio. |
| Origin spoofing | `Origin` header is HTTPS-fetch-only and not user-settable in browsers. Bots without correct origin denied. Practitioners can lower `dailyCalcCap` to bound worst case. |
| Stale snippets on revoked tokens | `chart.js` cached 1h; `/calculate` is not. Revoked tokens fail closed → revocation latency ≤ 1 calc. |
| PII collection without consent | Email optional; `consent === true` required for `crm_leads` insert; without consent, recorded as `calc_only`. |
| Iframe rendered on unauthorized domains | `Content-Security-Policy: frame-ancestors` derived from `allowed_origins`; `*` only when array is explicitly empty. |
| Attribution lost across Selfprime domain hop | iframe CTA emits `utm_source=embed&utm_medium=referral&utm_campaign={practitioner_slug}&utm_content=selfprime-consumer` — post-3k attribution sees the 5-tuple regardless of cookie state. |

## 11. Cross-references

- [`icp/selfprime-practitioner.md §5`](../icp/selfprime-practitioner.md#5-built-in-growth-hooks-practitioner-specific) — "practitioner sites = ongoing distribution surface."
- [`icp/selfprime-consumer.md §5`](../icp/selfprime-consumer.md#5-built-in-growth-hooks-consumer-specific) — consumer-arrival path; sub-segment D.
- [`CONSTITUTION.md §3`](../CONSTITUTION.md#3-budget-caps) · [`CONSTITUTION.md §6`](../CONSTITUTION.md#6-data-consent-compliance).
- [`CAMPAIGN_TAGGING.md §3`](../CAMPAIGN_TAGGING.md#3-where-the-tag-lives) · [`ATTRIBUTION.md §4`](../ATTRIBUTION.md#4-touch-stamping-rules).
- [`packages/crm/src/index.ts`](../../../packages/crm/src/index.ts) · [`packages/analytics/src/event-schemas.ts`](../../../packages/analytics/src/event-schemas.ts) · [`packages/seo/src/index.ts`](../../../packages/seo/src/index.ts).
- [`CLAUDE.md`](../../../CLAUDE.md).
- PR 3b · PR 3h (sibling) · PR 3k (consumes the attribution rows this brief produces).
