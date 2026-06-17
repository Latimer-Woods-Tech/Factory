#!/usr/bin/env bash
# =============================================================================
# Claude Code SessionStart hook — GCP Secret Manager connectivity check.
#
# Prints a green ✅ or red ❌ banner at the start of every web session so you
# know immediately whether GCP secrets are reachable before any work begins.
#
# Requires:
#   GCP_SA_KEY — base64-encoded service-account JSON (set in env config at
#                code.claude.com → environment settings → Environment Variables)
#
# Setup:
#   Add to .claude/settings.json under hooks.SessionStart (already done if you
#   see this banner). The script is fail-open: if node/curl are missing it
#   warns and exits 0 so the session still starts.
# =============================================================================
set -euo pipefail

PROJECT="factory-495015"
# Resolve the gcp-token.mjs helper relative to this script's location
# (scripts/claude-hooks/ → scripts/) so it works in fresh web containers
# regardless of cwd, instead of assuming a populated ~/.claude/scripts.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Fail-open guards
if ! command -v node >/dev/null 2>&1; then
  echo "⚠️  GCP verify: node not found — skipping check." >&2
  exit 0
fi
if ! command -v curl >/dev/null 2>&1; then
  echo "⚠️  GCP verify: curl not found — skipping check." >&2
  exit 0
fi

if [ -z "${GCP_SA_KEY:-}" ]; then
  echo ""
  echo "┌─────────────────────────────────────────────────────────────────────┐"
  echo "│ ⚠️  GCP_SA_KEY not set — Secret Manager unreachable this session.   │"
  echo "│    Add GCP_SA_KEY (base64 SA JSON) in the environment settings at   │"
  echo "│    code.claude.com, then start a new session.                       │"
  echo "└─────────────────────────────────────────────────────────────────────┘"
  echo ""
  exit 0
fi

TOKEN="$(node "$ROOT/gcp-token.mjs" 2>&1)" || {
  echo ""
  echo "┌─────────────────────────────────────────────────────────────────────┐"
  echo "│ ❌ GCP token exchange failed.                                        │"
  echo "│    Check that GCP_SA_KEY is a valid base64-encoded SA JSON key.     │"
  echo "│    Error: $TOKEN"
  echo "└─────────────────────────────────────────────────────────────────────┘"
  echo ""
  exit 0
}

# Access a specific known secret version — requires only secretAccessor, not viewer.
# secrets.list (pageSize=1) requires secretmanager.viewer and caused false 403s.
PROBE_SECRET="CAPRICAST_STAGING_APP_URL"
HTTP_STATUS="$(curl -s -o /dev/null -w "%{http_code}" \
  -H "Authorization: Bearer $TOKEN" \
  "https://secretmanager.googleapis.com/v1/projects/${PROJECT}/secrets/${PROBE_SECRET}/versions/latest:access")"

echo ""
if [ "$HTTP_STATUS" = "200" ]; then
  echo "┌─────────────────────────────────────────────────────────────────────┐"
  echo "│ ✅ GCP Secret Manager reachable (project: ${PROJECT})     │"
  echo "│    Tokens are refreshed automatically — no manual steps needed.    │"
  echo "└─────────────────────────────────────────────────────────────────────┘"
else
  echo "┌─────────────────────────────────────────────────────────────────────┐"
  echo "│ ❌ GCP Secret Manager returned HTTP ${HTTP_STATUS} (project: ${PROJECT})  │"
  echo "│    The SA key decoded fine but the API call was rejected.           │"
  echo "│    Check: roles/secretmanager.secretAccessor on the SA.            │"
  echo "└─────────────────────────────────────────────────────────────────────┘"
fi
echo ""

exit 0
