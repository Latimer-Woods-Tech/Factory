# Phase 3: Supervisor Deployment & Smoke Test Checklist

**Status:** Phase 2 merged successfully (2026-05-24); Phase 3 prerequisites in progress.

## Blocking Dependencies (MUST resolve before deployment)

### ✋ STOP: Confirm factory-cross-repo endpoint details

**Responsibility:** Team C lead

**Required information:**
- [ ] **FACTORY_CROSS_REPO_URL** — Base URL of factory-cross-repo worker
  - Example: `https://factory-cross-repo-worker.adrper79.workers.dev`
  - The endpoint expects: `POST {URL}/api/supervisor/create-pr`
  - Must be Cloudflare Workers URL (branded custom domain preferred, `*.workers.dev` fallback)

- [ ] **FACTORY_CROSS_REPO_TOKEN** — Bearer token for authentication
  - Type: Bearer token or signed JWT (to be confirmed)
  - Will be stored as GitHub repo secret `FACTORY_CROSS_REPO_TOKEN`
  - Used in supervisor worker via `env.FACTORY_CROSS_REPO_TOKEN`

**Reference:** [FACTORY-CROSS-REPO-INTEGRATION.md](./FACTORY-CROSS-REPO-INTEGRATION.md)

**Action:** Once received, file as GitHub Issue comment in Factory #974 (Phase 2 PR) with the values.

---

## Phase 3 Deployment Steps (once endpoints confirmed)

### Step 1: Wire secrets to GitHub (Factory repo)

```bash
# After receiving FACTORY_CROSS_REPO_TOKEN value from Team C:
gh secret set FACTORY_CROSS_REPO_TOKEN --body "<token-value-from-team-c>"
```

### Step 2: Update supervisor/wrangler.jsonc

Once FACTORY_CROSS_REPO_URL is confirmed, replace the placeholder:

```jsonc
"vars": {
  // ... existing vars ...
  "FACTORY_CROSS_REPO_URL": "https://factory-cross-repo-worker.adrper79.workers.dev",
},
```

**Note:** The actual endpoint path (`/api/supervisor/create-pr`) is appended in code; only the base URL goes here.

### Step 3: Deploy supervisor worker

```bash
cd apps/supervisor
npm run build
npm run deploy  # Uses GitHub Actions or local wrangler deploy
```

**Verification:** 
```bash
curl https://supervisor.latwoodtech.work/health
# Expected: 200 OK with health payload
```

### Step 4: Run Phase 3 smoke tests (5 scenarios)

Once supervisor is deployed with factory-cross-repo integration:

```bash
# Scenario 1: Baseline (no gates)
curl -X POST https://supervisor.latwoodtech.work/run \
  -H "Content-Type: application/json" \
  -d '{"template_id": "simple-readonly"}'
# Expected: Both steps execute, no PR opened (read-only)

# Scenario 2: Amplification cap (26 mutations)
curl -X POST https://supervisor.latwoodtech.work/run \
  -H "Content-Type: application/json" \
  -d '{"template_id": "with-amplification-cap"}'
# Expected: Execution stops at step 25, error receipt logged

# Scenario 3: Approval gate
curl -X POST https://supervisor.latwoodtech.work/run \
  -H "Content-Type: application/json" \
  -d '{"template_id": "with-approval-gate"}'
# Expected: Step 1 succeeds, step 2 triggers awaiting_approval, chain stops
# Then call /approve endpoint to resume

# Scenario 4: Verifier fails
curl -X POST https://supervisor.latwoodtech.work/run \
  -H "Content-Type: application/json" \
  -d '{"template_id": "with-verifier"}'
# Expected: Execution succeeds, verifier fails, run marked failed_verification

# Scenario 5: Happy path (2 mutations + approval + verifier + PR)
curl -X POST https://supervisor.latwoodtech.work/run \
  -H "Content-Type: application/json" \
  -d '{"template_id": "end-to-end"}'
# Expected: Step 1 approval → approve → step 1 succeeds → step 2 succeeds → verifier passes → PR opened
```

### Step 5: Verify PR opening (GitHub)

After Scenario 5, check that a PR was opened in affected repos (HumanDesign, capricast, etc.) with:
- Title: `[Supervisor] {template_id} audit`
- Body: Contains template_id, run_id, step receipts
- Branches: Based on affected repos (verify 1 PR per repo)

### Step 6: Close Phase 3 ticket

Once all 5 scenarios pass and PR opening is verified:
- Mark ticket as Done on board
- Post summary comment in #974 with test results
- Archive this checklist

---

## Current Status

- [x] Phase 2 PR merged (commit dc950fb, canonical review approved)
- [x] supervisor wrangler.jsonc updated (FACTORY_CROSS_REPO_URL placeholder added)
- [ ] FACTORY_CROSS_REPO_URL confirmed by Team C
- [ ] FACTORY_CROSS_REPO_TOKEN received from Team C
- [ ] GitHub secret FACTORY_CROSS_REPO_TOKEN wired
- [ ] supervisor deployed with new environment variables
- [ ] All 5 smoke test scenarios passing
- [ ] PR opening verified on GitHub
- [ ] Phase 3 ticket closed

---

## Contact for Blockers

**Team C Lead (factory-cross-repo):** [TBD — set in Factory #974]

**Status tracking:** See [docs/STATE.md](../../docs/STATE.md) for live blockers and sprint progress.
