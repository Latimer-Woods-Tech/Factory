# Platform Conformance — Shadow Mode

*Generated: 2026-06-22 (UTC). Stage 1 shadow — scores are advisory, not enforced.*

## Cohesion summary

| Repo | Cohesion | Stack (10) | Code patterns (15) | Tests (15) | Observability (10) | Security (15) | Schema (5) | Workflows (10) | Release (5) | Performance (10) | Privacy (5) |
|------|---------:|-----:|-----:|-----:|-----:|-----:|-----:|-----:|-----:|-----:|-----:|
| HumanDesign | **56** | 40 | 20 | 100 | 40 | 80 | 67 | 33 | 67 | 67 | 25 |
| capricast | **42** | 40 | 20 | 40 | 40 | 60 | 33 | 33 | 33 | 67 | 50 |
| factory-admin-studio | **77** | 60 | 80 | 100 | 80 | 60 | 100 | 33 | 67 | 100 | 100 |
| cypher-healing | **40** | 60 | 60 | 60 | 0 | 40 | 67 | 33 | 33 | 0 | 25 |
| xico-city | **51** | 80 | 80 | 60 | 0 | 20 | 100 | 33 | 33 | 67 | 50 |
| focusbro | **18** | 40 | 20 | 0 | 0 | 20 | 33 | 33 | 33 | 0 | 25 |
| ijustus | **44** | 80 | 80 | 40 | 0 | 20 | 100 | 67 | 33 | 0 | 25 |
| kairoscouncil | **27** | 20 | 20 | 40 | 0 | 20 | 33 | 67 | 67 | 0 | 25 |
| neighbor-aid | **44** | 80 | 80 | 40 | 0 | 20 | 100 | 67 | 33 | 0 | 25 |
| the-calling | **44** | 80 | 80 | 40 | 0 | 20 | 100 | 67 | 33 | 0 | 25 |
| xpelevator | **45** | 80 | 80 | 40 | 0 | 40 | 67 | 67 | 33 | 0 | 25 |
| wordis-bond | **59** | 80 | 80 | 100 | 0 | 40 | 100 | 67 | 33 | 33 | 25 |

**Shadow threshold:** 70. Below this would block deploys once Stage 4 ships.

## HumanDesign — 56/100

### Stack — 40/100 (weight 10)
- ❌ wrangler.jsonc present
- ✅ ESM ('type': 'module')
- ❌ Hono in deps
- ❌ No node:crypto imports
- ✅ No Express

### Code patterns — 20/100 (weight 15)
- ❌ @latimer-woods-tech/logger in deps
- ❌ @latimer-woods-tech/errors in deps
- ❌ @latimer-woods-tech/monitoring in deps
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

### Security — 80/100 (weight 15)
- ✅ CodeQL workflow present
- ✅ npm audit step in CI
- ✅ No NPM_TOKEN in workflows
- ❌ Trusted Publishers (OIDC)
- ✅ Renovate config present

### Schema — 67/100 (weight 5)
- ✅ Migrations directory present
- ✅ ROLLBACK block enforced — WARN: 14 existing migration(s) missing -- ROLLBACK: block (debt — not blocking): migrations/20260401_create_tier_schema.sql, migrations/20260401_insert_tier_data.sql, migrations/20260603_rls_app_role.sql, migrations/20260603_rls_defn_lookups.sql, migrations/20260603_rls_policies.sql, migrations/20260603_rls_policies_crossuser.sql, migrations/20260603_rls_policies_writes.sql, migrations/20260604_add_comped_tier.sql, migrations/20260604_notifications_inbox.sql, migrations/20260610_directory_waitlist.sql, migrations/20260610_light_up_features.sql, migrations/20260610_share_token.sql, migrations/20260617_backfill_diary_dreams.sql, migrations/20260617_curriculum_progress.sql
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

### Privacy — 25/100 (weight 5)
- ❌ PII_INVENTORY.md present
- ❌ Retention policy doc present
- ❌ DSR endpoint hints (export + delete)
- ✅ Migration PII columns documented — WARN: 1 existing migration PII column(s) not documented in PII_INVENTORY.md (debt — not blocking): migrations/20260610_directory_waitlist.sql: email

## capricast — 42/100

### Stack — 40/100 (weight 10)
- ❌ wrangler.jsonc present
- ✅ ESM ('type': 'module')
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

### Schema — 33/100 (weight 5)
- ❌ Migrations directory present
- ✅ ROLLBACK block enforced
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

### Privacy — 50/100 (weight 5)
- ✅ PII_INVENTORY.md present
- ❌ Retention policy doc present
- ❌ DSR endpoint hints (export + delete)
- ✅ Migration PII columns documented

## factory-admin-studio — 77/100

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

### Observability — 80/100 (weight 10)
- ❌ Sentry import
- ✅ @lwt/monitoring consumed
- ✅ Sourcemap upload step
- ✅ SLO doc present
- ✅ Structured log fields

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

### Privacy — 100/100 (weight 5)
- ✅ PII_INVENTORY.md present
- ✅ Retention policy doc present
- ✅ DSR endpoint hints (export + delete)
- ✅ Migration PII columns documented

## cypher-healing — 40/100

### Stack — 60/100 (weight 10)
- ✅ wrangler.jsonc present
- ❌ ESM ('type': 'module')
- ✅ Hono in deps
- ❌ No node:crypto imports
- ✅ No Express

### Code patterns — 60/100 (weight 15)
- ✅ @latimer-woods-tech/logger in deps
- ✅ @latimer-woods-tech/errors in deps
- ✅ @latimer-woods-tech/monitoring in deps
- ❌ No console.log in src/
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
- ✅ ROLLBACK block enforced — WARN: 1 existing migration(s) missing -- ROLLBACK: block (debt — not blocking): src/db/migrations/add-product-images.sql
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

