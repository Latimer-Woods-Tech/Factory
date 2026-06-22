-- Phase 5B: append-only graph revision approval ledger.
-- Mirrors the lazy DDL in apps/admin-studio/src/lib/graph-store.ts (ensureGraphSchema).
ALTER TABLE capability_graph_revisions
ADD COLUMN IF NOT EXISTS approval_id UUID;

ALTER TABLE capability_graph_revisions
ADD COLUMN IF NOT EXISTS approved_environment TEXT;

UPDATE capability_graph_revisions
SET approved_environment = 'staging'
WHERE approved_environment IS NULL
  AND approved_at IS NOT NULL
  AND approved_by IS NOT NULL;

CREATE TABLE IF NOT EXISTS capability_graph_revision_approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  graph_id UUID NOT NULL REFERENCES capability_graphs(id) ON DELETE CASCADE,
  revision_id UUID NOT NULL REFERENCES capability_graph_revisions(id) ON DELETE CASCADE,
  target_environment TEXT NOT NULL CHECK (target_environment IN ('local', 'staging', 'production')),
  mutation_class TEXT NOT NULL CHECK (mutation_class IN ('graph-revision-publish')),
  summary TEXT NOT NULL,
  approved_by TEXT NOT NULL,
  approved_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ,
  UNIQUE (revision_id, target_environment, mutation_class)
);

INSERT INTO capability_graph_revision_approvals (
  graph_id,
  revision_id,
  target_environment,
  mutation_class,
  summary,
  approved_by,
  approved_at
)
SELECT
  graph_id,
  id,
  approved_environment,
  'graph-revision-publish',
  COALESCE(approval_summary, 'Legacy graph revision approval'),
  approved_by,
  approved_at
FROM capability_graph_revisions
WHERE approval_id IS NULL
  AND approved_environment IS NOT NULL
  AND approved_at IS NOT NULL
  AND approved_by IS NOT NULL
ON CONFLICT (revision_id, target_environment, mutation_class) DO NOTHING;

UPDATE capability_graph_revisions revision
SET approval_id = approval.id
FROM capability_graph_revision_approvals approval
WHERE revision.approval_id IS NULL
  AND approval.revision_id = revision.id
  AND approval.target_environment = revision.approved_environment
  AND approval.mutation_class = 'graph-revision-publish';

CREATE INDEX IF NOT EXISTS idx_capability_graph_revision_approvals_revision
  ON capability_graph_revision_approvals (revision_id, approved_at DESC);
