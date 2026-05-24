# Platform Conformance — Shadow Mode

*Generated: 2026-05-24 (UTC). Stage 1 shadow — scores are advisory, not enforced.*

## Cohesion summary

| Repo | Cohesion | Stack (10) | Code patterns (15) | Tests (15) | Observability (10) | Security (15) | Schema (5) | Workflows (10) | Release (5) | Performance (10) | Privacy (5) |
|------|---------:|-----:|-----:|-----:|-----:|-----:|-----:|-----:|-----:|-----:|-----:|
| HumanDesign | **50** | 40 | 0 | 100 | 40 | 80 | 33 | 33 | 67 | 67 | 0 |
| capricast | **37** | 20 | 20 | 40 | 40 | 60 | 0 | 33 | 33 | 67 | 33 |
| factory-admin-studio | **57** | 60 | 80 | 20 | 40 | 80 | 67 | 33 | 67 | 100 | 0 |
| cypher-healing | **37** | 60 | 80 | 60 | 0 | 20 | 33 | 33 | 33 | 0 | 0 |
| xico-city | **52** | 80 | 80 | 60 | 0 | 40 | 67 | 33 | 33 | 67 | 33 |

**Shadow threshold:** 70. Below this would block deploys once Stage 4 ships.

## HumanDesign — 50/100

### Stack — 40/100 (weight 10)
- ❌ wrangler.jsonc present
- ✅ ESM ('type': 'module')
- ❌ Hono in deps
- ❌ No node:crypto imports
- ✅ No Express

### Code patterns — 0/100 (weight 15)
- ❌ @latimer-woods-tech/logger in deps
- ❌ @latimer-woods-tech/errors in deps
- ❌ @latimer-woods-tech/monitoring in deps
- ❌ No console.log in src/
- ❌ Typed Env bindings

### Tests — 100/100 (weight 15)
- ✅ vitest.config present
- ✅ playwright.config present
- ✅ tests/ or test/ dir present
- ✅ Smoke tier present
- ✅ Coverage thresholds set

### Observability — 40/100 (weight 10)
- ❌ Sentry import
- ❌ @lwt/monitoring consumed
- ✅ Sourcemap upload step
- ✅ SLO doc present
- ❌ Structured log fields

### Security — 80/100 (weight 15)
- ✅ CodeQL workflow present
- ✅ npm audit step in CI
- ✅ No NPM_TOKEN in workflows
- ❌ Trusted Publishers (OIDC)
- ✅ Renovate config present

### Schema — 33/100 (weight 5)
- ✅ Migrations directory present
- ❌ ROLLBACK block in sample
- ❌ Numbered file naming

### Workflows — 33/100 (weight 10)
- ❌ ≤5 workflow files
- ❌ Uses _app-ci reusable
- ✅ CODEOWNERS present

### Release — 67/100 (weight 5)
- ✅ CHANGELOG.md present
- ✅ Semver version (n.n.n)
- ❌ ADR directory present

### Performance — 67/100 (weight 10)
- ✅ p95 budgets declared
- ❌ Canary or post-deploy verify
- ✅ Synthetic / smoke workflow

### Privacy — 0/100 (weight 5)
- ❌ PII_INVENTORY.md present
- ❌ Retention policy doc present
- ❌ DSR endpoint hints (export + delete)

## capricast — 37/100

### Stack — 20/100 (weight 10)
- ❌ wrangler.jsonc present
- ❌ ESM ('type': 'module')
- ❌ Hono in deps
- ❌ No node:crypto imports
- ✅ No Express

### Code patterns — 20/100 (weight 15)
- ❌ @latimer-woods-tech/logger in deps
- ❌ @latimer-woods-tech/errors in deps
- ❌ @latimer-woods-tech/monitoring in deps
- ✅ No console.log in src/
- ❌ Typed Env bindings

### Tests — 40/100 (weight 15)
- ❌ vitest.config present
- ✅ playwright.config present
- ✅ tests/ or test/ dir present
- ❌ Smoke tier present
- ❌ Coverage thresholds set

### Observability — 40/100 (weight 10)
- ❌ Sentry import
- ❌ @lwt/monitoring consumed
- ✅ Sourcemap upload step
- ✅ SLO doc present
- ❌ Structured log fields

### Security — 60/100 (weight 15)
- ✅ CodeQL workflow present
- ❌ npm audit step in CI
- ✅ No NPM_TOKEN in workflows
- ❌ Trusted Publishers (OIDC)
- ✅ Renovate config present

### Schema — 0/100 (weight 5)
- ❌ Migrations directory present
- ❌ ROLLBACK block in sample
- ❌ Numbered file naming

### Workflows — 33/100 (weight 10)
- ❌ ≤5 workflow files
- ❌ Uses _app-ci reusable
- ✅ CODEOWNERS present

### Release — 33/100 (weight 5)
- ✅ CHANGELOG.md present
- ❌ Semver version (n.n.n)
- ❌ ADR directory present

### Performance — 67/100 (weight 10)
- ✅ p95 budgets declared
- ✅ Canary or post-deploy verify
- ❌ Synthetic / smoke workflow

### Privacy — 33/100 (weight 5)
- ✅ PII_INVENTORY.md present
- ❌ Retention policy doc present
- ❌ DSR endpoint hints (export + delete)

## factory-admin-studio — 57/100

### Stack — 60/100 (weight 10)
- ❌ wrangler.jsonc present
- ✅ ESM ('type': 'module')
- ✅ Hono in deps
- ❌ No node:crypto imports
- ✅ No Express

