# handleRun() Execution Flow with 4 Insertion Points

## Current Flow (lines 366–454)

```
┌─────────────────────────────────────────────────────────────────┐
│ POST /run { template_id, version, description, source, dry_run }│
└────────────────────────┬────────────────────────────────────────┘
                         │
                    (line 367-382)
                         │
                    Parse request
                         │
                    Record "attempted"
                         │
                    ┌────v────────────────┐
                    │ dry_run = true?      │ YES → Return stats (line 387-396)
                    └────┬────────────────┘
                         │ NO
                    ┌────v────────────────┐
                    │ Load & find template │
                    │ (line 398-406)       │
                    └────┬────────────────┘
                         │
                    ┌────v────────────────────┐
                    │ Parameterize template   │
                    │ (line 409)              │
                    └────┬────────────────────┘
                         │
            ┌────────────┴─────────────────────┐
            │ EXECUTION LAYER (executor.ts)    │
            │                                   │
            │ ┌───────────────────────────┐    │
            │ │ Pre-flight checks:        │    │
            │ │ • Mutation cap: ≤25/run   │    │  ← INSERTION POINT 1
            │ │ • Per-app cap: ≤5/app     │    │     (Team A: executor.ts)
            │ └───────────────────────────┘    │
            │            ↓                      │
            │ ┌───────────────────────────┐    │
            │ │ Execute each step:        │    │
            │ │ • Resolve slots           │    │
            │ │ • Mint JWT scope          │    │
            │ │ • Invoke tool             │    │
            │ │ • Capture receipt         │    │
            │ │ • [CHECK approval gate]   │    │  ← INSERTION POINT 2
            │ │   if requires_codeowner_  │    │     (Team A: executor.ts)
            │ │   approval → STOP chain   │    │
            │ └───────────────────────────┘    │
            │            ↓                      │
            │ return receipts[]                │
            └────────────┬─────────────────────┘
                         │
                    ┌────v─────────────────────┐
                    │ Check: acceptance_gate?  │
                    │ (line 412 + POST-EXEC)   │
                    │                          │  ← INSERTION POINT 3
                    │ If set:                  │     (Team B: new verifier.ts
                    │ • Mint verifier-readonly │      + supervisor.do.ts)
                    │   JWT                    │
                    │ • Invoke verifier tool   │
                    │ • If fails → return error│
                    │   without logging        │
                    └────┬──────────────────────┘
                         │ verification passed
                    ┌────v─────────────────────┐
                    │ Check: has mutations?    │
                    │ (line 412 + POST-VERIFY) │
                    │                          │  ← INSERTION POINT 4
                    │ If YES:                  │     (Team C: supervisor.do.ts +
                    │ • Open PR on factory-    │      factory-cross-repo)
                    │   cross-repo             │
                    │ • Log PR URL (non-       │
                    │   blocking failure)      │
                    └────┬──────────────────────┘
                         │
                    ┌────v──────────────────┐
                    │ Log receipts to D1    │
                    │ (line 414-437)        │
                    └────┬───────────────────┘
                         │
                    ┌────v──────────────────┐
                    │ Record final status    │
                    │ "passed" or "failed"   │
                    │ (line 440-443)         │
                    └────┬───────────────────┘
                         │
                    ┌────v──────────────────────────┐
                    │ Return response with receipts │
                    │ (line 445-453)                │
                    └───────────────────────────────┘
```

## Insertion Point Details

| # | Feature | Location | Code Owner | Data Flow |
|----|---------|----------|-----------|-----------|
| 1 | **Mutation Cap** | executor.ts `executePlan()` | Team A | Pre-invoke check; fail fast if ≤25 cap exceeded |
| 2 | **Approval Gate** | executor.ts `executeStep()` | Team A | Post-invoke check; set `awaiting_approval` if flag true; stop chain |
| 3 | **Verifier Step** | supervisor.do.ts `handleRun()` + new `verifier.ts` | Team B | Post-execution; await `runVerifier()` result; fail if not ok |
| 4 | **PR Opening** | supervisor.do.ts `handleRun()` + factory-cross-repo call | Team C | Post-verification; call webhook; log PR URL (graceful failure) |

## Team A: Mutation Cap + Approval Gate (executor.ts changes)

**executeStep() changes:**
```typescript
// After tool.invoke() succeeds:
if (step.requires_codeowner_approval && receipt.result.ok) {
  receipt.awaiting_approval = 'codeowner_confirmation';
  return receipt; // STOP CHAIN — don't proceed to next step
}
```

**executePlan() changes:**
```typescript
// Before execution loop:
let mutatingCount = 0;
let perAppCount: Record<string, number> = {};

// Inside loop, before tool.invoke():
if (step.side_effects !== 'none') {
  mutatingCount++;
  if (mutatingCount > 25) {
    return { ok: false, error: 'Mutation limit exceeded', step_index: i };
  }
  // Per-app count (via tool_name → app_id mapping from registry)
}
```

## Team B: Verifier Step (new verifier.ts + supervisor.do.ts changes)

**New verifier.ts:**
```typescript
export async function runVerifier(
  acceptanceGate: { verifier_query: string; auto_approve?: boolean },
  receipts: StepReceipt[],
  tools: ToolRegistry,
  env: Env,
): Promise<{ ok: boolean; reason?: string }> {
  if (acceptanceGate.auto_approve) {
    return { ok: true };
  }
  // Invoke verifier tool with readonly JWT
}
```

**supervisor.do.ts handleRun() changes (after executePlan):**
```typescript
if (template.acceptance_gate) {
  const verifyResult = await runVerifier(template.acceptance_gate, receipts, this.tools, this.env);
  if (!verifyResult.ok) {
    await recordRun(this.env.MEMORY, templateId, version, 'failed_verification');
    return Response.json({ ok: false, reason: verifyResult.reason }, { status: 422 });
  }
}
```

## Team C: PR Opening (supervisor.do.ts + factory-cross-repo)

**supervisor.do.ts handleRun() changes (after verification, before receipt logging):**
```typescript
const hasMutations = receipts.some((r) => r.side_effects !== 'none');
if (hasMutations) {
  const prResult = await openSupervisorPR(receipts, templateId, description, this.env);
  if (prResult.ok) {
    // Log prResult.pr_url to supervisor_runs table
  } else {
    // Log warning; don't fail run (PR opening is async safety)
  }
}
```

## No Conflicts

- **Team A** edits only `executor.ts` (no supervisor.do.ts changes)
- **Team B** edits `supervisor.do.ts` lines ~412–420 (post-execution check)
- **Team C** edits `supervisor.do.ts` lines ~420–430 (post-verification check)
- **Team D** creates new test file (no conflicts)

Teams B and C have adjacent but non-overlapping diffs in supervisor.do.ts; merge lead handles sequential application.
