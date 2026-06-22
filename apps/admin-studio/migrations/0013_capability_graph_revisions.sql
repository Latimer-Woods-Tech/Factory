-- Phase 5B: immutable graph revision history for the constrained visual composer.
-- Mirrors the lazy DDL in apps/admin-studio/src/lib/graph-store.ts (ensureGraphSchema).
ALTER TABLE capability_graphs
ADD COLUMN IF NOT EXISTS current_revision_id UUID;

ALTER TABLE capability_graphs
ADD COLUMN IF NOT EXISTS current_revision_number INTEGER;

ALTER TABLE capability_graphs
ADD COLUMN IF NOT EXISTS current_revision_hash TEXT;

CREATE TABLE IF NOT EXISTS capability_graph_revisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  graph_id UUID NOT NULL REFERENCES capability_graphs(id) ON DELETE CASCADE,
  revision_number INTEGER NOT NULL,
  graph_version INTEGER NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  nodes JSONB NOT NULL DEFAULT '[]'::jsonb,
  edges JSONB NOT NULL DEFAULT '[]'::jsonb,
  content_hash TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (graph_id, revision_number),
  UNIQUE (graph_id, graph_version)
);

CREATE INDEX IF NOT EXISTS idx_capability_graph_revisions_graph_created
  ON capability_graph_revisions (graph_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_capability_graph_revisions_graph_revision
  ON capability_graph_revisions (graph_id, revision_number DESC);
