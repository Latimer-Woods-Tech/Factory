-- @latimer-woods-tech/llm-meter 0.2.0 — per-tenant monthly budget guardrails
-- Apply via: wrangler d1 execute <DB> --file=node_modules/@latimer-woods-tech/llm-meter/migrations/0002_tenant_budget.sql

-- Add tenant_id to the ledger so spend can be aggregated per tenant
ALTER TABLE llm_ledger ADD COLUMN tenant_id TEXT;

CREATE INDEX IF NOT EXISTS ix_llm_ledger_tenant_month ON llm_ledger(tenant_id, yyyy_mm)
  WHERE tenant_id IS NOT NULL;

-- Optional alert log — records each time a warning threshold is crossed so
-- admin dashboards can surface 80 %+ tenants without re-aggregating the ledger
CREATE TABLE IF NOT EXISTS tenant_budget_warnings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id TEXT NOT NULL,
  tier TEXT NOT NULL,             -- free | individual | practitioner | agency
  event TEXT NOT NULL,            -- BUDGET_WARNING (90%) | BUDGET_ALERT (80%)
  spent_cents INTEGER NOT NULL,
  cap_cents INTEGER NOT NULL,
  percent_used INTEGER NOT NULL,
  yyyy_mm TEXT NOT NULL,
  at INTEGER NOT NULL             -- Unix ms timestamp
);

CREATE INDEX IF NOT EXISTS ix_tbw_tenant_month ON tenant_budget_warnings(tenant_id, yyyy_mm);
