/**
 * Phase 5 — Constrained Visual Composer
 *
 * GraphComposerTab: canvas-based visual graph editor for composing capability graphs.
 * Users drag primitive and concept nodes onto a canvas, connect them with edges,
 * compile the graph to a CapabilityPlan, and generate a handoff for staging provision.
 *
 * v1 constraint: one concept node per graph (additional concepts are allowed in palette
 * but only the first concept added counts toward compile rules).
 *
 * No third-party canvas/graph libraries — pure React + SVG + CSS positioning.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { requiredConfirmationTier } from '@latimer-woods-tech/studio-core';
import { apiFetch } from '../../lib/api.js';
import { ConfirmDialog } from '../../components/ConfirmDialog.js';
import { Button } from '../../components/ui/button.js';
import { useSession } from '../../stores/session.js';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface PrimitiveDescriptor {
  id: string;
  displayName: string;
  summary: string;
  maturity: string;
  version?: string;
}

interface ConceptParameter {
  id: string;
  type: string;
  description: string;
  required: boolean;
  default: string | number | boolean | null;
}

interface ConceptSummary {
  id: string;
  displayName: string;
  summary: string;
  maturity: string;
  tags: string[];
  parameters: ConceptParameter[];
}

interface GraphCatalogResponse {
  summary: {
    primitiveCount?: number;
    conceptCount?: number;
    recipeCount?: number;
  };
  concepts: ConceptSummary[];
  primitives: PrimitiveDescriptor[];
}

interface GraphNode {
  id: string;
  nodeType: 'primitive' | 'concept';
  ref: string;
  position: { x: number; y: number };
  params?: Record<string, string | number | boolean>;
  label?: string;
}

interface GraphEdge {
  id: string;
  sourceNodeId: string;
  targetNodeId: string;
  label?: string;
}

interface GraphDocument {
  id: string;
  name: string;
  description: string | null;
  version: number;
  currentRevisionId: string | null;
  currentRevisionNumber: number | null;
  currentRevisionHash: string | null;
  publishedRevisionId: string | null;
  publishedRevisionNumber: number | null;
  publishedRevisionHash: string | null;
  nodes: GraphNode[];
  edges: GraphEdge[];
  compiledPlan: Record<string, unknown> | null;
  compiledAt: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

interface GraphCompileResult {
  success: boolean;
  errors: Array<{ nodeId?: string; edgeId?: string; code: string; message: string }>;
  warnings: Array<{ nodeId?: string; code: string; message: string }>;
  plan: Record<string, unknown> | null;
  recipeId: string | null;
  compiledAt: string | null;
  sourceGraph?: {
    graphId: string;
    revisionId: string;
    revisionNumber: number;
    graphVersion: number;
    contentHash: string;
  };
}

interface GraphRevision {
  id: string;
  graphId: string;
  revisionNumber: number;
  graphVersion: number;
  name: string;
  description: string | null;
  nodes: GraphNode[];
  edges: GraphEdge[];
  contentHash: string;
  createdBy: string;
  createdAt: string;
  approvalId: string | null;
  approvedEnvironment: 'local' | 'staging' | 'production' | null;
  approvedAt: string | null;
  approvedBy: string | null;
  approvalSummary: string | null;
  publishedAt: string | null;
  publishedBy: string | null;
}

interface GraphRevisionApproval {
  id: string;
  graphId: string;
  revisionId: string;
  targetEnvironment: 'local' | 'staging' | 'production';
  mutationClass: 'graph-revision-publish';
  summary: string;
  approvedBy: string;
  approvedAt: string;
  expiresAt: string | null;
}

interface GraphRevisionsResponse {
  graph: {
    id: string;
    name: string;
    currentRevisionId: string | null;
    currentRevisionNumber: number | null;
    currentRevisionHash: string | null;
    publishedRevisionId: string | null;
    publishedRevisionNumber: number | null;
    publishedRevisionHash: string | null;
  };
  revisions: GraphRevision[];
}

interface GraphHandoffResult {
  graph: GraphDocument;
  handoff: {
    id: string;
    hash: string;
    recipeId: string | null;
    graphId: string;
    createdAt: string;
    sourceGraph?: {
      graphId: string;
      revisionId: string;
      revisionNumber: number;
      graphVersion: number;
      contentHash: string;
    };
  };
}

interface ConflictApiBody {
  error?: string;
  currentVersion?: number;
  graph?: GraphDocument;
}

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const NODE_W = 128; // w-32 = 128px
const NODE_H = 64;  // h-16 = 64px

function nodeCenter(pos: { x: number; y: number }): { x: number; y: number } {
  return { x: pos.x + NODE_W / 2, y: pos.y + NODE_H / 2 };
}

function extractErrorMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'body' in error) {
    const body = (error as { body?: unknown }).body;
    if (
      body &&
      typeof body === 'object' &&
      'error' in body &&
      typeof (body as { error?: unknown }).error === 'string'
    ) {
      return (body as { error: string }).error;
    }
  }
  return error instanceof Error ? error.message : 'Unknown error';
}

async function buildConfirmToken(action: string, userId: string, env: string): Promise<string> {
  const data = new TextEncoder().encode(`${action}:${userId}:${env}`);
  const hash = await crypto.subtle.digest('SHA-256', data);
  const hex = [...new Uint8Array(hash)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
  return hex.slice(0, 16);
}

function generateId(): string {
  return crypto.randomUUID();
}

interface RevisionDiffSummary {
  changed: boolean;
  addedNodes: number;
  removedNodes: number;
  changedNodes: number;
  addedEdges: number;
  removedEdges: number;
  changedEdges: number;
}

function summarizeRevisionDiff(
  base: Pick<GraphRevision, 'nodes' | 'edges'>,
  candidate: Pick<GraphRevision, 'nodes' | 'edges'>,
): RevisionDiffSummary {
  const summarizeCollection = <T extends { id: string }>(left: T[], right: T[]) => {
    const leftMap = new Map(left.map((item) => [item.id, JSON.stringify(item)]));
    const rightMap = new Map(right.map((item) => [item.id, JSON.stringify(item)]));
    let added = 0;
    let removed = 0;
    let changed = 0;

    for (const [id, value] of rightMap) {
      const leftValue = leftMap.get(id);
      if (leftValue === undefined) {
        added += 1;
      } else if (leftValue !== value) {
        changed += 1;
      }
    }

    for (const id of leftMap.keys()) {
      if (!rightMap.has(id)) {
        removed += 1;
      }
    }

    return { added, removed, changed };
  };

  const nodes = summarizeCollection(base.nodes, candidate.nodes);
  const edges = summarizeCollection(base.edges, candidate.edges);

  return {
    changed:
      nodes.added > 0 ||
      nodes.removed > 0 ||
      nodes.changed > 0 ||
      edges.added > 0 ||
      edges.removed > 0 ||
      edges.changed > 0,
    addedNodes: nodes.added,
    removedNodes: nodes.removed,
    changedNodes: nodes.changed,
    addedEdges: edges.added,
    removedEdges: edges.removed,
    changedEdges: edges.changed,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// CanvasNode sub-component
// ─────────────────────────────────────────────────────────────────────────────

interface CanvasNodeProps {
  node: GraphNode;
  isSelected: boolean;
  isConnectingSource: boolean;
  isConnectingMode: boolean;
  catalogPrimitives: PrimitiveDescriptor[];
  catalogConcepts: ConceptSummary[];
  onMouseDown: (e: React.MouseEvent, nodeId: string) => void;
  onSelect: (nodeId: string) => void;
  onStartConnect: (nodeId: string) => void;
  onAcceptConnect: (nodeId: string) => void;
}

function CanvasNode({
  node,
  isSelected,
  isConnectingSource,
  isConnectingMode,
  catalogPrimitives,
  catalogConcepts,
  onMouseDown,
  onSelect,
  onStartConnect,
  onAcceptConnect,
}: CanvasNodeProps) {
  const displayName =
    node.label ??
    catalogPrimitives.find((p) => p.id === node.ref)?.displayName ??
    catalogConcepts.find((c) => c.id === node.ref)?.displayName ??
    node.ref;

  const typeColor =
    node.nodeType === 'concept'
      ? isSelected
        ? 'border-violet-400 bg-violet-950/60 ring-2 ring-violet-400/40'
        : 'border-violet-500/70 bg-violet-950/40 hover:border-violet-400/80'
      : isSelected
        ? 'border-blue-400 bg-blue-950/60 ring-2 ring-blue-400/40'
        : 'border-blue-500/70 bg-blue-950/40 hover:border-blue-400/80';

  const dotColor = node.nodeType === 'concept' ? 'bg-violet-400' : 'bg-blue-400';

  function handleClick(e: React.MouseEvent) {
    e.stopPropagation();
    if (isConnectingMode && !isConnectingSource) {
      onAcceptConnect(node.id);
    } else {
      onSelect(node.id);
    }
  }

  return (
    <div
      style={{
        position: 'absolute',
        left: node.position.x,
        top: node.position.y,
        width: NODE_W,
        height: NODE_H,
        userSelect: 'none',
      }}
      className={`rounded border cursor-pointer transition-colors flex flex-col justify-between p-1.5 ${typeColor} ${
        isConnectingMode && !isConnectingSource ? 'cursor-crosshair' : ''
      }`}
      onMouseDown={(e) => {
        if (!isConnectingMode) onMouseDown(e, node.id);
      }}
      onClick={handleClick}
    >
      {/* Top row: dot + name */}
      <div className="flex items-center gap-1.5 overflow-hidden">
        <span className={`shrink-0 h-2 w-2 rounded-full ${dotColor}`} />
        <span className="text-white text-[11px] font-medium truncate leading-tight">
          {displayName}
        </span>
      </div>

      {/* Type badge */}
      <div className="flex items-center justify-between gap-1">
        <span className="text-[9px] uppercase tracking-wide text-slate-400">
          {node.nodeType}
        </span>
        {/* Connect button */}
        {!isConnectingMode && (
          <button
            type="button"
            title="Draw edge from this node"
            className="text-slate-400 hover:text-white text-[11px] leading-none border border-slate-600/60 rounded px-1 hover:border-slate-400"
            onClick={(e) => {
              e.stopPropagation();
              onStartConnect(node.id);
            }}
          >
            ⊕
          </button>
        )}
        {isConnectingSource && (
          <span className="text-[9px] text-amber-300 animate-pulse">source</span>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────

export function GraphComposerTab() {
  // Catalog
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [catalogPrimitives, setCatalogPrimitives] = useState<PrimitiveDescriptor[]>([]);
  const [catalogConcepts, setCatalogConcepts] = useState<ConceptSummary[]>([]);

  // Graph list
  const [graphs, setGraphs] = useState<GraphDocument[]>([]);
  const [graphsLoading, setGraphsLoading] = useState(false);
  const [selectedGraphId, setSelectedGraphId] = useState<string>('');
  const [graphRevisions, setGraphRevisions] = useState<GraphRevision[]>([]);
  const [revisionsLoading, setRevisionsLoading] = useState(false);
  const [revisionsError, setRevisionsError] = useState<string | null>(null);
  const [selectedRevisionId, setSelectedRevisionId] = useState<string | null>(null);
  const [revisionApprovals, setRevisionApprovals] = useState<GraphRevisionApproval[]>([]);
  const [approvalsLoading, setApprovalsLoading] = useState(false);
  const [approvalSummaryDraft, setApprovalSummaryDraft] = useState('');

  // Current graph working state
  const [nodes, setNodes] = useState<GraphNode[]>([]);
  const [edges, setEdges] = useState<GraphEdge[]>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  // New graph dialog
  const [newGraphName, setNewGraphName] = useState('');
  const [showNewGraphInput, setShowNewGraphInput] = useState(false);
  const [creatingGraph, setCreatingGraph] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Save
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [approving, setApproving] = useState(false);
  const [approveDialogOpen, setApproveDialogOpen] = useState(false);
  const [approveError, setApproveError] = useState<string | null>(null);
  const [approveSuccess, setApproveSuccess] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [publishDialogOpen, setPublishDialogOpen] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [publishSuccess, setPublishSuccess] = useState(false);

  // Compile
  const [compiling, setCompiling] = useState(false);
  const [compileResult, setCompileResult] = useState<GraphCompileResult | null>(null);
  const [compileError, setCompileError] = useState<string | null>(null);

  // Handoff
  const [generatingHandoff, setGeneratingHandoff] = useState(false);
  const [handoffResult, setHandoffResult] = useState<GraphHandoffResult | null>(null);
  const [handoffError, setHandoffError] = useState<string | null>(null);

  // Canvas drag state
  const [dragging, setDragging] = useState<{
    nodeId: string;
    offsetX: number;
    offsetY: number;
  } | null>(null);

  // Edge drawing state
  const [connectingFrom, setConnectingFrom] = useState<string | null>(null);
  const [mousePos, setMousePos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  const canvasRef = useRef<HTMLDivElement>(null);
  const sessionEnv = useSession((state) => state.env);
  const sessionUserId = useSession((state) => state.user?.id ?? null);

  // ── Load catalog ──────────────────────────────────────────────────────────

  const loadCatalog = useCallback(async () => {
    setCatalogLoading(true);
    setCatalogError(null);
    try {
      const data = await apiFetch<GraphCatalogResponse>('/capabilities');
      setCatalogPrimitives(data.primitives ?? []);
      setCatalogConcepts(data.concepts ?? []);
    } catch (err) {
      setCatalogError(extractErrorMessage(err));
    } finally {
      setCatalogLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadCatalog();
  }, [loadCatalog]);

  // ── Load graphs ───────────────────────────────────────────────────────────

  const loadGraphs = useCallback(async () => {
    setGraphsLoading(true);
    try {
      const data = await apiFetch<{ graphs: GraphDocument[] }>('/capabilities/graphs');
      setGraphs(data.graphs ?? []);
    } catch {
      // non-fatal — graph list may not exist yet
    } finally {
      setGraphsLoading(false);
    }
  }, []);

  const loadRevisions = useCallback(async (graphId: string) => {
    setRevisionsLoading(true);
    setRevisionsError(null);
    try {
      const data = await apiFetch<GraphRevisionsResponse>(`/capabilities/graphs/${graphId}/revisions?limit=20`);
      setGraphRevisions(data.revisions ?? []);
    } catch (err) {
      setGraphRevisions([]);
      setRevisionsError(extractErrorMessage(err));
    } finally {
      setRevisionsLoading(false);
    }
  }, []);

  const loadRevisionApprovals = useCallback(async (graphId: string, revisionId: string) => {
    setApprovalsLoading(true);
    try {
      const data = await apiFetch<{ approvals: GraphRevisionApproval[] }>(
        `/capabilities/graphs/${graphId}/revisions/${revisionId}/approvals`,
      );
      setRevisionApprovals(data.approvals ?? []);
    } catch {
      setRevisionApprovals([]);
    } finally {
      setApprovalsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadGraphs();
  }, [loadGraphs]);

  // ── Sync nodes/edges when graph selection changes ─────────────────────────

  useEffect(() => {
    const graph = graphs.find((g) => g.id === selectedGraphId);
    if (graph) {
      setNodes(graph.nodes ?? []);
      setEdges(graph.edges ?? []);
      setSelectedNodeId(null);
      setCompileResult(null);
      setHandoffResult(null);
    } else if (!selectedGraphId) {
      setNodes([]);
      setEdges([]);
      setSelectedNodeId(null);
      setCompileResult(null);
      setHandoffResult(null);
    }
  }, [selectedGraphId, graphs]);

  useEffect(() => {
    if (!selectedGraphId) {
      setGraphRevisions([]);
      setSelectedRevisionId(null);
      setRevisionsError(null);
      return;
    }
    void loadRevisions(selectedGraphId);
  }, [selectedGraphId, loadRevisions]);

  useEffect(() => {
    if (!selectedGraphId) return;
    if (graphRevisions.length === 0) {
      setSelectedRevisionId(null);
      return;
    }

    setSelectedRevisionId((prev) => {
      if (prev && graphRevisions.some((revision) => revision.id === prev)) {
        return prev;
      }
      const selectedGraph = graphs.find((graph) => graph.id === selectedGraphId);
      return selectedGraph?.publishedRevisionId
        ?? selectedGraph?.currentRevisionId
        ?? graphRevisions[0]?.id
        ?? null;
    });
  }, [graphRevisions, graphs, selectedGraphId]);

  useEffect(() => {
    const selectedRevision = graphRevisions.find((revision) => revision.id === selectedRevisionId);
    const environmentApproval = revisionApprovals.find((approval) => approval.targetEnvironment === sessionEnv);
    setApprovalSummaryDraft(environmentApproval?.summary ?? selectedRevision?.approvalSummary ?? '');
    setApproveError(null);
    setApproveSuccess(false);
  }, [graphRevisions, revisionApprovals, selectedRevisionId, sessionEnv]);

  useEffect(() => {
    if (!selectedGraphId || !selectedRevisionId) {
      setRevisionApprovals([]);
      return;
    }
    void loadRevisionApprovals(selectedGraphId, selectedRevisionId);
  }, [loadRevisionApprovals, selectedGraphId, selectedRevisionId]);

  // ── Create graph ──────────────────────────────────────────────────────────

  async function createGraph() {
    const name = newGraphName.trim();
    if (!name) return;
    setCreatingGraph(true);
    setCreateError(null);
    try {
      const data = await apiFetch<{ graph: GraphDocument }>('/capabilities/graphs', {
        method: 'POST',
        body: JSON.stringify({ name }),
      });
      setGraphs((prev) => [...prev, data.graph]);
      setSelectedGraphId(data.graph.id);
      setNewGraphName('');
      setShowNewGraphInput(false);
    } catch (err) {
      setCreateError(extractErrorMessage(err));
    } finally {
      setCreatingGraph(false);
    }
  }

  // ── Save graph ────────────────────────────────────────────────────────────

  async function saveGraph() {
    if (!selectedGraphId) return;
    const selectedGraph = graphs.find((graph) => graph.id === selectedGraphId);
    if (!selectedGraph) return;
    setSaving(true);
    setSaveError(null);
    setSaveSuccess(false);
    try {
      const data = await apiFetch<{ graph: GraphDocument }>(
        `/capabilities/graphs/${selectedGraphId}`,
        {
          method: 'PUT',
          body: JSON.stringify({
            nodes,
            edges,
            expectedVersion: selectedGraph.version,
          }),
        },
      );
      setGraphs((prev) => prev.map((g) => (g.id === data.graph.id ? data.graph : g)));
      await loadRevisions(data.graph.id);
      setSaveSuccess(true);
      window.setTimeout(() => setSaveSuccess(false), 2000);
    } catch (err) {
      const body = (err as { body?: unknown }).body as ConflictApiBody | undefined;
      if ((err as { status?: number }).status === 409 && body?.graph) {
        setGraphs((prev) => prev.map((graph) => (
          graph.id === body.graph?.id ? body.graph : graph
        )));
        setNodes(body.graph.nodes ?? []);
        setEdges(body.graph.edges ?? []);
        setCompileResult(null);
        setHandoffResult(null);
      }
      setSaveError(extractErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  // ── Compile graph ─────────────────────────────────────────────────────────

  async function compileGraph() {
    if (!selectedGraphId) return;
    setCompiling(true);
    setCompileResult(null);
    setCompileError(null);
    setHandoffResult(null);
    try {
      const result = await apiFetch<GraphCompileResult>(
        `/capabilities/graphs/${selectedGraphId}/compile`,
        { method: 'POST' },
      );
      setCompileResult(result);
    } catch (err) {
      setCompileError(extractErrorMessage(err));
    } finally {
      setCompiling(false);
    }
  }

  async function approveRevision(revisionId: string, summary: string) {
    if (!selectedGraphId) return;
    setApproving(true);
    setApproveError(null);
    setApproveSuccess(false);
    try {
      await apiFetch<{ revision: GraphRevision }>(
        `/capabilities/graphs/${selectedGraphId}/revisions/${revisionId}/approve`,
        {
          method: 'POST',
          body: JSON.stringify({ summary }),
          confirmed: true,
        },
      );
      await loadRevisions(selectedGraphId);
      await loadRevisionApprovals(selectedGraphId, revisionId);
      setApproveSuccess(true);
      window.setTimeout(() => setApproveSuccess(false), 2000);
    } catch (err) {
      setApproveError(extractErrorMessage(err));
    } finally {
      setApproving(false);
    }
  }

  async function approveSelectedRevision() {
    if (!selectedRevision) return;
    const summary = approvalSummaryDraft.trim();
    if (!summary) {
      setApproveError('Approval summary is required.');
      return;
    }
    setApproveDialogOpen(false);
    await approveRevision(selectedRevision.id, summary);
  }

  async function publishGraph(revisionId: string | undefined, confirmToken?: string) {
    if (!selectedGraphId) return;
    setPublishing(true);
    setPublishError(null);
    setPublishSuccess(false);
    try {
      const result = await apiFetch<{ graph: GraphDocument }>(
        `/capabilities/graphs/${selectedGraphId}/publish`,
        {
          method: 'POST',
          body: JSON.stringify(revisionId ? { revisionId } : {}),
          confirmed: true,
          confirmToken,
        },
      );
      setGraphs((prev) => prev.map((g) => (g.id === result.graph.id ? result.graph : g)));
      await loadRevisions(result.graph.id);
      setCompileResult(null);
      setCompileError(null);
      setHandoffResult(null);
      setHandoffError(null);
      setPublishSuccess(true);
      window.setTimeout(() => setPublishSuccess(false), 2000);
    } catch (err) {
      setPublishError(extractErrorMessage(err));
    } finally {
      setPublishing(false);
    }
  }

  async function confirmPublish() {
    const env = sessionEnv ?? 'staging';
    const tier = requiredConfirmationTier(env, 'reversible');
    let confirmToken: string | undefined;
    const revisionId = selectedRevisionId ?? selectedGraph?.currentRevisionId ?? undefined;

    if (tier >= 2) {
      if (!sessionUserId) {
        setPublishError('Your session is missing user identity. Please sign in again.');
        return;
      }
      confirmToken = await buildConfirmToken('capabilities.graph.publish', sessionUserId, env);
    }

    setPublishDialogOpen(false);
    await publishGraph(revisionId, confirmToken);
  }

  // ── Generate handoff ──────────────────────────────────────────────────────

  async function generateHandoff() {
    if (!selectedGraphId || !compileResult?.success) return;
    setGeneratingHandoff(true);
    setHandoffResult(null);
    setHandoffError(null);
    try {
      const result = await apiFetch<GraphHandoffResult>(
        `/capabilities/graphs/${selectedGraphId}/handoff`,
        { method: 'POST' },
      );
      setHandoffResult(result);
    } catch (err) {
      setHandoffError(extractErrorMessage(err));
    } finally {
      setGeneratingHandoff(false);
    }
  }

  // ── Add node from palette ─────────────────────────────────────────────────

  function addNode(
    nodeType: 'primitive' | 'concept',
    ref: string,
  ) {
    const newNode: GraphNode = {
      id: generateId(),
      nodeType,
      ref,
      position: {
        x: 80 + nodes.length * 20,
        y: 80 + nodes.length * 20,
      },
    };
    setNodes((prev) => [...prev, newNode]);
    // Reset compile/handoff when graph changes
    setCompileResult(null);
    setHandoffResult(null);
  }

  // ── Delete selected node ──────────────────────────────────────────────────

  function deleteSelectedNode() {
    if (!selectedNodeId) return;
    setNodes((prev) => prev.filter((n) => n.id !== selectedNodeId));
    setEdges((prev) =>
      prev.filter(
        (e) => e.sourceNodeId !== selectedNodeId && e.targetNodeId !== selectedNodeId,
      ),
    );
    setSelectedNodeId(null);
    setCompileResult(null);
    setHandoffResult(null);
  }

  // ── Canvas drag handlers ──────────────────────────────────────────────────

  function handleNodeMouseDown(e: React.MouseEvent, nodeId: string) {
    e.preventDefault();
    e.stopPropagation();
    const canvasRect = canvasRef.current?.getBoundingClientRect();
    if (!canvasRect) return;
    const node = nodes.find((n) => n.id === nodeId);
    if (!node) return;
    const offsetX = e.clientX - canvasRect.left - node.position.x;
    const offsetY = e.clientY - canvasRect.top - node.position.y;
    setDragging({ nodeId, offsetX, offsetY });
    setSelectedNodeId(nodeId);
  }

  function handleCanvasMouseMove(e: React.MouseEvent) {
    const canvasRect = canvasRef.current?.getBoundingClientRect();
    if (!canvasRect) return;
    const x = e.clientX - canvasRect.left;
    const y = e.clientY - canvasRect.top;
    setMousePos({ x, y });

    if (!dragging) return;
    const newX = Math.max(0, x - dragging.offsetX);
    const newY = Math.max(0, y - dragging.offsetY);
    setNodes((prev) =>
      prev.map((n) =>
        n.id === dragging.nodeId ? { ...n, position: { x: newX, y: newY } } : n,
      ),
    );
  }

  function handleCanvasMouseUp() {
    setDragging(null);
  }

  function handleCanvasClick() {
    if (connectingFrom) {
      // Click on empty canvas cancels connecting mode
      setConnectingFrom(null);
    } else {
      setSelectedNodeId(null);
    }
  }

  // ── Edge connect handlers ─────────────────────────────────────────────────

  function startConnect(nodeId: string) {
    setConnectingFrom(nodeId);
  }

  function acceptConnect(targetNodeId: string) {
    if (!connectingFrom || connectingFrom === targetNodeId) {
      setConnectingFrom(null);
      return;
    }
    // Avoid duplicate edges
    const alreadyExists = edges.some(
      (e) => e.sourceNodeId === connectingFrom && e.targetNodeId === targetNodeId,
    );
    if (!alreadyExists) {
      const newEdge: GraphEdge = {
        id: generateId(),
        sourceNodeId: connectingFrom,
        targetNodeId,
      };
      setEdges((prev) => [...prev, newEdge]);
      setCompileResult(null);
      setHandoffResult(null);
    }
    setConnectingFrom(null);
  }

  // ── Node param update ─────────────────────────────────────────────────────

  function updateNodeParam(
    nodeId: string,
    paramId: string,
    value: string | number | boolean,
  ) {
    setNodes((prev) =>
      prev.map((n) =>
        n.id === nodeId
          ? { ...n, params: { ...(n.params ?? {}), [paramId]: value } }
          : n,
      ),
    );
    setCompileResult(null);
    setHandoffResult(null);
  }

  // ── Computed helpers ──────────────────────────────────────────────────────

  const selectedNode = nodes.find((n) => n.id === selectedNodeId) ?? null;
  const selectedGraph = graphs.find((graph) => graph.id === selectedGraphId) ?? null;
  const selectedRevision = graphRevisions.find((revision) => revision.id === selectedRevisionId) ?? null;
  const publishedRevision = selectedGraph?.publishedRevisionId
    ? graphRevisions.find((revision) => revision.id === selectedGraph.publishedRevisionId) ?? null
    : null;
  const selectedConcept =
    selectedNode?.nodeType === 'concept'
      ? catalogConcepts.find((c) => c.id === selectedNode.ref) ?? null
      : null;

  const canHandoff = compileResult?.success === true;
  const approvalTier = requiredConfirmationTier(sessionEnv ?? 'staging', 'trivial');
  const publishTier = requiredConfirmationTier(sessionEnv ?? 'staging', 'reversible');
  const isProductionSession = sessionEnv === 'production';
  const sessionApproval = revisionApprovals.find((approval) => approval.targetEnvironment === sessionEnv) ?? null;
  const selectedRevisionIsApproved = !!sessionApproval;
  const approvalEnvironmentMismatch =
    !selectedRevisionIsApproved && revisionApprovals.length > 0;
  const selectedRevisionIsPublished = !!selectedRevision && selectedRevision.id === selectedGraph?.publishedRevisionId;
  const selectedRevisionIsCurrent = !!selectedRevision && selectedRevision.id === selectedGraph?.currentRevisionId;
  const productionSelfApprovalBlocked =
    isProductionSession && !!selectedRevision && selectedRevision.createdBy === sessionUserId;
  const productionSelfPublishBlocked =
    isProductionSession && !!sessionApproval?.approvedBy && sessionApproval.approvedBy === sessionUserId;
  const approveTargetLabel = selectedRevision ? `r${selectedRevision.revisionNumber}` : 'revision';
  const publishTargetLabel = selectedRevision ? `r${selectedRevision.revisionNumber}` : 'revision';
  const publishDiff = selectedRevision && publishedRevision && selectedRevision.id !== publishedRevision.id
    ? summarizeRevisionDiff(publishedRevision, selectedRevision)
    : null;

  // ─────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      <ConfirmDialog
        open={approveDialogOpen}
        action="capabilities.graph.approve"
        description={`Approve ${approveTargetLabel} for future execution and record review context.`}
        reversibility="trivial"
        tier={approvalTier}
        onCancel={() => setApproveDialogOpen(false)}
        onConfirm={() => void approveSelectedRevision()}
      />
      <ConfirmDialog
        open={publishDialogOpen}
        action="capabilities.graph.publish"
        description={`Publish ${publishTargetLabel} so compile and handoff operate against a reviewed snapshot.`}
        reversibility="reversible"
        tier={publishTier}
        onCancel={() => setPublishDialogOpen(false)}
        onConfirm={() => void confirmPublish()}
      />
      {/* ── Header ── */}
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-white">Visual Graph Composer</h1>
          <p className="text-sm text-slate-400">
            Drag primitives and concepts onto the canvas, wire them with edges, compile to a
            CapabilityPlan, and generate a staging handoff.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            void loadCatalog();
            void loadGraphs();
            if (selectedGraphId) {
              void loadRevisions(selectedGraphId);
            }
          }}
          disabled={catalogLoading || graphsLoading}
        >
          {catalogLoading || graphsLoading ? 'Loading…' : 'Refresh'}
        </Button>
      </header>

      {catalogError && (
        <div className="rounded border border-red-700 bg-red-950/40 px-3 py-2 text-sm text-red-300">
          Catalog error: {catalogError}
        </div>
      )}

      {/* ── Toolbar ── */}
      <div className="flex flex-wrap items-center gap-2 rounded border border-slate-800 bg-slate-900 px-3 py-2">
        {/* New Graph */}
        {showNewGraphInput ? (
          <form
            className="flex items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void createGraph();
            }}
          >
            <input
              type="text"
              value={newGraphName}
              onChange={(e) => setNewGraphName(e.target.value)}
              placeholder="Graph name…"
              autoFocus
              className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-sm text-white placeholder:text-slate-600 w-40"
            />
            <Button size="sm" type="submit" disabled={creatingGraph || !newGraphName.trim()}>
              {creatingGraph ? 'Creating…' : 'Create'}
            </Button>
            <Button
              size="sm"
              variant="outline"
              type="button"
              onClick={() => {
                setShowNewGraphInput(false);
                setNewGraphName('');
                setCreateError(null);
              }}
            >
              Cancel
            </Button>
            {createError && (
              <span className="text-xs text-red-400">{createError}</span>
            )}
          </form>
        ) : (
          <Button
            size="sm"
            variant="outline"
            onClick={() => setShowNewGraphInput(true)}
          >
            + New Graph
          </Button>
        )}

        {/* Graph selector */}
        <select
          value={selectedGraphId}
          onChange={(e) => setSelectedGraphId(e.target.value)}
          className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-sm text-white max-w-[200px]"
        >
          <option value="">— select graph —</option>
          {graphs.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </select>

        {selectedGraph && (
          <span className="text-xs text-slate-500">
            draft v{selectedGraph.version} · rev {selectedGraph.currentRevisionNumber ?? '—'} · published r{selectedGraph.publishedRevisionNumber ?? '—'}
          </span>
        )}

        <div className="h-5 w-px bg-slate-700" />

        {/* Save */}
        <Button
          size="sm"
          variant="outline"
          onClick={() => void saveGraph()}
          disabled={!selectedGraphId || saving}
        >
          {saving ? 'Saving…' : saveSuccess ? '✓ Saved' : 'Save'}
        </Button>

        <Button
          size="sm"
          variant="outline"
          onClick={() => setPublishDialogOpen(true)}
          disabled={
            !selectedGraphId ||
            publishing ||
            !selectedRevision ||
            selectedRevisionIsPublished ||
            !selectedRevisionIsApproved ||
            approvalEnvironmentMismatch ||
            productionSelfPublishBlocked
          }
        >
          {publishing ? 'Publishing…' : publishSuccess ? '✓ Published' : `Publish ${publishTargetLabel}`}
        </Button>

        {/* Compile */}
        <Button
          size="sm"
          variant="outline"
          onClick={() => void compileGraph()}
          disabled={!selectedGraphId || compiling}
        >
          {compiling ? 'Compiling…' : 'Compile'}
        </Button>

        {/* Handoff */}
        <Button
          size="sm"
          disabled={!canHandoff || generatingHandoff}
          onClick={() => void generateHandoff()}
        >
          {generatingHandoff ? 'Generating…' : 'Generate Handoff'}
        </Button>

        {saveError && (
          <span className="text-xs text-red-400">{saveError}</span>
        )}
        {publishError && (
          <span className="text-xs text-red-400">{publishError}</span>
        )}
      </div>

      {/* ── 3-panel grid ── */}
      <div className="grid grid-cols-[240px_1fr_280px] gap-0 rounded border border-slate-800 overflow-hidden">
        {/* ── Left: Node Palette ── */}
        <aside className="border-r border-slate-800 bg-slate-900 overflow-y-auto h-[520px]">
          <div className="px-3 py-2 border-b border-slate-800">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              Node Palette
            </h2>
          </div>

          {catalogLoading ? (
            <p className="px-3 py-4 text-xs text-slate-500">Loading catalog…</p>
          ) : (
            <div className="p-2 space-y-3">
              {/* Primitives section */}
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-blue-400/80 px-1 mb-1">
                  Primitives
                </p>
                <div className="space-y-1">
                  {catalogPrimitives.length === 0 && (
                    <p className="text-xs text-slate-600 px-1">No primitives in catalog.</p>
                  )}
                  {catalogPrimitives.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      title={p.summary}
                      onClick={() => addNode('primitive', p.id)}
                      className="w-full rounded border border-slate-800 bg-slate-950 px-2 py-1.5 text-left hover:border-blue-500/50 hover:bg-blue-950/20 transition-colors"
                    >
                      <div className="flex items-center gap-1.5">
                        <span className="h-2 w-2 rounded-full bg-blue-400 shrink-0" />
                        <span className="text-xs font-medium text-slate-200 truncate">
                          {p.displayName}
                        </span>
                      </div>
                      <p className="mt-0.5 text-[10px] text-slate-500 line-clamp-2 pl-3.5">
                        {p.summary}
                      </p>
                    </button>
                  ))}
                </div>
              </div>

              {/* Concepts section */}
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-violet-400/80 px-1 mb-1">
                  Concepts
                </p>
                <div className="space-y-1">
                  {catalogConcepts.length === 0 && (
                    <p className="text-xs text-slate-600 px-1">No concepts in catalog.</p>
                  )}
                  {catalogConcepts.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      title={c.summary}
                      onClick={() => addNode('concept', c.id)}
                      className="w-full rounded border border-slate-800 bg-slate-950 px-2 py-1.5 text-left hover:border-violet-500/50 hover:bg-violet-950/20 transition-colors"
                    >
                      <div className="flex items-center gap-1.5">
                        <span className="h-2 w-2 rounded-full bg-violet-400 shrink-0" />
                        <span className="text-xs font-medium text-slate-200 truncate">
                          {c.displayName}
                        </span>
                      </div>
                      <p className="mt-0.5 text-[10px] text-slate-500 line-clamp-2 pl-3.5">
                        {c.summary}
                      </p>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </aside>

        {/* ── Center: Canvas ── */}
        <div className="relative h-[520px] overflow-hidden bg-slate-950 border-r border-slate-800">
          {/* Grid background */}
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              backgroundImage: 'radial-gradient(circle, #334155 1px, transparent 1px)',
              backgroundSize: '32px 32px',
            }}
          />

          {/* Canvas interaction layer */}
          <div
            ref={canvasRef}
            className="absolute inset-0"
            style={{ cursor: connectingFrom ? 'crosshair' : dragging ? 'grabbing' : 'default' }}
            onMouseMove={handleCanvasMouseMove}
            onMouseUp={handleCanvasMouseUp}
            onClick={handleCanvasClick}
          >
            {/* Empty state */}
            {nodes.length === 0 && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <p className="text-sm text-slate-600 text-center">
                  Select or create a graph, then click palette entries to add nodes.
                  <br />
                  Drag nodes to reposition. Click ⊕ to draw edges.
                </p>
              </div>
            )}

            {/* SVG edges overlay */}
            <svg
              className="absolute inset-0 pointer-events-none"
              style={{ width: '100%', height: '100%' }}
            >
              {/* Committed edges */}
              {edges.map((edge) => {
                const src = nodes.find((n) => n.id === edge.sourceNodeId);
                const tgt = nodes.find((n) => n.id === edge.targetNodeId);
                if (!src || !tgt) return null;
                const sc = nodeCenter(src.position);
                const tc = nodeCenter(tgt.position);
                return (
                  <g key={edge.id}>
                    <line
                      x1={sc.x}
                      y1={sc.y}
                      x2={tc.x}
                      y2={tc.y}
                      stroke="#475569"
                      strokeWidth={1.5}
                    />
                    {/* Arrowhead approximation */}
                    <circle cx={tc.x} cy={tc.y} r={3} fill="#475569" />
                  </g>
                );
              })}

              {/* Pending edge while connecting */}
              {connectingFrom && (() => {
                const srcNode = nodes.find((n) => n.id === connectingFrom);
                if (!srcNode) return null;
                const sc = nodeCenter(srcNode.position);
                return (
                  <line
                    x1={sc.x}
                    y1={sc.y}
                    x2={mousePos.x}
                    y2={mousePos.y}
                    stroke="#f59e0b"
                    strokeWidth={1.5}
                    strokeDasharray="5,4"
                  />
                );
              })()}
            </svg>

            {/* Nodes */}
            {nodes.map((node) => (
              <CanvasNode
                key={node.id}
                node={node}
                isSelected={node.id === selectedNodeId}
                isConnectingSource={node.id === connectingFrom}
                isConnectingMode={connectingFrom !== null}
                catalogPrimitives={catalogPrimitives}
                catalogConcepts={catalogConcepts}
                onMouseDown={handleNodeMouseDown}
                onSelect={setSelectedNodeId}
                onStartConnect={startConnect}
                onAcceptConnect={acceptConnect}
              />
            ))}
          </div>

          {/* Connecting mode banner */}
          {connectingFrom && (
            <div className="absolute top-2 left-1/2 -translate-x-1/2 rounded border border-amber-500/60 bg-amber-950/80 px-3 py-1 text-xs text-amber-200 pointer-events-none z-10">
              Click a target node to draw edge · or click canvas to cancel
            </div>
          )}

          {/* Canvas toolbar (node count / escape) */}
          <div className="absolute bottom-2 right-2 text-[10px] text-slate-600">
            {nodes.length} node{nodes.length !== 1 ? 's' : ''} · {edges.length} edge
            {edges.length !== 1 ? 's' : ''}
          </div>
        </div>

        {/* ── Right: Properties Panel ── */}
        <aside className="bg-slate-900 h-[520px] overflow-y-auto">
          <div className="px-3 py-2 border-b border-slate-800">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              Properties
            </h2>
          </div>

          {!selectedNode ? (
            <p className="px-3 py-4 text-xs text-slate-500">
              Select a node to edit its properties.
            </p>
          ) : (
            <div className="p-3 space-y-3">
              {/* Node identity */}
              <div className="space-y-1">
                <div className="flex items-center gap-1.5">
                  <span
                    className={`h-2 w-2 rounded-full ${
                      selectedNode.nodeType === 'concept' ? 'bg-violet-400' : 'bg-blue-400'
                    }`}
                  />
                  <span className="text-xs font-semibold text-white">
                    {selectedNode.nodeType === 'concept'
                      ? catalogConcepts.find((c) => c.id === selectedNode.ref)?.displayName
                      : catalogPrimitives.find((p) => p.id === selectedNode.ref)?.displayName}
                  </span>
                </div>
                <p className="text-[10px] text-slate-500 font-mono break-all">{selectedNode.ref}</p>
                <span className="inline-block text-[9px] uppercase tracking-wide text-slate-500 border border-slate-700 rounded px-1">
                  {selectedNode.nodeType}
                </span>
              </div>

              {/* Primitive: summary only */}
              {selectedNode.nodeType === 'primitive' && (() => {
                const prim = catalogPrimitives.find((p) => p.id === selectedNode.ref);
                return prim ? (
                  <p className="text-xs text-slate-400">{prim.summary}</p>
                ) : null;
              })()}

              {/* Concept: param editor */}
              {selectedNode.nodeType === 'concept' && selectedConcept && (
                <div className="space-y-2">
                  <p className="text-xs text-slate-400">{selectedConcept.summary}</p>
                  {selectedConcept.parameters.length === 0 && (
                    <p className="text-[10px] text-slate-600">No parameters declared.</p>
                  )}
                  {selectedConcept.parameters.map((param) => {
                    const currentVal =
                      selectedNode.params?.[param.id] ??
                      param.default ??
                      '';
                    return (
                      <div key={param.id} className="space-y-1">
                        <div className="flex items-center gap-1 text-[11px] text-slate-300">
                          <span>{param.id}</span>
                          {param.required && (
                            <span className="text-[9px] uppercase text-amber-400">req</span>
                          )}
                        </div>
                        <p className="text-[10px] text-slate-500">{param.description}</p>
                        {param.type === 'boolean' ? (
                          <label className="flex items-center gap-1.5 text-xs text-slate-200">
                            <input
                              type="checkbox"
                              checked={Boolean(currentVal)}
                              onChange={(e) =>
                                updateNodeParam(selectedNode.id, param.id, e.target.checked)
                              }
                            />
                            Enabled
                          </label>
                        ) : (
                          <input
                            type={
                              param.type === 'integer' || param.type === 'number'
                                ? 'number'
                                : 'text'
                            }
                            value={String(currentVal)}
                            onChange={(e) => {
                              const raw = e.target.value;
                              const cast: string | number | boolean =
                                param.type === 'integer'
                                  ? Number.parseInt(raw, 10)
                                  : param.type === 'number'
                                    ? Number.parseFloat(raw)
                                    : raw;
                              updateNodeParam(selectedNode.id, param.id, cast);
                            }}
                            className="w-full rounded border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-white"
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Delete */}
              <div className="pt-2 border-t border-slate-800">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={deleteSelectedNode}
                  className="w-full text-red-400 border-red-900/60 hover:bg-red-950/40 hover:text-red-300"
                >
                  Delete Node
                </Button>
              </div>
            </div>
          )}
        </aside>
      </div>

      {selectedGraph && (
        <section className="rounded border border-slate-800 bg-slate-900/70">
          <div className="flex items-center justify-between gap-3 border-b border-slate-800 px-4 py-3">
            <div>
              <h2 className="text-sm font-semibold text-white">Revision History</h2>
              <p className="text-xs text-slate-400">
                Review immutable revisions and choose which one becomes the execution head.
              </p>
            </div>
            <div className="text-xs text-slate-500">
              {revisionsLoading ? 'Loading…' : `${graphRevisions.length} revision${graphRevisions.length === 1 ? '' : 's'}`}
            </div>
          </div>

          {revisionsError && (
            <div className="border-b border-slate-800 px-4 py-2 text-xs text-red-400">
              {revisionsError}
            </div>
          )}

          <div className="grid gap-0 md:grid-cols-[260px_1fr]">
            <div className="border-r border-slate-800">
              {graphRevisions.length === 0 ? (
                <p className="px-4 py-4 text-xs text-slate-500">
                  {revisionsLoading ? 'Loading revision history…' : 'No immutable revisions yet. Save the draft to create one.'}
                </p>
              ) : (
                <div className="max-h-72 overflow-y-auto">
                  {graphRevisions.map((revision) => {
                    const isSelected = revision.id === selectedRevisionId;
                    const isPublished = revision.id === selectedGraph.publishedRevisionId;
                    const isCurrent = revision.id === selectedGraph.currentRevisionId;
                    return (
                      <button
                        key={revision.id}
                        type="button"
                        onClick={() => setSelectedRevisionId(revision.id)}
                        className={`flex w-full flex-col gap-1 border-b border-slate-800 px-4 py-3 text-left transition-colors ${
                          isSelected ? 'bg-blue-950/30' : 'hover:bg-slate-800/60'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-sm text-white">r{revision.revisionNumber}</span>
                          {isPublished && (
                            <span className="rounded border border-emerald-700/60 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-emerald-300">
                              published
                            </span>
                          )}
                          {isCurrent && (
                            <span className="rounded border border-amber-700/60 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-amber-300">
                              draft head
                            </span>
                          )}
                        </div>
                        <div className="font-mono text-[11px] text-slate-500">
                          {revision.contentHash.slice(0, 12)}
                        </div>
                        <div className="text-[11px] text-slate-400">
                          {new Date(revision.createdAt).toLocaleString()}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="space-y-4 px-4 py-4">
              {!selectedRevision ? (
                <p className="text-xs text-slate-500">Select a revision to review publish details.</p>
              ) : (
                <>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-sm font-semibold text-white">
                      Revision r{selectedRevision.revisionNumber}
                    </h3>
                    {selectedRevisionIsPublished && (
                      <span className="rounded border border-emerald-700/60 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-emerald-300">
                        current execution head
                      </span>
                    )}
                    {selectedRevisionIsCurrent && (
                      <span className="rounded border border-amber-700/60 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-amber-300">
                        latest draft save
                      </span>
                    )}
                  </div>

                  <dl className="grid gap-x-6 gap-y-2 text-sm md:grid-cols-2">
                    <div>
                      <dt className="text-slate-500">Created</dt>
                      <dd className="text-slate-200">{new Date(selectedRevision.createdAt).toLocaleString()}</dd>
                    </div>
                    <div>
                      <dt className="text-slate-500">Created by</dt>
                      <dd className="text-slate-200">{selectedRevision.createdBy}</dd>
                    </div>
                    <div>
                      <dt className="text-slate-500">Graph version</dt>
                      <dd className="font-mono text-slate-200">v{selectedRevision.graphVersion}</dd>
                    </div>
                    <div>
                      <dt className="text-slate-500">Content hash</dt>
                      <dd className="font-mono text-slate-200">{selectedRevision.contentHash}</dd>
                    </div>
                    <div>
                      <dt className="text-slate-500">Nodes</dt>
                      <dd className="text-slate-200">{selectedRevision.nodes.length}</dd>
                    </div>
                    <div>
                      <dt className="text-slate-500">Edges</dt>
                      <dd className="text-slate-200">{selectedRevision.edges.length}</dd>
                    </div>
                    <div>
                      <dt className="text-slate-500">Approved at</dt>
                      <dd className="text-slate-200">
                        {sessionApproval ? new Date(sessionApproval.approvedAt).toLocaleString() : 'Not approved for this environment'}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-slate-500">Approved by</dt>
                      <dd className="text-slate-200">{sessionApproval?.approvedBy ?? '—'}</dd>
                    </div>
                    <div>
                      <dt className="text-slate-500">Approval environment</dt>
                      <dd className="font-mono text-slate-200">{sessionApproval?.targetEnvironment ?? '—'}</dd>
                    </div>
                    <div>
                      <dt className="text-slate-500">Approval record</dt>
                      <dd className="font-mono text-slate-200 break-all">{sessionApproval?.id ?? '—'}</dd>
                    </div>
                    <div>
                      <dt className="text-slate-500">Published at</dt>
                      <dd className="text-slate-200">
                        {selectedRevision.publishedAt ? new Date(selectedRevision.publishedAt).toLocaleString() : 'Not published'}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-slate-500">Published by</dt>
                      <dd className="text-slate-200">{selectedRevision.publishedBy ?? '—'}</dd>
                    </div>
                  </dl>

                  <div className="rounded border border-slate-800 bg-slate-950/70 px-3 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                        Approval Context
                      </p>
                      {selectedRevisionIsApproved && (
                        <span className="rounded border border-emerald-700/60 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-emerald-300">
                          approved
                        </span>
                      )}
                    </div>
                    <p className="mt-2 text-xs text-slate-500">
                      Capture why this immutable revision is fit to become an execution head.
                    </p>
                    {productionSelfApprovalBlocked && (
                      <p className="mt-2 text-xs text-amber-300">
                        Production approval requires a reviewer other than the revision author.
                      </p>
                    )}
                    <textarea
                      value={approvalSummaryDraft}
                      onChange={(e) => setApprovalSummaryDraft(e.target.value)}
                      readOnly={selectedRevisionIsApproved}
                      rows={3}
                      className="mt-3 w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 text-base text-white read-only:cursor-not-allowed read-only:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-400 md:text-sm"
                      placeholder="Reviewed graph topology, parameters, and staging intent."
                    />
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={
                          !selectedRevision ||
                          approving ||
                          approvalSummaryDraft.trim().length === 0 ||
                          selectedRevisionIsApproved ||
                          productionSelfApprovalBlocked
                        }
                        onClick={() => {
                          if (approvalTier === 0) {
                            void approveSelectedRevision();
                            return;
                          }
                          setApproveDialogOpen(true);
                        }}
                      >
                        {approving
                          ? 'Approving…'
                          : approveSuccess
                            ? '✓ Approved'
                            : selectedRevisionIsApproved
                              ? `${approveTargetLabel} Approved`
                              : `Approve ${approveTargetLabel}`}
                      </Button>
                      {approveError && (
                        <span className="text-xs text-red-400">{approveError}</span>
                      )}
                    </div>
                    {sessionApproval?.summary && (
                      <p className="mt-3 text-xs text-slate-400">
                        Current approval note: {sessionApproval.summary}
                      </p>
                    )}
                    <div className="mt-3 border-t border-slate-800 pt-3">
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                        Approval Ledger
                      </p>
                      {approvalsLoading ? (
                        <p className="mt-2 text-xs text-slate-500">Loading approval history…</p>
                      ) : revisionApprovals.length === 0 ? (
                        <p className="mt-2 text-xs text-slate-500">No approval records.</p>
                      ) : (
                        <div className="mt-2 space-y-2">
                          {revisionApprovals.map((approval) => (
                            <div key={approval.id} className="border-l-2 border-emerald-700/60 pl-3 text-xs">
                              <p className="text-slate-300">
                                <span className="font-mono text-emerald-300">{approval.targetEnvironment}</span>
                                {' · '}
                                {approval.approvedBy}
                              </p>
                              <p className="mt-1 text-slate-500">{new Date(approval.approvedAt).toLocaleString()}</p>
                              <p className="mt-1 text-slate-400">{approval.summary}</p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="rounded border border-slate-800 bg-slate-950/70 px-3 py-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                      Publish Review
                    </p>
                    {selectedRevisionIsPublished ? (
                      <p className="mt-2 text-sm text-emerald-300">
                        This revision is already the published execution head.
                      </p>
                    ) : approvalEnvironmentMismatch ? (
                      <p className="mt-2 text-sm text-amber-300">
                        Existing approval records target another environment; approve this revision for {sessionEnv} before publishing here.
                      </p>
                    ) : productionSelfPublishBlocked ? (
                      <p className="mt-2 text-sm text-amber-300">
                        Production publish requires a principal other than the revision approver.
                      </p>
                    ) : !selectedRevisionIsApproved ? (
                      <p className="mt-2 text-sm text-amber-300">
                        Approve this revision before it can be published for compile and handoff.
                      </p>
                    ) : !publishedRevision ? (
                      <p className="mt-2 text-sm text-slate-300">
                        This will become the first published revision for this graph.
                      </p>
                    ) : publishDiff && !publishDiff.changed ? (
                      <p className="mt-2 text-sm text-slate-300">
                        This revision has the same graph payload as the current published head but a different immutable lineage record.
                      </p>
                    ) : publishDiff ? (
                      <div className="mt-2 grid gap-2 text-sm md:grid-cols-2">
                        <p className="text-slate-300">
                          Nodes: <span className="font-mono text-white">+{publishDiff.addedNodes} / -{publishDiff.removedNodes} / ~{publishDiff.changedNodes}</span>
                        </p>
                        <p className="text-slate-300">
                          Edges: <span className="font-mono text-white">+{publishDiff.addedEdges} / -{publishDiff.removedEdges} / ~{publishDiff.changedEdges}</span>
                        </p>
                        <p className="text-xs text-slate-500 md:col-span-2">
                          Comparison baseline: published revision r{publishedRevision.revisionNumber}.
                        </p>
                      </div>
                    ) : null}
                  </div>
                </>
              )}
            </div>
          </div>
        </section>
      )}

      {/* ── Results panel ── */}
      {(compileResult || compileError || handoffResult || handoffError) && (
        <div className="space-y-3">
          {/* Compile error */}
          {compileError && (
            <div className="rounded border border-red-700 bg-red-950/40 px-3 py-2 text-sm text-red-300">
              Compile failed: {compileError}
            </div>
          )}

          {/* Compile result */}
          {compileResult && (
            <div
              className={`rounded border p-4 ${
                compileResult.success
                  ? 'border-emerald-700/60 bg-emerald-950/20'
                  : 'border-red-700/60 bg-red-950/20'
              }`}
            >
              <div className="flex items-center justify-between gap-3">
                <h3
                  className={`text-sm font-semibold uppercase tracking-wide ${
                    compileResult.success ? 'text-emerald-300' : 'text-red-300'
                  }`}
                >
                  Compile {compileResult.success ? 'Succeeded' : 'Failed'}
                </h3>
                {compileResult.compiledAt && (
                  <span className="text-xs text-slate-400">
                    {new Date(compileResult.compiledAt).toLocaleString()}
                  </span>
                )}
              </div>

              {compileResult.recipeId && (
                <p className="mt-1 text-xs text-slate-300">
                  Recipe: <span className="font-mono">{compileResult.recipeId}</span>
                </p>
              )}
              {compileResult.sourceGraph && (
                <p className="mt-1 text-xs text-slate-400">
                  Pinned revision: <span className="font-mono">r{compileResult.sourceGraph.revisionNumber}</span>
                  {' · '}
                  <span className="font-mono">{compileResult.sourceGraph.contentHash.slice(0, 12)}</span>
                </p>
              )}

              {/* Errors */}
              {compileResult.errors.length > 0 && (
                <div className="mt-3 space-y-1">
                  <p className="text-xs font-semibold uppercase tracking-wide text-red-400">
                    Errors
                  </p>
                  {compileResult.errors.map((err, idx) => (
                    <div
                      key={`${err.code}-${idx}`}
                      className="rounded border border-red-800/40 bg-red-950/30 px-2 py-1"
                    >
                      <span className="font-mono text-xs text-red-300">[{err.code}]</span>
                      <span className="ml-2 text-xs text-slate-300">{err.message}</span>
                      {err.nodeId && (
                        <span className="ml-2 text-[10px] text-slate-500 font-mono">
                          node:{err.nodeId}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Warnings */}
              {compileResult.warnings.length > 0 && (
                <div className="mt-3 space-y-1">
                  <p className="text-xs font-semibold uppercase tracking-wide text-amber-400">
                    Warnings
                  </p>
                  {compileResult.warnings.map((warn, idx) => (
                    <div
                      key={`${warn.code}-${idx}`}
                      className="rounded border border-amber-800/40 bg-amber-950/20 px-2 py-1"
                    >
                      <span className="font-mono text-xs text-amber-300">[{warn.code}]</span>
                      <span className="ml-2 text-xs text-slate-300">{warn.message}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Plan summary */}
              {compileResult.plan && (
                <details className="mt-3 rounded border border-slate-800 bg-slate-950/80">
                  <summary className="cursor-pointer px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                    Plan summary
                  </summary>
                  <pre className="overflow-x-auto p-3 text-xs text-slate-200 whitespace-pre-wrap">
                    {JSON.stringify(compileResult.plan, null, 2)}
                  </pre>
                </details>
              )}
            </div>
          )}

          {/* Handoff error */}
          {handoffError && (
            <div className="rounded border border-red-700 bg-red-950/40 px-3 py-2 text-sm text-red-300">
              Handoff failed: {handoffError}
            </div>
          )}

          {/* Handoff result */}
          {handoffResult && (
            <div className="rounded border border-violet-700/60 bg-violet-950/20 p-4">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-violet-200">
                Handoff Generated
              </h3>
              <dl className="mt-3 grid gap-x-6 gap-y-1 text-xs text-slate-300 sm:grid-cols-[max-content_1fr]">
                <dt className="text-slate-500">Handoff ID</dt>
                <dd className="font-mono">{handoffResult.handoff.id}</dd>
                {handoffResult.handoff.hash && (
                  <>
                    <dt className="text-slate-500">Content hash</dt>
                    <dd className="font-mono break-all">{handoffResult.handoff.hash}</dd>
                  </>
                )}
                {handoffResult.handoff.recipeId && (
                  <>
                    <dt className="text-slate-500">Recipe</dt>
                    <dd className="font-mono">{handoffResult.handoff.recipeId}</dd>
                  </>
                )}
                <dt className="text-slate-500">Graph</dt>
                <dd className="font-mono">{handoffResult.handoff.graphId}</dd>
                {handoffResult.handoff.sourceGraph && (
                  <>
                    <dt className="text-slate-500">Revision</dt>
                    <dd className="font-mono">r{handoffResult.handoff.sourceGraph.revisionNumber}</dd>
                    <dt className="text-slate-500">Revision hash</dt>
                    <dd className="font-mono break-all">{handoffResult.handoff.sourceGraph.contentHash}</dd>
                  </>
                )}
                <dt className="text-slate-500">Created</dt>
                <dd>{new Date(handoffResult.handoff.createdAt).toLocaleString()}</dd>
              </dl>
              <div className="mt-3 rounded border border-slate-800 bg-slate-950/60 px-3 py-2 text-xs text-slate-400">
                Pass the handoff ID to the staging provisioner or copy the hash for content-addressed
                lookups. Next step: capabilities/provision-staging with this handoff.
              </div>
              <div className="mt-2 flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    void navigator.clipboard.writeText(handoffResult.handoff.id);
                  }}
                >
                  Copy ID
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!handoffResult.handoff.hash}
                  onClick={() => {
                    void navigator.clipboard.writeText(handoffResult.handoff.hash);
                  }}
                >
                  Copy Hash
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
