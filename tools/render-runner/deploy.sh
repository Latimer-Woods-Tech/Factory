#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# tools/render-runner/deploy.sh — build + deploy the billing-proof render
# runner as a Cloud Run Job on GCP (off GitHub Actions).
#
#   ./deploy.sh build     stage a lean context, build + push the image
#   ./deploy.sh job       create/update the Cloud Run Job (POLL mode)
#   ./deploy.sh schedule  create the hourly Cloud Scheduler trigger
#   ./deploy.sh all       build → job → schedule
#
# Requires: gcloud authenticated to factory-495015 with rights to Cloud Build,
# Artifact Registry, Cloud Run, and (for schedule) Cloud Scheduler.
# ---------------------------------------------------------------------------
set -euo pipefail
PROJECT=factory-495015
REGION=us-central1
IMAGE="${REGION}-docker.pkg.dev/${PROJECT}/factory/render-runner:latest"
SA="factory-sa@${PROJECT}.iam.gserviceaccount.com"
JOB=render-runner
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"

build() {
  local STAGE; STAGE="$(mktemp -d)"
  echo "staging lean build context → $STAGE"
  ( cd "$ROOT" && tar --exclude=node_modules --exclude=dist --exclude=.git \
      --exclude=coverage --exclude='*.log' -cf - \
      packages apps/video-studio scripts tools/render-runner ) | ( cd "$STAGE" && tar -xf - )
  cp "$ROOT/tools/render-runner/Dockerfile" "$STAGE/Dockerfile"
  cp "$ROOT/tools/render-runner/.dockerignore" "$STAGE/.dockerignore"
  echo "submitting to Cloud Build → $IMAGE"
  gcloud builds submit "$STAGE" --project="$PROJECT" --tag "$IMAGE" --timeout=2400s
  rm -rf "$STAGE"
}

job() {
  # POLL=1 → drains every pending schedule-worker job each execution.
  gcloud run jobs deploy "$JOB" \
    --project="$PROJECT" --region="$REGION" --image="$IMAGE" \
    --service-account="$SA" \
    --memory=8Gi --cpu=4 --task-timeout=3600 --max-retries=0 \
    --set-env-vars="POLL=1,GCP_PROJECT=${PROJECT}"
}

schedule() {
  gcloud services enable cloudscheduler.googleapis.com --project="$PROJECT"
  # Cloud Scheduler invokes the Run Admin API to start a Job execution hourly.
  gcloud scheduler jobs create http render-runner-hourly \
    --project="$PROJECT" --location="$REGION" --schedule="0 * * * *" \
    --uri="https://${REGION}-run.googleapis.com/apis/run.googleapis.com/v1/namespaces/${PROJECT}/jobs/${JOB}:run" \
    --http-method=POST \
    --oauth-service-account-email="$SA" \
    --oauth-token-scope="https://www.googleapis.com/auth/cloud-platform" \
    || gcloud scheduler jobs update http render-runner-hourly \
    --project="$PROJECT" --location="$REGION" --schedule="0 * * * *"
}

case "${1:-all}" in
  build) build ;;
  job) job ;;
  schedule) schedule ;;
  all) build && job && schedule ;;
  *) echo "usage: $0 {build|job|schedule|all}"; exit 1 ;;
esac
