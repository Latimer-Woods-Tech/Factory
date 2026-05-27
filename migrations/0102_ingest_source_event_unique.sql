-- Migration: Race-safe idempotency backstop for factory_events_ingest
-- Date: 2026-05-26
-- Neon project: THE_FACTORY (morning-dust-88304389)
-- Purpose: Add a partial unique index on (source_system, source_event_id) so the
--          two-step ingest dedup is enforced at the database level. Without this,
--          the route-level check-then-insert is a TOCTOU race: two concurrent
--          requests carrying the same source_event_id both pass the existence
--          lookup, then both insert, producing duplicate rows in the append-only
--          ledger (FRIDGE rule_6_single_writer; flagged on merged PR #1041).
--
--          The index is PARTIAL (WHERE source_event_id IS NOT NULL) because
--          source_event_id is nullable and many rows legitimately carry NULL —
--          those rows must continue to coexist freely.
--
-- OPERATOR CAVEAT:
--   CREATE UNIQUE INDEX fails if duplicate (source_system, source_event_id) rows
--   already exist. These are new Phase-A tables (created in 0101) with effectively
--   no production data, so this is acceptable here. If a future backfill changes
--   that, dedup the pre-existing rows before applying.
--
-- ROLLBACK:
--   DROP INDEX IF EXISTS ux_events_source_event_id;
--
-- NOTE for future operators on populated tables: the non-CONCURRENT form used
-- above takes an exclusive lock for the full index build. For a table with live
-- traffic, prefer:
--   CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS ux_events_source_event_id
--     ON factory_events_ingest (source_system, source_event_id)
--     WHERE source_event_id IS NOT NULL;
-- (CONCURRENTLY cannot be used inside a transaction block.)

CREATE UNIQUE INDEX IF NOT EXISTS ux_events_source_event_id
  ON factory_events_ingest (source_system, source_event_id)
  WHERE source_event_id IS NOT NULL;
