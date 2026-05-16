# Videoking REST API Reference

**Last Updated:** April 28, 2026  
**Version:** 1.0.0  
**Base URL:** `https://videoking.adrper79.workers.dev`  
**Audience:** API consumers (frontend, third-party integrations, Factory Admin)

---

## Authentication

All endpoints require JWT authentication via the `Authorization` header:

```bash
Authorization: Bearer <JWT_TOKEN>
```

**JWT Token Source:**
- Factory Auth service (`@latimer-woods-tech/auth`)
- Includes `sub` (creator ID), `aud` (videoking), `permissions` (role-based)
- Expires after 7 days; refresh via POST /auth/refresh

**Roles & Permissions:**
- `creator`: Can create, edit, delete own videos
- `viewer`: Can view published videos + analytics
- `admin:videoking`: Can access admin endpoints (DLQ, payouts)
- `operator:finance`: Can access payout reconciliation endpoints

---

## Error Responses

All errors follow the Factory error format:

```json
{
  "code": "ERROR_CODE",
  "message": "User-friendly message",
  "statusCode": 400,
  "traceId": "abc-123-def",
  "details": {
    "field": "validation_errors"
  }
}
```

**Common Codes:**
- `UNAUTHORIZED` (401) — JWT missing or invalid
- `FORBIDDEN` (403) — Insufficient permissions
- `VALIDATION_ERROR` (400) — Invalid request body
- `NOT_FOUND` (404) — Resource not found
- `CONFLICT` (409) — Resource already exists
- `RATE_LIMITED` (429) — Rate limit exceeded
- `INTERNAL_ERROR` (500) — Server error

---

## Endpoints

### Videos

#### POST /api/videos
**Create a new video**

Create a video record and obtain an upload URL.

**Permission:** `creator`

**Request Body:**
```json
{
  "title": "My First Video",
  "description": "A tutorial on Factory",
  "visibility": "private|draft|public",
  "tags": ["tutorial", "factory"],
  "thumbnailUrl": "https://...",
  "metadata": {
    "duration": 300,
    "width": 1920,
    "height": 1080
  }
}
```

**Response (201):**
```json
{
  "id": "vid_1a2b3c",
  "creatorId": "creator_123",
  "title": "My First Video",
  "uploadUrl": "https://cf-stream.example.com/upload?token=...",
  "uploadExpires": "2026-04-30T12:00:00Z",
  "status": "uploading",
  "visibility": "private",
  "createdAt": "2026-04-28T10:00:00Z",
  "updatedAt": "2026-04-28T10:00:00Z"
}
```

**Error Cases:**
- `VALIDATION_ERROR` — Missing title or invalid visibility
- `RATE_LIMITED` — Creator has exceeded upload quota (50/day)

**Example:**
```bash
curl -X POST https://videoking.adrper79.workers.dev/api/videos \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "My First Video",
    "description": "A tutorial",
    "visibility": "private",
    "tags": ["tutorial"]
  }'
```

---

#### GET /api/videos
**List creator's videos**

Retrieve all videos for the authenticated creator (paginated).

**Permission:** `creator`

**Query Parameters:**
- `limit` (integer, default: 20, max: 100) — Results per page
- `offset` (integer, default: 0) — Pagination offset
- `status` (string) — Filter by status: `uploading|processing|ready|failed|archived`
- `visibility` (string) — Filter by visibility: `draft|private|public`
- `sortBy` (string, default: `createdAt`) — Sort field: `createdAt|views|engagement`
- `sortOrder` (string, default: `desc`) — `asc` or `desc`

**Response (200):**
```json
{
  "videos": [
    {
      "id": "vid_1a2b3c",
      "title": "My First Video",
      "status": "ready",
      "visibility": "private",
      "views": 124,
      "engagement": {
        "likes": 5,
        "comments": 2,
        "shares": 1
      },
      "streamUrl": "https://cf-stream.example.com/vid_1a2b3c",
      "createdAt": "2026-04-28T10:00:00Z"
    }
  ],
  "total": 42,
  "limit": 20,
  "offset": 0
}
```

**Example:**
```bash
curl https://videoking.adrper79.workers.dev/api/videos \
  -H "Authorization: Bearer <TOKEN>" \
  -G --data-urlencode 'limit=10' \
  --data-urlencode 'status=ready'
```

---

#### GET /api/videos/{id}
**Get video details**

Retrieve full details for a video (if authorized).

**Permission:** 
- `creator` — Can view own videos
- `viewer` — Can view public videos
- `admin:videoking` — Can view any video

