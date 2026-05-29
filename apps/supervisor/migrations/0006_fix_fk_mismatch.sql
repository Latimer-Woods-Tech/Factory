-- factory-supervisor SUP-4 — fix foreign key mismatch in supervisor_runs and supervisor_steps
--
-- Problem: supervisor_runs and supervisor_steps both referenced template_stats(template_id),
-- but template_stats has a composite PK (template_id, template_version). SQLite requires
-- a FK to reference a column that is a PK or has a UNIQUE constraint on its own.
-- This caused SQLITE_ERROR on every INSERT into supervisor_runs.
--
-- Fix: recreate both tables without the invalid FK constraints.

-- Recreate supervisor_runs without the bad FK
CREATE TABLE IF NOT EXISTS supervisor_runs_new (
  id TEXT PRIMARY KEY,
  template_id TEXT NOT NULL,
  template_version INTEGER NOT NULL DEFAULT 1,
  description TEXT NOT NULL,
  source TEXT NOT NULL,
  status TEXT NOT NULL,
  dry_run INTEGER NOT NULL DEFAULT 0,
  started_at INTEGER NOT NULL,
  finished_at INTEGER,
  pr_url TEXT,
  pr_opened_at INTEGER,
  pr_open_error TEXT
);

INSERT OR IGNORE INTO supervisor_runs_new
  SELECT id, template_id, template_version, description, source, status, dry_run, started_at, finished_at, pr_url, pr_opened_at, pr_open_error
  FROM supervisor_runs;

DROP TABLE supervisor_runs;
ALTER TABLE supervisor_runs_new RENAME TO supervisor_runs;

CREATE INDEX IF NOT EXISTS ix_runs_template ON supervisor_runs(template_id, template_version);
CREATE INDEX IF NOT EXISTS ix_runs_status ON supervisor_runs(status, started_at DESC);
CREATE INDEX IF NOT EXISTS ix_runs_started ON supervisor_runs(started_at DESC);

-- Recreate supervisor_steps without the bad FK
CREATE TABLE IF NOT EXISTS supervisor_steps_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id TEXT NOT NULL,
  template_id TEXT NOT NULL,
  template_version INTEGER NOT NULL DEFAULT 1,
  step_index INTEGER NOT NULL,
  tool_name TEXT NOT NULL,
  side_effects TEXT NOT NULL,
  slots_json TEXT NOT NULL,
  result_json TEXT NOT NULL,
  jwt_scope TEXT NOT NULL,
  execution_ms INTEGER NOT NULL,
  executed_at INTEGER NOT NULL,
  awaiting_approval TEXT,
  FOREIGN KEY (run_id) REFERENCES supervisor_runs(id)
);

INSERT OR IGNORE INTO supervisor_steps_new
  SELECT id, run_id, template_id, template_version, step_index, tool_name, side_effects, slots_json, result_json, jwt_scope, execution_ms, executed_at, awaiting_approval
  FROM supervisor_steps;

DROP TABLE supervisor_steps;
ALTER TABLE supervisor_steps_new RENAME TO supervisor_steps;

CREATE INDEX IF NOT EXISTS ix_steps_run ON supervisor_steps(run_id, step_index);
CREATE INDEX IF NOT EXISTS ix_steps_template ON supervisor_steps(template_id, template_version);
CREATE INDEX IF NOT EXISTS ix_steps_executed ON supervisor_steps(executed_at DESC);
