#!/usr/bin/env node
// @node-runtime — Capability registry validator with structured JSON output.
// Validates all descriptors under capabilities/{primitives,recipes,concepts,rules}/
// against their JSON Schema files. Exits 0 and prints JSON on success; exits 1 on errors.

import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadSchema, validate } from './capabilities/lib/schema-validator.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..');
const REGISTRY = join(REPO_ROOT, 'capabilities');
const SCHEMAS = join(REGISTRY, 'schema');

const errors = [];

function loadDir(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .map((f) => {
      const path = join(dir, f);
      const data = JSON.parse(readFileSync(path, 'utf8'));
      const relPath = path.slice(REPO_ROOT.length + 1).replace(/\\/gu, '/');
      return { file: f, path, relPath, data };
    });
}

const primitiveSchema = loadSchema(join(SCHEMAS, 'primitive.schema.json'));
const recipeSchema = loadSchema(join(SCHEMAS, 'recipe.schema.json'));
const conceptSchema = loadSchema(join(SCHEMAS, 'concept.schema.json'));
const ruleSchema = loadSchema(join(SCHEMAS, 'rule.schema.json'));

const primitives = loadDir(join(REGISTRY, 'primitives'));
const recipes = loadDir(join(REGISTRY, 'recipes'));
const concepts = loadDir(join(REGISTRY, 'concepts'));
const rules = loadDir(join(REGISTRY, 'rules'));

for (const { relPath, data } of primitives) {
  validate(data, primitiveSchema).forEach((e) => errors.push(`[validate-capability-registry] ${relPath}: ${e}`));
}
for (const { relPath, data } of recipes) {
  validate(data, recipeSchema).forEach((e) => errors.push(`[validate-capability-registry] ${relPath}: ${e}`));
}
for (const { relPath, data } of concepts) {
  validate(data, conceptSchema).forEach((e) => errors.push(`[validate-capability-registry] ${relPath}: ${e}`));
}
for (const { relPath, data } of rules) {
  validate(data, ruleSchema).forEach((e) => errors.push(`[validate-capability-registry] ${relPath}: ${e}`));
}

if (errors.length > 0) {
  for (const e of errors) process.stderr.write(e + '\n');
  process.exit(1);
}

process.stdout.write(
  JSON.stringify(
    {
      ok: true,
      primitives: primitives.length,
      recipes: recipes.length,
      concepts: concepts.length,
      ruleFiles: rules.length,
      checkedAt: new Date().toISOString(),
    },
    null,
    2,
  ) + '\n',
);
