# Factory-Cross-Repo Integration Spec

## Context
- **factory-cross-repo** is a GitHub App (App ID 3560471)
- **Supervisor calls it** at step 12 (OPEN) to open audit PRs after successful execution + verification
- **Worker location:** Separate repo (not in Factory monorepo)
- **Auth:** Must be confirmed with Team C lead

## Expected Endpoint (Provisional)

Based on ARCHITECTURE.md §5.1 step 12 and supervisor pattern:

```
POST /api/supervisor/create-pr

Headers:
  - Authorization: Bearer <JWT|token> (to be confirmed)
  - Content-Type: application/json

Request Body:
{
  "template_id": "string",           // e.g., "stripe-funnel-debug"
  "run_id": "string",                // e.g., "stripe-funnel-debug-1-1716518400000"
  "description": "string",           // Context from issue (≤200 chars)
  "affected_repos": [                // Map of app_id → repo
    {
      "app_id": "string",            // e.g., "selfprime", "capricast"
      "owner": "string",             // e.g., "Latimer-Woods-Tech"
      "repo": "string"               // e.g., "HumanDesign", "capricast"
    }
  ],
  "receipts": [                      // Full step receipts from execution
    {
      "step_index": 0,
      "tool_name": "string",
      "side_effects": "string",
      "slots_provided": {},
      "result": { "ok": boolean, "result?": any, "error?": string },
      "jwt_scope": "string",
      "execution_ms": number,
      "executed_at": number
    }
  ]
}

Response (Success 201):
{
  "ok": true,
  "pr_url": "https://github.com/Latimer-Woods-Tech/HumanDesign/pull/123",
  "pr_number": 123
}

Response (Failure 4xx/5xx):
{
  "ok": false,
  "error": "string"
}
```

## Integration Points in supervisor.do.ts

**Post-verification, before receipt logging (after executeStep completion + verifier pass):**

```typescript
// If run has any mutating steps:
if (receipts.some(r => r.side_effects !== 'none')) {
  const prResult = await fetch('https://factory-cross-repo-worker.../api/supervisor/create-pr', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.FACTORY_CROSS_REPO_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      template_id: templateId,
      run_id: runId,
      description,
      affected_repos: extractAffectedRepos(receipts), // Group by app_id from tool_name
      receipts,
    }),
  });
  
  if (prResult.ok) {
    const prData = await prResult.json();
    // Log prData.pr_url to supervisor_runs.pr_url column
  } else {
    // Log warning; don't fail run (PR opening is async safety net)
    console.warn('PR creation failed:', await prResult.text());
  }
}
```

## Authorization & Secrets

- **Secret name:** `FACTORY_CROSS_REPO_TOKEN` (or equivalent)
- **Type:** Bearer token OR signed JWT
- **Rotation:** Per standard secret rotation protocol (docs/runbooks/secret-rotation.md)
- **To be confirmed by Team C lead**

## Graceful Degradation

- If factory-cross-repo is unreachable (5xx): Log warning, continue (PR opening is best-effort)
- If factory-cross-repo rejects payload (4xx): Log error, continue
- PR URL is optional in run response; run success doesn't depend on PR

## Error Scenarios

| Scenario | Handling |
|----------|----------|
| factory-cross-repo returns 5xx | Warn, don't fail run |
| factory-cross-repo returns 4xx (bad payload) | Fix payload, retry on next run |
| Network timeout (2s) | Warn, continue |
| Network unreachable | Warn, continue |
| Malformed response (not JSON) | Warn, continue |

## Testing (Phase 1 fixtures + Phase 2 Team C)

- Mock factory-cross-repo in vitest with stub endpoint
- Test successful PR creation (pr_url recorded)
- Test graceful 5xx handling (warn, don't fail)
- Test multiple repos in receipts (single PR created)

## Migration & Deployment

1. **Pre-Phase 2:** Confirm exact endpoint, auth method, secret name with factory-cross-repo team lead
2. **Phase 2:** Wire secret to supervisor worker wrangler.jsonc
3. **Phase 3 smoke tests:** curl POST /run; verify PR opened on GitHub

## Status

- ❌ Endpoint confirmed: NO (Team C lead responsibility)
- ❌ Auth method confirmed: NO (Team C lead responsibility)
- ❌ Secret wired: NO (Phase 2 prerequisite)
- ✅ Integration pattern documented: YES
- ✅ Error handling strategy defined: YES
