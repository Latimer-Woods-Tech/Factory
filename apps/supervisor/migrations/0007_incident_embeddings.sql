-- 0007_incident_embeddings.sql
--
-- RFC-007 Phase 3: provenance ledger for embedded supervisor runs.
--
-- Written by the queue consumer after each successful embed+upsert into
-- supervisor-incidents Vectorize. Allows idempotent backfill (skip runs
-- already in the ledger) and supports re-embed when the model version changes.
--
-- -- ROLLBACK:
-- DROP TABLE IF EXISTS incident_embeddings;

CREATE TABLE IF NOT EXISTS incident_embeddings (
  run_id        TEXT     PRIMARY KEY,       -- FK to supervisor_runs.run_id (informational)
  model_version TEXT     NOT NULL,          -- e.g. "@cf/baai/bge-base-en-v1.5"
  dims          INTEGER  NOT NULL,          -- 768
  embedded_at   INTEGER  NOT NULL           -- Unix epoch ms
);
CREATE INDEX IF NOT EXISTS ix_incident_embeddings_embedded_at
  ON incident_embeddings (embedded_at DESC);
