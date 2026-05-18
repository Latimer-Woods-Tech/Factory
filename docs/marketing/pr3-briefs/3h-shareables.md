# PR 3h — Practitioner-Branded Shareables

**Status:** Drafted · **Depends on:** 3b (ICP dimension), 3c (voice matrix)
**Owner packages:** `@latimer-woods-tech/content`, `@latimer-woods-tech/seo`, `@latimer-woods-tech/crm` · **New app:** `apps/shareables-worker/`
**Effort:** 4 days · **Branch:** `marketing/3h-shareables`

## 1. Goal

Every chart reading a practitioner generates can be published as a public, branded artefact at `https://selfprime.net/r/{practitioner_slug}/{reading_slug}`:

- Server-rendered HTML via a Cloudflare Worker on the custom domain `selfprime.net` (per [`CLAUDE.md`](../../../CLAUDE.md) — no `*.workers.dev` in user-facing assets).
- OG meta tags + JSON-LD via [`@lwt/seo`](../../../packages/seo/src/index.ts).
- Practitioner branding: logo, display name, brand colors, theme. Discreet `Powered by Selfprime` footer per [`icp/selfprime-practitioner.md §5`](../icp/selfprime-practitioner.md#5-built-in-growth-hooks-practitioner-specific).
- Default visibility `private`; explicit consent required to publish; `public` artefacts carry client display name per consent rules.
- Every outbound CTA carries `utm_source=shareable` + practitioner+cell+campaign per [`CAMPAIGN_TAGGING.md`](../CAMPAIGN_TAGGING.md); view events stamp touches per [`ATTRIBUTION.md §4`](../ATTRIBUTION.md#4-touch-stamping-rules).
- View stats per artefact + weekly digest email to practitioner.

This is the **first growth hook** per practitioner-cell ICP — highest leverage.

## 2. Non-goals

- Server-side PDF rendering (Workers can't run Chromium; deferred).
- Practitioner brand editor UI (admin-studio operator edit in v1; self-serve later).
- Embedding the reading on the practitioner's site (that is PR 3i).
- Reading search / discovery index (v1 is direct-URL only).
- Multi-language render (English only).
- Retroactive publication of pre-existing readings (opt-in per reading).

## 3. Dependencies

- [`packages/content/src/index.ts`](../../../packages/content/src/index.ts) — base content store; post-3b includes `cell_key`/`channel`/`campaign_id`.
- [`packages/seo/src/index.ts`](../../../packages/seo/src/index.ts) — `generateMetaTags`, `generateJsonLd`.
- [`packages/copy/src/index.ts`](../../../packages/copy/src/index.ts) — voice profile lookup for rendered CTA copy.
- [`packages/crm/src/index.ts`](../../../packages/crm/src/index.ts) — `stampTouch` from 3b.
- [`CONSTITUTION.md §6`](../CONSTITUTION.md#6-data-consent-compliance) — consent contract.
- [`CONSTITUTION.md §2`](../CONSTITUTION.md#2-brand-voice-gate) — rendered copy passes voice gate.
- [`CAMPAIGN_TAGGING.md`](../CAMPAIGN_TAGGING.md), [`ATTRIBUTION.md`](../ATTRIBUTION.md), [`CLAUDE.md`](../../../CLAUDE.md).

## 4. Migrations

```sql
-- packages/content/migrations/002_published_readings.sql

CREATE TABLE IF NOT EXISTS practitioner_brand_profiles (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id            TEXT NOT NULL,
  practitioner_user_id TEXT NOT NULL,
  slug                 TEXT NOT NULL,
  display_name         TEXT NOT NULL,
  logo_url             TEXT,
  brand_color_primary  TEXT NOT NULL DEFAULT '#111827',
  brand_color_accent   TEXT NOT NULL DEFAULT '#6366F1',
  theme                TEXT NOT NULL DEFAULT 'default'
                         CHECK (theme IN ('default','minimal','warm','classic')),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (slug),
  UNIQUE (tenant_id, practitioner_user_id)
);
ALTER TABLE practitioner_brand_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY brand_profile_tenant_isolation ON practitioner_brand_profiles
  USING (tenant_id = current_setting('app.tenant_id', TRUE));

CREATE TABLE IF NOT EXISTS published_readings (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id            TEXT NOT NULL,
  practitioner_user_id TEXT NOT NULL,
  brand_profile_id     UUID NOT NULL REFERENCES practitioner_brand_profiles(id) ON DELETE RESTRICT,
  reading_id           TEXT NOT NULL,
  slug                 TEXT NOT NULL,
  client_display       TEXT NOT NULL,
  body_html            TEXT NOT NULL,
  voice_key            TEXT NOT NULL,
  cell_key             TEXT NOT NULL DEFAULT 'selfprime:practitioner',
  campaign_id          TEXT,
  consent_record       JSONB NOT NULL,
  view_count           INTEGER NOT NULL DEFAULT 0,
  visibility           TEXT NOT NULL DEFAULT 'private'
                         CHECK (visibility IN ('private','unlisted','public')),
  published_at         TIMESTAMPTZ,
  revoked_at           TIMESTAMPTZ,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, reading_id),
  UNIQUE (brand_profile_id, slug)
);
CREATE INDEX idx_published_readings_lookup ON published_readings (brand_profile_id, slug)
  WHERE visibility IN ('public','unlisted') AND revoked_at IS NULL;
CREATE INDEX idx_published_readings_practitioner ON published_readings (tenant_id, practitioner_user_id);
ALTER TABLE published_readings ENABLE ROW LEVEL SECURITY;
CREATE POLICY published_readings_tenant_isolation ON published_readings
  USING (tenant_id = current_setting('app.tenant_id', TRUE));

CREATE TABLE IF NOT EXISTS reading_view_events (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  published_reading_id UUID NOT NULL REFERENCES published_readings(id) ON DELETE CASCADE,
  occurred_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  utm_source           TEXT, utm_campaign TEXT, utm_content TEXT,
  referrer_host        TEXT, ip_hash TEXT, ua_class TEXT
);
CREATE INDEX idx_view_events_reading ON reading_view_events (published_reading_id, occurred_at DESC);

-- ROLLBACK: drop indexes + reading_view_events; drop published_readings policy/indexes/table;
-- drop practitioner_brand_profiles policy/table.
```

## 5. API shape

```ts
// packages/content/src/shareables.ts

export interface PractitionerBrand {
  id: string; tenantId: string; practitionerUserId: string;
  slug: string; displayName: string; logoUrl?: string;
  brandColorPrimary: string; brandColorAccent: string;
  theme: 'default' | 'minimal' | 'warm' | 'classic';
}

/** What the client agreed to before the reading is publishable. */
export interface ConsentRecord {
  /** Hard prerequisite per CONSTITUTION §6. Without true, publishReading rejects. */
  consentObtained: true;
  /** Free-text or template id the client signed; stored verbatim. */
  consentLanguage: string;
  /** How the client's name renders on the public page. */
  displayMode: 'first_name_last_initial' | 'first_name_only' | 'anonymous' | 'full_name';
  /** Practitioner user id who obtained consent (audit). */
  obtainedBy: string;
  obtainedAt: Date;
  clientContactId?: string;
}

export interface PublishReadingOpts {
  tenantId: string; practitionerUserId: string; readingId: string;
  /** Practitioner-chosen slug; supervisor validates uniqueness + brand-safety. */
  slug: string;
  /** Pre-rendered HTML body in the practitioner's voice. Sanitized on write. */
  bodyHtml: string;
  voiceKey: string;
  consent: ConsentRecord;
  visibility?: 'unlisted' | 'public';
  campaignId?: string;
}

export interface PublishedReading {
  id: string; practitionerSlug: string; readingSlug: string;
  clientDisplay: string; publishedAt: Date; viewCount: number;
  visibility: 'private' | 'unlisted' | 'public'; url: string;
}

export async function publishReading(db: FactoryDb, opts: PublishReadingOpts): Promise<PublishedReading>;
export async function revokePublishedReading(db: FactoryDb, tenantId: string, id: string, reason: string): Promise<void>;
export async function lookupPublishedReading(
  db: FactoryDb, practitionerSlug: string, readingSlug: string,
): Promise<(PublishedReading & { brand: PractitionerBrand; bodyHtml: string }) | null>;
export async function recordReadingView(
  db: FactoryDb, publishedReadingId: string,
  visit: { utmSource?: string; utmCampaign?: string; utmContent?: string;
           referrerHost?: string; ipHash?: string; uaClass?: string },
): Promise<void>;
/** kebab-case, 3–48 chars; denylists reserved + unsafe tokens. */
export function validateBrandSlug(slug: string): { ok: true } | { ok: false; reason: string };

// packages/content/src/digest.ts
export interface WeeklyShareableDigest {
  practitionerUserId: string; weekStart: Date;
  totals: { reads: number; uniqueVisitors: number; outboundClicks: number };
  topReadings: Array<{ slug: string; reads: number; outboundClicks: number }>;
  inboundSources: Array<{ source: string; reads: number }>;
}
export async function buildWeeklyShareableDigest(
  db: FactoryDb, tenantId: string, practitionerUserId: string, weekStart: Date,
): Promise<WeeklyShareableDigest>;
```

`apps/shareables-worker/` (Hono, custom domain `r.selfprime.net`):

- `GET /r/:practitionerSlug/:readingSlug` — 200 server-rendered HTML; 410 if `revoked_at`; 404 if `private`.
- `GET /r/:practitionerSlug` — brand landing.
- `GET /r/:practitionerSlug/:readingSlug.pdf` — 302 to external PDF service (follow-up).
- `GET /health` — `{ "status": "ok" }`.
- Outbound CTAs carry `utm_source=shareable&utm_campaign={campaign_id ?? 'organic-shareable'}&utm_content=selfprime-practitioner&utm_term={practitioner_slug}`.
- Response headers: `Content-Security-Policy: script-src 'self'`; sanitization at write AND render.

## 6. Test plan

- **Unit (Vitest ≥90% lines / ≥85% branches):**
  - `publishReading` rejects when `consent.consentObtained !== true` and routes to escalation.
  - Rejects unknown brand profile, slug collisions, reserved tokens from [`CAMPAIGN_TAGGING.md §5`](../CAMPAIGN_TAGGING.md#5-reserved-keys-dont-use-these-as-values) (`direct`, `unknown`, `test`, `bot`, `internal`, `default`) and unsafe substrings (`admin`, `api`, `health`).
  - `clientDisplay` per `displayMode`: `first_name_last_initial` → `"Sarah K."`, `first_name_only` → `"Sarah"`, `anonymous` → `"Anonymous client"`, `full_name` only when consent language records explicit opt-in.
  - `revokePublishedReading` idempotent; second call no-ops.
  - `recordReadingView` increments `view_count` + inserts event row.
  - HTML sanitization strips `<script>`, inline `on*=` handlers, `javascript:` hrefs.
  - RLS blocks cross-tenant `lookupPublishedReading`.
- **Integration (`@cloudflare/vitest-pool-workers`):** publish → worker GET → 200 + OG tags → second GET increments view_count; revoked → 410; private → 404; `?utm_source=` propagates to view event row.
- **Snapshot:** rendered HTML per theme + one OG-preview snapshot per theme.
- **Voice gate:** any worker-rendered copy block (CTA, footer) passes `validateAiOutput` for `prime_self:practitioner` per [`CONSTITUTION.md §2`](../CONSTITUTION.md#2-brand-voice-gate).

## 7. Verification

After deploy (`r.staging.selfprime.net`):

```bash
# 1. Publish
curl -X POST https://marketing-supervisor.adrper79.workers.dev/shareables/publish \
  -H "Authorization: Bearer $WORKER_API_TOKEN" \
  -d '{"tenantId":"test","practitionerUserId":"u_prac_1","readingId":"rd_abc123",
       "slug":"saturn-return-2026","bodyHtml":"<h1>Your Saturn Return</h1><p>...</p>",
       "voiceKey":"prime_self:practitioner",
       "consent":{"consentObtained":true,"consentLanguage":"client_template_v1",
                  "displayMode":"first_name_last_initial","obtainedBy":"u_prac_1",
                  "obtainedAt":"2026-05-18T00:00:00Z"},
       "visibility":"public"}'
# Expect: 200, url = https://r.staging.selfprime.net/r/sarah-astrology/saturn-return-2026

# 2. Render
curl -i https://r.staging.selfprime.net/r/sarah-astrology/saturn-return-2026
# Expect: 200; <meta property="og:title">; practitioner name; "Powered by Selfprime"

# 3. UTM propagates to view event
curl -s "https://r.staging.selfprime.net/r/sarah-astrology/saturn-return-2026?utm_source=shareable&utm_campaign=2026-q3-practitioner-design-partners"
psql $STAGING_DATABASE_URL -c "SELECT utm_source, utm_campaign FROM reading_view_events ORDER BY occurred_at DESC LIMIT 1;"
# Expect: utm_source=shareable, utm_campaign=2026-q3-practitioner-design-partners

# 4. Revoke
curl -X POST https://marketing-supervisor.adrper79.workers.dev/shareables/revoke \
  -d '{"tenantId":"test","publishedReadingId":"...","reason":"client withdrew consent"}'
curl -i https://r.staging.selfprime.net/r/sarah-astrology/saturn-return-2026
# Expect: 410 Gone
```

Worker `/health`: `200` with `{"status":"ok","render":"ok"}`.

## 8. Acceptance criteria

- [ ] DDL migrations land + idempotent + rollback tested.
- [ ] RLS verified: cross-tenant `lookupPublishedReading` returns null.
- [ ] `publishReading` rejects without `consent.consentObtained === true`.
- [ ] Default `displayMode` is `first_name_last_initial`; `full_name` requires explicit consent-language opt-in.
- [ ] Reserved + unsafe slugs rejected per [`CAMPAIGN_TAGGING.md §5`](../CAMPAIGN_TAGGING.md#5-reserved-keys-dont-use-these-as-values).
- [ ] Worker on custom domain (`r.selfprime.net` / `r.staging.selfprime.net`); no `*.workers.dev` in any rendered HTML or service-registry consumer files.
- [ ] OG meta + JSON-LD on every render (curl-verified).
- [ ] Every outbound CTA carries the 5-tuple as UTM params.
- [ ] `recordReadingView` rate-limited per `(published_reading_id, ip_hash)` to 1 view per 30s.
- [ ] HTML sanitized at write AND render.
- [ ] Coverage ≥90% lines, ≥85% branches.
- [ ] Weekly digest builder ships; digest enrolls via [`@lwt/email`](../../../packages/email/) sequence `practitioner_shareable_digest_v1`.
- [ ] Verification curl sequence above succeeds end-to-end.
- [ ] CHANGELOG + minor semver bumps in `@lwt/content`; new app added to [`docs/service-registry.yml`](../../service-registry.yml).

## 9. File list

```
apps/shareables-worker/                          # NEW
  src/{index.ts,render.ts,middleware-utm.ts}
  wrangler.jsonc                                 # custom domain r.selfprime.net
  test/{render.test.ts,routes.integration.test.ts}

packages/content/
  src/{shareables.ts,digest.ts,sanitize.ts}      # NEW
  test/{shareables.test.ts,sanitize.test.ts,digest.test.ts}
  migrations/002_published_readings.sql          # NEW

docs/service-registry.yml                        # add shareables-worker
docs/marketing/sequences/practitioner_shareable_digest_v1.yaml  # NEW
```

## 10. Risks + mitigations

| Risk | Mitigation |
|---|---|
| Client withdraws consent after publication | `revokePublishedReading` returns 410; KV cache TTL ≤60s; operator dashboard surfaces revocations. |
| Practitioner picks offensive / impersonating slug | `validateBrandSlug` denylist + supervisor review queue for brand-name lookalikes. |
| XSS via reading body | Sanitization at write AND render; CSP `script-src 'self'`. |
| View-count inflation by practitioner self-traffic | Per-IP rate limit + digest excludes practitioner-session IP hashes. |
| Public URLs leaked beyond intent | Default `private`; sitemap entry only when practitioner opts in (default off). |
| Footer copy drifts off brand voice | Footer micro-copy generated via [`@lwt/copy`](../../../packages/copy/src/index.ts) with `prime_self:practitioner`; passes voice gate. |
| Cross-tenant data leak via lookup | RLS + worker resolves tenant from brand_profile slug; explicit test for cross-tenant. |

## 11. Cross-references

- [`icp/selfprime-practitioner.md §5`](../icp/selfprime-practitioner.md#5-built-in-growth-hooks-practitioner-specific) — growth hook this brief implements.
- [`icp/selfprime-consumer.md §5`](../icp/selfprime-consumer.md#5-built-in-growth-hooks-consumer-specific) — sub-segment D arrival path.
- [`CONSTITUTION.md §6`](../CONSTITUTION.md#6-data-consent-compliance) · [`CONSTITUTION.md §2`](../CONSTITUTION.md#2-brand-voice-gate).
- [`CAMPAIGN_TAGGING.md`](../CAMPAIGN_TAGGING.md) · [`ATTRIBUTION.md §4`](../ATTRIBUTION.md#4-touch-stamping-rules).
- [`packages/content/src/index.ts`](../../../packages/content/src/index.ts) · [`packages/seo/src/index.ts`](../../../packages/seo/src/index.ts) · [`packages/copy/src/index.ts`](../../../packages/copy/src/index.ts) · [`packages/crm/src/index.ts`](../../../packages/crm/src/index.ts).
- [`CLAUDE.md`](../../../CLAUDE.md) — Workers, custom domains, verification requirement.
- PR 3b · PR 3c · PR 3i (sibling) · PR 3j (consumer of this surface).
