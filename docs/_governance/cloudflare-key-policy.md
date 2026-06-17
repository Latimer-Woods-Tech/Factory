# Cloudflare Key Policy

**Last Updated:** 2026-06-16
**Status:** Active reference

This policy adapts the GCP credential values used by Factory to Cloudflare: least privilege, service-owned automation, environment isolation, explicit ownership, auditable access, and fast revocation.

## Scope

This policy applies to Cloudflare API tokens, account-owned API tokens, Wrangler OAuth sessions, Cloudflare Access service tokens, and any CI/CD secret that can call Cloudflare APIs.

It does not authorize storing Cloudflare credentials in source control, generated artifacts, local test state, plaintext runbooks, issue comments, or chat transcripts.

## Current Baseline

As of 2026-06-16, the local Wrangler OAuth session found on this workstation had broad deploy-oriented scopes such as Workers, Pages, D1, Queues, and zone read access. It did not show token-management scopes such as `API Tokens Write`, `API Tokens Read`, `Account API Tokens Write`, or `Account API Tokens Read`.

That means the local Wrangler login should be treated as a human developer session, not as a credential factory. It must not be used by CI or shared automation.

## Policy Values

1. Prefer account-owned tokens for shared automation.
2. Use user-owned tokens only for personal development or one-off investigation.
3. Separate human credentials from service credentials.
4. Separate production, staging, preview, and local development credentials.
5. Grant only the exact Cloudflare permission groups needed by the workflow.
6. Scope tokens to the smallest account, zone, project, bucket, database, queue, or script boundary Cloudflare supports.
7. Keep token creation and token deployment separate.
8. Give every credential an owner, purpose, environment, expiry, storage location, and rotation date.
9. Store credentials only in approved secret stores.
10. Rotate immediately after suspected exposure, personnel changes, scope changes, or automation ownership changes.

## Token Classes

| Class | Owner | Where used | May create tokens | Default lifetime | Purpose |
| --- | --- | --- | --- | --- | --- |
| `cf-human-dev` | Individual user | Local Wrangler and manual debugging | No | User session or 30 days | Personal development and inspection. |
| `cf-ci-deploy-dev` | Platform/service owner | CI/CD for non-production | No | 90 days | Deploy and manage dev Cloudflare resources. |
| `cf-ci-deploy-staging` | Platform/service owner | CI/CD for staging | No | 90 days | Deploy and manage staging Cloudflare resources. |
| `cf-ci-deploy-prod` | Platform/service owner plus production approver | CI/CD for production | No | 60 days | Deploy and manage production Cloudflare resources. |
| `cf-readonly-audit` | Platform/security owner | Inventory, drift checks, audits | No | 90 days | Read-only Cloudflare inventory and verification. |
| `cf-token-admin` | Platform security admin group | Manual rotation workflow only | Yes | 24 hours preferred, 7 days maximum | Create, rotate, revoke, and inventory Cloudflare tokens. |
| `cf-breakglass-admin` | Named executive/platform custodian | Emergency access only | Yes, if required | Disabled or sealed until use | Restore access when normal paths are unavailable. |

## Permission Boundaries

Deploy tokens must never include token-management permissions.

Allowed deploy permissions depend on the workload, but should usually be selected from the smallest compatible set:

- Workers deployments: `Workers Scripts Write`, `Workers KV Storage Write` only when KV is required, `Workers R2 Storage Write` only when R2 is required, `Workers Tail Read` only for controlled debugging.
- Pages deployments: `Pages Write`, plus only the account or project resources needed by the build.
- D1 migrations: `D1 Write` for the target environment only.
- Queues: `Queues Write` for the target environment only.
- AI or Vectorize workloads: `Workers AI Write`, `AI Gateway Edit`, or `Vectorize Write` only when the workload directly requires them.
- DNS automation: `DNS Write` only for the exact zone and only for workflows that change DNS.
- Auditing: read-only permission groups only, with no write permissions.

Token administration requires explicit approval and must be isolated:

- User-owned token management: `API Tokens Read` and `API Tokens Write`.
- Account-owned token management: `Account API Tokens Read` and `Account API Tokens Write`.
- Dashboard creation of account-owned tokens also requires the appropriate Cloudflare account administrator role.

## Storage Rules

Approved storage locations:

- GCP Secret Manager as the primary store for Factory automation credentials.
- CI/CD secret store for automation tokens.
- Local Wrangler OAuth storage for individual development sessions.
- Password manager or approved secret manager for break-glass material.
- Cloudflare dashboard for account-owned token inventory.

Disallowed storage locations:

- Repository files, including `.env`, `wrangler.toml`, `wrangler.jsonc`, generated docs, and examples.
- Issue comments, pull request descriptions, pasted logs, screenshots, or chat transcripts.
- Shared local files or shell history.
- Long-lived local environment variables for production credentials.

## Naming Standard

Use this naming pattern:

```text
cf-<owner-or-service>-<environment>-<capability>-<yyyymmdd>
```

Examples:

```text
cf-platform-prod-workers-deploy-20260616
cf-platform-staging-d1-migrate-20260616
cf-security-all-readonly-audit-20260616
cf-platform-admin-token-rotate-20260616
```

