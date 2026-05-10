# VideoKing Production Deployment Runbook

Version: 1.0
Last Updated: 2026-05-10
Owners: VideoKing Engineering, DevOps
Audience: Junior engineers, DevOps team, CI/CD maintainers

## Purpose

This runbook provides a self-service deployment and troubleshooting standard for VideoKing.

It is designed for:
- Engineers deploying from CI or Linux environments.
- On-call responders handling production incidents.
- Automation systems that need deterministic checks and rollback gates.

## Scope

Systems covered:
- Frontend: Next.js 15 on Cloudflare Pages at https://capricast.com.
- Backend API: Cloudflare Worker + Hono at https://api.capricast.com.
- Async worker responsibilities: video processing orchestration, schedule events, webhook handling.
- Database: Neon PostgreSQL via Hyperdrive binding.
- Auth: BetterAuth v1.0 (JWT + OAuth).
- Payments: Stripe API + webhooks.

Known blocker:
- Native Windows next-on-pages workflow is not production-safe for this repository.
- Frontend build and deploy must run in Linux, WSL, or CI.

## Operating Principles

1. Deploy from a clean git state.
2. Validate before deploy.
3. Prefer CI for production deployment.
4. Verify with curl status checks, not assumptions.
5. Use rollback fast when customer impact is active.
6. Treat database migrations as high-risk operations.
7. Never store secrets in source control.

## Runtime Topology

| Layer | Service | Domain | Runtime |
|---|---|---|---|
| Frontend | Cloudflare Pages | capricast.com | Static + edge functions output |
| API | Cloudflare Worker | api.capricast.com | Hono on Cloudflare Workers |
| Data | Neon PostgreSQL | private | Hyperdrive binding to Worker |
| Auth | BetterAuth | api.capricast.com | Worker-managed auth routes |
| Payments | Stripe | dashboard.stripe.com | External API + webhook push |
| Media | Stream + R2 | assets.capricast.com | Cloudflare storage/streaming |

## Section Index

1. Quick Start (5-10 min)
2. Deployment Phases (step-by-step)
3. Deployment Matrix (platform compatibility)
4. Common Deployment Scenarios (decision tree)
5. Environment Management
6. Troubleshooting Guide
7. Verification Checklists
8. Secrets and Credentials Management
9. Monitoring and Alerts During Deployment
10. Rollback Procedures
11. Documentation and Communication
12. Advanced Topics
13. Appendices

---

# 1. Quick Start (5-10 min)

## 1.1 Prerequisite Checks

Run these commands before deploy:

```bash
git --version
pnpm --version
wrangler --version
node --version
```

Expected:
- Git installed and working.
- pnpm installed.
- Wrangler installed and authenticated.
- Node version compatible with project requirements.

Check Cloudflare auth:

```bash
wrangler whoami
```

Check required CI/local env values:

```bash
printenv CF_API_TOKEN >/dev/null && echo "CF_API_TOKEN set"
printenv CF_ACCOUNT_ID >/dev/null && echo "CF_ACCOUNT_ID set"
```

## 1.2 One-Command Production Deploy

Preferred:

```bash
bash scripts/deploy-prod.sh
```

If project-level alias exists in your clone:

```bash
npm run deploy:prod
```

Manual sequence if script is unavailable:

```bash
cd _external_reviews/videoking
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test

cd apps/web
pnpm build
pnpm build:pages
pnpm exec wrangler pages deploy .vercel/output/static --project-name capricast

cd ../worker
pnpm build
pnpm exec wrangler deploy

cd ../../..
bash scripts/verify-deployment.sh --frontend-url https://capricast.com --api-url https://api.capricast.com
```

## 1.3 Verification Checklist (Three Health Checks)

Minimum checks immediately after deploy:

```bash
curl -i https://api.capricast.com/health
curl -I https://capricast.com/
curl -i https://api.capricast.com/api/stripe/connect/status
```

Pass criteria:
- API health returns 200.
- Frontend root returns 200/301/302.
- Unauthenticated protected endpoint returns 401/403, not 5xx.

---

# 2. Deployment Phases

## Overview

This section defines required phases and decision points.

Phase list:
- Phase 1: Pre-deployment validation.
- Phase 2: Build artifacts.
- Phase 3: Database migrations.
- Phase 4: Staging deploy (optional but recommended for risky changes).
- Phase 5: Production deploy.
- Phase 6: Verification and rollback readiness.

## Phase 1: Pre-Deployment Validation

### 2.1.1 Validation Questions

- Is git status clean?
- Does TypeScript pass?
- Are tests green?
- Are secrets configured?

### 2.1.2 Commands

```bash
cd _external_reviews/videoking
git status --porcelain
pnpm typecheck
pnpm test
pnpm pre-deploy-check
```

Decision gate:
- If any command fails, stop deployment.

### 2.1.3 Decision Tree

```
Start
  |
  +-- git clean? -- no --> stop, commit or stash
  |
  +-- typecheck pass? -- no --> fix types, rerun
  |
  +-- tests pass? -- no --> fix failing tests, rerun
  |
  +-- secrets present? -- no --> provision secrets
  |
  +-- all pass --> proceed to Phase 2
```

## Phase 2: Build Artifacts

### 2.2.1 Frontend Build

```bash
cd _external_reviews/videoking/apps/web
pnpm build
pnpm build:pages
```

Artifact expected:
- .vercel/output/static exists and contains build output.

