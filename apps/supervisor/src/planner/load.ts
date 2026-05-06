/**
 * Template loader.
 *
 * Templates are the single source of truth in `docs/supervisor/plans/*.yml`.
 * The build step (`npm run generate:templates`) parses those files with js-yaml
 * and emits `templates.generated.ts` — a committed TypeScript file that the
 * Worker imports at bundle time (no KV, no runtime file I/O).
 *
 * To add or modify a template:
 *   1. Edit or create a YAML file in docs/supervisor/plans/
 *   2. Run: node scripts/generate-supervisor-templates.mjs
 *   3. Commit both the YAML and the updated templates.generated.ts
 *
 * Phase 2 (SUP-3.5): if hot-reload without redeploy is needed, swap the
 * import for a KV fetch.
 */

export interface TemplateTriggers {
  labels_any_of?: string[];
  title_pattern?: string;
  body_patterns?: string[];
}

export interface Template {
  id: string;
  tier: 'green' | 'yellow' | 'red';
  description: string;
  trigger_keywords?: string[];
  triggers?: TemplateTriggers;
  steps?: Array<{
    tool: string;
    slots?: Record<string, unknown>;
    side_effects?: 'none' | 'read-external' | 'write-app' | 'write-external';
  }>;
}

import { GENERATED_TEMPLATES } from './templates.generated';

export async function loadTemplates(): Promise<Template[]> {
  return Promise.resolve(GENERATED_TEMPLATES);
}
