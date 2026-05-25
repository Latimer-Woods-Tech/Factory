# SUP-4 EXEC Leg — Full Implementation Plan

**Target:** Complete all 4 gaps (verifier, approval gates, write-amplification cap, PR opening) to unblock SUP-4 and cascade into next 6 blockers.

**Timeline:** Pre-reqs (1.5h) → parallel implementation (3.5h) → validation loop (2h) → documentation (1h) = **~8h wall-clock** with 3 parallel agent teams.

**Success Criteria:**
- All code compiles (TypeScript strict, zero any)
- All 4 gaps implemented with ≥90% unit test coverage
- End-to-end test: template → execution → verification → PR creation passes
- No regressions in existing supervisor routes
- FRIDGE.md + ADRs document design decisions
- Ready to unblock SUP-5 (LockDO per-app isolation)

---

## Phase 1: Pre-Requisites (1.5h, single-threaded)

### 1a. Schema Audit (10 min)
**Goal:** Confirm template schema supports acceptance_gate, verifier_query, requires_codeowner_approval.

**Checklist:**
- [ ] Read `apps/supervisor/src/planner/load.ts` — verify Template interface has:
  - `acceptance_gate?: { verifier_query: string; auto_approve?: boolean }`
  - Per-step `requires_codeowner_approval?: boolean`
- [ ] Check `docs/supervisor/FRIDGE.md` for schema version and any breaking changes
- [ ] If schema gaps exist, add fields to Template type (non-breaking, optional fields only)

**Deliverable:** Confirmed schema or typed patch (1–3 lines max)

---

### 1b. Execution Insertion Points (15 min)
**Goal:** Map where the 4 new features insert into handleRun() flow.

**Checklist:**
- [ ] Review `supervisor.do.ts` handleRun() line ~365–430
- [ ] Identify execution stages:
  1. Parameterize (slots filled)
  2. Pre-execute (pre-flight checks — INSERT amplification cap here)
  3. Execute (executePlan loop)
  4. Post-execute (INSERT verifier check here)
  5. Approval gate (INSERT CODEOWNER block here)
  6. Finalize (INSERT PR opening here)
  7. Log receipts (current final step)

**Deliverable:** Annotated flow diagram in ASCII (30 lines max) showing all 4 insertion points + data passed between stages

---

### 1c. Executor Baseline Assessment (10 min)
**Goal:** Understand current mutation tracking and identify refactor points.

**Checklist:**
- [ ] Review `executor.ts` executeStep() and executePlan()
- [ ] Count current tracking: side_effects field in receipt? ✓ (yes)
- [ ] Current mutation counter: none (need to add)
- [ ] Approval gate check: none (need to add)
- [ ] Cross-step result threading: previousResults works? ✓ (yes)

**Deliverable:** Implementation checklist for executor.ts (4 functions to add/modify)

---

### 1d. Factory-Cross-Repo Integration Surface (10 min)
**Goal:** Define the webhook call to open PRs.

**Checklist:**
- [ ] Find factory-cross-repo worker endpoint: `POST /api/supervisor/create-pr`?
- [ ] Confirm payload schema: `{ template_id, run_id, description, receipts, affected_repos }`?
- [ ] Check auth: Bearer token or JWT scope?
- [ ] Confirm rate limits and retry policy (use retry-after header)

**Deliverable:** Factory-cross-repo API surface spec (JSON schema + example curl)

---

### 1e. Test Fixture Design (20 min)
**Goal:** Pre-create mock templates for testing all 4 features.

**Create file:** `apps/supervisor/src/__fixtures__/templates.ts`

**Fixtures needed:**
1. **Template: simple-readonly** — No gates, baseline (exists? verify)
2. **Template: with-amplification-cap** — 26 mutating steps (should fail at step 26)
3. **Template: with-approval-gate** — Step 2 has `requires_codeowner_approval: true` (should stop at step 2)
4. **Template: with-verifier** — All steps succeed, but acceptance_gate.verifier_query fails (should rollback)
5. **Template: end-to-end** — 2 mutating steps, approval on step 1, verifier passes (should open PR)

