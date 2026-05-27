# Admin Studio AI Agent — Setup & Deployment Guide

**Status:** Post-PR merge; ready for staging deployment  
**Date:** 2026-05-27  
**Phase:** Phase 1-4 Complete (Autonomous Agent)

---

## Overview

The admin-studio AI agent now has:
- ✅ Full repository access (Latimer-Woods-Tech/Factory)
- ✅ Tool-use capability (GitHub tools)
- ✅ GCP Secret Manager integration
- ✅ Optional AI Gateway fallback

This guide covers deployment to staging and production environments.

---

## Prerequisites

### Local Development
```bash
# Node.js 18+
node --version

# Install dependencies
cd apps/admin-studio
npm install

# Verify wrangler is available
npx wrangler --version
```

### Cloudflare Account
- Account with Workers enabled
- API token with scope: `Account.Workers Scripts Write`
  - Create at: https://dash.cloudflare.com/profile/api-tokens
  - Save as environment variable: `export CLOUDFLARE_API_TOKEN="..."`

### GCP Project
- Project ID: `factory-495015`
- Service account with role: `Secret Manager Secret Accessor`
- Service account key (JSON format, base64-encoded for `GCP_SA_KEY`)

### GitHub
- Personal access token with scopes: `repo`, `workflow`
- Store as secret: `GITHUB_TOKEN`

---

## Secrets Configuration

### 1. Create Service Account Key (GCP)

If not already created, generate a new key:

```bash
# Use gcloud CLI or GCP Console
gcloud iam service-accounts keys create sa-key.json \
  --iam-account=factory-sa@factory-495015.iam.gserviceaccount.com

# Base64 encode the key
cat sa-key.json | base64 -w 0 > sa-key.b64
cat sa-key.b64  # Copy this value for GCP_SA_KEY
```

**Key Contents (sample structure):**
```json
{
  "type": "service_account",
  "project_id": "factory-495015",
  "private_key_id": "...",
  "private_key": "-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n",
  "client_email": "factory-sa@factory-495015.iam.gserviceaccount.com",
  "client_id": "...",
  "auth_uri": "https://accounts.google.com/o/oauth2/auth",
  "token_uri": "https://oauth2.googleapis.com/token",
  "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs"
}
```

### 2. Set Cloudflare API Token

```bash
export CLOUDFLARE_API_TOKEN="v1.0_abc123..."
```

### 3. Store Secrets via Wrangler

```bash
cd apps/admin-studio

# GitHub token (for repo access)
wrangler secret put GITHUB_TOKEN --env staging
# Paste: <github-pat-with-repo-workflow-scopes>

# Anthropic API key (for Claude calls)
wrangler secret put ANTHROPIC_API_KEY --env staging
# Paste: <sk-ant-...>

# GCP service account key (base64)
wrangler secret put GCP_SA_KEY --env staging
# Paste: <base64-encoded-sa-key-json>
```

### 4. Verify Secrets

```bash
# List all secrets for the environment (does NOT show values)
wrangler secret list --env staging
```

**Expected output:**
```
GITHUB_TOKEN
ANTHROPIC_API_KEY
GCP_SA_KEY
```

---

## Deployment

### Staging Environment

```bash
cd apps/admin-studio

# Build and deploy
npm run deploy:staging

# Output will show:
# ✨ Successfully published your Worker to
# https://admin-studio-staging.adrper79.workers.dev
```

### Production Environment

```bash
# Same process, different env flag
npm run deploy:production
```

---

## Verification

### Health Check

```bash
# Staging
curl https://admin-staging.latwoodtech.work/health

# Expected: 200 OK
# Body: { "status": "ok" } or similar
```

### Test AI Chat Endpoint

```bash
# Test /ai/chat with a simple prompt
curl -X POST https://admin-staging.latwoodtech.work/api/ai/chat \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <studio-jwt>" \
  -d '{
    "history": [
      {
        "role": "user",
        "content": "List open issues in Factory"
      }
    ],
    "mode": "generate"
  }'

# Expected:
# - SSE stream of token events
# - Tool execution (github_list_issues)
# - Final response with issue list
```

### Test GCP Secret Access

