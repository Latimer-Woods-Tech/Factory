# Video Render Pipeline

Operational runbook for the Factory automated video render pipeline.

## Architecture

```
PostHog engagement signals
  → scorePriority() → schedule-worker video_calendar row
  → apps/video-cron (hourly cron) → getPendingJobs() → workflow_dispatch
  → .github/workflows/render-video.yml:
      1. Generate LLM script (headline + narration)
      2. ElevenLabs narration (MP3 → R2)
      3. Remotion render (MP4)
      4. ffmpeg re-encode (H.264 baseline + AAC)
      5. R2 upload (MP4)
      6. Cloudflare Stream copy + poll until ready
      7. POST /api/admin/videos/import on Capricast
      8. PATCH schedule-worker job → status=done
```

Why this lives outside Workers: Remotion needs real Chromium and ffmpeg.
A Cloudflare Worker cannot run either; the render must execute on a real VM
(GitHub Actions ubuntu-latest, currently).

## Files

- `.github/workflows/render-video.yml` — the workflow (two jobs):
  - `render` — runs on `workflow_dispatch` (cron-initiated). Touches real APIs.
  - `dry-run` — runs on every PR change that touches the workflow,
    `apps/video-studio/**`, or `apps/video-cron/**`. Walks the same step
    structure using local fixtures and a localhost Capricast stub.
- `apps/video-studio/scripts/generate-script.mjs` — emits
  `headline`, `narration`, `script` (= narration alias), `steps`.
- `apps/video-studio/scripts/publish-to-capricast.mjs` — POSTs to
  `${CAPRICAST_API_URL}/api/admin/videos/import`. Treats 409
  `DuplicateStreamUid` as a no-op success.
- `apps/video-studio/scripts/fixtures/` — sample payloads used by the
  dry-run job. Never edit at runtime; check fixtures in deliberately.
- `apps/video-cron/src/index.ts` — Worker that dispatches `render-video.yml`
  via `POST /actions/workflows/render-video.yml/dispatches`. See line 108
  for the dispatch contract.

## Workflow inputs

| Input            | Required | Notes                                       |
| ---------------- | -------- | ------------------------------------------- |
| `job_id`         | yes      | schedule-worker job id (PATCH target)       |
| `composition_id` | yes      | `EnergyBlueprintVideo` (cron default since 2026-06-12) / `MarketingVideo` / `TrainingVideo` / `WalkthroughVideo` |
| `app_id`         | yes      | Factory application id (e.g. `prime_self`)  |
| `topic`          | yes      | Topic seed for the render                   |
| `brand_color`    | no       | Default `#6366f1`                           |
| `brand_accent`   | no       | Default `#a5b4fc`                           |
| `logo_url`       | no       | Default empty                               |
| `dry_run`        | no       | `'true'` to walk fixtures without external calls |

These match the inputs `apps/video-cron/src/index.ts:108` sends.

## Secrets

All secrets are pulled from **GCP Secret Manager** at workflow runtime via
the standard `scripts/fetch_gcp_secrets.sh` pattern (Workload Identity
Federation via `google-github-actions/auth@v3`). They are **not** GitHub
Actions repo secrets.

Required GCP secrets (each tried by the names listed, in order):