### 2.2.2 Worker Build

```bash
cd _external_reviews/videoking/apps/worker
pnpm build
```

Artifact expected:
- dist directory exists from wrangler dry-run output.

### 2.2.3 Decision Tree

```
Start Phase 2
  |
  +-- web build success? -- no --> fix frontend build
  |
  +-- pages build success? -- no --> use Linux/CI, rerun
  |
  +-- worker build success? -- no --> inspect worker compile errors
  |
  +-- artifacts exist? -- no --> stop and rebuild
  |
  +-- all pass --> proceed to Phase 3
```

## Phase 3: Database Migrations (If Needed)

### 2.3.1 Identify Pending Migrations

```bash
cd _external_reviews/videoking/packages/db
ls -la
pnpm db:generate
```

### 2.3.2 Dry-Run Migration

```bash
pnpm exec drizzle-kit push --dry-run
```

### 2.3.3 Apply Migration

```bash
pnpm db:migrate
```

### 2.3.4 Rollback Plan Requirement

Before applying migration:
- Confirm backup/restore plan.
- Confirm rollback SQL or forward-fix path.
- Confirm maintenance communication if risk is medium/high.

### 2.3.5 Decision Tree

```
Migration needed?
  |
  +-- no --> proceed to Phase 4 or 5
  |
  +-- yes --> dry-run pass?
             |
             +-- no --> fix migration
             |
             +-- yes --> backup confirmed?
                          |
                          +-- no --> create backup plan first
                          |
                          +-- yes --> apply migration and verify schema
```

## Phase 4: Deploy to Staging (Optional Pre-Prod Test)

Recommended when:
- Auth changes.
- Payment/webhook changes.
- Schema changes.
- Durable Object changes.

### 2.4.1 Worker Staging Deploy

```bash
cd _external_reviews/videoking/apps/worker
pnpm exec wrangler deploy --env staging
```

### 2.4.2 Staging Validation

```bash
curl -i https://capricast-api-staging.adrper79.workers.dev/health
```

Proceed only after staging checks pass.

## Phase 5: Deploy to Production

### 2.5.1 Frontend Pages Deploy

```bash
cd _external_reviews/videoking/apps/web
pnpm build
pnpm build:pages
pnpm exec wrangler pages deploy .vercel/output/static --project-name capricast
```

### 2.5.2 Worker Deploy

```bash
cd _external_reviews/videoking/apps/worker
pnpm exec wrangler deploy
```

### 2.5.3 Immediate Health Checks

```bash
curl -i https://api.capricast.com/health
curl -I https://capricast.com/
```

### 2.5.4 Smoke Tests

Run script:

```bash
bash scripts/verify-deployment.sh --frontend-url https://capricast.com --api-url https://api.capricast.com
```

## Phase 6: Verification and Rollback Plan

### 2.6.1 Required Functional Verifications

- All critical endpoints respond with expected status.
- Auth login works with test account.
- Stripe webhook endpoint receives and processes events.
- Error rates and latency remain inside guardrails.

### 2.6.2 Rollback Readiness

You must have at least one rollback option ready before closing deployment:
- Code rollback via git revert.
- Worker rollback via wrangler rollback.
- Database rollback or PITR plan.

### 2.6.3 Decision Tree

```
Verification pass?
  |
  +-- yes --> complete deployment and notify stakeholders
  |
  +-- no --> impact severe?
             |
             +-- yes --> initiate rollback now
             |
             +-- no --> fix-forward within defined window
```

---

# 3. Deployment Matrix (Platform Compatibility)

| Task | macOS | Linux | Windows | CI |
|---|---|---|---|---|
| pnpm build | OK | OK | OK | OK |
| pnpm build:pages | WARN (prefer Linux shell) | OK | NO (native) | OK |
| wrangler deploy | OK | OK | OK | OK |
| Database migration | OK | OK | OK | OK |

Matrix notes:
- Native Windows next-on-pages remains blocked for production workflows.
- Linux or CI is the canonical production path.
- WSL is acceptable for developer-triggered frontend builds.

---

# 4. Common Deployment Scenarios (Decision Tree)

## Scenario A: Hotfix (1-2 Files Changed)

### Trigger

Small urgent fix with limited blast radius.

### Steps

1. Create branch from main.
2. Implement fix and add targeted test.
3. Run typecheck and relevant tests.
4. Merge to main.
5. CI deploys automatically.

### Rollback

```bash
git revert <commit> --no-edit
git push
```

Expected rollback time: 1-2 minutes after CI starts.

### Decision Tree

```
Hotfix needed?
  |
  +-- yes --> is change isolated?
             |
             +-- no --> use standard deploy path
             |
             +-- yes --> hotfix path + CI deploy
```

## Scenario B: Database Schema Change

### Steps

1. Write migration.
2. Dry-run migration.
3. Test on staging environment.
4. Deploy application code.
5. Apply migration in production window if needed.

### Rollback

- Use migration down script if available.
- If unsafe, use forward fix and data repair.
- For severe failures, use Neon point-in-time restore plan.

### Downtime Note

Some schema changes may require short maintenance windows.

## Scenario C: Feature Flag Change Without Code Change

### Steps

1. Update Wrangler env variable or secret-backed toggle.
2. Redeploy worker only.
3. Verify behavior change.

### Rollback

1. Revert env var to previous value.
2. Redeploy worker.

Benefit:
- Very low blast radius.
- No frontend build required.

