# ADR: SUP-4 EXEC Gaps — Design Decisions

**Status:** Accepted (ratified in ARCHITECTURE.md v2.1)  
**Date:** 2026-05-24  
**Context:** SUP-4 EXEC leg requires closing 4 gaps identified in initial implementation: verifier step, approval gates, write-amplification cap, PR opening.  
**Decision Owners:** Factory architects + Team A/B/C leads

---

## Decision 1: Verifier Step with Supervisor-Verifier-Readonly Scope

**Option A** (chosen): Mint `supervisor.verifier-readonly` JWT; verifier has read-only access to verify intent.  
**Option B** (rejected): Verifier uses same scope as original tool call (risky: verifier could mutate).  
**Option C** (rejected): Auto-approve all verifications (loses safety gate).

### Why Option A

**Rationale:**
- **Audit trail:** Verifier cannot pollute side effects. Every mutation is either executed or rejected; no hidden verifier mutations.
- **Scope isolation:** Verifier token can only query (read-only). Prevents verifier tool from becoming a back-channel mutator.
- **ARCHITECTURE.md ratified:** §5.7 explicitly defines `supervisor.verifier-readonly` as a distinct token class.

### Implementation Consequence

- Verifier tool receives `Authorization: Bearer <supervisor.verifier-readonly-jwt>`
- Verifier tool MUST be read-only; app /admin endpoint enforces via @latimer-woods-tech/admin verifyJwt() scope check
- If verifier needs to look at external state (e.g., Sentry issue status, GitHub branch), it calls those APIs directly with its own credentials, not via scoped JWT

### Failure Mode

If verifier tool is implemented as mutating (e.g., auto-resolves Sentry issue):
- Execute succeeds, receipt logged
- Verifier runs, mutates Sentry issue
- Mutation is NOT in supervisor_steps audit log (because verifier is read-only)
- **Audit trail is incomplete**

**Mitigation:** Code review + integration tests. Verify via curl that verifier scope is actually read-only on app-side.

---

## Decision 2: Approval Gates Stop Execution Chain, Require /approve Endpoint

**Option A** (chosen): `requires_codeowner_approval: true` stops execution; /approve endpoint resumes.  
**Option B** (rejected): Collect approval as async webhook callback (complex; no synchronous resume).  
**Option C** (rejected): Auto-proceed with approval after N hours (loses human-in-the-loop).

### Why Option A

**Rationale:**
- **Fail-safe:** Mutating step with approval requirement DOES NOT auto-proceed. Human must explicitly approve.
- **Simple state machine:** StepReceipt.awaiting_approval = 'codeowner_confirmation' signals the stop. /approve endpoint resumes by replaying executor.resumeFromStep(runId, stepIndex).
- **Synchronous feedback:** CODEOWNER approves, execution resumes immediately (seconds), not hours later.
- **Audit trail:** Approval recorded in supervisor_runs.approvals table with CODEOWNER, timestamp, JWT scope.

### Implementation Consequence

