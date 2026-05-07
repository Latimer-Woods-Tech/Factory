# SUP-2.3 Review: Consume @latimer-woods-tech/llm; delete workers/src/lib/llm.js

**Issue:** HumanDesign#68 (linked to factory#100)  
**Epic:** SUP-2 (LLM substrate)  
**Scope:** Consume `@latimer-woods-tech/llm@0.3.0` in HumanDesign, delete legacy `lib/llm.js`, validate on 20 historical syntheses  
**Status:** ⏳ NOT STARTED — blocked on prerequisites

---

## Current State

### HumanDesign LLM Implementation

**Legacy adapter (in place):**
- File: `workers/src/lib/llm.js`
- Exports: `callLLM(promptPayload, env, { signal })` → `{ text, tokens }`
- Behavior: Anthropic → Grok → Groq failover, 3 retries on Anthropic with backoff
- Model map: Opus/Sonnet/Haiku → [Grok, Groq] equivalents
- **Used by 11 handlers:**
  1. `admin.js` (1 call)
  2. `chat.js` (1 call)
  3. `cluster.js` (1 call)
  4. `diary.js` (1 call)
  5. `dream-weaver.js` (2 calls)
  6. `practitioner.js` (2 calls)
  7. `profile-stream.js` (2 calls)
  8. `profile.js` (3 calls)
  9. `session-notes.js` (1 call)
  10. `sms.js` (1 call)
  11. **Subtotal: 16 active callLLM invocations**

**Drop-in replacement ready (scaffolded but NOT wired):**
- File: `workers/src/lib/llm-adapter.js`
- Purpose: Wraps new `@latimer-woods-tech/llm@0.3.0` via `@latimer-woods-tech/llm-meter`
- Exports: Same `callLLM()` signature for easy import swap
- Status: **Code present but unreachable** (dependencies not installed)
- Note: Comment declares this is "SUP-2.3 scaffold"

**Validation framework exists:**
- File: `workers/src/lib/llm-response-validator.js` — thresholds tuned to legacy Anthropic multimodal
- **BLOCKER:** New provider (Gemini) + routing logic changes may violate thresholds

---

## Prerequisites (NOT MET)

### 1. ❌ Package Installation
- [ ] `@latimer-woods-tech/llm@0.3.0` installed in HumanDesign
- [ ] `@latimer-woods-tech/llm-meter@0.1.0` installed in HumanDesign
- [ ] `.npmrc` authentication configured for Factory package scope

**Status:** Not present in `package.json` dependencies

### 2. ❌ D1 LLM_LEDGER Binding
- [ ] D1 database `HumanDesign-llm-ledger` provisioned
- [ ] Binding added to `workers/wrangler.toml`: `[[d1_databases]]` with `LLM_LEDGER`
- [ ] Migration schema: `004_llm_ledger.sql` applied
- Ledger tables: `llm_calls`, `budget_tracking` (templates in `/migrations/0004_llm_ledger.sql`)

**Status:** Not configured in `workers/wrangler.toml`

### 3. ❌ wrangler.toml Environment Variables
**Required additions to `[vars]` section:**
```toml
AI_GATEWAY_BASE_URL = "https://gateway.ai.cloudflare.com/v1/{ACCOUNT}/{GATEWAY}/anthropic"
VERTEX_PROJECT = "factory-495015"
VERTEX_LOCATION = "us-central1"
VERTEX_ACCESS_TOKEN = "..." # GCP short-lived bearer token (from CI/CD)
```

**Status:** Only `AI_GATEWAY_BASE_URL` placeholder exists; others missing

### 4. ❌ Cloudflare AI Gateway Binding
- [ ] Account-level AI Gateway configured with routing profile `selfprime-api`
- [ ] Profile includes: `anthropic`, `gemini`, `groq` providers
- [ ] Gateway URL format: `https://gateway.ai.cloudflare.com/v1/{account.id}/selfprime-api/...`

**Status:** Unknown — requires CF console verification

### 5. ❌ Regression Test Suite on Historical Data
- [ ] Identify 20 historical syntheses (past successful runs with validators passing)
- [ ] Capture baseline metrics: latency, token count, output schema, validation scores
- [ ] Set up parallel run comparison: old llm.js vs new llm-adapter against same inputs
- [ ] No regression threshold violated (LLM response variance OK; structure must match)