## Scenario D: Crisis Rollback (Production Broken)

### Steps

1. Declare incident.
2. Execute immediate rollback.
3. Verify health endpoints.
4. Confirm customer-facing recovery.
5. Start root-cause analysis.

### Rollback Command

```bash
git revert <bad-commit> --no-edit
git push
```

If CI blocked and emergency requires direct rollback:

```bash
cd _external_reviews/videoking/apps/worker
wrangler rollback
```

### Post-Incident Required Actions

- Timeline.
- Root cause.
- Detection gaps.
- Permanent prevention action.

---

# 5. Environment Management

## 5.1 Staging Environment

Recommended for risky changes.

Staging controls:
- Separate database branch.
- Separate R2 bucket.
- Stripe test mode only.
- Isolated webhook endpoint.

Staging worker config:
- capricast-api-staging worker name.
- Hyperdrive staging binding ID.

## 5.2 Production Environment

Production controls:
- Main Neon database branch.
- Production R2 bucket.
- Stripe live mode.
- Production custom domains:
  - capricast.com
  - api.capricast.com

## 5.3 Local Development

Local controls:
- Use .dev.vars (never commit).
- Use Wrangler dev for worker runtime.
- Use local DB or Neon dev branch.
- Use Stripe test credentials.

Reference setup:
- See docs/ENVIRONMENT_SETUP.md.

---

# 6. Troubleshooting Guide (Common Issues)

## 6.1 Frontend Build Fails on Windows

Cause:
- next-on-pages incompatibility on native Windows shell.

Fix:
- Deploy from Linux, WSL, or CI.

Workaround:
- Run build:pages in CI and publish artifacts there.

## 6.2 Worker Deployment Timeout

Cause:
- Bundle size too large or transient Cloudflare issue.

Fix:
- Reduce dependency weight.
- Remove unused imports.
- Retry deploy.

## 6.3 Database Migration Fails

Cause:
- Schema conflicts or FK violations.

Rollback:
- Use migration down where safe.
- If needed, invoke PITR plan.

Prevention:
- Dry-run and staging validation first.

## 6.4 Health Check Fails (API 503)

Cause:
- Cold start delay or DB unavailable.

Fix:
- Retry for up to 30 seconds.
- Validate Hyperdrive and Neon status.

## 6.5 Auth Broken Post-Deploy

Cause:
- JWT/BETTER_AUTH secret mismatch.
- BetterAuth domain/trusthost config mismatch.

Fix:
- Verify worker secrets and config.
- Redeploy worker.

## 6.6 Stripe Webhooks Not Triggering

Cause:
- Endpoint URL drift.
- Signature secret mismatch.

Fix:
- Update Stripe endpoint URL to production API path.
- Sync STRIPE_WEBHOOK_SECRET.
- Replay failed events.

Reference:
- See docs/DEPLOYMENT_TROUBLESHOOTING.md for decision trees.

---

# 7. Verification Checklists

## 7.1 Pre-Deployment Checklist

- [ ] Code review approved.
- [ ] Tests pass locally or in CI.
- [ ] TypeScript check passes.
- [ ] No untracked config drift.
- [ ] Backup strategy documented for risky changes.
- [ ] Secrets validated in target environment.

## 7.2 Post-Deployment Checklist

- [ ] curl https://api.capricast.com/health returns 200.
- [ ] curl https://capricast.com/ returns valid response.
- [ ] Sign-in with test account works.
- [ ] Stripe webhook received recent event.
- [ ] New feature verified via smoke test.

## 7.3 24h Post-Deployment Checklist

- [ ] No Sentry error spike.
- [ ] API latency normal (< 500ms p95 target).
- [ ] Database connection pool healthy.
- [ ] No customer complaints indicating regression.

---

# 8. Secrets and Credentials Management

## 8.1 Required Secrets

Core deployment and runtime secrets:
- CF_API_TOKEN
- CF_ACCOUNT_ID
- DATABASE_URL
- STRIPE_SECRET_KEY
- STRIPE_WEBHOOK_SECRET
- JWT_SECRET
- BETTER_AUTH_SECRET
- STREAM_API_TOKEN
- STREAM_ACCOUNT_ID
- NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY

## 8.2 Secret Storage Rules

Where secrets live:
- GitHub Actions secrets for CI deployment and migration jobs.
- Wrangler secrets for runtime worker secrets.
- .dev.vars for local development only.

Never store secrets in:
- wrangler vars blocks.
- source files.
- committed env files.

## 8.3 Rotation Schedule

- CF_API_TOKEN: quarterly (90 days).
- Stripe keys: immediately on compromise, otherwise policy-driven.
- JWT/BETTER_AUTH secrets: annual and on compromise.

## 8.4 Emergency Access

- Deployment override authority: CTO only.
- Cloudflare account access: DevOps team with MFA.
- Production deploy operations require MFA and audit logs.

Reference:
- See docs/SECRETS_INVENTORY.md.

---

# 9. Monitoring and Alerts During Deployment

## 9.1 Dashboards to Watch

- Cloudflare analytics dashboard.
- Sentry error tracking dashboard.
- PostHog product analytics dashboard.

## 9.2 Alert Triggers

- Error rate > 5%: page on-call.
- API latency > 1000ms p95: warn ops channel.
- Database connection saturation: critical alert.

## 9.3 Metrics to Watch

- /health response time and status.
- Auth success rate.
- Stripe webhook success rate.
- WebSocket connection count and churn.

