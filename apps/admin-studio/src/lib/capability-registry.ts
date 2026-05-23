import {
  capabilityCatalog,
  type CapabilityConcept,
  type CapabilityParameterDefinition,
  type CapabilityRecipeDetail,
  type CapabilityRecipeSummary,
} from './capability-data.js';

type CapabilityCatalogResponse = {
  generatedAt: string;
  summary: {
    primitiveCount: number;
    recipeCount: number;
    conceptCount: number;
    ruleFileCount: number;
  };
  concepts: CapabilityConcept[];
};

export interface CapabilityResolution {
  concept: {
    id: string;
    displayName: string;
    approvalTier: string;
  };
  recipe: CapabilityRecipeDetail;
  parameters: Record<string, string | number | boolean | null>;
  nextStep: {
    action: 'compile-recipe-plan';
    recipeId: string;
  };
  resolution: {
    strategy: 'first-approved-recipe-candidate' | 'parameter-rules';
    matchedRuleId: string | null;
  };
}

export class CapabilityResolutionError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const conceptsById = new Map(capabilityCatalog.concepts.map((concept) => [concept.id, concept]));
const recipesById = new Map(capabilityCatalog.recipes.map((recipe) => [recipe.id, recipe]));

/**
 * Operator-relevance ordering required by the Golden Design Concept Rail spec:
 * approval tier first (golden > supported > experimental), then maturity
 * (stable > beta > experimental > draft > deprecated > retired), then
 * alphabetical by displayName.
 *
 * Exported as a pure function so the same ordering can be reused by tests.
 */
const APPROVAL_TIER_RANK: Record<string, number> = {
  golden: 0,
  supported: 1,
  experimental: 2,
};
const MATURITY_RANK: Record<string, number> = {
  stable: 0,
  beta: 1,
  experimental: 2,
  draft: 3,
  deprecated: 4,
  retired: 5,
};

export function compareConceptsByOperatorRelevance(
  left: CapabilityConcept,
  right: CapabilityConcept,
): number {
  const tierDelta =
    (APPROVAL_TIER_RANK[left.approvalTier] ?? 99) -
    (APPROVAL_TIER_RANK[right.approvalTier] ?? 99);
  if (tierDelta !== 0) return tierDelta;
  const maturityDelta =
    (MATURITY_RANK[left.maturity] ?? 99) - (MATURITY_RANK[right.maturity] ?? 99);
  if (maturityDelta !== 0) return maturityDelta;
  return left.displayName.localeCompare(right.displayName);
}

export function listCapabilityCatalog(): CapabilityCatalogResponse {
  return {
    generatedAt: capabilityCatalog.generatedAt,
    summary: capabilityCatalog.summary,
    concepts: capabilityCatalog.concepts
      .filter((concept) => concept.menuVisible)
      .slice()
      .sort(compareConceptsByOperatorRelevance),
  };
}

export function resolveCapabilityConcept(
  conceptId: string,
  providedParams: Record<string, unknown>,
): CapabilityResolution {
  const concept = conceptsById.get(conceptId);
  if (!concept || !concept.menuVisible) {
    throw new CapabilityResolutionError(404, `Unknown capability concept: ${conceptId}`);
  }

  const errors = validateParams(concept.parameters, providedParams);
  if (errors.length > 0) {
    throw new CapabilityResolutionError(400, errors.join('; '));
  }

  const parameters = normalizeParams(concept.parameters, providedParams);
  const selection = selectRecipeSummary(concept, parameters);
  const recipeSummary = selection.recipe;
  if (!recipeSummary) {
    throw new CapabilityResolutionError(500, `Capability concept ${conceptId} has no recipe candidates`);
  }

  const recipe = recipesById.get(recipeSummary.id);
  if (!recipe) {
    throw new CapabilityResolutionError(500, `Capability concept ${conceptId} resolved to missing recipe ${recipeSummary.id}`);
  }

  return {
    concept: {
      id: concept.id,
      displayName: concept.displayName,
      approvalTier: concept.approvalTier,
    },
    recipe,
    parameters,
    nextStep: {
      action: 'compile-recipe-plan',
      recipeId: recipe.id,
    },
    resolution: {
      strategy: selection.strategy,
      matchedRuleId: selection.matchedRuleId,
    },
  };
}

function selectRecipeSummary(
  concept: CapabilityConcept,
  parameters: Record<string, string | number | boolean | null>,
): {
  recipe: CapabilityRecipeSummary | undefined;
  strategy: 'first-approved-recipe-candidate' | 'parameter-rules';
  matchedRuleId: string | null;
} {
  if (concept.recipeSelection) {
    for (const rule of concept.recipeSelection.rules ?? []) {
      if (rule.matchAll.every((condition) => parameters[condition.parameter] === condition.equals)) {
        return {
          recipe: concept.recipes.find((recipe) => recipe.id === rule.recipeId),
          strategy: 'parameter-rules',
          matchedRuleId: rule.id,
        };
      }
    }

    return {
      recipe: concept.recipes.find((recipe) => recipe.id === concept.recipeSelection?.defaultRecipeId),
      strategy: 'parameter-rules',
      matchedRuleId: null,
    };
  }

  return {
    recipe: [...concept.recipes].sort((left, right) => left.id.localeCompare(right.id))[0],
    strategy: 'first-approved-recipe-candidate',
    matchedRuleId: null,
  };
}

function validateParams(
  parameters: CapabilityParameterDefinition[],
  providedParams: Record<string, unknown>,
): string[] {
  const errors: string[] = [];
  const parameterMap = new Map(parameters.map((parameter) => [parameter.id, parameter]));

  for (const parameter of parameters) {
    if (parameter.required && !(parameter.id in providedParams) && parameter.default === null) {
      errors.push(`Missing required parameter "${parameter.id}"`);
    }
  }

  for (const [key, value] of Object.entries(providedParams)) {
    const parameter = parameterMap.get(key);
    if (!parameter) {
      errors.push(`Unknown parameter "${key}"`);
      continue;
    }

    const typeError = validateParameterType(parameter, value);
    if (typeError) {
      errors.push(typeError);
      continue;
    }

    if (parameter.enum.length > 0 && !parameter.enum.includes(value as never)) {
      errors.push(`Parameter "${parameter.id}" must be one of: ${parameter.enum.join(', ')}`);
    }
  }

  return errors;
}

function normalizeParams(
  parameters: CapabilityParameterDefinition[],
  providedParams: Record<string, unknown>,
): Record<string, string | number | boolean | null> {
  const normalized: Record<string, string | number | boolean | null> = {};
  for (const parameter of parameters) {
    normalized[parameter.id] = parameter.id in providedParams
      ? (providedParams[parameter.id] as string | number | boolean)
      : parameter.default;
  }
  return normalized;
}

function validateParameterType(
  parameter: CapabilityParameterDefinition,
  value: unknown,
): string | null {
  switch (parameter.type) {
    case 'string':
      return typeof value === 'string' ? null : `Parameter "${parameter.id}" must be a string`;
    case 'boolean':
      return typeof value === 'boolean' ? null : `Parameter "${parameter.id}" must be a boolean`;
    case 'integer':
      return Number.isInteger(value) ? null : `Parameter "${parameter.id}" must be an integer`;
    case 'number':
      return typeof value === 'number' && !Number.isNaN(value)
        ? null
        : `Parameter "${parameter.id}" must be a number`;
  }
}
