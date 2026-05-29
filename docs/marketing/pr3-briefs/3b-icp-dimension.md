# PR 3b — ICP Dimension Migration

**Status:** Drafted · **Depends on:** PR 1, PR 2
**Owner packages:** `@latimer-woods-tech/crm`, `@latimer-woods-tech/content`, `@latimer-woods-tech/analytics`
**Effort:** 2 days
**Branch:** `marketing/3b-icp-dimension` · **Bottleneck:** YES — blocks 3c, 3d, 3h, 3i, 3j, 3k

## 1. Goal

Add the `cell_key` ICP dimension column (and the attribution columns from [`ATTRIBUTION.md`](../ATTRIBUTION.md)) to every table the marketing system reads/writes. Without this, decomposition in [`KPI_DECOMPOSITION.md`](../KPI_DECOMPOSITION.md) breaks and attribution in [`ATTRIBUTION.md`](../ATTRIBUTION.md) attributes to noise.

## 2. Non-goals

- ❌ Code changes to consumers that *read* these columns (each consumer PR adds its own usage)
- ❌ Backfill of pre-existing rows beyond setting `cell_key = 'unknown'` (operator may backfill manually if motivated)
- ❌ Adding a CHECK constraint enumerating cell keys (cells are dynamic per ICP_MATRIX)
- ❌ Schema changes to Stripe / PostHog — those are handled at write time in `factory_events.properties`

## 3. Dependencies

