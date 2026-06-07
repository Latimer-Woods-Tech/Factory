-- Phase 5B: explicit approval provenance for immutable graph revisions.
-- Mirrors the lazy DDL in apps/admin-studio/src/lib/graph-store.ts (ensureGraphSchema).
ALTER TABLE capability_graph_revisions
ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;

ALTER TABLE capability_graph_revisions
ADD COLUMN IF NOT EXISTS approved_by TEXT;

ALTER TABLE capability_graph_revisions
ADD COLUMN IF NOT EXISTS approval_summary TEXT;
