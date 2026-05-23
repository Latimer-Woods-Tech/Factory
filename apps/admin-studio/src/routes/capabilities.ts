import { Hono } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import type { AppEnv } from '../types.js';
import {
  CapabilityResolutionError,
  type CapabilityResolution,
  listCapabilityCatalog,
  resolveCapabilityConcept,
} from '../lib/capability-registry.js';
import type { CapabilityPlan } from '../lib/capability-plan.js';
import { compileCapabilityPlan, renderCapabilityPlanPreview } from '../lib/capability-plan.js';

const capabilities = new Hono<AppEnv>();

capabilities.get('/', (c) => {
  return c.json(listCapabilityCatalog());
});

capabilities.post('/resolve', async (c) => {
  const body = await c.req
    .json<{ conceptId?: string; params?: Record<string, unknown> }>()
    .catch((): { conceptId?: string; params?: Record<string, unknown> } => ({}));

  if (!body.conceptId || typeof body.conceptId !== 'string') {
    return c.json({ error: 'conceptId is required' }, 400);
  }

  try {
    const resolution = resolveCapabilityConcept(body.conceptId, body.params ?? {});
    c.set('auditAction', 'capabilities.resolve');
    c.set('auditResource', body.conceptId);
    c.set('auditReversibility', 'reversible');
    c.set('auditResultDetail', {
      conceptId: body.conceptId,
      recipeId: resolution.recipe.id,
      nextStep: resolution.nextStep.action,
    });
    return c.json(resolution);
  } catch (error) {
    if (error instanceof CapabilityResolutionError) {
      return c.json({ error: error.message }, { status: error.status as 400 | 404 | 500 });
    }
    throw error;
  }
});

capabilities.post('/preview', async (c) => {
  const body = await c.req
    .json<{ conceptId?: string; params?: Record<string, unknown> }>()
    .catch((): { conceptId?: string; params?: Record<string, unknown> } => ({}));

  if (!body.conceptId || typeof body.conceptId !== 'string') {
    return c.json({ error: 'conceptId is required' }, 400);
  }

  try {
    const resolution = resolveCapabilityConcept(body.conceptId, body.params ?? {});
    return c.json(buildPreviewResponse(body.conceptId, resolution));
  } catch (error) {
    if (error instanceof CapabilityResolutionError) {
      return c.json({ error: error.message }, { status: error.status as 400 | 404 | 500 });
    }
    throw error;
  }
});

capabilities.post('/handoff', async (c) => {
  const body = await c.req
    .json<{ conceptId?: string; params?: Record<string, unknown> }>()
    .catch((): { conceptId?: string; params?: Record<string, unknown> } => ({}));

  if (!body.conceptId || typeof body.conceptId !== 'string') {
    return c.json({ error: 'conceptId is required' }, 400);
  }

  try {
    const resolution = resolveCapabilityConcept(body.conceptId, body.params ?? {});
    const previewResponse = buildPreviewResponse(body.conceptId, resolution);
    const handoff = buildScaffoldHandoff(previewResponse);

    c.set('auditAction', 'capabilities.handoff');
    c.set('auditResource', body.conceptId);
    c.set('auditReversibility', 'reversible');
    c.set('auditResultDetail', {
      conceptId: body.conceptId,
      recipeId: handoff.recipeId,
      nextAction: handoff.nextAction.action,
      stagingFirst: handoff.plan.scaffold.stagingFirst,
    });

    return c.json({
      generatedAt: previewResponse.generatedAt,
      handoff,
    });
  } catch (error) {
    if (error instanceof CapabilityResolutionError) {
      return c.json({ error: error.message }, { status: error.status as 400 | 404 | 500 });
    }
    throw error;
  }
});

function buildPreviewResponse(conceptId: string, resolution: CapabilityResolution) {
  const plan = compileCapabilityPlan(resolution.recipe.id);
  const preview = renderCapabilityPlanPreview(plan);

  return {
    resolution,
    plan,
    preview,
    generatedAt: new Date().toISOString(),
    nextStep: {
      action: 'review-plan-preview',
      conceptId,
      recipeId: resolution.recipe.id,
    },
  };
}

function buildScaffoldHandoff(previewResponse: {
  resolution: CapabilityResolution;
  plan: CapabilityPlan;
  preview: string;
  nextStep: {
    action: string;
    conceptId: string;
    recipeId: string;
  };
}) {
  return {
    conceptId: previewResponse.resolution.concept.id,
    recipeId: previewResponse.resolution.recipe.id,
    parameters: previewResponse.resolution.parameters,
    plan: previewResponse.plan,
    preview: previewResponse.preview,
    nextAction: {
      action: 'generate-scaffold-handoff',
      conceptId: previewResponse.nextStep.conceptId,
      recipeId: previewResponse.nextStep.recipeId,
    },
  };
}

export default capabilities;
