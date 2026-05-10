# VideoKing CI/CD Pipeline & Deployment Infrastructure Analysis

**Date:** May 10, 2026 | **Repository:** `_external_reviews/videoking/` | **Status:** Multiple active branches, partial deployment

---

## 1. GitHub Actions Workflows

All workflows are in [`.github/workflows/`](.github/workflows/) (8 files):

| Workflow | Purpose | Trigger | Key Steps |
|----------|---------|---------|-----------|
| **[deploy.yml](.github/workflows/deploy.yml)** | Full CI/CD pipeline | `push: main` (exclude docs, .md) | Install → Test → Build → Migrate DB → Deploy Workers & Pages |
| **[db-migrate.yml](.github/workflows/db-migrate.yml)** | Database migrations | `workflow_dispatch` | Check DB → Run drizzle-kit migrate |
| **[pr-review.yml](.github/workflows/pr-review.yml)** | Canonical Factory review | `pull_request` (opened/sync/ready) | Fetch reviewer script → Run Claude code analysis |
| **[auto-merge-approved-prs.yml](.github/workflows/auto-merge-approved-prs.yml)** | Auto-merge after approval | `pull_request_review`, `pull_request` labeling | Check review decision → Squash merge |
| **[auto-triage.yml](.github/workflows/auto-triage.yml)** | Auto-classify issues | `issues` (opened/reopened) | Fetch auto-triage script → Apply labels |
| **[project-status-sync.yml](.github/workflows/project-status-sync.yml)** | Sync PR status to board | `pull_request` (state changes) | Compute status → Update project board |
| **[setup-domains.yml](.github/workflows/setup-domains.yml)** | Manual domain setup | `workflow_dispatch` | Deploy Worker → Add R2 domain → Verify |
| **[auto-add-to-project.yml](.github/workflows/auto-add-to-project.yml)** | Auto-add PRs to board | `pull_request` (opened/reopened) | Add PR to project V2 |

### Key Deployment Workflow: `deploy.yml` (Lines 1–203)

**Triggers:** `push` to `main` (excludes `docs/**` and `*.md`)  
**Node Version:** 20  
**Timeout:** 30 minutes

**Build Steps:**

1. **Dependencies & Checks** (Lines 22–50)
   - Checkout code
   - Install pnpm 9.0.0
   - Setup Node.js 20 with cache
   - `pnpm install --frozen-lockfile`

2. **Quality Gates** (Lines 52–67)
   - `pnpm test:ci` — Runs test suite (phase2-api, phase2-components, slice1, release-gate)
   - `pnpm typecheck` — TypeScript strict validation
   - `pnpm pre-deploy-check --strict --ci` — Pre-deployment validation script

3. **Build Artifacts** (Lines 69–83)
   - Worker: `cd apps/worker && pnpm build` → `dist/`
   - Web (Pages): `cd apps/web && pnpm build:pages` → `.vercel/output/static/`
   - Environment: `NEXT_PUBLIC_API_BASE_URL`, `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`

4. **Database Migrations** (Lines 85–98)
   - Optional if `NEON_CONNECTION_STRING` secret is set
   - `pnpm drizzle-kit migrate` in `packages/db/`
   - Handles missing secret gracefully with warning

5. **Secrets Validation** (Lines 99–110)
   - Checks for: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `STREAM_ACCOUNT_ID`
   - Fails if any are missing/empty

6. **Deploy Worker to Cloudflare** (Lines 111–150)
   - Sets `HYPERDRIVE_ID` in `wrangler.toml` via `sed`
   - Pushes secrets: `STREAM_ACCOUNT_ID`, `BETTER_AUTH_SECRET`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STREAM_API_TOKEN`, `CALLS_APP_TOKEN`
   - Runs: `pnpm exec wrangler deploy` in `apps/worker/`

7. **Deploy Pages to Cloudflare** (Lines 152–160)
   - `pnpm exec wrangler pages deploy .vercel/output/static` in `apps/web/`

8. **Setup Custom Domains** (Lines 161–194)
   - Ensures Worker routes active (hardcoded in `wrangler.toml` `[[routes]]`)
   - Retrieves zone ID for `capricast.com`
   - Adds R2 custom domain: `assets.capricast.com`

9. **Health Check** (Lines 195–209)
   - Polls `https://api.capricast.com/health` up to 12 times (60s total)
   - Retries every 5s; fails if no 200 response
   - Confirms successful deployment

