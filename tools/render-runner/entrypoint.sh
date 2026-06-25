#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# tools/render-runner/entrypoint.sh
#
# Billing-proof render runner — runs the Capricast scheduled-content render
# pipeline OUTSIDE GitHub Actions, as a Cloud Run Job on GCP. It is a faithful
# port of the `render` job in .github/workflows/render-video.yml: same scripts,
# same external APIs, same step order. The only differences:
#   - secrets are read from GCP Secret Manager via the Cloud Run service
#     account's ambient token (metadata server) instead of WIF + GITHUB_ENV,
#   - step outputs are plain shell variables instead of $GITHUB_OUTPUT,
#   - the package build chain runs at image-build time (see Dockerfile), and
#   - a poll loop pulls jobs from schedule-worker instead of GitHub dispatch.
#
# Modes:
#   POLL=1            drain every pending schedule-worker job (cron default)
#   (POLL unset)      render a single job from JOB_ID/COMPOSITION_ID/... env
#                     (used for the first manual end-to-end verification)
# ---------------------------------------------------------------------------
set -uo pipefail

PROJECT="${GCP_PROJECT:-factory-495015}"
REPO_ROOT="${REPO_ROOT:-/app}"
APP_ID_DEFAULT="${APP_ID:-prime_self}"

log() { printf '[render-runner] %s\n' "$*"; }
die() { printf '[render-runner][FATAL] %s\n' "$*" >&2; exit 1; }

# ── Secret loader (metadata server → Secret Manager REST; BOM-stripped) ──────
_meta_token() {
  curl -sf -H 'Metadata-Flavor: Google' \
    'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token' \
    | jq -r '.access_token'
}
SM_TOKEN=""
load_secret() {
  # load_secret VAR NAME1 [NAME2 ...] — first existing secret wins.
  local target="$1"; shift
  [ -z "$SM_TOKEN" ] && SM_TOKEN="$(_meta_token)"
  local name b64 val
  for name in "$@"; do
    b64=$(curl -sf -H "Authorization: Bearer $SM_TOKEN" \
      "https://secretmanager.googleapis.com/v1/projects/${PROJECT}/secrets/${name}/versions/latest:access" \
      | jq -r '.payload.data // empty')
    if [ -n "$b64" ]; then
      val=$(printf '%s' "$b64" | base64 -d | sed $'1s/^\xEF\xBB\xBF//' | sed -E 's/[[:space:]]+$//')
      export "$target=$val"
      log "secret ✓ $target ← $name"
      return 0
    fi
  done
  log "secret ⚠ $target not found (tried: $*)"
  return 0
}

load_all_secrets() {
  log "loading secrets from Secret Manager (project=$PROJECT) …"
  load_secret ANTHROPIC_API_KEY            ANTHROPIC_API_KEY anthropic-api-key
  load_secret GROQ_API_KEY                 GROQ_API_KEY groq-api-key
  load_secret ELEVENLABS_API_KEY           ELEVENLABS_API_KEY elevenlabs-api-key
  load_secret ELEVENLABS_VOICE_PRIME_SELF  ELEVENLABS_VOICE_PRIME_SELF elevenlabs-voice-prime-self
  load_secret ELEVENLABS_VOICE_CYPHER      ELEVENLABS_VOICE_CYPHER elevenlabs-voice-cypher
  load_secret ELEVENLABS_VOICE_DEFAULT     ELEVENLABS_VOICE_DEFAULT elevenlabs-voice-default
  load_secret CF_ACCOUNT_ID                CF_ACCOUNT_ID CLOUDFLARE_ACCOUNT_ID
  load_secret CF_API_TOKEN                 CF_API_TOKEN CLOUDFLARE_API_TOKEN cloudflare-api-token
  load_secret CF_STREAM_TOKEN              CF_STREAM_TOKEN cf-stream-token
  load_secret CF_STREAM_CUSTOMER_DOMAIN    CF_STREAM_CUSTOMER_DOMAIN cf-stream-customer-domain
  load_secret R2_ACCESS_KEY_ID             R2_ACCESS_KEY_ID r2-access-key-id
  load_secret R2_SECRET_ACCESS_KEY         R2_SECRET_ACCESS_KEY r2-secret-access-key
  load_secret R2_BUCKET_NAME               R2_BUCKET_NAME r2-bucket-name
  load_secret R2_PUBLIC_DOMAIN             R2_PUBLIC_DOMAIN r2-public-domain
  load_secret SCHEDULE_WORKER_URL          SCHEDULE_WORKER_URL schedule-worker-url
  load_secret WORKER_API_TOKEN             WORKER_API_TOKEN worker-api-token
  load_secret CAPRICAST_PUBLISH_TOKEN      CAPRICAST_PUBLISH_TOKEN capricast-publish-token
  load_secret RENDER_SERVICE_TOKEN         RENDER_SERVICE_TOKEN render-service-token
  load_secret CAPRICAST_SYSTEM_CREATOR_ID  CAPRICAST_SYSTEM_CREATOR_ID capricast-system-creator-id
  load_secret AI_GATEWAY_BASE_URL          AI_GATEWAY_URL AI_GATEWAY_BASE_URL ai-gateway-base-url ai-gateway-url
}