## Required Metadata

Every token must have an inventory record with:

- Token name.
- Cloudflare account ID and zone/project/resource scope.
- Token owner and backup owner.
- System or repository using the token.
- Environment.
- Permission groups.
- Secret storage location.
- Created date.
- Expiration date.
- Rotation date.
- Approval reference.
- Last verified date.

Use `docs/_governance/cloudflare-credential-inventory.template.md` as the starting inventory shape. Inventory records must never contain the credential value itself.

## Rotation And Revocation

Standard rotation:

- Production deploy tokens rotate at least every 60 days.
- Non-production deploy tokens rotate at least every 90 days.
- Read-only audit tokens rotate at least every 90 days.
- Token-admin credentials are created just in time whenever possible and expire within 24 hours.
- Break-glass credentials are tested quarterly without exposing their secret value.

Immediate revocation is required when:

- A token appears in a repository, artifact, log, screenshot, shell history, issue, ticket, or chat.
- A token owner changes roles or leaves the project.
- A token has broader permissions than its current workflow needs.
- A CI/CD system, developer workstation, or secret store is suspected of compromise.
- Production deployment ownership changes.

## No-Lockout Rollout Rules

Least privilege is not enough by itself. Credential changes must preserve a known-good path to deploy, inspect, and recover service.

1. Do not revoke or narrow an existing production credential until its replacement has completed at least one successful manual validation and two successful CI/CD runs.
2. Introduce replacement credentials alongside the current credential first, using a new secret name during validation when the platform allows it.
3. Change only one control plane at a time for a given workflow: GitHub auth, Cloudflare auth, database auth, or external API auth.
4. Keep at least two human administrators able to reach the Cloudflare dashboard before changing token-admin or break-glass material.
5. Validate break-glass access before high-risk rotations, and re-validate immediately after any emergency use.
6. Keep one read-only audit credential working during the entire migration so inventory and drift checks never depend on the credential being rotated.
7. Never rotate the token-admin credential and the primary deploy credential in the same change window.
8. Never change both the secret value and the consuming workflow logic in the same production step unless a rollback path is already tested.

Recommended production cutover order:

1. Inventory the current credential and confirm current working deployments.
2. Create the narrower replacement credential with expiry and owner metadata.
3. Store the replacement in the approved secret store under a new validation name.
4. Run a read-only or dry-run check where possible.
5. Update one non-production workflow or environment to use the replacement.
6. Promote the replacement to production and observe two successful runs.
7. Remove the old credential from production workflows.
8. Revoke the old credential and record the revocation date.

## Creation Workflow

1. Open a credential request with owner, environment, purpose, exact Cloudflare resources, requested permissions, expiration, storage location, and rotation owner.
2. Confirm that no existing token can be narrowed or rotated to satisfy the request.
3. Create account-owned tokens for shared automation whenever the endpoint supports them.
4. Assign only the permission groups required for the workflow.
5. Set the expiration before first use.
6. Store the token directly in the approved secret store.
7. Verify the token with the smallest safe read or dry-run operation.
8. Record metadata in the credential inventory.
9. Remove any temporary local copies after verification.

## Break-Glass Rules

Break-glass credentials exist only to restore service when normal access paths fail.

- They must have named custodians.
- They must require out-of-band approval before use.
- They must be stored outside day-to-day CI/CD systems.
- Their use must create an incident record.
- They must be rotated immediately after use.
- They must not be used for routine deploys, debugging, or convenience work.

## Local Developer Rules

Developers may use `wrangler login` for local work. Local Wrangler sessions are personal credentials and inherit the user's Cloudflare access.

Developers must not:

- Reuse local Wrangler OAuth tokens in automation.
- Paste Wrangler config values into CI/CD.
- Grant token-management permissions to local development tokens.
- Use production-scoped Cloudflare tokens for local testing.

When local testing needs Cloudflare access, prefer non-production resources and narrow user-owned tokens with short expirations.

## Adoption Checklist

1. Inventory all Cloudflare credentials used by CI, local machines, scripts, and external services.
2. Classify each credential using the token classes in this policy.
3. Revoke any deploy token that can create or manage other tokens.
4. Replace shared user-owned automation tokens with account-owned tokens where Cloudflare supports the endpoint.
5. Split production and non-production tokens.
6. Add expirations and rotation owners to all remaining tokens.
7. Move any plaintext token out of repo files, local scripts, or issue history.
8. Create one read-only audit token for inventory and drift checks.
9. Create a short-lived token-admin workflow for token rotation.
10. Schedule the first rotation review within 30 days.

## References

- Cloudflare API token creation: https://developers.cloudflare.com/fundamentals/api/get-started/create-token/
- Cloudflare account-owned tokens: https://developers.cloudflare.com/fundamentals/api/get-started/account-owned-tokens/
- Cloudflare token creation through the API: https://developers.cloudflare.com/fundamentals/api/how-to/create-via-api/
- Cloudflare API token permissions: https://developers.cloudflare.com/fundamentals/api/reference/permissions/
- Cloudflare account token API: https://developers.cloudflare.com/api/resources/accounts/subresources/tokens/methods/create/
