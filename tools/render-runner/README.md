# render-runner — billing-proof video render (Cloud Run Job)

Runs the Capricast scheduled-content render pipeline **off GitHub Actions**, as a
GCP Cloud Run Job. Same pipeline as `.github/workflows/render-video.yml` (same
scripts, same external APIs, same step order) — but GCP-billed, so a GitHub
Actions billing lock can no longer stop video production.

## Why this exists
`render-video.yml` is dispatched by `apps/video-cron` and runs on GitHub-hosted
runners. When the GitHub org account is billing-locked, every render fails to
start ("The job was not started because your account is locked due to a billing
issue") and no new videos are built. This runner is the independent fallback.

## Architecture
```
Cloud Scheduler (0 * * * *)
  → starts Cloud Run Job `render-runner` (POLL=1)
     → entrypoint.sh loads secrets from Secret Manager (runs as factory-sa)
     → GET schedule-worker /jobs/pending   (same queue the cron reads)
     → per job: generate-script → ElevenLabs → R2 → Remotion render
                → ffmpeg → R2 → CF Stream → publish-to-capricast
                → PATCH schedule-worker job = done | failed
```
The 9-package build chain + `apps/video-studio` deps + Remotion's headless
browser are baked into the image, so a Job execution only renders.

## Files
- `Dockerfile` — Node 24 + Chromium libs + ffmpeg + the built monorepo packages.
- `entrypoint.sh` — secret loader + single-job renderer + `POLL=1` queue drain.
- `deploy.sh` — `build` (Cloud Build → Artifact Registry), `job` (Cloud Run Job),
  `schedule` (hourly Cloud Scheduler), or `all`.
- `.dockerignore` — keeps the build context lean.

## Deploy
```bash
./deploy.sh build      # build + push image to us-central1 .../factory/render-runner
./deploy.sh job        # create/update the Cloud Run Job (POLL mode)
./deploy.sh schedule   # hourly trigger (run after a manual verify)
```

## Verify one render manually (single-job mode)
```bash
gcloud run jobs execute render-runner --region=us-central1 --project=factory-495015 \
  --update-env-vars="POLL=0,JOB_ID=manual-$(date +%s),COMPOSITION_ID=EnergyBlueprintVideo,APP_ID=prime_self,TOPIC=Your Free Energy Blueprint,FORGE_THEME=self" \
  --wait
```
Success = a new video appears at `https://capricast.com/watch/<stream_uid>`.

## Config
- **Project/region**: factory-495015 / us-central1 (matches the `factory` AR repo).
- **Identity**: runs as `factory-sa@factory-495015.iam.gserviceaccount.com`
  (already holds `roles/secretmanager.secretAccessor` for the render secrets).
- **Secrets**: read at runtime from Secret Manager (uppercase names, BOM-stripped),
  same set `render-video.yml` fetches.
- **Resources**: 8Gi / 4 vCPU, 1h task timeout — comfortable for Remotion.

## Relationship to GitHub Actions
This does **not** remove `render-video.yml`; it's a parallel, billing-independent
path. Run only one on a schedule at a time to avoid double-rendering the same
queued job (both read the same `schedule-worker /jobs/pending`). When GitHub
billing is healthy you can keep using Actions and leave this Job un-scheduled
(manual fallback), or schedule this and pause the `video-cron` dispatch.