**Status:** Not scoped. Need HumanDesign prod data access.

---

## Migration Plan

### Phase 1: Prerequisites (Days 1–2)

#### 1.1 Install packages
```bash
cd HumanDesign
npm install @latimer-woods-tech/llm@0.3.0 @latimer-woods-tech/llm-meter@0.1.0
npm install  # install + lock
```

**Verification:**
```bash
npm list @latimer-woods-tech/llm @latimer-woods-tech/llm-meter
```

#### 1.2 Provision D1 LLM_LEDGER

```bash
# Create D1 database (in Factory account, not HumanDesign — shared infra)
wrangler d1 create factory-humandesign-llm-ledger --env production

# Copy the database_id returned
# Update HumanDesign workers/wrangler.toml:
```

```toml
[[d1_databases]]
binding = "LLM_LEDGER"
database_name = "factory-humandesign-llm-ledger"
database_id = "<database_id from create output>"
```

**Verification:**
```bash
wrangler d1 info factory-humandesign-llm-ledger --env production
```

#### 1.3 Apply D1 schema migration

Copy `migrations/0004_llm_ledger.sql` from Factory/migrations, adapt for HumanDesign context, apply:

```bash
wrangler d1 execute factory-humandesign-llm-ledger < migrations/0004_llm_ledger.sql --env production
```

**Schema tables:**
- `llm_calls` — per-call ledger (provider, model, tokens_in, tokens_out, cost_cents, run_id, ...)
- `budget_tracking` — monthly rollup (project, actor, yyyy_mm, total_tokens, total_cents, ...)

#### 1.4 Update wrangler.toml with AI Gateway config

```toml
[vars]
# ... existing ...
AI_GATEWAY_BASE_URL = "https://gateway.ai.cloudflare.com/v1/{ACCOUNT_ID}/humandesign/anthropic"
VERTEX_PROJECT = "factory-495015"
VERTEX_LOCATION = "us-central1"

# VERTEX_ACCESS_TOKEN set via: npx wrangler secret put VERTEX_ACCESS_TOKEN --env production
# (CircleCI / GitHub Actions GCP workload identity flow)
```

**Verify in CF console:**
- [ ] AI Gateway → Custom domain → Create routing profile `humandesign`
- [ ] Add providers: anthropic, gemini (via Vertex), groq
- [ ] Configure cost cap: $5 per request max

#### 1.5 Smoke test: bare LLM call (staging)

Deploy staging with new config, test health:

```bash
cd workers && npx wrangler deploy --env staging

# Smoke: POST /api/admin/llm-test with {"prompt": "hello"}
# Should route through AI Gateway, hit Anthropic, return 200 OK
curl -H "Content-Type: application/json" \
  -d '{"prompt": "test"}' \
  https://prime-self-api-staging.adrper79-dot.workers.dev/api/admin/llm-test
```

---

### Phase 2: Adapter Migration (Days 2–3)

#### 2.1 Update imports: One handler at a time

**For each of 11 handlers:**

**Before:**
```javascript
import { callLLM } from '../lib/llm.js';
```

**After:**
```javascript
import { callLLM } from '../lib/llm-adapter.js';
```

**List of handlers:**
1. `admin.js`
2. `chat.js`
3. `cluster.js`
4. `diary.js`
5. `dream-weaver.js`
6. `practitioner.js`
7. `profile-stream.js`
8. `profile.js`
9. `session-notes.js`
10. `sms.js`
11. (Check for any other imports of llm.js)

**Verification per handler:**
```bash
npm run lint
npm test -- tests/handlers/<handler>.test.js
```

#### 2.2 Validate call signature compatibility

llm-adapter wraps the new API and returns `{ text, tokens }` (same shape as legacy `callLLM`), so all handlers should work without changes to call sites.

**Spot checks:**
- `admin.js:1367` — `const result = await callLLM(...)` → handler expects `result.text` ✓
- `chat.js:82` — same usage pattern ✓
- `dream-weaver.js:218,334` — same ✓

---

### Phase 3: Regression Testing on Historical Data (Days 3–4)

