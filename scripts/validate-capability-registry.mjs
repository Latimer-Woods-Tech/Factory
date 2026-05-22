#!/usr/bin/env node

import { readdir, readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CAPABILITIES_DIR = join(ROOT_DIR, 'capabilities');
const PRIMITIVES_DIR = join(CAPABILITIES_DIR, 'primitives');
const RECIPES_DIR = join(CAPABILITIES_DIR, 'recipes');
const RULES_DIR = join(CAPABILITIES_DIR, 'rules');

const errors = [];

const primitives = await loadJsonDirectory(PRIMITIVES_DIR, 'primitive');
const recipes = await loadJsonDirectory(RECIPES_DIR, 'recipe');
const rulesFiles = await loadJsonDirectory(RULES_DIR, 'rules');

const primitiveIds = new Set(primitives.map((entry) => entry.data.id));

checkDuplicates(primitives, 'primitive');
checkDuplicates(recipes, 'recipe');

for (const primitive of primitives) {
  validatePrimitive(primitive.data, primitive.path);
}

for (const recipe of recipes) {
  validateRecipe(recipe.data, recipe.path, primitiveIds);
}

for (const rulesFile of rulesFiles) {
  validateRules(rulesFile.data, rulesFile.path, primitiveIds);
  enforceRules(rulesFile.data, recipes);
}

if (errors.length > 0) {
  for (const error of errors) {
    console.error(`[validate-capability-registry] ${error}`);
  }
  process.exit(1);
}

console.log(JSON.stringify({
  ok: true,
  primitives: primitives.length,
  recipes: recipes.length,
  ruleFiles: rulesFiles.length,
  checkedAt: new Date().toISOString(),
}, null, 2));

async function loadJsonDirectory(dirPath, expectedKind) {
  const entries = await readdir(dirPath, { withFileTypes: true });
  const files = entries.filter((entry) => entry.isFile() && entry.name.endsWith('.json')).sort((a, b) => a.name.localeCompare(b.name));
  const results = [];

  for (const file of files) {
    const path = join(dirPath, file.name);
    const raw = await readFile(path, 'utf8');
    let data;
    try {
      data = JSON.parse(raw);
    } catch (error) {
      errors.push(`${relative(path)}: invalid JSON (${error.message})`);
      continue;
    }

    if (!data || typeof data !== 'object') {
      errors.push(`${relative(path)}: expected a JSON object`);
      continue;
    }

    if (data.kind !== expectedKind) {
      errors.push(`${relative(path)}: expected kind "${expectedKind}" but found "${String(data.kind)}"`);
    }

    results.push({ path, data });
  }

  return results;
}

function checkDuplicates(entries, label) {
  const seen = new Map();
  for (const entry of entries) {
    const id = entry.data.id;
    if (typeof id !== 'string') continue;
    const previous = seen.get(id);
    if (previous) {
      errors.push(`${relative(entry.path)}: duplicate ${label} id "${id}" also declared in ${relative(previous)}`);
      continue;
    }
    seen.set(id, entry.path);
  }
}

function validatePrimitive(data, path) {
  requireString(data, 'schemaVersion', path);
  requireString(data, 'id', path, /^[a-z][a-z0-9-]{1,63}$/u);
  requireString(data, 'package', path, /^@latimer-woods-tech\/[a-z0-9-]+$/u);
  requireString(data, 'versionRange', path);
  requireString(data, 'maturity', path);
  requireString(data, 'owner', path);
  requireString(data, 'category', path);
  requireString(data, 'summary', path);
  requireStringArray(data, 'provides', path, { minItems: 1 });

  const contracts = requireObject(data, 'contracts', path);
  if (contracts) {
    requireStringArray(contracts, 'inputs', path);
    requireStringArray(contracts, 'outputs', path);
    requireStringArray(contracts, 'policyTags', path);
  }

  const requirements = requireObject(data, 'requirements', path);
  if (requirements) {
    requireStringArray(requirements, 'secrets', path);
    requireStringArray(requirements, 'bindings', path);
    requireStringArray(requirements, 'upstreamPackages', path);
  }
}

function validateRecipe(data, path, primitiveIds) {
  requireString(data, 'schemaVersion', path);
  requireString(data, 'id', path, /^[a-z][a-z0-9-]{1,63}$/u);
  requireString(data, 'version', path, /^[0-9]+\.[0-9]+\.[0-9]+$/u);
  requireString(data, 'maturity', path);
  requireString(data, 'owner', path);
  requireString(data, 'summary', path);
  requireString(data, 'goal', path);
  requireStringArray(data, 'primitives', path, { minItems: 1 });
  requireStringArray(data, 'optionalPrimitives', path, { optional: true });
  requireStringArray(data, 'constraints', path, { optional: true });
  requireStringArray(data, 'expectedSurfaces', path, { minItems: 1 });

  const envContract = requireObject(data, 'envContract', path);
  if (envContract) {
    requireStringArray(envContract, 'secrets', path);
    requireStringArray(envContract, 'vars', path);
  }

  const bindingContract = requireObject(data, 'bindingContract', path);
  if (bindingContract) {
    requireStringArray(bindingContract, 'required', path);
    requireStringArray(bindingContract, 'optional', path);
  }

  const smokeChecks = data.smokeChecks;
  if (!Array.isArray(smokeChecks) || smokeChecks.length === 0) {
    errors.push(`${relative(path)}: smokeChecks must be a non-empty array`);
  } else {
    for (const [index, check] of smokeChecks.entries()) {
      if (!check || typeof check !== 'object') {
        errors.push(`${relative(path)}: smokeChecks[${index}] must be an object`);
        continue;
      }
      if (typeof check.path !== 'string' || check.path.length === 0) {
        errors.push(`${relative(path)}: smokeChecks[${index}].path must be a non-empty string`);
      }
      if (!Number.isInteger(check.expectedStatus)) {
        errors.push(`${relative(path)}: smokeChecks[${index}].expectedStatus must be an integer`);
      }
    }
  }

  const recipePrimitives = [
    ...(Array.isArray(data.primitives) ? data.primitives : []),
    ...(Array.isArray(data.optionalPrimitives) ? data.optionalPrimitives : []),
  ];

  for (const primitiveId of recipePrimitives) {
    if (!primitiveIds.has(primitiveId)) {
      errors.push(`${relative(path)}: references unknown primitive "${primitiveId}"`);
    }
  }
}

function validateRules(data, path, primitiveIds) {
  requireString(data, 'schemaVersion', path);
  const rules = data.rules;
  if (!Array.isArray(rules) || rules.length === 0) {
    errors.push(`${relative(path)}: rules must be a non-empty array`);
    return;
  }

  for (const [index, rule] of rules.entries()) {
    if (!rule || typeof rule !== 'object') {
      errors.push(`${relative(path)}: rules[${index}] must be an object`);
      continue;
    }

    if (typeof rule.id !== 'string' || rule.id.length === 0) {
      errors.push(`${relative(path)}: rules[${index}].id must be a non-empty string`);
    }
    if (typeof rule.description !== 'string' || rule.description.length === 0) {
      errors.push(`${relative(path)}: rules[${index}].description must be a non-empty string`);
    }

    const ifAll = Array.isArray(rule.ifAllPrimitives) ? rule.ifAllPrimitives : null;
    const thenRequire = Array.isArray(rule.thenRequirePrimitives) ? rule.thenRequirePrimitives : null;

    if (!ifAll || ifAll.length === 0) {
      errors.push(`${relative(path)}: rules[${index}].ifAllPrimitives must be a non-empty array`);
    }
    if (!thenRequire || thenRequire.length === 0) {
      errors.push(`${relative(path)}: rules[${index}].thenRequirePrimitives must be a non-empty array`);
    }

    for (const primitiveId of [...(ifAll ?? []), ...(thenRequire ?? [])]) {
      if (!primitiveIds.has(primitiveId)) {
        errors.push(`${relative(path)}: rules[${index}] references unknown primitive "${primitiveId}"`);
      }
    }
  }
}

function enforceRules(data, recipes) {
  for (const rule of data.rules) {
    for (const recipe of recipes) {
      const declared = new Set([
        ...(Array.isArray(recipe.data.primitives) ? recipe.data.primitives : []),
        ...(Array.isArray(recipe.data.optionalPrimitives) ? recipe.data.optionalPrimitives : []),
      ]);

      const matches = rule.ifAllPrimitives.every((primitiveId) => declared.has(primitiveId));
      if (!matches) continue;

      for (const requiredPrimitive of rule.thenRequirePrimitives) {
        if (!declared.has(requiredPrimitive)) {
          errors.push(`${relative(recipe.path)}: violates rule "${rule.id}" — missing required primitive "${requiredPrimitive}"`);
        }
      }
    }
  }
}

function requireObject(value, key, path) {
  const target = value[key];
  if (!target || typeof target !== 'object' || Array.isArray(target)) {
    errors.push(`${relative(path)}: ${key} must be an object`);
    return null;
  }
  return target;
}

function requireString(value, key, path, pattern) {
  const target = value[key];
  if (typeof target !== 'string' || target.length === 0) {
    errors.push(`${relative(path)}: ${key} must be a non-empty string`);
    return;
  }
  if (pattern && !pattern.test(target)) {
    errors.push(`${relative(path)}: ${key} does not match ${pattern}`);
  }
}

function requireStringArray(value, key, path, options = {}) {
  const target = value[key];
  if (target === undefined && options.optional) return;
  if (!Array.isArray(target)) {
    errors.push(`${relative(path)}: ${key} must be an array`);
    return;
  }
  if (options.minItems && target.length < options.minItems) {
    errors.push(`${relative(path)}: ${key} must contain at least ${options.minItems} item(s)`);
  }
  for (const [index, item] of target.entries()) {
    if (typeof item !== 'string' || item.length === 0) {
      errors.push(`${relative(path)}: ${key}[${index}] must be a non-empty string`);
    }
  }
}

function relative(path) {
  return path.slice(ROOT_DIR.length + 1).replace(/\\/gu, '/');
}