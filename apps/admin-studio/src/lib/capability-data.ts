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

export interface PrimitiveDefinition {
  id: string;
  package: string;
  versionRange: string;
  requirements: { secrets?: string[]; bindings?: string[] };
  contracts: { policyTags?: string[] };
}

export const capabilityCatalog = {
  generatedAt: '2026-05-23T00:00:00.000Z',
  summary: { primitiveCount: 4, recipeCount: 2, conceptCount: 1, ruleFileCount: 1 },
  concepts: [
    {
      id: 'outbound-dialer-campaign',
      displayName: 'Outbound Dialer Campaign',
      summary: 'Governed outbound dialer setup with routing for CRM segment or CSV import audiences.',
      status: 'approved',
      maturity: 'beta',
      tags: ['telephony', 'crm', 'campaigns'],
      menuVisible: true,
      approvalTier: 'golden',
      parameters: [
        { id: 'workerDomain', type: 'string', description: 'Custom domain for the deployed worker.', required: true, enum: [], default: null, formatHint: 'dialer.example.com' },
        { id: 'campaignSource', type: 'string', description: 'Audience source for the campaign.', required: true, enum: ['crm-segment', 'csv-import'], default: 'crm-segment', formatHint: null },
        { id: 'enableVoiceSynthesis', type: 'boolean', description: 'Enable synthesized voice prompts.', required: false, enum: [], default: true, formatHint: null },
      ],
      recipeSelection: {
        defaultRecipeId: 'outbound-dialer',
        rules: [
          { id: 'csv-import-uses-importer', recipeId: 'outbound-dialer-importer', matchAll: [{ parameter: 'campaignSource', equals: 'csv-import' }] },
        ],
      },
      recipes: [
        { id: 'outbound-dialer', summary: 'CRM-segment driven outbound dialer workflow.', maturity: 'beta', primitives: ['telephony', 'crm', 'analytics'], optionalPrimitives: ['compliance'] },
        { id: 'outbound-dialer-importer', summary: 'Outbound dialer workflow with CSV import landing and ingestion flow.', maturity: 'beta', primitives: ['telephony', 'crm', 'analytics'], optionalPrimitives: ['compliance'] },
      ],
      sourcePrimitives: ['analytics', 'compliance', 'crm', 'telephony'],
      qualification: { menuVisible: true, approvalTier: 'golden', requiredCapabilities: ['custom-domain'], disallowedEnvironments: ['local'] },
    },
  ] as CapabilityConcept[],
  recipes: [
    {
      id: 'outbound-dialer', version: '1.0.0', maturity: 'beta', summary: 'CRM-segment driven outbound dialer workflow.', goal: 'Launch governed outbound calling for CRM-selected contacts.',
      primitives: ['telephony', 'crm', 'analytics'], optionalPrimitives: ['compliance'],
      expectedSurfaces: ['/health', '/api/campaigns', '/api/leads'], smokeChecks: [{ path: '/health', expectedStatus: 200, expectContains: 'ok' }],
      constraints: ['Use a branded custom domain.', 'Verify staging smoke checks before production.'],
      envContract: { secrets: ['CRM_API_KEY'], vars: ['WORKER_DOMAIN'] }, bindingContract: { required: ['CRM_SEGMENTS'], optional: ['ANALYTICS'] },
    },
    {
      id: 'outbound-dialer-importer', version: '1.0.0', maturity: 'beta', summary: 'Outbound dialer workflow with CSV import landing and ingestion flow.', goal: 'Launch governed outbound calling for imported contact lists.',
      primitives: ['telephony', 'crm', 'analytics'], optionalPrimitives: ['compliance'],
      expectedSurfaces: ['/health', '/api/campaigns', '/api/imports'], smokeChecks: [{ path: '/health', expectedStatus: 200, expectContains: 'ok' }, { path: '/api/imports', expectedStatus: 200 }],
      constraints: ['Use a branded custom domain.', 'Verify import smoke checks before production.'],
      envContract: { secrets: ['CRM_API_KEY', 'IMPORT_BUCKET_TOKEN'], vars: ['WORKER_DOMAIN'] }, bindingContract: { required: ['CRM_SEGMENTS', 'IMPORT_BUCKET'], optional: ['ANALYTICS'] },
    },
  ] as CapabilityRecipeDetail[],
};

export const capabilityPrimitives = new Map<string, PrimitiveDefinition>([
  ['analytics', { id: 'analytics', package: '@latimer-woods-tech/analytics', versionRange: '^0.1.0', requirements: { bindings: ['ANALYTICS'] }, contracts: { policyTags: ['analytics'] } }],
  ['compliance', { id: 'compliance', package: '@latimer-woods-tech/compliance', versionRange: '^0.1.0', requirements: {}, contracts: { policyTags: ['compliance'] } }],
  ['crm', { id: 'crm', package: '@latimer-woods-tech/crm', versionRange: '^0.1.0', requirements: { bindings: ['CRM_SEGMENTS'] }, contracts: { policyTags: ['crm'] } }],
  ['telephony', { id: 'telephony', package: '@latimer-woods-tech/telephony', versionRange: '^0.1.0', requirements: { secrets: ['TELNYX_API_KEY', 'DEEPGRAM_API_KEY', 'ELEVENLABS_API_KEY'], bindings: ['CALL_QUEUE'] }, contracts: { policyTags: ['telephony'] } }],
]);

export const capabilityRuleBundle = {
  rules: [{ id: 'telephony-requires-crm', ifAllPrimitives: ['telephony'], thenRequirePrimitives: ['crm'] }],
};
