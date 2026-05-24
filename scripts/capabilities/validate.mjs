#!/usr/bin/env node
// @node-runtime — Capability registry validator
//
// Validates every JSON descriptor under capabilities/{primitives,recipes,concepts,rules}/
// against its schema, then runs cross-reference checks (concept.recipes ⊆ recipes,
// recipe.primitives ⊆ primitives, recipeSelection.defaultRecipeId ∈ concept.recipes,
// rules reference real primitives, etc.).
//
// Exits 0 on success, 1 on any validation error.

import { readdirSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { loadSchema, validate } from './lib/schema-validator.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '../..');
const REGISTRY = join(REPO_ROOT, 'capabilities');
const SCHEMAS = join(REGISTRY, 'schema');

const PARAM_TYPE_TO_JS = {
  string: 'string',
  boolean: 'boolean',
  integer: 'integer',
  number: 'number',
};

let errorCount = 0;
function err(file, message) {
  console.error(`  ❌ ${file}: ${message}`);
  errorCount += 1;
}

function loadDir(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => ({ file: f, path: join(dir, f), data: JSON.parse(readFileSync(join(dir, f), 'utf8')) }));
}

function main() {
  console.log('🔎 Validating capability registry...');

  const primitiveSchema = loadSchema(join(SCHEMAS, 'primitive.schema.json'));
  const recipeSchema = loadSchema(join(SCHEMAS, 'recipe.schema.json'));
  const conceptSchema = loadSchema(join(SCHEMAS, 'concept.schema.json'));
  const ruleSchema = loadSchema(join(SCHEMAS, 'rule.schema.json'));

  const primitives = loadDir(join(REGISTRY, 'primitives'));
  const recipes = loadDir(join(REGISTRY, 'recipes'));
  const concepts = loadDir(join(REGISTRY, 'concepts'));
  const rules = loadDir(join(REGISTRY, 'rules'));

  console.log(`   primitives: ${primitives.length}`);
  console.log(`   recipes:    ${recipes.length}`);
  console.log(`   concepts:   ${concepts.length}`);
  console.log(`   rules:      ${rules.length}`);

  // ── Schema validation ────────────────────────────────────────────────────
  for (const { file, data } of primitives) {
    validate(data, primitiveSchema).forEach((e) => err(`primitives/${file}`, e));
    if (data.id && file !== `${data.id}.json`) {
      err(`primitives/${file}`, `filename must match id "${data.id}.json"`);
    }
  }
  for (const { file, data } of recipes) {
    validate(data, recipeSchema).forEach((e) => err(`recipes/${file}`, e));
    if (data.id && file !== `${data.id}.json`) {
      err(`recipes/${file}`, `filename must match id "${data.id}.json"`);
    }
  }
  for (const { file, data } of concepts) {
    validate(data, conceptSchema).forEach((e) => err(`concepts/${file}`, e));
    if (data.id && file !== `${data.id}.json`) {
      err(`concepts/${file}`, `filename must match id "${data.id}.json"`);
    }
  }
  for (const { file, data } of rules) {
    validate(data, ruleSchema).forEach((e) => err(`rules/${file}`, e));
  }

  if (errorCount > 0) {
    console.error(`\n❌ Schema validation failed (${errorCount} error(s)).`);
    process.exit(1);
  }

  // ── Cross-reference validation ──────────────────────────────────────────
  const primitiveIds = new Set(primitives.map((p) => p.data.id));
  const recipeIds = new Set(recipes.map((r) => r.data.id));
  const recipesById = new Map(recipes.map((r) => [r.data.id, r.data]));

  for (const { file, data } of recipes) {
    for (const id of [...data.primitives, ...data.optionalPrimitives]) {
      if (!primitiveIds.has(id)) {
        err(`recipes/${file}`, `references unknown primitive "${id}"`);
      }
    }
    // No duplicate ids between required and optional primitives.
    const overlap = data.primitives.filter((id) => data.optionalPrimitives.includes(id));
    if (overlap.length > 0) {
      err(`recipes/${file}`, `primitive(s) appear in both required and optional: ${overlap.join(', ')}`);
    }
  }

  for (const { file, data } of concepts) {
    for (const recipeRef of data.recipes) {
      if (!recipeIds.has(recipeRef.id)) {
        err(`concepts/${file}`, `references unknown recipe "${recipeRef.id}"`);
      } else {
        // The concept's per-recipe summary should not contradict the recipe descriptor.
        const recipe = recipesById.get(recipeRef.id);
        if (recipe && recipe.maturity !== recipeRef.maturity) {
          err(`concepts/${file}`, `recipe "${recipeRef.id}" maturity ${recipeRef.maturity} disagrees with recipe descriptor (${recipe.maturity})`);
        }
      }
    }
    if (data.recipeSelection) {
      const conceptRecipeIds = new Set(data.recipes.map((r) => r.id));
      if (!conceptRecipeIds.has(data.recipeSelection.defaultRecipeId)) {
        err(`concepts/${file}`, `recipeSelection.defaultRecipeId "${data.recipeSelection.defaultRecipeId}" not in concept.recipes`);
      }
      const paramIds = new Set(data.parameters.map((p) => p.id));
      for (const rule of data.recipeSelection.rules ?? []) {
        if (!conceptRecipeIds.has(rule.recipeId)) {
          err(`concepts/${file}`, `recipeSelection rule "${rule.id}" recipeId "${rule.recipeId}" not in concept.recipes`);
        }
        for (const cond of rule.matchAll) {
          if (!paramIds.has(cond.parameter)) {
            err(`concepts/${file}`, `recipeSelection rule "${rule.id}" references unknown parameter "${cond.parameter}"`);
          }
          // The equals value must agree with the parameter's declared type.
          const param = data.parameters.find((p) => p.id === cond.parameter);
          if (param) {
            const expected = PARAM_TYPE_TO_JS[param.type];
            const actual = typeof cond.equals === 'number' && Number.isInteger(cond.equals)
              ? 'integer'
              : typeof cond.equals;
            if (expected !== actual && !(expected === 'number' && actual === 'integer')) {
              err(`concepts/${file}`, `recipeSelection rule "${rule.id}" condition for "${cond.parameter}" expects ${expected} but matchAll value is ${actual}`);
            }
            if (param.enum.length > 0 && !param.enum.includes(cond.equals)) {
              err(`concepts/${file}`, `recipeSelection rule "${rule.id}" matchAll for "${cond.parameter}" uses "${cond.equals}" which is not in the parameter enum`);
            }
          }
        }
      }
    }
    // sourcePrimitives must be the closure of all recipe primitives + optionals.
    const declaredSource = new Set(data.sourcePrimitives);
    const referenced = new Set();
    for (const recipeRef of data.recipes) {
      const recipe = recipesById.get(recipeRef.id);
      if (!recipe) continue;
      for (const id of [...recipe.primitives, ...recipe.optionalPrimitives]) {
        referenced.add(id);
      }
    }
    for (const id of referenced) {
      if (!declaredSource.has(id)) {
        err(`concepts/${file}`, `sourcePrimitives missing "${id}" (used by referenced recipes)`);
      }
    }
    for (const id of declaredSource) {
      if (!referenced.has(id)) {
        err(`concepts/${file}`, `sourcePrimitives lists "${id}" but no recipe uses it`);
      }
    }
  }

  for (const { file, data } of rules) {
    for (const rule of data.rules) {
      for (const id of rule.ifAllPrimitives ?? []) {
        if (!primitiveIds.has(id)) err(`rules/${file}`, `rule "${rule.id}" references unknown primitive "${id}"`);
      }
      for (const id of rule.thenRequirePrimitives ?? []) {
        if (!primitiveIds.has(id)) err(`rules/${file}`, `rule "${rule.id}" requires unknown primitive "${id}"`);
      }
    }
  }

  if (errorCount > 0) {
    console.error(`\n❌ Cross-reference validation failed (${errorCount} error(s)).`);
    process.exit(1);
  }

  console.log('\n✅ Capability registry valid.');
}

main();
