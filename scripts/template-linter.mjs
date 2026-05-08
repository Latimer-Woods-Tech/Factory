#!/usr/bin/env node
/**
 * template-linter.mjs
 *
 * Deterministic FRIDGE/CLAUDE.md constraint checker for supervisor template YAML.
 * No network calls. No LLM. 100% reproducible.
 *
 * CLI:  node scripts/template-linter.mjs path/to/template.yml [--auto-authored]
 * API:  import { lintTemplate } from './template-linter.mjs'
 *       const { ok, errors, warnings, hardReject } = lintTemplate(yamlStr, { autoAuthored: true })
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const require = createRequire(join(ROOT, 'apps', 'supervisor', 'package.json'));
const { load: yamlLoad } = require('js-yaml');

const VALID_TIERS = new Set(['green', 'yellow', 'red']);
const VALID_SIDE_EFFECTS = new Set(['none', 'read-external', 'write-app', 'write-external']);

// Paths that require tier:red regardless of side_effects (FRIDGE rule 3 + CLAUDE.md)
const RED_TIER_PATH_PATTERNS = [
  /packages\//i,
  /migrations\//i,
  /\.github\/workflows\//i,
  /wrangler\.jsonc/i,
];

// Hard reject patterns — no retry, no recovery (FRIDGE rule 1)
const HARD_REJECT_PATTERNS = [
  { re: /wordis-bond/i, msg: 'contains wordis-bond reference (FRIDGE rule 1 — permanent off-limits)' },
];

// Forbidden Node.js built-ins (CLAUDE.md hard constraints)
const FORBIDDEN_PATTERNS = [
  { re: /\bprocess\.env\b/, msg: 'contains process.env — use Hono/Worker bindings' },
  { re: /\brequire\s*\(/, msg: 'contains require() — ESM only' },
  { re: /\bnew Buffer\b|\bBuffer\.from\b|\bBuffer\.alloc\b/, msg: 'contains Buffer — use Uint8Array/TextEncoder' },
];

function extractAllStrings(obj, acc = []) {
  if (typeof obj === 'string') { acc.push(obj); return acc; }
  if (Array.isArray(obj)) { obj.forEach(v => extractAllStrings(v, acc)); return acc; }
  if (obj && typeof obj === 'object') { Object.values(obj).forEach(v => extractAllStrings(v, acc)); return acc; }
  return acc;
}

function touchesRedPath(step) {
  const strings = extractAllStrings(step.params ?? {});
  return strings.some(s => RED_TIER_PATH_PATTERNS.some(re => re.test(s)));
}

/**
 * Lint a template YAML string against FRIDGE rules.
 * @param {string} yamlStr - Raw YAML content
 * @param {{ autoAuthored?: boolean }} opts
 * @returns {{ ok: boolean, errors: string[], warnings: string[], hardReject: boolean }}
 */
