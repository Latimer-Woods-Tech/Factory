# Supervisor Integration Guide for Apps

**For:** App developers integrating supervisor templates or verifier tools.

---

## What You Need to Know

The supervisor executes **templates** (defined in `docs/supervisor/plans/*.yml`) against **tools** (registered in ToolRegistry). When a template step runs, the supervisor:

1. Resolves slot values (parameterization)
2. Mints a scoped JWT (based on side_effects)
3. Invokes your tool
4. Captures the receipt (audit log)
5. Checks gates (approval, verifier, caps)

---

## Registering a Tool

Your tool MUST be registered in [ToolRegistry](../apps/supervisor/src/tools/registry.ts) with:

```typescript
export interface Tool {
  name: string;                                      // e.g., "selfprime.auth.create-session"
  description: string;
  side_effects: 'none' | 'read-external' | 'write-app' | 'write-external';
  required_scope: string;                           // e.g., "supervisor.mutator-selfprime.auth.create-session"
  invoke: (slots: Record<string, unknown>) => Promise<{ ok: boolean; result?: unknown; error?: string }>;
}
```

**Naming convention:** `{app-id}.{capability}.{method}`
- Example: `selfprime.profile.update` → app_id=`selfprime`
- The app_id is extracted for per-app mutation cap tracking

**Side effects:**
- `none` — Readonly (observability, queries)
- `read-external` — Reads from external APIs (GitHub search, Sentry list)
- `write-app` — Mutates your app (database, memory)
- `write-external` — Mutates external systems (GitHub branch, Stripe charge)

---

## What JWTs Your Tool Will Receive

### For Read-Only Tools
```
Authorization: Bearer <supervisor.readonly-jwt>
```
- Scope: `supervisor.readonly`
- Use for: observability, list operations, queries
- Expires: 5 min

### For Mutating Tools
```
Authorization: Bearer <supervisor.mutator-{tool-name}-jwt>
```
- Scope: `supervisor.mutator-selfprime.auth.create-session` (example)
- Use for: database writes, API calls that mutate your app
- Expires: 5 min

### For Verifier Tools
```
Authorization: Bearer <supervisor.verifier-readonly-jwt>
```
- Scope: `supervisor.verifier-readonly`
- Use for: reading results, checking intent matches execution
- **Cannot mutate** (readonly scope enforced on app side via /admin endpoint)
- Expires: 5 min

---

## Verifying the JWT in Your Handler

Use the `@latimer-woods-tech/admin` package (already in your dependencies):

```typescript
import { verifyJwt } from '@latimer-woods-tech/admin';

export const handler = withAuth(async (c) => {
  const token = c.req.header('Authorization')?.replace('Bearer ', '');
  if (!token) {
    return c.json({ error: 'Missing token' }, 401);
  }

  const claims = await verifyJwt(token, c.env.JWT_SECRET);
  
  // Check scope matches this endpoint
  if (!claims.scope.includes('supervisor.mutator-selfprime.auth')) {
    return c.json({ error: 'Insufficient scope' }, 403);
  }

  // Proceed with mutation
  // ...
});
```

For **readonly** endpoints, check `supervisor.readonly`:
```typescript
if (!claims.scope.includes('supervisor.readonly')) {
  return c.json({ error: 'Insufficient scope' }, 403);
}
```

For **verifier** endpoints, check `supervisor.verifier-readonly`:
```typescript
if (!claims.scope.includes('supervisor.verifier-readonly')) {
  return c.json({ error: 'Insufficient scope' }, 403);
}
```

---

## Building a Template

Templates live in `docs/supervisor/plans/*.yml`. Example:

```yaml
id: my-template
tier: yellow
description: "Migrate org to new schema"
steps:
  - tool: selfprime.schema.migrate
    slots:
      org_id: $slots.org_id
      target_version: "v2"
    side_effects: write-app
    requires_codeowner_approval: true
  - tool: selfprime.audit.log
    slots:
      event: "schema_migration_complete"
      org_id: $slots.org_id
    side_effects: write-app
acceptance_gate:
  verifier_query: selfprime.schema.verify-migration
  auto_approve: false
```

**Required fields:**
- `id` — Unique template identifier
- `tier` — green (safe, auto-approve) / yellow (manual approval) / red (requires explicit plan review)
- `description` — Human-readable intent
- `steps` — Array of tool invocations

**Optional fields:**
- `trigger_keywords` — Issue title/body keywords that match this template
- `triggers` — Advanced matching (labels, patterns)
- `pattern_check` — Architecture pattern numbers to cross-reference
- `acceptance_gate` — Verifier tool + auto_approve flag

---

## Building a Verifier Tool

A verifier tool runs **after** all steps succeed. It receives the execution receipts and verifies intent matched execution.

