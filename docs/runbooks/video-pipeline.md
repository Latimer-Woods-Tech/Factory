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
| `composition_id` | yes      | `MarketingVideo` / `TrainingVideo` / `WalkthroughVideo` |
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
| `AI_GATEWAY_BASE_URL`       | `AI_GATEWAY_BASE_URL`, `ai-gateway-base-url`          |

### New secrets that must be added

These two secrets are new to this PR and must be created in GCP Secret
Manager **before** any cron-dispatched render can succeed:

1. `CAPRICAST_PUBLISH_TOKEN` — Bearer token accepted by Capricast's
   `POST /api/admin/videos/import` endpoint. Issued by Capricast.
2. `CAPRICAST_SYSTEM_CREATOR_ID` — the Capricast user id under which
   automated renders should be attributed.

Create with:

```bash
gcloud secrets create CAPRICAST_PUBLISH_TOKEN \
  --project=factory-495015 \
  --data-file=- < /path/to/token.txt
gcloud secrets create CAPRICAST_SYSTEM_CREATOR_ID \
  --project=factory-495015 \
  --data-file=- < /path/to/creator-id.txt
```

Grant the WIF service account access:

```bash
gcloud secrets add-iam-policy-binding CAPRICAST_PUBLISH_TOKEN \
  --project=factory-495015 \
  --member='serviceAccount:factory-sa@factory-495015.iam.gserviceaccount.com' \
  --role='roles/secretmanager.secretAccessor'
gcloud secrets add-iam-policy-binding CAPRICAST_SYSTEM_CREATOR_ID \
  --project=factory-495015 \
  --member='serviceAccount:factory-sa@factory-495015.iam.gserviceaccount.com' \
  --role='roles/secretmanager.secretAccessor'
```

Until both exist, the "Fetch secrets from GCP Secret Manager" step will log
a warning and leave the env vars unset; the Capricast publish step will
exit non-zero and the on-failure handler will mark the schedule-worker job
as `failed`. The render itself (steps 1–9) will still complete.

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
# Stream playback URL (use the streamUid returned by the workflow)
curl -I "https://customer-${CF_STREAM_CUSTOMER_DOMAIN}.cloudflarestream.com/${STREAM_UID}/manifest/video.m3u8"
# Expect: HTTP/2 200

# Capricast public watch URL (use the id returned by publish-to-capricast)
curl -I "https://capricast.com/v/${CAPRICAST_ID}"
# Expect: HTTP/2 200 (or 302 to the same)
```

## Troubleshooting

- **Workflow never starts.** Check the cron worker logs:
  `wrangler tail video-cron --env production`. The dispatch step expects a
  GitHub App token with `actions:write` on Factory.
- **`Fetch secrets` warns about missing secrets.** Either the secret
  doesn't exist in GCP Secret Manager, or the factory WIF service account
  lacks `secretmanager.secretAccessor` on it. Diagnose with
  `gcloud secrets list --project=factory-495015 | grep -i capricast`.
- **ElevenLabs returns 401.** Voice id is per-account; confirm the API
  key and voice ids match.
- **Stream poll times out at `queued`.** Stream's `copy` endpoint sometimes
  takes longer for the first render of a new R2 video. Increase the poll
  cap from 10 minutes if needed.
- **Capricast 409 `DuplicateStreamUid`.** Expected when the workflow
  re-runs for the same `streamUid`. Treated as success.
- **schedule-worker PATCH returns 401.** `WORKER_API_TOKEN` doesn't match
  the schedule-worker's configured bearer.

## Related

- `apps/video-cron/src/index.ts` — dispatch source
- `apps/schedule-worker/src/index.ts` — PATCH endpoint shape
- `packages/schedule/` — `RenderJob` type and `scorePriority()`
- `packages/video/` — Cloudflare Stream + R2 wrappers