**Response (200):**
```json
{
  "id": "vid_1a2b3c",
  "creatorId": "creator_123",
  "title": "My First Video",
  "description": "A tutorial",
  "status": "ready",
  "visibility": "public",
  "streamUrl": "https://cf-stream.example.com/vid_1a2b3c",
  "thumbnailUrl": "https://...",
  "duration": 300,
  "views": 124,
  "engagement": {
    "likes": 5,
    "comments": 2,
    "shares": 1,
    "avgWatchTime": 245
  },
  "metadata": {
    "width": 1920,
    "height": 1080,
    "bitrate": "5000k",
    "codec": "h264"
  },
  "tags": ["tutorial", "factory"],
  "createdAt": "2026-04-28T10:00:00Z",
  "publishedAt": "2026-04-28T11:00:00Z",
  "updatedAt": "2026-04-28T10:00:00Z"
}
```

**Error Cases:**
- `NOT_FOUND` (404) — Video doesn't exist
- `FORBIDDEN` (403) — Video is private and user is not creator

---

#### PATCH /api/videos/{id}
**Update video metadata**

Update title, description, visibility, tags, or status.

**Permission:** `creator` (own videos only)

**Request Body (partial):**
```json
{
  "title": "Updated Title",
  "description": "New description",
  "visibility": "public",
  "tags": ["updated", "factory"]
}
```

**Response (200):**
Updated video object (same schema as GET /api/videos/{id})

**Error Cases:**
- `NOT_FOUND` (404) — Video not found
- `FORBIDDEN` (403) — Not the creator
- `CONFLICT` (409) — Cannot change visibility while status is `uploading`

---

#### DELETE /api/videos/{id}
**Delete a video**

Soft-deletes the video (marks as archived, preserves audit trail).

**Permission:** `creator` (own videos only) or `admin:videoking`

**Response (204):** No content

**Error Cases:**
- `NOT_FOUND` (404) — Video not found
- `FORBIDDEN` (403) — Not the creator

---

### Analytics

#### GET /api/videos/{id}/analytics
**Get video analytics**

Retrieve engagement metrics for a video.

**Permission:** `creator` (own videos) or `admin:videoking`

**Query Parameters:**
- `granularity` (string, default: `daily`) — `hourly|daily|weekly|monthly`
- `startDate` (ISO 8601, default: 30 days ago)
- `endDate` (ISO 8601, default: today)

**Response (200):**
```json
{
  "videoId": "vid_1a2b3c",
  "granularity": "daily",
  "data": [
    {
      "date": "2026-04-27",
      "views": 45,
      "uniqueViewers": 38,
      "avgWatchTime": 210,
      "retention": [
        {"percent": 0, "viewers": 38},
        {"percent": 25, "viewers": 32},
        {"percent": 50, "viewers": 28},
        {"percent": 75, "viewers": 22},
        {"percent": 100, "viewers": 12}
      ],
      "engagement": {
        "likes": 2,
        "comments": 1,
        "shares": 0
      }
    }
  ],
  "summary": {
    "totalViews": 1240,
    "uniqueViewers": 890,
    "avgEngagementRate": 0.08,
    "topGeoLocation": "US"
  }
}
```

---

### Payouts

#### GET /api/creator/payouts
**List creator's payouts**

Retrieve payout history.

**Permission:** `creator` (own payouts) or `operator:finance`

**Query Parameters:**
- `limit` (integer, default: 20, max: 100)
- `offset` (integer, default: 0)
- `status` (string) — Filter: `pending|processing|completed|failed`
- `startDate` (ISO 8601)
- `endDate` (ISO 8601)

**Response (200):**
```json
{
  "payouts": [
    {
      "id": "payout_1a2b3c",
      "creatorId": "creator_123",
      "amount": 15000,
      "currency": "USD",
      "status": "completed",
      "method": "stripe_direct_deposit",
      "period": "2026-04-01T00:00:00Z to 2026-04-30T23:59:59Z",
      "fees": {
        "platform": 1500,
        "payment": 45,
        "tax": 1200
      },
      "netAmount": 12255,
      "processedAt": "2026-04-26T10:00:00Z",
      "createdAt": "2026-04-01T00:00:00Z"
    }
  ],
  "total": 42,
  "totalEarnings": 525000
}
```

---

#### GET /api/admin/payouts
**Admin payout reconciliation**

Retrieve all payouts for operator reconciliation.

**Permission:** `operator:finance`

**Response (200):** Enhanced payout list with reconciliation fields
```json
{
  "payouts": [
    {
      "id": "payout_1a2b3c",
      "creatorId": "creator_123",
      "creatorName": "Jane Creator",
      "amount": 15000,
      "status": "completed",
      "reconciliationStatus": "verified",
      "reconciliationNotes": "Matched to Stripe payout ID: pi_...",
      "reconciliationDate": "2026-04-26T14:00:00Z",
      "reconciliationUser": "operator_456"
    }
  ]
}
```