#### 3.1 Identify 20 historical syntheses

**Data source:** HumanDesign prod Neon database

```sql
-- Query: recent successful syntheses with full audit trail
SELECT
  synthesis_id,
  chart_id,
  user_id,
  created_at,
  synthesis_text,
  tokens_used,
  validation_score
FROM syntheses
WHERE created_at > NOW() - INTERVAL '30 days'
  AND validation_score > 0.85
  AND NOT is_reverted
ORDER BY created_at DESC
LIMIT 20;
```

**Capture baseline metrics per synthesis:**
- Input (chart+context)
- Output (text)
- Tokens
- Latency
- Validation thresholds

#### 3.2 Parallel run: old vs. new

**Setup on staging:**
```bash
# Deploy 2 staging workers:
#   1. prime-self-api-staging (current: llm.js)
#   2. prime-self-api-staging-new (HEAD: llm-adapter.js)

# For each of 20 historical syntheses:
# 1. POST /api/admin/synthesis --header "X-llm-impl: legacy"
#    (calls old worker, returns result_legacy)
# 2. POST /api/admin/synthesis --header "X-llm-impl: new"
#    (calls new worker, returns result_new)
# 3. Compare:
#    - Token count ≤ 10% variance
#    - Output structure matches schema
#    - Validation score > 0.85 (same floor)
```

#### 3.3 Generate comparison report

**Report template (`tests/llm-migration-report.md`):**

```markdown
# LLM Migration Regression Report

| Synthesis ID | Old Tokens | New Tokens | Δ | Old Score | New Score | Status |
|---|---|---|---|---|---|---|
| synth_001... | 342 | 355 | +3.8% | 0.91 | 0.89 | ✓ pass |
| ... | | | | | | |
| synth_020... | 289 | 281 | -2.8% | 0.87 | 0.88 | ✓ pass |

**Summary:**
- All 20 syntheses: validation score > threshold
- Token variance: mean ±2.1%, max ±7.3% (within expected)
- No provider misroutes detected
- **Status: REGRESSION APPROVED**
```

#### 3.4 Merge & deploy to production

On passing report:
```bash
git commit -am "
feat(llm): migrate to @latimer-woods-tech/llm; delete legacy lib/llm.js

- Add llm-adapter.js wrapper for easy import swap
- Update all 11 handlers to use new adapter
- Provisional D1 LLM_LEDGER binding
- AI Gateway routing enabled
- 20 historical syntheses validated: no regression

Closes factory#100 (SUP-2.3)
Fixes HumanDesign#68
"

git push origin HEAD
gh pr create --repo Latimer-Woods-Tech/HumanDesign \
  --title "feat(llm): consume @latimer-woods-tech/llm, delete legacy lib/llm.js" \
  --body "20 historical syntheses validated. See tests/llm-migration-report.md."
```

---

### Phase 4: Cleanup & Decommission (Day 4)

#### 4.1 Delete legacy llm.js

Once llm-adapter is wired and tested in production:

```bash
rm workers/src/lib/llm.js
git commit -am "chore: remove legacy LLM adapter (replaced by @latimer-woods-tech/llm)"
git push
```

#### 4.2 Cleanup: legacy files with LLM comment

Search for files that reference the old llm.js path:
```bash
grep -r "lib/llm" workers/src --include="*.js" --include="*.ts"
```

Clean up imports/comments.

#### 4.3 Update CLAUDE.md standing orders

Add to "Stack" section:
```
- LLM chain: @latimer-woods-tech/llm (Anthropic → Gemini on long-context → Groq fallback)
```

---

## Risks & Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| **Regression in synthesis quality** | Revenue impact: users see lower-quality readings | 20 historical syntheses regression test gate. Validation thresholds must hold. |
| **Token cost explosion** | Budget violation | D1 per-run cap ($5 → alert). Gemini routing only on `>150k` tokens (rare). |
| **AI Gateway misconfiguration** | Requests fail-open or fall through to wrong provider | Staging smoke test before staging→prod promotion. |
| **Vertex AI auth failure** | Gemini requests blocked | GCP service account + workload identity pre-validated in CI/CD. |
| **Latency regression** | Timeout errors on slow synthesis | No new timeout thresholds expected; adapter is pass-through wrapper. |

