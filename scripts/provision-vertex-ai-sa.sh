#!/usr/bin/env bash
# scripts/provision-vertex-ai-sa.sh
#
# SUP-1.2 — Enable Vertex AI API + mint supervisor-sa on factory-495015
#
# Run these commands as Adrian (or Sauna if proxy auth path is fixed) against the
# factory-495015 GCP project.  Steps match the issue acceptance criteria exactly.
#
# Prerequisites:
#   gcloud CLI installed and authenticated:
#     gcloud auth login
#     gcloud config set project factory-495015
#   GitHub CLI installed and authenticated:
#     gh auth login   (must have org-secret write scope)
#
# Usage:
#   bash scripts/provision-vertex-ai-sa.sh
#   # Or dry-run (prints commands, does not execute):
#   DRY_RUN=1 bash scripts/provision-vertex-ai-sa.sh
#
# After this script completes, run the GitHub Actions workflow to verify:
#   gh workflow run verify-vertex-ai.yml

set -euo pipefail

PROJECT="factory-495015"
SA_NAME="supervisor-sa"
SA_EMAIL="${SA_NAME}@${PROJECT}.iam.gserviceaccount.com"
KEY_FILE="/tmp/supervisor-sa-key.json"
SECRET_NAME="SUPERVISOR_VERTEX_SA_KEY"
GH_ORG="Latimer-Woods-Tech"

DRY_RUN="${DRY_RUN:-0}"

# Verify shred is available before we proceed — we require secure deletion.
if ! command -v shred &>/dev/null; then
  echo "ERROR: 'shred' is not available on this system." >&2
  echo "       Install it (e.g. 'brew install coreutils' on macOS) before running this script." >&2
  exit 1
fi

run() {
  if [ "$DRY_RUN" = "1" ]; then
    echo "[DRY RUN] $*"
  else
    echo "+ $*"
    "$@"
  fi
}

echo "=== SUP-1.2: Enable Vertex AI API + mint supervisor-sa ==="
echo "Project : $PROJECT"
echo "SA      : $SA_EMAIL"
echo "Secret  : $GH_ORG org secret → $SECRET_NAME"
echo ""

# Step 1 — Enable aiplatform.googleapis.com
echo "--- Step 1: Enable Vertex AI API ---"
run gcloud services enable aiplatform.googleapis.com --project="$PROJECT"

# Step 2 — Create the service account (idempotent — will error if it already exists,
# which is fine; the remaining steps handle that gracefully via --condition=None).
echo ""
echo "--- Step 2: Create service account $SA_NAME ---"
run gcloud iam service-accounts create "$SA_NAME" \
  --project="$PROJECT" \
  --display-name="Supervisor Vertex AI service account" \
  --description="Least-privilege SA for supervisor planner Gemini fallback. See docs/supervisor/ARCHITECTURE.md §6." \
  || echo "  (SA may already exist — continuing)"

# Step 3 — Grant roles/aiplatform.user ONLY (least privilege per SUP-1.2 spec)
echo ""
echo "--- Step 3: Grant roles/aiplatform.user to $SA_EMAIL ---"
run gcloud projects add-iam-policy-binding "$PROJECT" \
  --member="serviceAccount:${SA_EMAIL}" \
  --role="roles/aiplatform.user" \
  --condition=None

# Step 4 — Mint a JSON key and store as org secret
echo ""
echo "--- Step 4: Mint JSON key → $KEY_FILE ---"
run gcloud iam service-accounts keys create "$KEY_FILE" \
  --iam-account="$SA_EMAIL" \
  --project="$PROJECT"

echo ""
echo "--- Step 4b: Store key as org secret $SECRET_NAME ---"
# Visibility set to 'all' so the factory repo (supervisor worker) and any future
# repos that need Vertex AI can read it without an extra permission change.
# If you prefer tighter scoping, replace '--visibility all' with
# '--repos Latimer-Woods-Tech/factory' (factory monorepo only).
if [ "$DRY_RUN" = "1" ]; then
  echo "[DRY RUN] gh secret set $SECRET_NAME --org $GH_ORG --visibility all --body \"\$(cat $KEY_FILE)\""
else
  gh secret set "$SECRET_NAME" \
    --org "$GH_ORG" \
    --visibility all \
    --body "$(cat "$KEY_FILE")"
  echo "  Org secret $SECRET_NAME set."
fi

# Immediately shred the local copy — secret is now in GitHub
echo ""
echo "--- Shredding local key file ---"
run shred -uz "$KEY_FILE"

echo ""
echo "=== Done ==="
echo ""
echo "Next step — run the verification workflow to prove end-to-end connectivity:"
echo "  gh workflow run verify-vertex-ai.yml --repo ${GH_ORG}/factory"
echo ""
echo "Or open: https://github.com/${GH_ORG}/factory/actions/workflows/verify-vertex-ai.yml"