## 9.4 Deployment Observation Window

Minimum active monitoring windows:
- T+0 to T+15 minutes: high-frequency checks.
- T+15 to T+60 minutes: standard checks.
- T+24 hours: follow-up health review.

---

# 10. Rollback Procedures

## 10.1 Rollback to Previous Commit

```bash
git revert <commit> --no-edit
git push
```

Use when:
- Regression tied to known commit.
- CI pipeline still functional.

## 10.2 Emergency Rollback

Safer emergency option:

```bash
cd _external_reviews/videoking/apps/worker
wrangler rollback
```

Extreme option (high risk, history rewrite):

```bash
git tag previous-stable
git reset --hard previous-stable
git push --force origin main
```

Warning:
- Force push can lose commits and disrupt collaborators.
- Require incident commander and CTO signoff.

## 10.3 Database Rollback

```bash
# Example sequence
# 1) create branch backup in Neon
# 2) dry-run rollback migration
# 3) apply carefully with approval
```

If migration damage is severe:
- Use Neon PITR process.
- Run data integrity verification queries before re-opening traffic.

---

# 11. Documentation and Communication

## 11.1 Deployment Notification Template (Slack)

```text
Deployment: VIDEO-123 (Fix auth login regression)
Branch: feat/auth-fix
Commit: abc1234
Deployed at: 2026-05-10T19:21:00Z
Changes: 3 files, +45 -23
Verify: https://capricast.com/sign-in (test account)
Rollback: git revert abc1234 --no-edit && git push
```

## 11.2 Post-Deployment Status Template

```text
Frontend: OK (capricast.com)
API: OK (api.capricast.com/health)
Database: OK (Neon connection healthy)
Auth: manual test complete
Stripe webhook: test event delivered
```

## 11.3 Communication Rules

- Announce before deployment starts.
- Announce immediately after verification passes.
- Announce rollback start and completion if rollback occurs.
- Attach issue/incident link for all production-impacting events.

---

# 12. Advanced Topics

## 12.1 Blue-Green Deployment

Use when zero-downtime cutover is required for major releases.

Pattern:
- Maintain two independent runtime targets.
- Shift traffic after verification.
- Keep old target available for rapid rollback.

## 12.2 Canary Deploy

Use percentage-based traffic rollout when available.

Pattern:
- Rollout 10%.
- Observe metrics.
- Rollout 50%.
- Observe metrics.
- Rollout 100%.

## 12.3 Feature Flags

Use dark launch and progressive enablement for risky features.

Rules:
- Keep flag defaults explicit.
- Document owner and expiration date.
- Remove stale flags.

## 12.4 Database Schema Versioning (Drizzle)

Best practices:
- One migration per logical change.
- Dry-run before apply.
- Staging validation for risky DDL.
- Include compatibility path for mixed-version deploy windows.

---

# 13. Appendix A - Command Reference

## A.1 End-to-End Deploy

```bash
bash scripts/deploy-prod.sh
```

## A.2 Verify Deployment

```bash
bash scripts/verify-deployment.sh --frontend-url https://capricast.com --api-url https://api.capricast.com
```

## A.3 Manual Worker Deploy

```bash
cd _external_reviews/videoking/apps/worker
pnpm exec wrangler deploy
```

## A.4 Manual Frontend Deploy

```bash
cd _external_reviews/videoking/apps/web
pnpm build
pnpm build:pages
pnpm exec wrangler pages deploy .vercel/output/static --project-name capricast
```

## A.5 Manual Migration Deploy

```bash
cd _external_reviews/videoking/packages/db
pnpm db:generate
pnpm exec drizzle-kit push --dry-run
pnpm db:migrate
```

---

# 14. Appendix B - Deployment Gate Criteria

## Gate G1: Source Control Gate

Pass when:
- Clean git status.
- Branch merged or approved for release.

Fail when:
- Uncommitted changes.
- Unknown generated files not reviewed.

## Gate G2: Build Gate

Pass when:
- Frontend build and pages build pass.
- Worker build passes.

Fail when:
- next-on-pages run fails on unsupported environment.

## Gate G3: Test Gate

Pass when:
- Required unit/integration tests pass.
- Any required smoke tests pass.

## Gate G4: Config Gate

Pass when:
- Required secrets present.
- Runtime vars match environment.

## Gate G5: Deploy Gate

Pass when:
- Deploy commands complete successfully.
- Health checks pass.

## Gate G6: Post-Deploy Gate

Pass when:
- Functional smoke tests pass.
- Monitoring does not show active regression.

---

# 15. Appendix C - CI/CD Integration Notes

## C.1 CI Job Ordering

Suggested order:
1. Install dependencies.
2. Typecheck.
3. Test.
4. Pre-deploy validation script.
5. Build frontend and worker artifacts.
6. Deploy to production.
7. Run verification script.

## C.2 CI Required Secrets

- CF_API_TOKEN
- CF_ACCOUNT_ID
- DATABASE_URL
- NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY

## C.3 Linux Runner Requirement

Reason:
- Frontend build:pages step requires Linux/CI for reliability in this repository.

---

# 16. Appendix D - Risk Register for Deployments

