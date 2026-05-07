# SUP-2.3 Action Checklist — Quick Start

## Current Blockers (Must resolve before code changes)

### ❌ Blocker 1: Packages not published
- [ ] Verify `@latimer-woods-tech/llm@0.3.0` is published to Factory package registry
- [ ] Verify `@latimer-woods-tech/llm-meter@0.1.0` is published to Factory package registry
- **Depends on:** factory#101, factory#102

### ❌ Blocker 2: HumanDesign D1 not provisioned
```bash
# Run once to provision:
wrangler d1 create factory-humandesign-llm-ledger --env production

# Then copy database_id to workers/wrangler.toml
[[d1_databases]]
binding = "LLM_LEDGER"
database_name = "factory-humandesign-llm-ledger"
database_id = "<id_from_above>"
```

### ❌ Blocker 3: Cloudflare AI Gateway not configured for HumanDesign
- [ ] CF console: verify `humandesign` routing profile exists under account's AI Gateway
- [ ] Verify routing includes: `anthropic`, Vertex (`gemini`), `groq`
- [ ] Document the gateway URL pattern for wrangler.toml

---

## Once Blockers Cleared: Work Stream

### Phase 1: Dependencies & Config
1. **Install packages**
   ```bash
   cd HumanDesign
   npm install @latimer-woods-tech/llm@0.3.0 @latimer-woods-tech/llm-meter@0.1.0
   ```

2. **Create & migrate D1**
   ```bash
   # Run migration SQL against new database
   wrangler d1 execute factory-humandesign-llm-ledger < /path/to/0004_llm_ledger.sql
   ```

3. **Update wrangler.toml**
   ```toml
   [vars]
   AI_GATEWAY_BASE_URL = "https://gateway.ai.cloudflare.com/v1/<ACCOUNT>/<GATEWAY>/anthropic"
   VERTEX_PROJECT = "factory-495015"
   VERTEX_LOCATION = "us-central1"
   
   # Secret (set separately):
   # npx wrangler secret put VERTEX_ACCESS_TOKEN --env production
   ```

4. **Staging smoke test**
   ```bash
   cd workers && npx wrangler deploy --env staging
   # Test: curl https://prime-self-api-staging.adrper79-dot.workers.dev/api/admin/llm-test
   ```

### Phase 2: Wire Handlers (one per commit)
Import changes in order:
1. `admin.js` — import change only
2. `chat.js`
3. `cluster.js`
4. `diary.js`
5. `dream-weaver.js`
6. `practitioner.js`
7. `profile-stream.js`
8. `profile.js`
9. `session-notes.js`
10. `sms.js`
11. Remaining

**Per handler:**
```bash
npm run lint
npm run typecheck
npm test
```

### Phase 3: Regression Testing
1. **Identify 20 historical syntheses** from prod Neon
   ```sql
   SELECT synthesis_id, chart_id, created_at, synthesis_text, tokens_used, validation_score
   FROM syntheses
   WHERE created_at > NOW() - INTERVAL '30 days'
     AND validation_score > 0.85
   ORDER BY created_at DESC LIMIT 20;
   ```

2. **Parallel run test** (staging)
   - Deploy old worker + new worker side-by-side
   - For each synthesis: call both, compare output & tokens
   - Document in `tests/llm-migration-report.md`

3. **Merge criteria**
   - ✓ All 20 syntheses validation > 0.85
   - ✓ Token variance < 10%
   - ✓ No provider routing errors

### Phase 4: Cleanup
1. Delete `workers/src/lib/llm.js`
2. Clean up any legacy comments referencing old path
3. Update `CLAUDE.md` standing orders

---

## Testing Before Each Handler Merge

```bash
# Lint
npm run lint:workers

# Type check
npm run typecheck

# Unit tests (if exist)
npm test -- tests/handlers/<handler>.test.js

# Full test suite (before final PR)
npm test -- tests/deterministic
```

---

## Commit Message Template

```
feat(llm): wire <handler> to @latimer-woods-tech/llm

- Replace ../lib/llm.js import with ../lib/llm-adapter.js
- Adapter provides identical callLLM signature
- No handler logic changes required

Part of SUP-2.3 (Closes HumanDesign#68)
```

Final commit (delete legacy):
```
chore(llm): remove legacy lib/llm.js — replaced by @latimer-woods-tech/llm

- Delete workers/src/lib/llm.js
- All handlers now use llm-adapter.js
- Validated on 20 historical syntheses (see tests/llm-migration-report.md)

Closes factory#100 SUP-2.3
Supersedes HumanDesign#39
```

---

## Monitoring Post-Deploy

- **Sentry alerts:** llm.js spans should disappear; llm-adapter spans should appear
- **D1 ledger:** first `llm_calls` rows should appear within 5min of staging deploy
- **AI Gateway cost log:** verify requests hitting gateway (vs direct API)
- **Validate threshold:** watch for validation-score dips > 5% — indicate rollback threshold
# SUP-2.3 Action Checklist — Quick Start