---

## Success Criteria

- [ ] 1. All 11 handlers import from `llm-adapter.js` (not legacy `llm.js`)
- [ ] 2. D1 LLM_LEDGER bound and migrated
- [ ] 3. wrangler.toml includes AI_GATEWAY_BASE_URL, VERTEX_* vars
- [ ] 4. 20 historical syntheses pass regression test (validation > 0.85, token variance < 10%)
- [ ] 5. Staging deployment validates no 5xx errors
- [ ] 6. legacy `workers/src/lib/llm.js` deleted
- [ ] 7. PR merged to main
- [ ] 8. Production deployment successful (monitoring for Sentry spike)
- [ ] 9. factory#100 SUP-2 exit gate satisfied: "every LLM call metered + gateway-routed"

---

## Open Questions

1. **AI Gateway account routing:** Is `humandesign` routing profile already configured in the Cloudflare account, or does it need to be created?
2. **Vertex AI auth:** Will VERTEX_ACCESS_TOKEN be injected by CircleCI/GHA, or manually?
3. **Historical syntheses:** How to access prod Neon securely for regression testing? (read-only, scoped, audit-logged)
4. **Rollback:** If regression detected post-deploy, revert to legacy llm.js or manually re-deploy old version?

---

## Dependencies

**Blocks:**
- factory#101 (@latimer-woods-tech/llm publishing)
- factory#102 (@latimer-woods-tech/llm-meter publishing)

**Blocks for downstream:**
- factory#100 (SUP-2 exit gate)
- factory#103 (SUP-3 gating, supervisor uses new llm package)

---

## Timeline

