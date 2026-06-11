# Practitioner Video Studio — Phase 2 Specification

**Status:** Draft  
**Owner:** Product Lead  
**Last Updated:** 2026-05-01  
**Implements:** VIDEO_AUTOMATION_GAMEPLAN.md Phase 2 (Practitioner Content Layer)

---

## Executive Summary

Phase 1 delivered automated AI-generated videos for Prime Self marketing content. Phase 2 extends the video pipeline to practitioner-uploaded content, manual video management, moderation workflows, Stream visibility tiers, and practitioner revenue share. This spec defines the contract between the video infrastructure (schedule-worker, Cloudflare Stream, R2) and the Prime Self practitioner experience.

---

## 1. Scope

| Capability | Phase 2 | Phase 3 |
|---|---|---|
| AI-generated brand videos | ✅ Done (Phase 1) | — |
| Practitioner manual uploads | ✅ This spec | — |
| Practitioner upload moderation | ✅ This spec | — |
| Stream visibility tiers | ✅ This spec | — |
| Monetization (paid unlocks) | Defined here | Implemented in Phase 3 |
| Video analytics dashboard | — | Phase 3 |

---

## 2. Video Categories

### 2.1 System-Generated Videos (Phase 1 — Active)

Automated pipeline via Remotion + GitHub Actions. Requires no practitioner interaction.

| Composition | Duration | Trigger | Audience |
|---|---|---|---|
| `MarketingVideo` | 15s | Scheduled/manual | Public (landing page) |
| `TrainingVideo` | 30s | Scheduled/manual | Registered users |
| `WalkthroughVideo` | 40s | Admin trigger | All tiers |

**Storage:** R2 (`factory-videos/prime-self/`)  
**Delivery:** Cloudflare Stream (always public for system videos)

### 2.2 Practitioner-Uploaded Videos (Phase 2 — This Spec)

Videos uploaded directly by certified practitioners (tier: `practitioner` or `agency`).

| Type | Max Duration | Max Size | Access Control |
|---|---|---|---|
| Introduction | 3 min | 500 MB | Public (free viewers) |
| Session Preview | 10 min | 1 GB | Free viewers (first 2 min gated) |
| Full Session | 60 min | 5 GB | Paid unlock or subscriber |
| Practitioner Training | 30 min | 2 GB | Practitioner tier only |

---

## 3. Upload Flow

### 3.1 API Endpoints

```
POST /api/practitioner/videos/upload-url
  Body: { type, title, description, visibility }
  Returns: { uploadUrl, videoId }
  Auth: practitioner tier JWT

GET  /api/practitioner/videos
  Returns: { data: [...videos] }
  Auth: practitioner tier JWT

GET  /api/practitioner/videos/:videoId
  Returns: { data: video }
  Auth: practitioner tier JWT

PATCH /api/practitioner/videos/:videoId
  Body: { title?, description?, visibility? }
  Auth: practitioner tier JWT (owner only)

DELETE /api/practitioner/videos/:videoId
  Auth: practitioner tier JWT (owner only)

GET  /api/videos/practitioner/:practitionerSlug
  Returns: { data: [...publicVideos] }
  Auth: public (free) | full detail for paid
```

### 3.2 Upload Sequence

```
Client → POST /api/practitioner/videos/upload-url
  ↓
Worker validates tier + quota
  ↓
Worker calls Cloudflare Stream /stream/direct_upload
  → Returns one-time tus upload URL
  ↓
Worker stores video record in DB (status: uploading)
  ↓
Client uploads directly to Stream via tus
  ↓
Stream webhook → POST /api/webhook/stream
  → Worker updates status: transcoding → ready/error
  ↓
Admin reviews (if visibility != 'private')
  ↓
Admin approves → status: published | moderator_id set
```

### 3.3 Database Schema

```sql
CREATE TABLE IF NOT EXISTS practitioner_videos (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  practitioner_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  stream_uid        TEXT,                         -- Cloudflare Stream UID (set after upload)
  title             TEXT NOT NULL,
  description       TEXT,
  type              TEXT NOT NULL CHECK (type IN ('intro','preview','session','training')),
  visibility        TEXT NOT NULL DEFAULT 'private'
                       CHECK (visibility IN ('private','pending_review','published','rejected')),
  access_tier       TEXT NOT NULL DEFAULT 'free'
                       CHECK (access_tier IN ('free','registered','paid')),
  price_cents       INTEGER DEFAULT 0,            -- 0 = included in subscription
  duration_seconds  INTEGER,                      -- populated from Stream metadata
  thumbnail_url     TEXT,
  moderator_id      UUID REFERENCES users(id),
  moderation_note   TEXT,
  view_count        INTEGER NOT NULL DEFAULT 0,
  revenue_cents     INTEGER NOT NULL DEFAULT 0,   -- cumulative unlock revenue
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  published_at      TIMESTAMPTZ,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX ON practitioner_videos (practitioner_id, visibility);
CREATE INDEX ON practitioner_videos (visibility, access_tier);
```

