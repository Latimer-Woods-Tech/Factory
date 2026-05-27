/**
 * Graph compiler — Phase 5 Visual Composer.
 *
 * Compiles a GraphDocument into the same CapabilityPlan produced by the
 * recipe-first flow. This ensures the visual composer never invents new
 * runtime semantics.
 *
 * v1 constraint: only graphs with exactly one concept node are supported.
 * Multi-concept composition is planned for Phase 6.
 */

import type { GraphDocument } from './graph-store.js';
import {
  resolveCapabilityConcept,
  listCapabilityCatalog,
  CapabilityResolutionError,
} from './capability-registry.js';
import { compileCapabilityPlan } from './capability-plan.js';
import type { CapabilityPlan } from './capability-plan.js';
import type { CapabilityResolution } from './capability-registry.js';
import { capabilityPrimitives } from './capability-data.js';

export interface GraphValidationError {
  nodeId?: string;
  edgeId?: string;
  code: string;
  message: string;
}

export interface GraphValidationWarning {
  nodeId?: string;
  edgeId?: string;
  code: string;
  message: string;
}

export interface GraphCompileResult {
  success: boolean;
  errors: GraphValidationError[];
  warnings: GraphValidationWarning[];
  plan: CapabilityPlan | null;
  recipeId: string | null;
  resolution: CapabilityResolution | null;
}

/**
 * Compile a graph document to a CapabilityPlan.
 *
 * The algorithm for v1:
 * 1. Validate all node refs exist in the catalog.
 * 2. Require exactly one concept node.
 * 3. Validate edges reference real node ids (warnings, not errors).
 * 4. Resolve the concept using its params.
 * 5. Compile the resolved recipe to a plan.
 *
 * Primitive nodes are validated for catalog membership but are informational
 * in v1 — they don't alter the compiled plan. In a future version, the
 * compiler will cross-check that the selected concept actually uses all the
 * declared primitive nodes.
 */
export function compileGraph(graph: GraphDocument): GraphCompileResult {
  const errors: GraphValidationError[] = [];
  const warnings: GraphValidationWarning[] = [];

  const catalog = listCapabilityCatalog();
  const primitiveIds = new Set(
    [...capabilityPrimitives.keys()],
  );
  const conceptIds = new Set(
    (catalog.concepts ?? []).map((c: { id: string }) => c.id),
  );

  // 1. Validate node refs
  for (const node of graph.nodes) {
    if (node.nodeType === 'primitive') {
      if (!primitiveIds.has(node.ref)) {
        errors.push({
          nodeId: node.id,
          code: 'UNKNOWN_PRIMITIVE',
          message: `Unknown primitive: "${node.ref}". Must be one of: ${[...primitiveIds].join(', ')}`,
        });
      }
    } else if (node.nodeType === 'concept') {
      if (!conceptIds.has(node.ref)) {
        errors.push({
          nodeId: node.id,
          code: 'UNKNOWN_CONCEPT',
          message: `Unknown concept: "${node.ref}". Must be one of: ${[...conceptIds].join(', ')}`,
        });
      }
    } else {
      // node.nodeType is `never` here — TypeScript has exhausted the union.
      // Use a string conversion to surface the unexpected value in the error message.
      const unknownType: string = String((node as { nodeType: unknown }).nodeType);
      errors.push({
        nodeId: node.id,
        code: 'INVALID_NODE_TYPE',
        message: `Unknown nodeType: "${unknownType}"`,
      });
    }
  }

  if (errors.length > 0) {
    return { success: false, errors, warnings, plan: null, recipeId: null, resolution: null };
  }

  // 2. Require exactly one concept node
  const conceptNodes = graph.nodes.filter((n) => n.nodeType === 'concept');
  if (conceptNodes.length === 0) {
    errors.push({
      code: 'NO_CONCEPT_NODE',
      message: 'The graph must contain at least one concept node. Add a concept from the palette.',
    });
    return { success: false, errors, warnings, plan: null, recipeId: null, resolution: null };
  }
  if (conceptNodes.length > 1) {
    errors.push({
      code: 'MULTI_CONCEPT_UNSUPPORTED',
      message: `Multi-concept composition is not yet supported (v1 constraint). Found ${conceptNodes.length} concept nodes — remove all but one.`,
    });
    return { success: false, errors, warnings, plan: null, recipeId: null, resolution: null };
  }

  // 3. Validate edges reference real node ids (warn, don't error)
  const nodeIds = new Set(graph.nodes.map((n) => n.id));
  for (const edge of graph.edges) {
    if (!nodeIds.has(edge.sourceNodeId)) {
      warnings.push({
        edgeId: edge.id,
        code: 'DANGLING_EDGE',
        message: `Edge ${edge.id} source "${edge.sourceNodeId}" not found in graph nodes — ignored`,
      });
    }
    if (!nodeIds.has(edge.targetNodeId)) {
      warnings.push({
        edgeId: edge.id,
        code: 'DANGLING_EDGE',
        message: `Edge ${edge.id} target "${edge.targetNodeId}" not found in graph nodes — ignored`,
      });
    }
  }

  // 4. Resolve the single concept node
  const conceptNode = conceptNodes[0]!;
  const params = (conceptNode.params ?? {}) as Record<string, string | number | boolean | null>;

  try {
    const resolution = resolveCapabilityConcept(conceptNode.ref, params);
    const plan = compileCapabilityPlan(resolution.recipe.id);

    // Warn if primitive nodes don't match the recipe's primitive requirements
    const primitiveNodes = graph.nodes
      .filter((n) => n.nodeType === 'primitive')
      .map((n) => n.ref);
    const recipePrimitives = resolution.recipe.primitives ?? [];

    for (const prim of primitiveNodes) {
      if (!recipePrimitives.includes(prim)) {
        warnings.push({
          code: 'UNUSED_PRIMITIVE',
          message: `Primitive "${prim}" is not required by recipe "${resolution.recipe.id}" and will be ignored.`,
        });
      }
    }
    for (const prim of recipePrimitives) {
      if (!primitiveNodes.includes(prim)) {
        warnings.push({
          code: 'MISSING_PRIMITIVE_NODE',
          message: `Recipe "${resolution.recipe.id}" requires primitive "${prim}" but no node for it exists in the graph.`,
        });
      }
    }

    return {
      success: true,
      errors: [],
      warnings,
      plan,
      recipeId: resolution.recipe.id,
      resolution,
    };
  } catch (err) {
    if (err instanceof CapabilityResolutionError) {
      errors.push({
        nodeId: conceptNode.id,
        code: 'RESOLUTION_FAILED',
        message: err.message,
      });
    } else {
      errors.push({
        nodeId: conceptNode.id,
        code: 'COMPILE_ERROR',
        message: err instanceof Error ? err.message : 'Compilation failed',
      });
    }
    return { success: false, errors, warnings, plan: null, recipeId: null, resolution: null };
  }
}