- executeStep() must check step.requires_codeowner_approval AFTER tool succeeds
- If true: set awaiting_approval, return receipt (don't proceed to next step)
- executePlan() loop checks awaiting_approval and breaks if set
- Supervisor must have /approve POST endpoint that:
  1. Loads run by run_id
  2. Checks current awaiting_approval status
  3. Verifies CODEOWNER via JWT (supervisor.codeowner-approval scope)
  4. Resumes executePlan() from next step
  5. Logs approval + continuation to supervisor_runs.approvals table

### Failure Mode

If /approve endpoint is not guarded by CODEOWNER scope:
- Anyone can POST /approve?run_id=...&step=2
- Mutating step bypasses CODEOWNER requirement
- **Audit trail still records who approved, but enforcement is weak**

**Mitigation:** @latimer-woods-tech/admin verifyJwt() on /approve endpoint must check iss='supervisor' AND scope includes 'codeowner-approval'. Tests verify this.

---

## Decision 3: Write-Amplification Cap ≤25 Mutations/Run, ≤5/App

**Option A** (chosen): Hard cap at 25 mutations/run, 5/app. Enforced in executor pre-invoke.  
**Option B** (rejected): Soft warning at 15 mutations; continue; alert human post-run.  
**Option C** (rejected): No cap; rely on manual run plan review to prevent runaway.

### Why Option A

**Rationale:**
- **Conservative bounds:** 25 mutations/run is 5× what a typical automation does. 5/app prevents single app from being over-mutated in one run.
- **Fail-fast:** Cap exceeded → STOP execution immediately, before tool invokes. No side effects after cap breach.
- **Prevents feedback loops:** If supervisor mutates an app, and app webhook files a new issue, and supervisor picks it up and mutates again — cap prevents infinite loop.
- **Production calibration:** Once deployed, observe actual run sizes. If 95% of runs are <5 mutations, cap is correct. If >5%, revisit in SUP-0.2 gate.

### Rationale Source

ARCHITECTURE.md §5.1 step 9: *"amplification cap: ≤25 mutating calls/run, ≤5 per app"*. This was ratified by Adrian during architecture review (v2.1 changelog).

### Implementation Consequence

- executePlan() tracks mutatingCount and perAppCount (via tool_name → app_id mapping from ToolRegistry)
- Before tool.invoke(), check: if mutatingCount > 25 OR perAppCount[appId] > 5, return error receipt and break loop
- Error receipt includes: `{ ok: false, error: "Mutation limit exceeded: 26 > 25 per run", step_index: i }`
- Run response: `{ ok: false, steps_executed: 25, error: "Mutation limit exceeded" }`

### Failure Mode

If cap is enforced but mapping from tool_name → app_id is wrong:
- E.g., tool='github.create-pr' maps to app_id='selfprime', but actually affects 'capricast'
- Supervisor thinks it has budget for capricast, but it doesn't
- **Budget tracking is incorrect; runaway mutations possible on unmapped apps**

**Mitigation:** ToolRegistry pre-commit validation. Every tool must declare its app_id. Tests mock app_id on fixture tools.

---

## Decision 4: PR Opening Post-Verification, Graceful Fallback on 5xx

**Option A** (chosen): After verification passes, call factory-cross-repo webhook. If 5xx: log warning, continue (PR is best-effort).  
**Option B** (rejected): PR opening is critical; fail the run if it doesn't open.  
**Option C** (rejected): No PR opening in Phase 1; add in Phase 2 (defer safety net).

### Why Option A

**Rationale:**
- **Audit trail is primary:** Receipts in supervisor_steps table are the source of truth. PR is a human-friendly view.
- **Safety net, not blocker:** If factory-cross-repo is temporarily down, supervisor run should not fail. Humans can manually open the PR later if needed.
- **Graceful degradation:** Network is unreliable. 5xx is transient. Supervisor runs are long-lived (hours). It's OK if PR opens 5 minutes late or not at all (human fallback).
- **Async, not blocking:** PR creation can be retried independently; doesn't affect run success.

### Implementation Consequence

- handleRun() checks: if any receipts have side_effects != 'none', call factory-cross-repo webhook
- Webhook call: POST to factory-cross-repo-worker endpoint with run_id, receipts, affected_repos
- On success (2xx): Log pr_url to supervisor_runs.pr_url column
- On failure (4xx/5xx): Log warning to Sentry + supervisor_runs.pr_open_error; continue
- Run response: `{ ok: true, pr_url?: "...", warning?: "PR creation failed" }`

### Failure Mode

If factory-cross-repo is down during a critical run:
- Supervisor succeeds, receipts are logged, PR is NOT opened
- Human sees run success but no PR in GitHub
- **Audit trail is in D1, not visible in GitHub. Human confusion.**

**Mitigation:** Runbook in TROUBLESHOOTING.md: "If run succeeded but no PR, check supervisor_runs.pr_open_error column in D1. If present, PR creation failed; manually open via factory-cross-repo."

---

## Decision 5: Approval Gate vs. Automatic Approval

**Option A** (chosen): Explicit `/approve` endpoint requires CODEOWNER JWT; synchronous resume.  
**Option B** (rejected): Automatic approval if approval_author is template author (trust-based).  
**Option C** (rejected): Async webhook callback; approval is event-driven (complex; eventual consistency).

### Why Option A

**Rationale:**
- **No implicit trust:** Template author is not CODEOWNER. Template can be edited by anyone (PR). Approval must come from an actual CODEOWNER.
- **Synchronous feedback:** Human approves, run resumes in seconds. No waiting for webhook delivery.
- **Clear audit trail:** supervisor_runs.approvals table records (run_id, step_index, codeowner, timestamp, jwt_scope).

---

## Decision 6: D1 Schema for Approvals & PR Open Errors

**New tables:**
- `supervisor_runs.pr_url` (nullable TEXT) — PR URL if opened
- `supervisor_runs.pr_opened_at` (nullable BIGINT) — Timestamp of PR open attempt
- `supervisor_runs.pr_open_error` (nullable TEXT) — Error message if PR opening failed
- New table `supervisor_approvals`:
  ```sql
  CREATE TABLE supervisor_approvals (
    id TEXT PRIMARY KEY,
    run_id TEXT NOT NULL,
    step_index INT NOT NULL,
    codeowner TEXT NOT NULL,
    approved_at BIGINT NOT NULL,
    jwt_scope TEXT NOT NULL,
    FOREIGN KEY (run_id) REFERENCES supervisor_runs(id)
  );
  ```

**Rationale:**
- Audit trail for approvals is critical; requires separate table
- PR metadata is optional (PR may not open); added to supervisor_runs as nullable columns
- Index on (run_id, step_index) for fast approval lookup during resume

---

## Decision 7: Phase 1 vs. Phase 2 — What's Deferred

### Phase 1 (Now) ✅
- Schema audit + fields added ✅
- Insertion points mapped ✅
- Executor baseline assessed ✅
- factory-cross-repo integration spec ✅
- Test fixtures created ✅
- ADR written ✅

### Phase 2 (Next, via 3 teams)
- Implement mutation cap + approval gate (Team A)
- Implement verifier step (Team B)
- Implement PR opening (Team C)
- Integration tests (Team D)

### Phase 3+ (Future)
- Rollback strategy if verifier fails (SUP-0.2 gate; currently NOOP)
- Idempotency key on /approve endpoint to prevent double-approval (SUP-5 candidate)
- Auto-retry PR opening if factory-cross-repo is 5xx (Phase 4 enhancement)
- Granular approval gates (e.g., mutation tier-aware approval; currently all-or-nothing)

---

## Questions for SUP-0.2 Gate

1. **Rollback on verification failure:** Should supervisor attempt to undo mutations if verifier fails? Currently: NO (just fail the run). Rationale: Undo is complex; human should review receipts and decide.

2. **Approval idempotency:** If CODEOWNER approves twice (double-click bug), does step 2 resume twice? Currently: NO guard (need idempotency key). Rationale: Deferred to SUP-5 (approval gate refactor).

3. **Verifier timeout:** If verifier takes >10 min, does supervisor timeout? Currently: NO timeout (inherits fetch default ~30 sec). Rationale: Acceptable for Phase 1; add timeout in SUP-0.2 gate if needed.

4. **Per-app cap semantics:** If run has 3 steps in selfprime, 2 in capricast, does step 3 in selfprime count toward selfprime's limit or run's limit? Currently: Both (fail if EITHER cap exceeded). Rationale: Correct per ARCHITECTURE.md §5.1 step 9.

---

## Acceptance Criteria

This ADR is accepted when:
- [ ] Architect approval (Adrian + Team Lead)
- [ ] Phase 1 pre-reqs all complete (1a–1f)
- [ ] Phase 2 teams report implementation complete with ≥90% unit test coverage
- [ ] Phase 3 smoke tests pass all 5 scenarios
- [ ] No new gaps discovered during implementation (if gaps found, file SUP-4-GAPS issue + defer to next phase)

---

## References

- **ARCHITECTURE.md v2.1:** §5.1 (execution loop steps 9–12), §5.7 (verifier token), §5.8 (LockDO), §5.9 (template stats)
- **FRIDGE.md:** Rules 4 (CODEOWNER requirement), 8 (irreversible actions require approval)
- **Hard Constraints (CLAUDE.md):** No `process.env`, no `Buffer`, error handling on fetch
- **Test Plan:** `docs/supervisor/SUP-4-EXEC-PLAN.md` Phases 2–3