| Risk ID | Risk | Impact | Likelihood | Mitigation |
|---|---|---|---|---|
| R-001 | Windows next-on-pages failure | medium | high | deploy from Linux/CI |
| R-002 | Secret drift between environments | high | medium | pre-deploy secret audit |
| R-003 | Migration FK conflict | high | medium | dry-run + staging validation |
| R-004 | Stripe webhook secret mismatch | high | medium | preflight webhook check |
| R-005 | Hyperdrive binding mismatch | high | low | verify wrangler binding IDs |
| R-006 | Auth trust host mismatch | high | medium | config verification checklist |

---

# 17. Appendix E - Standard Smoke Test Suite

## E.1 API Health

```bash
curl -i https://api.capricast.com/health
```

Expected: 200.

## E.2 Frontend Root

```bash
curl -I https://capricast.com/
```

Expected: 200 or redirect to 200 page.

## E.3 Protected Route Without Auth

```bash
curl -i https://api.capricast.com/api/stripe/connect/status
```

Expected: 401 or 403.

## E.4 Webhook Route Shape Check

```bash
curl -i https://api.capricast.com/api/webhooks/stripe
```

Expected: 404 or 405 (depends on method routing policy).

## E.5 Optional Auth Sign-In Probe

```bash
curl -i -X POST https://api.capricast.com/api/auth/sign-in/email \
  -H 'Content-Type: application/json' \
  -d '{"email":"test@example.com","password":"REDACTED"}'
```

Expected: success for valid test credentials.

---

# 18. Appendix F - Change Classification Matrix

| Change Type | Example | Requires Staging | Requires Migration Plan | Requires CTO Approval |
|---|---|---|---|---|
| UI-only small fix | CSS or copy update | no | no | no |
| API logic change | route handler update | yes | no | no |
| Auth config change | BetterAuth callback/trust host | yes | no | no |
| Stripe webhook flow | signature or event processing logic | yes | no | no |
| Schema change | table/column/constraint updates | yes | yes | no |
| Emergency hotfix in outage | critical production failure | optional | conditional | no |
| Force push rollback | history rewrite | optional | conditional | yes |

---

# 19. Appendix G - Runbook Usage for Junior Engineers

## Step 1

Read Section 1 and Section 2 fully.

## Step 2

Run validation commands exactly.

## Step 3

If any phase fails, stop and use Section 6 and docs/DEPLOYMENT_TROUBLESHOOTING.md.

## Step 4

Do not skip post-deploy verification.

## Step 5

Document every production action in deployment channel.

## Step 6

Escalate early on payment/auth failures.

---

# 20. Appendix H - Deployment Worksheets

This appendix provides repeatable worksheets for planning, executing, and auditing deployments.

Use one worksheet per deployment.

Template fields:
- Deployment ID
- Engineer
- Date UTC
- Scope summary
- Risk level
- Phase checkpoints
- Verification outputs
- Rollback result if applicable

Detailed worksheet blocks continue below.

## Worksheet 01

Deployment ID: ______________________________
Engineer: ___________________________________
Reviewer: ___________________________________
Date UTC: ___________________________________
Change Window UTC: ___________________________
Ticket/Issue: ________________________________
Risk Level (low/med/high): ___________________

### Phase 1: Pre-Deployment Validation
- [ ] Git status clean
- [ ] Typecheck pass
- [ ] Tests pass
- [ ] Secrets verified
Notes: ______________________________________

### Phase 2: Build Artifacts
- [ ] Frontend build pass
- [ ] pages build pass
- [ ] worker build pass
- [ ] artifacts verified
Notes: ______________________________________

### Phase 3: Database Migrations
- [ ] Migration required
- [ ] Dry-run pass
- [ ] Apply pass
- [ ] Rollback path documented
Migration Notes: _____________________________

### Phase 4: Staging Deploy
- [ ] Staging deploy executed
- [ ] Staging health pass
- [ ] Staging smoke tests pass
Staging URL tested: __________________________

### Phase 5: Production Deploy
- [ ] Frontend deployed
- [ ] Worker deployed
- [ ] API health 200
- [ ] Frontend reachable
Deploy logs: __________________________________

### Phase 6: Verification and Monitoring
- [ ] Auth test pass
- [ ] Stripe webhook test pass
- [ ] Sentry normal
- [ ] Latency normal
Monitoring Notes: ____________________________

### Rollback Section
Rollback needed? (yes/no): ____________________
Rollback method used: _________________________
Rollback start UTC: ___________________________
Rollback end UTC: _____________________________
Rollback verification status: _________________

### Final Signoff
Deployment status (success/failure): __________
Incident opened? (yes/no): ____________________
Postmortem required? (yes/no): ________________
Signoff by: ___________________________________


## Worksheet 02

Deployment ID: ______________________________
Engineer: ___________________________________
Reviewer: ___________________________________
Date UTC: ___________________________________
Change Window UTC: ___________________________
Ticket/Issue: ________________________________
Risk Level (low/med/high): ___________________

### Phase 1: Pre-Deployment Validation
- [ ] Git status clean
- [ ] Typecheck pass
- [ ] Tests pass
- [ ] Secrets verified
Notes: ______________________________________

### Phase 2: Build Artifacts
- [ ] Frontend build pass
- [ ] pages build pass
- [ ] worker build pass
- [ ] artifacts verified
Notes: ______________________________________

### Phase 3: Database Migrations
- [ ] Migration required
- [ ] Dry-run pass
- [ ] Apply pass
- [ ] Rollback path documented
Migration Notes: _____________________________

### Phase 4: Staging Deploy
- [ ] Staging deploy executed
- [ ] Staging health pass
- [ ] Staging smoke tests pass
Staging URL tested: __________________________

