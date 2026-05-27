-- Migration: factory_runs_v — supervisor runs enriched with gate + artifact summary
-- Date: 2026-05-26
-- Neon project: THE_FACTORY (morning-dust-88304389)
-- Purpose: Join view for the Command Center "Runs" screen (Admin Build Plan P2.12).
--          Joins factory_runs_mirror with factory_gates_latest (gate counts) and
--          factory_artifacts (latest deploy-url). One row per supervisor run.
--
-- DEPENDENCIES:
--   factory_runs_mirror (0103_factory_runs_mirror.sql)
--   factory_gates_latest (view from 0101_factory_read_layer.sql)
--   factory_artifacts (0101_factory_read_layer.sql)
--
-- ROLLBACK:
--   DROP VIEW IF EXISTS factory_runs_v;

CREATE OR REPLACE VIEW factory_runs_v AS
SELECT
  r.id,
  r.template_id,
  r.template_version,
  r.description,
  r.source,
  r.status,
  r.dry_run,
  r.pr_url,
  r.started_at,
  r.finished_at,
  r.mirrored_at,
  -- Gate aggregate counts (from factory_gates_latest for this run)
  COALESCE(gs.gates_passed,  0) AS gates_passed,
  COALESCE(gs.gates_failed,  0) AS gates_failed,
  COALESCE(gs.gates_pending, 0) AS gates_pending,
  gs.last_gate_observed_at,
  -- Most recent deploy-url artifact URI (null when not yet deployed)
  art.deploy_url
FROM factory_runs_mirror r
-- Gate aggregate per run (using factory_gates_latest to get current state per gate)
LEFT JOIN (
  SELECT
    subject_ref,
    COUNT(*)                           FILTER (WHERE state = 'passed')  AS gates_passed,
    COUNT(*)                           FILTER (WHERE state = 'failed')  AS gates_failed,
    COUNT(*)                           FILTER (WHERE state = 'pending') AS gates_pending,
    MAX(observed_at)                                                     AS last_gate_observed_at
  FROM factory_gates_latest
  WHERE subject_type = 'supervisor-run'
  GROUP BY subject_ref
) gs ON gs.subject_ref = r.id::text
-- Most recent deploy-url artifact for this run
LEFT JOIN (
  SELECT DISTINCT ON (subject_ref)
    subject_ref,
    uri AS deploy_url
  FROM factory_artifacts
  WHERE artifact_type = 'deploy-url'
  ORDER BY subject_ref, created_at DESC
) art ON art.subject_ref = r.id::text;

-- Helpful index hint for run-list queries (latest N runs, any status)
-- The ix_runs_mirror_status index on factory_runs_mirror already serves
-- status-filtered lookups; no additional index needed on the view.
