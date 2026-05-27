# PR 3f — LinkedIn + YouTube + TikTok + Instagram adapters in `@lwt/social`

**Status:** Drafted · **Depends on:** 3c (voice matrix)
**Owner package:** `@latimer-woods-tech/social` · **Effort:** 3 days
**Branch:** `marketing/3f-social-adapters` · **Bottleneck:** NO

## 1. Goal

Extend [`@lwt/social`](../../../packages/social/) (X + Pinterest today; see [`packages/social/src/index.ts`](../../../packages/social/src/index.ts) lines 269–290 for the current `*_WEBHOOK_ONLY` stubs) with adapters for the four channels [`CHANNEL_DOCTRINE.md §2`](../CHANNEL_DOCTRINE.md#2-per-cell-channel-mix) requires:

- **LinkedIn** — `selfprime:practitioner`, 3 posts/week per [`icp/selfprime-practitioner.md §3.2`](../icp/selfprime-practitioner.md#32-earned)
- **YouTube** — `selfprime:practitioner` (long-form) + `selfprime:consumer` (Shorts) per [`icp/selfprime-consumer.md §3.2`](../icp/selfprime-consumer.md#32-earned)
- **TikTok** — `selfprime:consumer`, 1–2 short-form/day
- **Instagram** — `selfprime:consumer`, Reels

All four route through one entry point `postToChannel(db, config, payload, context)` that carries cell context for the voice gate per [`CONSTITUTION.md §2`](../CONSTITUTION.md#2-brand-voice-gate).

## 2. Non-goals

- DM sending, comment moderation, reply automation (Reddit reply automation lives in `apps/lead-gen` via PR #976; X reply automation is out of scope for now)
- Cross-posting orchestration — supervisor (3e) decides which channels share a post
- Analytics / impressions reads — 3k attribution scope
- Stories / Fleets / Live — feed posts + Reels/Shorts only
- Multi-language posts

## 3. Dependencies

Files the executor MUST read:

- [`packages/social/src/index.ts`](../../../packages/social/src/index.ts) — current X + Pinterest adapters + webhook-only stubs
- [`packages/errors/src/index.ts`](../../../packages/errors/src/index.ts) — `withRetry`, `InternalError`, `ValidationError`
- [`packages/copy/src/index.ts`](../../../packages/copy/src/index.ts) — `getVoiceProfile` (post-3c shape)
- [`packages/validation/`](../../../packages/validation/) — `validateAiOutput` voice gate
- [`packages/neon/src/index.ts`](../../../packages/neon/src/index.ts) — `FactoryDb`, `withTenant`
- [`CHANNEL_DOCTRINE.md §2–§3`](../CHANNEL_DOCTRINE.md#2-per-cell-channel-mix) · [`CAMPAIGN_TAGGING.md §3`](../CAMPAIGN_TAGGING.md#3-where-the-tag-lives) · [`VOICES.md`](../VOICES.md) · [`CONSTITUTION.md §5`](../CONSTITUTION.md#5-channel-allowlist--readiness-gates) · [`CLAUDE.md`](../../../CLAUDE.md)

## 4. Migrations

```sql
-- 001_tenant_secrets.sql — per-tenant OAuth token storage
CREATE TABLE IF NOT EXISTS tenant_secrets (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        TEXT NOT NULL,
  channel          TEXT NOT NULL
                     CHECK (channel IN ('linkedin','youtube','tiktok','instagram','x','pinterest')),
  account_handle   TEXT NOT NULL,
  access_token     TEXT NOT NULL,
  refresh_token    TEXT,
  token_expires_at TIMESTAMPTZ,
  scopes           TEXT[] NOT NULL DEFAULT '{}',
  metadata         JSONB NOT NULL DEFAULT '{}',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, channel, account_handle)
);
CREATE INDEX idx_tenant_secrets_lookup ON tenant_secrets (tenant_id, channel);
CREATE INDEX idx_tenant_secrets_expiring ON tenant_secrets (token_expires_at)
  WHERE token_expires_at IS NOT NULL;
ALTER TABLE tenant_secrets ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_secrets_isolation ON tenant_secrets
  USING (tenant_id = current_setting('app.tenant_id', TRUE));

-- ROLLBACK: DROP POLICY tenant_secrets_isolation ON tenant_secrets;
--           ALTER TABLE tenant_secrets DISABLE ROW LEVEL SECURITY;
--           DROP INDEX idx_tenant_secrets_expiring; DROP INDEX idx_tenant_secrets_lookup;
--           DROP TABLE tenant_secrets;
```

```sql
-- 002_social_posts.sql — outbound post log (retry + attribution join)
CREATE TABLE IF NOT EXISTS social_posts (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        TEXT NOT NULL,
  channel          TEXT NOT NULL
                     CHECK (channel IN ('linkedin','youtube','tiktok','instagram','x','pinterest')),
  cell_key         TEXT NOT NULL,
  voice_key        TEXT NOT NULL,
  campaign_id      TEXT NOT NULL,
  external_id      TEXT,
  external_url     TEXT,
  status           TEXT NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending','accepted','failed','deleted')),
  body_hash        TEXT NOT NULL,
  metadata         JSONB NOT NULL DEFAULT '{}',
  error            TEXT,
  posted_at        TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_social_posts_tenant_channel ON social_posts (tenant_id, channel, posted_at DESC);
CREATE INDEX idx_social_posts_campaign ON social_posts (campaign_id);
CREATE UNIQUE INDEX idx_social_posts_dedup ON social_posts (tenant_id, channel, body_hash)
  WHERE status IN ('pending','accepted');
ALTER TABLE social_posts ENABLE ROW LEVEL SECURITY;
CREATE POLICY social_posts_isolation ON social_posts
  USING (tenant_id = current_setting('app.tenant_id', TRUE));

-- ROLLBACK: DROP POLICY social_posts_isolation ON social_posts;
--           ALTER TABLE social_posts DISABLE ROW LEVEL SECURITY;
--           DROP INDEX idx_social_posts_dedup; DROP INDEX idx_social_posts_campaign;
--           DROP INDEX idx_social_posts_tenant_channel; DROP TABLE social_posts;
```

## 5. API shape

```ts
// packages/social/src/index.ts

/** Canonical channel id. Matches CAMPAIGN_TAGGING.md `channel`. */
export type SocialChannel =
  | 'linkedin' | 'youtube' | 'tiktok' | 'instagram' | 'x' | 'pinterest';

/** Per-channel config — discriminated by `channel`. */
export type ChannelConfig =
  | { channel: 'linkedin'; accessToken: string; actorUrn: string }
  | { channel: 'youtube'; accessToken: string; channelId: string }
  | { channel: 'tiktok'; accessToken: string; openId: string }
  | { channel: 'instagram'; accessToken: string; igUserId: string }
  | { channel: 'x'; bearerToken: string }
  | { channel: 'pinterest'; accessToken: string };

/** Cell + campaign context — required for every publish. */
export interface PublishContext {
  tenantId: string;
  cellKey: string;        // 'selfprime:practitioner'
  voiceKey: string;       // 'prime_self:practitioner' per VOICES.md
  campaignId: string;     // per CAMPAIGN_TAGGING.md §2
  surface: string;        // 'linkedin/post-feed'
}

/** Post payload — discriminated by media kind. */
export type PostPayload =
  | { kind: 'text'; body: string }
  | { kind: 'image'; body: string; imageUrl: string; alt?: string }
  | { kind: 'video'; body: string; videoUrl: string; thumbnailUrl?: string; durationSec: number }
  | { kind: 'article'; body: string; articleUrl: string; articleTitle: string };

export interface PublishResult {
  channel: SocialChannel;
  externalId: string;
  externalUrl: string;
  status: 'accepted' | 'pending';
  postedAt: Date;
}

/** Unified entry point — routes to channel adapter, runs voice gate, retries, writes social_posts. */
export async function postToChannel(
  db: FactoryDb,
  config: ChannelConfig,
  payload: PostPayload,
  context: PublishContext,
  deps?: { fetch?: typeof fetch },
): Promise<PublishResult>;

// Per-channel adapters (internal but exported for testability).
// Each takes Extract<ChannelConfig, { channel: '...' }>, payload, optional deps,
// and returns Promise<PublishResult>.
//   postLinkedIn   — UGC Posts API; personal profile OR org page per actorUrn
//   postYouTube    — Data API v3 resumable upload (video); Community Posts (text/image)
//   postTikTok     — Content Posting API; two-step init/poll; webhook completes
//   postInstagram  — Graph API; create-container → publish; Reels via media_type=REELS
export async function postLinkedIn(config, payload, deps?): Promise<PublishResult>;
export async function postYouTube(config, payload, deps?): Promise<PublishResult>;
export async function postTikTok(config, payload, deps?): Promise<PublishResult>;
export async function postInstagram(config, payload, deps?): Promise<PublishResult>;

// OAuth token management
export async function loadChannelConfig(
  db: FactoryDb, tenantId: string, channel: SocialChannel, accountHandle: string,
): Promise<ChannelConfig>;
export async function storeChannelToken(db: FactoryDb, args: {
  tenantId: string; channel: SocialChannel; accountHandle: string;
  accessToken: string; refreshToken?: string; expiresInSec?: number; scopes: string[];
}): Promise<void>;
export async function refreshChannelToken(
  db: FactoryDb, tenantId: string, channel: SocialChannel, accountHandle: string,
  deps?: { fetch?: typeof fetch },
): Promise<ChannelConfig>;

// Webhook handlers (mounted on marketing-supervisor; verify HMAC + idempotent)
export async function handleTikTokWebhook(
  db: FactoryDb, body: unknown, signature: string, webhookSecret: string,
): Promise<{ ok: true } | { ok: false; reason: string }>;
export async function handleInstagramWebhook(
  db: FactoryDb, body: unknown, signature: string, webhookSecret: string,
): Promise<{ ok: true } | { ok: false; reason: string }>;
```

`postToChannel` is the single entry the supervisor (3e) and content publisher (3b/3d) call. Voice gate: before any text send, it calls `validateAiOutput(payload.body, getBrandVoiceRules(context.voiceKey))`. `major` issues throw `ValidationError`; `minor` log + proceed. Retries: every API call wrapped in `withRetry` (3 attempts, exponential backoff, 5xx + 429 only; 4xx fails fast).

## 6. Test plan

Unit (Vitest, ≥90% lines / ≥85% branches): each adapter happy path with mocked `fetch` (assert URL/headers/body); `postLinkedIn` covers text + article share + image asset flow; `postYouTube` covers resumable upload state machine + community post; `postTikTok` init → `pending`, webhook flips to `accepted`; `postInstagram` container create → publish + Reels via `media_type=REELS`; `postToChannel` routes by `config.channel`, runs voice gate, rejects `major`, writes `social_posts`; `loadChannelConfig` returns latest non-expired and auto-refreshes if expiring < 60s; `refreshChannelToken` surfaces auth errors as `ValidationError`; both webhook handlers verify HMAC SHA-256 + are idempotent on `external_id`; 429 → `withRetry` honors `Retry-After` up to 30s; same `body_hash` within 24h returns existing row with no API call; unregistered voice key throws before API call.

Integration (`@cloudflare/vitest-pool-workers`): end-to-end `postToChannel` → mocked LinkedIn server → row in `social_posts`; cross-tenant RLS verified. Contract tests: request bodies match per-platform published examples in `test/fixtures/{channel}-spec.json`.

## 7. Verification

After staging deploy (sandbox accounts per channel — see [`docs/runbooks/getting-started.md`](../../../docs/runbooks/getting-started.md)):

```bash
# LinkedIn text post
curl -X POST https://marketing-supervisor.adrper79.workers.dev/social/publish \
  -H "Authorization: Bearer $WORKER_API_TOKEN" \
  -d '{"channel":"linkedin","tenantId":"selfprime","cellKey":"selfprime:practitioner",
       "voiceKey":"prime_self:practitioner",
       "campaignId":"2026-q3-practitioner-design-partners",
       "surface":"linkedin/post-feed",
       "payload":{"kind":"text","body":"Cut your client prep from 90 minutes to 20 — same depth, your voice in every line."}}'
# Expect: 200, external_id set, external_url is linkedin.com/feed/update/...

# YouTube community post — expect 200 with external_id
# TikTok video upload — expect 200 with status:'pending'; webhook then flips to 'accepted'
# Instagram Reels — expect 200 with status:'pending'

# Voice gate rejection
curl -X POST .../social/publish \
  -d '{"channel":"linkedin","voiceKey":"prime_self:practitioner",
       "payload":{"kind":"text","body":"Hey newbies, casual amateur tip:"},"...":"..."}'
# Expect: 400 with major voice-gate issues in body
```

`/health` on marketing-supervisor returns `{ "social": { "linkedin":"ok","youtube":"ok","tiktok":"ok","instagram":"ok" }, "lastRefreshAt":"..." }`.

## 8. Acceptance criteria

- [ ] DDL migrations land + idempotent; cross-tenant RLS verified
- [ ] Four adapters implemented: LinkedIn, YouTube, TikTok, Instagram
- [ ] `postToChannel` routes correctly; voice gate runs before every send
- [ ] Webhook handlers verify HMAC; replay attacks rejected (5-min timestamp window)
- [ ] OAuth token refresh: transparent; refresh failures surface as escalations per [`ESCALATION_TIERS.md`](../ESCALATION_TIERS.md)
- [ ] `withRetry` wraps every API call; 4xx fails fast, 5xx + 429 retry up to 3x
- [ ] Dedup prevents duplicate posts within 24h
- [ ] Test coverage ≥90% lines, ≥85% branches; zero `any` in public API; no Node builtins / `Buffer` / `process.env`
- [ ] Verification curls succeed in staging for LinkedIn + YouTube (priority A); TikTok + IG acceptance may follow if sandbox approval pending
- [ ] CHANGELOG.md updated; minor version bump (old `TIKTOK_WEBHOOK_ONLY` / `INSTAGRAM_WEBHOOK_ONLY` preserved as `@deprecated` aliases)

## 9. File list

```
packages/social/
  src/
    index.ts                     # extend with postToChannel + deprecated stubs
    channels/{linkedin,youtube,tiktok,instagram}.ts   # NEW
    tokens.ts                    # NEW — load/store/refresh
    webhooks.ts                  # NEW — handle*Webhook (HMAC verify)
    voice-gate.ts                # NEW — pre-publish validateAiOutput wrapper
    types.ts                     # NEW — SocialChannel, ChannelConfig, PostPayload, PublishContext
  test/
    {linkedin,youtube,tiktok,instagram}.test.ts       # NEW
    post-to-channel.test.ts · tokens.test.ts · webhooks.test.ts   # NEW
    fixtures/{linkedin,youtube,tiktok,instagram}-spec.json        # NEW
  migrations/
    001_tenant_secrets.sql · 002_social_posts.sql     # NEW
```

## 10. Risks + mitigations

| Risk | Mitigation |
|---|---|
| OAuth token revoked by user/platform | Refresh catches 401 → mark `revoked` → open escalation → supervisor pauses tenant + channel until reconnected |
| Platform API breaking change | Contract fixtures + nightly canary in CI; failures page via Sentry |
| TikTok / IG sandbox approval delays | LinkedIn + YT ship first (priority A); TikTok + IG land once sandbox keys arrive — voice gate + post-log scaffolding is channel-agnostic |
| Token leakage via logs | `@lwt/logger` strips `access_token` / `refresh_token`; redaction unit-tested |
| Webhook replay | HMAC verify + 5-min timestamp window + idempotency on `external_id` |
| Rate-limit retry storms | `withRetry` caps at 3; per-tenant + per-channel token bucket if observed (KV-backed; defer to 3e if needed) |
| Voice gate false-positive blocks | Only `major` blocks; `minor` log-only; operator override in admin-studio |
| Dedup index regression → mass-spam | Daily cron asserts `count(distinct body_hash) >= 0.95 * count(*)` per tenant + channel |

## 11. Cross-references

- [`packages/social/src/index.ts`](../../../packages/social/src/index.ts) — current state
- [`CHANNEL_DOCTRINE.md §2–§3`](../CHANNEL_DOCTRINE.md#2-per-cell-channel-mix) · [`VOICES.md`](../VOICES.md) · [`CAMPAIGN_TAGGING.md`](../CAMPAIGN_TAGGING.md)
- [`CONSTITUTION.md §2`](../CONSTITUTION.md#2-brand-voice-gate) · [§5](../CONSTITUTION.md#5-channel-allowlist--readiness-gates) · [§6](../CONSTITUTION.md#6-data-consent-compliance)
- [`icp/selfprime-practitioner.md §3.2`](../icp/selfprime-practitioner.md#32-earned) · [`icp/selfprime-consumer.md §3.2`](../icp/selfprime-consumer.md#32-earned)
- [`packages/errors/`](../../../packages/errors/) · [`packages/validation/`](../../../packages/validation/)
- PR 3c (predecessor) · PR 3e (consumer) · PR 3g (consumer)
- [`CLAUDE.md`](../../../CLAUDE.md) — Workers runtime + verification requirement