### 3.4 Upload Quota

| Tier | Max videos | Total storage |
|---|---|---|
| `practitioner` | 20 | 10 GB |
| `agency` | 100 | 50 GB |

Quota is checked on upload-url creation. Exceeded quota returns `429 Too Many Requests`.

---

## 4. Moderation Workflow

### 4.1 Moderation States

```
private → pending_review → published
                        ↘ rejected (with moderation_note)
```

- **private**: Only practitioner can see. No Stream embed generated.
- **pending_review**: Awaiting admin review. Stream URL active but only accessible by admins.
- **published**: Live. Visibility determined by `access_tier`.
- **rejected**: Hidden. Practitioner receives email notification with `moderation_note`.

### 4.2 Admin Moderation Routes

```
GET  /api/admin/videos?visibility=pending_review  — Queue of videos awaiting review
GET  /api/admin/videos/:videoId                   — Video detail + Stream embed URL
POST /api/admin/videos/:videoId/approve           — Set visibility = published
POST /api/admin/videos/:videoId/reject            — Set visibility = rejected + notify practitioner
```

### 4.3 Auto-Publish Rules

Videos may be auto-published without manual review when:
1. The practitioner has a `reputation_score >= 90` (future metric)
2. The video is marked `type = 'intro'` AND `access_tier = 'free'`
3. The practitioner has previously published ≥ 5 approved videos without any rejections

Auto-published videos are still flagged in the moderation queue with `auto_published: true` for retroactive review.

### 4.4 Content Policy

Rejected reasons (stored in `moderation_note`):
- `misrepresentation` — Claims not supported by Human Design credentials
- `inappropriate_content` — Violates platform conduct standards
- `copyright_violation` — Unauthorized third-party content
- `technical_quality` — Audio too low, unreadable text, < 480p resolution
- `off_topic` — Not relevant to Human Design, coaching, or wellbeing

---

## 5. Stream Visibility Control

### 5.1 Cloudflare Stream Settings Per Tier

| Access Tier | Stream `requireSignedURLs` | Embed restriction |
|---|---|---|
| `free` | `false` | None |
| `registered` | `true` | Verified JWT required |
| `paid` | `true` | Verified JWT + unlock record in DB |

### 5.2 Signed URL Generation (registered + paid videos)

```javascript
// Worker generates signed Stream URL valid for 1 hour
// Called when user has the required access level
async function generateSignedStreamUrl(streamUid, env) {
  const expiry = Math.floor(Date.now() / 1000) + 3600;
  const token = await signStreamJwt(streamUid, expiry, env.CF_STREAM_KEY_ID, env.CF_STREAM_PRIVATE_KEY);
  return `https://iframe.videodelivery.net/${token}`;
}
```

**Required env vars:**
- `CF_STREAM_KEY_ID` — Stream signing key ID
- `CF_STREAM_PRIVATE_KEY` — RSA private key (base64-encoded PEM)

### 5.3 Embed URL Serving

```
GET /api/videos/embed/:videoId
  → For free videos: return public Stream embed URL
  → For registered: verify JWT, return signed Stream URL
  → For paid: verify JWT + DB unlock record, return signed URL
                else return 402 Payment Required + unlock CTA
```

---

## 6. Monetization Design (Implemented in Phase 3)

> See also: [docs/videoking/SELFPRIME_MONETIZATION_CONTRACT.md](./videoking/SELFPRIME_MONETIZATION_CONTRACT.md) for the full event schema.

### 6.1 Revenue Model

| Type | Description | Revenue Split |
|---|---|---|
| One-time Unlock | User pays to unlock a single video permanently | 70% practitioner / 30% platform |
| Session Bundle | User pays for access to all of a practitioner's content for 30 days | 65% / 35% |
| Subscriber Pass | User's subscription tier includes free access to practitioner content | Practitioner pool share (monthly) |

### 6.2 Pricing Rules

- Minimum price: $5.00 (500 cents)
- Maximum price: $500.00 (50,000 cents)
- Platform fee: 30% for unlocks, 35% for bundles
- Currency: USD only (Phase 2); EUR/GBP in Phase 4

### 6.3 Unlock Flow

```
User arrives at gated video
  ↓
GET /api/videos/embed/:videoId → 402 + { cta: "Unlock for $19", unlockUrl }
  ↓
User clicks unlock → POST /api/videos/:videoId/unlock
  → Creates Stripe PaymentIntent
  → Returns { clientSecret }
  ↓
Frontend completes payment (Stripe Elements)
  ↓
Stripe webhook → POST /api/webhook/stripe
  → Creates video_unlock record
  ↓
