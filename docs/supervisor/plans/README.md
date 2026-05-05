# Supervisor plan templates

YAML templates that drive autonomous execution. See `../TEMPLATE_SPEC.md` for schema.

## Current templates

| slug | tier | purpose |
|---|---|---|
| `docs-naming-convention` | green | Docs-only PRs matching `^docs[(:]` pattern |
| `deps-bump-minor-patch` | green | Dependabot/Renovate minor+patch bumps; auto-merge on green CI |
| `governance-hardening-tweak` | green | Small governance/hardening additions — workflow tweaks, label additions, README edits, CODEOWNERS updates, branch-policy docs |
| `db-migration-gap-fix` | yellow | "column X does not exist" class — diagnoses drift, files runbook comment (never writes prod DB) |
| `sentry-triage-new-issue` | yellow | New Sentry error class investigation; diagnoses + proposes fix PR if <5 lines |
| `wrangler-config-drift-fix` | yellow | Stale wrangler.jsonc bindings — validates against Cloudflare then opens fix PR |
| `reusable-workflow-rollout` | yellow | Replace bespoke app workflow with factory reusable caller |

Fixtures live at `tests/supervisor/fixtures/<slug>.yml`. `template-suite.yml` workflow will match + parameterize + gate each template against its fixture on every PR (ships separately).

## Adding a template

Follow playbook §12 in `docs/architecture/FACTORY_V1.md`. Start from a real closed issue, not imagination.
