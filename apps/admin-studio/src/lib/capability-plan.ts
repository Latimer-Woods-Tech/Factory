import {
  capabilityCatalog,
  capabilityPrimitives,
  capabilityRuleBundle,
  type CapabilityRecipeDetail,
} from './capability-data.js';

export interface CapabilityPlan {
  schemaVersion: '1.0.0';
  kind: 'plan';
  recipe: {
    id: string;
    version: string;
    maturity: string;
    summary: string;
    goal: string;
  };
  packages: Array<{
    primitiveId: string;
    package: string;
    versionRange: string;
  }>;
  env: {
    secrets: string[];
    vars: string[];
    policyTags: string[];
  };
  bindings: {
    required: string[];
    optional: string[];
  };
  expectedSurfaces: string[];
  smokeChecks: Array<{
    path: string;
    expectedStatus: number;
    expectContains?: string;
  }>;
  constraints: string[];
  scaffold: {
    entryScript: string;
    stagingFirst: boolean;
    requiredSecrets: string[];
    requiredBindings: string[];
    requiredVars: string[];
  };
}

const BASE_SCAFFOLD_SECRETS = ['JWT_SECRET'];
const BASE_SCAFFOLD_BINDINGS = ['AUTH_RATE_LIMITER', 'DB', 'FLAG_TELEMETRY', 'FLAGS'];
const BASE_SCAFFOLD_VARS = ['ENVIRONMENT', 'WORKER_NAME'];
const recipesById = new Map(capabilityCatalog.recipes.map((recipe) => [recipe.id, recipe]));

export function compileCapabilityPlan(recipeId: string): CapabilityPlan {
  const recipe = recipesById.get(recipeId);
  if (!recipe) {
    throw new Error(`Unknown recipe: ${recipeId}`);
  }

  const primitiveRecords = [...recipe.primitives, ...recipe.optionalPrimitives]
    .map((id) => capabilityPrimitives.get(id))
    .filter((primitive): primitive is NonNullable<typeof primitive> => Boolean(primitive));

  const violatedRules = collectRuleViolations(recipe, capabilityRuleBundle.rules ?? []);
  if (violatedRules.length > 0) {
    throw new Error(violatedRules.join('; '));
  }

  return {
    schemaVersion: '1.0.0',
    kind: 'plan',
    recipe: {
      id: recipe.id,
      version: recipe.version,
      maturity: recipe.maturity,
      summary: recipe.summary,
      goal: recipe.goal,
    },
    packages: primitiveRecords
      .map((primitive) => ({
        primitiveId: primitive.id,
        package: primitive.package,
        versionRange: primitive.versionRange,
      }))
      .sort((left, right) => left.primitiveId.localeCompare(right.primitiveId)),
    env: {
      secrets: sortUnique([
        ...BASE_SCAFFOLD_SECRETS,
        ...recipe.envContract.secrets,
        ...primitiveRecords.flatMap((primitive) => primitive.requirements.secrets ?? []),
      ]),
      vars: sortUnique([...BASE_SCAFFOLD_VARS, ...recipe.envContract.vars]),
      policyTags: sortUnique(primitiveRecords.flatMap((primitive) => primitive.contracts.policyTags ?? [])),
    },
    bindings: {
      required: sortUnique([
        ...BASE_SCAFFOLD_BINDINGS,
        ...recipe.bindingContract.required,
        ...primitiveRecords.flatMap((primitive) => primitive.requirements.bindings ?? []),
      ]),
      optional: sortUnique(recipe.bindingContract.optional),
    },
    expectedSurfaces: [...recipe.expectedSurfaces],
    smokeChecks: [...recipe.smokeChecks],
    constraints: [...recipe.constraints],
    scaffold: {
      entryScript: 'packages/deploy/scripts/scaffold.mjs',
      stagingFirst: true,
      requiredSecrets: [...BASE_SCAFFOLD_SECRETS],
      requiredBindings: sortUnique([
        ...BASE_SCAFFOLD_BINDINGS,
        ...recipe.bindingContract.required,
        ...primitiveRecords.flatMap((primitive) => primitive.requirements.bindings ?? []),
      ]),
      requiredVars: sortUnique([...BASE_SCAFFOLD_VARS, ...recipe.envContract.vars]),
    },
  };
}

export function renderCapabilityPlanPreview(plan: CapabilityPlan): string {
  const lines = [
    `# Capability Plan Preview — ${plan.recipe.id}`,
    '',
    `**Summary:** ${plan.recipe.summary}`,
    '',
    `**Goal:** ${plan.recipe.goal}`,
    '',
    '## Packages',
    '',
    ...plan.packages.map((pkg) => `- ${pkg.primitiveId}: ${pkg.package} (${pkg.versionRange})`),
    '',
    '## Environment',
    '',
    '- Secrets:',
    ...plan.env.secrets.map((secret) => `  - ${secret}`),
    '',
    '- Vars:',
    ...plan.env.vars.map((variable) => `  - ${variable}`),
    '',
    '- Policy tags:',
    ...plan.env.policyTags.map((tag) => `  - ${tag}`),
    '',
    '## Bindings',
    '',
    ...plan.bindings.required.map((binding) => `- required: ${binding}`),
    ...plan.bindings.optional.map((binding) => `- optional: ${binding}`),
    '',
    '## Expected Surfaces',
    '',
    ...plan.expectedSurfaces.map((surface) => `- ${surface}`),
    '',
    '## Smoke Checks',
    '',
    ...plan.smokeChecks.map((check) => `- ${check.path}: expected ${check.expectedStatus}${check.expectContains ? `, contains ${check.expectContains}` : ''}`),
    '',
    '## Constraints',
    '',
    ...plan.constraints.map((constraint) => `- ${constraint}`),
    '',
    '## Scaffold Contract',
    '',
    `- entryScript: ${plan.scaffold.entryScript}`,
    `- stagingFirst: ${plan.scaffold.stagingFirst}`,
    `- requiredSecrets: ${plan.scaffold.requiredSecrets.join(', ')}`,
    `- requiredBindings: ${plan.scaffold.requiredBindings.join(', ')}`,
    `- requiredVars: ${plan.scaffold.requiredVars.join(', ')}`,
    '',
    '## Implementation Notes',
    '',
    '- This preview is the human-readable contract for the first golden path.',
    '- It should be used to validate the compiled plan before provisioning.',
    '- It is not a substitute for the true plan JSON contract.',
    '',
  ];

  return lines.join('\n');
}

function collectRuleViolations(
  recipe: CapabilityRecipeDetail,
  rules: Array<{ id: string; ifAllPrimitives?: string[]; thenRequirePrimitives?: string[] }>,
): string[] {
  const declared = new Set([...recipe.primitives, ...recipe.optionalPrimitives]);
  const violations: string[] = [];
  for (const rule of rules) {
    const matches = (rule.ifAllPrimitives ?? []).every((primitiveId) => declared.has(primitiveId));
    if (!matches) {
      continue;
    }
    for (const requiredPrimitive of rule.thenRequirePrimitives ?? []) {
      if (!declared.has(requiredPrimitive)) {
        violations.push(`Recipe ${recipe.id} violates rule ${rule.id}: missing primitive ${requiredPrimitive}`);
      }
    }
  }
  return violations;
}

function sortUnique(values: string[]): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}
