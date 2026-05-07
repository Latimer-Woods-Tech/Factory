# GCP Service-Account Key Rotation — `supervisor-sa`

This runbook covers rotating the `supervisor-sa@factory-495015.iam.gserviceaccount.com` key
that powers the supervisor planner's Gemini 2.5 Pro fallback via Vertex AI.

> **Who owns this?** Adrian (GCP console) or Sauna (if proxy auth is fixed).
> **How often?** Quarterly, or immediately on suspected compromise.

---

## Context

The supervisor planner uses `VERTEX_ACCESS_TOKEN` at runtime to call
`https://us-central1-aiplatform.googleapis.com/…/gemini-2.5-pro:generateContent`.

That short-lived bearer token is minted from the `supervisor-sa` JSON key
(`SUPERVISOR_VERTEX_SA_KEY` org secret) in two places:

| Consumer | How token is minted | Where it lands |
|---|---|---|
| `verify-vertex-ai.yml` | `google-github-actions/auth@v2` + `gcloud auth print-access-token` | GitHub Actions env only |
| `factory-supervisor` Worker (future) | JWT-bearer exchange at startup using Web Crypto API | `VERTEX_ACCESS_TOKEN` Wrangler secret |

---

## Rotation procedure

### 1. Mint a new key (do NOT delete the old one yet)

```bash
PROJECT="factory-495015"
SA_EMAIL="supervisor-sa@factory-495015.iam.gserviceaccount.com"
KEY_FILE="/tmp/supervisor-sa-key-new.json"

gcloud iam service-accounts keys create "$KEY_FILE" \
  --iam-account="$SA_EMAIL" \
  --project="$PROJECT"
```

### 2. Update the org secret

```bash
gh secret set SUPERVISOR_VERTEX_SA_KEY \
  --org Latimer-Woods-Tech \
  --visibility all \
  --body "$(cat /tmp/supervisor-sa-key-new.json)"
```

### 3. Verify the new key works

```bash
gh workflow run verify-vertex-ai.yml --repo Latimer-Woods-Tech/factory
```

Wait for the workflow to pass (green check).  If it fails, do **not** delete the
old key — re-check the new key contents and retry.

### 4. Delete the old key

```bash
# List keys — note the KEY_ID of the old key
gcloud iam service-accounts keys list \
  --iam-account="$SA_EMAIL" \
  --project="$PROJECT"

# Delete it
gcloud iam service-accounts keys delete OLD_KEY_ID \
  --iam-account="$SA_EMAIL" \
  --project="$PROJECT"
```

### 5. Shred the local copy

```bash
shred -uz /tmp/supervisor-sa-key-new.json
```

### 6. Document the rotation

Add an entry to this file's **Rotation log** section below.

---

## If the `factory-supervisor` Worker is deployed

When the Worker reads `VERTEX_ACCESS_TOKEN` at request time, it exchanges the SA key
for a short-lived token using the
[JWT Bearer Token flow](https://developers.google.com/identity/protocols/oauth2/service-account#jwt-auth).

After updating the org secret, also rotate the Worker secret:

```bash
# 1. Obtain a fresh access token locally
gcloud auth activate-service-account --key-file=/tmp/supervisor-sa-key-new.json
TOKEN=$(gcloud auth print-access-token)

# 2. Set it on the Worker (valid ~1 h; Worker must refresh it internally or via CI)
echo "$TOKEN" | wrangler secret put VERTEX_ACCESS_TOKEN --name factory-supervisor

# 3. Verify
curl https://supervisor.apunlimited.com/health
```

**Token expiry:** Google access tokens are valid for 1 hour.  The supervisor Worker
is expected to refresh `VERTEX_ACCESS_TOKEN` by implementing the
[JWT Bearer Token flow](https://developers.google.com/identity/protocols/oauth2/service-account#jwt-auth)
using the Web Crypto API at startup.  Until that is implemented (post-SUP-3), a
scheduled GitHub Actions workflow can re-run step 2 above to keep the secret fresh.
See `docs/supervisor/ARCHITECTURE.md §6` for the long-term design.

---

## Rotation log

| Date | Who | Reason | Old key ID (last 8 chars) |
|---|---|---|---|
| _(first mint — SUP-1.2)_ | Adrian | Initial provisioning | — |
