# Team C: factory-cross-repo Endpoint Confirmation

**Target:** Unblock Phase 3 deployment and smoke tests.

**Context:** Phase 2 PR #974 merged successfully (2026-05-24). Supervisor is ready for deployment once factory-cross-repo endpoint details are confirmed.

**Action Required:** Reply in this GitHub Issue (Factory #974) with the following values:

---

## Endpoint Configuration

Please provide **both** of the following:

### 1. FACTORY_CROSS_REPO_URL

**What it is:** The base URL of the factory-cross-repo Cloudflare Worker

**Example format:**
```
https://factory-cross-repo-worker.adrper79.workers.dev
```

**Or if a custom domain:**
```
https://factory-cross-repo.latwoodtech.work
```

**Important:** Provide the **base URL only** (no `/api/supervisor/create-pr` suffix — that's appended in code)

---

### 2. FACTORY_CROSS_REPO_TOKEN

**What it is:** Bearer token for authentication (will be stored as GitHub secret)

**Format:** 
```
Bearer token or JWT value
```

**Scope:** Used in supervisor worker to authenticate POST requests to the factory-cross-repo endpoint

**Security:** Will be stored in GitHub repo secret `FACTORY_CROSS_REPO_TOKEN` and injected at deploy time

---

## Verification Checklist

Once you provide the above values, I will:

- [ ] Add `FACTORY_CROSS_REPO_TOKEN` to GitHub repo secrets
- [ ] Update supervisor/wrangler.jsonc with `FACTORY_CROSS_REPO_URL`
- [ ] Deploy supervisor worker to production
- [ ] Run Phase 3 smoke test suite (5 scenarios):
  - Scenario 1: Baseline (read-only, no PR)
  - Scenario 2: Amplification cap (verify 25-step limit enforced)
  - Scenario 3: Approval gate (verify pause + /approve resume)
  - Scenario 4: Verifier failure (verify execution succeeds but verification fails)
  - Scenario 5: Happy path (full flow with PR opening)
- [ ] Verify PR opened on affected repos (GitHub)
- [ ] Close Phase 3 ticket

---

## Expected Endpoint Behavior

**Endpoint:** `POST {FACTORY_CROSS_REPO_URL}/api/supervisor/create-pr`

**Request Headers:**
```
Authorization: Bearer <FACTORY_CROSS_REPO_TOKEN>
Content-Type: application/json
```

**Request Body (example):**
```json
{
  "template_id": "end-to-end",
  "run_id": "end-to-end-1-1716518400000",
  "description": "Supervisor execution audit",
  "affected_repos": [
    {
      "app_id": "selfprime",
      "owner": "Latimer-Woods-Tech",
      "repo": "HumanDesign"
    }
  ],
  "receipts": [ /* full step execution records */ ]
}
```

**Success Response (201):**
```json
{
  "ok": true,
  "pr_url": "https://github.com/Latimer-Woods-Tech/HumanDesign/pull/123",
  "pr_number": 123
}
```

**Error Response (4xx/5xx):**
```json
{
  "ok": false,
  "error": "Human-readable error message"
}
```

---

## Timeline

Once endpoint values are received:
- **Immediate:** Wiring secrets and deploying supervisor (~2 min)
- **Then:** Running 5 smoke test scenarios (~5 min)
- **Then:** Verifying PR opened on GitHub (~2 min)
- **Total:** ~10 minutes from confirmation to Phase 3 complete

---

## Contact

**Ping:** @adrper79 (once endpoint details are posted)

---

**Reference docs:**
- [FACTORY-CROSS-REPO-INTEGRATION.md](./FACTORY-CROSS-REPO-INTEGRATION.md) — Full integration spec
- [PHASE_3_DEPLOYMENT_CHECKLIST.md](./PHASE_3_DEPLOYMENT_CHECKLIST.md) — Deployment steps
