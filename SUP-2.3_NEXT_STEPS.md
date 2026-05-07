# SUP-2.3 Next Steps — LLM Consumption Phase

**Status:** Unblocked ✅  
**Packages Published:** `@latimer-woods-tech/llm@0.3.1` + `@latimer-woods-tech/llm-meter@0.1.0` (May 4, 2026)  
**Ready for:** Implementation phase (est. 4.5 days)

---

## Immediate Actions (Do This First)

### 1. HumanDesign: Install Published Packages
```bash
cd apps/humandesign
npm install @latimer-woods-tech/llm@0.3.1 @latimer-woods-tech/llm-meter@0.1.0
npm ci
npm run lint && npm run typecheck && npm test
git add package.json package-lock.json
git commit -m "feat(llm): install published @latimer-woods-tech/llm@0.3.1 and @latimer-woods-tech/llm-meter@0.1.0"
git push origin feat/sup-2-3-consumption
```

### 2. Provision D1 Database (HumanDesign)
```bash
cd apps/humandesign
wrangler d1 create factory-humandesign-llm-ledger --env production
# Copy database_id from output
```

### 3. Update wrangler.toml
Add to `env.production`:
```toml
[env.production]
# ... existing config ...

d1_databases = [
  { binding = "LLM_LEDGER", database_id = "YOUR_DATABASE_ID" }
]

vars = {
  AI_GATEWAY_BASE_URL = "https://api.cloudflare.com/client/v4/accounts/{ACCOUNT_ID}/ai-gateway/humandesign", # Replace {ACCOUNT_ID}
  VERTEX_PROJECT = "factory-495015",
  VERTEX_LOCATION = "us-central1",
}
```

### 4. Set VERTEX_ACCESS_TOKEN Secret
```bash
# Locally for development (.dev.vars)
VERTEX_ACCESS_TOKEN=<your-gcp-service-account-token>

# Via GitHub Actions (for prod deployment)
gh secret set VERTEX_ACCESS_TOKEN --body "$(cat gcp-service-account.json)" --env production
```

---

## Phase 1: Verify Infrastructure (½ day)

### Verify D1 Ledger Schema
The `@latimer-woods-tech/llm-meter` package includes migration file `migrations/0001_init.sql`.

```bash
# Apply migration to D1
wrangler d1 execute factory-humandesign-llm-ledger < node_modules/@latimer-woods-tech/llm-meter/migrations/0001_init.sql --env production

# Verify tables created
wrangler d1 execute factory-humandesign-llm-ledger "SELECT name FROM sqlite_master WHERE type='table';" --env production
```

### Smoke Test: Deploy to Staging
```bash
npm run build
wrangler deploy --env staging
curl https://humandesign-staging.adrper79.workers.dev/health
```

---

## Phase 2: Handler Migrations (1 day)

Update each of 11 handlers in `workers/src/handlers/`:

**Pattern:** Replace `import { callLLM } from '../lib/llm.js'` with `import { callLLM } from '../lib/llm-adapter.js'`

Files to update (in this order):
1. ✅ admin.js (line 63)
2. ✅ chat.js (line 23)
3. ✅ cluster.js (line 17)
4. ✅ diary.js (line 17)
5. ✅ dream-weaver.js (line 12)
6. ✅ practitioner.js (line 43)
7. ✅ profile-stream.js (line 39)
8. ✅ profile.js (line 29)
9. ✅ session-notes.js (line 22)
10. ✅ sms.js (line 16)
11. ✅ analytics.js (if present)

**Per handler workflow:**
```bash
# 1. Update import
# 2. Test locally
npm run test -- handlers/FILENAME.test.js
# 3. Lint
npm run lint
# 4. Commit & push
git add workers/src/handlers/FILENAME.js
git commit -m "refactor(llm): consume @latimer-woods-tech/llm via adapter — FILENAME"
git push origin feat/sup-2-3-consumption
```

---

## Phase 3: Regression Testing (1 day)

### 3.1 Identify Historical Syntheses
Query HumanDesign prod Neon (from `get_session_synthesis` endpoint):
```sql
SELECT id, user_id, synthesis_snapshot, validation_score, created_at
FROM syntheses
WHERE validation_score > 0.85
  AND created_at > NOW() - INTERVAL '30 days'
ORDER BY created_at DESC
LIMIT 20;
```

### 3.2 Prepare Test Dataset
Save 20 recent synthesis records with original scores:
- id
- original_validation_score
- llm_input (reconstructed from metadata)
- expected_token_count