### Phase 5: Production Deploy
- [ ] Frontend deployed
- [ ] Worker deployed
- [ ] API health 200
- [ ] Frontend reachable
Deploy logs: __________________________________

### Phase 6: Verification and Monitoring
- [ ] Auth test pass
- [ ] Stripe webhook test pass
- [ ] Sentry normal
- [ ] Latency normal
Monitoring Notes: ____________________________

### Rollback Section
Rollback needed? (yes/no): ____________________
Rollback method used: _________________________
Rollback start UTC: ___________________________
Rollback end UTC: _____________________________
Rollback verification status: _________________

### Final Signoff
Deployment status (success/failure): __________
Incident opened? (yes/no): ____________________
Postmortem required? (yes/no): ________________
Signoff by: ___________________________________


## Worksheet 03

Deployment ID: ______________________________
Engineer: ___________________________________
Reviewer: ___________________________________
Date UTC: ___________________________________
Change Window UTC: ___________________________
Ticket/Issue: ________________________________
Risk Level (low/med/high): ___________________

### Phase 1: Pre-Deployment Validation
- [ ] Git status clean
- [ ] Typecheck pass
- [ ] Tests pass
- [ ] Secrets verified
Notes: ______________________________________

### Phase 2: Build Artifacts
- [ ] Frontend build pass
- [ ] pages build pass
- [ ] worker build pass
- [ ] artifacts verified
Notes: ______________________________________

### Phase 3: Database Migrations
- [ ] Migration required
- [ ] Dry-run pass
- [ ] Apply pass
- [ ] Rollback path documented
Migration Notes: _____________________________

### Phase 4: Staging Deploy
- [ ] Staging deploy executed
- [ ] Staging health pass
- [ ] Staging smoke tests pass
Staging URL tested: __________________________

### Phase 5: Production Deploy
- [ ] Frontend deployed
- [ ] Worker deployed

## Worksheet 61

Deployment ID: ______________________________
Engineer: ___________________________________
Reviewer: ___________________________________
Date UTC: ___________________________________
Change Window UTC: ___________________________
Ticket/Issue: ________________________________
Risk Level (low/med/high): ___________________

- [ ] Phase 1 complete
- [ ] Phase 2 complete
- [ ] Phase 3 complete
- [ ] Phase 4 complete
- [ ] Phase 5 complete
- [ ] Phase 6 complete
Verification Notes: __________________________
Rollback Notes: ______________________________
Signoff: _____________________________________


## Worksheet 62

Deployment ID: ______________________________
Engineer: ___________________________________
Reviewer: ___________________________________
Date UTC: ___________________________________
Change Window UTC: ___________________________
Ticket/Issue: ________________________________
Risk Level (low/med/high): ___________________

- [ ] Phase 1 complete
- [ ] Phase 2 complete
- [ ] Phase 3 complete
- [ ] Phase 4 complete
- [ ] Phase 5 complete
- [ ] Phase 6 complete
Verification Notes: __________________________
Rollback Notes: ______________________________
Signoff: _____________________________________


## Worksheet 63

Deployment ID: ______________________________
Engineer: ___________________________________
Reviewer: ___________________________________
Date UTC: ___________________________________
Change Window UTC: ___________________________
Ticket/Issue: ________________________________
Risk Level (low/med/high): ___________________

- [ ] Phase 1 complete
- [ ] Phase 2 complete
- [ ] Phase 3 complete
- [ ] Phase 4 complete
- [ ] Phase 5 complete
- [ ] Phase 6 complete
Verification Notes: __________________________
Rollback Notes: ______________________________
Signoff: _____________________________________


## Worksheet 64

Deployment ID: ______________________________
Engineer: ___________________________________
Reviewer: ___________________________________
Date UTC: ___________________________________
Change Window UTC: ___________________________
Ticket/Issue: ________________________________
Risk Level (low/med/high): ___________________

- [ ] Phase 1 complete
- [ ] Phase 2 complete
- [ ] Phase 3 complete
- [ ] Phase 4 complete
- [ ] Phase 5 complete
- [ ] Phase 6 complete
Verification Notes: __________________________
Rollback Notes: ______________________________
Signoff: _____________________________________


## Worksheet 65

Deployment ID: ______________________________
Engineer: ___________________________________
Reviewer: ___________________________________
Date UTC: ___________________________________
Change Window UTC: ___________________________
Ticket/Issue: ________________________________
Risk Level (low/med/high): ___________________

- [ ] Phase 1 complete
- [ ] Phase 2 complete
- [ ] Phase 3 complete
- [ ] Phase 4 complete
- [ ] Phase 5 complete
- [ ] Phase 6 complete
Verification Notes: __________________________
Rollback Notes: ______________________________
Signoff: _____________________________________


## Worksheet 66

Deployment ID: ______________________________
Engineer: ___________________________________
Reviewer: ___________________________________
Date UTC: ___________________________________
Change Window UTC: ___________________________
Ticket/Issue: ________________________________
Risk Level (low/med/high): ___________________

- [ ] Phase 1 complete
- [ ] Phase 2 complete
- [ ] Phase 3 complete
- [ ] Phase 4 complete
- [ ] Phase 5 complete
- [ ] Phase 6 complete
Verification Notes: __________________________
Rollback Notes: ______________________________
Signoff: _____________________________________


## Worksheet 67

