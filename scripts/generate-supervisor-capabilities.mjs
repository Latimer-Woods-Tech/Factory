#!/usr/bin/env node
/**
 * generate-supervisor-capabilities.mjs
 *
 * Reads every YAML file in docs/capabilities/, validates each against the
 * ADMIN_TECHNICAL_GUIDE §3.1.1 schema (the same rules enforced by the
 * reusable workflow .github/workflows/_app-capability-lint.yml), and emits
 * apps/supervisor/src/capabilities.generated.ts.
 *
 * Run: node scripts/generate-supervisor-capabilities.mjs
 * Wired as part of "prebuild" in apps/supervisor/package.json
 */

import { readFileSync, readdirSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const require = createRequire(join(ROOT, 'apps', 'supervisor', 'package.json'));
const { load: yamlLoad } = require('js-yaml');

const CAPS_DIR = join(ROOT, 'docs', 'capabilities');
const OUT_FILE = join(ROOT, 'apps', 'supervisor', 'src', 'capabilities.generated.ts');

const VALID_SIDE_EFFECTS = new Set(['none', 'read-external', 'write-app', 'write-external']);
const VALID_SUPERVISOR_ACCESS = new Set(['green', 'yellow', 'red', 'denied']);
const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
// Tiers a supervisor may actually act on, ordered least → most privileged.
// `denied` is intentionally excluded: those routes are never callable.
const CALLABLE_TIERS = ['green', 'yellow', 'red'];

/**
 * Validate one parsed capabilities.yml against the §3.1.1 schema.
 * Rules mirror .github/workflows/_app-capability-lint.yml so the local
 * generator and the per-app CI lint never disagree.
 */
function validate(parsed, file) {
  const errors = [];

  if (parsed?.version !== 1) errors.push('`version` must be 1');

  if (!parsed?.app || typeof parsed.app !== 'object') {
    errors.push('missing or invalid `app` (expected a mapping with `id`)');
  } else {
    if (!parsed.app.id || typeof parsed.app.id !== 'string') {
      errors.push('missing or invalid `app.id`');
    }
    if (!parsed.app.custom_domain) errors.push('missing `app.custom_domain`');
  }

  const routes = parsed?.routes;
  if (!Array.isArray(routes) || routes.length === 0) {
    errors.push('`routes` must be a non-empty array');
  } else {
    for (const route of routes) {
      const ctx = `${route?.method ?? '?'} ${route?.path ?? '?'}`;
      if (!route?.path) errors.push(`route missing \`path\`: ${JSON.stringify(route)}`);
      if (!route?.method) errors.push(`${ctx}: missing \`method\``);
      if (!route?.handler_class) errors.push(`${ctx}: missing \`handler_class\``);
      if (!route?.side_effects) errors.push(`${ctx}: missing \`side_effects\``);
      else if (!VALID_SIDE_EFFECTS.has(route.side_effects)) {
        errors.push(`${ctx}: invalid side_effects "${route.side_effects}"`);
      }
      if (!route?.supervisor_access) errors.push(`${ctx}: missing \`supervisor_access\``);
      else if (!VALID_SUPERVISOR_ACCESS.has(route.supervisor_access)) {
        errors.push(`${ctx}: invalid supervisor_access "${route.supervisor_access}"`);
      }
      if (MUTATING_METHODS.has(route?.method) && route?.supervisor_access === 'green' && !route?.reversibility) {
        errors.push(`${ctx}: green mutating route must declare \`reversibility\``);
      }
      if (route?.requires_codeowner_oob === true && !['yellow', 'red'].includes(route?.supervisor_access)) {
        errors.push(`${ctx}: \`requires_codeowner_oob\` route must be yellow or red`);
      }
    }
  }

  if (!Array.isArray(parsed?.capabilities_exposed) || parsed.capabilities_exposed.length === 0) {
    errors.push('`capabilities_exposed` must be a non-empty array');
  }
  if (!Array.isArray(parsed?.capabilities_required) || parsed.capabilities_required.length === 0) {
    errors.push('`capabilities_required` must be a non-empty array');
  }

  if (errors.length > 0) {
    throw new Error(`[${file}] validation failed:\n  - ${errors.join('\n  - ')}`);
  }
}

/** Bare hostnames in custom_domain become branded https:// URLs (never *.workers.dev). */
function toBaseUrl(customDomain) {
  return /^https?:\/\//.test(customDomain) ? customDomain : `https://${customDomain}`;
}

/** Project a validated YAML doc into the flat shape the supervisor consumes. */
function project(parsed) {
  const routes = parsed.routes.map((r) => {
    const cap = {
      path: r.path,
      method: r.method,
      handler_class: r.handler_class,
      side_effects: r.side_effects,
      supervisor_access: r.supervisor_access,
    };
    if (r.reversibility !== undefined) cap.reversibility = r.reversibility;
    if (r.requires_codeowner_oob !== undefined) cap.requires_codeowner_oob = r.requires_codeowner_oob;
    if (r.params_schema !== undefined) cap.params_schema = r.params_schema;
    if (r.body_schema !== undefined) cap.body_schema = r.body_schema;
    return cap;
  });

  const tiers_allowed = CALLABLE_TIERS.filter((tier) =>
    routes.some((r) => r.supervisor_access === tier),
  );

  return {
    app: parsed.app.id,
    name: parsed.app.name ?? parsed.app.id,
    repo: parsed.app.repo ?? '',
    base_url: toBaseUrl(parsed.app.custom_domain),
    product_tier: parsed.app.product_tier ?? 'unknown',
    tiers_allowed,
    capabilities: routes,
    capabilities_exposed: parsed.capabilities_exposed,
    capabilities_required: parsed.capabilities_required,
    side_effects_summary: parsed.side_effects_summary ?? {},
  };
}

// ── Main ─────────────────────────────────────────────────────────────────────

const files = readdirSync(CAPS_DIR).filter((f) => f.endsWith('.yml')).sort();

if (files.length === 0) {
  console.error(`[ERROR] No YAML files found in ${CAPS_DIR}`);
  process.exit(1);
}

const apps = [];
const errors = [];
const seenIds = new Map(); // app.id → source file, to catch duplicate ids

for (const file of files) {
  const fullPath = join(CAPS_DIR, file);
  try {
    const raw = readFileSync(fullPath, 'utf8');
    const parsed = yamlLoad(raw);
    validate(parsed, file);
    const app = project(parsed);
    if (seenIds.has(app.app)) {
      throw new Error(`[${file}] duplicate \`app.id\` "${app.app}" (already declared in ${seenIds.get(app.app)})`);
    }
    seenIds.set(app.app, file);
    apps.push(app);
    console.log(`  ✓ ${file} → app=${app.app} routes=${app.capabilities.length}`);
  } catch (e) {
    errors.push(e.message);
    console.error(`  ✗ ${file}: ${e.message}`);
  }
}

if (errors.length > 0) {
  console.error(`\n[ERROR] ${errors.length} capabilities file(s) failed validation.`);
  process.exit(1);
}

const generated = `// AUTO-GENERATED by scripts/generate-supervisor-capabilities.mjs
// DO NOT EDIT DIRECTLY — edit docs/capabilities/*.yml instead,
// then run: node scripts/generate-supervisor-capabilities.mjs
//
// Generated: ${new Date().toISOString()}
// Source files: ${files.join(', ')}

export type SideEffect = 'none' | 'read-external' | 'write-app' | 'write-external';
export type SupervisorAccess = 'green' | 'yellow' | 'red' | 'denied';

export interface RouteCapability {
  path: string;
  method: string;
  handler_class: string;
  side_effects: SideEffect;
  supervisor_access: SupervisorAccess;
  reversibility?: string;
  requires_codeowner_oob?: boolean;
  params_schema?: Record<string, unknown>;
  body_schema?: Record<string, unknown>;
}

export interface AppCapabilities {
  app: string;
  name: string;
  repo: string;
  base_url: string;
  product_tier: string;
  tiers_allowed: SupervisorAccess[];
  capabilities: RouteCapability[];
  capabilities_exposed: string[];
  capabilities_required: string[];
  side_effects_summary: Record<string, string[]>;
}

export const GENERATED_CAPABILITIES: AppCapabilities[] = ${JSON.stringify(apps, null, 2)};

export function getAppCapabilities(appId: string): AppCapabilities | undefined {
  return GENERATED_CAPABILITIES.find((a) => a.app === appId);
}

export function getCapability(
  appId: string,
  path: string,
  method?: string,
): RouteCapability | undefined {
  return getAppCapabilities(appId)?.capabilities.find(
    (c) => c.path === path && (method === undefined || c.method === method),
  );
}
`;

writeFileSync(OUT_FILE, generated, 'utf8');
console.log(`[OK] Wrote ${apps.length} apps → ${OUT_FILE.replace(ROOT, '.')}`);
