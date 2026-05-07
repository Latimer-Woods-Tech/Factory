# Supervisor plan templates

YAML templates that drive autonomous execution. See `../TEMPLATE_SPEC.md` for schema.

## Current templates

| slug | tier | purpose |
|---|---|---|
| `docs-naming-convention` | green | Docs-only PRs matching `^docs[(:]` pattern |
| `deps-bump-minor-patch` | green | Dependabot/Renovate minor+patch bumps; auto-merge on green CI |
| `governance-hardening-tweak` | green | Small governance/hardening additions — workflow tweaks, label additions, README edits, CODEOWNERS updates, branch-policy docs |
| `db-migration-gap-fix` | yellow | "column X does not exist" class — diagnoses drift, files runbook comment (never writes prod DB) |
| `migration-drift-fix` | yellow | Drizzle schema drift detection; runs `drizzle-kit diff` against main branch |
| `sentry-triage-new-issue` | yellow | New Sentry error class investigation; diagnoses + proposes fix PR if <5 lines |
| `sentry-stripe-error-triage` | yellow | Stripe-related Sentry errors; triages webhook/API response failures |
| `wrangler-config-drift-fix` | yellow | Stale wrangler.jsonc bindings — validates against Cloudflare then opens fix PR |
| `reusable-workflow-rollout` | yellow | Replace bespoke app workflow with factory reusable caller |
| `feat-ci-workflow` | yellow | New GitHub Actions workflow proposal; generates from template + validates syntax |
| `security-codeql-fix` | red | CodeQL findings — proposes fixes for SQL injection / XSS / auth bypass |
| `package-version-migration` | yellow | Package version bump automation; updates all consumers in lockstep |
| `syn-package-migration` | yellow | Synthetic package update test; validates ecosystem compatibility before rollout |
| `user-account-suspend` | red | User account suspension (bot/spam/terms); locks sessions + notifies audit system |
| `ux-regression-triage` | yellow | Visual regression detection; compares Playwright baseline snapshots + files PR if diff >5% |
| `worker-health-degraded` | red | Worker health check failure; dispatches to PagerDuty + posts triage dashboard link |

Fixtures live at `tests/supervisor/fixtures/<slug>.yml`. `template-suite.yml` workflow will match + parameterize + gate each template against its fixture on every PR (ships separately).

## Adding a template

Follow playbook §12 in `docs/architecture/FACTORY_V1.md`. Start from a real closed issue, not imagination.
