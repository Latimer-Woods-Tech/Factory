#!/usr/bin/env bash
set -euo pipefail

# VideoKing production deployment helper.
# Designed for Linux/CI because next-on-pages currently fails on native Windows.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FACTORY_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
VIDEOKING_ROOT="${VIDEOKING_ROOT:-${FACTORY_ROOT}/_external_reviews/videoking}"
WEB_DIR="${VIDEOKING_ROOT}/apps/web"
WORKER_DIR="${VIDEOKING_ROOT}/apps/worker"
DB_DIR="${VIDEOKING_ROOT}/packages/db"
VERIFY_SCRIPT="${SCRIPT_DIR}/verify-deployment.sh"

PAGES_PROJECT_NAME="${PAGES_PROJECT_NAME:-capricast}"
FRONTEND_DOMAIN="${FRONTEND_DOMAIN:-https://capricast.com}"
API_DOMAIN="${API_DOMAIN:-https://api.capricast.com}"

DEPLOY_STAGING_FIRST="${DEPLOY_STAGING_FIRST:-0}"
RUN_TESTS="${RUN_TESTS:-1}"
RUN_TYPECHECK="${RUN_TYPECHECK:-1}"
RUN_PREDEPLOY_CHECKS="${RUN_PREDEPLOY_CHECKS:-1}"
DEPLOY_DB_MIGRATIONS="${DEPLOY_DB_MIGRATIONS:-0}"
DRY_RUN_MIGRATIONS="${DRY_RUN_MIGRATIONS:-1}"
SKIP_VERIFY="${SKIP_VERIFY:-0}"

log() {
  printf '[deploy-prod] %s\n' "$*"
}

fail() {
  printf '[deploy-prod] ERROR: %s\n' "$*" >&2
  exit 1
}

need_cmd() {
  command -v "$1" >/dev/null 2>&1 || fail "Missing required command: $1"
}

require_path() {
  [[ -e "$1" ]] || fail "Required path not found: $1"
}

run_checked() {
  log "Running: $*"
  "$@"
}

check_prerequisites() {
  log "Checking prerequisites"
  need_cmd git
  need_cmd pnpm
  need_cmd node
  need_cmd curl
  need_cmd wrangler

  require_path "${VIDEOKING_ROOT}"
  require_path "${WEB_DIR}"
  require_path "${WORKER_DIR}"
  require_path "${DB_DIR}"
  require_path "${VERIFY_SCRIPT}"

  # next-on-pages on native Windows has known incompatibilities for this repository.
  case "$(uname -s)" in
    Linux*)
      ;;
    Darwin*)
      ;;
    MINGW*|MSYS*|CYGWIN*)
      fail "Detected native Windows shell. Use Linux, WSL, or CI to run this deploy script."
      ;;
    *)
      log "Proceeding on unknown OS: $(uname -s)"
      ;;
  esac

  [[ -n "${CF_API_TOKEN:-}" ]] || fail "CF_API_TOKEN is required"
  [[ -n "${CF_ACCOUNT_ID:-}" ]] || fail "CF_ACCOUNT_ID is required"
}

check_git_clean() {
  log "Checking git status"
  pushd "${VIDEOKING_ROOT}" >/dev/null
  if [[ -n "$(git status --porcelain)" ]]; then
    git status --short
    fail "Working tree is not clean. Commit or stash changes before deploying."
  fi
  popd >/dev/null
}

run_validation() {
  pushd "${VIDEOKING_ROOT}" >/dev/null

  if [[ "${RUN_PREDEPLOY_CHECKS}" == "1" ]]; then
    if pnpm -s run | grep -q "pre-deploy-check"; then
      run_checked pnpm pre-deploy-check
    else
      log "Skipping pre-deploy-check (script not defined)."
    fi
  fi

  if [[ "${RUN_TYPECHECK}" == "1" ]]; then
    run_checked pnpm typecheck
  fi

  if [[ "${RUN_TESTS}" == "1" ]]; then
    run_checked pnpm test
  fi

  popd >/dev/null
}

build_artifacts() {
  log "Building frontend artifact"
  pushd "${WEB_DIR}" >/dev/null
  run_checked pnpm build
  run_checked pnpm build:pages
  require_path "${WEB_DIR}/.vercel/output/static"
  popd >/dev/null

  log "Building worker artifact"
  pushd "${WORKER_DIR}" >/dev/null
  run_checked pnpm build
  require_path "${WORKER_DIR}/dist"
  popd >/dev/null
}

run_database_migrations() {
  if [[ "${DEPLOY_DB_MIGRATIONS}" != "1" ]]; then
    log "Database migration phase skipped (DEPLOY_DB_MIGRATIONS=${DEPLOY_DB_MIGRATIONS})."
    return
  fi

  log "Starting database migration phase"
  pushd "${DB_DIR}" >/dev/null
  run_checked pnpm db:generate

  if [[ "${DRY_RUN_MIGRATIONS}" == "1" ]]; then
    log "Running migration dry-run preview"
    run_checked pnpm exec drizzle-kit push --dry-run
  fi

  run_checked pnpm db:migrate
  popd >/dev/null
}

deploy_staging() {
  if [[ "${DEPLOY_STAGING_FIRST}" != "1" ]]; then
    log "Staging deployment skipped."
    return
  fi

  log "Deploying worker to staging"
  pushd "${WORKER_DIR}" >/dev/null
  run_checked pnpm exec wrangler deploy --env staging
  popd >/dev/null
}

deploy_production() {
  log "Deploying frontend to Cloudflare Pages"
  pushd "${WEB_DIR}" >/dev/null
  run_checked pnpm exec wrangler pages deploy .vercel/output/static --project-name "${PAGES_PROJECT_NAME}"
  popd >/dev/null

  log "Deploying worker to production"
  pushd "${WORKER_DIR}" >/dev/null
  run_checked pnpm exec wrangler deploy
  popd >/dev/null
}

post_deploy_verify() {
  if [[ "${SKIP_VERIFY}" == "1" ]]; then
    log "Skipping verification because SKIP_VERIFY=1"
    return
  fi

  log "Running post-deploy verification"
  run_checked "${VERIFY_SCRIPT}" \
    --frontend-url "${FRONTEND_DOMAIN}" \
    --api-url "${API_DOMAIN}"
}

print_summary() {
  cat <<EOF
[deploy-prod] Deployment complete.
[deploy-prod] Frontend: ${FRONTEND_DOMAIN}
[deploy-prod] API: ${API_DOMAIN}
[deploy-prod] Pages project: ${PAGES_PROJECT_NAME}
[deploy-prod] Staging first: ${DEPLOY_STAGING_FIRST}
[deploy-prod] Migrations enabled: ${DEPLOY_DB_MIGRATIONS}
EOF
}

main() {
  check_prerequisites
  check_git_clean
  run_validation
  build_artifacts
  run_database_migrations
  deploy_staging
  deploy_production
  post_deploy_verify
  print_summary
}

main "$@"