- [`packages/crm/src/index.ts`](../../../packages/crm/src/index.ts) — `crm_leads`, `outreach_contacts`, `outreach_campaigns`, `call_logs` DDLs
- [`packages/content/src/index.ts`](../../../packages/content/src/index.ts) — `content_items` DDL
- [`packages/analytics/src/event-schemas.ts`](../../../packages/analytics/src/event-schemas.ts) — event schema enforcement
- [`packages/neon/`](../../../packages/neon/) — migration pattern
- [`ATTRIBUTION.md §4`](../ATTRIBUTION.md#4-touch-stamping-rules) — `crm_leads` attribution columns spec
- [`CAMPAIGN_TAGGING.md §3`](../CAMPAIGN_TAGGING.md#3-where-the-tag-lives) — full propagation map

## 4. Migrations

```sql
-- 001_add_cell_key.sql
ALTER TABLE crm_leads
  ADD COLUMN IF NOT EXISTS cell_key TEXT NOT NULL DEFAULT 'unknown';

ALTER TABLE crm_leads
  ADD COLUMN IF NOT EXISTS first_touch_source TEXT,
  ADD COLUMN IF NOT EXISTS first_touch_campaign TEXT,
  ADD COLUMN IF NOT EXISTS first_touch_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_touch_source TEXT,
  ADD COLUMN IF NOT EXISTS last_touch_campaign TEXT,
  ADD COLUMN IF NOT EXISTS last_touch_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS touch_history JSONB NOT NULL DEFAULT '[]';

ALTER TABLE outreach_contacts
  ADD COLUMN IF NOT EXISTS cell_key TEXT NOT NULL DEFAULT 'unknown';

ALTER TABLE outreach_campaigns
  ADD COLUMN IF NOT EXISTS cell_key TEXT NOT NULL DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS campaign_id TEXT;
  -- campaign_id matches CAMPAIGN_TAGGING.md naming; nullable for back-compat

ALTER TABLE content_items
  ADD COLUMN IF NOT EXISTS cell_key TEXT NOT NULL DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS channel TEXT NOT NULL DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS campaign_id TEXT;

-- Indices for the queries in KPI_DECOMPOSITION.md
CREATE INDEX IF NOT EXISTS idx_crm_leads_cell_key ON crm_leads (cell_key, status);
CREATE INDEX IF NOT EXISTS idx_crm_leads_first_source ON crm_leads (first_touch_source) WHERE first_touch_source IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_crm_leads_last_source ON crm_leads (last_touch_source, converted_at) WHERE last_touch_source IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_outreach_campaigns_cell ON outreach_campaigns (cell_key);
CREATE INDEX IF NOT EXISTS idx_content_items_cell_channel ON content_items (cell_key, channel, status);

-- ROLLBACK:
-- DROP INDEX idx_content_items_cell_channel;
-- DROP INDEX idx_outreach_campaigns_cell;
-- DROP INDEX idx_crm_leads_last_source;
-- DROP INDEX idx_crm_leads_first_source;
-- DROP INDEX idx_crm_leads_cell_key;
-- ALTER TABLE content_items DROP COLUMN campaign_id, DROP COLUMN channel, DROP COLUMN cell_key;
-- ALTER TABLE outreach_campaigns DROP COLUMN campaign_id, DROP COLUMN cell_key;
-- ALTER TABLE outreach_contacts DROP COLUMN cell_key;
-- ALTER TABLE crm_leads DROP COLUMN touch_history, DROP COLUMN last_touch_at,
--   DROP COLUMN last_touch_campaign, DROP COLUMN last_touch_source,
--   DROP COLUMN first_touch_at, DROP COLUMN first_touch_campaign,
--   DROP COLUMN first_touch_source, DROP COLUMN cell_key;
```

## 5. API shape

```ts
// packages/crm/src/index.ts — extend Lead interface

export interface Lead {
  id: string;
  userId: string;
  appId: string;
  source: string;
  status: LeadStatus;
  mrr: number;
  createdAt: Date;
  convertedAt?: Date;
  // NEW:
  cellKey: string;
  firstTouchSource?: string;
  firstTouchCampaign?: string;
  firstTouchAt?: Date;
  lastTouchSource?: string;
  lastTouchCampaign?: string;
  lastTouchAt?: Date;
  touchHistory: Array<{ source: string; campaign?: string; at: Date }>;
}

// Extend trackLead to accept cellKey
export async function trackLead(
  db: FactoryDb,
  opts: {
    userId: string;
    appId: string;
    source: string;
    cellKey: string;          // NEW — required
    firstTouchSource?: string;
    firstTouchCampaign?: string;
  },
): Promise<Lead>;

// New helper: stamp a touch
export async function stampTouch(
  db: FactoryDb,
  opts: {
    userId: string;
    appId: string;
    source: string;
    campaign?: string;
  },
): Promise<void>;
```

```ts
// packages/content/src/index.ts — extend ContentItem

export interface ContentItem {
  id: string;
  tenantId: string;
  title: string;
  body: string;
  status: ContentStatus;
  scheduledAt: Date | null;
  publishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  // NEW:
  cellKey: string;
  channel: string;
  campaignId?: string;
}

// Extend CreateContentOpts to require cellKey + channel
export interface CreateContentOpts {
  tenantId: string;
  title: string;
  body: string;
  scheduledAt?: Date;
  cellKey: string;        // NEW — required
  channel: string;        // NEW — required
  campaignId?: string;    // NEW
}
```

```ts
// packages/analytics/src/event-schemas.ts — extend every event schema

// Every event property bag MUST include:
//   cell_key: string (required)
//   product: string (required)
//   icp: string (required, derived from cell_key)
//   channel: string (optional but recommended)
//   campaign_id: string (optional)

// Update validateEventShape to assert these per event
```

## 6. Test plan

- **Unit tests:**
  - DDL applies cleanly to an empty DB
  - DDL is idempotent (re-running is a no-op)
  - `trackLead` populates `cellKey`
  - `stampTouch` sets `first_touch_*` once, never overwrites
  - `stampTouch` updates `last_touch_*` only when source is non-direct
  - `stampTouch` appends to `touch_history` capped at 50
  - `createContent` rejects missing `cellKey` or `channel`
  - `validateEventShape` rejects events missing `cell_key`, `product`, `icp`
- **Migration tests:**
  - Existing data survives migration (rows get `cell_key = 'unknown'`)
  - Rollback restores prior schema cleanly
- **Coverage:** 90%+ lines

## 7. Verification

```bash
# Migration applies (staging Neon branch)
pnpm --filter @lwt/neon migrate

# Re-running is idempotent
pnpm --filter @lwt/neon migrate
# Expect: 0 migrations applied (no error)

# Schema check
psql $STAGING_DATABASE_URL -c "\d crm_leads" | grep -E "cell_key|touch"
# Expect: 8 new columns visible

# Touch stamping smoke test (in a Workers env via wrangler dev)
curl -X POST http://localhost:8787/test/stamp-touch \
  -d '{"userId":"u1","appId":"selfprime","source":"linkedin","campaign":"2026-q3-practitioner-design-partners"}'

psql $STAGING_DATABASE_URL -c "SELECT first_touch_source, last_touch_source, touch_history FROM crm_leads WHERE user_id = 'u1';"
# Expect: first=linkedin, last=linkedin, history has 1 entry

# Second touch — direct
curl -X POST http://localhost:8787/test/stamp-touch \
  -d '{"userId":"u1","appId":"selfprime","source":"direct"}'

psql $STAGING_DATABASE_URL -c "SELECT first_touch_source, last_touch_source FROM crm_leads WHERE user_id = 'u1';"
# Expect: first=linkedin, last=linkedin (direct did NOT overwrite — key correctness check)
```

## 8. Acceptance criteria

- [ ] Migration applies cleanly to staging Neon branch
- [ ] Migration is idempotent
- [ ] Rollback works (tested against a sacrificial branch)
- [ ] Existing tests in `@lwt/crm`, `@lwt/content`, `@lwt/analytics` still pass
- [ ] New required fields enforced (validation error if missing)
- [ ] `last_touch_*` does NOT overwrite when source is `direct` (correctness)
- [ ] `first_touch_*` set exactly once (immutable)
- [ ] `touch_history` capped at 50 entries
- [ ] Coverage ≥90% lines on changed packages
- [ ] CHANGELOG.md updated in each touched package; semver bumped (minor — additive)
- [ ] Indices verified present and used (`EXPLAIN ANALYZE` on the queries in [`KPI_DECOMPOSITION.md §8`](../KPI_DECOMPOSITION.md#8-decomposition-queries-reference))

## 9. File list

```
packages/crm/
  src/index.ts                # extend Lead, trackLead; add stampTouch
  test/index.test.ts          # extend tests
  migrations/
    002_add_cell_key.sql      # NEW

packages/content/
  src/index.ts                # extend ContentItem, CreateContentOpts
  test/index.test.ts          # extend tests
  migrations/
    001_add_cell_channel.sql  # NEW

packages/analytics/
  src/event-schemas.ts        # extend EventSchema to require cell_key/product/icp
  src/index.ts                # extend track/identify to require these
  test/event-schemas.test.ts  # extend tests
```

## 10. Risks + mitigations

| Risk | Mitigation |
|---|---|
| Default `'unknown'` for cell_key pollutes dashboards | Dashboards filter out `cell_key = 'unknown'` until operator backfills; document this in [`KPI_DECOMPOSITION.md`](../KPI_DECOMPOSITION.md) |
| Index bloat from `touch_history JSONB` | History capped at 50 entries; column is GIN-indexable but defer indexing until needed |
| Breaking change to `trackLead` signature | Provide overload: old signature deprecated with warning; new signature is `cellKey` required |
| Cross-product join queries slow with new indices | All new indices include `cell_key` first; queries in KPI_DECOMPOSITION.md hit them |

## 11. Cross-references

- [`ATTRIBUTION.md`](../ATTRIBUTION.md) — touch-stamping rules consumed here
- [`CAMPAIGN_TAGGING.md`](../CAMPAIGN_TAGGING.md) — 5-tuple
- [`LIFECYCLE.md`](../LIFECYCLE.md) — events that read `cell_key`
- [`KPI_DECOMPOSITION.md`](../KPI_DECOMPOSITION.md) — queries that consume the new columns
- [`packages/crm/src/index.ts`](../../../packages/crm/src/index.ts) · [`packages/content/src/index.ts`](../../../packages/content/src/index.ts) · [`packages/analytics/src/event-schemas.ts`](../../../packages/analytics/src/event-schemas.ts)
- [`PLATFORM_STANDARDS §6`](../../PLATFORM_STANDARDS.md) — migration discipline (expand/contract, rollback block)