## xico-city — 51/100

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

### Security — 20/100 (weight 15)
- ❌ CodeQL workflow present
- ❌ npm audit step in CI
- ✅ No NPM_TOKEN in workflows
- ❌ Trusted Publishers (OIDC)
- ❌ Renovate config present

### Schema — 100/100 (weight 5)
- ✅ Migrations directory present
- ✅ ROLLBACK block enforced — WARN: 16 existing migration(s) missing -- ROLLBACK: block (debt — not blocking): src/db/migrations/0000_smart_titania.down.sql, src/db/migrations/0000_smart_titania.sql, src/db/migrations/0001_rls_policies.down.sql, src/db/migrations/0001_rls_policies.sql, src/db/migrations/0002_burly_luke_cage.down.sql, src/db/migrations/0002_burly_luke_cage.sql, src/db/migrations/0003_betterauth_rls.down.sql, src/db/migrations/0003_betterauth_rls.sql, src/db/migrations/0004_worried_jetstream.down.sql, src/db/migrations/0004_worried_jetstream.sql, src/db/migrations/0005_notifications_rls.down.sql, src/db/migrations/0005_notifications_rls.sql, src/db/migrations/0006_previous_tyger_tiger.down.sql, src/db/migrations/0006_previous_tyger_tiger.sql, src/db/migrations/0007_search_indexes.down.sql, src/db/migrations/0007_search_indexes.sql
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

### Privacy — 50/100 (weight 5)
- ❌ PII_INVENTORY.md present
- ✅ Retention policy doc present
- ❌ DSR endpoint hints (export + delete)
- ✅ Migration PII columns documented — WARN: 7 existing migration PII column(s) not documented in PII_INVENTORY.md (debt — not blocking): src/db/migrations/0000_smart_titania.sql: avatar_r2_key, src/db/migrations/0000_smart_titania.sql: email, src/db/migrations/0000_smart_titania.sql: email_verified, src/db/migrations/0000_smart_titania.sql: ip_address, src/db/migrations/0000_smart_titania.sql: stripe_customer_id, src/db/migrations/0000_smart_titania.sql: user_agent, src/db/migrations/0004_worried_jetstream.sql: emailed_at

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

## neighbor-aid — 44/100

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
- ✅ ROLLBACK block enforced — WARN: 1 existing migration(s) missing -- ROLLBACK: block (debt — not blocking): src/db/migrations/0000_brown_ben_grimm.sql
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
- ✅ Migration PII columns documented — WARN: 1 existing migration PII column(s) not documented in PII_INVENTORY.md (debt — not blocking): src/db/migrations/0000_brown_ben_grimm.sql: avatar_url

## the-calling — 44/100

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
- ✅ ROLLBACK block enforced — WARN: 1 existing migration(s) missing -- ROLLBACK: block (debt — not blocking): src/db/migrations/0000_nice_fenris.sql
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
- ✅ Migration PII columns documented — WARN: 1 existing migration PII column(s) not documented in PII_INVENTORY.md (debt — not blocking): src/db/migrations/0000_nice_fenris.sql: avatar_url

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

## wordis-bond — 59/100

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

### Tests — 100/100 (weight 15)
- ✅ vitest.config present
- ✅ playwright.config present
- ✅ tests/ or test/ dir present
- ✅ Smoke tier present
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

### Schema — 100/100 (weight 5)
- ✅ Migrations directory present
- ✅ ROLLBACK block enforced — WARN: 14 existing migration(s) missing -- ROLLBACK: block (debt — not blocking): src/db/migrations/0000_last_pretty_boy.sql, src/db/migrations/0001_add_prompts_agents_and_calllog_enhancements.sql, src/db/migrations/0002_late_azazel.sql, src/db/migrations/0003_test_account_id_text.sql, src/db/migrations/0004_ivr_flows_prompt_validations.sql, src/db/migrations/0005_survey_definitions_responses.sql, src/db/migrations/0006_test_suites_and_runs.sql, src/db/migrations/0007_did_pool_dialer_sessions.sql, src/db/migrations/0008_normalize_account_id.sql, src/db/migrations/0008_users_auth.sql, src/db/migrations/0009_voice_personas.sql, src/db/migrations/0010_api_keys.sql, src/db/migrations/0011_ab_tests.sql, src/db/migrations/0012_add_fk_indexes.sql
- ✅ Numbered file naming

### Workflows — 67/100 (weight 10)
- ✅ ≤5 workflow files
- ❌ Uses _app-ci reusable
- ✅ CODEOWNERS present

### Release — 33/100 (weight 5)
- ❌ CHANGELOG.md present
- ✅ Semver version (n.n.n)
- ❌ ADR directory present

### Performance — 33/100 (weight 10)
- ❌ p95 budgets declared
- ✅ Canary or post-deploy verify
- ❌ Synthetic / smoke workflow

### Privacy — 25/100 (weight 5)
- ❌ PII_INVENTORY.md present
- ❌ Retention policy doc present
- ❌ DSR endpoint hints (export + delete)
- ✅ Migration PII columns documented — WARN: 8 existing migration PII column(s) not documented in PII_INVENTORY.md (debt — not blocking): src/db/migrations/0000_last_pretty_boy.sql: email, src/db/migrations/0000_last_pretty_boy.sql: first_name, src/db/migrations/0000_last_pretty_boy.sql: last_name, src/db/migrations/0000_last_pretty_boy.sql: phone, src/db/migrations/0004_ivr_flows_prompt_validations.sql: target_phone, src/db/migrations/0005_survey_definitions_responses.sql: respondent_phone, src/db/migrations/0007_did_pool_dialer_sessions.sql: phone_number, src/db/migrations/0008_users_auth.sql: email