# ── Render a single job ─────────────────────────────────────────────────────
# Args via env: JOB_ID COMPOSITION_ID APP_ID TOPIC [BRIEF_KEY BRAND_COLOR
#   BRAND_ACCENT LOGO_URL FORGE_THEME HD_TYPE SIGNATURE_GATES]
render_one() {
  local JOB_ID="${1:?job_id}" COMPOSITION_ID="${2:?composition}" APP_ID="${3:?app}" TOPIC="${4:?topic}"
  local BRIEF_KEY="${5:-}" BRAND_COLOR="${6:-#6366f1}" BRAND_ACCENT="${7:-#a5b4fc}" LOGO_URL="${8:-}"
  local FORGE_THEME="${9:-self}" HD_TYPE="${10:-}" SIGNATURE_GATES="${11:-[]}"
  log "── render job=$JOB_ID composition=$COMPOSITION_ID app=$APP_ID topic='$TOPIC'"

  # Route the flat content compositions through the cinematic hero composition
  # (forge atmosphere + body graph + kinetic arc). The MarketingVideo/TrainingVideo
  # compositions are static text-on-gradient and not worth shipping. Walkthrough
  # keeps its own composition (it shows real product screenshots).
  case "$COMPOSITION_ID" in
    MarketingVideo|TrainingVideo)
      log "  routing $COMPOSITION_ID → EnergyBlueprintVideo (cinematic)"
      COMPOSITION_ID=EnergyBlueprintVideo ;;
  esac

  cd "$REPO_ROOT"

  # Step 1 — resolve ElevenLabs voice id
  local VOICE_ID
  case "$APP_ID" in
    prime_self) VOICE_ID="$ELEVENLABS_VOICE_PRIME_SELF" ;;
    cypher)     VOICE_ID="$ELEVENLABS_VOICE_CYPHER" ;;
    *)          VOICE_ID="$ELEVENLABS_VOICE_DEFAULT" ;;
  esac
  [ -n "${VOICE_ID:-}" ] || { log "no voice id for app=$APP_ID"; return 1; }

  # Step 2 — resolve content brief (optional named brief under content-briefs/)
  local brief_dir="apps/video-studio/content-briefs/${APP_ID//_/-}"
  local script_override='' key_points='[]' forbidden='[]' screenshot_urls='[]'
  local steps='[]' visual_beats='[]' duration_seconds='' learning_goal='' tone_notes=''
  local brief_json="$brief_dir/$BRIEF_KEY.json"
  if [ -n "$BRIEF_KEY" ] && [ -f "$brief_json" ]; then
    TOPIC="$(jq -r '.topic // empty' "$brief_json")"
    [ -n "$(jq -r '.brandColor // empty' "$brief_json")" ] && BRAND_COLOR="$(jq -r '.brandColor' "$brief_json")"
    [ -n "$(jq -r '.brandAccent // empty' "$brief_json")" ] && BRAND_ACCENT="$(jq -r '.brandAccent' "$brief_json")"
    learning_goal="$(jq -r '.learningGoal // empty' "$brief_json")"
    tone_notes="$(jq -r '.toneNotes // empty' "$brief_json")"
    script_override="$(jq -r '.script // empty' "$brief_json")"
    key_points="$(jq -c '.keyPoints // []' "$brief_json")"
    forbidden="$(jq -c '.forbiddenClaims // []' "$brief_json")"
    screenshot_urls="$(jq -c '.screenshotUrls // []' "$brief_json")"
    steps="$(jq -c '.renderPlan.steps // .steps // []' "$brief_json")"
    visual_beats="$(jq -c '.renderPlan.visualBeats // .visualBeats // []' "$brief_json")"
    duration_seconds="$(jq -r '.renderPlan.durationSeconds // .durationSeconds // empty' "$brief_json")"
  fi
  [ -n "$TOPIC" ] || { log "empty topic after brief resolution"; return 1; }

  # Step 3 — generate LLM script (headline + narration) → /tmp/script.env
  local HEADLINE NARRATION
  if [ -n "$script_override" ]; then
    HEADLINE="$TOPIC"; NARRATION="$script_override"
  else
    local sys_ctx="You are generating narration for a Factory application video."
    [ -f "$brief_dir/SYSTEM_CONTEXT.md" ] && sys_ctx="$(cat "$brief_dir/SYSTEM_CONTEXT.md")"
    export SYSTEM_CONTEXT="$sys_ctx" COMPOSITION_TYPE="$COMPOSITION_ID" RESOLVED_TOPIC="$TOPIC" APP_ID="$APP_ID"
    export BRIEF_LEARNING_GOAL="$learning_goal" BRIEF_KEY_POINTS="$key_points"
    export BRIEF_FORBIDDEN_CLAIMS="$forbidden" BRIEF_TONE_NOTES="$tone_notes" BRIEF_STEPS="$steps"
    export TONE_BLOCK="$tone_notes"
    [ "$key_points" = '[]' ] && export KEY_POINTS_BLOCK="" || export KEY_POINTS_BLOCK="$(echo "$key_points" | jq -r '.[]' | sed 's/^/- /')"
    [ "$forbidden" = '[]' ] && export FORBIDDEN_BLOCK="" || export FORBIDDEN_BLOCK="$(echo "$forbidden" | jq -r '.[]' | sed 's/^/- /')"
    export GITHUB_OUTPUT=/tmp/script.out; : > "$GITHUB_OUTPUT"
    node apps/video-studio/scripts/generate-script.mjs || { log "generate-script failed"; return 1; }
    HEADLINE="$(_read_out headline /tmp/script.out)"
    NARRATION="$(_read_out narration /tmp/script.out)"
    local out_steps; out_steps="$(_read_out steps /tmp/script.out)"; [ -n "$out_steps" ] && steps="$out_steps"
  fi
  [ -n "$NARRATION" ] || { log "no narration produced"; return 1; }

  # Step 4 — ElevenLabs narration MP3
  jq -n --arg text "$NARRATION" '{text:$text, model_id:"eleven_multilingual_v2", voice_settings:{stability:0.5, similarity_boost:0.75}}' > /tmp/eleven.json
  local code
  code=$(curl -sS -w '%{http_code}' -o /tmp/narration.mp3 \
    -X POST "https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}" \
    -H "xi-api-key: ${ELEVENLABS_API_KEY}" -H 'accept: audio/mpeg' -H 'content-type: application/json' \
    --data @/tmp/eleven.json)
  [ "$code" = "200" ] || { log "ElevenLabs HTTP $code"; return 1; }

  # Step 5 — upload narration to R2
  export AWS_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID" AWS_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY" AWS_DEFAULT_REGION="auto"
  local ENDPOINT="https://${CF_ACCOUNT_ID}.r2.cloudflarestorage.com"
  aws s3 cp /tmp/narration.mp3 "s3://${R2_BUCKET_NAME}/narrations/${JOB_ID}.mp3" --endpoint-url "$ENDPOINT" --content-type audio/mpeg || return 1
  local NARRATION_URL="https://${R2_PUBLIC_DOMAIN}/narrations/${JOB_ID}.mp3"

  # Step 5.5 — ElevenLabs Music (modal bed, R2-cached by musical mode)
  # generate-music.mjs derives the mode from SIGNATURE_GATES via the Atom Registry
  # center→mode map, then checks R2 before calling ElevenLabs. Falls back to the
  # pre-recorded sybil forge bed if generation fails.
  local MUSIC_URL
  MUSIC_URL=$(SIGNATURE_GATES="${SIGNATURE_GATES:-[]}" FORGE_THEME="${FORGE_THEME:-self}" \
    node apps/video-studio/scripts/generate-music.mjs 2>/tmp/music.log) \
    || { log "generate-music failed: $(tail -1 /tmp/music.log 2>/dev/null)"; \
         MUSIC_URL="https://${R2_PUBLIC_DOMAIN}/sybil-music/forge/${FORGE_THEME:-self}.mp3"; }
  log "music_url=$MUSIC_URL"

  # Step 6 — build Remotion props + render MP4
  # For EnergyBlueprintVideo: derive-blueprint-props.mjs builds a thematic scene
  # arc from BRIEF_KEY (gate-concept-N, authority-concept-X, type-welcome-T, etc.)
  # so the body graph lights up the specific element the video is about.
  # Other compositions use the inline jq schema.
  printf '%s' "${screenshot_urls:-[]}" > /tmp/screenshot-urls.json
  printf '%s' "${steps:-[]}" > /tmp/render-steps.json
  printf '%s' "${visual_beats:-[]}" > /tmp/visual-beats.json
  printf '%s' "${SIGNATURE_GATES:-[]}" > /tmp/signature-gates.json
  local PROPS
  if [ "$COMPOSITION_ID" = "EnergyBlueprintVideo" ]; then
    PROPS=$(BRIEF_KEY="${BRIEF_KEY:-}" TOPIC="$TOPIC" SCRIPT="$NARRATION" \
      NARRATION_URL="$NARRATION_URL" BRAND_COLOR="$BRAND_COLOR" \
      BRAND_ACCENT="$BRAND_ACCENT" LOGO_URL="${LOGO_URL:-}" \
      FORGE_THEME="${FORGE_THEME:-self}" HD_TYPE="${HD_TYPE:-}" \
      MUSIC_URL="$MUSIC_URL" MUSIC_VOLUME="${MUSIC_VOLUME:-0.16}" APP_ID="$APP_ID" \
      node apps/video-studio/scripts/derive-blueprint-props.mjs) \
      || { log "derive-blueprint-props failed"; return 1; }
  else
    PROPS=$(jq -n \
      --arg composition "$COMPOSITION_ID" --arg appId "$APP_ID" --arg topic "$TOPIC" \
      --arg script "$NARRATION" --arg narrationUrl "$NARRATION_URL" \
      --arg brandColor "$BRAND_COLOR" --arg brandAccent "$BRAND_ACCENT" --arg logoUrl "$LOGO_URL" \
      --slurpfile screenshotUrls /tmp/screenshot-urls.json --slurpfile steps /tmp/render-steps.json \
      --slurpfile visualBeats /tmp/visual-beats.json --arg durationSeconds "${duration_seconds:-}" \
      --arg forgeTheme "$FORGE_THEME" --arg hdType "$HD_TYPE" --slurpfile signatureGates /tmp/signature-gates.json \
      --arg musicUrl "$MUSIC_URL" \
      'if $composition=="WalkthroughVideo" then {appId:$appId,topic:$topic,script:$script,narrationUrl:$narrationUrl,musicUrl:$musicUrl,brandColor:$brandColor,brandAccent:$brandAccent,logoUrl:$logoUrl,screenshotUrls:$screenshotUrls[0]}
       elif $composition=="TrainingVideo" then {appId:$appId,topic:$topic,script:$script,narrationUrl:$narrationUrl,musicUrl:$musicUrl,brandColor:$brandColor,brandAccent:$brandAccent,logoUrl:$logoUrl,steps:$steps[0],durationSeconds:($durationSeconds|if .=="" then 30 else tonumber end)}
       elif $composition=="MarketingVideo" then {appId:$appId,topic:$topic,script:$script,narrationUrl:$narrationUrl,musicUrl:$musicUrl,brandColor:$brandColor,brandAccent:$brandAccent,logoUrl:$logoUrl,visualBeats:$visualBeats[0],durationSeconds:($durationSeconds|if .=="" then 15 else tonumber end)}
       else {appId:$appId,topic:$topic,script:$script,narrationUrl:$narrationUrl,musicUrl:$musicUrl,brandColor:$brandColor,brandAccent:$brandAccent,logoUrl:$logoUrl} end')
  fi
  ( cd apps/video-studio && node -r ts-node/register src/render.ts --composition "$COMPOSITION_ID" --props "$PROPS" --output /tmp/output.mp4 ) || { log "Remotion render failed"; return 1; }

  # Step 7 — ffmpeg re-encode (H.264 baseline + AAC)
  ffmpeg -y -i /tmp/output.mp4 -c:v libx264 -profile:v baseline -level 3.0 -pix_fmt yuv420p -c:a aac -b:a 128k /tmp/output-final.mp4 || return 1

  # Step 8 — upload MP4 to R2
  aws s3 cp /tmp/output-final.mp4 "s3://${R2_BUCKET_NAME}/videos/${JOB_ID}.mp4" --endpoint-url "$ENDPOINT" --content-type video/mp4 || return 1
  local VIDEO_URL="https://${R2_PUBLIC_DOMAIN}/videos/${JOB_ID}.mp4"

  # Step 9 — Cloudflare Stream copy + poll until ready
  local REQ RESP STREAM_UID STATE DURATION
  REQ=$(jq -n --arg url "$VIDEO_URL" --arg name "$TOPIC" --arg appId "$APP_ID" '{url:$url, meta:{name:$name, appId:$appId}}')
  RESP=$(curl -sS -X POST "https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/stream/copy" \
    -H "Authorization: Bearer ${CF_STREAM_TOKEN}" -H 'Content-Type: application/json' --data "$REQ")
  STREAM_UID=$(echo "$RESP" | jq -r '.result.uid // empty')
  [ -n "$STREAM_UID" ] || { log "stream copy returned no uid: $RESP"; return 1; }
  for i in $(seq 1 60); do
    STATE=$(curl -sS "https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/stream/${STREAM_UID}" -H "Authorization: Bearer ${CF_STREAM_TOKEN}" | jq -r '.result.status.state // "unknown"')
    log "[$i/60] stream state: $STATE"
    [ "$STATE" = "ready" ] && break
    [ "$STATE" = "error" ] && { log "stream encoding error"; return 1; }
    sleep 10
  done
  [ "$STATE" = "ready" ] || { log "stream not ready in time (last=$STATE)"; return 1; }
  DURATION=$(curl -sS "https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/stream/${STREAM_UID}" -H "Authorization: Bearer ${CF_STREAM_TOKEN}" | jq -r '.result.duration // 0')
  local THUMB_URL="https://customer-${CF_STREAM_CUSTOMER_DOMAIN}.cloudflarestream.com/${STREAM_UID}/thumbnails/thumbnail.jpg"

  # Step 10 — publish to Capricast
  export STREAM_UID DURATION_SECONDS="$DURATION" THUMBNAIL_URL="$THUMB_URL" TITLE="$HEADLINE" \
    DESCRIPTION="$TOPIC" TRANSCRIPT="$NARRATION" TRANSCRIPT_LANGUAGE="en" \
    CAPRICAST_API_URL="https://api.capricast.com" CAPRICAST_CREATOR_ID="$CAPRICAST_SYSTEM_CREATOR_ID"
  local PUB_OUT
  PUB_OUT=$(node apps/video-studio/scripts/publish-to-capricast.mjs 2>&1) || { log "capricast publish failed: $PUB_OUT"; return 1; }
  printf '%s\n' "$PUB_OUT"
  # The real watch URL uses Capricast's own video id (from the publish output),
  # not the Stream uid. Fall back to the stream-based URL only if not found.
  local CAPRI_URL
  CAPRI_URL=$(printf '%s' "$PUB_OUT" | grep -oE 'https://capricast\.com/watch/[A-Za-z0-9-]+' | head -1)
  [ -n "$CAPRI_URL" ] || CAPRI_URL="https://capricast.com/watch/${STREAM_UID}"

  # Step 11 — PATCH schedule-worker job → done
  local BODY
  BODY=$(jq -n --arg s "$STREAM_UID" --arg v "$CAPRI_URL" '{status:"done", streamUid:$s, videoUrl:$v}')
  curl -sS -X PATCH "${SCHEDULE_WORKER_URL}/jobs/${JOB_ID}" -H "Authorization: Bearer ${WORKER_API_TOKEN}" -H 'Content-Type: application/json' --data "$BODY" >/dev/null || true
  log "✅ job $JOB_ID done — stream_uid=$STREAM_UID"
  return 0
}

