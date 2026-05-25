#!/usr/bin/env node

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join, resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CAPABILITIES_DIR = join(ROOT_DIR, 'capabilities');
const COMPILED_DIR = join(CAPABILITIES_DIR, 'compiled');
const planPath = getFlagValue('--plan');
const recipeId = getFlagValue('--recipe');
const outputPath = getFlagValue('--output');

if (!planPath && !recipeId) {
  console.error('Usage: node scripts/preview-capability-plan.mjs --plan <path> | --recipe <id> [--output <path>]');
  process.exit(1);
}

const inputPath = planPath
  ? resolve(ROOT_DIR, planPath)
  : join(COMPILED_DIR, `${recipeId}.plan.json`);
const outputFile = outputPath
  ? resolve(ROOT_DIR, outputPath)
  : join(COMPILED_DIR, `${recipeId ?? basename(inputPath, '.plan.json')}.preview.md`);

await mkdir(dirname(outputFile), { recursive: true });

const raw = await readFile(inputPath, 'utf8');
const plan = JSON.parse(raw);
const preview = renderPreview(plan);
await writeFile(outputFile, preview, 'utf8');
console.log(`Generated plan preview: ${outputFile}`);

function renderPreview(plan) {
  const lines = [];
  const recipeId = plan.recipe?.id ?? 'unknown';
  const recipeSummary = plan.recipe?.summary ?? 'No summary provided.';
  const recipeGoal = plan.recipe?.goal ?? 'No goal provided.';
  const packages = plan.packages ?? [];
  const env = plan.env ?? {};
  const bindings = plan.bindings ?? {};
  const scaffold = plan.scaffold ?? {};

  lines.push(`# Capability Plan Preview — ${recipeId}`);
  lines.push('');
  lines.push(`**Summary:** ${recipeSummary}`);
  lines.push('');
  lines.push(`**Goal:** ${recipeGoal}`);
  lines.push('');
  lines.push('## Packages');
  lines.push('');
  if (packages.length === 0) {
    lines.push('- None declared.');
  } else {
    for (const pkg of packages) {
      lines.push(`- ${pkg.primitiveId}: ${pkg.package} (${pkg.versionRange})`);
    }
  }
  lines.push('');
  lines.push('## Environment');
  lines.push('');
  lines.push('- Secrets:');
  if ((env.secrets ?? []).length === 0) {
    lines.push('  - None declared.');
  } else {
    for (const secret of env.secrets) {
      lines.push(`  - ${secret}`);
    }
  }
  lines.push('');
  lines.push('- Vars:');
  if ((env.vars ?? []).length === 0) {
    lines.push('  - None declared.');
  } else {
    for (const variable of env.vars) {
      lines.push(`  - ${variable}`);
    }
  }
  lines.push('');
  lines.push('- Policy tags:');
  if ((env.policyTags ?? []).length === 0) {
    lines.push('  - None declared.');
  } else {
    for (const tag of env.policyTags) {
      lines.push(`  - ${tag}`);
    }
  }
  lines.push('');
  lines.push('## Bindings');
  lines.push('');
  if ((bindings.required ?? []).length === 0 && (bindings.optional ?? []).length === 0) {
    lines.push('- None declared.');
  } else {
    for (const binding of bindings.required ?? []) {
      lines.push(`- required: ${binding}`);
    }
    for (const binding of bindings.optional ?? []) {
      lines.push(`- optional: ${binding}`);
    }
  }
  lines.push('');
  lines.push('## Expected Surfaces');
  lines.push('');
  if ((plan.expectedSurfaces ?? []).length === 0) {
    lines.push('- None declared.');
  } else {
    for (const surface of plan.expectedSurfaces) {
      lines.push(`- ${surface}`);
    }
  }
  lines.push('');
  lines.push('## Smoke Checks');
  lines.push('');
  if ((plan.smokeChecks ?? []).length === 0) {
    lines.push('- None declared.');
  } else {
    for (const check of plan.smokeChecks) {
      lines.push(`- ${check.path}: expected ${check.expectedStatus}${check.expectContains ? `, contains ${check.expectContains}` : ''}`);
    }
  }
  lines.push('');
  lines.push('## Constraints');
  lines.push('');
  if ((plan.constraints ?? []).length === 0) {
    lines.push('- None declared.');
  } else {
    for (const constraint of plan.constraints) {
      lines.push(`- ${constraint}`);
    }
  }
  lines.push('');
  lines.push('## Scaffold Contract');
  lines.push('');
  lines.push(`- entryScript: ${scaffold.entryScript ?? 'unknown'}`);
  lines.push(`- stagingFirst: ${scaffold.stagingFirst ?? false}`);
  lines.push(`- requiredSecrets: ${(scaffold.requiredSecrets ?? []).join(', ')}`);
  lines.push(`- requiredBindings: ${(scaffold.requiredBindings ?? []).join(', ')}`);
  lines.push(`- requiredVars: ${(scaffold.requiredVars ?? []).join(', ')}`);
  lines.push('');
  lines.push('## Implementation Notes');
  lines.push('');
  lines.push('- This preview is the human-readable contract for the first golden path.');
  lines.push('- It should be used to validate the compiled plan before provisioning.');
  lines.push('- It is not a substitute for the true plan JSON contract.');
  lines.push('');
  return lines.join('\n');
}

function getFlagValue(flag) {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] ?? null : null;
}
