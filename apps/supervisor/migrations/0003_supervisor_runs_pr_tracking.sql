-- factory-supervisor SUP-4 — run tracking and PR opening integration

-- supervisor_runs table: tracks each execution (post-parameterization)
CREATE TABLE IF NOT EXISTS supervisor_runs (
  id TEXT PRIMARY KEY,
  template_id TEXT NOT NULL,
  template_version INTEGER NOT NULL DEFAULT 1,
  description TEXT NOT NULL,
  source TEXT NOT NULL,              -- github:issue | webhook | scheduled | human
  status TEXT NOT NULL,              -- planned | running | passed | failed_verification | failed_execution
  dry_run INTEGER NOT NULL DEFAULT 0, -- boolean: 1 = dry run, 0 = real execution
  started_at INTEGER NOT NULL,
  finished_at INTEGER,
  -- PR opening fields (Team C integration)
  pr_url TEXT,                        -- GitHub PR URL if opened successfully
  pr_opened_at INTEGER,               -- epoch ms when PR was opened
  pr_open_error TEXT,                 -- error message if PR opening failed (graceful)
  FOREIGN KEY (template_id) REFERENCES template_stats(template_id)
);
CREATE INDEX IF NOT EXISTS ix_runs_template ON supervisor_runs(template_id, template_version);
CREATE INDEX IF NOT EXISTS ix_runs_status ON supervisor_runs(status, started_at DESC);
CREATE INDEX IF NOT EXISTS ix_runs_started ON supervisor_runs(started_at DESC);

-- supervisor_steps table: audit log of each step execution within a run
CREATE TABLE IF NOT EXISTS supervisor_steps (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id TEXT NOT NULL,
  template_id TEXT NOT NULL,
  template_version INTEGER NOT NULL DEFAULT 1,
  step_index INTEGER NOT NULL,
  tool_name TEXT NOT NULL,
  side_effects TEXT NOT NULL,        -- none | read-external | write-app | write-external
  slots_json TEXT NOT NULL,          -- parameterized input slots (JSON)
  result_json TEXT NOT NULL,         -- tool result: { ok: boolean, result?, error? } (JSON)
  jwt_scope TEXT NOT NULL,
  execution_ms INTEGER NOT NULL,
  executed_at INTEGER NOT NULL,
  awaiting_approval TEXT,            -- codeowner_confirmation if step halted for approval
  FOREIGN KEY (run_id) REFERENCES supervisor_runs(id),
  FOREIGN KEY (template_id) REFERENCES template_stats(template_id)
);
CREATE INDEX IF NOT EXISTS ix_steps_run ON supervisor_steps(run_id, step_index);
CREATE INDEX IF NOT EXISTS ix_steps_template ON supervisor_steps(template_id, template_version);
CREATE INDEX IF NOT EXISTS ix_steps_executed ON supervisor_steps(executed_at DESC);
