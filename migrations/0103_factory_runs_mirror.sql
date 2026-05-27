-- Migration: Create factory_runs_mirror table for supervisor D1→Neon mirroring
-- Date: 2026-05-26
-- Neon project: THE_FACTORY (morning-dust-88304389)
-- Purpose: Provides a Postgres read-layer mirror of supervisor_runs from D1
--          so the admin read layer can run cross-table queries with factory_gates
--          and factory_artifacts. Written by the supervisor-mirror cron Worker (P1.8)
--          via idempotent upsert every 5 minutes.
--
-- OPERATOR CAVEAT:
--   This table must be populated by the supervisor-mirror Worker before any
--   cross-table queries in the admin UI can return results. Initial data will
--   appear within 5 minutes of deploying the Worker.
--
-- ROLLBACK:
--   DROP TABLE IF EXISTS factory_runs_mirror;

CREATE TABLE IF NOT EXISTS factory_runs_mirror (
  id UUID PRIMARY KEY,
  template_id TEXT NOT NULL,
  template_version INTEGER NOT NULL DEFAULT 1,
  description TEXT NOT NULL,
  source TEXT NOT NULL,
  status TEXT NOT NULL,
  dry_run BOOLEAN NOT NULL DEFAULT false,
  pr_url TEXT,
  started_at TIMESTAMPTZ NOT NULL,
  finished_at TIMESTAMPTZ,
  mirrored_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_runs_mirror_template
  ON factory_runs_mirror (template_id, started_at DESC);

CREATE INDEX IF NOT EXISTS ix_runs_mirror_status
  ON factory_runs_mirror (status, started_at DESC);