Deployment ID: ______________________________
Engineer: ___________________________________
Reviewer: ___________________________________
Date UTC: ___________________________________
Change Window UTC: ___________________________
Ticket/Issue: ________________________________
Risk Level (low/med/high): ___________________

- [ ] Phase 1 complete
- [ ] Phase 2 complete
- [ ] Phase 3 complete
- [ ] Phase 4 complete
- [ ] Phase 5 complete
- [ ] Phase 6 complete
Verification Notes: __________________________
Rollback Notes: ______________________________
Signoff: _____________________________________


## Worksheet 68

Deployment ID: ______________________________
Engineer: ___________________________________
Reviewer: ___________________________________
Date UTC: ___________________________________
Change Window UTC: ___________________________
Ticket/Issue: ________________________________
Risk Level (low/med/high): ___________________

- [ ] Phase 1 complete
- [ ] Phase 2 complete
- [ ] Phase 3 complete
- [ ] Phase 4 complete
- [ ] Phase 5 complete
- [ ] Phase 6 complete
Verification Notes: __________________________
Rollback Notes: ______________________________
Signoff: _____________________________________


## Worksheet 69

Deployment ID: ______________________________
Engineer: ___________________________________
Reviewer: ___________________________________
Date UTC: ___________________________________
Change Window UTC: ___________________________
Ticket/Issue: ________________________________
Risk Level (low/med/high): ___________________

- [ ] Phase 1 complete
- [ ] Phase 2 complete
- [ ] Phase 3 complete
- [ ] Phase 4 complete
- [ ] Phase 5 complete
- [ ] Phase 6 complete
Verification Notes: __________________________
Rollback Notes: ______________________________
Signoff: _____________________________________


## Worksheet 70

Deployment ID: ______________________________
Engineer: ___________________________________
Reviewer: ___________________________________
Date UTC: ___________________________________
Change Window UTC: ___________________________
Ticket/Issue: ________________________________
Risk Level (low/med/high): ___________________

- [ ] Phase 1 complete
- [ ] Phase 2 complete
- [ ] Phase 3 complete
- [ ] Phase 4 complete
- [ ] Phase 5 complete
- [ ] Phase 6 complete
Verification Notes: __________________________
Rollback Notes: ______________________________
Signoff: _____________________________________


## Worksheet 71

Deployment ID: ______________________________
Engineer: ___________________________________
Reviewer: ___________________________________
Date UTC: ___________________________________
Change Window UTC: ___________________________
Ticket/Issue: ________________________________
Risk Level (low/med/high): ___________________

- [ ] Phase 1 complete
- [ ] Phase 2 complete
- [ ] Phase 3 complete
- [ ] Phase 4 complete
- [ ] Phase 5 complete
- [ ] Phase 6 complete
Verification Notes: __________________________
Rollback Notes: ______________________________
Signoff: _____________________________________


## Worksheet 72

Deployment ID: ______________________________
Engineer: ___________________________________
Reviewer: ___________________________________
Date UTC: ___________________________________
Change Window UTC: ___________________________
Ticket/Issue: ________________________________
Risk Level (low/med/high): ___________________

- [ ] Phase 1 complete
- [ ] Phase 2 complete
- [ ] Phase 3 complete
- [ ] Phase 4 complete
- [ ] Phase 5 complete
- [ ] Phase 6 complete
Verification Notes: __________________________
Rollback Notes: ______________________________
Signoff: _____________________________________


## Worksheet 73

Deployment ID: ______________________________
Engineer: ___________________________________
Reviewer: ___________________________________
Date UTC: ___________________________________
Change Window UTC: ___________________________
Ticket/Issue: ________________________________
Risk Level (low/med/high): ___________________

- [ ] Phase 1 complete
- [ ] Phase 2 complete
- [ ] Phase 3 complete
- [ ] Phase 4 complete
- [ ] Phase 5 complete
- [ ] Phase 6 complete
Verification Notes: __________________________
Rollback Notes: ______________________________
Signoff: _____________________________________


## Worksheet 74

Deployment ID: ______________________________
Engineer: ___________________________________
Reviewer: ___________________________________
Date UTC: ___________________________________
Change Window UTC: ___________________________
Ticket/Issue: ________________________________
Risk Level (low/med/high): ___________________

- [ ] Phase 1 complete
- [ ] Phase 2 complete
- [ ] Phase 3 complete
- [ ] Phase 4 complete
- [ ] Phase 5 complete
- [ ] Phase 6 complete
Verification Notes: __________________________
Rollback Notes: ______________________________
Signoff: _____________________________________


## Worksheet 75

Deployment ID: ______________________________
Engineer: ___________________________________
Reviewer: ___________________________________
Date UTC: ___________________________________
Change Window UTC: ___________________________
Ticket/Issue: ________________________________
Risk Level (low/med/high): ___________________

- [ ] Phase 1 complete
- [ ] Phase 2 complete
- [ ] Phase 3 complete
- [ ] Phase 4 complete
- [ ] Phase 5 complete
- [ ] Phase 6 complete
Verification Notes: __________________________
Rollback Notes: ______________________________
Signoff: _____________________________________


## Worksheet 76

Deployment ID: ______________________________
Engineer: ___________________________________
Reviewer: ___________________________________
Date UTC: ___________________________________
Change Window UTC: ___________________________
Ticket/Issue: ________________________________
Risk Level (low/med/high): ___________________

