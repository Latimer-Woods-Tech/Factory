#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CAPABILITIES_DIR = join(ROOT_DIR, 'capabilities');
const COMPILED_DIR = join(CAPABILITIES_DIR, 'compiled');
const recipeId = getFlagValue('--recipe');
const outputPath = getFlagValue('--output');

if (!recipeId) {
  console.error('Usage: node scripts/generate-capability-golden-path.mjs --recipe <recipe-id> [--output <path>]');
  process.exit(1);
}

await mkdir(COMPILED_DIR, { recursive: true });
const planOutputPath = join(COMPILED_DIR, `${recipeId}.plan.json`);
const goldenPathOutputPath = outputPath
  ? resolve(ROOT_DIR, outputPath)
  : join(COMPILED_DIR, `${recipeId}.golden-path.json`);

console.log(`Compiling capability recipe ${recipeId}...`);
try {
  execFileSync('node', ['scripts/compile-capability-recipe.mjs', '--recipe', recipeId, '--output', planOutputPath], {
    stdio: 'inherit',
    cwd: ROOT_DIR,
  });
} catch (error) {
  console.error('Failed to compile capability recipe:', error.message);
  process.exit(1);
}

await mkdir(dirname(goldenPathOutputPath), { recursive: true });
const planRaw = await readFile(planOutputPath, 'utf8');
const plan = JSON.parse(planRaw);

const goldenPath = buildGoldenPath(plan, relative(ROOT_DIR, planOutputPath));
await writeFile(goldenPathOutputPath, JSON.stringify(goldenPath, null, 2) + '\n', 'utf8');

console.log(`\nGenerated golden-path artifact: ${goldenPathOutputPath}`);
console.log('Proof gate conditions:');
for (const condition of goldenPath.proofGate) {
  console.log(`- ${condition}`);
}

function buildGoldenPath(plan, relativePlanPath) {
  const requiredSecrets = plan.env?.secrets ?? [];
  const requiredVars = plan.env?.vars ?? [];
  const requiredBindings = plan.bindings?.required ?? [];
  const expectedSurfaces = plan.expectedSurfaces ?? [];
  const smokeChecks = plan.smokeChecks ?? [];
  const scaffold = plan.scaffold ?? {};

  return {
    schemaVersion: '1.0.0',
    kind: 'golden-path',
    generatedAt: new Date().toISOString(),
    recipe: plan.recipe,
    planPath: relativePlanPath,
    proofGate: [
      `Compiled plan exists for recipe ${plan.recipe.id}.`,
      `Plan includes required secrets: ${requiredSecrets.join(', ')}`,
      `Plan includes required vars: ${requiredVars.join(', ')}`,
      `Plan includes required bindings: ${requiredBindings.join(', ')}`,
      `Plan expects surfaces: ${expectedSurfaces.join(', ')}`,
      `Plan includes smoke checks: ${smokeChecks.map((check) => `${check.path} => ${check.expectedStatus}`).join(', ')}`,
      `Scaffold contract points to ${scaffold.entryScript} and declares staging-first provisioning: ${scaffold.stagingFirst}`,
    ],
    summary: {
      requiredSecrets,
      requiredVars,
      requiredBindings,
      expectedSurfaces,
      smokeChecks,
      scaffold,
    },
    implementationNotes: [
      'Treat this artifact as the first golden-path delivery contract.',
      'Do not build the visual composer before the plan preview and staging proof gate are complete.',
      'Use the compiled plan contract as the shared seam between registry, compile, and provisioner.',
    ],
  };
}

function getFlagValue(flag) {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] ?? null : null;
}
