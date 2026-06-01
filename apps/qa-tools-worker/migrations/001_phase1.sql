-- QA Tools Platform — Phase 1 Schema
-- Tables: qa_tools_runs, qa_tools_results
-- Apply via: psql $NEON_CONNECTION_STRING -f migrations/001_phase1.sql
-- See: docs/architecture/QA_TOOLS_ARCHITECTURE.md §3

-- ---------------------------------------------------------------------------
-- qa_tools_runs — one row per audit execution
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS qa_tools_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Target
  app_id       TEXT NOT NULL,
  environment  TEXT NOT NULL,
  custom_url   TEXT,

  -- Configuration
  test_type    TEXT NOT NULL DEFAULT 'a11y',
  profile      TEXT NOT NULL DEFAULT 'fast',
  test_config  JSONB NOT NULL DEFAULT '{}',

  -- Async dispatch
  started_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  duration_ms  INT,

  -- Retry / flakiness
  attempt_number INT NOT NULL DEFAULT 1,
  max_attempts   INT NOT NULL DEFAULT 2,
  flake_score    NUMERIC(5,2) DEFAULT 0.0,
  parent_run_id  UUID REFERENCES qa_tools_runs(id),

  -- Summary
  status          TEXT NOT NULL DEFAULT 'pending',
  violations_count INT DEFAULT 0,
  passes_count     INT DEFAULT 0,
  warnings_count   INT DEFAULT 0,
  error_message    TEXT,

  -- CI context (null for manual runs)
  ci_context JSONB,

  -- Metadata
  created_by  UUID,
  template_id UUID,
  tags        TEXT[] DEFAULT '{}',

  -- Storage
  r2_prefix         TEXT,
  sentry_issue_id   TEXT,
  github_issue_url  TEXT,

  -- Audit timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT qa_runs_valid_env    CHECK (environment IN ('staging', 'production', 'custom')),
  CONSTRAINT qa_runs_valid_status CHECK (status IN ('pending','running','passed','failed','error','flaky')),
  CONSTRAINT qa_runs_valid_profile CHECK (profile IN ('fast','a11y','performance','full','scenario','custom'))
);

CREATE INDEX IF NOT EXISTS idx_qa_runs_app_created
  ON qa_tools_runs(app_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_qa_runs_environment
  ON qa_tools_runs(app_id, environment, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_qa_runs_status
  ON qa_tools_runs(status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_qa_runs_ci
  ON qa_tools_runs((ci_context->>'pr_number'))
  WHERE ci_context IS NOT NULL;

-- ---------------------------------------------------------------------------
-- qa_tools_results — individual findings per run (violations, passes, etc.)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS qa_tools_results (
  id     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES qa_tools_runs(id) ON DELETE CASCADE,

  -- Source
  category TEXT NOT NULL,

  -- Finding (normalized shape — see Appendix E of architecture doc)
  violation_id    TEXT,
  severity        TEXT NOT NULL DEFAULT 'info',
  title           TEXT NOT NULL DEFAULT '',
  description     TEXT,
  remediation_hint TEXT,

  -- Location evidence
  html_snippet   TEXT,
  selector       TEXT,
  url            TEXT,
  affected_nodes INT DEFAULT 1,

  -- Screenshots
  screenshot_key      TEXT,
  screenshot_diff_key TEXT,

  -- Visual regression
  is_regression    BOOLEAN NOT NULL DEFAULT FALSE,
  baseline_id      UUID REFERENCES qa_tools_runs(id),
  similarity_score NUMERIC(5,4),
  diff_pixel_count INT,

  -- Custom assertion
  assertion_name     TEXT,
  assertion_passed   BOOLEAN,
  assertion_actual   TEXT,
  assertion_expected TEXT,

  -- Tracking
  status           TEXT NOT NULL DEFAULT 'open',
  acknowledged_by  UUID,
  acknowledged_at  TIMESTAMPTZ,

  -- Audit
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT qa_results_valid_severity CHECK (
    severity IN ('critical','serious','moderate','minor','info','pass')
  ),
  CONSTRAINT qa_results_valid_status CHECK (
    status IN ('open','acknowledged','fixed','false-positive')
  )
);

CREATE INDEX IF NOT EXISTS idx_qa_results_run
  ON qa_tools_results(run_id);

CREATE INDEX IF NOT EXISTS idx_qa_results_severity
  ON qa_tools_results(run_id, severity);

CREATE INDEX IF NOT EXISTS idx_qa_results_regression
  ON qa_tools_results(baseline_id, is_regression)
  WHERE is_regression = TRUE;

-- ---------------------------------------------------------------------------
-- updated_at trigger for qa_tools_runs
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION qa_tools_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS qa_tools_runs_updated_at ON qa_tools_runs;
CREATE TRIGGER qa_tools_runs_updated_at
  BEFORE UPDATE ON qa_tools_runs
  FOR EACH ROW EXECUTE FUNCTION qa_tools_set_updated_at();
