#!/usr/bin/env node
/**
 * provision-supervisor-d1.mjs
 *
 * Documents the one-time steps to provision the two D1 databases required by
 * the factory-supervisor worker, and to apply all migrations.
 *
 * STATUS: The databases listed in apps/supervisor/wrangler.jsonc already have
 * real UUIDs — this script is preserved as a runbook for reprovisioning or
 * disaster recovery.
 *
 * PREREQUISITES
 *   - wrangler authenticated: `npx wrangler login`
 *   - CF_ACCOUNT_ID set in environment (or wrangler.jsonc / .dev.vars)
 *
 * ─── STEP 1: Create the databases ────────────────────────────────────────────
 *
 *   npx wrangler d1 create factory-supervisor-memory
 *   npx wrangler d1 create factory-supervisor-ledger
 *
 * Each command prints output like:
 *
 *   ✅ Successfully created DB 'factory-supervisor-memory'
 *   [[d1_databases]]
 *   binding = "MEMORY"
 *   database_name = "factory-supervisor-memory"
 *   database_id = "<UUID>"
 *
 * Paste the resulting UUIDs into apps/supervisor/wrangler.jsonc:
 *
 *   "d1_databases": [
 *     { "binding": "MEMORY",     "database_name": "factory-supervisor-memory", "database_id": "<UUID-1>" },
 *     { "binding": "LLM_LEDGER", "database_name": "factory-supervisor-ledger", "database_id": "<UUID-2>" }
 *   ]
 *
 * ─── STEP 2: Apply migrations (MEMORY database) ───────────────────────────────
 *
 * All migrations in apps/supervisor/migrations/ are applied in order:
 *
 *   npx wrangler d1 migrations apply factory-supervisor-memory \
 *     --config apps/supervisor/wrangler.jsonc
 *
 * Migrations:
 *   0001_init.sql           — memory, runs, run_steps, locks_audit tables
 *   0002_template_stats.sql — template_stats quality tracking table
 *
 * ─── STEP 3: Apply migrations (LLM_LEDGER database) ──────────────────────────
 *
 * The LLM_LEDGER binding is managed by @latimer-woods-tech/llm-meter.
 * If packages/llm-meter/migrations/ exists, apply with:
 *
 *   npx wrangler d1 migrations apply factory-supervisor-ledger \
 *     --config apps/supervisor/wrangler.jsonc
 *
 * Or if llm-meter ships its DDL as a plain SQL file:
 *
 *   npx wrangler d1 execute factory-supervisor-ledger \
 *     --file packages/llm-meter/migrations/0001_init.sql \
 *     --config apps/supervisor/wrangler.jsonc
 *
 * ─── STEP 4: Verify ───────────────────────────────────────────────────────────
 *
 *   npx wrangler d1 execute factory-supervisor-memory \
 *     --command "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;" \
 *     --config apps/supervisor/wrangler.jsonc
 *
 * Expected tables: locks_audit, memory, run_steps, runs, template_stats
 *
 * ─── STEP 5: Deploy ───────────────────────────────────────────────────────────
 *
 *   cd apps/supervisor && npx wrangler deploy
 *   curl https://factory-supervisor.adrper79.workers.dev/health
 *   # Expected: 200 OK
 *
 * ─── CURRENT DATABASE IDs (provisioned) ──────────────────────────────────────
 *
 *   factory-supervisor-memory:  9463b4a2-06c4-4f6a-b6ac-d6e1cb552bc2
 *   factory-supervisor-ledger:  1033b6bf-d38f-4948-8f3b-0de787c87f6b
 */

console.log(`
factory-supervisor D1 provisioning runbook
===========================================

Both databases are already provisioned:
  factory-supervisor-memory:  9463b4a2-06c4-4f6a-b6ac-d6e1cb552bc2
  factory-supervisor-ledger:  1033b6bf-d38f-4948-8f3b-0de787c87f6b

To apply/re-apply migrations to the MEMORY database:
  npx wrangler d1 migrations apply factory-supervisor-memory --config apps/supervisor/wrangler.jsonc

To verify:
  npx wrangler d1 execute factory-supervisor-memory \\
    --command "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;" \\
    --config apps/supervisor/wrangler.jsonc

See script comments above for full reprovisioning steps.
`);
