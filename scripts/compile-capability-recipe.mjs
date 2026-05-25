#!/usr/bin/env node

import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CAPABILITIES_DIR = join(ROOT_DIR, 'capabilities');
const PRIMITIVES_DIR = join(CAPABILITIES_DIR, 'primitives');
const RECIPES_DIR = join(CAPABILITIES_DIR, 'recipes');
const RULES_DIR = join(CAPABILITIES_DIR, 'rules');
const BASE_SCAFFOLD_SECRETS = ['JWT_SECRET'];
const BASE_SCAFFOLD_BINDINGS = ['AUTH_RATE_LIMITER', 'DB', 'FLAG_TELEMETRY', 'FLAGS'];
const BASE_SCAFFOLD_VARS = ['ENVIRONMENT', 'WORKER_NAME'];

const recipeId = getFlagValue('--recipe');
const outputPath = getFlagValue('--output');

if (!recipeId) {
  console.error('Usage: node scripts/compile-capability-recipe.mjs --recipe <recipe-id> [--output <path>]');
  process.exit(1);
}

const primitives = await loadMap(PRIMITIVES_DIR);
const recipes = await loadMap(RECIPES_DIR);
const ruleBundles = await loadArray(RULES_DIR);

const recipe = recipes.get(recipeId);
if (!recipe) {
  console.error(`Unknown recipe: ${recipeId}`);
  process.exit(1);
}

const primitiveIds = [...recipe.primitives, ...(recipe.optionalPrimitives ?? [])];
const primitiveRecords = primitiveIds.map((id) => {
  const primitive = primitives.get(id);
  if (!primitive) {
    throw new Error(`Recipe ${recipeId} references unknown primitive ${id}`);
  }
  return primitive;
});

const violatedRules = collectRuleViolations(recipe, ruleBundles);
if (violatedRules.length > 0) {
  for (const violation of violatedRules) {
    console.error(violation);
  }
  process.exit(1);
}

const plan = {
  schemaVersion: '1.0.0',
  kind: 'plan',
  recipe: {
    id: recipe.id,
    version: recipe.version,
    maturity: recipe.maturity,
    summary: recipe.summary,
    goal: recipe.goal,
  },
  packages: primitiveRecords
    .map((primitive) => ({
      primitiveId: primitive.id,
      package: primitive.package,
      versionRange: primitive.versionRange,
    }))
    .sort((left, right) => left.primitiveId.localeCompare(right.primitiveId)),
  env: {
    secrets: sortUnique([
      ...BASE_SCAFFOLD_SECRETS,
      ...recipe.envContract.secrets,
      ...primitiveRecords.flatMap((primitive) => primitive.requirements.secrets ?? []),
    ]),
    vars: sortUnique([...BASE_SCAFFOLD_VARS, ...(recipe.envContract.vars ?? [])]),
    policyTags: sortUnique(primitiveRecords.flatMap((primitive) => primitive.contracts.policyTags ?? [])),
  },
  bindings: {
    required: sortUnique([
      ...BASE_SCAFFOLD_BINDINGS,
      ...recipe.bindingContract.required,
      ...primitiveRecords.flatMap((primitive) => primitive.requirements.bindings ?? []),
    ]),
    optional: sortUnique(recipe.bindingContract.optional ?? []),
  },
  expectedSurfaces: [...recipe.expectedSurfaces],
  smokeChecks: [...recipe.smokeChecks],
  constraints: [...(recipe.constraints ?? [])],
  scaffold: {
    entryScript: 'packages/deploy/scripts/scaffold.mjs',
    stagingFirst: true,
    requiredSecrets: [...BASE_SCAFFOLD_SECRETS],
    requiredBindings: sortUnique([
      ...BASE_SCAFFOLD_BINDINGS,
      ...recipe.bindingContract.required,
      ...primitiveRecords.flatMap((primitive) => primitive.requirements.bindings ?? []),
    ]),
    requiredVars: sortUnique([...BASE_SCAFFOLD_VARS, ...(recipe.envContract.vars ?? [])]),
  },
};

const rendered = `${JSON.stringify(plan, null, 2)}\n`;
if (outputPath) {
  const absoluteOutput = resolve(ROOT_DIR, outputPath);
  await mkdir(dirname(absoluteOutput), { recursive: true });
  await writeFile(absoluteOutput, rendered, 'utf8');
  console.log(JSON.stringify({ ok: true, recipe: recipeId, output: absoluteOutput }, null, 2));
} else {
  console.log(rendered);
}

async function loadMap(dirPath) {
  const files = await listJsonFiles(dirPath);
  const map = new Map();
  for (const file of files) {
    const raw = await readFile(file, 'utf8');
    const parsed = JSON.parse(raw);
    map.set(parsed.id, parsed);
  }
  return map;
}

async function loadArray(dirPath) {
  const files = await listJsonFiles(dirPath);
  const values = [];
  for (const file of files) {
    const raw = await readFile(file, 'utf8');
    values.push(JSON.parse(raw));
  }
  return values;
}

async function listJsonFiles(dirPath) {
  const entries = await readdir(dirPath, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
    .map((entry) => join(dirPath, entry.name))
    .sort((left, right) => left.localeCompare(right));
}

function collectRuleViolations(recipe, ruleBundles) {
  const declared = new Set([...(recipe.primitives ?? []), ...(recipe.optionalPrimitives ?? [])]);
  const violations = [];
  for (const bundle of ruleBundles) {
    for (const rule of bundle.rules ?? []) {
      const matches = (rule.ifAllPrimitives ?? []).every((primitiveId) => declared.has(primitiveId));
      if (!matches) continue;
      for (const requiredPrimitive of rule.thenRequirePrimitives ?? []) {
        if (!declared.has(requiredPrimitive)) {
          violations.push(`Recipe ${recipe.id} violates rule ${rule.id}: missing primitive ${requiredPrimitive}`);
        }
      }
    }
  }
  return violations;
}

function sortUnique(values) {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function getFlagValue(flag) {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] ?? null : null;
}