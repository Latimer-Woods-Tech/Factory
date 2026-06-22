-- Phase 5B: pin graph-authored handoffs to immutable graph revisions.
-- Mirrors the lazy DDL in apps/admin-studio/src/lib/handoff-store.ts (ensureSchema).
ALTER TABLE capability_handoffs
ADD COLUMN IF NOT EXISTS source_graph JSONB;