export function lintTemplate(yamlStr, { autoAuthored = false } = {}) {
  const errors = [];
  const warnings = [];

  // Hard reject scan runs on raw text before parsing
  for (const { re, msg } of HARD_REJECT_PATTERNS) {
    if (re.test(yamlStr)) {
      return { ok: false, errors: [`HARD REJECT: ${msg}`], warnings: [], hardReject: true };
    }
  }

  // Parse
  let parsed;
  try {
    parsed = yamlLoad(yamlStr);
  } catch (e) {
    return { ok: false, errors: [`YAML parse error: ${e.message}`], warnings: [], hardReject: false };
  }

  if (!parsed || typeof parsed !== 'object') {
    return { ok: false, errors: ['Template parsed to null or non-object'], warnings: [], hardReject: false };
  }

  // id
  if (!parsed.id || typeof parsed.id !== 'string') {
    errors.push('missing or invalid `id` field');
  } else if (!/^[a-z][a-z0-9-]+$/.test(parsed.id)) {
    errors.push(`id "${parsed.id}" must be kebab-case: ^[a-z][a-z0-9-]+$`);
  }

  // tier
  if (!VALID_TIERS.has(parsed.tier)) {
    errors.push(`invalid tier "${parsed.tier}" — must be green | yellow | red`);
  }

  // triggers
  if (!parsed.triggers || typeof parsed.triggers !== 'object') {
    errors.push('missing `triggers` block');
  } else {
    if (!parsed.triggers.labels_any_of && !parsed.triggers.title_pattern) {
      errors.push('triggers must have at least one of: labels_any_of, title_pattern');
    }
    if (parsed.triggers.title_pattern) {
      try { new RegExp(parsed.triggers.title_pattern, 'i'); }
      catch (e) { errors.push(`triggers.title_pattern invalid regex: ${e.message}`); }
    }
    for (const p of (parsed.triggers.body_patterns ?? [])) {
      const jsPattern = p.replace(/^\(\?[is]+\)/, '');
      try { new RegExp(jsPattern, 'i'); }
      catch (e) { errors.push(`triggers.body_patterns entry "${p}" invalid regex: ${e.message}`); }
    }
  }

  // slots — validator regexes
  for (const slot of (parsed.slots ?? [])) {
    if (!slot.name) { errors.push('a slot is missing `name`'); continue; }
    if (slot.type === 'string' && slot.validator) {
      try { new RegExp(slot.validator); }
      catch (e) { errors.push(`slot "${slot.name}" validator is invalid regex: ${e.message}`); }
    }
  }

  // steps
  const steps = parsed.steps ?? [];
  if (steps.length === 0) {
    errors.push('template has no steps');
  }
  for (const step of steps) {
    const sid = step.id ?? step.tool ?? '(unknown)';
    if (!step.intent) {
      errors.push(`step "${sid}" missing required \`intent\` field`);
    }
    if (step.side_effects && !VALID_SIDE_EFFECTS.has(step.side_effects)) {
      errors.push(`step "${sid}" has invalid side_effects "${step.side_effects}"`);
    }
    // /admin writes without human review gate (FRIDGE rule 4)
    const stepStrings = extractAllStrings(step.params ?? {});
    const writesToAdmin = stepStrings.some(s => /\/admin/.test(s)) &&
      ['write-app', 'write-external'].includes(step.side_effects);
    if (writesToAdmin && !step.requires_human_review) {
      errors.push(`step "${sid}" writes to /admin path but lacks requires_human_review: true (FRIDGE rule 4)`);
    }
  }

  // Red-tier path enforcement
  if (parsed.tier && parsed.tier !== 'red') {
    for (const step of steps) {
      if (touchesRedPath(step)) {
        const sid = step.id ?? step.tool ?? '(unknown)';
        errors.push(
          `step "${sid}" references a Red-tier path (packages/, migrations/, .github/workflows/, wrangler.jsonc) ` +
          `but template tier is "${parsed.tier}" — must be "red"`
        );
      }
    }
  }

  // acceptance_gate required
  if (!parsed.acceptance_gate) {
    errors.push('missing `acceptance_gate` — every template must define a success criterion');
  }

  // Forbidden Node.js patterns (whole-text scan)
  for (const { re, msg } of FORBIDDEN_PATTERNS) {
    if (re.test(yamlStr)) {
      errors.push(`Template ${msg}`);
    }
  }

  // Auto-authored extra constraints
  if (autoAuthored) {
    if (parsed.tier === 'green') {
      errors.push('auto-authored templates must use tier: yellow or tier: red — never green');
    }
    if (!parsed.rollback || (Array.isArray(parsed.rollback) && parsed.rollback.length === 0)) {
      errors.push('auto-authored templates must include a non-empty rollback section');
    }
  }

  // Warnings
  if (!parsed.rollback && !autoAuthored) {
    warnings.push('no rollback section — strongly recommended');
  }
  if (!parsed.preconditions) {
    warnings.push('no preconditions — consider adding capability_exists checks');
  }
  if ((parsed.slots ?? []).length === 0) {
    warnings.push('no slots defined — template may be too generic to extract useful context');
  }

  return { ok: errors.length === 0, errors, warnings, hardReject: false };
}

// CLI entry point
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const filePath = process.argv[2];
  const autoAuthored = process.argv.includes('--auto-authored');

  if (!filePath) {
    console.error('Usage: node scripts/template-linter.mjs <path-to-template.yml> [--auto-authored]');
    process.exit(1);
  }

  const yamlStr = readFileSync(filePath, 'utf8');
  const result = lintTemplate(yamlStr, { autoAuthored });

  if (result.errors.length > 0) {
    console.error('\n[ERRORS]');
    result.errors.forEach(e => console.error(`  ✗ ${e}`));
  }
  if (result.warnings.length > 0) {
    console.warn('\n[WARNINGS]');
    result.warnings.forEach(w => console.warn(`  ⚠ ${w}`));
  }

  if (result.ok) {
    console.log('\n✓ Template lint passed');
    process.exit(0);
  } else {
    const tag = result.hardReject ? ' — HARD REJECT (no retry)' : '';
    console.error(`\n✗ Template lint FAILED (${result.errors.length} error(s))${tag}`);
    process.exit(1);
  }
}
