# Supervisor Troubleshooting Guide

**For:** Debugging supervisor runs, templates, tools, and approval gates.

---

## Symptom Index

### Run Failed or Hung

**Symptom:** POST /run returned 5xx or timed out.

1. Check supervisor Worker logs (Sentry integration)
2. Verify template exists: `docs/supervisor/plans/*.yml` → `templates.generated.ts`
3. Check ToolRegistry: is every tool used in the template registered?
4. Verify JWT_SECRET is wired in wrangler.jsonc
5. Check D1 migration status: are supervisor_runs + supervisor_steps tables created?

**Next:** If logs show "Template not found", run `npm run generate:templates` and redeploy.

---

### Mutation Limit Exceeded

**Symptom:** Response: `{ ok: false, error: "Mutation limit exceeded: 26 > 25 per run" }`

**Cause:** Template has >25 mutating steps.

**Solutions:**
1. Reduce mutation count in template (remove non-essential steps)
2. Split into two templates (supervisor will run them separately)
3. Verify side_effects are correctly labeled:
   - `none` and `read-external` don't count toward cap
   - `write-app` and `write-external` do count

**Check:**
```
grep -c 'side_effects: write' docs/supervisor/plans/my-template.yml
```

If >25, split the template.

---

### Per-App Mutation Cap Exceeded

**Symptom:** Response: `{ ok: false, error: "Mutation limit exceeded for app 'selfprime': 6 > 5 per run" }`

**Cause:** >5 mutations target the same app in one run.

**Solutions:**
1. Reduce mutations on this app (move some to different apps or different runs)
2. Split into two templates with different app targets

**Check tool names:**
```
grep 'tool:' docs/supervisor/plans/my-template.yml | head
```

App ID is first part of tool name (e.g., `selfprime` in `selfprime.auth.create-session`).

---

### Awaiting Approval (Step Blocked)

**Symptom:** Response: `{ ok: true, steps_executed: 1, receipts: [...] }` with receipt showing `awaiting_approval: 'codeowner_confirmation'`

**Expected:** Step 1 succeeded but requires CODEOWNER approval before proceeding.

**Action Required:**
1. CODEOWNER reviews the run and receipts via issue comment
2. CODEOWNER calls `/approve` endpoint:
   ```bash
   curl -X POST http://localhost:8787/approve \
     -H "Authorization: Bearer <codeowner-jwt>" \
     -d '{"run_id": "template-id-1-1716518400000", "step_index": 1}'
   ```
3. Execution resumes from step 2

**Debug:**
- If `/approve` returns 401: CODEOWNER scope is missing from JWT
- If `/approve` returns 404: run_id or step_index is wrong
- If `/approve` re-executes step 1: idempotency not yet implemented (SUP-5); deferred

---

### Verification Failed

**Symptom:** Response: `{ ok: false, reason: "Verification failed: intent mismatch" }` with status 422

**Cause:** All steps executed successfully, but verifier tool failed.

**Audit Trail Still Exists:**
- supervisor_steps table has all step receipts
- supervisor_verifications table has verifier response

**Solutions:**
1. Check supervisor_verifications.tool_response for details
2. Review what verifier was checking (acceptance_gate.verifier_query)
3. Verifier may be too strict; update verifier tool logic
4. Execution succeeded; human can decide whether to retry or rollback

**Note:** Unlike step failures, verification failures don't prevent receipt logging. Audit trail is complete.

---

### PR Creation Failed (Warning in Response)

**Symptom:** Response: `{ ok: true, ..., warning: "PR creation failed" }` but no `pr_url`

**Cause:** factory-cross-repo webhook is unreachable or returned 4xx/5xx.

**Audit Trail:** supervisor_runs.pr_open_error column in D1 has the error message.

**Solutions:**
1. Check factory-cross-repo health: `curl https://factory-cross-repo.../health`
2. Check supervisor logs for webhook response code
3. Verify FACTORY_CROSS_REPO_TOKEN is valid in wrangler.jsonc
4. Manually open PR if needed (audit trail in D1 is the source of truth)

**Non-Fatal:** This is a graceful failure. The run succeeded; PR opening is best-effort.

---

### Tool Invocation Failed

**Symptom:** Receipt: `{ result: { ok: false, error: "error message" }, ... }`

**Cause:** Tool exists, but tool.invoke() returned error.

**Debug Steps:**
1. Check tool.invoke() implementation (e.g., github.ts, sentry.ts)
2. Verify slots passed to tool are correct:
   - `slots_provided` field in receipt shows resolved values
   - Check $slots.X substitution in template
3. Check tool is using correct scope JWT
4. Verify external API (GitHub, Sentry, etc.) is reachable and credentials are valid

**Example:**
```json
{
  "step_index": 1,
  "tool_name": "github.search",
  "result": { "ok": false, "error": "401 Unauthorized" },
  "slots_provided": { "query": "is:open label:bug" }
}
```

If 401: GitHub token in tool is missing or expired.

---

### Tool Not Found

**Symptom:** Response: `{ ok: false, error: "Tool not found: github.search" }`

