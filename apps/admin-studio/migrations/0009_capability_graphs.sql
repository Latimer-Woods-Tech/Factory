-- Phase 5: Capability graph documents for the constrained visual composer.
-- Mirrors the lazy DDL in apps/admin-studio/src/lib/graph-store.ts (ensureGraphSchema).
CREATE TABLE IF NOT EXISTS capability_graphs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  description   TEXT,
  nodes         JSONB NOT NULL DEFAULT '[]'::jsonb,
  edges         JSONB NOT NULL DEFAULT '[]'::jsonb,
  compiled_plan JSONB,
  compiled_at   TIMESTAMPTZ,
  created_by    TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_capability_graphs_created ON capability_graphs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_capability_graphs_author  ON capability_graphs (created_by, created_at DESC);
