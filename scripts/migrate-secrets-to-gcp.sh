#!/bin/bash

# Migrate GitHub org secrets to GCP Secret Manager
# Usage: bash scripts/migrate-secrets-to-gcp.sh

set -e

PROJECT="factory-495015"
GITHUB_REPO="Latimer-Woods-Tech/factory"

# Secrets that need values from GitHub
CREDENTIAL_SECRETS=(
  "CF_ACCOUNT_ID"
  "CF_API_TOKEN"
  "DATABASE_URL"
  "FACTORY_CORE_DATABASE_URL"
  "GROQ_API_KEY"
  "VERTEX_SA_KEY"
  "VERTEX_ACCESS_TOKEN"
  "FACTORY_SENTRY_API"
  "KAIROSCOUNCIL_SENTRY_API"
  "KAIROSCOUNCIL_SENTRY_DSN"
  "NPM_TOKEN"
  "GOOGLE_CALENDAR_SERVICE_ACCOUNT_JSON"
  "FACTORY_APP_PRIVATE_KEY"
  "SUPERVISOR_JWT_SECRET"
  "JWT_SECRET"
  "SLACK_WEBHOOK_DELIVERY_KPIS"
  "SLACK_WEBHOOK_OPS"
  "SLACK_WEBHOOK_REVENUE"
  "WORKER_API_TOKEN"
  "SELFPRIME_CONNECTION_STRING"
  "THECALLING_CONNECTION_STRING"
  "WORDISBOND_CONNECTION_STRING"
  "CYPHEROFHEALING_CONNECTION_STRING"
  "KAIROSCOUNCIL_CONNECTION_STRING"
  "MEXXICO_CITY_CONNECTION_STRING"
  "NICHESTREAM_CONNECTION_STRING"
  "XPELEVATOR_CONNECTION_STRING"
  "HYPERDRIVE_CYPHER_HEALING"
  "HYPERDRIVE_FACTORY_CORE"
  "HYPERDRIVE_IJUSTUS"
  "HYPERDRIVE_NEIGHBOR_AID"
  "HYPERDRIVE_PRIME_SELF"
  "HYPERDRIVE_THE_CALLING"
  "HYPERDRIVE_WORDIS_BOND"
  "HYPERDRIVE_XICO_CITY"
  "RATE_LIMITER_CYPHER_HEALING"
  "RATE_LIMITER_IJUSTUS"
  "RATE_LIMITER_NEIGHBOR_AID"
  "RATE_LIMITER_PRIME_SELF"
  "RATE_LIMITER_THE_CALLING"
  "RATE_LIMITER_WORDIS_BOND"
  "FACTORY_APP_CLIENT_ID"
  "FACTORY_APP_ID"
  "FACTORY_APP_INSTALLATION_ID"
  "ADMIN_STUDIO_PROD_URL"
  "ADMIN_STUDIO_STAGING_URL"
  "PRIME_SELF_LOGO_URL"
  "SCHEDULE_WORKER_URL"
  "FLAG_METER_DATABASE_ID"
)

echo "=== GCP Secret Manager Migration ==="
echo "Migrating secrets to project: $PROJECT"
echo ""

# Create a temporary file for secrets
SECRETS_FILE=$(mktemp)
trap "rm -f $SECRETS_FILE" EXIT

echo "Instructions:"
echo "1. For each secret, you will be prompted to enter its value"
echo "2. Get values from: gh secret list --repo $GITHUB_REPO"
echo "3. Leave blank to skip (you can populate later)"
echo "4. Press Ctrl+C to cancel"
echo ""

POPULATED=0
SKIPPED=0

for SECRET in "${CREDENTIAL_SECRETS[@]}"; do
  echo -n "Enter value for $SECRET (or press Enter to skip): "
  read -r VALUE

  if [ -z "$VALUE" ]; then
    echo "  ⊘ Skipped"
    ((SKIPPED++))
    continue
  fi

  # Add secret version to GCP
  if echo -n "$VALUE" | gcloud secrets versions add "$SECRET" \
    --project="$PROJECT" \
    --data-file=- \
    --quiet 2>/dev/null; then
    echo "  ✓ Added to Secret Manager"
    ((POPULATED++))
  else
    echo "  ✗ Failed to add to Secret Manager"
  fi
done

echo ""
echo "=== Migration Summary ==="
echo "Populated: $POPULATED secrets"
echo "Skipped: $SKIPPED secrets"
echo ""
echo "Next: Update workflows in .github/workflows/ to use WIF + Secret Manager"
echo "See: docs/runbooks/secret-migration-checklist.md for workflow update template"
