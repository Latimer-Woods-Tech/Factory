/**
 * Template loader. Phase 1: loads from a statically-imported array seeded
 * with the 6 starter templates shipped via SUP-3.3
 * (`docs/supervisor/plans/*.yml`).
 *
 * Phase 2 (SUP-3.5): loads from a KV binding populated by a build step that
 * parses YAML at deploy time, so templates can be edited without a redeploy.
 */

export interface Template {
  id: string;
  tier: 'green' | 'yellow' | 'red';
  description: string;
  trigger_keywords?: string[];
  steps?: Array<{
    tool: string;
    slots?: Record<string, string>;
    side_effects?: 'none' | 'read-external' | 'write-app' | 'write-external';
  }>;
}

// Phase 1 stub — the real 6 templates live in `docs/supervisor/plans/*.yml`
// and will be loaded via import-at-build-time once SUP-3.5 wires the loader.
const SEED: Template[] = [
  {
    id: 'health-check',
    tier: 'green',
    description: 'Ping public health endpoints and report status',
    trigger_keywords: ['health', 'ping', 'status', 'check'],
    steps: [
      { tool: 'http.get', slots: { url: '{{description}}' }, side_effects: 'read-external' },
    ],
  },
  {
    id: 'governance-hardening-tweak',
    tier: 'green',
    description:
      'Small governance/hardening additions: workflow tweaks, label additions, README edits, CODEOWNERS updates, branch-policy docs',
    trigger_keywords: [
      'governance',
      'hardening',
      'triage',
      'label',
      'codeowners',
      'branch-protection',
      'playbook',
      'reliability',
      'flaky',
      'drift',
      'reviewer',
      'labeler',
    ],
    steps: [
      { tool: 'github.readFile', side_effects: 'read-external' },
      { tool: 'github.openPR', side_effects: 'write-app' },
      { tool: 'github.comment', side_effects: 'write-app' },
    ],
  },
];

export async function loadTemplates(): Promise<Template[]> {
  // Phase 1: return seed. Phase 2: fetch from KV / D1.
  return Promise.resolve(SEED);
}
