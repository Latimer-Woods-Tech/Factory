# Platform Conformance — Shadow Mode

*Generated: 2026-06-15 (UTC). Stage 1 shadow — scores are advisory, not enforced.*

## Cohesion summary

| Repo | Cohesion | Stack (10) | Code patterns (15) | Tests (15) | Observability (10) | Security (15) | Schema (5) | Workflows (10) | Release (5) | Performance (10) | Privacy (5) |
|------|---------:|-----:|-----:|-----:|-----:|-----:|-----:|-----:|-----:|-----:|-----:|
| HumanDesign | **16** | 40 | 20 | 0 | 0 | 20 | 33 | 33 | 0 | 0 | 25 |
| capricast | **14** | 20 | 20 | 0 | 0 | 20 | 33 | 33 | 0 | 0 | 25 |
| factory-admin-studio | **71** | 60 | 80 | 100 | 40 | 60 | 100 | 33 | 67 | 100 | 75 |
| cypher-healing | **14** | 20 | 20 | 0 | 0 | 20 | 33 | 33 | 0 | 0 | 25 |
| xico-city | **14** | 20 | 20 | 0 | 0 | 20 | 33 | 33 | 0 | 0 | 25 |
| focusbro | **18** | 40 | 20 | 0 | 0 | 20 | 33 | 33 | 33 | 0 | 25 |
| ijustus | **44** | 80 | 80 | 40 | 0 | 20 | 100 | 67 | 33 | 0 | 25 |
| kairoscouncil | **27** | 20 | 20 | 40 | 0 | 20 | 33 | 67 | 67 | 0 | 25 |
| neighbor-aid | **14** | 20 | 20 | 0 | 0 | 20 | 33 | 33 | 0 | 0 | 25 |
| the-calling | **14** | 20 | 20 | 0 | 0 | 20 | 33 | 33 | 0 | 0 | 25 |
| xpelevator | **45** | 80 | 80 | 40 | 0 | 40 | 67 | 67 | 33 | 0 | 25 |
| wordis-bond | **14** | 20 | 20 | 0 | 0 | 20 | 33 | 33 | 0 | 0 | 25 |

**Shadow threshold:** 70. Below this would block deploys once Stage 4 ships.

## HumanDesign — 16/100

### Stack — 40/100 (weight 10)
- ❌ wrangler.jsonc present
- ❌ ESM ('type': 'module')
- ❌ Hono in deps
- ✅ No node:crypto imports
- ✅ No Express

### Code patterns — 20/100 (weight 15)
- ❌ @latimer-woods-tech/logger in deps
- ❌ @latimer-woods-tech/errors in deps
- ❌ @latimer-woods-tech/monitoring in deps
- ✅ No console.log in src/
- ❌ Typed Env bindings

### Tests — 0/100 (weight 15)
- ❌ vitest.config present
- ❌ playwright.config present
- ❌ tests/ or test/ dir present
- ❌ Smoke tier present
- ❌ Coverage thresholds set

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
- ❌ Migrations directory present
- ✅ ROLLBACK block enforced
- ❌ Numbered file naming

### Workflows — 33/100 (weight 10)
- ✅ ≤5 workflow files
- ❌ Uses _app-ci reusable
- ❌ CODEOWNERS present

### Release — 0/100 (weight 5)
- ❌ CHANGELOG.md present
- ❌ Semver version (n.n.n)
- ❌ ADR directory present

### Performance — 0/100 (weight 10)
- ❌ p95 budgets declared
- ❌ Canary or post-deploy verify
- ❌ Synthetic / smoke workflow

### Privacy — 25/100 (weight 5)
- ❌ PII_INVENTORY.md present
- ❌ Retention policy doc present
- ❌ DSR endpoint hints (export + delete)
- ✅ Migration PII columns documented

## capricast — 14/100

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

### Tests — 0/100 (weight 15)
- ❌ vitest.config present
- ❌ playwright.config present
- ❌ tests/ or test/ dir present
- ❌ Smoke tier present
- ❌ Coverage thresholds set

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
- ❌ Migrations directory present
- ✅ ROLLBACK block enforced
- ❌ Numbered file naming

### Workflows — 33/100 (weight 10)
- ✅ ≤5 workflow files
- ❌ Uses _app-ci reusable
- ❌ CODEOWNERS present

### Release — 0/100 (weight 5)
- ❌ CHANGELOG.md present
- ❌ Semver version (n.n.n)
- ❌ ADR directory present

### Performance — 0/100 (weight 10)
- ❌ p95 budgets declared
- ❌ Canary or post-deploy verify
- ❌ Synthetic / smoke workflow

### Privacy — 25/100 (weight 5)
- ❌ PII_INVENTORY.md present
- ❌ Retention policy doc present
- ❌ DSR endpoint hints (export + delete)
- ✅ Migration PII columns documented

## factory-admin-studio — 71/100

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