| Local env var               | GCP secret names (first that exists wins)             |
| --------------------------- | ----------------------------------------------------- |
| `ANTHROPIC_API_KEY`         | `ANTHROPIC_API_KEY`, `anthropic-api-key`              |
| `GROQ_API_KEY`              | `GROQ_API_KEY`, `groq-api-key`                        |
| `ELEVENLABS_API_KEY`        | `ELEVENLABS_API_KEY`, `elevenlabs-api-key`            |
| `ELEVENLABS_VOICE_PRIME_SELF` | `ELEVENLABS_VOICE_PRIME_SELF`, `elevenlabs-voice-prime-self` |
| `ELEVENLABS_VOICE_CYPHER`   | `ELEVENLABS_VOICE_CYPHER`, `elevenlabs-voice-cypher`  |
| `ELEVENLABS_VOICE_DEFAULT`  | `ELEVENLABS_VOICE_DEFAULT`, `elevenlabs-voice-default`|
| `CF_ACCOUNT_ID`             | `CF_ACCOUNT_ID`, `CLOUDFLARE_ACCOUNT_ID`              |
| `CF_STREAM_TOKEN`           | `CF_STREAM_TOKEN`, `cf-stream-token`                  |
| `CF_STREAM_CUSTOMER_DOMAIN` | `CF_STREAM_CUSTOMER_DOMAIN`, `cf-stream-customer-domain`|
| `R2_ACCESS_KEY_ID`          | `R2_ACCESS_KEY_ID`, `r2-access-key-id`                |
| `R2_SECRET_ACCESS_KEY`      | `R2_SECRET_ACCESS_KEY`, `r2-secret-access-key`        |
| `R2_BUCKET_NAME`            | `R2_BUCKET_NAME`, `r2-bucket-name`                    |
| `R2_PUBLIC_DOMAIN`          | `R2_PUBLIC_DOMAIN`, `r2-public-domain`                |
| `SCHEDULE_WORKER_URL`       | `SCHEDULE_WORKER_URL`, `schedule-worker-url`          |
| `WORKER_API_TOKEN`          | `WORKER_API_TOKEN`, `worker-api-token`                |
| `CAPRICAST_PUBLISH_TOKEN`   | `CAPRICAST_PUBLISH_TOKEN`, `capricast-publish-token`  |
| `CAPRICAST_SYSTEM_CREATOR_ID` | `CAPRICAST_SYSTEM_CREATOR_ID`, `capricast-system-creator-id` |
| `AI_GATEWAY_BASE_URL`       | `AI_GATEWAY_URL`, `AI_GATEWAY_BASE_URL`, `ai-gateway-base-url`, `ai-gateway-url` |

### Secret provisioning conventions

**Always use `printf '%s'`, never `echo`**, when piping a value into
`gcloud secrets create` or `gcloud secrets versions add`. `echo` appends
a trailing newline that gets stored as part of the secret value and
silently breaks any strict-equality header check (Anthropic, Stream,
Capricast import endpoint).

```bash
# WRONG — trailing newline corrupts the stored value
echo "$VALUE" | gcloud secrets versions add SECRET_NAME --data-file=-
# RIGHT
printf '%s' "$VALUE" | gcloud secrets versions add SECRET_NAME --data-file=-
```

Many secrets in `factory-495015` were originally pasted with a leading
UTF-8 BOM (`ef bb bf`) — equally invisible, equally broken. When in
doubt, audit:

```bash
gcloud secrets versions access latest --secret=SECRET_NAME --project=factory-495015 \
  | head -c 3 | xxd
# Clean keys start with their expected printable bytes (e.g. `sk-` for
# Anthropic). BOM is bytes `ef bb bf` at the start.
```

To strip BOM defensively when reading in scripts:

```bash
CLEAN=$(printf '%s' "$RAW" | sed 's/^\xef\xbb\xbf//' | tr -d '\r\n')
```

### IAM access for WIF

When creating a new secret, grant the factory WIF service account read
access:

```bash
gcloud secrets add-iam-policy-binding NEW_SECRET_NAME \
  --project=factory-495015 \
  --member='serviceAccount:factory-sa@factory-495015.iam.gserviceaccount.com' \
  --role='roles/secretmanager.secretAccessor'
```

## Manual test render

Once both new secrets exist, run a one-off render via `gh`:

```bash
gh workflow run render-video.yml \
  -f job_id=manual-$(date +%s) \
  -f composition_id=MarketingVideo \
  -f app_id=prime_self \
  -f topic='Your Free Energy Blueprint: First Steps' \
  -f brand_color='#8B5CF6' \
  -f brand_accent='#10B981' \
  -f logo_url=''
```

For a smoke test that doesn't burn budget:

```bash
gh workflow run render-video.yml -f dry_run=true \
  -f job_id=dryrun \
  -f composition_id=MarketingVideo \
  -f app_id=prime_self \
  -f topic='Dry run'
```

## Verification (the `curl` test)

After a real render, verify the published video exists:

```bash
# Stream playback URL (use the streamUid returned by the workflow).
# CF_STREAM_CUSTOMER_DOMAIN is a per-account subdomain; for factory-495015
# it's `op4b8eq1uv0ciwqy`.
curl -I "https://customer-${CF_STREAM_CUSTOMER_DOMAIN}.cloudflarestream.com/${STREAM_UID}/manifest/video.m3u8"
# Expect: HTTP/2 200

# Capricast API direct (use the Capricast video id from publish-to-capricast)
curl "https://api.capricast.com/api/videos/${CAPRICAST_ID}"
# Expect: HTTP 200 + JSON object with title, transcript, etc.

# Capricast public watch page (frontend)
curl -I "https://capricast.com/watch/${CAPRICAST_ID}"
# Expect: HTTP 200. The path is `/watch/...` — NOT `/v/...`.
```

A live end-to-end-verified example (2026-05-20 first production
pipeline run):
- Capricast video id: `5209dd21-71a8-4ee4-afeb-0c030ade1a70`
- Stream UID: `f6989d17880309e2618a7c4325a995dc`
- Public URL: https://capricast.com/watch/5209dd21-71a8-4ee4-afeb-0c030ade1a70

## Troubleshooting

- **Workflow never starts.** Check the cron worker logs:
  `wrangler tail video-cron --env production`. The dispatch step expects a
  GitHub App token with `actions:write` on Factory.
- **`Fetch secrets` warns about missing secrets.** Either the secret
  doesn't exist in GCP Secret Manager, or the factory WIF service account
  lacks `secretmanager.secretAccessor` on it. Diagnose with
  `gcloud secrets list --project=factory-495015 | grep -i capricast`.
- **ElevenLabs returns 401.** First suspect a UTF-8 BOM on the stored
  secret (see "Operational gotchas" below). Then verify voice ids match
  the API key's account.
- **Anthropic returns 401 despite correct key format.** The
  `ANTHROPIC_API_KEY` in this project's GCP Secret Manager has been a
  known stale value (revoked workspace, suffix `3DegAA`). The live key
  is stored separately as `LATIMER_ANTHROPIC_API` (suffix `Y-jgAA`); if
  you ever rotate ANTHROPIC_API_KEY again, mirror the LATIMER value or
  update the workflow's fetch alias chain. `SELFPRIME_CLAUDE_API` is
  also a copy of the dead `3DegAA` key.
- **Stream poll times out at `queued`.** Stream's `copy` endpoint
  sometimes takes longer for the first render of a new R2 video.
  Increase the poll cap from 10 minutes if needed.
- **Stream `/copy` returns "video not found" or similar.** The MP4 URL
  must be publicly fetchable by Cloudflare's edge — Stream pulls it via
  unauthenticated HTTPS GET. The `factory-videos` R2 bucket has its
  managed `.r2.dev` domain enabled; if it's ever disabled, re-enable:
  ```
  PUT /accounts/{account_id}/r2/buckets/factory-videos/domains/managed
  Body: {"enabled": true}
  ```
- **Capricast 409 `DuplicateStreamUid`.** Expected when the workflow
  re-runs for the same `streamUid`. Treated as success.
- **Capricast publish returns 401.** `CAPRICAST_PUBLISH_TOKEN` must
  also be `wrangler secret put` on the Capricast worker (the deploy.yml
  does this automatically on every Capricast prod deploy, but if you
  changed the value in GCP you must also redeploy the worker for the
  binding to update).
- **`GET /api/videos/:id` returns 500 "Failed to fetch video".** The
  Capricast worker uses Drizzle which wraps the underlying postgres-js
  PgError. Inspect `err.cause` to see the real Postgres error. The
  most common cause is "column X does not exist" — Drizzle's
  migration ledger is in a broken state and migrations don't auto-
  apply (see "Drizzle ledger" gotcha). Apply missing migrations via
  `psql` directly.
