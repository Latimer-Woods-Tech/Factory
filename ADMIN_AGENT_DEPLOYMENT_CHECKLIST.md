# Admin Studio AI Agent — Deployment Checklist

**Status:** ✅ Merged to main  
**Commit:** `bc43ca77986dccccc2f8de8e0070c4df6eb85145` (squashed)  
**Date:** 2026-05-27  

All code changes for Phases 1-4 are now in main. Follow this checklist to deploy and activate the agent.

---

## Pre-Deployment (Local Machine)

- [ ] Clone latest main: `git pull origin main`
- [ ] Set Cloudflare token: `export CLOUDFLARE_API_TOKEN="..."`
- [ ] Gather secrets:
  - [ ] GitHub PAT (starts with `github_pat_` or `ghp_`)
  - [ ] Anthropic API key (starts with `sk-ant-`)
  - [ ] GCP SA key (base64-encoded JSON, project: `factory-495015`)

---

## Staging Deployment

### Step 1: Configure Secrets
```bash
node scripts/setup-admin-studio-secrets.mjs --env staging
```

Interactive prompt will ask for:
1. **GitHub token** — must have `repo` + `workflow` scopes
2. **Anthropic API key** — from anthropic.com console
3. **GCP SA key** — base64-encoded service account JSON

**Validation:**
- GitHub: Must start with `github_pat_` or `ghp_`
- Anthropic: Must start with `sk-ant-`
- GCP: Must decode to valid JSON with `type: "service_account"` and `project_id: "factory-495015"`

### Step 2: Build & Deploy
```bash
cd apps/admin-studio
npm install
npm run deploy:staging
```

Expected output:
```
✨ Successfully published your Worker to
https://admin-studio-staging.adrper79.workers.dev
```

### Step 3: Verify Health
```bash
curl https://admin-staging.latwoodtech.work/health
```

Expected: `200 OK` with response body

---

## Smoke Testing

### Test 1: Basic Chat (No Tools)
```bash
curl -X POST https://admin-staging.latwoodtech.work/api/ai/chat \
  -H "Content-Type: application/json" \
  -d '{
    "history": [
      {"role": "user", "content": "Hello, what can you do?"}
    ],
    "mode": "generate"
  }'
```

Expected: SSE stream with text response

### Test 2: GitHub Tool (github_list_issues)
```bash
curl -X POST https://admin-staging.latwoodtech.work/api/ai/chat \
  -H "Content-Type: application/json" \
  -d '{
    "history": [
      {"role": "user", "content": "List open issues in Factory"}
    ],
    "mode": "generate"
  }'
```

Expected:
- SSE stream
- Contains `tool_use` block with `name: "github_list_issues"`
- Tool result with issue count and list
- Final text response summarizing results

### Test 3: GCP Secret (gcp_get_secret)
```bash
# Note: Only works if a secret exists in GCP
curl -X POST https://admin-staging.latwoodtech.work/api/ai/chat \
  -H "Content-Type: application/json" \
  -d '{
    "history": [
      {"role": "user", "content": "What is the NEON_FACTORY_DATABASE_URL secret?"}
    ],
    "mode": "generate"
  }'
```

Expected:
- `tool_use` block with `name: "gcp_get_secret"`
- Tool result with secret value (truncated to 100 chars)
- Agent uses secret to respond

---

## Monitoring Post-Deployment

### Worker Logs
```bash
wrangler tail --env staging admin-studio-staging
```

Watch for:
- `[tool_use]` — tool was invoked
- `[error]` — failures to catch
- `[timeout]` — 10s fetch timeout exceeded

### Sentry Errors
Visit: https://sentry.io/organizations/latwood-tech/issues/?project=...

Filter by `admin-studio` project. Should see:
- Zero critical errors post-deployment
- Max 2-3 warnings from pre-existing TS config issues

### PostHog Analytics
Track usage at: https://posthog.com/

Look for:
- `/api/ai/chat` calls per minute
- Tool execution success rate
- Response time percentiles (p50, p95, p99)

---

## Production Deployment (After Staging Validation)

Once staging is stable for 24+ hours:

### Step 1: Configure Production Secrets
```bash
node scripts/setup-admin-studio-secrets.mjs --env production
```

### Step 2: Deploy to Production
```bash
cd apps/admin-studio
npm run deploy:production
```

### Step 3: Verify Production Health
```bash
curl https://studio.thefactory.dev/health
```

### Step 4: Announce to Team
Post in Slack: "✨ Admin Studio AI agent is now live. Try `/ai/chat` endpoint with natural language queries."

---

## Rollback Procedure

If production has issues:

```bash
# Identify last stable commit
git log --oneline -10 | grep admin-studio

# Revert the Phase 1-4 commit
git revert bc43ca77986dccccc2f8de8e0070c4df6eb85145

# Deploy reverted version
cd apps/admin-studio
npm run deploy:production

# Notify team: rollback complete
```

---

## Success Criteria

✅ Agent is live when:
- [ ] Health endpoint returns 200
- [ ] `/ai/chat` endpoint accepts POST requests
- [ ] GitHub tools execute successfully (github_list_issues, etc.)
- [ ] GCP secret tool works (gcp_get_secret)
- [ ] Sentry shows zero new critical errors
- [ ] Response latency < 5s (p95)
- [ ] No authentication failures

---

## What's Included

### Code Changes (Phases 1-4)
- ✅ Repo owner fix (Latimer-Woods-Tech/Factory)
- ✅ Agentic tool-use loop (max 5 iterations, non-streaming)
- ✅ 4 GitHub tools + 1 GCP Secret Manager tool
- ✅ JWT signing for OAuth2 token exchange
- ✅ Optional AI_GATEWAY_BASE_URL fallback
- ✅ FACTORY_DB Hyperdrive configuration

### Documentation
- ✅ `docs/ADMIN_STUDIO_SETUP.md` — full deployment guide
- ✅ `scripts/setup-admin-studio-secrets.mjs` — interactive setup
- ✅ `ADMIN_AGENT_DEPLOYMENT_CHECKLIST.md` — this file

### Tests
- [ ] Typecheck (pre-existing TS config issues, unrelated)
- [ ] Linting (✅ zero warnings)
- [ ] Unit tests (run: `npm test`)
- [ ] Smoke tests (see above)

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Deployment fails: "CLOUDFLARE_API_TOKEN not set" | `export CLOUDFLARE_API_TOKEN="..."` |
| Tool execution returns error | Verify secrets: `wrangler secret list --env staging` |
| 503 Service Unavailable | Check `ANTHROPIC_API_KEY` is set |
| GCP_SA_KEY invalid | Must be base64-encoded; decode with `base64 -d` |
| Health check times out | Worker may be cold; try again |

---

## Phase 5 Roadmap (Future)

Once Phase 1-4 is stable in production:
- [ ] Add Sentry tools (sentry_list_issues, sentry_get_issue)
- [ ] Add Cloudflare tools (cloudflare_get_worker_status)
- [ ] Add database tools (neon_query, see FACTORY_DB)
- [ ] Add caching layer (KV for GitHub files, secrets)
- [ ] Implement streaming tool results (for large datasets)
- [ ] Add rate limiting per user/API key

---

## Questions?

See:
- [`docs/ADMIN_STUDIO_SETUP.md`](./docs/ADMIN_STUDIO_SETUP.md) — Detailed setup guide
- [`docs/ADMIN_UI_AGENT_PLAN.md`](./docs/ADMIN_UI_AGENT_PLAN.md) — Original 4-phase plan
- `#architecture` Slack channel — Ask the team
