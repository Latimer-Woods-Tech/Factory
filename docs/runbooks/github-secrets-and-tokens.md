# GitHub Secrets & Token Management

This runbook explains the GitHub Secrets used across Factory Core and all Factory apps, with special attention to the CloudFlare token naming issue.

## CloudFlare Token Confusion: CF_API_TOKEN vs. CLOUDFLARE_API_TOKEN

**⚠️ IMPORTANT**: There are two different environment variable names for CloudFlare API tokens, and this causes confusion.

### Current State

| Name | Status | Used By | Recommendation |
|------|--------|---------|-----------------|
| `CF_API_TOKEN` | ✅ Primary | Current workflows, Wrangler CLI | **Use this one** |
| `CLOUDFLARE_API_TOKEN` | ❌ Legacy | Older documentation, some tools | **Deprecate** |

### Why We Have Two

The naming inconsistency occurred because:
1. Different CloudFlare tools expect different env var names
2. Wrangler uses `CF_API_TOKEN` natively
3. Older CloudFlare documentation referenced `CLOUDFLARE_API_TOKEN`
4. Both were created at different times without consolidation

### Action Required

**For all app repositories:**

1. ✅ In `.github/workflows/deploy.yml`, verify it uses:
```yaml
env:
  CF_API_TOKEN: ${{ secrets.CF_API_TOKEN }}
```

2. ❌ Never use:
```yaml
env:
  CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
```

3. In `wrangler.jsonc`, **do not set** `api_token` — let it read from `CF_API_TOKEN` env var

## Complete GitHub Secrets Inventory

### Required for Factory Core (monorepo)