### Code patterns — 80/100 (weight 15)
- ✅ @latimer-woods-tech/logger in deps
- ✅ @latimer-woods-tech/errors in deps
- ✅ @latimer-woods-tech/monitoring in deps
- ✅ No console.log in src/
- ❌ Typed Env bindings

### Tests — 20/100 (weight 15)
- ❌ vitest.config present
- ❌ playwright.config present
- ✅ tests/ or test/ dir present
- ❌ Smoke tier present
- ❌ Coverage thresholds set

### Observability — 40/100 (weight 10)
- ❌ Sentry import
- ❌ @lwt/monitoring consumed
- ✅ Sourcemap upload step
- ✅ SLO doc present
- ❌ Structured log fields

### Security — 80/100 (weight 15)
- ✅ CodeQL workflow present
- ❌ npm audit step in CI
- ✅ No NPM_TOKEN in workflows
- ✅ Trusted Publishers (OIDC)
- ✅ Renovate config present

### Schema — 67/100 (weight 5)
- ✅ Migrations directory present
- ❌ ROLLBACK block in sample
- ✅ Numbered file naming

### Workflows — 33/100 (weight 10)
- ❌ ≤5 workflow files
- ❌ Uses _app-ci reusable
- ✅ CODEOWNERS present

### Release — 67/100 (weight 5)
- ❌ CHANGELOG.md present
- ✅ Semver version (n.n.n)
- ✅ ADR directory present

### Performance — 100/100 (weight 10)
- ✅ p95 budgets declared
- ✅ Canary or post-deploy verify
- ✅ Synthetic / smoke workflow

### Privacy — 0/100 (weight 5)
- ❌ PII_INVENTORY.md present
- ❌ Retention policy doc present
- ❌ DSR endpoint hints (export + delete)

## cypher-healing — 37/100

### Stack — 60/100 (weight 10)
- ✅ wrangler.jsonc present
- ❌ ESM ('type': 'module')
- ✅ Hono in deps
- ❌ No node:crypto imports
- ✅ No Express

### Code patterns — 80/100 (weight 15)
- ✅ @latimer-woods-tech/logger in deps
- ✅ @latimer-woods-tech/errors in deps
- ✅ @latimer-woods-tech/monitoring in deps
- ✅ No console.log in src/
- ❌ Typed Env bindings

### Tests — 60/100 (weight 15)
- ✅ vitest.config present
- ❌ playwright.config present
- ✅ tests/ or test/ dir present
- ❌ Smoke tier present
- ✅ Coverage thresholds set

### Observability — 0/100 (weight 10)
- ❌ Sentry import
- ❌ @lwt/monitoring consumed
- ❌ Sourcemap upload step
- ❌ SLO doc present
- ❌ Structured log fields

### Security — 20/100 (weight 15)
- ❌ CodeQL workflow present
- ❌ npm audit step in CI
- ✅ No NPM_TOKEN in workflows
- ❌ Trusted Publishers (OIDC)
- ❌ Renovate config present

### Schema — 33/100 (weight 5)
- ✅ Migrations directory present
- ❌ ROLLBACK block in sample
- ❌ Numbered file naming

### Workflows — 33/100 (weight 10)
- ✅ ≤5 workflow files
- ❌ Uses _app-ci reusable
- ❌ CODEOWNERS present

### Release — 33/100 (weight 5)
- ❌ CHANGELOG.md present
- ✅ Semver version (n.n.n)
- ❌ ADR directory present

### Performance — 0/100 (weight 10)
- ❌ p95 budgets declared
- ❌ Canary or post-deploy verify
- ❌ Synthetic / smoke workflow

### Privacy — 0/100 (weight 5)
- ❌ PII_INVENTORY.md present
- ❌ Retention policy doc present
- ❌ DSR endpoint hints (export + delete)

## xico-city — 52/100

### Stack — 80/100 (weight 10)
- ✅ wrangler.jsonc present
- ✅ ESM ('type': 'module')
- ✅ Hono in deps
- ❌ No node:crypto imports
- ✅ No Express

### Code patterns — 80/100 (weight 15)
- ✅ @latimer-woods-tech/logger in deps
- ✅ @latimer-woods-tech/errors in deps
- ✅ @latimer-woods-tech/monitoring in deps
- ✅ No console.log in src/
- ❌ Typed Env bindings

### Tests — 60/100 (weight 15)
- ✅ vitest.config present
- ❌ playwright.config present
- ✅ tests/ or test/ dir present
- ❌ Smoke tier present
- ✅ Coverage thresholds set

### Observability — 0/100 (weight 10)
- ❌ Sentry import
- ❌ @lwt/monitoring consumed
- ❌ Sourcemap upload step
- ❌ SLO doc present
- ❌ Structured log fields

### Security — 40/100 (weight 15)
- ❌ CodeQL workflow present
- ❌ npm audit step in CI
- ✅ No NPM_TOKEN in workflows
- ❌ Trusted Publishers (OIDC)
- ✅ Renovate config present

### Schema — 67/100 (weight 5)
- ✅ Migrations directory present
- ❌ ROLLBACK block in sample
- ✅ Numbered file naming

### Workflows — 33/100 (weight 10)
- ❌ ≤5 workflow files
- ❌ Uses _app-ci reusable
- ✅ CODEOWNERS present

### Release — 33/100 (weight 5)
- ❌ CHANGELOG.md present
- ✅ Semver version (n.n.n)
- ❌ ADR directory present

### Performance — 67/100 (weight 10)
- ❌ p95 budgets declared
- ✅ Canary or post-deploy verify
- ✅ Synthetic / smoke workflow

### Privacy — 33/100 (weight 5)
- ❌ PII_INVENTORY.md present
- ✅ Retention policy doc present
- ❌ DSR endpoint hints (export + delete)
