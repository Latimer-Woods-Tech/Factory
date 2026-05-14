# Secret Manager Migration Status

**Started:** 2026-05-12  
**Current Phase:** Workflow Migration (2 of 24 workflows updated)  
**Owner:** adrper79  

---

## ✅ Completed

### Phase 1: Infrastructure (WIF)
- ✅ Workload Identity Pool created: `github-factory`
- ✅ OIDC Provider configured with Latimer-Woods-Tech org restriction
- ✅ supervisor-sa granted `iam.workloadIdentityUser` role
- ✅ GitHub secrets set: `WORKLOAD_IDENTITY_PROVIDER`, `SERVICE_ACCOUNT_EMAIL`

### Phase 2: Secret Manager
- ✅ 51 secrets created in GCP Secret Manager
- ✅ supervisor-sa granted `secretmanager.secretAccessor` on all secrets
- ✅ JSON key (d6aaba897...) deleted — only SYSTEM_MANAGED auto-renewing key remains

### Phase 3: Workflow Updates
- ✅ `supervisor-loop.yml` — Updated to use WIF + Secret Manager
- ✅ `deploy-supervisor.yml` — Updated to use WIF + Secret Manager

### Documentation
- ✅ `docs/runbooks/secret-migration-checklist.md` — Detailed checklist and migration steps
- ✅ `docs/runbooks/workflow-migration-template.md` — Reusable template for other workflows
- ✅ `scripts/migrate-secrets-to-gcp.sh` — Interactive script to populate credential secrets

---

## 🔄 In Progress

### Populate Credential Secrets (User Action Required)

**Status:** Blocked on user populating secret values from GitHub

**Steps to complete:**
```bash
# Run the migration script (will prompt for each credential)
bash scripts/migrate-secrets-to-gcp.sh
```

**Secrets waiting for values (48 total):**

**Database Connections (10):**
- DATABASE_URL
- FACTORY_CORE_DATABASE_URL
- SELFPRIME_CONNECTION_STRING
- THECALLING_CONNECTION_STRING
- WORDISBOND_CONNECTION_STRING
- CYPHEROFHEALING_CONNECTION_STRING
- KAIROSCOUNCIL_CONNECTION_STRING
- MEXXICO_CITY_CONNECTION_STRING
- NICHESTREAM_CONNECTION_STRING
- XPELEVATOR_CONNECTION_STRING

**Cloudflare Resources (16):**
- CF_ACCOUNT_ID
- CF_API_TOKEN
- HYPERDRIVE_CYPHER_HEALING
- HYPERDRIVE_FACTORY_CORE
- HYPERDRIVE_IJUSTUS
- HYPERDRIVE_NEIGHBOR_AID
- HYPERDRIVE_PRIME_SELF
- HYPERDRIVE_THE_CALLING
- HYPERDRIVE_WORDIS_BOND
- HYPERDRIVE_XICO_CITY
- RATE_LIMITER_CYPHER_HEALING
- RATE_LIMITER_IJUSTUS
- RATE_LIMITER_NEIGHBOR_AID
- RATE_LIMITER_PRIME_SELF
- RATE_LIMITER_THE_CALLING
- RATE_LIMITER_WORDIS_BOND

**API Keys & Tokens (8):**
- GROQ_API_KEY
- VERTEX_ACCESS_TOKEN
- VERTEX_SA_KEY
- FACTORY_SENTRY_API
- KAIROSCOUNCIL_SENTRY_API
- KAIROSCOUNCIL_SENTRY_DSN
- NPM_TOKEN
- GOOGLE_CALENDAR_SERVICE_ACCOUNT_JSON

**GitHub App (5):**
- FACTORY_APP_CLIENT_ID
- FACTORY_APP_ID
- FACTORY_APP_INSTALLATION_ID
- FACTORY_APP_PRIVATE_KEY
- SUPERVISOR_JWT_SECRET
- JWT_SECRET

**Slack Webhooks (3):**
- SLACK_WEBHOOK_DELIVERY_KPIS
- SLACK_WEBHOOK_OPS
- SLACK_WEBHOOK_REVENUE

