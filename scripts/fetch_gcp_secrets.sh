#!/usr/bin/env bash
# fetch_gcp_secrets.sh — pull secrets from GCP Secret Manager into $GITHUB_ENV.
#
# Usage (inside a GitHub Actions step, after google-github-actions/auth@v3):
#
#   source scripts/fetch_gcp_secrets.sh
#   fetch_to_env PUSHOVER_USER         pushover-user PUSHOVER_USER pushover_user
#   fetch_to_env PUSHOVER_TOKEN        pushover-token PUSHOVER_TOKEN pushover_token
#   fetch_to_env ANTHROPIC_ADMIN_KEY   anthropic-admin-key anthropic-api-key
#
# Each call tries each candidate secret name in GCP Secret Manager and uses
# the first one that exists. Missing → logged warning, env var stays unset
# (the downstream script handles missing creds gracefully).
#
# Requires:
#   - gcloud authenticated to the right GCP project (google-github-actions/auth@v3)
#   - The active service account has roles/secretmanager.secretAccessor

set -euo pipefail

fetch_to_env() {
  local target_env="$1"
  shift
  local name
  for name in "$@"; do
    if value=$(gcloud secrets versions access latest --secret="$name" --quiet 2>/dev/null); then
      # Mask the value in workflow logs.
      echo "::add-mask::$value"
      # Emit to $GITHUB_ENV (heredoc-safe for multi-line values).
      {
        printf '%s<<__LWT_SECRET_EOF__\n' "$target_env"
        printf '%s\n' "$value"
        printf '__LWT_SECRET_EOF__\n'
      } >> "${GITHUB_ENV:-/dev/stdout}"
      echo "✅ $target_env ← $name"
      return 0
    fi
  done
  echo "⚠️  $target_env not found in GCP Secret Manager (tried: $*)"
  return 0  # never fail the workflow on a missing secret; let the script decide
}
