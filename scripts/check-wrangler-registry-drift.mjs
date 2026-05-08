#!/usr/bin/env node
/**
 * check-wrangler-registry-drift.mjs (FRH-WRNG-01)
 *
 * Verifies that every Cloudflare Worker recorded in docs/service-registry.yml
 * for the Latimer-Woods-Tech/factory repo has a matching `name` entry in some
 * apps/<appName>/wrangler.jsonc file.
 *
 * Motivation: the Worker Rename Protocol (CLAUDE.md) requires that wrangler.jsonc
 * `name` and service-registry.yml stay in sync. Without automation, renames that
 * update wrangler.jsonc but forget the registry (or vice-versa) are silent until
 * production traffic breaks.
 *
 * Exit codes:
 *   0 — all registry entries satisfied; warnings for any unregistered wrangler names
 *   1 — at least one registry entry has no matching wrangler.jsonc name
 */

import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

const REPO_ROOT = path.resolve(import.meta.dirname, '..');
const REGISTRY_PATH = path.join(REPO_ROOT, 'docs', 'service-registry.yml');
const APPS_DIR = path.join(REPO_ROOT, 'apps');
const THIS_REPO = 'Latimer-Woods-Tech/factory';

// ---------------------------------------------------------------------------
// Parse service-registry.yml — extract worker names for this repo
// ---------------------------------------------------------------------------

const registryContent = readFileSync(REGISTRY_PATH, 'utf8');

/**
 * Extract all `name: <value>` entries from the `workers:` section whose
 * `repo:` field matches THIS_REPO. Uses line-by-line parsing (no js-yaml dep).
 *
 * @returns {Map<string, {id: string}>} workerName → {id}
 */
function parseRegistryWorkerNames(content) {
  const names = new Map();
  const lines = content.split(/\r?\n/);
  let inWorkersSection = false;
  let currentId = null;
  let currentRepo = null;

  for (const line of lines) {
    if (/^workers:/.test(line)) { inWorkersSection = true; continue; }
    if (/^(pages|packages|automation_denylist):/.test(line)) { inWorkersSection = false; continue; }
    if (!inWorkersSection) continue;

    const idMatch = line.match(/^\s+-\s+id:\s+(\S+)/);
    if (idMatch) { currentId = idMatch[1] ?? null; currentRepo = null; continue; }

    const repoMatch = line.match(/^\s+repo:\s+(\S+)/);
    if (repoMatch) { currentRepo = repoMatch[1] ?? null; continue; }

    // Only record names for workers in this repo
    const nameMatch = line.match(/^\s+name:\s+(\S+)/);
    if (nameMatch && currentRepo === THIS_REPO && currentId !== null) {
      names.set(nameMatch[1], { id: currentId });
    }
  }

  return names;
}

// ---------------------------------------------------------------------------
// Parse all apps/*/wrangler.jsonc — collect every worker name value
// ---------------------------------------------------------------------------

/** Strip line and block comments from JSONC text before JSON.parse. */
function stripJsoncComments(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\r\n]*/g, '');
}

function collectWranglerNames() {
  const allNames = new Set();
  let appDirs;
  try {
    appDirs = readdirSync(APPS_DIR, { withFileTypes: true });
  } catch {
    return allNames;
  }

  for (const entry of appDirs) {
    if (!entry.isDirectory()) continue;
    const wranglerPath = path.join(APPS_DIR, entry.name, 'wrangler.jsonc');
    let raw;
    try {
      raw = readFileSync(wranglerPath, 'utf8');
    } catch {
      continue;
    }

    let parsed;
    try {
      parsed = JSON.parse(stripJsoncComments(raw));
    } catch {
      console.warn(`[wrangler-drift] Could not parse ${wranglerPath} — skipping`);
      continue;
    }

    // Top-level name
    if (typeof parsed.name === 'string') allNames.add(parsed.name);

    // Environment-specific names under env.<envName>.name
    if (typeof parsed.env === 'object' && parsed.env !== null) {
      for (const envConfig of Object.values(parsed.env)) {
        if (
          typeof envConfig === 'object' &&
          envConfig !== null &&
          typeof envConfig.name === 'string'
        ) {
          allNames.add(envConfig.name);
        }
      }
    }
  }

  return allNames;
}

// ---------------------------------------------------------------------------
// Compare and report
// ---------------------------------------------------------------------------

const registryNames = parseRegistryWorkerNames(registryContent);
const wranglerNames = collectWranglerNames();

const missing = [];
for (const [name, meta] of registryNames) {
  if (!wranglerNames.has(name)) {
    missing.push({ name, id: meta.id });
  }
}

// Warn (do not fail) for wrangler names not yet in the registry
const unregistered = [...wranglerNames].filter((n) => !registryNames.has(n));

if (missing.length > 0) {
  console.error('\n[FRH-WRNG-01] Registry entries without a matching wrangler.jsonc name:');
  for (const { name, id } of missing) {
    console.error(`  id=${id}  name="${name}"`);
    console.error(`    → not found in any apps/*/wrangler.jsonc`);
    console.error(`    → either the worker was renamed without updating the registry,`);
    console.error(`       or the app's wrangler.jsonc is missing`);
  }
}

if (unregistered.length > 0) {
  console.warn('\n[FRH-WRNG-01] WARNING — wrangler.jsonc names not in service-registry.yml:');
  for (const name of unregistered) {
    console.warn(`  "${name}" → add to docs/service-registry.yml when this worker is deployed`);
  }
}

if (missing.length > 0) {
  console.error(
    `\n[FRH-WRNG-01] ${missing.length} violation(s). Fix before merging.`,
  );
  process.exit(1);
}

console.log(
  `✓ wrangler ↔ service-registry drift check passed (${registryNames.size} registry entries verified).`,
);
process.exit(0);