**Target completion:** Week 2 of SUP-2 cycle (concurrent with factory#101 + factory#102)

| Phase | Duration | Start | End |
|---|---|---|---|
| Prereqs | 2 days | Mon | Tue EOD |
| Adapter migration | 1 day | Wed | Wed EOD |
| Regression testing | 1 day | Wed EOD | Thu EOD |
| Cleanup + deploy | 0.5 day | Fri | Fri noon |

**Total effort:** ~4.5 days (1 human full-time, sequential)
# SUP-2.3 Review: Consume @latimer-woods-tech/llm; delete workers/src/lib/llm.js

**Issue:** HumanDesign#68 (linked to factory#100)  
**Epic:** SUP-2 (LLM substrate)  
**Scope:** Consume `@latimer-woods-tech/llm@0.3.0` in HumanDesign, delete legacy `lib/llm.js`, validate on 20 historical syntheses  
**Status:** ⏳ NOT STARTED — blocked on prerequisites

---

## Current State

### HumanDesign LLM Implementation

**Legacy adapter (in place):**
- File: `workers/src/lib/llm.js`
- Exports: `callLLM(promptPayload, env, { signal })` → `{ text, tokens }`
- Behavior: Anthropic → Grok → Groq failover, 3 retries on Anthropic with backoff
- Model map: Opus/Sonnet/Haiku → [Grok, Groq] equivalents
- **Used by 11 handlers:**
  1. `admin.js` (1 call)
  2. `chat.js` (1 call)
  3. `cluster.js` (1 call)
  4. `diary.js` (1 call)
  5. `dream-weaver.js` (2 calls)
  6. `practitioner.js` (2 calls)
  7. `profile-stream.js` (2 calls)
  8. `profile.js` (3 calls)
  9. `session-notes.js` (1 call)
  10. `sms.js` (1 call)
  11. **Subtotal: 16 active callLLM invocations**

**Drop-in replacement ready (scaffolded but NOT wired):**
- File: `workers/src/lib/llm-adapter.js`
- Purpose: Wraps new `@latimer-woods-tech/llm@0.3.0` via `@latimer-woods-tech/llm-meter`
- Exports: Same `callLLM()` signature for easy import swap
- Status: **Code present but unreachable** (dependencies not installed)
- Note: Comment declares this is "SUP-2.3 scaffold"

**Validation framework exists:**
- File: `workers/src/lib/llm-response-validator.js` — thresholds tuned to legacy Anthropic multimodal
- **BLOCKER:** New provider (Gemini) + routing logic changes may violate thresholds

---

## Prerequisites (NOT MET)

### 1. ❌ Package Installation
- [ ] `@latimer-woods-tech/llm@0.3.0` installed in HumanDesign
- [ ] `@latimer-woods-tech/llm-meter@0.1.0` installed in HumanDesign
- [ ] `.npmrc` authentication configured for Factory package scope

**Status:** Not present in `package.json` dependencies

### 2. ❌ D1 LLM_LEDGER Binding
- [ ] D1 database `HumanDesign-llm-ledger` provisioned
- [ ] Binding added to `workers/wrangler.toml`: `[[d1_databases]]` with `LLM_LEDGER`
- [ ] Migration schema: `004_llm_ledger.sql` applied
- Ledger tables: `llm_calls`, `budget_tracking` (templates in `/migrations/0004_llm_ledger.sql`)

**Status:** Not configured in `workers/wrangler.toml`

### 3. ❌ wrangler.toml Environment Variables
**Required additions to `[vars]` section:**
```toml
AI_GATEWAY_BASE_URL = "https://gateway.ai.cloudflare.com/v1/{ACCOUNT}/{GATEWAY}/anthropic"
VERTEX_PROJECT = "factory-495015"
VERTEX_LOCATION = "us-central1"
VERTEX_ACCESS_TOKEN = "..." # GCP short-lived bearer token (from CI/CD)
```

**Status:** Only `AI_GATEWAY_BASE_URL` placeholder exists; others missing

### 4. ❌ Cloudflare AI Gateway Binding
- [ ] Account-level AI Gateway configured with routing profile `selfprime-api`
- [ ] Profile includes: `anthropic`, `gemini`, `groq` providers
- [ ] Gateway URL format: `https://gateway.ai.cloudflare.com/v1/{account.id}/selfprime-api/...`

**Status:** Unknown — requires CF console verification

### 5. ❌ Regression Test Suite on Historical Data
- [ ] Identify 20 historical syntheses (past successful runs with validators passing)
- [ ] Capture baseline metrics: latency, token count, output schema, validation scores
- [ ] Set up parallel run comparison: old llm.js vs new llm-adapter against same inputs
- [ ] No regression threshold violated (LLM response variance OK; structure must match)

**Status:** Not scoped. Need HumanDesign prod data access.

---

## Migration Plan

### Phase 1: Prerequisites (Days 1–2)

#### 1.1 Install packages
```bash
cd HumanDesign
npm install @latimer-woods-tech/llm@0.3.0 @latimer-woods-tech/llm-meter@0.1.0
npm install  # install + lock
```

**Verification:**
```bash
npm list @latimer-woods-tech/llm @latimer-woods-tech/llm-meter
```

#### 1.2 Provision D1 LLM_LEDGER

```bash
# Create D1 database (in Factory account, not HumanDesign — shared infra)
wrangler d1 create factory-humandesign-llm-ledger --env production

# Copy the database_id returned
# Update HumanDesign workers/wrangler.toml:
```

```toml
[[d1_databases]]
binding = "LLM_LEDGER"
database_name = "factory-humandesign-llm-ledger"
database_id = "<database_id from create output>"
```

**Verification:**
```bash
wrangler d1 info factory-humandesign-llm-ledger --env production
```

#### 1.3 Apply D1 schema migration

Copy `migrations/0004_llm_ledger.sql` from Factory/migrations, adapt for HumanDesign context, apply:

```bash
wrangler d1 execute factory-humandesign-llm-ledger < migrations/0004_llm_ledger.sql --env production
```

**Schema tables:**
- `llm_calls` — per-call ledger (provider, model, tokens_in, tokens_out, cost_cents, run_id, ...)
- `budget_tracking` — monthly rollup (project, actor, yyyy_mm, total_tokens, total_cents, ...)

####1.4 Update wrangler.toml with AI Gateway config

```toml
[vars]
# ... existing ...
AI_GATEWAY_BASE_URL = "https://gateway.ai.cloudflare.com/v1/{ACCOUNT_ID}/humandesign/anthropic"
VERTEX_PROJECT = "factory-495015"
VERTEX_LOCATION = "us-central1"

# VERTEX_ACCESS_TOKEN set via: npx wrangler secret put VERTEX_ACCESS_TOKEN --env production
# (CircleCI / GitHub Actions GCP workload identity flow)
```

**Verify in CF console:**
- [ ] AI Gateway → Custom domain → Create routing profile `humandesign`
- [ ] Add providers: anthropic, gemini (via Vertex), groq
- [ ] Configure cost cap: $5 per request max

#### 1.5 Smoke test: bare LLM call (staging)

Deploy staging with new config, test health:

```bash
cd workers && npx wrangler deploy --env staging

# Smoke: POST /api/admin/llm-test with {"prompt": "hello"}
# Should route through AI Gateway, hit Anthropic, return 200 OK
curl -H "Content-Type: application/json" \
  -d '{"prompt": "test"}' \
  https://prime-self-api-staging.adrper79-dot.workers.dev/api/admin/llm-test
```

---

### Phase 2: Adapter Migration (Days 2–3)

#### 2.1 Update imports: One handler at a time

**For each of 11 handlers:**

**Before:**
```javascript
import { callLLM } from '../lib/llm.js';
```

**After:**
```javascript
import { callLLM } from '../lib/llm-adapter.js';
```

**List of handlers:**
1. `admin.js`
2. `chat.js`
3. `cluster.js`
4. `diary.js`
5. `dream-weaver.js`
6. `practitioner.js`
7. `profile-stream.js`
8. `profile.js`
9. `session-notes.js`
10. `sms.js`
11. (Check for any other imports of llm.js)

**Verification per handler:**
```bash
npm run lint
npm test -- tests/handlers/<handler>.test.js
```

#### 2.2 Validate call signature compatibility

llm-adapter wraps the new API and returns `{ text, tokens }` (same shape as legacy `callLLM`), so all handlers should work without changes to call sites.

**Spot checks:**
- `admin.js:1367` — `const result = await callLLM(...)` → handler expects `result.text` ✓
- `chat.js:82` — same usage pattern ✓
- `dream-weaver.js:218,334` — same ✓

---

### Phase 3: Regression Testing on Historical Data (Days 3–4)

#### 3.1 Identify 20 historical syntheses

**Data source:** HumanDesign prod Neon database

```sql
-- Query: recent successful syntheses with full audit trail
SELECT
  synthesis_id,
  chart_id,
  user_id,
  created_at,
  synthesis_text,
  tokens_used,
  validation_score
FROM syntheses
WHERE created_at > NOW() - INTERVAL '30 days'
  AND validation_score > 0.85
  AND NOT is_reverted
ORDER BY created_at DESC
LIMIT 20;
```

**Capture baseline metrics per synthesis:**
- Input (chart+context)
- Output (text)
- Tokens
- Latency
- Validation thresholds

#### 3.2 Parallel run: old vs. new

**Setup on staging:**
```bash
# Deploy 2 staging workers:
#   1. prime-self-api-staging (current: llm.js)
#   2. prime-self-api-staging-new (HEAD: llm-adapter.js)

# For each of 20 historical syntheses:
# 1. POST /api/admin/synthesis --header "X-llm-impl: legacy"
#    (calls old worker, returns result_legacy)
# 2. POST /api/admin/synthesis --header "X-llm-impl: new"
#    (calls new worker, returns result_new)
# 3. Compare:
#    - Token count ≤ 10% variance
#    - Output structure matches schema
#    - Validation score > 0.85 (same floor)
```

#### 3.3 Generate comparison report

**Report template (`tests/llm-migration-report.md`):**

```markdown
# LLM Migration Regression Report

| Synthesis ID | Old Tokens | New Tokens | Δ | Old Score | New Score | Status |
|---|---|---|---|---|---|---|
| synth_001... | 342 | 355 | +3.8% | 0.91 | 0.89 | ✓ pass |
| ... | | | | | | |
| synth_020... | 289 | 281 | -2.8% | 0.87 | 0.88 | ✓ pass |

**Summary:**
- All 20 syntheses: validation score > threshold
- Token variance: mean ±2.1%, max ±7.3% (within expected)
- No provider misroutes detected
- **Status: REGRESSION APPROVED**
```

#### 3.4 Merge & deploy to production

On passing report:
```bash
git commit -am "
feat(llm): migrate to @latimer-woods-tech/llm; delete legacy lib/llm.js

- Add llm-adapter.js wrapper for easy import swap
- Update all 11 handlers to use new adapter
- Provisional D1 LLM_LEDGER binding
- AI Gateway routing enabled
- 20 historical syntheses validated: no regression

Closes factory#100 (SUP-2.3)
Fixes HumanDesign#68
"

git push origin HEAD
gh pr create --repo Latimer-Woods-Tech/HumanDesign \
  --title "feat(llm): consume @latimer-woods-tech/llm, delete legacy lib/llm.js" \
  --body "20 historical syntheses validated. See tests/llm-migration-report.md."
```

---

### Phase 4: Cleanup & Decommission (Day 4)

#### 4.1 Delete legacy llm.js

Once llm-adapter is wired and tested in production:

```bash
rm workers/src/lib/llm.js
git commit -am "chore: remove legacy LLM adapter (replaced by @latimer-woods-tech/llm)"
git push
```

#### 4.2 Cleanup: legacy files with LLM comment

Search for files that reference the old llm.js path:
```bash
grep -r "lib/llm" workers/src --include="*.js" --include="*.ts"
```

Clean up imports/comments.

#### 4.3 Update CLAUDE.md standing orders

Add to "Stack" section:
```
- LLM chain: @latimer-woods-tech/llm (Anthropic → Gemini on long-context → Groq fallback)
```

---

## Risks & Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| **Regression in synthesis quality** | Revenue impact: users see lower-quality readings | 20 historical syntheses regression test gate. Validation thresholds must hold. |
| **Token cost explosion** | Budget violation | D1 per-run cap ($5 → alert). Gemini routing only on `>150k` tokens (rare). |
| **AI Gateway misconfiguration** | Requests fail-open or fall through to wrong provider | Staging smoke test before staging→prod promotion. |
| **Vertex AI auth failure** | Gemini requests blocked | GCP service account + workload identity pre-validated in CI/CD. |
| **Latency regression** | Timeout errors on slow synthesis | No new timeout thresholds expected; adapter is pass-through wrapper. |

---

## Success Criteria

- [ ] 1. All 11 handlers import from `llm-adapter.js` (not legacy `llm.js`)
- [ ] 2. D1 LLM_LEDGER bound and migrated
- [ ] 3. wrangler.toml includes AI_GATEWAY_BASE_URL, VERTEX_* vars
- [ ] 4. 20 historical syntheses pass regression test (validation > 0.85, token variance < 10%)
- [ ] 5. Staging deployment validates no 5xx errors
- [ ] 6. legacy `workers/src/lib/llm.js` deleted
- [ ] 7. PR merged to main
- [ ] 8. Production deployment successful (monitoring for Sentry spike)
- [ ] 9. factory#100 SUP-2 exit gate satisfied: "every LLM call metered + gateway-routed"

---

## Open Questions

1. **AI Gateway account routing:** Is `humandesign` routing profile already configured in the Cloudflare account, or does it need to be created?
2. **Vertex AI auth:** Will VERTEX_ACCESS_TOKEN be injected by CircleCI/GHA, or manually?
3. **Historical syntheses:** How to access prod Neon securely for regression testing? (read-only, scoped, audit-logged)
4. **Rollback:** If regression detected post-deploy, revert to legacy llm.js or manually re-deploy old version?

---

## Dependencies

**Blocks:**
- factory#101 (@latimer-woods-tech/llm publishing)
- factory#102 (@latimer-woods-tech/llm-meter publishing)

**Blocks for downstream:**
- factory#100 (SUP-2 exit gate)
- factory#103 (SUP-3 gating, supervisor uses new llm package)

---

## Timeline

**Target completion:** Week 2 of SUP-2 cycle (concurrent with factory#101 + factory#102)

| Phase | Duration | Start | End |
|---|---|---|---|
| Prereqs | 2 days | Mon | Tue EOD |
| Adapter migration | 1 day | Wed | Wed EOD |
| Regression testing | 1 day | Wed EOD | Thu EOD |
| Cleanup + deploy | 0.5 day | Fri | Fri noon |

**Total effort:** ~4.5 days (1 human full-time, sequential)