### Security — 60/100 (weight 15)
- ✅ CodeQL workflow present
- ❌ npm audit step in CI
- ❌ No NPM_TOKEN in workflows
- ✅ Trusted Publishers (OIDC)
- ✅ Renovate config present

### Schema — 100/100 (weight 5)
- ✅ Migrations directory present
- ✅ ROLLBACK block enforced — WARN: 1 existing migration(s) missing -- ROLLBACK: block (debt — not blocking): migrations/0100_studio_entitlements.sql
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

### Privacy — 75/100 (weight 5)
- ✅ PII_INVENTORY.md present
- ✅ Retention policy doc present
- ❌ DSR endpoint hints (export + delete)
- ✅ Migration PII columns documented

## cypher-healing — 14/100

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

### Tests — 0/100 (weight 15)
- ❌ vitest.config present
- ❌ playwright.config present
- ❌ tests/ or test/ dir present
- ❌ Smoke tier present
- ❌ Coverage thresholds set

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
- ❌ Migrations directory present
- ✅ ROLLBACK block enforced
- ❌ Numbered file naming

### Workflows — 33/100 (weight 10)
- ✅ ≤5 workflow files
- ❌ Uses _app-ci reusable
- ❌ CODEOWNERS present

### Release — 0/100 (weight 5)
- ❌ CHANGELOG.md present
- ❌ Semver version (n.n.n)
- ❌ ADR directory present

### Performance — 0/100 (weight 10)
- ❌ p95 budgets declared
- ❌ Canary or post-deploy verify
- ❌ Synthetic / smoke workflow

### Privacy — 25/100 (weight 5)
- ❌ PII_INVENTORY.md present
- ❌ Retention policy doc present
- ❌ DSR endpoint hints (export + delete)
- ✅ Migration PII columns documented

## xico-city — 14/100

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

### Tests — 0/100 (weight 15)
- ❌ vitest.config present
- ❌ playwright.config present
- ❌ tests/ or test/ dir present
- ❌ Smoke tier present
- ❌ Coverage thresholds set

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
- ❌ Migrations directory present
- ✅ ROLLBACK block enforced
- ❌ Numbered file naming

### Workflows — 33/100 (weight 10)
- ✅ ≤5 workflow files
- ❌ Uses _app-ci reusable
- ❌ CODEOWNERS present

### Release — 0/100 (weight 5)
- ❌ CHANGELOG.md present
- ❌ Semver version (n.n.n)
- ❌ ADR directory present

### Performance — 0/100 (weight 10)
- ❌ p95 budgets declared
- ❌ Canary or post-deploy verify
- ❌ Synthetic / smoke workflow

### Privacy — 25/100 (weight 5)
- ❌ PII_INVENTORY.md present
- ❌ Retention policy doc present
- ❌ DSR endpoint hints (export + delete)
- ✅ Migration PII columns documented

## focusbro — 18/100

### Stack — 40/100 (weight 10)
- ✅ wrangler.jsonc present
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

### Tests — 0/100 (weight 15)
- ❌ vitest.config present
- ❌ playwright.config present
- ❌ tests/ or test/ dir present
- ❌ Smoke tier present
- ❌ Coverage thresholds set

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
- ❌ Migrations directory present
- ✅ ROLLBACK block enforced
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

### Privacy — 25/100 (weight 5)
- ❌ PII_INVENTORY.md present
- ❌ Retention policy doc present
- ❌ DSR endpoint hints (export + delete)
- ✅ Migration PII columns documented

## ijustus — 44/100

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

### Tests — 40/100 (weight 15)
- ✅ vitest.config present
- ❌ playwright.config present
- ❌ tests/ or test/ dir present
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
- ❌ No NPM_TOKEN in workflows
- ❌ Trusted Publishers (OIDC)
- ✅ Renovate config present

### Schema — 100/100 (weight 5)
- ✅ Migrations directory present
- ✅ ROLLBACK block enforced — WARN: 1 existing migration(s) missing -- ROLLBACK: block (debt — not blocking): src/db/migrations/0000_gifted_praxagora.sql
- ✅ Numbered file naming

### Workflows — 67/100 (weight 10)
- ✅ ≤5 workflow files
- ❌ Uses _app-ci reusable
- ✅ CODEOWNERS present

### Release — 33/100 (weight 5)
- ❌ CHANGELOG.md present
- ✅ Semver version (n.n.n)
- ❌ ADR directory present

### Performance — 0/100 (weight 10)
- ❌ p95 budgets declared
- ❌ Canary or post-deploy verify
- ❌ Synthetic / smoke workflow

### Privacy — 25/100 (weight 5)
- ❌ PII_INVENTORY.md present
- ❌ Retention policy doc present
- ❌ DSR endpoint hints (export + delete)
- ✅ Migration PII columns documented

## kairoscouncil — 27/100

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
- ✅ vitest.config present
- ❌ playwright.config present
- ❌ tests/ or test/ dir present
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
- ❌ Migrations directory present
- ✅ ROLLBACK block enforced
- ❌ Numbered file naming

