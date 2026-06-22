import type { GraphEdge, GraphNode } from './graph-store.js';

type PrimitiveValue = string | number | boolean;

export interface GraphCreateInput {
  name: string;
  description?: string | null;
}

export interface GraphPatchInput {
  name?: string;
  description?: string | null;
  nodes?: GraphNode[];
  edges?: GraphEdge[];
  expectedVersion?: number;
}

export interface GraphValidationIssue {
  field: string;
  message: string;
}

export type GraphValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; issues: GraphValidationIssue[] };

const MAX_NAME_LENGTH = 120;
const MAX_DESCRIPTION_LENGTH = 2000;
const MAX_LABEL_LENGTH = 160;
const MAX_GRAPH_ITEMS = 500;

export function parseGraphCreateInput(body: unknown): GraphValidationResult<GraphCreateInput> {
  const issues: GraphValidationIssue[] = [];
  if (!isPlainObject(body)) {
    return invalid([{ field: 'body', message: 'request body must be a JSON object' }]);
  }

  const name = normalizeRequiredTrimmedString(body.name, 'name', issues, MAX_NAME_LENGTH);
  const description = normalizeOptionalNullableString(
    body.description,
    'description',
    issues,
    MAX_DESCRIPTION_LENGTH,
  );

  if (issues.length > 0 || !name) return invalid(issues);

  return {
    ok: true,
    value: {
      name,
      ...(description !== undefined ? { description } : {}),
    },
  };
}

export function parseGraphPatchInput(body: unknown): GraphValidationResult<GraphPatchInput> {
  if (!isPlainObject(body)) {
    return invalid([{ field: 'body', message: 'request body must be a JSON object' }]);
  }

  const issues: GraphValidationIssue[] = [];
  const patch: GraphPatchInput = {};

  if ('name' in body) {
    const name = normalizeRequiredTrimmedString(body.name, 'name', issues, MAX_NAME_LENGTH);
    if (name) patch.name = name;
  }

  if ('description' in body) {
    const description = normalizeOptionalNullableString(
      body.description,
      'description',
      issues,
      MAX_DESCRIPTION_LENGTH,
    );
    patch.description = description ?? null;
  }

  if ('expectedVersion' in body) {
    const expectedVersion = body.expectedVersion;
    if (!Number.isInteger(expectedVersion) || (expectedVersion as number) < 1) {
      issues.push({
        field: 'expectedVersion',
        message: 'expectedVersion must be a positive integer',
      });
    } else {
      patch.expectedVersion = expectedVersion as number;
    }
  }

  if ('nodes' in body) {
    const nodes = parseGraphNodes(body.nodes, issues);
    if (nodes) patch.nodes = nodes;
  }

  if ('edges' in body) {
    const edges = parseGraphEdges(body.edges, issues);
    if (edges) patch.edges = edges;
  }

  if (patch.nodes && patch.edges) {
    const nodeIds = new Set(patch.nodes.map((node) => node.id));
    for (let i = 0; i < patch.edges.length; i += 1) {
      const edge = patch.edges[i]!;
      if (!nodeIds.has(edge.sourceNodeId)) {
        issues.push({
          field: `edges[${i}].sourceNodeId`,
          message: `source node "${edge.sourceNodeId}" does not exist in nodes`,
        });
      }
      if (!nodeIds.has(edge.targetNodeId)) {
        issues.push({
          field: `edges[${i}].targetNodeId`,
          message: `target node "${edge.targetNodeId}" does not exist in nodes`,
        });
      }
    }
  }

  const hasMutableField =
    'name' in body ||
    'description' in body ||
    'nodes' in body ||
    'edges' in body;

  if (!hasMutableField) {
    issues.push({
      field: 'body',
      message: 'at least one of name, description, nodes, or edges must be provided',
    });
  }

  if (issues.length > 0) return invalid(issues);
  return { ok: true, value: patch };
}

function parseGraphNodes(input: unknown, issues: GraphValidationIssue[]): GraphNode[] | null {
  if (!Array.isArray(input)) {
    issues.push({ field: 'nodes', message: 'nodes must be an array' });
    return null;
  }
  if (input.length > MAX_GRAPH_ITEMS) {
    issues.push({
      field: 'nodes',
      message: `nodes may contain at most ${MAX_GRAPH_ITEMS} items`,
    });
  }

  const seenIds = new Set<string>();
  const nodes: GraphNode[] = [];

  for (let i = 0; i < input.length; i += 1) {
    const candidate = input[i];
    if (!isPlainObject(candidate)) {
      issues.push({ field: `nodes[${i}]`, message: 'node must be an object' });
      continue;
    }

    const id = normalizeRequiredTrimmedString(candidate.id, `nodes[${i}].id`, issues);
    const ref = normalizeRequiredTrimmedString(candidate.ref, `nodes[${i}].ref`, issues);
    const nodeType = parseNodeType(candidate.nodeType, `nodes[${i}].nodeType`, issues);
    const position = parsePosition(candidate.position, `nodes[${i}].position`, issues);
    const label = normalizeOptionalString(candidate.label, `nodes[${i}].label`, issues, MAX_LABEL_LENGTH);
    const params = parseParams(candidate.params, `nodes[${i}].params`, issues);

    if (id) {
      if (seenIds.has(id)) {
        issues.push({ field: `nodes[${i}].id`, message: `duplicate node id "${id}"` });
      } else {
        seenIds.add(id);
      }
    }

    if (!id || !ref || !nodeType || !position) continue;

    nodes.push({
      id,
      ref,
      nodeType,
      position,
      ...(label !== undefined ? { label } : {}),
      ...(params !== undefined ? { params } : {}),
    });
  }

  return nodes;
}