- **schedule-worker PATCH returns 401.** `WORKER_API_TOKEN` doesn't
  match the schedule-worker's configured bearer.
- **schedule-worker PATCH returns 404.** The `job_id` doesn't exist
  in the schedule-worker DB. Expected for manual `gh workflow run`
  dispatches with synthetic ids — non-fatal, the render itself
  succeeded.

## Operational gotchas (load-bearing constraints)

These all caused production outages or hours of debugging during the
2026-05-20 end-to-end pipeline validation. Treat as load-bearing.

### 1. GCP secrets and UTF-8 BOM

A bulk-paste process originally populated this project's secrets with a
leading UTF-8 BOM (`ef bb bf`). The BOM is invisible to humans, treated
as part of the secret value by `gcloud secrets versions access`, and
silently breaks any strict-equality header check (Anthropic 401, Stream
400, etc.). Five were re-pushed clean on 2026-05-20. Always use
`printf '%s'` when creating new secrets; verify with `xxd` if you
suspect issues.

### 2. Drizzle migration ledger is broken

`drizzle.__drizzle_migrations` in the Neon DB has a single row that
matches no migration file. `drizzle-kit migrate` tries to re-apply
0001+ and fails on existing tables. The deploy step is wrapped in
`continue-on-error: true` so deploys still complete; **new migrations
must be applied via `psql` manually** until the ledger is repaired.

The schema files in `packages/db/src/schema/` are the canonical source —
diff their column lists against `information_schema.columns` to find
drift. As of 2026-05-20 two migrations had been silently skipped:
`0015_gdpr_deleted_at.sql` (users.deleted_at) and
`0019_video_transcripts.sql` (videos.transcript +
videos.transcript_language). Both applied manually via `ALTER TABLE …
ADD COLUMN IF NOT EXISTS` (the migration files themselves use this
idempotent form).

### 3. Capricast Pages project name is `videoking` (legacy)

The videoking → capricast rename never propagated to the Cloudflare
Pages project. capricast.com / www.capricast.com / itsjusus.com all
map to a project named `videoking`. The Capricast `deploy.yml` had
`--project-name capricast` for months → every Pages deploy silently
failed with code 8000007 "Project not found". Worker deploys ran
fine; the frontend just never updated. Fixed 2026-05-20 by changing
to `--project-name videoking`. Renaming the Pages project would
require coordinated DNS changes; leaving as-is.

### 4. Stream customer subdomain is per-account

`customer-{CF_STREAM_CUSTOMER_DOMAIN}.cloudflarestream.com` URLs use
an account-specific subdomain that isn't the account UUID. For
factory-495015 it's `op4b8eq1uv0ciwqy`. Extract from any existing
Stream video's `thumbnail` URL:

```bash
curl -s -H "Authorization: Bearer $CF_STREAM_TOKEN" \
  "https://api.cloudflare.com/client/v4/accounts/$CF_ACCOUNT_ID/stream?per_page=1" \
  | jq -r '.result[0].thumbnail'
```

### 5. CF_STREAM_TOKEN can be a `cfut_` token (despite earlier memory)

A previous memory note claimed Cloudflare `cfut_` tokens are R2-only.
This account's `cfut_dcqbV…` token verifies as `active` against
`/user/tokens/verify` AND lists Stream videos successfully — i.e. it
carries Stream scope. `CF_STREAM_TOKEN` in GCP Secret Manager was
created on 2026-05-20 as a copy of `CF_API_TOKEN`. If you ever rotate,
make sure the replacement has both Stream:Edit and Stream:Read.

### 6. Capricast system creator must have role=`creator`

The factory-managed video creator user (`0194b4cc-…`,
`factory-bot@itsjusus.com`) was originally provisioned with
`role='viewer'`. The `creator_id` FK on videos.users isn't filtered by
role at the DB layer, but downstream worker queries (and the watch
page) assume the joined user has `role='creator'`. Promoted via:

```sql
UPDATE users SET role='creator' WHERE id='0194b4cc-ce46-4441-99af-937a20dca00a';
```

Any new factory-managed creator account needs the same promotion.

### 7. (I1 personal-film pipeline) silent/stub narration → selfprime LLM fallback streaming bug

This runbook covers the **scheduled-content** pipeline (`render-video.yml` → Capricast).
The **I1 personal Energy Blueprint film** is a *different* pipeline (selfprime Worker →
Cloud Run `video-render-service`) — but it shares the failure-mode lesson worth cross-noting.

If a personal film renders silent or "only says Gate XX", the narration text arriving at the
render service is a stub. Root cause was in selfprime `workers/src/lib/llm-adapter.js`:
the metered LLM path is loaded via an indirect dynamic import that wrangler never bundles, so
**every** Worker LLM call used `callAnthropicFallback`, whose streaming SSE parser dropped
`data:` events split across network-chunk boundaries → truncated completion. Fixed by making
the fallback non-streaming (selfprime PR #351). The `video-render-service` already logs
`[render] <id> narrationText: N chars, M words` on every render — if that shows ~1 word, the
problem is upstream in selfprime narration, not the render service. Full write-up:
`docs/runbooks/lessons-learned.md` → "I1 Personal Blueprint Film — narration debugging".

## Training/Marketing Videos (Non-Capricast)

The `render-video.yml` workflow is not limited to Capricast news content. It can
produce training and marketing videos for any `app_id` by choosing the right
`composition_id` and `brief_key`.

### Prime Self example — MarketingVideo

```bash
gh workflow run render-video.yml \
  -f job_id=manual-$(date +%s) \
  -f composition_id=MarketingVideo \
  -f app_id=prime_self \
  -f brief_key=homepage-welcome \
  -f brand_color='#8B5CF6' \
  -f brand_accent='#10B981'
```

Produces a 15-second branded marketing video. Stream UID (2026-05-21 run):
`961578b45ca8e5ee39b461a426f58bac`.

### Training videos

Dispatch with `composition_id=TrainingVideo` and a `brief_key` from
`apps/video-studio/content-briefs/prime-self/`. Available briefs:

| brief_key | Stream UID (2026-05-21) |
|---|---|
| `energy-type-overview` | `d8048e55fd36f45e3e3b9a388a419245` |
| `blueprint-reading-guide` | `0030a44d55dab8fb35d05f6d1b0e896f` |
| `daily-transits-guide` | `bfbb4c772fff7bd8412367c979e79c41` |

### Gotcha: "Publish to Capricast" step always runs, always fails for non-Capricast content

The workflow has no `if: app_id == 'capricast'` guard on the publish and
PATCH steps. For manually dispatched prime-self (or any non-Capricast)
renders, two terminal steps will fail:

1. **POST `/api/admin/videos/import`** on Capricast — will 401 because
   `CAPRICAST_PUBLISH_TOKEN` is scoped to the Capricast worker, not to
   prime-self.
2. **PATCH schedule-worker job → `status=done`** — will 404/401 because the
   synthetic `job_id` (e.g. `manual-1716330000`) has no matching row in the
   schedule-worker DB.

**Both failures are expected and non-fatal for non-Capricast dispatches.**
The video is already fully uploaded to Cloudflare Stream by the time these
steps run. The Stream UID is emitted in the `render` step logs — grab it
there and record it in the relevant content brief JSON (set `status=published`
and `stream_uid=<uid>`).

Do NOT treat these two GHA step failures as a broken pipeline; they are
a known limitation of the single-workflow design.

## Related

- `apps/video-cron/src/index.ts` — dispatch source
- `apps/schedule-worker/src/index.ts` — PATCH endpoint shape
- `packages/schedule/` — `RenderJob` type and `scorePriority()`
- `packages/video/` — Cloudflare Stream + R2 wrappers
- `apps/video-studio/content-briefs/prime-self/` — prime-self brief library