### Workflows — 67/100 (weight 10)
- ✅ ≤5 workflow files
- ❌ Uses _app-ci reusable
- ✅ CODEOWNERS present

### Release — 67/100 (weight 5)
- ❌ CHANGELOG.md present
- ✅ Semver version (n.n.n)
- ✅ ADR directory present

### Performance — 0/100 (weight 10)
- ❌ p95 budgets declared
- ❌ Canary or post-deploy verify
- ❌ Synthetic / smoke workflow

### Privacy — 25/100 (weight 5)
- ❌ PII_INVENTORY.md present
- ❌ Retention policy doc present
- ❌ DSR endpoint hints (export + delete)
- ✅ Migration PII columns documented

## neighbor-aid — 14/100

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

### Tests — 0/100 (weight 15)
- ❌ vitest.config present
- ❌ playwright.config present
- ❌ tests/ or test/ dir present
- ❌ Smoke tier present
- ❌ Coverage thresholds set

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
- ❌ Migrations directory present
- ✅ ROLLBACK block enforced
- ❌ Numbered file naming

### Workflows — 33/100 (weight 10)
- ✅ ≤5 workflow files
- ❌ Uses _app-ci reusable
- ❌ CODEOWNERS present

### Release — 0/100 (weight 5)
- ❌ CHANGELOG.md present
- ❌ Semver version (n.n.n)
- ❌ ADR directory present

### Performance — 0/100 (weight 10)
- ❌ p95 budgets declared
- ❌ Canary or post-deploy verify
- ❌ Synthetic / smoke workflow

### Privacy — 25/100 (weight 5)
- ❌ PII_INVENTORY.md present
- ❌ Retention policy doc present
- ❌ DSR endpoint hints (export + delete)
- ✅ Migration PII columns documented

## the-calling — 14/100

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

### Tests — 0/100 (weight 15)
- ❌ vitest.config present
- ❌ playwright.config present
- ❌ tests/ or test/ dir present
- ❌ Smoke tier present
- ❌ Coverage thresholds set

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
- ❌ Migrations directory present
- ✅ ROLLBACK block enforced
- ❌ Numbered file naming

### Workflows — 33/100 (weight 10)
- ✅ ≤5 workflow files
- ❌ Uses _app-ci reusable
- ❌ CODEOWNERS present

### Release — 0/100 (weight 5)
- ❌ CHANGELOG.md present
- ❌ Semver version (n.n.n)
- ❌ ADR directory present

### Performance — 0/100 (weight 10)
- ❌ p95 budgets declared
- ❌ Canary or post-deploy verify
- ❌ Synthetic / smoke workflow

### Privacy — 25/100 (weight 5)
- ❌ PII_INVENTORY.md present
- ❌ Retention policy doc present
- ❌ DSR endpoint hints (export + delete)
- ✅ Migration PII columns documented

## xpelevator — 45/100

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

### Tests — 40/100 (weight 15)
- ✅ vitest.config present
- ❌ playwright.config present
- ❌ tests/ or test/ dir present
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
- ✅ ROLLBACK block enforced
- ❌ Numbered file naming

### Workflows — 67/100 (weight 10)
- ✅ ≤5 workflow files
- ❌ Uses _app-ci reusable
- ✅ CODEOWNERS present

### Release — 33/100 (weight 5)
- ❌ CHANGELOG.md present
- ✅ Semver version (n.n.n)
- ❌ ADR directory present

### Performance — 0/100 (weight 10)
- ❌ p95 budgets declared
- ❌ Canary or post-deploy verify
- ❌ Synthetic / smoke workflow

### Privacy — 25/100 (weight 5)
- ❌ PII_INVENTORY.md present
- ❌ Retention policy doc present
- ❌ DSR endpoint hints (export + delete)
- ✅ Migration PII columns documented

## wordis-bond — 14/100

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

### Tests — 0/100 (weight 15)
- ❌ vitest.config present
- ❌ playwright.config present
- ❌ tests/ or test/ dir present
- ❌ Smoke tier present
- ❌ Coverage thresholds set

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
- ❌ Migrations directory present
- ✅ ROLLBACK block enforced
- ❌ Numbered file naming

### Workflows — 33/100 (weight 10)
- ✅ ≤5 workflow files
- ❌ Uses _app-ci reusable
- ❌ CODEOWNERS present

### Release — 0/100 (weight 5)
- ❌ CHANGELOG.md present
- ❌ Semver version (n.n.n)
- ❌ ADR directory present

### Performance — 0/100 (weight 10)
- ❌ p95 budgets declared
- ❌ Canary or post-deploy verify
- ❌ Synthetic / smoke workflow

### Privacy — 25/100 (weight 5)
- ❌ PII_INVENTORY.md present
- ❌ Retention policy doc present
- ❌ DSR endpoint hints (export + delete)
- ✅ Migration PII columns documented
