#!/usr/bin/env bash
# scripts/test-site.sh — invoke the Factory browser-agent against a URL.
#
# Usage:
#   scripts/test-site.sh <url>                       # scrape + screenshot
#   scripts/test-site.sh <url> audit                 # console + page errors
#   scripts/test-site.sh <url> scrape "h1,h2,button" # custom selectors (comma list)
#
# Auth: impersonates supervisor-sa@factory-495015.iam.gserviceaccount.com to
# mint an audience-scoped Cloud Run ID token. Requires
# roles/iam.serviceAccountTokenCreator on that SA.
#
# Output: writes the screenshot PNG to ${SCREENSHOT_DIR:-~/Documents/factory-screenshots}/
# and prints scrape/audit JSON to stdout (audit's screenshotBase64 is stripped to
# keep stdout manageable — the full payload is saved alongside the PNG).

set -euo pipefail

BROWSER_AGENT_URL="${BROWSER_AGENT_URL:-https://browser-agent-891842778224.us-central1.run.app}"
SUPERVISOR_SA="${SUPERVISOR_SA:-supervisor-sa@factory-495015.iam.gserviceaccount.com}"
SCREENSHOT_DIR="${SCREENSHOT_DIR:-$HOME/Documents/factory-screenshots}"

if [ "$#" -lt 1 ]; then
  echo "Usage: $0 <url> [scrape|screenshot|audit] [selectors]" >&2
  exit 1
fi

TARGET_URL="$1"
MODE="${2:-default}"
SELECTORS="${3:-h1,title,body}"

mkdir -p "$SCREENSHOT_DIR"

echo "→ Minting impersonated ID token for ${BROWSER_AGENT_URL}..."
ID_TOKEN=$(gcloud auth print-identity-token \
  --impersonate-service-account="${SUPERVISOR_SA}" \
  --audiences="${BROWSER_AGENT_URL}" | tr -d '\r\n')

if [ -z "$ID_TOKEN" ]; then
  echo "❌ Failed to mint token. Confirm you have roles/iam.serviceAccountTokenCreator on ${SUPERVISOR_SA}." >&2
  exit 1
fi

call_browser_agent() {
  local endpoint="$1"
  local body="$2"
  curl -sS -X POST \
    -H "Authorization: Bearer ${ID_TOKEN}" \
    -H 'Content-Type: application/json' \
    --data "${body}" \
    "${BROWSER_AGENT_URL}${endpoint}"
}

slugify_url() {
  echo "$1" | sed -E 's#^https?://##' | sed -E 's#[^a-zA-Z0-9]+#-#g' | sed -E 's#-+$##'
}

case "$MODE" in
  default|scrape)
    # Build a selectors JSON object from a comma-separated list.
    SEL_JSON=$(node -e "
      const list = process.argv[1].split(',').map((s) => s.trim()).filter(Boolean);
      const out = {};
      for (const s of list) out[s] = s;
      process.stdout.write(JSON.stringify(out));
    " -- "$SELECTORS")

    echo "→ POST /scrape ($TARGET_URL)"
    call_browser_agent /scrape "{\"url\":\"${TARGET_URL}\",\"selectors\":${SEL_JSON}}"
    echo

    if [ "$MODE" != "scrape" ]; then
      SLUG=$(slugify_url "$TARGET_URL")
      OUT="${SCREENSHOT_DIR}/${SLUG}-$(date +%Y%m%d-%H%M%S).png"
      echo "→ POST /screenshot ($TARGET_URL) → ${OUT}"
      python3 - "$OUT" <<PYEOF
import base64, json, os, sys, urllib.request
out_path = sys.argv[1]
url = os.environ['BROWSER_AGENT_URL'] + '/screenshot'
token = os.environ['ID_TOKEN']
body = json.dumps({'url': os.environ['TARGET_URL']}).encode()
req = urllib.request.Request(url, data=body, method='POST', headers={
    'Authorization': f'Bearer {token}',
    'Content-Type': 'application/json',
})
with urllib.request.urlopen(req, timeout=120) as r:
    payload = json.load(r)
with open(out_path, 'wb') as f:
    f.write(base64.b64decode(payload['dataBase64']))
print(f'saved: {out_path}')
PYEOF
    fi
    ;;
  audit)
    echo "→ POST /audit ($TARGET_URL)"
    SLUG=$(slugify_url "$TARGET_URL")
    PNG_OUT="${SCREENSHOT_DIR}/${SLUG}-audit-$(date +%Y%m%d-%H%M%S).png"
    JSON_OUT="${SCREENSHOT_DIR}/${SLUG}-audit-$(date +%Y%m%d-%H%M%S).json"
    BROWSER_AGENT_URL="$BROWSER_AGENT_URL" ID_TOKEN="$ID_TOKEN" TARGET_URL="$TARGET_URL" \
      python3 - "$PNG_OUT" "$JSON_OUT" <<PYEOF
import base64, json, os, sys, urllib.request
png_path, json_path = sys.argv[1], sys.argv[2]
url = os.environ['BROWSER_AGENT_URL'] + '/audit'
token = os.environ['ID_TOKEN']
body = json.dumps({'url': os.environ['TARGET_URL'], 'captureConsole': True}).encode()
req = urllib.request.Request(url, data=body, method='POST', headers={
    'Authorization': f'Bearer {token}',
    'Content-Type': 'application/json',
})
with urllib.request.urlopen(req, timeout=180) as r:
    payload = json.load(r)
png_b64 = payload.pop('screenshotBase64', '')
with open(png_path, 'wb') as f:
    f.write(base64.b64decode(png_b64))
with open(json_path, 'w') as f:
    json.dump(payload, f, indent=2)
print(json.dumps(payload, indent=2))
print(f'\nsaved screenshot: {png_path}')
print(f'saved audit JSON: {json_path}')
PYEOF
    ;;
  screenshot)
    SLUG=$(slugify_url "$TARGET_URL")
    OUT="${SCREENSHOT_DIR}/${SLUG}-$(date +%Y%m%d-%H%M%S).png"
    echo "→ POST /screenshot ($TARGET_URL) → ${OUT}"
    BROWSER_AGENT_URL="$BROWSER_AGENT_URL" ID_TOKEN="$ID_TOKEN" TARGET_URL="$TARGET_URL" \
      python3 - "$OUT" <<PYEOF
import base64, json, os, sys, urllib.request
out_path = sys.argv[1]
url = os.environ['BROWSER_AGENT_URL'] + '/screenshot'
token = os.environ['ID_TOKEN']
body = json.dumps({'url': os.environ['TARGET_URL']}).encode()
req = urllib.request.Request(url, data=body, method='POST', headers={
    'Authorization': f'Bearer {token}',
    'Content-Type': 'application/json',
})
with urllib.request.urlopen(req, timeout=120) as r:
    payload = json.load(r)
with open(out_path, 'wb') as f:
    f.write(base64.b64decode(payload['dataBase64']))
print(f'saved: {out_path}')
PYEOF
    ;;
  *)
    echo "Unknown mode: $MODE (use scrape | screenshot | audit | default)" >&2
    exit 1
    ;;
esac
