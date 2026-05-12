# GitHub Actions Coordination

**Purpose:** central operating map for Factory workflows so agents know what to run, what each workflow gates, and how to recover.

## Rules

1. Use `WORLD_CLASS_IMPLEMENTATION_DASHBOARD.md` for status; this file explains workflow mechanics only.
2. Never declare a deployed Worker/Page working from CI alone; run direct HTTP verification.
3. Do not run deploy workflows while generated artifacts or unrelated source edits are staged.
4. Video render jobs must remain idempotent and concurrency-safe by `job_id`.
5. Secret setup and infrastructure workflows should be run before app scaffolding or deploy workflows.

## Workflow groups

| Group | Workflows | Primary use | Gates / recovery |
|---|---|---|---|
| Package CI/publish | `ci.yml`, `publish.yml`, `bootstrap-publish.yml`, `package-integration.yml` | Validate and publish `@latimer-woods-tech/*` packages; smoke-test cross-package runtime imports | Run package gates locally first; publish in dependency order from `CLAUDE.md`; run package integration smoke before publish-sensitive changes |
| Infrastructure setup | `create-hyperdrive.yml`, `create-sentry-projects.yml`, `provision-r2.yml`, `update-hyperdrive-new-neon.yml`, `setup-*.yml` | Provision secrets, databases, R2, Sentry, Hyperdrive | Prefer `scripts/phase-6-orchestrator.mjs`; record run IDs in dashboard |
| App scaffolding | `scaffold-all-apps.yml`, `scaffold-factory-admin.yml`, `scaffold-xico-city.yml`, `scaffold-xpelevator.yml` | Generate app structures after infra is ready | Validate with `scripts/phase-7-validate.js --all` before claiming done |
| Worker deploys | `deploy-admin-studio.yml`, `deploy-schedule-worker.yml`, `deploy-video-cron.yml`, `deploy-synthetic-monitor.yml` | Deploy Cloudflare Workers | After deploy, `curl https://{worker}.adrper79.workers.dev/health` must return `200` |
| Pages/UI deploys | `deploy-admin-studio-ui.yml`, external app workflows | Deploy Pages/static UI | Verify custom domain or Pages URL returns expected HTTP status and expected page marker via `scripts/verify-http-endpoint.mjs` |
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
