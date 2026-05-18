# PR 3g — Topic Queue Generator (transit + signal mining)

**Status:** Drafted · **Depends on:** 3c (voice matrix), 3e (supervisor worker)
**Owner package:** `@latimer-woods-tech/topics` (NEW) · **Effort:** 4 days
**Branch:** `marketing/3g-topic-queue` · **Bottleneck:** NO

## 1. Goal

Stand up an autonomous **topic queue** that feeds the video factory ([`packages/schedule/src/index.ts`](../../../packages/schedule/src/index.ts)) and the content publisher with timely, cell-scoped topics. The queue replaces today's manual `topic` strings on `video_calendar` rows with a scored, sourced backlog the supervisor (3e) draws from.

Topics come from six signal sources combining a deterministic spine (Swiss Ephemeris transits) with platform velocity (Reddit, TikTok, YouTube, Google Trends, podcast RSS). The transit calendar is the **killer feature** — every competitor either licenses Astrodienst or hand-curates; we generate a 90-day deterministic schedule from open-source code.

## 2. Non-goals

- Topic *generation* — LLM still writes script + visuals; this PR delivers seed topic + signal context only
- Cross-tenant sharing — each tenant has its own queue
- Operator topic-suggestion UI (admin-studio extension; defer)
- Multi-language topics (English only v1)
- Paid signal sources (no Apify / no SerpAPI in v1)
- Live event / breaking-news detection — daily cadence only
- Source code for the ephemeris itself — we vendor `swisseph-wasm` or equivalent

## 3. Dependencies

Files the executor MUST read:

- [`packages/schedule/src/index.ts`](../../../packages/schedule/src/index.ts) — `ProductionBrief`, `scheduleVideo`, `scorePriority`
- [`packages/video/`](../../../packages/video/) — `RenderJob` shape
- [`packages/neon/src/index.ts`](../../../packages/neon/src/index.ts) — `FactoryDb`, `sql`, `withTenant`
- [`packages/errors/`](../../../packages/errors/) — `withRetry`, error types
- [`packages/logger/`](../../../packages/logger/) — structured logging
- [`icp/selfprime-practitioner.md §3`](../icp/selfprime-practitioner.md#3-channel-hypothesis) · [`icp/selfprime-consumer.md §3.2`](../icp/selfprime-consumer.md#32-earned)
- [`CHANNEL_DOCTRINE.md §2–§3`](../CHANNEL_DOCTRINE.md#2-per-cell-channel-mix) · [`VOICES.md`](../VOICES.md) · [`CAMPAIGN_TAGGING.md`](../CAMPAIGN_TAGGING.md)
- [`MARKETING_SUPERVISOR.md`](../MARKETING_SUPERVISOR.md) — TopicScout role (this queue is its persistence)
- [`CLAUDE.md`](../../../CLAUDE.md) — Workers runtime; **note** Google Trends runs in a GitHub Action (Python + pytrends), not Worker, per the video-pipeline pattern

**Architecture decision:** new package `@latimer-woods-tech/topics`, not folded into `@lwt/schedule`. Schedule owns *video production state*; topics owns *signal mining + scoring* — different domain, different retry/backoff isolation. Slot 24 in [`CLAUDE.md`](../../../CLAUDE.md) Package Dependency Order, after `validation`.

## 4. Migrations

```sql
-- 001_topic_queue.sql
CREATE TABLE IF NOT EXISTS topic_queue (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          TEXT NOT NULL,
  cell_key           TEXT NOT NULL,   -- 'selfprime:practitioner'
  voice_key          TEXT NOT NULL,   -- 'prime_self:practitioner'
  topic              TEXT NOT NULL,
  topic_slug         TEXT NOT NULL,   -- kebab-case dedup key
  signal_strength    INTEGER NOT NULL DEFAULT 0 CHECK (signal_strength BETWEEN 0 AND 100),
  source             TEXT NOT NULL CHECK (source IN (
                       'swiss_ephemeris','reddit','tiktok_hashtag',
                       'youtube_search','google_trends','podcast_rss','manual')),
  source_ref         TEXT,
  signal_metadata    JSONB NOT NULL DEFAULT '{}',
  recommended_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at         TIMESTAMPTZ NOT NULL,
  published_at       TIMESTAMPTZ,
  published_as       UUID,            -- nullable FK to video_calendar.id
  status             TEXT NOT NULL DEFAULT 'queued'
                       CHECK (status IN ('queued','claimed','published','expired','rejected')),
  rejection_reason   TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, cell_key, topic_slug)
);
CREATE INDEX idx_topic_queue_pickup ON topic_queue
  (tenant_id, cell_key, status, signal_strength DESC, recommended_at ASC)
  WHERE status = 'queued';
CREATE INDEX idx_topic_queue_expiry ON topic_queue (status, expires_at) WHERE status = 'queued';
CREATE INDEX idx_topic_queue_source ON topic_queue (source, recommended_at DESC);
ALTER TABLE topic_queue ENABLE ROW LEVEL SECURITY;
CREATE POLICY topic_queue_isolation ON topic_queue
  USING (tenant_id = current_setting('app.tenant_id', TRUE));

-- ROLLBACK: DROP POLICY topic_queue_isolation ON topic_queue;
--           ALTER TABLE topic_queue DISABLE ROW LEVEL SECURITY;
--           DROP INDEX idx_topic_queue_source; DROP INDEX idx_topic_queue_expiry;
--           DROP INDEX idx_topic_queue_pickup; DROP TABLE topic_queue;
```

```sql
-- 002_signal_run_log.sql — per-scan observability
CREATE TABLE IF NOT EXISTS topic_signal_runs (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source           TEXT NOT NULL,
  started_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at      TIMESTAMPTZ,
  status           TEXT NOT NULL DEFAULT 'running'
                     CHECK (status IN ('running','ok','failed','partial')),
  topics_proposed  INTEGER NOT NULL DEFAULT 0,
  topics_inserted  INTEGER NOT NULL DEFAULT 0,
  error            TEXT,
  metadata         JSONB NOT NULL DEFAULT '{}'
);
CREATE INDEX idx_topic_signal_runs_source ON topic_signal_runs (source, started_at DESC);

-- ROLLBACK: DROP INDEX idx_topic_signal_runs_source; DROP TABLE topic_signal_runs;
```

## 5. API shape

```ts
// packages/topics/src/index.ts

export type SignalSource =
  | 'swiss_ephemeris' | 'reddit' | 'tiktok_hashtag'
  | 'youtube_search' | 'google_trends' | 'podcast_rss' | 'manual';

/** Pre-insert proposal — emitted by a source scan. */
export interface TopicProposal {
  cellKey: string;
  voiceKey: string;
  topic: string;
  topicSlug: string;          // kebab-case; dedup key within (tenant, cell)
  signalStrength: number;     // 0–100; per-source normalised
  source: SignalSource;
  sourceRef?: string;
  signalMetadata: Record<string, unknown>;
  expiresAt: Date;
}

export interface TopicQueueRow extends TopicProposal {
  id: string;
  tenantId: string;
  status: 'queued' | 'claimed' | 'published' | 'expired' | 'rejected';
  recommendedAt: Date;
  publishedAt: Date | null;
  publishedAs: string | null;
  rejectionReason: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/** Idempotent bulk insert. ON CONFLICT (tenant_id, cell_key, topic_slug)
 *  bump signal_strength to MAX(existing, incoming) and refresh expires_at. */
export async function enqueueTopics(
  db: FactoryDb, tenantId: string, proposals: TopicProposal[],
): Promise<{ inserted: number; bumped: number }>;

/** Pull top-N queued topics for a cell; mark claimed (FOR UPDATE SKIP LOCKED). */
export async function claimTopics(
  db: FactoryDb, tenantId: string, cellKey: string, limit: number,
): Promise<TopicQueueRow[]>;

/** Flip a claimed topic to published, linked to a video_calendar row. */
export async function markPublished(
  db: FactoryDb, topicId: string, videoCalendarId: string,
): Promise<void>;

/** Sweep: expire past expires_at; release claimed rows older than 30min. */
export async function sweepExpired(
  db: FactoryDb, now: Date,
): Promise<{ expired: number; released: number }>;

// --- Signal source adapters ---------------------------------------------

export interface SignalScanEnv {
  fetch?: typeof fetch;
  logger?: { info(msg: string, ctx?: unknown): void; error(msg: string, ctx?: unknown): void };
}

/** Deterministic 90-day transit calendar via vendored Swiss Ephemeris WASM.
 *  Outer-planet aspects + exact > applying > separating dominate strength. */
export async function scanSwissEphemeris(
  cellKey: string, voiceKey: string, now: Date, env?: SignalScanEnv,
): Promise<TopicProposal[]>;

/** Reddit JSON API (free, no auth). Top-of-day per configured sub.
 *  Strength = (upvotes * comment_count^0.5) normalised. */
export async function scanReddit(
  cellKey: string, voiceKey: string, subreddits: readonly string[], env?: SignalScanEnv,
): Promise<TopicProposal[]>;

/** YouTube Data API v3 search.list across seed queries.
 *  Strength = recent view velocity (views_last_7d / age_hours). */
export async function scanYouTubeTrends(
  cellKey: string, voiceKey: string, seedQueries: readonly string[],
  apiKey: string, env?: SignalScanEnv,
): Promise<TopicProposal[]>;

/** Podcast RSS — episodes published in last 30d. Strength = recency decay. */
export async function scanPodcastRss(
  cellKey: string, voiceKey: string, feedUrls: readonly string[], env?: SignalScanEnv,
): Promise<TopicProposal[]>;

/** TikTok hashtag velocity — best-effort unofficial scrape; soft-fails to []. */
export async function scanTikTokHashtags(
  cellKey: string, voiceKey: string, hashtags: readonly string[], env?: SignalScanEnv,
): Promise<TopicProposal[]>;

// Google Trends: runs in GitHub Action (Python pytrends), POSTs proposals
// to the Worker /topics/ingest endpoint. See .github/workflows/topic-google-trends.yml.

/** Orchestrate every enabled source for a cell; one source failing does
 *  not abort others (partial success). */
export async function scanCell(
  db: FactoryDb, tenantId: string, cellKey: string, voiceKey: string,
  config: CellSignalConfig, env?: SignalScanEnv,
): Promise<{ source: SignalSource; proposed: number; inserted: number }[]>;

export interface CellSignalConfig {
  swissEphemeris: { enabled: boolean };
  reddit?: { subreddits: readonly string[] };
  youtubeTrends?: { seedQueries: readonly string[]; apiKey: string };
  podcastRss?: { feedUrls: readonly string[] };
  tiktokHashtags?: { hashtags: readonly string[] };
  // google_trends config lives in the GH Action workflow inputs
}

export function getDefaultCellConfig(cellKey: string): CellSignalConfig;
```

## 6. Test plan

Unit (Vitest, ≥90% lines / ≥85% branches): `enqueueTopics` re-insert with higher strength bumps to MAX with no new row; `claimTopics` returns top-N by signal_strength DESC then recommendedAt ASC and marks rows `claimed`; concurrent `claimTopics` returns disjoint rows (`FOR UPDATE SKIP LOCKED`); `markPublished` flips status + links `published_as`; `sweepExpired` expires past `expires_at` and releases stuck claims > 30min; `scanSwissEphemeris` is deterministic (same `now` → same proposals) with monotonic strength in aspect intensity; `scanReddit` hits `https://www.reddit.com/r/{sub}/top.json?t=day` and retries on 429; `scanYouTubeTrends` builds `search.list` and maps velocity → strength; `scanPodcastRss` parses XML via a Workers-compat parser (no Node builtins per CLAUDE.md); `scanTikTokHashtags` soft-fails to `[]` on scrape block; `scanCell` is partial-success-safe; `getDefaultCellConfig('selfprime:practitioner')` includes `r/AskAstrologers` + practitioner YT seeds; `getDefaultCellConfig('selfprime:consumer')` includes `r/astrology r/humandesign` + `#astrology #humandesign`; `voiceKey` carries end-to-end per [`CHANNEL_DOCTRINE.md §3`](../CHANNEL_DOCTRINE.md#3-channel-to-voice-mapping).

Integration (`@cloudflare/vitest-pool-workers`): full pass `scanCell → enqueueTopics → claimTopics → markPublished` → row linked to a fake `video_calendar` UUID; cross-tenant RLS verified. Determinism snapshot: `scanSwissEphemeris(cell, voice, new Date('2026-06-01T00:00:00Z'))` snapshot-equal across CI. DDL test: migration idempotent.

## 7. Verification

After staging deploy:

```bash
# Trigger a full scan pass
curl -X POST https://marketing-supervisor.adrper79.workers.dev/topics/scan \
  -H "Authorization: Bearer $WORKER_API_TOKEN" \
  -d '{"tenantId":"selfprime","cellKey":"selfprime:practitioner"}'
# Expect: 200; per-source { proposed, inserted } counts; ≥1 swiss_ephemeris topic

# Top of queue
curl ".../topics?tenantId=selfprime&cellKey=selfprime:practitioner&limit=5"
# Expect: 5 rows sorted by signal_strength DESC; ≥1 source='swiss_ephemeris'

# Claim a topic (supervisor flow)
curl -X POST .../topics/claim \
  -d '{"tenantId":"selfprime","cellKey":"selfprime:practitioner","limit":1}'
# Expect: 200 with 1 TopicQueueRow; row.status flipped to 'claimed' in DB

# Inject from Google Trends Action
curl -X POST .../topics/ingest \
  -d '{"tenantId":"selfprime","proposals":[{"cellKey":"selfprime:consumer",
       "voiceKey":"prime_self:consumer","topic":"Mercury retrograde 2026",
       "topicSlug":"mercury-retrograde-2026","source":"google_trends",
       "signalStrength":78,"signalMetadata":{"breakout":"+250%"},
       "expiresAt":"2026-06-01T00:00:00Z"}]}'
# Expect: 200 { inserted: 1, bumped: 0 }

# Force sweep
curl -X POST .../topics/sweep
# Expect: 200 { expired: N, released: M }
```

`/health` on marketing-supervisor returns `{ "topics": { "lastScanAt":"...", "queueDepth":{"selfprime:practitioner":42,"selfprime:consumer":58}, "lastSweepAt":"..." } }`.

## 8. Acceptance criteria

- [ ] New package `@latimer-woods-tech/topics` created (slot 24, after `validation`); listed in [`CLAUDE.md`](../../../CLAUDE.md) Package Dependency Order
- [ ] DDL migrations land + idempotent; cross-tenant RLS verified
- [ ] All six sources implemented (TikTok soft-fail acceptable; Google Trends via GH Action POSTing to `/topics/ingest`)
- [ ] `swisseph-wasm` vendored; deterministic 90-day calendar emits ≥30 distinct aspect-topic proposals
- [ ] `enqueueTopics` idempotent on `(tenant_id, cell_key, topic_slug)`; bump-on-conflict verified
- [ ] `claimTopics` uses `FOR UPDATE SKIP LOCKED`; concurrent claim test passes
- [ ] `sweepExpired` runs on a Worker cron every 15min
- [ ] `.github/workflows/topic-google-trends.yml` created; daily; POSTs via `/topics/ingest`
- [ ] Default config covers `selfprime:practitioner`, `selfprime:consumer`, `cypher:practitioner`; `voiceKey` propagated end-to-end
- [ ] Coverage ≥90% lines / ≥85% branches; zero `any` in public API; no Node builtins; no `process.env`
- [ ] Verification curls succeed in staging; queue depth visible on `/health`
- [ ] CHANGELOG.md created; semver 0.1.0

## 9. File list

```
packages/topics/
  package.json · tsconfig.json · tsup.config.ts             # NEW
  src/
    index.ts                       # public API barrel
    queue.ts                       # enqueueTopics, claimTopics, markPublished, sweepExpired
    config.ts                      # getDefaultCellConfig + per-cell defaults
    scan.ts                        # scanCell orchestrator
    sources/{swiss-ephemeris,reddit,youtube-trends,podcast-rss,tiktok-hashtags}.ts
    types.ts
    vendor/{swisseph.wasm,swisseph-loader.ts}              # vendored ephemeris
  test/
    queue.test.ts · scan.test.ts
    sources/{swiss-ephemeris,reddit,youtube-trends,podcast-rss,tiktok-hashtags}.test.ts
    fixtures/{reddit-top.json,youtube-search.json,podcast-feed.xml,
              ephemeris-2026-06-01.snap.json}
  migrations/
    001_topic_queue.sql · 002_signal_run_log.sql

.github/workflows/
  topic-google-trends.yml          # daily pytrends → /topics/ingest

docs/
  STACK.md                         # update — add @lwt/topics + swisseph-wasm
```

## 10. Risks + mitigations

| Risk | Mitigation |
|---|---|
| Swiss Ephemeris WASM > Worker 1 MiB limit | Trim to outer planets + Sun/Moon/Mercury; or lazy-load via R2 + KV. Measure before commit; fall back to GH-Action computation if over budget |
| Reddit JSON deprecated / harder-limited | Per-source breaker; `scanReddit` failure does not block others; degradation recorded in `topic_signal_runs.metadata` |
| TikTok scrape blocked (likely) | v1 expects this — `scanTikTokHashtags` soft-fails to `[]`. Apify is a future PR |
| Low-quality proposals flood queue | `signalStrength < 30` hidden from `claimTopics` default; operator-tunable threshold |
| Duplicate topics across sources | `topic_slug` dedup; strengths combined via MAX, not sum |
| Stuck `claimed` if supervisor crashes | `sweepExpired` releases claims older than 30min |
| Google Trends Action creds | pytrends is HTTPS-only; only `WORKER_API_TOKEN` needed (issued via GCP Secret Manager per memory ref `reference_gcp_secret_manager_wiring.md`) |
| WASM ephemeris drift | Same Swiss Ephemeris that Astrodienst / academia use; commit lock + `.wasm` checksum verify |
| Sparse queue for new cells | Default config ships ≥3 enabled sources per cell; cold-start cron every 6h until depth ≥20 |
| Voice key drift | `enqueueTopics` fails fast if `voiceKey` isn't registered in `@lwt/copy` (3c) |

## 11. Cross-references

- [`packages/schedule/src/index.ts`](../../../packages/schedule/src/index.ts) — `ProductionBrief`, `scheduleVideo` (consumer)
- [`packages/video/`](../../../packages/video/) — render pipeline (downstream)
- [`packages/copy/src/index.ts`](../../../packages/copy/src/index.ts) — voice key registry (3c)
- [`packages/validation/`](../../../packages/validation/) — voice gate (called by supervisor when topic → script)
- [`icp/selfprime-practitioner.md §3`](../icp/selfprime-practitioner.md#3-channel-hypothesis) · [`icp/selfprime-consumer.md §3.2`](../icp/selfprime-consumer.md#32-earned)
- [`CHANNEL_DOCTRINE.md §2–§3`](../CHANNEL_DOCTRINE.md#2-per-cell-channel-mix) · [`VOICES.md`](../VOICES.md) · [`CAMPAIGN_TAGGING.md`](../CAMPAIGN_TAGGING.md)
- [`MARKETING_SUPERVISOR.md`](../MARKETING_SUPERVISOR.md) — TopicScout role
- PR 3c (predecessor — voice matrix) · PR 3e (predecessor — supervisor) · PR 3f (sibling — `postToChannel`)
- [`CLAUDE.md`](../../../CLAUDE.md) — Workers runtime + Package Dependency Order + verification requirement