---

## 2. Deployment Configuration Files

### A. Worker Configuration: `apps/worker/wrangler.toml` (Lines 1–65)

```
Name: capricast-api (line 1)
Main: src/index.ts (line 2)
Compatibility Date: 2024-09-23 (line 3)
Flags: nodejs_compat (line 4)
```

**Durable Objects** (Lines 6–14):
- `VIDEO_ROOM` (class VideoRoom)
- `USER_PRESENCE` (class UserPresence)
- `CONFERENCE_ROOM` (class ConferenceRoom)

**Migrations** (Lines 16–20):
- v1: VideoRoom, UserPresence
- v2: ConferenceRoom

**Hyperdrive** (Lines 22–24):
- Binding: `DB`
- ID: `72697ebbf0d44419850743679390acf1` (fetched from secrets at deploy time)
- Note: Local dev uses `WRANGLER_HYPERDRIVE_LOCAL_CONNECTION_STRING_DB` env var

**R2 Bucket** (Lines 26–28):
- Binding: `R2_BUCKET`
- Bucket Name: `videoking-r2`

**Environment Variables (vars)** (Lines 30–49):
- `PLATFORM_FEE_PERCENT = "20"`
- `CHAT_RATE_LIMIT_*_MS` (Free/Citizen/VIP)
- `TRIAL_PERIOD_DAYS = "14"`
- `CONFERENCE_PROVIDER = "cloudflare_calls"`
- `ASSET_BASE_URL = "https://assets.capricast.com"` (production)
- `APP_BASE_URL = "https://capricast.com"` (production)
- `ALLOWED_ORIGINS = "https://capricast.com,https://itsjusus.com"`

**Secrets (set via CLI)** (Lines 51–57):
- `BETTER_AUTH_SECRET` (required)
- `STRIPE_SECRET_KEY` (required)
- `STRIPE_WEBHOOK_SECRET` (required)
- `STREAM_API_TOKEN` (required)
- `STREAM_ACCOUNT_ID` (required)
- `STREAM_CUSTOMER_DOMAIN` (required)
- `EMAIL_API_KEY` (optional)
- `CALLS_APP_TOKEN` (required)

**Routes** (Lines 59–61):
- Pattern: `api.capricast.com/*`
- Zone: `capricast.com`

**Cron Triggers** (Lines 63–65):
- Daily at 10:00 UTC: Trial expiry emails

### B. Pages Configuration: `apps/web/wrangler.toml` (Lines 1–7)

```
Name: videoking (line 1)
Compatibility Date: 2024-09-23 (line 2)
Build Output Dir: .vercel/output/static (line 3)
```

**Environment Variables** (Lines 5–7):
- `NEXT_PUBLIC_API_BASE_URL = "https://api.capricast.com"`
- `NEXT_PUBLIC_APP_URL = "https://capricast.com"`
- `NEXT_PUBLIC_ASSET_BASE_URL = "https://assets.capricast.com"`

### C. Next.js Configuration: `apps/web/next.config.ts` (Lines 1–44)