**Deliverable:** `templates.ts` with all 5 fixtures exported + docstring explaining each

---

### 1f. ADR: Design Decisions (15 min)
**Goal:** Document why we chose these boundaries.

**Create file:** `docs/supervisor/ADR-EXEC-GAPS.md`

**Sections:**
- **Why verifier-readonly scope?** → prevents verifier from making its own mutations; audit trail stays clean
- **Why ≤25 mutations/run, ≤5/app?** → conservative bounds; ratified in production readiness phase (SUP-0.2)
- **Why approval gates stop execution?** → avoids cascading failures; CODEOWNER must explicitly unblock
- **Why PR opening post-verification?** → ensures only verified mutations get audit trail
- **Rollback strategy:** If verification fails, should steps be reverted? (Defer to SUP-5; mark as issue in FRIDGE.md)

**Deliverable:** ADR-EXEC-GAPS.md (1 page, rationale + open questions)

---

## Phase 2: Parallel Implementation (3.5h, 3 agent teams with isolation)

### Team A: Mutation Limits + Approval Gates (executor.ts)
**Agent isolation:** Yes (worktree)  
**Parallelism:** Starts immediately after pre-reqs  
**Owns:** apps/supervisor/src/executor.ts

**Tasks:**
1. Add mutation counter to executePlan():
   ```
   - Track mutatingCount = steps.filter(s => s.side_effects !== 'none').length
   - Track perAppCount = group receipts by app_id (from tool_name → registry mapping)
   - Throw error if mutatingCount > 25 or perAppCount > 5
   - Return error in StepReceipt.result before invoking tool
   ```

2. Add approval gate check to executeStep():
   ```
   - After tool.invoke() succeeds:
     if (step.requires_codeowner_approval && receipt.result.ok) {
       receipt.awaiting_approval = 'codeowner_confirmation'
       return receipt (stop chain)
     }
   ```

3. Update StepReceipt type (optional, might already exist):
   - Confirm `awaiting_approval?: 'codeowner_confirmation'` field
   - Add `mutation_count?: number` for debug logging

4. Write unit tests (Vitest):
   - Test amplification cap: 26 steps should fail at step 26
   - Test per-app cap: 3 apps × 2 steps each, 4th app's 1st step should fail
   - Test approval gate: step 2 with flag should stop execution
   - Test no-gate baseline: 25 mutating steps all pass

**Exit criteria:**
- `npm run typecheck` passes
- `npm run test -- executor.test.ts` passes with ≥90% coverage
- No regressions in existing tests

---

### Team B: Verifier Step Flow (supervisor.do.ts + new module)
**Agent isolation:** Yes (worktree)  
**Parallelism:** Starts after pre-reqs  
**Owns:** apps/supervisor/src/supervisor.do.ts + new apps/supervisor/src/verifier.ts

**Tasks:**
1. Create new verifier module (`verifier.ts`):
   ```
   export async function runVerifier(
     acceptanceGate: { verifier_query: string; auto_approve?: boolean },
     receipts: StepReceipt[],
     tools: ToolRegistry,
     env: Env,
   ): Promise<{ ok: boolean; reason?: string }>
   
   - If auto_approve=true: return { ok: true }
   - Otherwise: invoke verifier_query as a tool call (readonly scope)
   - Wait for tool.invoke() result
   - Log verifier receipt separately to supervisor_verifications table
   - Return { ok: result.ok, reason: result.error || undefined }
   ```

2. Update handleRun() to call verifier:
   ```
   - After executePlan() succeeds:
     if (template.acceptance_gate) {
       const verificationResult = await runVerifier(...)
       if (!verificationResult.ok) {
         Log run as "failed_verification"
         Return { ok: false, reason: verificationResult.reason }
       }
     }
   - Then proceed to receipt logging
   ```

