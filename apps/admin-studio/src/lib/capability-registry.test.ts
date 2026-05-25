import { describe, expect, it } from 'vitest';
import {
  CapabilityResolutionError,
  listCapabilityCatalog,
  resolveCapabilityConcept,
} from './capability-registry.js';

describe('capability-registry', () => {
  it('lists the visible governed concepts from the compiled catalog', () => {
    const catalog = listCapabilityCatalog();
    expect(catalog.summary.conceptCount).toBeGreaterThanOrEqual(1);
    expect(catalog.concepts.map((concept) => concept.id)).toContain('outbound-dialer-campaign');
  });

  it('resolves a concept into a concrete recipe and normalized parameters', () => {
    const resolution = resolveCapabilityConcept('outbound-dialer-campaign', {
      workerDomain: 'dialer.example.com',
      campaignSource: 'crm-segment',
    });

    expect(resolution.recipe.id).toBe('outbound-dialer');
    expect(resolution.parameters.workerDomain).toBe('dialer.example.com');
    expect(resolution.parameters.campaignSource).toBe('crm-segment');
    expect(resolution.parameters.enableVoiceSynthesis).toBe(true);
    expect(resolution.recipe.expectedSurfaces).toContain('/health');
  });

  it('routes csv-import concepts to the importer recipe variant', () => {
    const resolution = resolveCapabilityConcept('outbound-dialer-campaign', {
      workerDomain: 'dialer.example.com',
      campaignSource: 'csv-import',
    });

    expect(resolution.recipe.id).toBe('outbound-dialer-importer');
    expect(resolution.resolution.strategy).toBe('parameter-rules');
    expect(resolution.resolution.matchedRuleId).toBe('csv-import-uses-importer');
    expect(resolution.recipe.expectedSurfaces).toContain('/api/imports');
  });

  it('rejects unknown parameters', () => {
    expect(() =>
      resolveCapabilityConcept('outbound-dialer-campaign', {
        workerDomain: 'dialer.example.com',
        campaignSource: 'crm-segment',
        surprise: true,
      }),
    ).toThrowError(CapabilityResolutionError);
  });
});
