/**
 * Shared TypeScript types for the capability catalog.
 *
 * The shapes match `capabilities/schema/*.schema.json` exactly. The generated
 * bundle (`capability-data.generated.ts`) is cast through these types so that
 * any drift between the on-disk registry and the worker code shows up as a
 * compile error.
 */

export type CapabilityParameterType = 'string' | 'boolean' | 'integer' | 'number';

export interface CapabilityParameterDefinition {
  id: string;
  type: CapabilityParameterType;
  description: string;
  required: boolean;
  enum: Array<string | number | boolean>;
  default: string | number | boolean | null;
  formatHint: string | null;
}

export interface CapabilityRecipeSummary {
  id: string;
  summary: string;
  maturity: string;
  primitives: string[];
  optionalPrimitives: string[];
}

export interface CapabilityConcept {
  id: string;
  displayName: string;
  summary: string;
  status: string;
  maturity: string;
  tags: string[];
  menuVisible: boolean;
  approvalTier: string;
  parameters: CapabilityParameterDefinition[];
  recipeSelection?: {
    defaultRecipeId: string;
    rules?: Array<{
      id: string;
      recipeId: string;
      matchAll: Array<{ parameter: string; equals: string | number | boolean }>;
    }>;
  } | null;
  recipes: CapabilityRecipeSummary[];
  sourcePrimitives: string[];
  qualification: {
    menuVisible: boolean;
    approvalTier: string;
    requiredCapabilities?: string[];
    disallowedEnvironments?: string[];
  };
}

export interface CapabilityRecipeDetail {
  id: string;
  version: string;
  maturity: string;
  summary: string;
  goal: string;
  primitives: string[];
  optionalPrimitives: string[];
  expectedSurfaces: string[];
  smokeChecks: Array<{ path: string; expectedStatus: number; expectContains?: string }>;
  constraints: string[];
  envContract: { secrets: string[]; vars: string[] };
  bindingContract: { required: string[]; optional: string[] };
}

export interface CapabilityPrimitiveDescriptor {
  id: string;
  package: string;
  versionRange: string;
  requirements: { secrets?: string[]; bindings?: string[] };
  contracts: { policyTags?: string[] };
}

export interface CapabilityRuleBundle {
  rules: Array<{
    id: string;
    ifAllPrimitives?: string[];
    thenRequirePrimitives?: string[];
  }>;
}

export interface CapabilityCatalogBundle {
  schemaVersion: '1.0.0';
  kind: 'capability-catalog';
  generatedAt: string;
  summary: {
    conceptCount: number;
    primitiveCount: number;
    recipeCount: number;
    ruleFileCount: number;
  };
  concepts: CapabilityConcept[];
  recipes: CapabilityRecipeDetail[];
  primitives: CapabilityPrimitiveDescriptor[];
  ruleBundle: CapabilityRuleBundle;
}