# Read a key from a GitHub-Actions-style $GITHUB_OUTPUT file (supports key=val and key<<EOF blocks).
_read_out() {
  local key="$1" file="$2"
  awk -v k="$key" '
    $0 ~ "^"k"<<" { d=substr($0,index($0,"<<")+2); inblk=1; next }
    inblk && $0==d { inblk=0; next }
    inblk { print; next }
    $0 ~ "^"k"=" { print substr($0, length(k)+2) }
  ' "$file"
}

mark_failed() {
  local job_id="$1" reason="${2:-render-runner failure}"
  [ -n "${SCHEDULE_WORKER_URL:-}" ] && [ -n "${WORKER_API_TOKEN:-}" ] || return 0
  curl -sS -X PATCH "${SCHEDULE_WORKER_URL}/jobs/${job_id}" \
    -H "Authorization: Bearer ${WORKER_API_TOKEN}" -H 'Content-Type: application/json' \
    --data "$(jq -n --arg e "$reason" '{status:"failed", script:$e}')" >/dev/null || true
}

# ── Main ────────────────────────────────────────────────────────────────────
load_all_secrets

if [ "${POLL:-0}" = "1" ]; then
  log "POLL mode — draining pending jobs from schedule-worker"
  PENDING=$(curl -sS "${SCHEDULE_WORKER_URL}/jobs/pending?limit=${POLL_LIMIT:-10}" -H "Authorization: Bearer ${WORKER_API_TOKEN}")
  COUNT=$(echo "$PENDING" | jq -r '(.data // .jobs // []) | length')
  log "pending jobs: ${COUNT:-0}"
  [ "${COUNT:-0}" -eq 0 ] && { log "nothing to render"; exit 0; }
  # Read jobs into an array (NOT a `while read` pipe): render_one runs node/curl
  # which consume the loop's piped stdin and would end it after one iteration.
  mapfile -t JOBS < <(echo "$PENDING" | jq -c '(.data // .jobs // [])[]')
  for job in "${JOBS[@]}"; do
    jid=$(echo "$job" | jq -r '.id // .jobId')
    comp=$(echo "$job" | jq -r '.compositionId // .composition // "MarketingVideo"')
    app=$(echo "$job" | jq -r '.appId // .app // "prime_self"')
    topic=$(echo "$job" | jq -r '.topic // .title // "Your Free Energy Blueprint"')
    bk=$(echo "$job" | jq -r '.briefKey // ""')
    bc=$(echo "$job" | jq -r '.brandColor // "#6366f1"')
    ba=$(echo "$job" | jq -r '.brandAccent // "#a5b4fc"')
    lu=$(echo "$job" | jq -r '.logoUrl // ""')
    ft=$(echo "$job" | jq -r '.forgeTheme // "self"')
    ht=$(echo "$job" | jq -r '.hdType // ""')
    sg=$(echo "$job" | jq -c '.signatureGates // []')
    # mark rendering (best-effort, mirrors video-cron)
    curl -sS -X PATCH "${SCHEDULE_WORKER_URL}/jobs/${jid}" -H "Authorization: Bearer ${WORKER_API_TOKEN}" -H 'Content-Type: application/json' --data '{"status":"rendering"}' >/dev/null || true
    if ! render_one "$jid" "$comp" "$app" "$topic" "$bk" "$bc" "$ba" "$lu" "$ft" "$ht" "$sg" </dev/null; then
      log "job $jid FAILED"; mark_failed "$jid" "render-runner pipeline error"
    fi
  done
  log "poll drain complete"
else
  # Single-job mode — render one job specified via env vars.
  : "${JOB_ID:?set JOB_ID (or POLL=1) to specify render mode}"
  if ! render_one "$JOB_ID" "${COMPOSITION_ID:?}" "${APP_ID:-$APP_ID_DEFAULT}" "${TOPIC:?}" \
      "${BRIEF_KEY:-}" "${BRAND_COLOR:-#6366f1}" "${BRAND_ACCENT:-#a5b4fc}" "${LOGO_URL:-}" \
      "${FORGE_THEME:-self}" "${HD_TYPE:-}" "${SIGNATURE_GATES:-[]}"; then
    mark_failed "$JOB_ID" "render-runner single-job error"; exit 1
  fi
fi
