-- Phase 5B: explicit published revision heads for graph compile and handoff.
-- Mirrors the lazy DDL in apps/admin-studio/src/lib/graph-store.ts (ensureGraphSchema).
ALTER TABLE capability_graphs
ADD COLUMN IF NOT EXISTS published_revision_id UUID;

ALTER TABLE capability_graphs
ADD COLUMN IF NOT EXISTS published_revision_number INTEGER;

ALTER TABLE capability_graphs
ADD COLUMN IF NOT EXISTS published_revision_hash TEXT;

ALTER TABLE capability_graph_revisions
ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ;

ALTER TABLE capability_graph_revisions
ADD COLUMN IF NOT EXISTS published_by TEXT;