3. Add D1 schema migration:
   ```sql
   CREATE TABLE supervisor_verifications (
     id TEXT PRIMARY KEY,
     run_id TEXT NOT NULL,
     verifier_query TEXT NOT NULL,
     tool_response JSON NOT NULL,
     verified_at BIGINT NOT NULL,
     FOREIGN KEY (run_id) REFERENCES supervisor_runs(id)
   )
   ```

4. Write unit tests (Vitest):
   - Test auto_approve=true: verifier skipped
   - Test verifier succeeds: run marked as verified
   - Test verifier fails: run marked as failed_verification, receipts not logged
   - Test no acceptance_gate: baseline unchanged

**Exit criteria:**
- `npm run typecheck` passes
- `npm run test -- verifier.test.ts` passes with ≥90% coverage
- Migration applies cleanly on test D1
- No regressions in existing tests

---

### Team C: PR Opening Integration (supervisor.do.ts + factory-cross-repo wiring)
**Agent isolation:** Yes (worktree)  
**Parallelism:** Starts after pre-reqs, depends on output from Teams A & B  
**Owns:** apps/supervisor/src/supervisor.do.ts + call to factory-cross-repo

**Tasks:**
1. Create PR opening module (inline in supervisor.do.ts):
   ```
   async function openSupervisorPR(
     receipts: StepReceipt[],
     templateId: string,
     description: string,
     env: Env,
   ): Promise<{ ok: boolean; pr_url?: string; error?: string }>
   
   - Extract affected repos from receipts (tool_name → registry)
   - Group receipts by repo
   - Call factory-cross-repo POST /api/supervisor/create-pr
   - Body: { template_id, description, receipts, affected_repos }
   - Use fetch with error handling per Hard Constraints
   - Return PR URL on success
   ```

2. Integrate into handleRun() post-verification:
   ```
   - After verification passes and before logging receipts:
     if (receipt has any mutating steps) {
       const prResult = await openSupervisorPR(...)
       if (prResult.ok) {
         Log pr_url to supervisor_runs table
       } else {
         Log warning but don't fail run (PR opening is async safety, not blocking)
       }
     }
   ```

3. Update supervisor_runs table schema:
   ```sql
   ALTER TABLE supervisor_runs ADD COLUMN pr_url TEXT;
   ALTER TABLE supervisor_runs ADD COLUMN pr_opened_at BIGINT;
   ```

