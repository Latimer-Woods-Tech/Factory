# VideoKing Environment Setup

## Purpose

This guide defines how to configure local, staging, and production environments for VideoKing deployment workflows.

## Environments

| Environment | Frontend | API Worker | Database | Stripe |
|---|---|---|---|---|
| Local | localhost:3000 | localhost:8787 | local postgres or Neon dev branch | test mode |
| Staging | staging Pages URL | capricast-api-staging worker | Neon staging branch | test mode |
| Production | capricast.com | api.capricast.com | Neon main | live mode |

## Local Development Setup

Prerequisites:
- Node.js 20+
- pnpm 9+
- Wrangler CLI
- Docker/Postgres or Neon development branch

Steps:
1. Install dependencies.
2. Create local environment files.
3. Start worker and web servers.
4. Verify local health endpoints.

```bash
cd _external_reviews/videoking
pnpm install
cp apps/worker/.dev.vars.example apps/worker/.dev.vars
cp apps/web/.env.local.example apps/web/.env.local
```

Example apps/worker/.dev.vars:

```dotenv
BETTER_AUTH_SECRET=replace-with-local-secret
STRIPE_SECRET_KEY=sk_test_replace
STRIPE_WEBHOOK_SECRET=whsec_replace
STREAM_API_TOKEN=replace
STREAM_ACCOUNT_ID=replace
STREAM_CUSTOMER_DOMAIN=stream.capricast.com
POSTHOG_API_KEY=phc_replace
EMAIL_API_KEY=re_replace
```

Example apps/web/.env.local:

```dotenv
NEXT_PUBLIC_API_URL=http://localhost:8787
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_replace
```

Start services:

```bash
# terminal 1
cd _external_reviews/videoking/apps/worker
pnpm dev

# terminal 2
cd _external_reviews/videoking/apps/web
pnpm dev
```

Verify:

```bash
curl -i http://localhost:8787/health
curl -I http://localhost:3000/
```

## Staging Environment Setup

Staging should isolate critical dependencies.

Requirements:
- Separate Hyperdrive binding
- Separate R2 bucket
- Separate Stripe test webhook endpoint

Worker deploy (staging):

```bash
cd _external_reviews/videoking/apps/worker
pnpm exec wrangler deploy --env staging
```

Recommended staging vars:
- APP_BASE_URL should point to staging API URL.
- STRIPE keys must remain in test mode.

## Production Environment Setup

Production requirements:
- Domain: capricast.com and api.capricast.com
- Worker route attached to capricast.com zone
- Main Neon database via Hyperdrive
- Stripe live keys and webhook secret

Deployment entry point:

```bash
bash scripts/deploy-prod.sh
```

## wrangler.toml Pattern

Use vars for non-secret config only.

```toml
[vars]
APP_BASE_URL = "https://capricast.com"
ASSET_BASE_URL = "https://assets.capricast.com"
CHAT_RATE_LIMIT_FREE_MS = "10000"
CHAT_RATE_LIMIT_CITIZEN_MS = "1000"
CHAT_RATE_LIMIT_VIP_MS = "500"

# Secrets should be set with wrangler secret put
```

## Secrets Placement Rules

- Local: apps/worker/.dev.vars (never commit)
- CI: GitHub Actions secrets
- Runtime production: Wrangler secrets on worker

Never store secrets in:
- wrangler.toml vars
- source code
- committed .env files

## Miniflare Notes

For local worker runtime parity, use Wrangler dev with local bindings as configured in .dev.vars.

## SQLite Option for Local Testing

If local tests need lightweight DB behavior, use SQLite-backed test harness only for unit/integration tests.
Do not treat SQLite behavior as full parity with Neon PostgreSQL.

## Environment Validation Commands

```bash
# local validation
pnpm pre-deploy-check
pnpm typecheck
pnpm test

# deployment verification
bash scripts/verify-deployment.sh --frontend-url https://capricast.com --api-url https://api.capricast.com
```

## Environment Drift Prevention

- Keep a versioned environment inventory in docs.
- Audit secret keys quarterly.
- Verify route, domain, and webhook URLs before every production release.
