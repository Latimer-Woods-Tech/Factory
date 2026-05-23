// @vitest-environment happy-dom

import { describe, expect, it } from 'vitest';
import {
  buildCapabilityScaffoldHandoff,
  castFormValue,
  deriveCapabilityWorkflowStage,
  extractErrorMessage,
  initializeCapabilityFormValues,
} from './CapabilitiesTab';

describe('CapabilitiesTab helpers', () => {
  it('initializes form values from defaults, enums, booleans, and free-text fields', () => {
    const values = initializeCapabilityFormValues({
      parameters: [
        {
          id: 'workerDomain',
          type: 'string',
          description: 'Host',
          required: true,
          enum: [],
          default: null,
          formatHint: 'hostname',
        },
        {
          id: 'campaignSource',
          type: 'string',
          description: 'Source',
          required: true,
          enum: ['csv-import', 'crm-segment'],
          default: null,
          formatHint: null,
        },
        {
          id: 'enableVoiceSynthesis',
          type: 'boolean',
          description: 'Toggle',
          required: false,
          enum: [],
          default: true,
          formatHint: null,
        },
      ],
    });

    expect(values).toEqual({
      workerDomain: '',
      campaignSource: 'csv-import',
      enableVoiceSynthesis: true,
    });
  });

  it('casts form values based on parameter type', () => {
    expect(castFormValue('string', 'abc')).toBe('abc');
    expect(castFormValue('integer', '42')).toBe(42);
    expect(castFormValue('number', '3.5')).toBe(3.5);
  });

  it('extracts API error messages from structured errors', () => {
    expect(extractErrorMessage({ body: { error: 'Bad request' } })).toBe('Bad request');
    expect(extractErrorMessage(new Error('Fallback message'))).toBe('Fallback message');
  });

  it('derives the staged workflow state from resolve, preview, and confirmation state', () => {
    expect(
      deriveCapabilityWorkflowStage({
        selectedConceptId: null,
        resolution: null,
        preview: null,
        handoffConfirmed: false,
      }),
    ).toBe('browse');

    expect(
      deriveCapabilityWorkflowStage({
        selectedConceptId: 'outbound-dialer-campaign',
        resolution: null,
        preview: null,
        handoffConfirmed: false,
      }),
    ).toBe('configure');

    expect(
      deriveCapabilityWorkflowStage({
        selectedConceptId: 'outbound-dialer-campaign',
        resolution: {
          concept: { id: 'outbound-dialer-campaign', displayName: 'Outbound Dialer Campaign', approvalTier: 'golden' },
          recipe: {
            id: 'outbound-dialer',
            summary: 'Summary',
            maturity: 'beta',
            goal: 'Goal',
            primitives: [],
            optionalPrimitives: [],
            expectedSurfaces: [],
            smokeChecks: [],
          },
          parameters: {},
          nextStep: { action: 'compile-recipe-plan', recipeId: 'outbound-dialer' },
          resolution: { strategy: 'parameter-rules', matchedRuleId: null },
        },
        preview: null,
        handoffConfirmed: false,
      }),
    ).toBe('resolved');
  });

  it('builds a deterministic scaffold handoff package from preview state', () => {
    const handoff = buildCapabilityScaffoldHandoff({
      resolution: {
        concept: { id: 'outbound-dialer-campaign', displayName: 'Outbound Dialer Campaign', approvalTier: 'golden' },
        recipe: {
          id: 'outbound-dialer',
          summary: 'Summary',
          maturity: 'beta',
          goal: 'Goal',
          primitives: [],
          optionalPrimitives: [],
          expectedSurfaces: ['/health'],
          smokeChecks: [{ path: '/health', expectedStatus: 200 }],
        },
        parameters: { workerDomain: 'dialer.example.com' },
        nextStep: { action: 'compile-recipe-plan', recipeId: 'outbound-dialer' },
        resolution: { strategy: 'parameter-rules', matchedRuleId: 'csv-import' },
      },
      plan: {
        recipe: { id: 'outbound-dialer', summary: 'Summary', goal: 'Goal', maturity: 'beta' },
        env: { secrets: ['JWT_SECRET'], vars: ['ENVIRONMENT'], policyTags: ['telephony'] },
        bindings: { required: ['DB'], optional: ['ANALYTICS'] },
        expectedSurfaces: ['/health'],
        smokeChecks: [{ path: '/health', expectedStatus: 200 }],
        scaffold: {
          entryScript: 'packages/deploy/scripts/scaffold.mjs',
          stagingFirst: true,
          requiredSecrets: ['JWT_SECRET'],
          requiredBindings: ['DB'],
          requiredVars: ['ENVIRONMENT'],
        },
      },
      preview: '# Capability Plan Preview — outbound-dialer',
      generatedAt: '2026-05-23T00:00:00.000Z',
      nextStep: {
        action: 'review-plan-preview',
        conceptId: 'outbound-dialer-campaign',
        recipeId: 'outbound-dialer',
      },
    });

    expect(handoff).toEqual({
      conceptId: 'outbound-dialer-campaign',
      recipeId: 'outbound-dialer',
      parameters: { workerDomain: 'dialer.example.com' },
      plan: {
        recipe: { id: 'outbound-dialer', summary: 'Summary', goal: 'Goal', maturity: 'beta' },
        env: { secrets: ['JWT_SECRET'], vars: ['ENVIRONMENT'], policyTags: ['telephony'] },
        bindings: { required: ['DB'], optional: ['ANALYTICS'] },
        expectedSurfaces: ['/health'],
        smokeChecks: [{ path: '/health', expectedStatus: 200 }],
        scaffold: {
          entryScript: 'packages/deploy/scripts/scaffold.mjs',
          stagingFirst: true,
          requiredSecrets: ['JWT_SECRET'],
          requiredBindings: ['DB'],
          requiredVars: ['ENVIRONMENT'],
        },
      },
      preview: '# Capability Plan Preview — outbound-dialer',
      nextAction: {
        action: 'review-plan-preview',
        conceptId: 'outbound-dialer-campaign',
        recipeId: 'outbound-dialer',
      },
    });
  });
});
