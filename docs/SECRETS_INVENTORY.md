# VideoKing Secrets Inventory

## Purpose

This inventory defines required secrets for VideoKing deployments, runtime behavior, and CI/CD automation.

## Secret Catalog

| Secret | Required | Scope | Storage | Rotation |
|---|---|---|---|---|
| CF_API_TOKEN | yes | CI deploy | GitHub Actions secret | every 90 days |
| CF_ACCOUNT_ID | yes | CI deploy | GitHub Actions secret | on account change |
| BETTER_AUTH_SECRET | yes | worker runtime | Wrangler secret | annual or on compromise |
| JWT_SECRET | yes | worker runtime | Wrangler secret | annual or on compromise |
| DATABASE_URL | yes | migration jobs | GitHub Actions secret | on DB credential rotation |
| STRIPE_SECRET_KEY | yes | worker runtime | Wrangler secret | on compromise or policy |
| STRIPE_WEBHOOK_SECRET | yes | worker runtime | Wrangler secret | on webhook recreation |
| NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY | yes | frontend build | GitHub Actions secret/var | on key rotation |
| STREAM_API_TOKEN | yes | worker runtime | Wrangler secret | every 90 days |
| STREAM_ACCOUNT_ID | yes | worker runtime | Wrangler secret | on account change |
| STREAM_CUSTOMER_DOMAIN | yes | worker runtime | Wrangler secret | on domain change |
| POSTHOG_API_KEY | optional | worker analytics | Wrangler secret | on project rotation |
| SENTRY_DSN | recommended | worker monitoring | Wrangler secret | on project rotation |
| EMAIL_API_KEY | optional | worker email | Wrangler secret | every 90 days |
| R2_ACCESS_KEY_ID | yes for video pipeline | CI workflow | GitHub Actions secret | every 90 days |
| R2_SECRET_ACCESS_KEY | yes for video pipeline | CI workflow | GitHub Actions secret | every 90 days |
| R2_BUCKET_NAME | yes for video pipeline | CI workflow | GitHub Actions secret/var | on infra change |
| R2_PUBLIC_DOMAIN | yes for video pipeline | CI workflow | GitHub Actions secret/var | on infra change |
| WORKER_API_TOKEN | yes for internal worker callbacks | CI + runtime | GitHub Actions + Wrangler secret | every 90 days |

## Secret Locations

Primary locations:
- GitHub Actions Secrets for CI pipelines and deploy jobs.
- Wrangler secrets for worker runtime confidential values.
- .dev.vars for local development only.

Not allowed:
- Committing secret values into repository files.
- Storing secrets in wrangler.toml vars.

## GitHub Actions Setup

Set repository secrets:

```bash
gh secret set CF_API_TOKEN --repo Latimer-Woods-Tech/videoking
gh secret set CF_ACCOUNT_ID --repo Latimer-Woods-Tech/videoking
gh secret set DATABASE_URL --repo Latimer-Woods-Tech/videoking
```

Set additional secrets as required by workflows.

## Wrangler Runtime Setup

Use per-environment secret provisioning:

```bash
cd _external_reviews/videoking/apps/worker
wrangler secret put BETTER_AUTH_SECRET
wrangler secret put STRIPE_SECRET_KEY
wrangler secret put STRIPE_WEBHOOK_SECRET
wrangler secret put JWT_SECRET
```

Staging:

```bash
wrangler secret put BETTER_AUTH_SECRET --env staging
wrangler secret put STRIPE_SECRET_KEY --env staging
wrangler secret put STRIPE_WEBHOOK_SECRET --env staging
wrangler secret put JWT_SECRET --env staging
```

## Rotation Schedule

| Secret Category | Schedule | Trigger |
|---|---|---|
| Cloudflare deploy tokens | 90 days | scheduled security rotation |
| Stripe API and webhook secrets | event-driven | suspected compromise or webhook endpoint reset |
| JWT and BetterAuth secrets | annual | planned annual rotation or security event |
| R2 access keys | 90 days | scheduled security rotation |

## Rotation Runbook Summary

1. Create new secret value.
2. Update secret in destination store.
3. Deploy and verify health.
4. Invalidate old secret.
5. Document rotation timestamp and owner.

## Emergency Access and Governance

- Deploy override authority: CTO.
- Cloudflare production access: DevOps team with MFA.
- Stripe production dashboard access: approved finance/DevOps admins only.
- All production access requires MFA.

## Verification Checklist After Secret Change

- API health is 200.
- Frontend loads.
- Login works with test account.
- Stripe webhook test event succeeds.
- No elevated error rate in Sentry.

## Audit Checklist

- Quarterly secret inventory review complete.
- Expired tokens removed.
- Access list reviewed.
- MFA enrollment validated.
- Rotation evidence logged.