```bash
# If the agent tries to fetch a secret
curl -X POST https://admin-staging.latwoodtech.work/api/ai/chat \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <studio-jwt>" \
  -d '{
    "history": [
      {
        "role": "user",
        "content": "Fetch the NEON_FACTORY_DATABASE_URL secret from GCP"
      }
    ],
    "mode": "generate"
  }'

# Expected:
# - Tool call to gcp_get_secret
# - Secret value (truncated to first 100 chars)
# - Agent uses it to respond
```

---

## Environment Variables

### Non-Secret Vars (wrangler.jsonc)

Already configured:
- `STUDIO_ENV`: "staging" or "production"
- `ALLOWED_ORIGINS`: CORS whitelist
- `SENTRY_ORG`: "latwood-tech"
- `DIGEST_TO_EMAIL`: "adrper79@gmail.com"

### Secret Vars (wrangler secret put)

| Name | Purpose | Format |
|------|---------|--------|
| `GITHUB_TOKEN` | Repository access | PAT with `repo`, `workflow` |
| `ANTHROPIC_API_KEY` | Claude API calls | `sk-ant-...` |
| `GCP_SA_KEY` | Secret Manager access | Base64-encoded JSON |
| `JWT_SECRET` | Studio JWT signing | 32+ byte hex string |
| `STUDIO_ADMIN_EMAIL` | Bootstrap email | Email address |
| `STUDIO_ADMIN_PASSWORD_SHA256` | Bootstrap password | Hex SHA256 digest |

---

## Troubleshooting

### Deployment Fails: "CLOUDFLARE_API_TOKEN not set"

```bash
export CLOUDFLARE_API_TOKEN="..."
npm run deploy:staging
```

### Tool Execution Returns Error

**Common causes:**
1. `GITHUB_TOKEN` not stored or invalid
   - Verify: `wrangler secret list --env staging`
   - Re-store: `wrangler secret put GITHUB_TOKEN --env staging`

2. `GCP_SA_KEY` not stored
   - Must be base64-encoded (not raw JSON)
   - Verify encoding: `echo $GCP_SA_KEY | base64 -d | jq .`

3. GCP service account lacks permissions
   - Grant role: `Secret Manager Secret Accessor`
   - Resource: `factory-495015`

### AI Chat Returns 503 "Service Unavailable"

**Likely causes:**
1. `ANTHROPIC_API_KEY` not set
   - Store via wrangler
2. `AI_GATEWAY_BASE_URL` not set (but optional)
   - Falls back to direct Anthropic API
3. Rate limiting or API quota exceeded
   - Check Anthropic account usage

---

## Monitoring

### Sentry Errors

View errors at: https://sentry.io/organizations/latwood-tech/issues/

Filter by `admin-studio` project.

### Worker Logs

```bash
# Real-time logs
wrangler tail --env staging admin-studio-staging

# Tail with filters
wrangler tail --env staging admin-studio-staging \
  | grep "tool_use\|error"
```

### PostHog Analytics

Track agent usage at: https://posthog.com/

---

## Rollback

If deployment breaks staging:

```bash
# Rollback to previous version
# Get recent deployments
wrangler deployments list --env staging

# Rollback to specific commit
git revert <commit-hash>
npm run deploy:staging
```

---

## What's Next

### Phase 5: Additional Tools
Once Phase 1-4 is stable in production, add:
- `sentry_list_issues`: List live errors
- `cloudflare_get_worker_status`: Check deployment status
- `neon_query`: Direct database queries
- `posthog_query`: Analytics queries

### Phase 6: Caching
For scale, cache tool results in KV:
- GitHub file contents (24h TTL)
- GCP secrets (1h TTL)
- Issue/PR lists (5m TTL)

---

## References

- **[ADMIN_UI_AGENT_PLAN.md](./ADMIN_UI_AGENT_PLAN.md)** — Original 4-phase plan
- **[docs/STACK.md](./docs/STACK.md)** — Tech stack + model routing
- **[docs/runbooks/secrets-and-tokens.md](./docs/runbooks/github-secrets-and-tokens.md)** — Secret management
- **[Cloudflare Workers Docs](https://developers.cloudflare.com/workers/)** — Deployment reference
- **[GCP Secret Manager Docs](https://cloud.google.com/secret-manager/docs)** — Secret API reference