### 3.3 Parallel Validation
Deploy legacy (`main`) and new (`feat/sup-2-3-consumption`) to two staging workers.

```bash
# For each of 20 syntheses:
1. POST /api/synthesis-regenerate { syntheses_id: X } → new worker
2. Compare:
   - Token count variance: ±10% tolerance
   - Validation score: must remain > 0.85
   - Response time: must be < 30s

# Aggregate report:
   - All 20 pass? Proceed to Phase 4
   - Any fail? Root cause analysis and rollback
```

### 3.4 Generate Regression Report
Document:
- 20 syntheses tested
- Pass/fail status per test
- Token variance histogram
- Validation score deltas
- Timing comparison
- Recommendation (green/red light)

---

## Phase 4: Cleanup & Deployment (½ day)

### 4.1 Delete Legacy Code
```bash
rm workers/src/lib/llm.js
git add workers/src/lib/llm.js
git commit -m "chore(llm): delete legacy workers/src/lib/llm.js, replaced by @latimer-woods-tech/llm adapter"
```

### 4.2 Verify Adapter Still Needed?
If llm-adapter.js is stable and all ref points work, keep it. If not:
```bash
# Option A: Keep adapter for compatibility
# Option B: Direct import strategy (refactor all handlers to import the package directly)
```

### 4.3 Production Deploy
```bash
# 1. Final lint + typecheck
npm run lint && npm run typecheck && npm test

# 2. Create release branch
git checkout -b release/sup-2-3-production

# 3. Deploy to production
wrangler deploy --env production

# 4. Verify health endpoint
curl https://humandesign.adrper79.workers.dev/health
# Expected: 200 OK

# 5. Smoke test key endpoints
curl -X POST https://humandesign.adrper79.workers.dev/api/synthesis-test \
  -H "Content-Type: application/json" \
  -d '{"user_id":"test","prompt":"test"}'
# Expected: 200 OK with valid response

# 6. Monitor Sentry for 1 hour
# - Watch for new errors
# - Check D1 ledger queries (should see INSERT records)
# - Validate validation_score not regressing
```

### 4.4 PR & Merge
```bash
gh pr create --base main --head release/sup-2-3-production \
  --title "feat(sup-2-3): consume @latimer-woods-tech/llm, delete legacy llm.js" \
  --body "## Summary
- Replaced legacy \`workers/src/lib/llm.js\` with drop-in adapter wrapping @latimer-woods-tech/llm@0.3.1
- Updated all 11 handlers to use new adapter
- Validated on 20 historical syntheses (token variance ±10%, validation_score > 0.85)
- D1 metering active; all LLM calls logged to LLM_LEDGER
- AI Gateway routing enabled (Anthropic → Gemini → Groq)

Closes HumanDesign#68, factory#100"
```

---

## Success Criteria ✅

- [ ] Packages installed in HumanDesign
- [ ] wrangler.toml updated with all env vars
- [ ] D1 database provisioned and migration applied
- [ ] All 11 handlers updated to use adapter
- [ ] Lint + typecheck + tests all pass
- [ ] Regression tests: 20 syntheses all pass (±10% tokens, validation > 0.85)
- [ ] Legacy llm.js deleted
- [ ] Production deployed and verified with curl
- [ ] Sentry dashboards green (no new errors)
- [ ] D1 ledger showing query logs
- [ ] Exit gate: "every LLM call metered + gateway-routed + 20 historical syntheses validated"

---

## Rollback Procedure (< 1 hour)

If production shows issues:
1. Deploy previous version: `git revert HEAD && wrangler deploy --env production`
2. Verify: `curl https://humandesign.adrper79.workers.dev/health`
3. Root cause analysis using Sentry error logs
4. Create follow-up issue for fix

---

## References

- **Review:** [SUP-2.3_REVIEW.md](./SUP-2.3_REVIEW.md) — Full requirements, prerequisites, risks
- **Checklist:** [SUP-2.3_CHECKLIST.md](./SUP-2.3_CHECKLIST.md) — Detailed bash commands
- **Technical:** [SUP-2.3_TECHNICAL_SPEC.md](./SUP-2.3_TECHNICAL_SPEC.md) — API equivalence proof
- **Packages:** @latimer-woods-tech/llm@0.3.1, @latimer-woods-tech/llm-meter@0.1.0
- **Epic:** factory#100 (SUP-2 LLM substrate)
- **Primary Issue:** HumanDesign#68

---

**Timeline:** 4.5 days sequential  
**Owner:** Implementation team (Adrian + Sauna)  
**Status:** Ready to start ✅
