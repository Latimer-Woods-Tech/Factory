---
status: canonical
owner: platform
doc_type: policy
fidelity: verified
quality: usable
last_updated: 2026-06-16
last_verified: 2026-06-16
scope: Cloudflare API token governance — which tokens exist, where they live, least-privilege, rotation, and the verify-before-trust requirement.
truth_source:
  - validation-output
  - service-registry
  - github-workflows
verified_by:
  - "cloudflare /user/tokens/verify (2026-06-16)"
  - "gcloud secrets list (factory-495015)"
---

# Cloudflare Key Policy

**Status:** Active / law. This is the standing policy for every Cloudflare credential the Factory and its apps use. It exists because Cloudflare is moving the industry off long-lived **Global API Keys** toward **scoped API tokens**, and because a credential you cannot verify is a credential you cannot trust.

## 1. Principles (the law)

1. **Scoped API tokens only — never the Global API Key.** No workflow, script, or runbook may use the account-wide Global API Key (email + 37-char hex key). Every credential is a scoped token with the **least** privileges its job needs.
2. **GCP Secret Manager (`factory-495015`) is the canonical store.** Cloudflare tokens are sourced from GCP SM via WIF, not GitHub repo secrets — per [`CLAUDE.md`](../../CLAUDE.md). Where a workflow needs a GitHub `secrets.*` mirror for `wrangler`, the GCP SM copy is the source of truth and the mirror must match it.
3. **Verify before you trust.** After minting, rotating, or wiring any token, run the verify recipe (§5) and confirm `success:true status:active` **with your own eyes** before relying on it. CI green ≠ token valid.
4. **Least privilege, named purpose.** Each token's scope is documented in §3. A deploy token does not get cache-purge; a Stream token does not get Workers edit. Over-scoped tokens are a finding.
5. **No orphans.** A secret that no consumer references, or that fails verification, is either fixed or removed (§4). Dead credentials are attack surface and audit noise.

## 2. Canonical secret inventory (GCP SM `factory-495015`)

Verified 2026-06-16 against Cloudflare `/user/tokens/verify`:

| Secret | Purpose | Status (2026-06-16) |
|---|---|---|
| `CF_API_TOKEN` | **Primary** deploy/admin token — Workers + Pages deploys, DNS/route ops. Used in ~59 workflow refs. | ✅ valid & active |
| `CLOUDFLARE_API_TOKEN` | **Fallback** for `CF_API_TOKEN` (workflows use `CF_API_TOKEN \|\| CLOUDFLARE_API_TOKEN`). | ✅ valid & active |
| `CF_ACCOUNT_ID` / `CLOUDFLARE_ACCOUNT_ID` | Account id (`adrper79` account). Fallback pair, not a credential. | n/a (not a token) |
| `CF_STREAM_TOKEN` | Cloudflare Stream API (video pipeline `/copy` + status). Scoped to Stream. | scoped — Stream only |
| `CF_STREAM_CUSTOMER_DOMAIN` | Stream customer subdomain. | n/a (not a token) |
| `CLOUDFLARE_API` | Declared at `docs/service-registry.yml:492` for one service. **Fails `/tokens/verify`** and is referenced by no workflow. | ⚠️ **does not verify — cleanup (§4)** |
| `CLOUDFLARE_API_TOKEN_NEW` | 53-char token, **zero consumers** anywhere. | ⚠️ **orphan — cleanup (§4)** |

> ✅ **No Global API Keys are in the store** — every Cloudflare credential is a scoped token (53-char `cf*`-format), confirming compliance with §1.1.

## 3. Scope requirements by job

| Job | Token | Required permissions |
|---|---|---|
| Worker deploy (`wrangler deploy`) | `CF_API_TOKEN` | Account · Workers Scripts: Edit; Account · Workers Routes: Edit; Zone · Workers Routes: Edit |
| Pages deploy | `CF_API_TOKEN` | Account · Cloudflare Pages: Edit |
| **Cache purge** | *dedicated purge token* | Zone · Cache Purge: Purge |
| Stream | `CF_STREAM_TOKEN` | Account · Stream: Edit |

> ⚠️ **Cache-purge caveat:** `cf*`-scoped deploy tokens do **not** carry `Cache Purge: Purge`. A purge needs a token that explicitly has that permission — minting a deploy token and expecting it to purge is a known failure (see the selfprime login-cache-poisoning incident). Provision a separate purge-scoped token; do not widen the deploy token.

