-- Phase 5B: optimistic concurrency metadata for capability graph documents.
-- Mirrors the lazy DDL in apps/admin-studio/src/lib/graph-store.ts (ensureGraphSchema).
ALTER TABLE capability_graphs
ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;
