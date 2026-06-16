# Credential Hardening Backlog

**Last Updated:** 2026-06-16
**Status:** Active reference

This backlog summarizes credential families referenced by Factory workflows and the next hardening moves. It records names and usage patterns only; never add secret values to this file.

Factory default: GCP Secret Manager is the primary store for automation credentials. GitHub Actions secrets remain transition fallback until each workflow family has completed a validated cutover.

## Evidence

- Local shell environment scan on 2026-06-16 found no matching key, token, secret, API, or provider environment variable names in the active shell.
- GitHub Actions workflow references on 2026-06-16 show broad use of repository or organization secrets across deploy, governance, mirroring, AI, observability, billing, notification, and smoke-test workflows.
- `gh secret list` and `gh variable list` did not return promptly in the local shell, so this backlog is based on repo-local workflow references rather than live GitHub secret metadata.

## Highest Priority Fixes

| Priority | App/key family | Evidence | Risk | Fix |
| --- | --- | --- | --- | --- |
| P0 | GitHub App private key | `FACTORY_APP_PRIVATE_KEY` and `FACTORY_APP_ID` appear in 63 workflow files. | One credential family can mint installation tokens for many workflows. | Review GitHub App permissions, split high-risk automations into narrower apps if needed, and require per-workflow token generation scoped to the target owner/repo. |
| P0 | GCP Vertex service account | `VERTEX_SA_KEY` appears in 29 workflow files. | Long-lived service account JSON keys have high blast radius and are hard to constrain by workflow. | Replace static service account keys with workload identity federation or short-lived access tokens; use one service account per environment/workload. |
| P0 | Cloudflare deploy tokens | `CF_API_TOKEN` appears in 29 workflow files; `CLOUDFLARE_API_TOKEN` appears in 5 workflow files. | Shared deploy tokens can silently accumulate broad Cloudflare permissions. | Apply `docs/_governance/cloudflare-key-policy.md`: split by environment and workload, remove token-management permissions, and inventory each token. |
| P0 | Secret distribution workflows | `mirror-org-secrets-to-dependabot.yml` and `setup-app-secrets.yml` reference many provider secrets. | Central fan-out workflows can spread one broad secret across many repos and contexts. | Replace broad mirroring with explicit per-app allowlists, environment approvals, and provider-specific token classes. |
| P1 | Stripe | `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, Stripe price IDs, and webhook secrets appear in app-secret workflows. | A shared Stripe secret key across apps increases payment and customer-data blast radius. | Replace shared `sk_` keys with Stripe restricted API keys per app and environment where possible; keep webhook secrets separate per endpoint. |
| P1 | Neon/Postgres | `NEON_API_KEY`, `NEON_CONNECTION_STRING`, `DATABASE_URL`, `HUMANDESIGN_DATABASE_URL`, and Hyperdrive bindings appear in workflows. | Broad API keys and shared connection strings can mutate or expose production data. | Use environment-specific database roles and connection strings; reserve Neon API keys for lifecycle workflows only. |
| P1 | Cloudflare R2 object storage | `FACTORY_R2_ACCESS_KEY`, `FACTORY_R2_SECRET_KEY`, `FACTORY_R2_TOKEN`, `R2_ACCESS_KEY_ID`, and `R2_SECRET_ACCESS_KEY` appear in workflows. | S3-compatible R2 keys can outlive app deployments and cross bucket boundaries. | Create per-bucket, per-environment R2 credentials; prefer read-only credentials for read paths. |
| P1 | Auth/session secrets | `JWT_SECRET`, `SUPERVISOR_JWT_SECRET`, `BETTER_AUTH_SECRET_VIDEOKING`, `QA_TOOLS_ENCRYPT_KEY`, smoke passwords, and admin user/password secrets appear in workflows. | Shared auth material makes session forgery and test-account reuse harder to contain. | Rotate by app/environment; move smoke-test identities into non-production only; document owner and next rotation. |

## No-Lockout Guardrails

1. Do not rotate shared credentials out of production until the replacement has passed one manual check and two successful workflow runs.
2. Add replacement secrets under new names first, then cut over consumers, then revoke the old secret last.
3. Change only one control plane per rollout step: GitHub, Cloudflare, GCP, database, Stripe, or notification provider.
4. Keep at least one validated break-glass or owner-admin path for GitHub, Cloudflare, GCP, and Neon before narrowing automation credentials.
5. Do not change the GitHub App private key, Cloudflare deploy token, and secret-distribution workflow behavior in the same window.
6. Do not migrate production and staging to a new credential in the same step.
7. Record rollback owner and rollback secret reference before each high-risk rotation.

## Provider-Specific Backlog

| Provider/app | Referenced secrets | Recommended action |
| --- | --- | --- |
| GitHub | `FACTORY_APP_PRIVATE_KEY`, `FACTORY_APP_ID`, `FACTORY_APP_INSTALLATION_ID`, `GH_PAT`, `GH_TOKEN_ISSUE`, `GITHUB_APP_PRIVATE_KEY`, `GITHUB_TOKEN`, `FACTORY_CROSS_REPO_TOKEN` | Prefer GitHub App installation tokens over PATs; retire classic PATs where possible; split apps by permission domain if one app currently has write access everywhere. |
| GCP / Google | `VERTEX_SA_KEY`, `VERTEX_ACCESS_TOKEN`, `GEMINI_API_KEY`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `ADMIN_STUDIO_GOOGLE_CLIENT_ID` | Replace static service account JSON keys with federated or short-lived credentials; split OAuth clients by app/environment; treat Gemini API keys as per-workload secrets. |
| Cloudflare | `CF_API_TOKEN`, `CLOUDFLARE_API_TOKEN`, `CF_ACCOUNT_ID`, `CLOUDFLARE_ACCOUNT_ID`, `WORKER_API_TOKEN`, zone IDs | Continue the Cloudflare policy rollout; converge duplicate token names into clearly scoped token classes. |
| Stripe | `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, `STRIPE_SUBSCRIPTION_WEBHOOK_SECRET`, `STRIPE_WEBHOOK_SECRET_VIDEOKING`, Stripe price IDs | Use restricted API keys per app/environment; make price IDs variables where they are not sensitive; keep webhook signing secrets unique per endpoint. |
| Neon/Postgres | `NEON_API_KEY`, `NEON_CONNECTION_STRING`, `DATABASE_URL`, `HUMANDESIGN_CONNECTION_STRING`, `HUMANDESIGN_DATABASE_URL`, Hyperdrive bindings | Split admin API keys from runtime connection strings; use least-privilege database roles; separate prod, staging, preview, and migration credentials. |
| AI vendors | `ANTHROPIC_API_KEY`, `GROK_API_KEY`, `GROQ_API_KEY`, `DEEPGRAM_API_KEY`, `ELEVENLABS_API_KEY`, `NEWS_API_KEY` | Create workload-specific keys where vendors support it; set spend/rate limits; remove keys from workflows that only need model output through a gateway. |
| Observability | `SENTRY_AUTH_TOKEN`, `FACTORY_SENTRY_API`, Sentry DSNs, `POSTHOG_API`, `POSTHOG_API_KEY`, `POSTHOG_PROJECT_TOKEN`, `CHROMATIC_PROJECT_TOKEN` | Separate write/admin tokens from public ingest tokens; keep DSNs and project tokens app-specific; rotate admin tokens on a tighter schedule. |
| Notifications | `SLACK_WEBHOOK_*`, `PUSHOVER_*`, `RESEND_API_KEY`, `TELNYX_API_KEY`, `TELNYX_FROM_NUMBER`, `TELNYX_LIVE_TEST_TO`, `NOTIFICATION_PHONE` | Split production alerting from test notification paths; rotate webhooks; restrict live SMS/voice test credentials to manual workflows. |
| Package/mirror publishing | `NPM_TOKEN`, `NODE_AUTH_TOKEN`, `CODEBERG_TOKEN`, `GITLAB_TOKEN` | Use publish-only or package-scoped tokens; keep mirror tokens separate from deploy tokens; rotate after every mirror ownership change. |
| Internal app APIs | `FACTORY_CORE_API_INGEST_KEY`, `STUDIO_WEBHOOK_SECRET`, `INCIDENT_TRACKER_API`, `INCIDENT_TRACKER_TOKEN`, `SCHEDULE_WORKER_URL` | Give each internal API caller a named key; add rotation ownership; separate webhook signing secrets from API bearer tokens. |

