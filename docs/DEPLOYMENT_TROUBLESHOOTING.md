# VideoKing Deployment Troubleshooting Guide

## Scope

This document is a fast decision-tree companion for production and staging deployments of VideoKing.

Services in scope:
- Frontend: Cloudflare Pages, capricast.com
- API Worker: Cloudflare Workers + Hono, api.capricast.com
- Database: Neon PostgreSQL via Hyperdrive binding
- Auth: BetterAuth
- Payments: Stripe webhooks and API operations

Primary rule:
- If frontend build uses next-on-pages, run deployment from Linux, WSL, or CI.

## Severity Levels

| Severity | Definition | Action |
|---|---|---|
| SEV-1 | Production down, auth down, payment webhook dead | Roll back first, investigate second |
| SEV-2 | Partial outage, elevated errors | Investigate now, rollback if > 15 minutes |
| SEV-3 | Non-critical bug, narrow blast radius | Fix-forward, schedule patch |

## Decision Tree A: Frontend Build Fails on Windows

```
Start
  |
  +-- Are you on native Windows shell? -- yes --> Use WSL/Linux/CI and rerun build
  |                                           |
  |                                           +-- Build now passes? -- yes --> continue deploy
  |                                                                |
  |                                                                +-- no --> clear lockfile cache, reinstall, retry
  |
  +-- no --> Check pnpm/node versions and rerun build:pages
```

Checks:
- Confirm environment is Linux or CI runner.
- Run `pnpm build` then `pnpm build:pages` in apps/web.
- Verify `.vercel/output/static` exists.

Remediation:
- Use CI pipeline for authoritative frontend deploy.
- Do not block production worker hotfixes on frontend build if frontend unchanged.

## Decision Tree B: Worker Deployment Timeout or Upload Failure

```
Start
  |
  +-- wrangler deploy timeout? -- yes --> Check bundle size and dependencies
  |                                        |
  |                                        +-- Bundle too large? -- yes --> trim unused deps and dynamic imports
  |                                        |                                then redeploy
  |                                        |
  |                                        +-- no --> retry deploy and check Cloudflare status page
  |
  +-- no --> Inspect runtime errors after deploy
```

Checks:
- Run worker build dry-run and inspect dist output.
- Review recent dependency additions.
- Confirm CF_API_TOKEN and CF_ACCOUNT_ID are valid.

Remediation:
- Remove unused SDKs and test data from runtime path.
- Split heavy modules behind lazy imports.
- Redeploy and run health checks.

## Decision Tree C: Database Migration Fails

```
Start
  |
  +-- Is failure in dry-run? -- yes --> fix migration script before apply
  |
  +-- Is failure in apply? -- yes --> stop deploy, evaluate rollback risk
  |                                    |
  |                                    +-- Can migration be safely reversed? -- yes --> run down migration
  |                                    |
  |                                    +-- no --> execute forward fix and monitor
  |
  +-- no --> continue deploy
```

Checks:
- Confirm pending migration list.
- Run dry-run first.
- Validate foreign-key assumptions with current production data.

Remediation:
- Apply idempotent migration patches.
- If rollback needed, use branch backup and PITR process.
- Re-run smoke tests on staging after fix.

## Decision Tree D: API Health Check Returns 503

```
Start
  |
  +-- First check within 30 seconds of deploy? -- yes --> retry health check
  |                                                     |
  |                                                     +-- 200 after retry? -- yes --> continue
  |
  +-- no or still failing --> inspect worker logs and DB connectivity
                                 |
                                 +-- Hyperdrive/DB issue? -- yes --> verify binding + Neon availability
                                 |
                                 +-- no --> rollback and open incident
```

Checks:
- Run `curl https://api.capricast.com/health`.
- Verify worker logs for DB connection errors.
- Confirm Hyperdrive binding and database endpoint health.

Remediation:
- Restart by redeploying same commit once.
- If still failing, rollback to previous stable commit.

## Decision Tree E: Auth Broken After Deploy

```
Start
  |
  +-- Login fails for all users? -- yes --> check JWT/BetterAuth secrets and host settings
  |                                          |
  |                                          +-- Secret changed unexpectedly? -- yes --> restore prior value
  |                                          |
  |                                          +-- trustHost mismatch? -- yes --> correct domain config + redeploy
  |
  +-- no --> isolate account-level issue and inspect logs
```

Checks:
- Verify BETTER_AUTH_SECRET and JWT-related secrets.
- Verify callback/trusted domain configuration for capricast.com and api.capricast.com.

Remediation:
- Restore secret from secret manager history.
- Redeploy worker only.
- Validate login with test account.

## Decision Tree F: Stripe Webhooks Not Triggering

```
Start
  |
  +-- No webhook events received? -- yes --> confirm endpoint URL and secret in Stripe dashboard
  |                                          |
  |                                          +-- URL changed? -- yes --> update endpoint URL
  |                                          |
  |                                          +-- Secret mismatch? -- yes --> sync STRIPE_WEBHOOK_SECRET
  |
  +-- Events received but failing --> inspect signature verification and handler logs
```

Checks:
- Endpoint should target `https://api.capricast.com/api/webhooks/stripe`.
- Secret should match `STRIPE_WEBHOOK_SECRET` in worker secrets.
- Stripe event delivery logs should show 2xx.

Remediation:
- Recreate webhook signing secret if uncertain.
- Replay failed events from Stripe dashboard.

## Tactical Recovery Commands

```bash
# API health
curl -i https://api.capricast.com/health

# Frontend availability
curl -I https://capricast.com/

# Trigger verification script
bash scripts/verify-deployment.sh --frontend-url https://capricast.com --api-url https://api.capricast.com
```

## Incident Escalation

Escalate to on-call immediately when:
- API health remains non-200 for more than 5 minutes.
- Stripe webhook failures exceed 5% over 10 minutes.
- Auth failures exceed 10% of login attempts.

Escalation path:
1. Deployment engineer
2. DevOps on-call
3. Incident commander
4. CTO for production override decisions

## Post-Incident Checklist

- Document timeline with UTC timestamps.
- Record triggering change (commit, migration, secret rotation, infra event).
- Confirm customer impact window.
- Add permanent prevention control in CI or runbook.
- Link incident report in deployment PR.
