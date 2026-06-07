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
import { apiFetch } from '../../lib/api.js';
import { Button } from '../../components/ui/button.js';

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

function generateId(): string {
  return crypto.randomUUID();
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
  const selectedConcept =
    selectedNode?.nodeType === 'concept'
      ? catalogConcepts.find((c) => c.id === selectedNode.ref) ?? null
      : null;

  const canHandoff = compileResult?.success === true;

  // ─────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
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
            draft v{selectedGraph.version} · rev {selectedGraph.currentRevisionNumber ?? '—'}
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
