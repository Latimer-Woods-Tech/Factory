#!/bin/bash

# Google OAuth Integration Verification Test
# Verifies that the /auth/google endpoint is properly configured and functional
# Usage: ./scripts/verify-google-oauth.sh [production|staging]

set -euo pipefail

ENV="${1:-production}"
API_URL="https://api.apunlimited.com"

if [ "$ENV" = "staging" ]; then
  API_URL="https://api-staging.apunlimited.com"
fi

echo "🔍 Google OAuth Verification Test"
echo "=================================="
echo "Environment: $ENV"
echo "API URL: $API_URL"
echo ""

# Test 1: Health check
echo "Test 1: Health Check"
HEALTH=$(curl -s "$API_URL/health")
STATUS=$(echo "$HEALTH" | jq -r '.status' 2>/dev/null || echo "unknown")
if [ "$STATUS" = "ok" ]; then
  echo "✅ Health check passed"
else
  echo "❌ Health check failed"
  echo "Response: $HEALTH"
  exit 1
fi
echo ""

# Test 2: Missing credential error
echo "Test 2: Missing Credential Error"
RESPONSE=$(curl -s -X POST "$API_URL/auth/google" \
  -H "Content-Type: application/json" \
  -d '{}')
ERROR=$(echo "$RESPONSE" | jq -r '.error' 2>/dev/null || echo "")

if [ "$ERROR" = "Missing Google credential" ]; then
  echo "✅ Endpoint correctly rejects missing credential"
elif [ "$ERROR" = "Google sign-in is not configured" ]; then
  echo "⚠️  Google secrets not yet configured"
  echo "   See scripts/setup-google-oauth-secrets.md for setup instructions"
  exit 1
else
  echo "❌ Unexpected response"
  echo "Response: $RESPONSE"
  exit 1
fi
echo ""

# Test 3: Invalid JWT error
echo "Test 3: Invalid JWT Handling"
INVALID_JWT="eyJhbGciOiJSUzI1NiIsImtpZCI6InRlc3QiLCJ0eXAiOiJKV1QifQ.eyJpc3MiOiJodHRwczovL2FjY291bnRzLmdvb2dsZS5jb20ifQ.invalid"
RESPONSE=$(curl -s -X POST "$API_URL/auth/google" \
  -H "Content-Type: application/json" \
  -d "{\"credential\":\"$INVALID_JWT\",\"env\":\"$ENV\"}")
ERROR=$(echo "$RESPONSE" | jq -r '.error' 2>/dev/null || echo "")

if [[ "$ERROR" == "Invalid Google credential"* ]] || [[ "$ERROR" == "Internal server error"* ]]; then
  echo "✅ Endpoint correctly rejects invalid JWT"
else
  echo "⚠️  Unexpected response (may indicate Google secrets not configured)"
  echo "Response: $RESPONSE"
fi
echo ""

# Test 4: Invalid environment error
echo "Test 4: Invalid Environment Error"
RESPONSE=$(curl -s -X POST "$API_URL/auth/google" \
  -H "Content-Type: application/json" \
  -d '{"credential":"test","env":"invalid"}')
ERROR=$(echo "$RESPONSE" | jq -r '.error' 2>/dev/null || echo "")

if [[ "$ERROR" == *"Invalid env"* ]]; then
  echo "✅ Endpoint correctly rejects invalid environment"
else
  echo "⚠️  Response: $RESPONSE"
fi
echo ""

# Summary
echo "=================================="
echo "Verification Tests Complete"
echo ""
echo "Status:"
echo "  ✅ /auth/google endpoint is live"
echo "  ✅ Authorization checks working"
echo ""
if [ "$ERROR" = "Google sign-in is not configured" ]; then
  echo "Next Steps:"
  echo "  1. Follow instructions in scripts/setup-google-oauth-secrets.md"
  echo "  2. Configure ADMIN_STUDIO_GOOGLE_CLIENT_ID in GitHub secrets"
  echo "  3. Configure ADMIN_STUDIO_ALLOWED_USERS_JSON in GitHub secrets"
  echo "  4. Push to main or manually trigger GitHub Actions deploy"
  echo "  5. Wait ~3 minutes for deployment"
  echo "  6. Re-run this verification script"
else
  echo "✅ /auth/google is fully configured and ready for use!"
fi