## Next Execution Order

1. Validate human admin and break-glass access for GitHub, Cloudflare, and GCP before touching shared automation credentials.
2. Finish Cloudflare token inventory and create narrower replacement tokens using `docs/_governance/cloudflare-credential-inventory.template.md`.
3. Cut one non-production Cloudflare workflow to the new token class, then production, then revoke old Cloudflare deploy tokens.
4. Replace `VERTEX_SA_KEY` usage with short-lived or federated GCP credentials, one workflow family at a time.
5. Audit the GitHub App permissions behind `FACTORY_APP_PRIVATE_KEY` and remove any remaining PAT workflows that can use app tokens instead.
6. Convert `mirror-org-secrets-to-dependabot.yml` and `setup-app-secrets.yml` from broad secret bundles to explicit per-app allowlists after the new credential classes exist.
7. Replace shared `STRIPE_SECRET_KEY` fan-out with per-app/per-environment restricted keys.
8. Split database credentials into runtime, migration, preview, and admin classes.
9. Rotate auth/session material and smoke-test credentials.
10. Split notification and observability tokens into public ingest, write, and admin classes.

## Workflow Hubs To Review

| Workflow | Why it matters | First review question |
| --- | --- | --- |
| `.github/workflows/mirror-org-secrets-to-dependabot.yml` | References many provider secrets and mirrors them into Dependabot context. | Which of these secrets are truly needed by Dependabot, and can the rest be removed? |
| `.github/workflows/setup-app-secrets.yml` | Fans shared secrets into app repositories. | Which app secrets should become per-app/per-environment credentials instead of shared global values? |
| `.github/workflows/refresh-vertex-token.yml` | Handles GCP/Vertex credential refresh. | Can this become the single short-lived-token path and eliminate static service account JSON from other workflows? |
| `.github/workflows/secret-contract-preflight.yml` | Reports required secret contracts. | Can this enforce missing/overbroad secret classes once the inventory is complete? |

## Cleanup Rules

1. Keep secret values out of docs, workflow logs, shell history, and issue comments.
2. Treat any credential used by more than five workflows as a candidate for split ownership.
3. Treat any credential copied into multiple app repos as a candidate for per-app replacement.
4. Treat every production credential without an expiration or rotation owner as non-compliant.
5. Prefer provider-native restricted keys, app installation tokens, workload identity, or short-lived tokens over shared static secrets.
