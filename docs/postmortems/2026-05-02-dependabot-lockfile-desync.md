# 2026-05-02: Dependabot batch broke admin-studio deploy pipeline

**Severity:** P2  **Duration:** ~1.5 hours  **Impact:** admin-studio deploy blocked

## What happened
Batch-merged 5 Dependabot PRs in one pass. Three compounding failures:
1. `package-lock.json` desync → `npm ci` EUSAGE failures
2. `workers-types` v4 renamed `ScheduledEvent` → `ScheduledController` → TypeScript errors
3. `@latimer-woods-tech/llm@0.3.0` removed `stream` export → additional TS errors

## Root cause
Batch merges don't update lockfiles atomically. `@cloudflare/workers-types` broke APIs in a non-major bump.

## Timeline
- Batch merged → deploy pipeline blocked
- 6 fix PRs (#149–#156) opened and merged sequentially
- admin-studio deployed ~1.5h after initial failure

## What we changed
- `deploy-admin-studio.yml` now uses `npm install --legacy-peer-deps`
- Added batch-merge warning to `dependency-management.md` playbook

## What we're monitoring
Admin-studio deploy success rate. TypeScript errors now surface before deploy.