- [ ] Phase 1 complete
- [ ] Phase 2 complete
- [ ] Phase 3 complete
- [ ] Phase 4 complete
- [ ] Phase 5 complete
- [ ] Phase 6 complete
Verification Notes: __________________________
Rollback Notes: ______________________________
Signoff: _____________________________________


## Worksheet 77

Deployment ID: ______________________________
Engineer: ___________________________________
Reviewer: ___________________________________
Date UTC: ___________________________________
Change Window UTC: ___________________________
Ticket/Issue: ________________________________
Risk Level (low/med/high): ___________________

- [ ] Phase 1 complete
- [ ] Phase 2 complete
- [ ] Phase 3 complete
- [ ] Phase 4 complete
- [ ] Phase 5 complete
- [ ] Phase 6 complete
Verification Notes: __________________________
Rollback Notes: ______________________________
Signoff: _____________________________________


## Worksheet 78

Deployment ID: ______________________________
Engineer: ___________________________________
Reviewer: ___________________________________
Date UTC: ___________________________________
Change Window UTC: ___________________________
Ticket/Issue: ________________________________
Risk Level (low/med/high): ___________________

- [ ] Phase 1 complete
- [ ] Phase 2 complete
- [ ] Phase 3 complete
- [ ] Phase 4 complete
- [ ] Phase 5 complete
- [ ] Phase 6 complete
Verification Notes: __________________________
Rollback Notes: ______________________________
Signoff: _____________________________________


## Worksheet 79

Deployment ID: ______________________________
Engineer: ___________________________________
Reviewer: ___________________________________
Date UTC: ___________________________________
Change Window UTC: ___________________________
Ticket/Issue: ________________________________
Risk Level (low/med/high): ___________________

- [ ] Phase 1 complete
- [ ] Phase 2 complete
- [ ] Phase 3 complete
- [ ] Phase 4 complete
- [ ] Phase 5 complete
- [ ] Phase 6 complete
Verification Notes: __________________________
Rollback Notes: ______________________________
Signoff: _____________________________________


## Worksheet 80

Deployment ID: ______________________________
Engineer: ___________________________________
Reviewer: ___________________________________
Date UTC: ___________________________________
Change Window UTC: ___________________________
Ticket/Issue: ________________________________
Risk Level (low/med/high): ___________________

- [ ] Phase 1 complete
- [ ] Phase 2 complete
- [ ] Phase 3 complete
- [ ] Phase 4 complete
- [ ] Phase 5 complete
- [ ] Phase 6 complete
Verification Notes: __________________________
Rollback Notes: ______________________________
Signoff: _____________________________________


## Worksheet 81

Deployment ID: ______________________________
Engineer: ___________________________________
Reviewer: ___________________________________
Date UTC: ___________________________________
Change Window UTC: ___________________________
Ticket/Issue: ________________________________
Risk Level (low/med/high): ___________________

- [ ] Phase 1 complete
- [ ] Phase 2 complete
- [ ] Phase 3 complete
- [ ] Phase 4 complete
- [ ] Phase 5 complete
- [ ] Phase 6 complete
Verification Notes: __________________________
Rollback Notes: ______________________________
Signoff: _____________________________________


## Worksheet 82

Deployment ID: ______________________________
Engineer: ___________________________________
Reviewer: ___________________________________
Date UTC: ___________________________________
Change Window UTC: ___________________________
Ticket/Issue: ________________________________
Risk Level (low/med/high): ___________________

- [ ] Phase 1 complete
- [ ] Phase 2 complete
- [ ] Phase 3 complete
- [ ] Phase 4 complete
- [ ] Phase 5 complete
- [ ] Phase 6 complete
Verification Notes: __________________________
Rollback Notes: ______________________________
Signoff: _____________________________________


## Worksheet 83

Deployment ID: ______________________________
Engineer: ___________________________________
Reviewer: ___________________________________
Date UTC: ___________________________________
Change Window UTC: ___________________________
Ticket/Issue: ________________________________
Risk Level (low/med/high): ___________________

- [ ] Phase 1 complete
- [ ] Phase 2 complete
- [ ] Phase 3 complete
- [ ] Phase 4 complete
- [ ] Phase 5 complete
- [ ] Phase 6 complete
Verification Notes: __________________________
Rollback Notes: ______________________________
Signoff: _____________________________________


## Worksheet 84

Deployment ID: ______________________________
Engineer: ___________________________________
Reviewer: ___________________________________
Date UTC: ___________________________________
Change Window UTC: ___________________________
Ticket/Issue: ________________________________
Risk Level (low/med/high): ___________________

- [ ] Phase 1 complete
- [ ] Phase 2 complete
- [ ] Phase 3 complete
- [ ] Phase 4 complete
- [ ] Phase 5 complete
- [ ] Phase 6 complete
Verification Notes: __________________________
Rollback Notes: ______________________________
Signoff: _____________________________________


## Worksheet 85

Deployment ID: ______________________________
Engineer: ___________________________________
Reviewer: ___________________________________
Date UTC: ___________________________________
Change Window UTC: ___________________________
Ticket/Issue: ________________________________
Risk Level (low/med/high): ___________________

- [ ] Phase 1 complete
- [ ] Phase 2 complete
- [ ] Phase 3 complete
- [ ] Phase 4 complete
- [ ] Phase 5 complete
- [ ] Phase 6 complete
Verification Notes: __________________________
Rollback Notes: ______________________________
Signoff: _____________________________________