## 4. Cleanup register (open)

Neither item below breaks production today (deploys use `CF_API_TOKEN`), but both violate §1.5:

- **`CLOUDFLARE_API`** — fails `/tokens/verify`, declared only at `docs/service-registry.yml:492`, used by no workflow. Confirm the owning service no longer needs it, then either replace with a valid scoped token or remove the declaration + secret.
- **`CLOUDFLARE_API_TOKEN_NEW`** — orphan, no consumers. Remove after confirming nothing reads it.

> Secret deletion is destructive and not auto-performed — surface to the owner with this evidence and delete only after confirmation.

## 5. Verify recipe (run after every change)

```bash
export NEON_API_KEY=... # not needed here; CF tokens live in GCP SM
TOK="$(gcloud secrets versions access latest --secret=CF_API_TOKEN --project=factory-495015 | tr -d '\r\n\357\273\277')"
curl -s https://api.cloudflare.com/client/v4/user/tokens/verify \
  -H "Authorization: Bearer $TOK" | python -c 'import sys,json;d=json.load(sys.stdin);print(d["success"], (d.get("result") or {}).get("status"))'
# expect:  True active
```

The GCP/GitHub copies are sometimes **BOM-prefixed or stale** — always `tr -d '\r\n\357\273\277'` after fetching, and verify the result rather than debugging a stale copy.

## 6. Rotation

1. Mint a new scoped token in the Cloudflare dashboard with **only** the permissions from §3.
2. Write it to GCP SM (`printf '%s'`, never `echo`, to avoid the trailing-newline trap) and update any GitHub mirror.
3. **Verify** (§5) → `True active`.
4. Deploy a no-op or run the consuming workflow; confirm `/health` 200 (or the relevant probe).
5. Revoke the old token in the dashboard only **after** the new one is confirmed live.

## 7. Automation — build + rotate the least-privilege suite

The scoped suite is **minted and rotated by code**, not by hand:

- [`scripts/cloudflare/token-suite.json`](../../scripts/cloudflare/token-suite.json) — declarative spec: one entry per job (`cf-token-workers-deploy`, `cf-token-pages-deploy`, `cf-token-cache-purge`, `cf-token-stream`), each with its permission groups + resource scope.
- [`scripts/cloudflare/manage-tokens.mjs`](../../scripts/cloudflare/manage-tokens.mjs) — `--plan` / `--create` / `--rotate` / `--verify`. Resolves account, zones, and permission-group IDs live; creates/rolls each token via the CF API (`POST /user/tokens`, `PUT /user/tokens/{id}/value`); writes the value to GCP SM (`--data-file=-`, no newline trap); verifies. Fail-loud (an unresolved permission group or a token that fails post-write verify exits non-zero) and never logs a token value.
- [`.github/workflows/cloudflare-token-rotation.yml`](../../.github/workflows/cloudflare-token-rotation.yml) — monthly `--rotate` + on-demand `--plan/--create/--verify`, authed to GCP via WIF (`factory-sa`).

**Root of trust — the one irreducible manual step.** Creating tokens needs `User → API Tokens → Edit`, which Cloudflare will not grant to a token minted by a non-privileged token (verified: both deploy tokens 403/9109 on `/user/tokens`). So a single bootstrap token, **`CF_TOKEN_ADMIN`**, is created once by hand (API Tokens:Edit + Account Settings:Read + Zone:Read) and stored in GCP SM; the automation mints everything else from it. Setup steps: [`scripts/cloudflare/README.md`](../../scripts/cloudflare/README.md).

## 8. References

- [`CLAUDE.md`](../../CLAUDE.md) — secrets sourced from GCP SM via WIF; verification requirement.
- [`docs/runbooks/github-secrets-and-tokens.md`](../runbooks/github-secrets-and-tokens.md) — `CF_API_TOKEN` vs `CLOUDFLARE_API_TOKEN` naming, full secret inventory, rotation schedule.
- [`docs/service-registry.yml`](../service-registry.yml) — per-service `required_secrets` (where each token is consumed).
- [`docs/adr/0009-cloudflare-workers-only.md`](../adr/0009-cloudflare-workers-only.md) — runtime decision.