**Key Settings:**
- **Image Optimization:** `unoptimized: true` (Cloudflare doesn't support next/image optimization)
- **Remote Patterns:** Allow images from:
  - Asset bucket domain
  - Cloudflare Stream: `customer-*.cloudflarestream.com`
  - Video delivery: `videodelivery.net`
- **Trailing Slash:** `false`
- **React Compiler:** Disabled (uses standard memoization)
- **Build Method:** `@cloudflare/next-on-pages` (transformed by CI/CD)

### D. Workflow Scripts

**Pre-Deployment Checks** — `scripts/pre-deploy-checks.js` (Lines 1–100+):

```bash
pnpm run pre-deploy-check --strict --ci
```

Validates:
1. Required env vars: `NEXT_PUBLIC_API_BASE_URL`, `NEXT_PUBLIC_APP_URL`
2. Static files: `manifest.json`, `favicon.ico`, icon-192/512
3. No localhost in production builds (strict mode)
4. Cloudflare project names match config
5. GitHub Actions build settings valid

---

## 3. Environment Variables & Secrets

### A. Frontend (.env.local) — `apps/web/.env.local.example`

```bash
NEXT_PUBLIC_API_BASE_URL=http://localhost:8787          # Worker dev URL
NEXT_PUBLIC_STREAM_DOMAIN=your-subdomain.cloudflarestream.com
NEXT_PUBLIC_GOOGLE_IMA_SDK_URL=https://imasdk.googleapis.com/js/sdkloader/ima3.js
NEXT_PUBLIC_SUBSCRIPTION_PRICE_MONTHLY=price_xxxx
NEXT_PUBLIC_SUBSCRIPTION_PRICE_ANNUAL=price_xxxx
NEXT_PUBLIC_ANALYTICS_ID=
```

### B. Worker (.dev.vars) — `apps/worker/.dev.vars.example`

```bash
BETTER_AUTH_SECRET=your-secret-key-here-min-32-chars
STREAM_API_TOKEN=your-stream-api-token
STREAM_ACCOUNT_ID=your-stream-account-id
STREAM_CUSTOMER_DOMAIN=your-subdomain.cloudflarestream.com
STRIPE_SECRET_KEY=sk_test_xxxx
STRIPE_WEBHOOK_SECRET=whsec_xxxx
APP_BASE_URL=http://localhost:3000
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:3001
```

### C. Required GitHub Secrets (for CI/CD)

| Secret | Purpose | Required | Example |
|--------|---------|----------|---------|
| `CLOUDFLARE_API_TOKEN` | Deploy workers & pages | ✅ Yes | `v1.0xxx...` |
| `CLOUDFLARE_ACCOUNT_ID` | Account ID for Cloudflare API | ✅ Yes | `abc123def456` |
| `STREAM_ACCOUNT_ID` | Cloudflare Stream account | ✅ Yes | `xxxxxxxxxxxx` |
| `NEON_CONNECTION_STRING` | Database (optional for auto-migrate) | ❓ Optional | `postgresql://user:pass@...` |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Stripe public key | ✅ For Pages build | `pk_live_...` |
| `BETTER_AUTH_SECRET` | BetterAuth signing secret | ✅ Worker secret | (32+ chars) |
| `STRIPE_SECRET_KEY` | Stripe API secret | ✅ Worker secret | `sk_live_...` |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signing | ✅ Worker secret | `whsec_...` |
| `STREAM_API_TOKEN` | Stream API token | ✅ Worker secret | `s_...` |
| `CALLS_APP_TOKEN` | Cloudflare Calls token | ✅ Worker secret | `app_...` |
| `FACTORY_APP_ID` | Factory GitHub App (for PR review) | ✅ For reviews | (numeric) |
| `FACTORY_APP_PRIVATE_KEY` | Factory GitHub App private key | ✅ For reviews | (PEM format) |
| `ANTHROPIC_API_KEY` | Claude API (for PR review) | ✅ For reviews | `sk-ant-...` |

---

## 4. Monorepo Structure

**Root:** `pnpm-workspace.yaml` (Lines 1–2)

```yaml
packages:
  - "apps/*"
  - "packages/*"
```

**Root Package Manager:** pnpm 9.0.0 (line 2 in `package.json`)

### Apps

| App | Purpose | Config |
|-----|---------|--------|
| `apps/web/` | Next.js frontend (Cloudflare Pages) | `wrangler.toml`, `next.config.ts`, `package.json` |
| `apps/worker/` | Hono worker (API) | `wrangler.toml`, `src/index.ts`, `package.json` |

### Key Dependencies

**Web** (`apps/web/package.json`):
- `next@15.0.0`, `react@19.0.0`
- `@cloudflare/next-on-pages@1.12.0`
- `wrangler@3.57.0`

**Worker** (`apps/worker/package.json`):
- `hono@4.12.14`
- `drizzle-orm@0.45.2`, `postgres@3.4.0`
- `stripe@15.0.0`, `zod@4.4.3`
- `wrangler@4.0.0` (note: different from web)

### Build Tasks

**Turbo** (`turbo.json`):
- `build` → Outputs `.next/**`, `dist/**`
- `dev` → No cache, persistent
- `typecheck` → Depends on build
- `db:generate`, `db:migrate` → No cache

---

## 5. Current Deployment Status

### Active Branches

| Branch | Commit | Purpose | Status |
|--------|--------|---------|--------|
| `main` | `8d79145` | Production | ✅ Health check passing |
| `feat/cloudflare-calls-backend` | `29c044f` | WebRTC/Calls feature | 🔄 In development |
| `feat/cloudflare-calls-frontend` | `37b818b` | Calls UI | 🔄 In development (hardening fixes) |

### Recent Commits (Last 10)

| Commit | Message | Type |
|--------|---------|------|
| `37b818b` | fix(worker): resolve P0/P1 hardening issues from kanban | fix |
| `1978cfd` | chore(videoking): cut over capricast white-label domains | chore |
| `791904f` | feat(conference): implement WebRTC media pipeline and video UI | feat |
| `29c044f` | feat(conference): add Cloudflare Calls SFU backend | feat |
| `8d79145` | fix(ci): push all worker secrets during deploy | fix |
| `3c8c515` | fix(db): restore missing 0005_fair_mysterio.sql migration | fix |
| `dadf578` | fix(worker): add ?? "" fallbacks for nullable username | fix |
| `dc79ea1` | fix(ci): use conditional block in migration step | fix |
| `9e3df30` | fix(auth): repair BetterAuth sign-up | fix |
| `de3a061` | feat(ci): add manual db:migrate workflow | feat |

### Live Domains

| Domain | Service | Status | Notes |
|--------|---------|--------|-------|
| **https://capricast.com** | Pages Frontend | ✅ LIVE | Production |
| **https://api.capricast.com** | Worker API | ✅ LIVE | Health check: /health → 200 |
| **https://assets.capricast.com** | R2 Storage | ✅ LIVE | Custom domain configured |

### Last Successful Deployment

- **Date:** April 14, 2026
- **Commit:** `8d79145` (fix(ci): push all worker secrets during deploy)
- **Status:** All checks passed ✅
- **Health:** `/health` → 200

---

## 6. Secrets Management & Service Accounts

### Cloudflare Service Account

**Required for CI/CD:**
- **API Token Type:** API Token (not API Key, which is deprecated)
- **Permissions Needed:**
  - `Zone:Read` + `Zone:Edit` — For setting up custom domains
  - `Workers:Edit` + `Workers:Publish` — For Worker deployment
  - `Pages:Edit` + `Pages:Manage` — For Pages deployment
  - `R2:Edit` — For R2 bucket domain management

**Token Rotation:**
- Stored in GitHub Secrets
- No automatic rotation (manual process recommended every 90 days)
- Keep Account ID separate from token

### GitHub Service Account

**Factory GitHub App** (for PR review, auto-triage, project sync):
- **Secrets Required:**
  - `FACTORY_APP_ID` — App numeric ID
  - `FACTORY_APP_PRIVATE_KEY` — PEM-format private key
- **Purpose:** Fetch and run review scripts from factory repo

---

## 7. Local vs. CI Deployment Recommendations

### ✅ Tasks Suitable for Windows Local Dev

| Task | Command | Why Local Works | Notes |
|------|---------|-----------------|-------|
| **Code Changes** | `pnpm dev` | Fast feedback loop | No Cloudflare needed |
| **TypeScript Check** | `pnpm typecheck` | Cross-platform | Works on Windows |
| **Unit Tests** | `pnpm test` | Cross-platform | Works on Windows |
| **Build (dry-run)** | `cd apps/worker && pnpm build` | ESM build, no platform-specific code | Creates `dist/` without deploying |
| **Database Migrations** (local) | Via `.dev.vars` pointing to local Postgres | PostgreSQL client is cross-platform | Not recommended; use CI instead |

### ❌ Tasks That MUST Run on CI

| Task | Why CI Only | Workaround |
|------|------------|-----------|
| **next-on-pages Build** | Requires specific Node.js build setup; complex on Windows | Use `pnpm build:pages` in GitHub Actions (or WSL if local) |
| **Cloudflare Pages Deploy** | Requires API token (never store locally); only CI has secrets | Use GitHub Actions workflow |
| **Worker Secret Push** | Security: CLI prompts require interactive terminal; CI uses env vars | Use `wrangler secret put` in CI workflow |
| **Health Check Verification** | Depends on live deployment; can't verify locally | POST to live endpoint after CI deploy |
| **R2 Domain Setup** | Requires zone ID lookup; implies deployed Worker | Run in post-deploy step on CI |

### Local Windows Setup

**Prerequisites:**
```bash
# 1. Clone repo
git clone https://github.com/adrper79-dot/videoking.git
cd videoking

# 2. Install pnpm globally (if not already)
npm install -g pnpm@9.0.0

# 3. Create .dev.vars (Worker secrets)
cp apps/worker/.dev.vars.example apps/worker/.dev.vars
# Edit with actual secrets for local testing

# 4. Create .env.local (Frontend env)
cp apps/web/.env.local.example apps/web/.env.local
# Edit with localhost URLs

# 5. Install dependencies
pnpm install

# 6. Run dev server
pnpm dev
```

**Expected Output:**
- Worker: `http://localhost:8787/health` → 200
- Web: `http://localhost:3000/` → Next.js frontend

**Known Issues on Windows:**

1. **WSL-Only Commands in Scripts**
   - Some `.sh` scripts in CI use bash; Windows `cmd.exe` won't parse correctly
   - Solution: Use WSL (`wsl` command) or Git Bash
   - Example: `sed` command in deploy.yml won't work natively on Windows

2. **`next-on-pages` on Windows**
   - May fail if Node.js build environment is missing
   - Recommended: Use CI for `pnpm build:pages` or test in WSL
   - Local equivalent: Just run `pnpm build` (produces `.next/` dir)

3. **Wrangler CLI Path Issues**
   - Use `pnpm exec wrangler` (cross-platform) instead of `wrangler` directly
   - Required in `package.json` scripts

---

## 8. Deployment Readiness Assessment

### Current State: 🟢 **PRODUCTION-READY**

**✅ Passing Checks:**
- TypeScript: 0 errors across all packages
- Tests: `pnpm test:ci` passes
- Build: Worker (`dist/`) and Web (`.vercel/output/static/`) both ready
- Secrets: GitHub Actions workflow validates required secrets
- Health: `/health` endpoint returns 200
- Database: Migrations tracked and deployable

**⚠️ Known Issues (Non-Critical):**
- Deployment previews on Pages still return 404 (preview URLs are never production-ready; only production deployment URL works)
- `next-on-pages` build occasionally fails on Windows; workaround: use CI or WSL

**🔄 In-Progress Features:**
- Cloudflare Calls (WebRTC) implementation on `feat/cloudflare-calls-*` branches
- Not merged to `main` yet; won't affect production until PR merged

### Pre-Deployment Checklist

Before pushing to production (automated in CI, but verify manually):

```bash
# 1. Local validation
pnpm pre-deploy-check --strict

# 2. Verify secrets exist (GitHub Settings → Secrets and variables)
- CLOUDFLARE_API_TOKEN          ✓
- CLOUDFLARE_ACCOUNT_ID         ✓
- STREAM_ACCOUNT_ID             ✓
- NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY  ✓
- BETTER_AUTH_SECRET            ✓
- STRIPE_SECRET_KEY             ✓
- STRIPE_WEBHOOK_SECRET         ✓
- STREAM_API_TOKEN              ✓
- CALLS_APP_TOKEN               ✓
- FACTORY_APP_ID                ✓
- FACTORY_APP_PRIVATE_KEY       ✓
- ANTHROPIC_API_KEY             ✓

# 3. Verify production URLs (not localhost)
wrangler.toml: api.capricast.com
next.config.ts: https://capricast.com
wrangler-pages.toml: https://capricast.com

# 4. Run full test suite
pnpm test:ci

# 5. TypeScript check
pnpm typecheck
```

### Post-Deployment Verification

After CI/CD completes:

```bash
# 1. Health endpoint
curl https://api.capricast.com/health
# Expected: 200 OK

# 2. Frontend loading
curl https://capricast.com/
# Expected: 200 OK (HTML page)

# 3. API route (example)
curl https://api.capricast.com/api/auth/session \
  -H "content-type: application/json"
# Expected: 200 or 401 (not 5xx)
```

---

## 9. Key Configuration Decisions

| Decision | Rationale | Trade-offs |
|----------|-----------|-----------|
| **Cloudflare Workers (not Express/Fastify)** | CLAUDE.md mandate for edge runtime | Limited to edge environment (no Node.js libs) |
| **next-on-pages (not Next.js standard export)** | Cloudflare Pages doesn't support App Router with functions; needs transformation | Build only works on Linux/CI; Windows workaround via WSL |
| **Hyperdrive ID in wrangler.toml** | Enables local dev with Postgres | Must update via `sed` during deploy (hardcoded in repo) |
| **Secrets via `wrangler secret put`** | Industry standard; keeps secrets out of config files | Requires API token; CI-only-appropriate |
| **Health check in deploy workflow** | Ensures Worker is responding before declaring success | Adds 60s to deployment (acceptable trade-off) |
| **No automatic migrations** | Cautious approach; manual `NEON_CONNECTION_STRING` trigger | Requires workflow dispatch or CI retry |

---

## 10. Troubleshooting Quick Reference

| Issue | Root Cause | Fix |
|-------|-----------|-----|
| **Deployment: "Secret is empty"** | GitHub secret not set or has whitespace | Go to Settings → Secrets → verify value exists |
| **Worker deploys but Pages is 404** | Pages deployment incomplete; only preview URL created | Re-run deploy workflow or manually: `cd apps/web && pnpm deploy` |
| **TypeScript errors in CI** | Local `pnpm typecheck` didn't catch them (different env) | Run `pnpm typecheck` before pushing; check `tsconfig.json` settings |
| **`next-on-pages` fails on Windows** | Build environment incompatibility | Use WSL or let CI handle it; don't build locally on Windows |
| **Health check timeout (>60s)** | Worker not responding (still warming up or crashed) | Check `curl https://api.capricast.com/health` manually; review Worker error logs |
| **Migrations not applied** | `NEON_CONNECTION_STRING` secret not set | Add secret to GitHub, then trigger `db-migrate.yml` workflow manually |
| **R2 domain add fails** | Zone ID lookup failed; domain already exists | Check zone ID matches `capricast.com`; can be set up manually in Cloudflare dashboard |

---

## Summary Table

| Aspect | Value | Status |
|--------|-------|--------|
| **Runner OS** | ubuntu-latest | ✅ |
| **Node Version** | 20 | ✅ |
| **Package Manager** | pnpm 9.0.0 | ✅ |
| **Monorepo Tool** | Turborepo 2.0.0 | ✅ |
| **Frontend Framework** | Next.js 15 | ✅ |
| **Backend Runtime** | Cloudflare Workers | ✅ |
| **Build Output** | @cloudflare/next-on-pages | ✅ |
| **Database** | Neon Postgres (Hyperdrive) | ✅ |
| **Secrets Manager** | GitHub Actions (22 secrets required) | ✅ |
| **Health Endpoint** | `https://api.capricast.com/health` | ✅ |
| **Production Domains** | 3 (Pages, Worker, R2) | ✅ |
| **Last Successful Deploy** | April 14, 2026 | ✅ |
| **Deployment Time** | ~10 minutes (including 60s health check) | ✅ |

---

**Generated:** May 10, 2026

