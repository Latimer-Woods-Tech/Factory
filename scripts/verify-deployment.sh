#!/usr/bin/env bash
set -euo pipefail

FRONTEND_URL="https://capricast.com"
API_URL="https://api.capricast.com"
TIMEOUT_SECONDS="20"
EXPECT_STRIPE_ROUTE_STATUS="405"

usage() {
  cat <<EOF
Usage: $(basename "$0") [--frontend-url URL] [--api-url URL] [--timeout SECONDS]

Options:
  --frontend-url URL  Frontend URL to verify (default: https://capricast.com)
  --api-url URL       API URL to verify (default: https://api.capricast.com)
  --timeout SECONDS   Curl timeout in seconds (default: 20)
EOF
}

log() {
  printf '[verify-deployment] %s\n' "$*"
}

fail() {
  printf '[verify-deployment] ERROR: %s\n' "$*" >&2
  exit 1
}

parse_args() {
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --frontend-url)
        FRONTEND_URL="$2"
        shift 2
        ;;
      --api-url)
        API_URL="$2"
        shift 2
        ;;
      --timeout)
        TIMEOUT_SECONDS="$2"
        shift 2
        ;;
      -h|--help)
        usage
        exit 0
        ;;
      *)
        fail "Unknown argument: $1"
        ;;
    esac
  done
}

curl_status() {
  local method="$1"
  local url="$2"
  local status
  status="$(curl -sS -X "$method" -o /dev/null -w "%{http_code}" --max-time "$TIMEOUT_SECONDS" "$url")"
  printf '%s' "$status"
}

assert_status_any() {
  local name="$1"
  local status="$2"
  shift 2

  for expected in "$@"; do
    if [[ "$status" == "$expected" ]]; then
      log "$name -> HTTP $status (ok)"
      return 0
    fi
  done

  fail "$name -> HTTP $status (expected one of: $*)"
}

verify_api_health() {
  local status
  status="$(curl_status GET "${API_URL}/health")"
  assert_status_any "API health" "$status" "200"
}

verify_frontend_root() {
  local status
  status="$(curl_status GET "${FRONTEND_URL}/")"
  assert_status_any "Frontend root" "$status" "200" "301" "302"
}

verify_unauthenticated_authz() {
  local status
  status="$(curl_status GET "${API_URL}/api/stripe/connect/status")"
  assert_status_any "Unauthenticated authz check" "$status" "401" "403"
}

verify_stripe_webhook_route_shape() {
  local status
  status="$(curl_status GET "${API_URL}/api/webhooks/stripe")"
  assert_status_any "Stripe webhook route check" "$status" "404" "$EXPECT_STRIPE_ROUTE_STATUS"
}

verify_optional_login() {
  if [[ -z "${TEST_USER_EMAIL:-}" || -z "${TEST_USER_PASSWORD:-}" ]]; then
    log "Skipping optional login check (set TEST_USER_EMAIL and TEST_USER_PASSWORD to enable)."
    return
  fi

  local status
  status="$(curl -sS -o /dev/null -w "%{http_code}" --max-time "$TIMEOUT_SECONDS" \
    -H 'Content-Type: application/json' \
    -X POST "${API_URL}/api/auth/sign-in/email" \
    -d "{\"email\":\"${TEST_USER_EMAIL}\",\"password\":\"${TEST_USER_PASSWORD}\"}")"

  assert_status_any "Auth login check" "$status" "200" "201" "204"
}

print_report() {
  cat <<EOF
[verify-deployment] Verification summary:
[verify-deployment] - Frontend URL: ${FRONTEND_URL}
[verify-deployment] - API URL: ${API_URL}
[verify-deployment] - Health endpoint: ${API_URL}/health
[verify-deployment] - Stripe webhook endpoint: ${API_URL}/api/webhooks/stripe
EOF
}

main() {
  parse_args "$@"

  command -v curl >/dev/null 2>&1 || fail "curl is required"

  verify_api_health
  verify_frontend_root
  verify_unauthenticated_authz
  verify_stripe_webhook_route_shape
  verify_optional_login
  print_report
}

main "$@"
