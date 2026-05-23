import { describe, expect, it } from 'vitest';
import capabilities from '../src/routes/capabilities';
import { resolveCapabilityConcept } from '../src/lib/capability-registry';

const env = {} as never;
const executionContext = {} as ExecutionContext;

describe('capabilities integration', () => {
  it('lists the governed capability catalog', async () => {
    const res = await capabilities.fetch(
      new Request('https://admin-studio.example/'),
      env,
      executionContext,
    );

    expect(res.status).toBe(200);
    const body = await res.json<{ concepts: Array<{ id: string }> }>();
    expect(body.concepts.map((concept) => concept.id)).toContain('outbound-dialer-campaign');
  });

  it('routes csv-import concepts to the importer recipe variant', () => {
    const resolution = resolveCapabilityConcept('outbound-dialer-campaign', {
      workerDomain: 'dialer.example.com',
      campaignSource: 'csv-import',
    });

    expect(resolution.recipe.id).toBe('outbound-dialer-importer');
    expect(resolution.resolution.strategy).toBe('parameter-rules');
    expect(resolution.resolution.matchedRuleId).toBe('csv-import-uses-importer');
  });

  it('resolves a concept into an approved recipe handoff over HTTP', async () => {
    const res = await capabilities.fetch(
      new Request('https://admin-studio.example/resolve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conceptId: 'outbound-dialer-campaign',
          params: {
            workerDomain: 'dialer.example.com',
            campaignSource: 'csv-import',
          },
        }),
      }),
      env,
      executionContext,
    );

    expect(res.status).toBe(200);
    const body = await res.json<{
      recipe: { id: string };
      resolution: { strategy: string; matchedRuleId: string | null };
    }>();
    expect(body.recipe.id).toBe('outbound-dialer-importer');
    expect(body.resolution.strategy).toBe('parameter-rules');
    expect(body.resolution.matchedRuleId).toBe('csv-import-uses-importer');
  });

  it('renders a compiled plan preview for a resolved concept over HTTP', async () => {
    const res = await capabilities.fetch(
      new Request('https://admin-studio.example/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conceptId: 'outbound-dialer-campaign',
          params: {
            workerDomain: 'dialer.example.com',
            campaignSource: 'csv-import',
          },
        }),
      }),
      env,
      executionContext,
    );

    expect(res.status).toBe(200);
    const body = await res.json<{
      resolution: { recipe: { id: string } };
      plan: { recipe: { id: string }; expectedSurfaces: string[] };
      preview: string;
      nextStep: { action: string };
    }>();
    expect(body.resolution.recipe.id).toBe('outbound-dialer-importer');
    expect(body.plan.recipe.id).toBe('outbound-dialer-importer');
    expect(body.plan.expectedSurfaces).toContain('/api/imports');
    expect(body.preview).toContain('# Capability Plan Preview — outbound-dialer-importer');
    expect(body.nextStep.action).toBe('review-plan-preview');
  });

  it('generates a scaffold handoff artifact over HTTP', async () => {
    const res = await capabilities.fetch(
      new Request('https://admin-studio.example/handoff', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conceptId: 'outbound-dialer-campaign',
          params: {
            workerDomain: 'dialer.example.com',
            campaignSource: 'csv-import',
          },
        }),
      }),
      env,
      executionContext,
    );

    expect(res.status).toBe(200);
    const body = await res.json<{
      handoff: {
        conceptId: string;
        recipeId: string;
        parameters: Record<string, string | number | boolean | null>;
        plan: { scaffold: { stagingFirst: boolean } };
        nextAction: { action: string; recipeId: string };
      };
    }>();
    expect(body.handoff.conceptId).toBe('outbound-dialer-campaign');
    expect(body.handoff.recipeId).toBe('outbound-dialer-importer');
    expect(body.handoff.parameters.workerDomain).toBe('dialer.example.com');
    expect(body.handoff.plan.scaffold.stagingFirst).toBe(true);
    expect(body.handoff.nextAction.action).toBe('generate-scaffold-handoff');
    expect(body.handoff.nextAction.recipeId).toBe('outbound-dialer-importer');
  });

  it('returns 400 when conceptId is missing', async () => {
    const res = await capabilities.fetch(
      new Request('https://admin-studio.example/resolve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ params: {} }),
      }),
      env,
      executionContext,
    );

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: 'conceptId is required' });
  });
});
