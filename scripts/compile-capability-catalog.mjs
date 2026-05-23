#!/usr/bin/env node

import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CAPABILITIES_DIR = join(ROOT_DIR, 'capabilities');
const COMPILED_DIR = join(CAPABILITIES_DIR, 'compiled');
const PRIMITIVES_DIR = join(CAPABILITIES_DIR, 'primitives');
const RECIPES_DIR = join(CAPABILITIES_DIR, 'recipes');
const CONCEPTS_DIR = join(CAPABILITIES_DIR, 'concepts');
const RULES_DIR = join(CAPABILITIES_DIR, 'rules');
const outputPath = getFlagValue('--output');

const catalog = await buildCatalog();
const outputFile = outputPath
  ? resolve(ROOT_DIR, outputPath)
  : join(COMPILED_DIR, 'catalog.json');

await mkdir(dirname(outputFile), { recursive: true });
await writeFile(outputFile, JSON.stringify(catalog, null, 2) + '\n', 'utf8');
console.log(`Generated capability catalog: ${outputFile}`);

async function buildCatalog() {
  const primitives = await loadJsonDirectory(PRIMITIVES_DIR);
  const recipes = await loadJsonDirectory(RECIPES_DIR);
  const concepts = await loadJsonDirectory(CONCEPTS_DIR);
  const ruleFiles = await loadJsonDirectory(RULES_DIR);
  const recipeMap = new Map(recipes.map((entry) => [entry.id, entry]));

  return {
    schemaVersion: '1.0.0',
    kind: 'catalog',
    generatedAt: new Date().toISOString(),
    summary: {
      primitiveCount: primitives.length,
      recipeCount: recipes.length,
      conceptCount: concepts.length,
      ruleFileCount: ruleFiles.length,
    },
    primitives: primitives
      .map((primitive) => ({
        id: primitive.id,
        category: primitive.category,
        maturity: primitive.maturity,
        package: primitive.package,
        summary: primitive.summary,
        provides: primitive.provides,
        recommendedWith: primitive.recommendedWith ?? [],
      }))
      .sort(byId),
    recipes: recipes
      .map((recipe) => ({
        id: recipe.id,
        maturity: recipe.maturity,
        summary: recipe.summary,
        goal: recipe.goal,
        primitives: recipe.primitives,
        optionalPrimitives: recipe.optionalPrimitives ?? [],
        expectedSurfaces: recipe.expectedSurfaces,
        smokeChecks: recipe.smokeChecks,
      }))
      .sort(byId),
    concepts: concepts
      .map((concept) => ({
        id: concept.id,
        displayName: concept.displayName,
        summary: concept.summary,
        status: concept.status,
        maturity: concept.maturity,
        tags: concept.tags ?? [],
        menuVisible: Boolean(concept.qualification?.menuVisible),
        approvalTier: concept.qualification?.approvalTier ?? 'unreviewed',
        parameters: buildParameterIndex(concept.parameterSchema),
        recipeSelection: concept.recipeSelection ?? null,
        recipes: (concept.recipeCandidates ?? [])
          .map((recipeId) => {
            const recipe = recipeMap.get(recipeId);
            if (!recipe) {
              return {
                id: recipeId,
                summary: 'Unknown recipe',
                maturity: 'unknown',
                primitives: [],
                optionalPrimitives: [],
              };
            }
            return {
              id: recipe.id,
              summary: recipe.summary,
              maturity: recipe.maturity,
              primitives: recipe.primitives,
              optionalPrimitives: recipe.optionalPrimitives ?? [],
            };
          })
          .sort(byId),
        sourcePrimitives: [...(concept.sourcePrimitives ?? [])].sort(),
        qualification: concept.qualification,
      }))
      .sort(byId),
    rules: ruleFiles
      .flatMap((rulesFile) =>
        (rulesFile.rules ?? []).map((rule) => ({
          id: rule.id,
          description: rule.description,
          ifAllPrimitives: [...(rule.ifAllPrimitives ?? [])].sort(),
          thenRequirePrimitives: [...(rule.thenRequirePrimitives ?? [])].sort(),
        })),
      )
      .sort(byId),
  };
}

function buildParameterIndex(parameterSchema = {}) {
  const properties = parameterSchema.properties ?? {};
  const required = new Set(parameterSchema.required ?? []);
  return Object.entries(properties)
    .map(([id, definition]) => ({
      id,
      type: definition.type,
      description: definition.description,
      required: required.has(id),
      enum: definition.enum ?? [],
      default: definition.default ?? null,
      formatHint: definition.formatHint ?? null,
    }))
    .sort(byId);
}

async function loadJsonDirectory(dirPath) {
  const entries = await readdir(dirPath, { withFileTypes: true });
  const files = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
    .sort((a, b) => a.name.localeCompare(b.name));
  const results = [];

  for (const file of files) {
    const filePath = join(dirPath, file.name);
    const raw = await readFile(filePath, 'utf8');
    results.push(JSON.parse(raw));
  }

  return results;
}

function byId(left, right) {
  return String(left.id).localeCompare(String(right.id));
}

function getFlagValue(flag) {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] ?? null : null;
}
