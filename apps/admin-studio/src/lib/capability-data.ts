/**
 * Capability catalog facade.
 *
 * The data is generated from `capabilities/*.json` by
 * `scripts/capabilities/compile.mjs`. Do not edit the generated file; edit
 * the JSON sources and re-run the compile script. CI fails if the generated
 * file drifts from the registry.
 */

import {
  compiledCapabilityCatalog,
  compiledCapabilityPrimitives,
  compiledCapabilityRuleBundle,
} from './capability-data.generated.js';
import type {
  CapabilityCatalogBundle,
  CapabilityConcept,
  CapabilityPrimitiveDescriptor,
  CapabilityRecipeDetail,
  CapabilityRuleBundle,
} from './capability-types.js';

export type {
  CapabilityCatalogBundle,
  CapabilityConcept,
  CapabilityParameterDefinition,
  CapabilityParameterType,
  CapabilityPrimitiveDescriptor as PrimitiveDefinition,
  CapabilityRecipeDetail,
  CapabilityRecipeSummary,
  CapabilityRuleBundle,
} from './capability-types.js';

export const capabilityCatalog: {
  generatedAt: string;
  summary: CapabilityCatalogBundle['summary'];
  concepts: CapabilityConcept[];
  recipes: CapabilityRecipeDetail[];
} = {
  generatedAt: compiledCapabilityCatalog.generatedAt,
  summary: compiledCapabilityCatalog.summary,
  concepts: compiledCapabilityCatalog.concepts,
  recipes: compiledCapabilityCatalog.recipes,
};

export const capabilityPrimitives: Map<string, CapabilityPrimitiveDescriptor> = new Map(
  compiledCapabilityPrimitives.map((primitive) => [primitive.id, primitive]),
);

export const capabilityRuleBundle: CapabilityRuleBundle = compiledCapabilityRuleBundle;
