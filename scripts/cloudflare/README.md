# Cloudflare least-privilege token suite

Builds and rotates a suite of **least-privilege** Cloudflare API tokens (one per job) and
stores each in GCP Secret Manager. Implements [`docs/_governance/cloudflare-key-policy.md`](../../docs/_governance/cloudflare-key-policy.md).

| Job | GCP secret | Cloudflare permissions | Resource |
|---|---|---|---|
| Worker deploy | `cf-token-workers-deploy` | Workers Scripts:Write, Workers Routes:Write, Account Settings:Read | account + all zones |
| Pages deploy | `cf-token-pages-deploy` | Cloudflare Pages:Write | account |
| Cache purge | `cf-token-cache-purge` | Cache Purge | all zones |
| Stream | `cf-token-stream` | Stream:Write | account |

The suite is data, in [`token-suite.json`](./token-suite.json) — add a job by adding an entry.

## One-time bootstrap (the only manual step)

Cloudflare's security model means a token that can **create** tokens cannot itself be minted
by a non-privileged token (verified: the existing deploy tokens get HTTP 403 / code 9109 on
`/user/tokens`). So the root of trust is created once, by hand:

1. Cloudflare dashboard → **My Profile → API Tokens → Create Token → Custom Token**. Grant:
   - **User → API Tokens → Edit** (create/rotate/delete tokens)
   - **Account → Account Settings → Read** (resolve the account)
   - **Zone → Zone → Read** (resolve zones)
2. Store it in GCP Secret Manager and grant it to the WIF service account:
   ```bash
   printf '%s' '<TOKEN>' | gcloud secrets create CF_TOKEN_ADMIN \
     --project=factory-495015 --replication-policy=automatic --data-file=-
   gcloud secrets add-iam-policy-binding CF_TOKEN_ADMIN --project=factory-495015 \
     --member='serviceAccount:factory-sa@factory-495015.iam.gserviceaccount.com' \
     --role='roles/secretmanager.secretAccessor'
   ```
   Use `printf '%s'` (never `echo`) to avoid the trailing-newline trap.
3. Verify it: `curl -s https://api.cloudflare.com/client/v4/user/tokens/permission_groups \
   -H "Authorization: Bearer <TOKEN>" | head -c 80` → should be JSON `{"result":[...`, not a 403.

Everything below is automated from `CF_TOKEN_ADMIN`.

## Use

```bash
export CF_TOKEN_ADMIN="$(gcloud secrets versions access latest --secret=CF_TOKEN_ADMIN --project=factory-495015 | tr -d '\r\n')"

node scripts/cloudflare/manage-tokens.mjs --plan     # resolve env + show the intended suite (no writes)
node scripts/cloudflare/manage-tokens.mjs --create   # mint MISSING tokens → GCP SM → verify
node scripts/cloudflare/manage-tokens.mjs --rotate    # roll every token's value → GCP SM → verify
node scripts/cloudflare/manage-tokens.mjs --verify    # check each stored token is active
```

- **Idempotent.** `--create` skips a token that already exists; `--rotate` only rolls existing ones.
- **Fail-loud.** A permission-group name that doesn't resolve, or a token that fails post-write
  verification, exits non-zero — it never silently ships an under-scoped or dead token.
- **No secrets logged.** Token values flow CF → GCP SM only; they never hit stdout.
- If a permission-group name in `token-suite.json` doesn't match Cloudflare's catalog, `--plan`
  fails with the bad name — list the live names with the bootstrap token and correct the JSON.

## Rotation

`.github/workflows/cloudflare-token-rotation.yml` runs `--rotate` on a schedule (WIF → GCP SM),
then `--verify`. Cloudflare's `PUT /user/tokens/{id}/value` rolls the secret **without changing
the policy**, so consumers keep working after GCP SM is updated. To migrate a consumer onto a
least-privilege token, point its workflow/secret at the matching `cf-token-*` secret.