function parseGraphEdges(input: unknown, issues: GraphValidationIssue[]): GraphEdge[] | null {
  if (!Array.isArray(input)) {
    issues.push({ field: 'edges', message: 'edges must be an array' });
    return null;
  }
  if (input.length > MAX_GRAPH_ITEMS) {
    issues.push({
      field: 'edges',
      message: `edges may contain at most ${MAX_GRAPH_ITEMS} items`,
    });
  }

  const seenIds = new Set<string>();
  const edges: GraphEdge[] = [];

  for (let i = 0; i < input.length; i += 1) {
    const candidate = input[i];
    if (!isPlainObject(candidate)) {
      issues.push({ field: `edges[${i}]`, message: 'edge must be an object' });
      continue;
    }

    const id = normalizeRequiredTrimmedString(candidate.id, `edges[${i}].id`, issues);
    const sourceNodeId = normalizeRequiredTrimmedString(
      candidate.sourceNodeId,
      `edges[${i}].sourceNodeId`,
      issues,
    );
    const targetNodeId = normalizeRequiredTrimmedString(
      candidate.targetNodeId,
      `edges[${i}].targetNodeId`,
      issues,
    );
    const label = normalizeOptionalString(candidate.label, `edges[${i}].label`, issues, MAX_LABEL_LENGTH);

    if (id) {
      if (seenIds.has(id)) {
        issues.push({ field: `edges[${i}].id`, message: `duplicate edge id "${id}"` });
      } else {
        seenIds.add(id);
      }
    }

    if (!id || !sourceNodeId || !targetNodeId) continue;

    edges.push({
      id,
      sourceNodeId,
      targetNodeId,
      ...(label !== undefined ? { label } : {}),
    });
  }

  return edges;
}

function parseNodeType(
  value: unknown,
  field: string,
  issues: GraphValidationIssue[],
): GraphNode['nodeType'] | null {
  if (value === 'primitive' || value === 'concept') return value;
  issues.push({ field, message: "nodeType must be 'primitive' or 'concept'" });
  return null;
}

function parsePosition(
  value: unknown,
  field: string,
  issues: GraphValidationIssue[],
): GraphNode['position'] | null {
  if (!isPlainObject(value)) {
    issues.push({ field, message: 'position must be an object with numeric x and y' });
    return null;
  }

  const x = parseFiniteNumber(value.x, `${field}.x`, issues);
  const y = parseFiniteNumber(value.y, `${field}.y`, issues);
  if (x === null || y === null) return null;
  return { x, y };
}

function parseParams(
  value: unknown,
  field: string,
  issues: GraphValidationIssue[],
): Record<string, PrimitiveValue> | undefined {
  if (value === undefined) return undefined;
  if (!isPlainObject(value)) {
    issues.push({ field, message: 'params must be an object' });
    return undefined;
  }

  const params: Record<string, PrimitiveValue> = {};
  for (const [key, raw] of Object.entries(value)) {
    if (!key.trim()) {
      issues.push({ field, message: 'params keys must be non-empty strings' });
      continue;
    }
    if (!isPrimitiveParam(raw)) {
      issues.push({
        field: `${field}.${key}`,
        message: 'param values must be string, finite number, or boolean',
      });
      continue;
    }
    params[key] = raw;
  }
  return params;
}

function parseFiniteNumber(
  value: unknown,
  field: string,
  issues: GraphValidationIssue[],
): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    issues.push({ field, message: 'must be a finite number' });
    return null;
  }
  return value;
}

function normalizeRequiredTrimmedString(
  value: unknown,
  field: string,
  issues: GraphValidationIssue[],
  maxLength = MAX_LABEL_LENGTH,
): string | null {
  if (typeof value !== 'string') {
    issues.push({ field, message: 'must be a string' });
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    issues.push({ field, message: 'must not be empty' });
    return null;
  }
  if (trimmed.length > maxLength) {
    issues.push({ field, message: `must be at most ${maxLength} characters` });
    return null;
  }
  return trimmed;
}

function normalizeOptionalString(
  value: unknown,
  field: string,
  issues: GraphValidationIssue[],
  maxLength = MAX_LABEL_LENGTH,
): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string') {
    issues.push({ field, message: 'must be a string' });
    return undefined;
  }
  if (value.length > maxLength) {
    issues.push({ field, message: `must be at most ${maxLength} characters` });
    return undefined;
  }
  return value;
}

function normalizeOptionalNullableString(
  value: unknown,
  field: string,
  issues: GraphValidationIssue[],
  maxLength: number,
): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== 'string') {
    issues.push({ field, message: 'must be a string or null' });
    return undefined;
  }
  if (value.length > maxLength) {
    issues.push({ field, message: `must be at most ${maxLength} characters` });
    return undefined;
  }
  return value;
}

function isPrimitiveParam(value: unknown): value is PrimitiveValue {
  return (
    typeof value === 'string' ||
    typeof value === 'boolean' ||
    (typeof value === 'number' && Number.isFinite(value))
  );
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function invalid<T>(issues: GraphValidationIssue[]): GraphValidationResult<T> {
  return { ok: false, issues };
}