```typescript
export interface Tool {
  name: 'selfprime.schema.verify-migration';
  description: 'Verify schema migration completed successfully';
  side_effects: 'none';
  required_scope: 'supervisor.verifier-readonly';
  invoke: async (slots) => {
    // Slots contain execution results from previous steps
    // e.g., slots = { receipts: [...], run_id: "..." }
    
    // Check: are all schema migrations actually applied?
    const currentVersion = await db.query('SELECT version FROM schema_version');
    if (currentVersion === 'v2') {
      return { ok: true };
    } else {
      return { ok: false, error: 'Schema version is still ' + currentVersion };
    }
  };
}
```

**Important:** Verifier tools **cannot mutate**. They only read to verify intent. If your verifier needs to undo mutations on failure, that's deferred to SUP-0.2 (currently, supervisor just fails the run and humans review receipts).

---

## Testing Your Tool

### Unit Test
```typescript
import { createMockToolRegistry } from '@supervisor/fixtures/templates';

describe('my tool', () => {
  it('should execute', async () => {
    const registry = createMockToolRegistry();
    const tool = registry.get('selfprime.schema.migrate');
    const result = await tool.invoke({ org_id: 'test', target_version: 'v2' });
    expect(result.ok).toBe(true);
  });
});
```

### Integration Test
Run supervisor with your template via `/run` endpoint:
```bash
curl -X POST http://localhost:8787/run \
  -H "Content-Type: application/json" \
  -d '{
    "template_id": "my-template",
    "description": "Test migration",
    "dry_run": false,
    "slots": { "org_id": "test-org" }
  }'
```

Expected response:
```json
{
  "ok": true,
  "run_id": "my-template-1-1716518400000",
  "steps_executed": 2,
  "receipts": [
    {
      "step_index": 0,
      "tool_name": "selfprime.schema.migrate",
      "result": { "ok": true, "result": {...} },
      "awaiting_approval": null
    },
    {
      "step_index": 1,
      "tool_name": "selfprime.audit.log",
      "result": { "ok": true }
    }
  ],
  "pr_url": "https://github.com/Latimer-Woods-Tech/HumanDesign/pull/123"
}
```

---

## Common Patterns

### Read + Mutate + Verify Pattern
```yaml
steps:
  - tool: selfprime.profile.read          # step 0 - read
    side_effects: read-external
  - tool: selfprime.profile.update        # step 1 - mutate
    side_effects: write-app
    requires_codeowner_approval: true
acceptance_gate:
  verifier_query: selfprime.profile.verify-update
```

Flow: read → (awaits approval) → mutate → verify → PR opens

### Approval Gate on Critical Mutation
```yaml
steps:
  - tool: stripe.price.update             # Stripe mutations always require approval
    side_effects: write-external
    requires_codeowner_approval: true
```

Per FRIDGE.md Rule 8: Irreversible actions require explicit approval.

### Readonly Read-Only Template (No Approval Needed)
```yaml
tier: green                                # Auto-approve on green tier
steps:
  - tool: github.search
    side_effects: read-external
  - tool: sentry.list-issues
    side_effects: read-external
```

No acceptance_gate needed; no mutations; auto-approved.

---

## Troubleshooting

### "Tool not found: selfprime.profile.update"
- Check ToolRegistry; tool is not registered
- Verify `id` in template matches exact tool name
- Check capitalization

### "Mutation limit exceeded: 26 > 25 per run"
- Template has >25 mutating steps
- Split into multiple templates or use fewer mutations per run
- Per-app cap: if 6+ mutations target same app, will also fail

### "Insufficient scope" 401 from your endpoint
- JWT is valid but scope doesn't match endpoint requirement
- Check: are you minting the right scope?
  - Read-only endpoint: expects `supervisor.readonly`
  - Mutating endpoint: expects `supervisor.mutator-{app}.{capability}`
  - Verifier endpoint: expects `supervisor.verifier-readonly`
- Use `verifyJwt()` + scope check in your handler

### Verifier fails: "Verification failed: intent mismatch"
- Execution succeeded but intent verification failed
- Run marked `failed_verification`; receipts are logged (audit trail exists)
- Human reviews supervisor_steps table to debug

### "PR creation failed" warning in run response
- factory-cross-repo webhook is unreachable or returned 5xx
- This is non-fatal; run succeeded but PR wasn't opened
- Check supervisor_runs.pr_open_error column in D1 for details
- Manually open PR if needed; audit trail is in supervisor_steps

---

## References

- **FRIDGE.md:** Standing orders (Rule 4: CODEOWNER approval, Rule 8: irreversible actions)
- **CAPABILITY_DECLARATION.md:** What supervisor can do now
- **ADR-EXEC-GAPS.md:** Design rationale for all 4 gaps
- **executor.ts:** Mutation cap + approval gate logic
- **verifier.ts:** Verifier invocation logic
- **@latimer-woods-tech/admin:** JWT verification package

