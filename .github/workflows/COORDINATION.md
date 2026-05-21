# GitHub Actions Coordination

**Purpose:** central operating map for Factory workflows so agents know what to run, what each workflow gates, and how to recover.

## Rules

1. Use `WORLD_CLASS_IMPLEMENTATION_DASHBOARD.md` for status; this file explains workflow mechanics only.
2. Never declare a deployed Worker/Page working from CI alone; run direct HTTP verification.
3. Do not run deploy workflows while generated artifacts or unrelated source edits are staged.
4. Video render jobs must remain idempotent and concurrency-safe by `job_id`.
5. Secret setup and infrastructure workflows should be run before app scaffolding or deploy workflows.
6. `docs/service-registry.yml` is an executable contract for covered local Workers, not a best-effort note file.

## Workflow groups

| Group | Workflows | Primary use | Gates / recovery |
|---|---|---|---|
| Package CI/publish | `ci.yml`, `publish.yml`, `bootstrap-publish.yml`, `package-integration.yml` | Validate and publish `@latimer-woods-tech/*` packages; smoke-test cross-package runtime imports | Run package gates locally first; publish in dependency order from `CLAUDE.md`; run package integration smoke before publish-sensitive changes |
| Infrastructure setup | `create-hyperdrive.yml`, `create-sentry-projects.yml`, `provision-r2.yml`, `update-hyperdrive-new-neon.yml`, `setup-*.yml` | Provision secrets, databases, R2, Sentry, Hyperdrive | Prefer `scripts/phase-6-orchestrator.mjs`; record run IDs in dashboard |
| App scaffolding | `scaffold-all-apps.yml`, `scaffold-factory-admin.yml`, `scaffold-xico-city.yml`, `scaffold-xpelevator.yml` | Generate app structures after infra is ready | Validate with `scripts/phase-7-validate.js --all` before claiming done |
| Worker deploys | `deploy-admin-studio.yml`, `deploy-daily-brief.yml`, `deploy-schedule-worker.yml`, `deploy-video-cron.yml`, `deploy-synthetic-monitor.yml`, `deploy-supervisor.yml`, `deploy-lead-gen.yml`, `deploy-webhook-fanout.yml` | Deploy Cloudflare Workers | Prefer canonical custom domains from `docs/service-registry.yml` for verification; where no branded domain exists yet, verify the `workers.dev` fallback intentionally |
| Pages/UI deploys | `deploy-admin-studio-ui.yml`, `factory-admin-ui-ci.yml` (storybook), external app workflows in `HumanDesign`, `capricast`, `coh`, and `xico-city` | Deploy Pages/static UI | Verify custom domain or Pages URL returns expected HTTP status and expected page marker via `scripts/verify-http-endpoint.mjs` |
| Video pipeline | `render-video.yml`, `migrate-schedule-worker.yml`, `smoke-video-phase0.yml` | Migrate schedule DB and render/register Stream videos | `render-video.yml` uses `concurrency: render-${{ github.event.inputs.job_id }}`; failed run must update job state or be manually reconciled |
| Smoke/quality | `smoke-prime-self.yml`, `studio-test-dispatch.yml`, `doc-freshness-audit.yml` | Validate live app/ops surfaces and docs freshness | Failures create dashboard work items, not ad hoc root summaries |
| Reporting | `track-kpis.yml`, `generate-scorecard.yml` | Produce delivery/SLO/status metrics | Outputs must be linked from dashboard; stale metrics require explicit timestamp |

## Pre-deploy health gate pattern

Before any production deploy workflow is considered complete:

1. Confirm current production health for upstream dependencies.
2. Deploy the target service.
3. Run direct HTTP health checks with `scripts/verify-http-endpoint.mjs` so propagation retries, expected status, and JSON env/status assertions fail the workflow instead of being warning-only.
4. Run critical-route smoke checks where available.
5. Update `docs/service-registry.yml` if URLs, consumers, secrets, or worker names changed.
6. Update `WORLD_CLASS_IMPLEMENTATION_DASHBOARD.md` with run ID and observed status.

## Executable registry guard

Factory now enforces part of the deployment control plane directly from `docs/service-registry.yml`.

Primary operator reference: `docs/runbooks/validate-service-registry.md`.

What is checked today:

- Every local `deploy-*.yml` workflow is covered by `scripts/validate-service-registry.mjs` or would fail coverage validation.
- Verification URLs in covered deploy workflows must match the registry's canonical health-check targets, including the cases where a workflow intentionally verifies a base URL and appends `/health` at runtime.
- For the covered Workers, declared `required_secrets`, `required_vars`, and `required_bindings` in `docs/service-registry.yml` must stay aligned with the deploy workflow text and the Worker `wrangler.jsonc` contract.

Current validator scope:

- Workflow verification coverage: all 9 local deploy workflows.
- Contract validation: `admin-studio-staging`, `admin-studio-production`, `schedule-worker`, `video-cron`, `synthetic-monitor`, `lead-gen`, `webhook-fanout`, `daily-brief`, and `factory-supervisor`.
- Exemptions: none.

Current intentional limits:

- The validator does not simulate Cloudflare infrastructure, inspect secret values, or query remote state.
- It does not yet enforce every Worker in the repo; expansion is intentionally one service at a time so the checks stay high-signal.
- It compares declared contracts only. If a service relies on additional runtime behavior that is not yet declared in the registry, the registry must be updated before the validator can enforce it.

## Video render recovery

If `render-video.yml` fails:

1. Open the failed run and identify the first failed step.
2. Confirm whether `Register job in database` produced a DB job ID.
3. If a DB job ID exists, confirm the failure handler marked it failed.
4. If no DB job ID exists, no schedule row update is expected.
5. Do not re-dispatch blindly; verify idempotency key and job status first.
6. Record the failed run ID and recovery action in the dashboard if it affects product readiness.

## Current open coordination gaps

- No automated metric-to-dashboard writer is enforced yet.
- No shared pre-deploy health gate is imported by every deploy workflow yet.
- Phase 6 orchestration is script-first; a single Actions UI wrapper is still recommended.
- Cross-package integration CI is defined in `package-integration.yml`; first run 25124117458 passed and is recorded in the dashboard.
- Several workflows still verify `workers.dev` URLs even where the canonical custom domain is already live.

## Recent deployment alignment updates

- `deploy-daily-brief.yml` was added so `daily-brief` now has a dedicated deploy path instead of relying on ad hoc manual pushes.
- `deploy-schedule-worker.yml` and `deploy-synthetic-monitor.yml` now verify the branded production domains recorded in `docs/service-registry.yml`.
- `deploy-webhook-fanout.yml` intentionally verifies the `workers.dev` fallback until branded-domain resolver behavior is consistent across environments.
- `docs/service-registry.yml` remains the source of truth when workflow verification targets and public domains diverge temporarily.
- `deploy-admin-studio.yml` now provisions its required runtime secrets explicitly and is part of the enforced contract-validation set for both staging and production.
- `deploy-lead-gen.yml` now provisions its runtime secrets before deploy and verifies `/health` after deploy.
- `deploy-supervisor.yml` now verifies the canonical production hostname and provisions Slack secrets required by the worker runtime.
- `validate-service-registry.yml` now turns registry/workflow/Wrangler drift into a CI failure for the currently covered local Workers.