| Secret | Purpose | Where Needed | Rotation | Example Format |
|--------|---------|--------------|----------|----------------|
| `CF_API_TOKEN` | Wrangler deployments + Hyperdrive setup | GitHub Actions workflows | Quarterly via CloudFlare dashboard | `v1.0.xxx...` (Bearer-style) |
| `CF_ACCOUNT_ID` | CloudFlare account identifier | `wrangler.jsonc` / workflows | Never | `123abc456def...` (32 hex chars) |
| `GITHUB_TOKEN` | GitHub API access (auto-generated) | CI/CD, dependency fetching | Per-workflow (auto) | `ghp_xxx...` |
| `NODE_AUTH_TOKEN` | npm registry auth for @latimer-woods-tech/* packages | `.npmrc` (in GitHub Packages) | Quarterly via GitHub PAT | `ghp_xxx...` (GitHub PAT) |
| `GH_PAT` | PAT for scaffold workflows to push to app repos | `scaffold-*.yml` workflows | Quarterly | `ghp_xxx...` (repo + read:packages) |

### Required for Supervisor Vertex AI (SUP-1.2)

These secrets enable the supervisor planner's Gemini 2.5 Pro long-context fallback via Google Vertex AI.
Provisioned by `scripts/provision-vertex-ai-sa.sh`; rotation procedure at `docs/runbooks/rotate-gcp-sa.md`.

| Secret | Purpose | Set In | Rotation | Provider |
|--------|---------|--------|----------|----------|
| `SUPERVISOR_VERTEX_SA_KEY` | JSON key for `supervisor-sa@factory-495015.iam.gserviceaccount.com` (roles/aiplatform.user only). Used by `verify-vertex-ai.yml` and to mint `VERTEX_ACCESS_TOKEN` at deploy time. | **Org secret** (`Latimer-Woods-Tech`) — default visibility: all repos. Restrict to `factory` repo only if Vertex AI is not needed elsewhere. | Quarterly or on compromise — see `docs/runbooks/rotate-gcp-sa.md` | Google Cloud IAM |

### Required for Each App Repository

| Secret | Purpose | Set In | Rotation | Provider |
|--------|---------|--------|----------|----------|
| `CF_API_TOKEN` | Worker deployment (same as core) | GitHub Secrets | Quarterly | CloudFlare |
| `CF_ACCOUNT_ID` | Worker account ID (same as core) | GitHub Secrets | Never | CloudFlare |
| `DATABASE_URL` | Local dev database connection | `.dev.vars` only | After Neon password reset | Neon |
| `SENTRY_DSN` | Error tracking setup | Wrangler secret | Never (built into DSN) | Sentry |
| `POSTHOG_KEY` | Analytics data ingestion | Wrangler secret | Never (built into key) | PostHog |
| `JWT_SECRET` | Auth token signing | **Wrangler secret** only (not GitHub Secrets) | Every 3–6 months | Generate locally |

### Required for Factory Video Rendering Pipeline

These secrets are required before `apps/schedule-worker`, `apps/video-cron`, and the `render-video.yml` workflow can complete a synthetic job flow.

| Secret | Purpose | Set In | Rotation | Provider |
|--------|---------|--------|----------|----------|
| `ANTHROPIC_API_KEY` | LLM script generation | GitHub Actions secret | Quarterly or after provider rotation | Anthropic |
| `ELEVENLABS_API_KEY` | Narration audio generation | GitHub Actions secret | Quarterly | ElevenLabs |
| `ELEVENLABS_VOICE_PRIME_SELF` | SelfPrime narration voice ID | GitHub Actions secret or repo variable if non-sensitive | When voice changes | ElevenLabs |
| `ELEVENLABS_VOICE_CYPHER` | Cypher narration voice ID | GitHub Actions secret or repo variable if non-sensitive | When voice changes | ElevenLabs |
| `ELEVENLABS_VOICE_DEFAULT` | Default fallback narration voice ID | GitHub Actions secret or repo variable if non-sensitive | When voice changes | ElevenLabs |
| `CF_STREAM_TOKEN` | Cloudflare Stream register/read operations | GitHub Actions secret | Quarterly | Cloudflare |
| `CF_ACCOUNT_ID` | Cloudflare account ID for Stream/R2 | GitHub Actions secret | Never unless account changes | Cloudflare |
| `R2_ACCESS_KEY_ID` | R2 S3-compatible upload access | GitHub Actions secret | Quarterly | Cloudflare R2 |
| `R2_SECRET_ACCESS_KEY` | R2 S3-compatible upload secret | GitHub Actions secret | Quarterly | Cloudflare R2 |
| `R2_BUCKET_NAME` | R2 media artifact bucket | GitHub Actions secret or repo variable | When bucket changes | Cloudflare R2 |
| `R2_PUBLIC_DOMAIN` | Public R2 asset domain | GitHub Actions secret or repo variable | When domain changes | Cloudflare R2 |
| `SCHEDULE_WORKER_URL` | Schedule Worker callback URL | GitHub Actions secret or repo variable | When Worker URL changes | Factory |
| `WORKER_API_TOKEN` | Bearer token for schedule-worker callbacks | Wrangler secret + GitHub Actions secret | Quarterly | Generate locally |
| `APP_SERVICE_TOKENS` | JSON token-to-app map for app-scoped schedule-worker access | Wrangler secret | Quarterly | Generate locally |

### Required for Prime Self Smoke Validation

These secrets are required by `.github/workflows/smoke-prime-self.yml` and `apps/prime-self-smoke/tests/workspace-contract.spec.ts`.
Without them, authenticated workspace contract checks (personal + practitioner route/tool discoverability) will fail in CI.

| Secret | Purpose | Set In | Rotation | Provider |
|--------|---------|--------|----------|----------|
| `SMOKE_USER_EMAIL` | Authenticated personal workspace smoke login | GitHub Actions secret | On credential rotation | Factory test account |
| `SMOKE_USER_PASSWORD` | Password for personal workspace smoke login | GitHub Actions secret | On credential rotation | Factory test account |
| `SMOKE_PRACTITIONER_EMAIL` | Authenticated practitioner workspace smoke login | GitHub Actions secret | On credential rotation | Factory practitioner test account |
| `SMOKE_PRACTITIONER_PASSWORD` | Password for practitioner workspace smoke login | GitHub Actions secret | On credential rotation | Factory practitioner test account |

Canonical contract note: use only `SMOKE_USER_*` and `SMOKE_PRACTITIONER_*` secrets.
Legacy `SMOKE_EMAIL` / `SMOKE_PASSWORD` aliases are no longer used by CI workflows.

## How to Set GitHub Secrets

### For Factory Core (monorepo)

1. Navigate to: **https://github.com/Latimer-Woods-Tech/factory/settings/secrets/actions**
2. Click "New repository secret"
3. Add each secret from the inventory above
4. **Verify in workflows**: Go to Actions → select any workflow → check "Secrets" are populated

### For Each App (original 6 apps + any standalone apps)

The original 6 apps (prime-self, wordis-bond, cypher-healing, the-calling, ijustus, neighbor-aid) use `setup-all-apps.mjs` for bulk setup.

Standalone apps added after Stage 6 (xpelevator, xico-city, and any future apps) use their own `setup-{app}-secrets.yml` workflow in the Factory repo instead.

1. Navigate to: **https://github.com/Latimer-Woods-Tech/{app}/settings/secrets/actions**
2. Click "New repository secret"
3. Add secrets from "Required for Each App Repository" table
4. Commit the app's `wrangler.jsonc` to reference via interpolation

## Setting Secrets in wrangler.jsonc

✅ **Good** — Reference via env var:
```jsonc
{
  "env": {
    "production": {
      "vars": {
        "SENTRY_DSN": "https://xxx@xxx.ingest.sentry.io/xxx",
        "POSTHOG_KEY": "phc_xxx..."
      }
    }
  }
}
```

❌ **Bad** — Hardcoded secrets:
```jsonc
{
  "env": {
    "production": {
      "vars": {
        "DATABASE_URL": "postgres://user:password@..."  // NO!
      }
    }
  }
}
```

Then in GitHub Actions:
```yaml
env:
  SENTRY_DSN: ${{ secrets.SENTRY_DSN }}
  POSTHOG_KEY: ${{ secrets.POSTHOG_KEY }}
```

## Wrangler Secret vs. GitHub Secret

| Use Case | Storage | Scope | When to Use |
|----------|---------|-------|------------|
| `wrangler secret put` | CloudFlare Workers KV | Per-Worker, encrypted | `JWT_SECRET` (tokens never leak to logs) |
| GitHub Secrets | GitHub Actions | Per-repo, encrypted in transit | Build-time secrets (API tokens, credentials) |

**JWT_SECRET Example:**
```bash
# Only set in Worker, not in GitHub public logs
openssl rand -base64 32 | wrangler secret put JWT_SECRET --env production --name {app}
```

## Rotation Schedule

| Secret | Frequency | How to Rotate |
|--------|-----------|---------------|
| `CF_API_TOKEN` | Quarterly | Regenerate in CloudFlare dashboard → Profile → API tokens → Account → Rotate |
| `NEON_URL` | As needed | Neon console → Project → Reset password |
| `JWT_SECRET` | Every 6 months | `wrangler secret put JWT_SECRET` (forces user re-auth) |
| `SENTRY_DSN` | Never (built into URL) | Only if Sentry project is deleted |
| `POSTHOG_KEY` | Never (built into key) | Only if PostHog project is regenerated |
| `NODE_AUTH_TOKEN` | Quarterly | GitHub → Developer settings → Personal access tokens → Regenerate |

## Troubleshooting

### Error: "403 Forbidden: PUT https://npm.pkg.github.com"
**Cause**: `NODE_AUTH_TOKEN` is missing or expired  
**Fix**: 
1. Generate new GitHub PAT: https://github.com/settings/tokens?type=beta
2. Scopes needed: `read:packages` only
3. Update Secret: **https://github.com/Latimer-Woods-Tech/{repo}/settings/secrets/actions**
4. Re-run workflow

### Error: "Unauthorized: CF_API_TOKEN invalid"
**Cause**: Token name mismatch (`CLOUDFLARE_API_TOKEN` used instead of `CF_API_TOKEN`)  
**Fix**:
1. Check `.github/workflows/deploy.yml` for correct env var name
2. Verify GitHub Secrets page lists `CF_API_TOKEN` (not `CLOUDFLARE_API_TOKEN`)
3. Test locally: `CF_API_TOKEN=xxx wrangler deploy`

### Error: "Failed to connect to database: ECONNREFUSED"
**Cause**: `NEON_URL` / `DATABASE_URL` is wrong or expired  
**Fix**:
1. In Neon console: Project → Connection string → Copy fresh string
2. Update GitHub Secrets: `NEON_URL` or `DATABASE_URL` (match app's naming convention)
3. Redeploy: `wrangler deploy --env production`

### Error: "Sentry 401: Invalid DSN"
**Cause**: `SENTRY_DSN` is missing or typo'd  
**Fix**:
1. In Sentry: Settings → Projects → {app} → Client Keys (DSN)
2. Copy exact URL
3. Update GitHub Secrets: `SENTRY_DSN`
4. Redeploy

### Error: "render-video workflow secret not found"
**Cause**: One of the video rendering pipeline secrets is missing from GitHub Actions.
**Fix**:
1. Compare the repository secrets against the "Required for Factory Video Rendering Pipeline" table above.
2. Add the missing secret in **Settings → Secrets and variables → Actions**.
3. Re-run the failed workflow and verify the schedule-worker callback succeeds.

## Audit Checklist

Run this quarterly:

- [ ] All Factory app repos have `CF_API_TOKEN` set (original 6 + xpelevator + xico-city + any new standalone apps)
- [ ] No repo has `CLOUDFLARE_API_TOKEN` set without also having `CF_API_TOKEN` (both are needed for compatibility)
- [ ] Each app has `SENTRY_DSN` and `POSTHOG_KEY` set as **Wrangler secrets** (not GitHub Secrets)
- [ ] `NODE_AUTH_TOKEN` / `GH_PAT` is fresh (< 90 days old)
- [ ] Wrangler secrets are up to date (run `wrangler secret list --name {app}` per app)
- [ ] No hardcoded passwords in `wrangler.jsonc` or source code
- [ ] `HYPERDRIVE_*` secrets exist in Factory repo for all apps with standalone workflows
- [ ] Rate limiter ID registry in [add-new-app.md](./add-new-app.md) is up to date

## Related Runbooks

- [Deployment Runbook](./deployment.md) — How to deploy with these secrets
- [Secret Rotation Runbook](./secret-rotation.md) — How to rotate specific secrets
- [Add New App Runbook](./add-new-app.md) — Per-app secret naming conventions when onboarding a new standalone app
