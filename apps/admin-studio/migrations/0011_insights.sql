-- 0011_insights.sql
--
-- RFC-008 Phase 0: `insights` table for the Reflection Loop.
--
-- Written by the REFLECT job (supervisor nightly/weekly cron) once Phase 2 ships.
-- Read by the EXPRESS step (admin-studio digest/brief) in Phase 3.
-- Feedback column wired in Phase 4 (LEARN).
--
-- Each insight must reference ≥1 evidence memory ID (anti-hallucination gate).
-- Zero-evidence rows are rejected at generation time, not here, but the NOT NULL
-- constraint on `evidence_ids` makes the contract explicit at the schema level.
--
-- -- ROLLBACK:
-- DROP TABLE IF EXISTS insights;

CREATE TABLE IF NOT EXISTS insights (
  id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT now(),

  -- Time window the reflection swept over: '24h' (nightly) | '7d' (weekly)
  window          TEXT          NOT NULL CHECK (window IN ('24h', '7d')),

  -- Semantic kind of the insight
  kind            TEXT          NOT NULL CHECK (kind IN (
                    'pattern', 'contradiction', 'root-cause', 'drift', 'risk', 'opportunity'
                  )),

  -- One-sentence claim surfaced by the reflection pass
  statement       TEXT          NOT NULL,

  -- Array of factory-memory Vectorize IDs that ground the claim.
  -- Anti-hallucination: REFLECT drops any insight with an empty array before writing.
  evidence_ids    TEXT[]        NOT NULL,

  -- Reflection confidence 0–1
  confidence      NUMERIC(4,3)  NOT NULL CHECK (confidence BETWEEN 0 AND 1),

  -- When the insight was first surfaced to the operator (NULL = shadow mode / not yet surfaced)
  surfaced_at     TIMESTAMPTZ,

  -- Operator feedback written by the LEARN step (Phase 4)
  feedback        TEXT          CHECK (feedback IN ('useful', 'noise', 'wrong')),
  feedback_at     TIMESTAMPTZ,

  -- Source tracing
  reflect_run_id  TEXT          NOT NULL  -- ID of the reflection job run that produced this
);

CREATE INDEX IF NOT EXISTS ix_insights_created   ON insights (created_at DESC);
CREATE INDEX IF NOT EXISTS ix_insights_kind      ON insights (kind);
CREATE INDEX IF NOT EXISTS ix_insights_window    ON insights (window);
CREATE INDEX IF NOT EXISTS ix_insights_surfaced  ON insights (surfaced_at DESC NULLS LAST)
  WHERE surfaced_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_insights_feedback  ON insights (feedback)
  WHERE feedback IS NOT NULL;
