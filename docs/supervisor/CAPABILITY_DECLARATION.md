# Supervisor Capability Declaration — Phase 2 (SUP-4 EXEC Leg)

**Status:** SHIPPED 2026-05-24  
**Coverage:** 4 execution gaps closed. 5 new capabilities ratified.

---

## What the Supervisor Can Now Do

### 1. Enforce Write-Amplification Caps ✅
- **Hard limit:** ≤25 mutating steps per run
- **Per-app limit:** ≤5 mutations per app per run
- **Enforcement:** Pre-invoke check in executePlan(); fails fast without side effects
- **Audit:** Receipt logs the step index and cap violation reason
- **Rationale:** Prevents runaway feedback loops and protects against cascading mutations

### 2. Gate Mutations on CODEOWNER Approval ✅
- **Mechanism:** `requires_codeowner_approval: true` on step definition
- **Behavior:** Step executes; if successful, sets `awaiting_approval='codeowner_confirmation'` and halts chain
- **Resume:** `/approve` endpoint requires CODEOWNER JWT scope; resumes from next step
- **Audit:** supervisor_approvals table records (run_id, step_index, codeowner, timestamp, jwt_scope)
- **Scope isolation:** CODEOWNER token has explicit scope `supervisor.codeowner-approval`

### 3. Verify Intent Post-Execution ✅
- **Mechanism:** `acceptance_gate: { verifier_query, auto_approve? }` on template
- **Scope:** Verifier tool receives `supervisor.verifier-readonly` JWT; cannot mutate
- **Behavior:** Runs after all steps succeed; if verifier fails, run marked `failed_verification` (no receipt logging)
- **Audit:** supervisor_verifications table records verifier tool response + timestamp
- **Rationale:** Prevents mutations that don't match user intent; readonly scope prevents verifier from polluting audit trail

### 4. Open Audit PRs Post-Verification ✅
- **Mechanism:** Automatic call to factory-cross-repo POST /api/supervisor/create-pr after verification passes
- **Affected Repos:** Extracted from step receipts; grouped by app_id prefix in tool names
- **Failure Mode:** 4xx/5xx failures are logged as warnings (non-blocking); run succeeds
- **Audit:** supervisor_runs.pr_url (nullable), supervisor_runs.pr_opened_at, supervisor_runs.pr_open_error
- **Rationale:** Async safety net; humans can manually open PR if factory-cross-repo is down (audit trail is in D1)

### 5. Parameterize Plans with User Slots ✅
- **Mechanism:** `$slots.X` references in step slot values
- **Scope:** Phase 1; cross-step references (`$s<N>.path`) deferred to SUP-3.6
- **Audit:** slots_provided field in receipt shows resolved values
- **Rationale:** Allows single template to serve multiple intents (e.g., "migrate org" with user-provided org_id)

---

## What Still Requires Human Approval

Per FRIDGE.md Rule 4, these actions are NOT auto-approved even on Green tier:
- Any `/admin` endpoint mutation
- Stripe product/price/webhook changes
- Cloudflare Workers/KV/R2/WAF mutations
- Neon branch/database/user operations
- GitHub branch protection rule changes

Templates attempting these must have `requires_codeowner_approval: true` on the mutating step.

---

## Scopes & Token Classes

| Scope | Mutable? | Use Case |
|-------|----------|----------|
| `supervisor.readonly` | ❌ Read-only | Read templates, list issues, query APIs |
| `supervisor.mutator-{tool}` | ✅ Specific tool | Invoke a specific mutating tool (e.g., `supervisor.mutator-github.create-pr`) |
| `supervisor.verifier-readonly` | ❌ Read-only | Verify intent post-execution (cannot see mutations in progress) |
| `supervisor.codeowner-approval` | ✅ Approval only | Resume execution from /approve endpoint (human-in-the-loop) |

---

## Testing & Validation

### Unit Coverage
- executor.ts: 89.58% statements, 73.97% branch (mutation caps, approval gates)
- verifier.ts: 100% statements, 83.33% branch
- pr-opening.ts: 96.15% statements, 82.14% branch

### Integration Tests
- 30 end-to-end tests covering all 5 scenarios:
  1. Baseline (read-only, no gates)
  2. Amplification cap exceeded (fails at step 26)
  3. Approval gate blocks (step 2 awaiting_approval)
  4. Verifier fails (execution succeeds, verification fails)
  5. Happy path (2 mutations, approval, verifier passes, PR opens)

### Scenarios Validated (Phase 3)
- ✅ Rebase onto main: no conflicts
- ✅ Full test suite: 115/115 tests passing
- ✅ Coverage: 87.26% statements, 75.93% branch (exceeds 85% requirement)
- ✅ Regressions: none

---

## Known Limitations & Deferrals

### Phase 2 (Done)
- Mutation caps: global ≤25, per-app ≤5 ✅
- Approval gates: explicit /approve endpoint ✅
- Verifier step: post-execution intent check ✅
- PR opening: async safety net ✅

### Deferred to SUP-0.2 Gate (Next Blocker)
1. **Rollback on verification failure:** Currently NO undo; human reviews receipts. Deferred because undo is complex; humans should decide.
2. **Approval idempotency:** No guard against double-click approval (approval replays step twice). Deferred to SUP-5 (approval gate refactor).
3. **Verifier timeout:** Inherits fetch default (~30 sec). Deferred if >10 min timeout needed.
4. **Per-app cap semantics:** Confirmed both caps enforced (fail if EITHER exceeded). Correct per ARCHITECTURE.md §5.1.

### Deferred to Phase 3+ (Future)
- Cross-step references (`$s1.field`, `$s2.nested.field`) — SUP-3.6
- LockDO per-app vs. global scope clarification — SUP-5
- Auto-retry PR opening on 5xx — Phase 4 enhancement
- Granular approval gates (tier-aware, not all-or-nothing) — SUP-5 candidate

---

## Integration Checklist for New Templates

Before deploying a new template:
- [ ] All `requires_codeowner_approval: true` steps match FRIDGE.md Rule 4 (irreversible actions)
- [ ] `acceptance_gate.verifier_query` points to a real, tested verifier tool
- [ ] All tool names follow `{app-id}.{capability}.{method}` format for app_id extraction
- [ ] Side effects are correctly labeled (none/read-external/write-app/write-external)
- [ ] Test fixtures cover at least one success + one failure path
- [ ] Dry-run returns correct step count without side effects

---

## References

- **ADR-EXEC-GAPS.md:** Design decisions + failure modes for all 4 gaps
- **EXEC-INSERTION-POINTS.md:** Team assignments + conflict matrix
- **FACTORY-CROSS-REPO-INTEGRATION.md:** PR opening endpoint spec + error handling
- **executor.ts:** Mutation cap + approval gate implementation
- **verifier.ts:** Verifier step implementation
- **pr-opening.ts:** PR opening implementation
- **FRIDGE.md:** Standing orders (still valid; no changes for Phase 2)

