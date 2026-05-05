import type { Template } from './load';

/**
 * Fill template slot placeholders from an input context. Phase 1: literal
 * substitution + simple regex extraction from the description. Phase 2
 * (SUP-3.5) upgrades to narrow LLM call per D1 architecture.
 */
export interface ParameterizedPlan {
  template_id: string;
  tier: 'green' | 'yellow' | 'red';
  steps: Array<{
    tool: string;
    slots: Record<string, unknown>;
    side_effects: 'none' | 'read-external' | 'write-app' | 'write-external';
  }>;
  audit: {
    matched_description: string;
    source: string;
    parameterized_at: number;
  };
}

export function parameterize(
  template: Template,
  ctx: { description: string; source: string },
): ParameterizedPlan {
  const steps = (template.steps ?? []).map((step) => ({
    tool: step.tool,
    slots: literalFill(step.slots ?? {}, ctx),
    side_effects: step.side_effects ?? 'none',
  }));
  return {
    template_id: template.id,
    tier: template.tier,
    steps,
    audit: {
      matched_description: ctx.description,
      source: ctx.source,
      parameterized_at: Date.now(),
    },
  };
}

function literalFill(
  slots: Record<string, unknown>,
  ctx: { description: string; source: string },
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(slots)) {
    out[k] = typeof v === 'string'
      ? v.replace(/\{\{description\}\}/g, ctx.description).replace(/\{\{source\}\}/g, ctx.source)
      : v;
  }
  return out;
}