4. Write unit tests (Vitest):
   - Mock factory-cross-repo endpoint
   - Test successful PR opening: pr_url recorded
   - Test factory-cross-repo 5xx: graceful degradation (warn, don't fail run)
   - Test no mutating steps: PR opening skipped
   - Test multi-repo receipt: single PR with multiple repos

**Exit criteria:**
- `npm run typecheck` passes
- `npm run test -- supervisor.do.ts` integration tests pass
- Dry run with `dry_run=true` skips PR opening
- factory-cross-repo endpoint validated via curl

---

### Team D: Integration Tests + Fixtures (parallel test suite)
**Agent isolation:** Yes (worktree)  
**Parallelism:** Starts after Team A code lands, consumes all 3 teams' fixtures  
**Owns:** apps/supervisor/src/__tests__/end-to-end.test.ts

**Tasks:**
1. Create end-to-end test file:
   ```
   apps/supervisor/src/__tests__/end-to-end.test.ts
   ```

2. Test scenarios (vitest + @cloudflare/vitest-pool-workers):
   - **Test 1:** Baseline template (no gates) → execution succeeds, PR opened
   - **Test 2:** Amplification cap exceeded → execution stops at step 26, receipt logged with error
   - **Test 3:** Approval gate triggers → execution stops at step 2, awaiting_approval set, no receipt logging
   - **Test 4:** Verifier fails → execution succeeds, verification fails, run marked failed_verification
   - **Test 5:** End-to-end happy path → 2 mutating steps, approval on step 1 (approved via admin API), verifier passes, PR opened, all receipts logged

3. Setup and teardown:
   - Seed D1 with test templates from fixtures
   - Mock ToolRegistry with stub tools (github.fetch, slack.send, etc.)
   - Mock factory-cross-repo endpoint
   - Clear supervisor_runs, supervisor_steps, supervisor_verifications after each test

4. Coverage requirements:
   - executor.ts: ≥90% lines, ≥85% branches
   - verifier.ts: ≥90% lines
   - supervisor.do.ts handleRun(): ≥85% lines (existing code excluded)
   - Overall: `npm run test -- --coverage` reports ≥85% project coverage

**Exit criteria:**
- `npm run test -- end-to-end.test.ts` passes
- Coverage report shows ≥85% project coverage
- All 5 scenarios pass consistently
- No flaky tests (re-run 3× to confirm)

---

## Phase 3: Validation Loop (2h, single-threaded orchestration)

### 3a. Merge & Conflict Resolution (20 min)
**Steps:**
1. Wait for all 4 teams' worktrees to report completion
2. Merge Team A → main (executor.ts changes)
3. Merge Team B → main (verifier.ts + supervisor.do.ts)
4. Merge Team C → main (PR opening + supervisor.do.ts)
5. Merge Team D → main (tests)
6. Resolve any merge conflicts (expected in supervisor.do.ts)
7. Full build: `npm run build` from monorepo root
8. Full typecheck: `npm run typecheck`
9. Full test: `npm run test`

**Exit:** All checks green, no merge conflicts remain

---

### 3b. Smoke Tests (30 min)
**Manual validation (curl + local wrangler dev):**

```bash
# Start supervisor worker locally
npm run dev -- --port 8787 &

# Test 1: Simple readonly template (baseline)
curl -X POST http://localhost:8787/run \
  -H 'Content-Type: application/json' \
  -d '{"template_id":"simple-readonly","version":"1.0","dry_run":false}'
# Expected: { ok: true, steps_executed: 2, receipts: [...] }

# Test 2: Amplification cap (26 steps)
curl -X POST http://localhost:8787/run \
  -H 'Content-Type: application/json' \
  -d '{"template_id":"with-amplification-cap","version":"1.0"}'
# Expected: { ok: false, error: "Mutation limit exceeded: 26 > 25" }

# Test 3: Approval gate (step 2 blocks)
curl -X POST http://localhost:8787/run \
  -d '{"template_id":"with-approval-gate","version":"1.0"}'
# Expected: { ok: false, awaiting_codeowner: true, receipts: [step1] }
# Then approve via:
curl -X POST http://localhost:8787/approve \
  -d '{"run_id":"...","codeowner":"adrper79"}'
# Expected: Execution resumes, step 2 executes, run marked passed

# Test 4: Verifier (fails)
curl -X POST http://localhost:8787/run \
  -d '{"template_id":"with-verifier","version":"1.0"}'
# Expected: { ok: false, failed_verification: true, reason: "..." }

# Test 5: End-to-end (PR opens)
curl -X POST http://localhost:8787/run \
  -d '{"template_id":"end-to-end","version":"1.0"}'
# Expected: { ok: true, pr_url: "https://github.com/.../pulls/NNN" }
```

**Exit:** All 5 curl tests return expected status codes and payloads

---

### 3c. Regression Tests (20 min)
**Goal:** Ensure existing supervisor routes still work.

**Checklist:**
- [ ] GET /health → 200
- [ ] GET /list → returns all templates
- [ ] POST /plan (parameterize only) → slots filled, no execution
- [ ] POST /dry-run → stats returned, no receipts logged
- [ ] GET /runs/{run_id} → retrieves run from D1
- [ ] GET /steps/{run_id} → retrieves all receipts

**Exit:** All regression tests pass, no behavioral changes to existing routes

---

### 3d. Git Safety Net (10 min)
**Setup pre-commit & pre-push hooks:**

**`.githooks/pre-commit`:**
```bash
#!/bin/bash
set -e

# Hard Constraints check
if grep -r "process\.env\." apps/supervisor/src/**/*.ts | grep -v test; then
  echo "ERROR: process.env found in supervisor worker code (Hard Constraint violation)"
  exit 1
fi

if grep -r "require(" apps/supervisor/src/**/*.ts | grep -v test; then
  echo "ERROR: CommonJS require found (Hard Constraint violation)"
  exit 1
fi

echo "✓ Hard Constraints passed"
```

**`.githooks/pre-push`:**
```bash
#!/bin/bash
set -e

# Full validation before push
npm run typecheck
npm run test -- --coverage
npm run build

if ! grep -q "≥85%" <(npm run test -- --coverage | tail -20); then
  echo "ERROR: Coverage below threshold"
  exit 1
fi

echo "✓ All validations passed"
```

**Enable hooks:**
```bash
git config core.hooksPath .githooks
chmod +x .githooks/pre-commit .githooks/pre-push
```

**Exit:** Hooks enabled, pre-push validation confirmed

---

## Phase 4: Documentation (1h, single-threaded)

### 4a. FRIDGE.md Update (20 min)
**File:** `docs/supervisor/FRIDGE.md` (§5.1 Execution Loop)

**Add sections:**
- **Verifier Gate:** When acceptance_gate is set, supervisor queries verifier tool before logging receipts. Verifier scope: readonly. Failure rollback strategy TBD (SUP-5).
- **Mutation Limits:** Hard cap at 25 mutations/run, 5/app. Enforced in executor pre-invoke. Exceeding returns error receipt, stops execution chain.
- **Approval Gates:** Steps with requires_codeowner_approval stop execution and await codeowner approval via /approve endpoint. Resume via POST /approve?run_id=...&codeowner=....
- **PR Opening:** Post-verification, mutating runs open audit PR on factory-cross-repo. Graceful failure (warns, doesn't block run).

---

### 4b. Capability Declaration Guide (20 min)
**File:** `docs/supervisor/CAPABILITY_DECLARATION.md` (new)

**Sections:**
- **How to declare a capability:** YAML structure with tool_name, slots schema, side_effects, requires_codeowner_approval, acceptance_gate
- **Example:** Read-only query vs. mutation with verifier
- **Testing:** How to write test fixtures for new capabilities
- **Rollout:** How to register in registry.yml and load in supervisor.loadTemplates()

---

### 4c. Integration Guide for App Teams (15 min)
**File:** `docs/supervisor/APP_INTEGRATION.md` (new)

**Sections:**
- **Reading Supervisor Results:** D1 supervisor_runs, supervisor_steps, supervisor_verifications tables; how to query status
- **Implementing a Capability Tool:** Signature of Tool.invoke(slots), expected return format
- **Declaring Tool Requirements:** How to list tools in capabilities.yml
- **Approval Gate Pattern:** When to require codeowner sign-off (mutations to prod config, user data migrations, etc.)

---

### 4d. Troubleshooting Runbook (5 min)
**File:** `docs/supervisor/TROUBLESHOOTING.md` (new)

**Common issues:**
- **Mutation cap exceeded:** Check receipts; profile tool invocations; consider breaking into sub-templates
- **Verifier fails:** Check verifier_query tool implementation; confirm readonly scope works
- **Approval gate stuck:** Codeowner can resume via /approve endpoint; confirm JWT is valid
- **PR opening fails:** Check factory-cross-repo health; verify affected_repos mapping correct

---

## Phase 5: Unblock Next Blocker (SUP-5, deferred)

Once all phases complete and merge, supervisor is ready to advance to:

**SUP-5: LockDO per-app vs global**
- Refactor single global `supervisor-run` lock to per-app locks
- Allows parallel execution of different apps' runs
- Prevents race conditions on same app

---

## Success Handoff Criteria

**For each phase to declare completion:**

| Phase | Criteria | Owner |
|-------|----------|-------|
| **Pre-reqs** | Schema audit ✓, flow diagram ✓, fixtures ✓, ADR ✓ | Lead |
| **Team A** | executor.ts compiles, ≥90% coverage, caps enforced | Team A |
| **Team B** | verifier.ts compiles, ≥90% coverage, D1 migration applies | Team B |
| **Team C** | PR opening works, factory-cross-repo wired, graceful fallback | Team C |
| **Team D** | 5 end-to-end scenarios pass, ≥85% project coverage | Team D |
| **Validation** | All smoke tests pass, regressions green, hooks enabled | Lead |
| **Documentation** | FRIDGE.md updated, 3 new guides written, runbook added | Lead |

---

## Risk Mitigations

| Risk | Mitigation |
|------|-----------|
| Teams A/B/C conflict in supervisor.do.ts | Pre-reqs define insertion points; each team claims own diff sections. Lead does merge. |
| Verifier tool not found in registry | fixtures.ts mocks ToolRegistry.get(); real tools are app-specific (SUP-6+). |
| factory-cross-repo endpoint unreachable | Graceful 5xx handling: log warning, mark run ok anyway. PR opening is safety net, not blocking. |
| D1 migration fails in production | Deferring live migration to SUP-0.2 gate. Pre-reqs test on local D1 only. |
| Approval gate race condition (CODEOWNER approves twice) | FRIDGE.md TODO: idempotency key on approval request. SUP-5 candidate. |

---

## Dependencies & Sequencing

```
Pre-reqs (single-threaded)
  ↓
  ├─ Team A (executor.ts) — parallel from here
  ├─ Team B (verifier.ts) — parallel from here
  ├─ Team C (PR opening) — parallel from here
  └─ Team D (integration tests) — starts after Team A
        ↓
All teams report completion
  ↓
Merge & conflict resolution
  ↓
Smoke tests & regression
  ↓
Documentation
  ↓
Unblock SUP-5
```

**Wall-clock:** ~8h with 3 parallel teams (≈24 engineering hours compressed).

---

## Automation & Hooks

**GitHub Workflow (on push to sup-4-* branch):**
```yaml
name: SUP-4 CI
on: [pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm run typecheck
      - run: npm run test -- --coverage
      - run: npm run build
  smoke-test:
    runs-on: ubuntu-latest
    if: ${{ github.event_name == 'pull_request' && contains(github.head_ref, 'sup-4') }}
    steps:
      - uses: actions/checkout@v4
      - run: npm run dev:start &
      - run: bash scripts/smoke-test-sup4.sh  # Pre-created script with all 5 curl tests
      - run: npm run dev:stop
```

**Local Git hooks:**
- Pre-commit: Hard Constraints check (no process.env, no require, no Buffer)
- Pre-push: Full typecheck + test + coverage before CI

---

## Success Narrative

By end of this plan:
1. **All 4 gaps closed:** Verifier flow, approval gates, mutation limits, PR opening all production-ready
2. **Mature engineering:** Full test coverage, hooks, ADRs, runbooks — ready for team handoff
3. **Parallel velocity:** 3 teams executing simultaneously; blockers identified upfront; no rework
4. **Validation loop:** Smoke tests catch integration issues before merge; regression tests protect existing routes
5. **Documentation debt:** FRIDGE.md, guides, runbooks ensure next team (SUP-5) isn't blocked by tribal knowledge
6. **Ready to cascade:** SUP-5 (LockDO), SUP-6 (Capability-tool layer), SUP-7–10 can begin immediately

---

**Questions to resolve before kickoff:**
1. Exact factory-cross-repo webhook endpoint and auth? (Confirm with Team C pre-req lead)
2. Rollback strategy if verifier fails — immediate or log + manual? (Defer to SUP-0.2? Add to ADR-EXEC-GAPS.md)
3. Should approval gate use Firebase Auth, GitHub OIDC, or JWT claim? (Defer to SUP-0.2 gate; use simple JWT for Phase 1)