## Current Blockers (Must resolve before code changes)

### ❌ Blocker 1: Packages not published
- [ ] Verify `@latimer-woods-tech/llm@0.3.0` is published to Factory package registry
- [ ] Verify `@latimer-woods-tech/llm-meter@0.1.0` is published to Factory package registry
- **Depends on:** factory#101, factory#102

### ❌ Blocker 2: HumanDesign D1 not provisioned
```bash
# Run once to provision:
wrangler d1 create factory-humandesign-llm-ledger --env production

# Then copy database_id to workers/wrangler.toml
[[d1_databases]]
binding = "LLM_LEDGER"
database_name = "factory-humandesign-llm-ledger"
database_id = "<id_from_above>"
```

### ❌ Blocker 3: Cloudflare AI Gateway not configured for HumanDesign
- [ ] CF console: verify `humandesign` routing profile exists under account's AI Gateway
- [ ] Verify routing includes: `anthropic`, Vertex (`gemini`), `groq`
- [ ] Document the gateway URL pattern for wrangler.toml

---

## Once Blockers Cleared: Work Stream

### Phase 1: Dependencies & Config
1. **Install packages**
   ```bash
   cd HumanDesign
   npm install @latimer-woods-tech/llm@0.3.0 @latimer-woods-tech/llm-meter@0.1.0
   ```

2. **Create & migrate D1**
   ```bash
   # Run migration SQL against new database
   wrangler d1 execute factory-humandesign-llm-ledger < /path/to/0004_llm_ledger.sql
   ```

3. **Update wrangler.toml**
   ```toml
   [vars]
   AI_GATEWAY_BASE_URL = "https://gateway.ai.cloudflare.com/v1/<ACCOUNT>/<GATEWAY>/anthropic"
   VERTEX_PROJECT = "factory-495015"
   VERTEX_LOCATION = "us-central1"
   
   # Secret (set separately):
   # npx wrangler secret put VERTEX_ACCESS_TOKEN --env production
   ```

4. **Staging smoke test**
   ```bash
   cd workers && npx wrangler deploy --env staging
   # Test: curl https://prime-self-api-staging.adrper79-dot.workers.dev/api/admin/llm-test
   ```

### Phase 2: Wire Handlers (one per commit)
Import changes in order:
1. `admin.js` — import change only
2. `chat.js`
3. `cluster.js`
4. `diary.js`
5. `dream-weaver.js`
6. `practitioner.js`
7. `profile-stream.js`
8. `profile.js`
9. `session-notes.js`
10. `sms.js`
11. Remaining

**Per handler:**
```bash
npm run lint
npm run typecheck
npm test
```

### Phase 3: Regression Testing
1. **Identify 20 historical syntheses** from prod Neon
   ```sql
   SELECT synthesis_id, chart_id, created_at, synthesis_text, tokens_used, validation_score
   FROM syntheses
   WHERE created_at > NOW() - INTERVAL '30 days'
     AND validation_score > 0.85
   ORDER BY created_at DESC LIMIT 20;
   ```

2. **Parallel run test** (staging)
   - Deploy old worker + new worker side-by-side
   - For each synthesis: call both, compare output & tokens
   - Document in `tests/llm-migration-report.md`

3. **Merge criteria**
   - ✓ All 20 syntheses validation > 0.85
   - ✓ Token variance < 10%
   - ✓ No provider routing errors

### Phase 4: Cleanup
1. Delete `workers/src/lib/llm.js`
2. Clean up any legacy comments referencing old path
3. Update `CLAUDE.md` standing orders

---

## Testing Before Each Handler Merge

```bash
# Lint
npm run lint:workers

# Type check
npm run typecheck

# Unit tests (if exist)
npm test -- tests/handlers/<handler>.test.js

# Full test suite (before final PR)
npm test -- tests/deterministic
```

---

## Commit Message Template

```
feat(llm): wire <handler> to @latimer-woods-tech/llm

- Replace ../lib/llm.js import with ../lib/llm-adapter.js
- Adapter provides identical callLLM signature
- No handler logic changes required

Part of SUP-2.3 (Closes HumanDesign#68)
```

Final commit (delete legacy):
```
chore(llm): remove legacy lib/llm.js — replaced by @latimer-woods-tech/llm

- Delete workers/src/lib/llm.js
- All handlers now use llm-adapter.js
- Validated on 20 historical syntheses (see tests/llm-migration-report.md)

Closes factory#100 SUP-2.3
Supersedes HumanDesign#39
```

---

## Monitoring Post-Deploy

- **Sentry alerts:** llm.js spans should disappear; llm-adapter spans should appear
- **D1 ledger:** first `llm_calls` rows should appear within 5min of staging deploy
- **AI Gateway cost log:** verify requests hitting gateway (vs direct API)
- **Validate threshold:** watch for validation-score dips > 5% — indicate rollback threshold