**URLs & IDs (5):**
- ADMIN_STUDIO_PROD_URL
- ADMIN_STUDIO_STAGING_URL
- PRIME_SELF_LOGO_URL
- SCHEDULE_WORKER_URL
- FLAG_METER_DATABASE_ID
- WORKER_API_TOKEN

---

## 📋 Remaining Workflows to Migrate (22 of 24)

**Priority 1 (Critical deployments):**
- [ ] `deploy-schedule-worker.yml`
- [ ] `deploy-synthetic-monitor.yml`
- [ ] `deploy-admin-studio.yml`
- [ ] `deploy-admin-studio-ui.yml`

**Priority 2 (Secret/config management):**
- [ ] `set-jwt-secrets.yml`
- [ ] `setup-app-secrets.yml`
- [ ] `refresh-vertex-token.yml`
- [ ] `run-migrations.yml`
- [ ] `run-app-migrations.yml`

**Priority 3 (Reusable templates):**
- [ ] `_app-deploy.yml`
- [ ] `_app-deploy-pnpm.yml`
- [ ] `_app-prod-canary.yml`
- [ ] `_migration-drift-guard.yml`
- [ ] `_app-reliability-gate.yml`

**Priority 4 (Other workflows):**
- [ ] `auto-triage.yml`
- [ ] `capricast-rename.yml`
- [ ] `copilot-auto-approve.yml`
- [ ] `deploy-video-cron.yml`
- [ ] `push-google-oauth.yml`
- [ ] `mirror-org-secrets-to-dependabot.yml`
- [ ] `pr-review.yml`
- [ ] 2 others using credentials

**Use:** `docs/runbooks/workflow-migration-template.md` for migration pattern

---

## 🎯 Next Steps

1. **Populate secrets** (run `scripts/migrate-secrets-to-gcp.sh`):
   - Get values from `gh secret list --repo Latimer-Woods-Tech/factory`
   - Add each to Secret Manager via the script

2. **Test migrated workflows:**
   - Trigger `supervisor-loop.yml` via `workflow_dispatch`
   - Trigger `deploy-supervisor.yml` on a test branch
   - Verify both complete without secret errors

3. **Migrate remaining workflows:**
   - Update Priority 1 workflows (4 deployments)
   - Test each with `workflow_dispatch`
   - Update Priority 2–4 in batches

4. **Cleanup GitHub Secrets:**
   - After all workflows use Secret Manager, delete GitHub org secrets
   - Prevents accidental use of stale GitHub Secrets

---

## 🔐 Security Summary

| Aspect | Before | After |
|--------|--------|-------|
| **Auth to GCP** | JSON key (manual rotation) | OIDC token (auto-rotates every 1hr) |
| **Credential Storage** | GitHub Secrets (89 total, manual rotation, visible to org admins) | GCP Secret Manager (51 secrets, audit trail, encrypted at rest) |
| **Key Rotation** | Manual, leaked key in this session | Automatic via OIDC (no persistent key) |
| **Access Control** | Org-wide secret visibility | Fine-grained IAM (supervisor-sa only) |
| **Audit Trail** | GitHub logs only | GCP Cloud Audit Logs + Secret Manager audit |

---

## 💰 Cost Impact

**GCP Secret Manager:**
- $0.06 per secret per month
- 51 secrets × $0.06 = $3.06/month
- Negligible compared to compute costs

**Eliminated:**
- Manual key rotation labor
- Leak risk (previous session's leak = potential $5000+ audit cost)
- Multi-person access to all secrets (now fine-grained)

---

## 📝 Runbooks

- **Migration checklist:** `docs/runbooks/secret-migration-checklist.md`
- **Workflow template:** `docs/runbooks/workflow-migration-template.md`
- **GCP SA rotation:** `docs/runbooks/rotate-gcp-sa.md`
- **GitHub secrets:** `docs/runbooks/github-secrets-and-tokens.md`

---

## ⏱️ Timeline

| Date | Milestone |
|------|-----------|
| 2026-05-12 | Infrastructure complete, 2 workflows updated |
| 2026-05-12 (pending) | Credential secrets populated |
| 2026-05-12 (pending) | Priority 1 workflows migrated + tested |
| 2026-05-13 (target) | All 24 workflows migrated |
| 2026-05-14 (target) | GitHub org secrets deleted |