GET /api/videos/embed/:videoId → 200 signed Stream URL
```

### 6.4 Practitioner Earnings

```sql
CREATE TABLE IF NOT EXISTS video_unlocks (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id         UUID NOT NULL REFERENCES practitioner_videos(id),
  user_id          UUID NOT NULL REFERENCES users(id),
  amount_cents     INTEGER NOT NULL,
  practitioner_cut INTEGER NOT NULL,   -- amount_cents * 0.70
  platform_cut     INTEGER NOT NULL,   -- amount_cents * 0.30
  stripe_pi_id     TEXT NOT NULL UNIQUE,
  status           TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','succeeded','refunded')),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

Practitioner earnings are accumulated in `practitioner_videos.revenue_cents` via trigger or
worker-side aggregation. Payouts are batched monthly via Stripe Connect.

---

## 7. Stream Webhook Handler

Register in Stream dashboard: `HTTPS POST https://api.selfprime.net/api/webhook/stream`

```javascript
// POST /api/webhook/stream
// Cloudflare Stream notifies when video transcoding completes or fails
async function handleStreamWebhook(request, env) {
  // Verify signature (Stream signs with CF_STREAM_WEBHOOK_SECRET)
  const sig = request.headers.get('Webhook-Signature') || '';
  if (!await verifyStreamWebhookSignature(sig, request, env)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const event = await request.json();
  const { uid, status, duration, thumbnail } = event;

  if (status === 'ready') {
    await updateVideoReady(env, uid, { duration, thumbnail });
  } else if (status === 'error') {
    await updateVideoError(env, uid, event.error);
  }

  return Response.json({ ok: true });
}
```

**Required secret:** `CF_STREAM_WEBHOOK_SECRET`

---

## 8. Storage Architecture

```
R2 bucket: factory-videos
  prime-self/
    system/                    ← AI-generated (Phase 1)
      {jobId}/
        narration.mp3
        render.mp4
    practitioners/             ← Uploaded (Phase 2)
      {practitionerId}/
        {videoId}/
          original.{ext}       ← Upload from practitioner
          (Stream handles transcoding + delivery)
    thumbnails/                ← Custom thumbnails (optional)
      {videoId}/thumbnail.jpg
```

---

## 9. Phase 2 Delivery Milestones

| Milestone | Owner | ETA |
|---|---|---|
| DB schema migration runs cleanly | Backend | Week 1 |
| `POST /api/practitioner/videos/upload-url` live | Backend | Week 2 |
| Stream webhook handler deployed | Backend | Week 2 |
| Moderation queue in admin dashboard | Admin UI | Week 3 |
| Public practitioner video page | Frontend | Week 3 |
| Signed URL generation for gated content | Backend | Week 4 |
| Phase 3 unlock Stripe flow | Backend + Payments | Week 5-6 |

---

## 10. Dependencies

| Dependency | Status |
|---|---|
| `@latimer-woods-tech/video` package | ✅ Available |
| Cloudflare Stream API token (`CF_STREAM_TOKEN`) | ✅ Configured |
| Cloudflare R2 binding | ✅ Active |
| schedule-worker deployed | ⏳ Pending (Phase 1 blocker) |
| CF_STREAM_KEY_ID + CF_STREAM_PRIVATE_KEY | ❌ Not yet created |
| CF_STREAM_WEBHOOK_SECRET | ❌ Not yet created |

### Action Required
To unblock signed URL generation:
```bash
# Create a Stream signing key
curl -X POST "https://api.cloudflare.com/client/v4/accounts/$CF_ACCOUNT_ID/stream/keys" \
  -H "Authorization: Bearer $CF_STREAM_TOKEN" \
  | jq '{ id: .result.id, pem: .result.pem }'

# Store results
echo "{KEY_ID}" | wrangler secret put CF_STREAM_KEY_ID --name prime-self
echo "{PRIVATE_KEY_PEM_BASE64}" | wrangler secret put CF_STREAM_PRIVATE_KEY --name prime-self

# Generate webhook secret
openssl rand -hex 32 | wrangler secret put CF_STREAM_WEBHOOK_SECRET --name prime-self
```

---

## See Also

- [VIDEO_AUTOMATION_GAMEPLAN.md](../docs/archive/VIDEO_AUTOMATION_GAMEPLAN.md) — Phase 1 deployment runbook (archived)
- [docs/videoking/SELFPRIME_MONETIZATION_CONTRACT.md](./videoking/SELFPRIME_MONETIZATION_CONTRACT.md) — Monetization event schema
- [docs/videoking/monetization-funnel-spec.md](./videoking/monetization-funnel-spec.md) — VideoKing reference contract
- [docs/service-registry.yml](./service-registry.yml) — Worker URLs and deployment status
