import { describe, expect, it } from 'vitest';
import capabilities from '../src/routes/capabilities';
import {
  compareConceptsByOperatorRelevance,
  resolveCapabilityConcept,
} from '../src/lib/capability-registry';

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

  it('generates a content-addressable scaffold handoff artifact over HTTP', async () => {
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
        schemaVersion: string;
        kind: string;
        conceptId: string;
        recipeId: string;
        parameters: Record<string, string | number | boolean | null>;
        plan: { scaffold: { stagingFirst: boolean } };
        nextAction: { action: string; recipeId: string };
        hash: string;
        id: string | null;
      };
    }>();
    expect(body.handoff.schemaVersion).toBe('1.0.0');
    expect(body.handoff.kind).toBe('scaffold-handoff');
    expect(body.handoff.conceptId).toBe('outbound-dialer-campaign');
    expect(body.handoff.recipeId).toBe('outbound-dialer-importer');
    expect(body.handoff.parameters.workerDomain).toBe('dialer.example.com');
    expect(body.handoff.plan.scaffold.stagingFirst).toBe(true);
    expect(body.handoff.nextAction.action).toBe('generate-scaffold-handoff');
    expect(body.handoff.nextAction.recipeId).toBe('outbound-dialer-importer');
    // Hash is a 64-char hex SHA-256 digest, deterministic on this input.
    expect(body.handoff.hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('returns the same handoff hash for identical inputs (content-addressable)', async () => {
    const makeRequest = () =>
      capabilities.fetch(
        new Request('https://admin-studio.example/handoff', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            conceptId: 'outbound-dialer-campaign',
            params: { workerDomain: 'dialer.example.com', campaignSource: 'csv-import' },
          }),
        }),
        env,
        executionContext,
      );

    const first = await (await makeRequest()).json<{ handoff: { hash: string } }>();
    const second = await (await makeRequest()).json<{ handoff: { hash: string } }>();
    expect(first.handoff.hash).toBe(second.handoff.hash);
  });

  it('returns a different handoff hash when params change', async () => {
    const fetchHash = async (params: Record<string, unknown>) => {
      const res = await capabilities.fetch(
        new Request('https://admin-studio.example/handoff', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ conceptId: 'outbound-dialer-campaign', params }),
        }),
        env,
        executionContext,
      );
      const body = (await res.json()) as { handoff: { hash: string } };
      return body.handoff.hash;
    };

    const csvHash = await fetchHash({
      workerDomain: 'dialer.example.com',
      campaignSource: 'csv-import',
    });
    const crmHash = await fetchHash({
      workerDomain: 'dialer.example.com',
      campaignSource: 'crm-segment',
    });
    expect(csvHash).not.toBe(crmHash);
  });

  it('orders catalog concepts by approval tier → maturity → alphabetical', async () => {
    const res = await capabilities.fetch(
      new Request('https://admin-studio.example/'),
      env,
      executionContext,
    );
    const body = await res.json<{ concepts: Array<{ id: string; approvalTier: string; maturity: string }> }>();
    const ids = body.concepts.map((c) => c.id);
    // outbound-dialer-campaign is golden/beta; voice-intake-bot is
    // experimental/experimental → dialer must sort first.
    const dialerIdx = ids.indexOf('outbound-dialer-campaign');
    const intakeIdx = ids.indexOf('voice-intake-bot');
    expect(dialerIdx).toBeGreaterThanOrEqual(0);
    expect(intakeIdx).toBeGreaterThanOrEqual(0);
    expect(dialerIdx).toBeLessThan(intakeIdx);
  });

  it('resolves voice-intake-bot to the voice-intake-agent recipe via default selection', () => {
    const resolution = resolveCapabilityConcept('voice-intake-bot', {
      workerDomain: 'intake.example.com',
      intakePhoneNumber: '+15551234567',
    });
    expect(resolution.recipe.id).toBe('voice-intake-agent');
    expect(resolution.recipe.primitives).toContain('llm');
    // No matchAll rule applies — strategy should fall back to first-approved-candidate.
    expect(resolution.resolution.strategy).toBe('first-approved-recipe-candidate');
  });

  it('compares concepts by golden > supported > experimental, then stable > beta > experimental', () => {
    const golden = { approvalTier: 'golden', maturity: 'beta', displayName: 'B' } as never;
    const supported = { approvalTier: 'supported', maturity: 'stable', displayName: 'A' } as never;
    const experimental = { approvalTier: 'experimental', maturity: 'experimental', displayName: 'Z' } as never;
    expect(compareConceptsByOperatorRelevance(golden, supported)).toBeLessThan(0);
    expect(compareConceptsByOperatorRelevance(supported, experimental)).toBeLessThan(0);
    expect(
      compareConceptsByOperatorRelevance(
        { approvalTier: 'golden', maturity: 'stable', displayName: 'B' } as never,
        { approvalTier: 'golden', maturity: 'beta', displayName: 'A' } as never,
      ),
    ).toBeLessThan(0);
  });

  it('rejects provision-staging without an auth context (401)', async () => {
    const res = await capabilities.fetch(
      new Request('https://admin-studio.example/provision-staging', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ handoffId: 'whatever' }),
      }),
      env,
      executionContext,
    );
    expect(res.status).toBe(401);
  });

  it('rejects lineage endpoints without an auth context (401)', async () => {
    const handoffsRes = await capabilities.fetch(
      new Request('https://admin-studio.example/handoffs'),
      env,
      executionContext,
    );
    expect(handoffsRes.status).toBe(401);

    const requestsRes = await capabilities.fetch(
      new Request('https://admin-studio.example/provision-requests'),
      env,
      executionContext,
    );
    expect(requestsRes.status).toBe(401);
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