---

### Admin Endpoints

#### GET /api/admin/health
**Factory Admin health check**

Verify videoking is operational (used by Factory Admin dashboard).

**Permission:** `admin:videoking` or `operator:*`

**Response (200):**
```json
{
  "status": "operational",
  "timestamp": "2026-04-28T10:30:00Z",
  "uptime": 99.95,
  "latency": {
    "p50": 45,
    "p95": 120,
    "p99": 250
  },
  "dependencies": {
    "database": "healthy",
    "stripe": "healthy",
    "cloudflare_stream": "healthy",
    "deepgram": "healthy",
    "sentry": "healthy"
  }
}
```

---

#### GET /api/admin/metrics
**Application metrics**

Real-time metrics for Factory Admin dashboard.

**Permission:** `admin:videoking`

**Response (200):**
```json
{
  "requests": {
    "total": 124500,
    "error_rate": 0.02,
    "avg_latency_ms": 92
  },
  "videos": {
    "total": 4200,
    "ready": 3850,
    "processing": 200,
    "failed": 50
  },
  "payouts": {
    "pending": 250000,
    "processed_this_month": 3200000
  },
  "creators": {
    "active": 520,
    "onboarded_this_month": 45
  },
  "database": {
    "connections": 8,
    "slow_queries": 0,
    "backups_pending": 0
  }
}
```

---

#### POST /api/admin/dlq-retry
**Retry a failed job**

Manually retry a failed video processing or payout job.

**Permission:** `admin:videoking` or `operator:*`

**Request Body:**
```json
{
  "dlqId": "dlq_job_abc123"
}
```

**Response (202):** Accepted (job queued for retry)
```json
{
  "dlqId": "dlq_job_abc123",
  "status": "retrying",
  "retryAt": "2026-04-28T11:00:00Z"
}
```

---

#### GET /api/admin/dlq
**List dead letter queue**

Show failed jobs awaiting manual intervention.

**Permission:** `admin:videoking`

**Query Parameters:**
- `limit` (integer, default: 20)
- `status` (string) — `failed|retrying|dead`

**Response (200):**
```json
{
  "jobs": [
    {
      "id": "dlq_job_abc123",
      "jobType": "video:transcode",
      "videoId": "vid_1a2b3c",
      "error": "Deepgram timeout after 5 retries",
      "failedAt": "2026-04-28T10:15:00Z",
      "retryCount": 5,
      "nextRetryAt": null,
      "logs": "https://..."
    }
  ],
  "total": 3
}
```

---

## Rate Limiting

All endpoints are rate-limited by creator:

```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 45
X-RateLimit-Reset: 1651130400
```

**Limits:**
- Unauthenticated: 10 req/min (IP-based)
- Creator: 100 req/min
- Admin: 1000 req/min

**Exceeded (429 response):**
```json
{
  "code": "RATE_LIMITED",
  "message": "Rate limit exceeded. Try again after 30 seconds.",
  "retryAfter": 30
}
```

---

## Webhooks

Videoking sends webhooks for important events. Register webhook URLs in the Dashboard:

**Events:**
- `video.processing_complete` — Video is ready to play
- `video.processing_failed` — Video transcoding failed
- `payout.processed` — Creator payout completed
- `payout.failed` — Payout failed (will be retried)

**Webhook Payload:**
```json
{
  "event": "video.processing_complete",
  "timestamp": "2026-04-28T10:30:00Z",
  "data": {
    "videoId": "vid_1a2b3c",
    "status": "ready",
    "streamUrl": "https://..."
  }
}
```

**Verification:** Webhooks are signed with HMAC-SHA256. Verify using your webhook secret.

---

## SDK / Client Libraries

- **JavaScript/TypeScript:** `@videoking/sdk` (npm)
- **Python:** `videoking-sdk` (PyPI)
- **Go:** `github.com/videokingco/go-sdk`

All SDKs handle authentication, rate limiting, and retries automatically.

---

## Changelog

| Version | Date | Changes |
|---------|------|---------|
| **1.0.0** | Apr 28, 2026 | Initial API release |
| **0.9.0** | Apr 15, 2026 | Beta endpoints, DLQ admin |
| **0.8.0** | Apr 1, 2026 | Creator analytics endpoints |

---

## Support

- **Documentation:** [Videoking Docs](https://docs.videoking.local)
- **Issues:** Report on [GitHub Discussions](https://github.com/orgs/Latimer-Woods-Tech/discussions)
- **Slack:** #videoking-api (Factory team only)
