-- 0008_insights.sql
--
-- RFC-008 Phase 2: REFLECT — generated insights from factory-memory.
--
-- Written by the REFLECT job (supervisor nightly cron) after querying
-- factory-memory Vectorize and synthesizing with an LLM.
-- Read by the EXPRESS step (Phase 3) via GET /insights.
--
-- evidence_ids stored as JSON array of Vectorize vector IDs — every insight
-- must reference at least one ID (anti-hallucination gate enforced at gen time).
--
-- -- ROLLBACK:
-- DROP TABLE IF EXISTS supervisor_insights;

CREATE TABLE IF NOT EXISTS supervisor_insights (
  id              TEXT     PRIMARY KEY,        -- UUID
  created_at      INTEGER  NOT NULL,           -- Unix epoch ms
  time_window     TEXT     NOT NULL CHECK (time_window IN ('24h', '7d')),
  kind            TEXT     NOT NULL CHECK (kind IN (
                    'pattern', 'contradiction', 'root-cause', 'drift', 'risk', 'opportunity'
                  )),
  statement       TEXT     NOT NULL,           -- one-sentence insight claim
  evidence_ids    TEXT     NOT NULL,           -- JSON array of factory-memory vector IDs
  confidence      REAL     NOT NULL CHECK (confidence BETWEEN 0 AND 1),
  surfaced_at     INTEGER,                     -- epoch ms; NULL = shadow mode / not yet surfaced
  feedback        TEXT     CHECK (feedback IN ('useful', 'noise', 'wrong')),
  feedback_at     INTEGER,
  reflect_run_id  TEXT     NOT NULL            -- groups all insights from one REFLECT pass
);

CREATE INDEX IF NOT EXISTS ix_si_created      ON supervisor_insights (created_at DESC);
CREATE INDEX IF NOT EXISTS ix_si_kind         ON supervisor_insights (kind);
CREATE INDEX IF NOT EXISTS ix_si_window       ON supervisor_insights (time_window);
CREATE INDEX IF NOT EXISTS ix_si_run          ON supervisor_insights (reflect_run_id);
CREATE INDEX IF NOT EXISTS ix_si_surfaced     ON supervisor_insights (surfaced_at DESC)
  WHERE surfaced_at IS NOT NULL;
