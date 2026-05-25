-- Rollback for 0003_supervisor_runs_pr_tracking.sql
-- Removes supervisor_runs and supervisor_steps tables (additive forward migration)

DROP TABLE IF EXISTS supervisor_steps;
DROP TABLE IF EXISTS supervisor_runs;