**Cause:** Tool is not registered in ToolRegistry.

**Solutions:**
1. Check tool is registered in src/tools/registry.ts:
   ```typescript
   registry.register(new GitHubSearchTool(), 'github.search');
   ```
2. Check template uses correct tool name (case-sensitive)
3. Rebuild and redeploy supervisor Worker

**Verify:**
```bash
grep -r "github.search" apps/supervisor/src/tools/
```

If no match, tool is not registered.

---

### Insufficient Scope (401 from Your Endpoint)

**Symptom:** Tool invocation succeeds but returns: `{ ok: false, error: "Insufficient scope" }`

**Cause:** JWT scope doesn't match endpoint requirement.

**Solutions:**
1. Verify your endpoint checks scope correctly:
   ```typescript
   const claims = await verifyJwt(token, env.JWT_SECRET);
   if (!claims.scope.includes('supervisor.mutator-selfprime.auth')) {
     return c.json({ error: 'Insufficient scope' }, 403);
   }
   ```
2. Verify supervisor is minting correct scope:
   - Read-only tools: `supervisor.readonly`
   - Mutating tools: `supervisor.mutator-{tool-name}`
   - Verifier tools: `supervisor.verifier-readonly`

**Check:**
```typescript
// In executor.ts, line 136-140
let jwtScope = 'supervisor.readonly';
if (sideEffects !== 'none') {
  jwtScope = `supervisor.mutator-${toolName}`;
}
```

If your tool is mutating, side_effects must NOT be 'none'.

---

### Template Not Generating

**Symptom:** Deployed new template to `docs/supervisor/plans/my-template.yml` but supervisor doesn't see it.

**Cause:** Build step `npm run generate:templates` didn't run.

**Solutions:**
1. Run locally:
   ```bash
   npm run generate:templates
   ```
2. Commit generated `apps/supervisor/src/planner/templates.generated.ts`
3. Redeploy supervisor Worker
4. Verify via dry_run:
   ```bash
   curl -X POST /run -d '{ "template_id": "my-template", "dry_run": true }'
   ```

If dry_run returns 404, regenerate + redeploy.

---

### Dry Run Shows Wrong Step Count

**Symptom:** Dry run returns 5 steps but template.steps array has 6.

**Cause:** acceptance_gate might be counted; it's not a step.

**Verify:**
```yaml
steps:
  - tool: ...  # step 0
  - tool: ...  # step 1
  - tool: ...  # step 2
acceptance_gate:
  verifier_query: ...  # NOT a step; runs after execution
```

Expected dry_run: 3 steps (not 4).

---

### Receipts Not Logged to D1

**Symptom:** Run completed but receipts don't appear in supervisor_steps table.

**Cause:** Verification failed (status 422). Receipts are only logged on verification success.

**Check:**
```sql
SELECT * FROM supervisor_runs WHERE id = 'run-id-here';
```

If status = 'failed_verification', receipts were never logged (by design; verifier output is in supervisor_verifications table instead).

**Workaround:** Manually insert receipts into supervisor_steps if needed, or retry without verifier.

---

### Approval endpoint returns 404

**Symptom:** CODEOWNER calls `/approve` and gets 404 with `{ error: "Run not found" }`

**Cause:** run_id is wrong or run was already resumed.

**Debug:**
1. Verify run_id from original run response
2. Check supervisor_runs table: does this run exist?
3. Check awaiting_approval status: is it still set?

**Prevention:** Copy run_id directly from run response; don't guess.

---

### Wrangler Logs Don't Show Errors

**Symptom:** `wrangler tail` shows request but no error logs.

**Cause:** Errors might be in Sentry, not console.

**Check Sentry:**
1. Navigate to Sentry dashboard (sentry.io or internal)
2. Filter by supervisor Worker
3. Recent errors will show with full stack trace

**Local Testing:**
```bash
wrangler dev  # Starts local dev server with live logs
# Make request in another terminal
curl -X POST http://localhost:8787/run ...
```

Local logs appear immediately in wrangler dev output.

---

## Support Workflow

1. **Check this guide** — 80% of issues are here
2. **Search Sentry** — Error stack trace + context
3. **Check supervisor_runs + supervisor_steps tables** — Audit trail for run status, receipts, errors
4. **Check supervisor_approvals table** — If approval gate involved, see who approved and when
5. **Check supervisor_verifications table** — If verifier involved, see verification tool response
6. **File a github issue** — Attach run_id, error message, and D1 rows

Minimal reproducible example:
```json
{
  "run_id": "template-id-1-1716518400000",
  "template_id": "my-template",
  "error": "Tool not found: selfprime.profile.read",
  "steps_attempted": 0
}
```

---

## References

- **CAPABILITY_DECLARATION.md:** What supervisor can do (caps, gates, verifier, PR opening)
- **APP_INTEGRATION.md:** How to register tools + build templates
- **ADR-EXEC-GAPS.md:** Design decisions + failure modes
- **FRIDGE.md:** Standing orders (approval requirements)
- **Sentry dashboard:** Error logs and stack traces

