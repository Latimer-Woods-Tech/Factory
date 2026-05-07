-- factory-supervisor SUP-4 — template quality tracking
-- llm_ledger lives in the LLM_LEDGER D1 binding, managed by @latimer-woods-tech/llm-meter.

CREATE TABLE IF NOT EXISTS template_stats (
  template_id      TEXT    NOT NULL,
  template_version INTEGER NOT NULL DEFAULT 1,
  runs_attempted   INTEGER NOT NULL DEFAULT 0,
  runs_merged      INTEGER NOT NULL DEFAULT 0,
  runs_reverted    INTEGER NOT NULL DEFAULT 0,
  -- blessed_at: epoch ms when template crossed blessed threshold (3 merged, 0 reverts)
  blessed_at       INTEGER,
  -- demoted_at: epoch ms when revert_rate > 20% triggered demotion
  demoted_at       INTEGER,
  last_run_at      INTEGER,
  PRIMARY KEY (template_id, template_version)
);
