#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CAPABILITIES_DIR = join(ROOT_DIR, 'capabilities');
const CONCEPTS_DIR = join(CAPABILITIES_DIR, 'concepts');
const RECIPES_DIR = join(CAPABILITIES_DIR, 'recipes');
const COMPILED_DIR = join(CAPABILITIES_DIR, 'compiled');

const conceptId = getFlagValue('--concept');
const paramsInput = getFlagValue('--params');
const outputPath = getFlagValue('--output');
const planOutputPath = getFlagValue('--plan-output');

if (!conceptId) {
  console.error('Usage: node scripts/resolve-capability-concept.mjs --concept <concept-id> [--params <json-or-path>] [--output <path>] [--plan-output <path>]');
  process.exit(1);
}

const concepts = await loadMap(CONCEPTS_DIR);
const recipes = await loadMap(RECIPES_DIR);
const concept = concepts.get(conceptId);
if (!concept) {
  console.error(`Unknown concept: ${conceptId}`);
  process.exit(1);
}

const providedParams = await loadParams(paramsInput);
const validationErrors = validateParams(concept.parameterSchema ?? {}, providedParams);
if (validationErrors.length > 0) {
  for (const error of validationErrors) {
    console.error(`[resolve-capability-concept] ${error}`);
  }
  process.exit(1);
}

const normalizedParams = normalizeParams(concept.parameterSchema ?? {}, providedParams);
const selection = selectRecipe(concept, normalizedParams);
const selectedRecipeId = selection.recipeId;
const recipe = recipes.get(selectedRecipeId);
if (!recipe) {
  console.error(`Concept ${conceptId} resolved to unknown recipe: ${selectedRecipeId}`);
  process.exit(1);
}

const resolution = {
  schemaVersion: '1.0.0',
  kind: 'concept-resolution',
  generatedAt: new Date().toISOString(),
  concept: {
    id: concept.id,
    displayName: concept.displayName,
    approvalTier: concept.qualification?.approvalTier ?? 'unreviewed',
    menuVisible: Boolean(concept.qualification?.menuVisible),
  },
  recipe: {
    id: recipe.id,
    version: recipe.version,
    maturity: recipe.maturity,
    summary: recipe.summary,
  },
  parameters: normalizedParams,
  resolution: {
    strategy: selection.strategy,
    candidateCount: Array.isArray(concept.recipeCandidates) ? concept.recipeCandidates.length : 0,
    matchedRuleId: selection.matchedRuleId,
  },
};

if (planOutputPath) {
  const absolutePlanOutput = resolve(ROOT_DIR, planOutputPath);
  execFileSync('node', ['scripts/compile-capability-recipe.mjs', '--recipe', recipe.id, '--output', absolutePlanOutput], {
    cwd: ROOT_DIR,
    stdio: 'ignore',
  });
  resolution.plan = {
    output: absolutePlanOutput,
  };
}

const rendered = `${JSON.stringify(resolution, null, 2)}\n`;
if (outputPath) {
  const absoluteOutput = resolve(ROOT_DIR, outputPath);
  await mkdir(dirname(absoluteOutput), { recursive: true });
  await writeFile(absoluteOutput, rendered, 'utf8');
  console.log(JSON.stringify({ ok: true, concept: concept.id, recipe: recipe.id, output: absoluteOutput }, null, 2));
  process.exit(0);
}

console.log(rendered);

async function loadMap(dirPath) {
  const entries = await readdir(dirPath, { withFileTypes: true });
  const files = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
    .sort((left, right) => left.name.localeCompare(right.name));
  const map = new Map();

  for (const file of files) {
    const filePath = join(dirPath, file.name);
    const raw = await readFile(filePath, 'utf8');
    const data = JSON.parse(raw);
    map.set(data.id, data);
  }

  return map;
}

async function loadParams(params) {
  if (!params) {
    return {};
  }

  const candidatePath = resolve(ROOT_DIR, params);
  try {
    const raw = await readFile(candidatePath, 'utf8');
    return JSON.parse(raw);
  } catch {
    return JSON.parse(params);
  }
}

function validateParams(parameterSchema, params) {
  const errors = [];
  const properties = parameterSchema.properties ?? {};
  const required = new Set(parameterSchema.required ?? []);

  for (const requiredKey of required) {
    if (!(requiredKey in params)) {
      errors.push(`Missing required parameter \"${requiredKey}\"`);
    }
  }

  for (const key of Object.keys(params)) {
    const definition = properties[key];
    if (!definition) {
      errors.push(`Unknown parameter \"${key}\"`);
      continue;
    }

    const value = params[key];
    const typeError = validateParamType(key, definition.type, value);
    if (typeError) {
      errors.push(typeError);
      continue;
    }

    if (definition.enum && !definition.enum.includes(value)) {
      errors.push(`Parameter \"${key}\" must be one of: ${definition.enum.join(', ')}`);
    }
  }

  return errors;
}

function normalizeParams(parameterSchema, params) {
  const properties = parameterSchema.properties ?? {};
  const normalized = {};

  for (const [key, definition] of Object.entries(properties)) {
    if (key in params) {
      normalized[key] = params[key];
      continue;
    }
    if (Object.prototype.hasOwnProperty.call(definition, 'default')) {
      normalized[key] = definition.default;
    }
  }

  return normalized;
}

function validateParamType(key, type, value) {
  if (type === 'string' && typeof value !== 'string') {
    return `Parameter \"${key}\" must be a string`;
  }
  if (type === 'boolean' && typeof value !== 'boolean') {
    return `Parameter \"${key}\" must be a boolean`;
  }
  if (type === 'integer' && !Number.isInteger(value)) {
    return `Parameter \"${key}\" must be an integer`;
  }
  if (type === 'number' && (typeof value !== 'number' || Number.isNaN(value))) {
    return `Parameter \"${key}\" must be a number`;
  }
  return null;
}

function selectRecipe(concept, params) {
  const recipeCandidates = concept.recipeCandidates;
  if (!Array.isArray(recipeCandidates) || recipeCandidates.length === 0) {
    throw new Error('Concept has no recipe candidates');
  }

  const selection = concept.recipeSelection;
  if (selection) {
    for (const rule of selection.rules ?? []) {
      const matches = (rule.matchAll ?? []).every((condition) => params[condition.parameter] === condition.equals);
      if (matches) {
        return {
          recipeId: rule.recipeId,
          strategy: 'parameter-rules',
          matchedRuleId: rule.id,
        };
      }
    }
    return {
      recipeId: selection.defaultRecipeId,
      strategy: 'parameter-rules',
      matchedRuleId: null,
    };
  }

  return {
    recipeId: [...recipeCandidates].sort((left, right) => left.localeCompare(right))[0],
    strategy: 'first-approved-recipe-candidate',
    matchedRuleId: null,
  };
}

function getFlagValue(flag) {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] ?? null : null;
}
