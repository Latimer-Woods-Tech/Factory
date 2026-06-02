#!/usr/bin/env node
/**
 * FRH-10: Docs-to-Service-Registry Endpoint Consistency Checker
 *
 * Scans docs for *.adrper79.workers.dev URLs and verifies that each
 * referenced worker name is registered in docs/service-registry.yml.
 *
 * This catches stale or conflicting endpoint narratives, e.g. a doc
 * claiming "videoking.adrper79.workers.dev" when the registry says
 * the deployed name is "capricast-api".
 *
 * Usage:
 *   node scripts/check-docs-registry-consistency.mjs
 *
 * Exit code 0 = all refs resolve to registered workers.
 * Exit code 1 = one or more unregistered worker names found.
 */

import { readFileSync, readdirSync, statSync, existsSync } from 'fs';
import { join, resolve, relative } from 'path';
import { fileURLToPath } from 'url';

const ROOT = process.env.DOCS_TARGET_ROOT ? resolve(process.env.DOCS_TARGET_ROOT) : resolve(fileURLToPath(import.meta.url), '..', '..');
const REGISTRY_PATH = join(ROOT, 'docs', 'service-registry.yml');

// Names used in template/runbook examples — never a deployed canonical endpoint.
const PLACEHOLDER_NAMES = new Set([
  // Generic template placeholders
  'my-app', 'app-x', 'your-worker', 'example', 'worker-name',
  // R2 custom domains documented as example upload targets
  'r2',
  // wordis-bond: automation-denylist app used as example in env-isolation runbook
  'wordis-bond', 'wordis-bond-staging',
  // xico-city: future planned app referenced in SLO planning docs
  'xico-city',
]);

// Paths to skip during the doc scan (relative to docs/).
const SKIP_PATH_PREFIXES = ['archive', '_generated', '_catalog'];

// Doc extensions to scan.
const DOC_EXTENSIONS = new Set(['.md', '.mdx', '.txt']);

// ─── Parse registry ───────────────────────────────────────────────────────────

function parseRegisteredWorkerNames(registryText) {
  const names = new Set();
  // Match "name: <value>" lines (canonical worker names).
  for (const match of registryText.matchAll(/^\s{2,4}name:\s+["']?([a-zA-Z0-9_-]+)["']?/gm)) {
    names.add(match[1]);
  }
  // Match "legacy_names: [name1, name2]" lists (historical names still referenced in docs).
  for (const match of registryText.matchAll(/^\s+legacy_names:\s+\[([^\]]+)\]/gm)) {
    for (const alias of match[1].split(',')) {
      names.add(alias.trim().replace(/^["']|["']$/g, ''));
    }
  }
  return names;
}

// ─── Scan docs ────────────────────────────────────────────────────────────────

function* walkDocs(dir, docsRoot) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = join(dir, entry.name);
    const relToDocs = relative(docsRoot, fullPath).replace(/\\/g, '/');

    if (entry.isDirectory()) {
      const skip = SKIP_PATH_PREFIXES.some((prefix) => relToDocs === prefix || relToDocs.startsWith(prefix + '/'));
      if (!skip) yield* walkDocs(fullPath, docsRoot);
    } else if (entry.isFile()) {
      const ext = entry.name.slice(entry.name.lastIndexOf('.'));
      if (DOC_EXTENSIONS.has(ext)) yield fullPath;
    }
  }
}

/** Extracts worker subdomain names from workers.dev URLs in a text blob. */
function extractWorkerNames(text) {
  const hits = [];
  // Pattern: https?://<name>.adrper79.workers.dev
  for (const match of text.matchAll(/https?:\/\/([a-zA-Z0-9_-]+)\.adrper79\.workers\.dev/g)) {
    hits.push(match[1]);
  }
  return hits;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

if (!existsSync(REGISTRY_PATH)) {
  console.error(`[docs-registry] Cannot find service registry at ${REGISTRY_PATH}`);
  process.exit(1);
}

const registryText = readFileSync(REGISTRY_PATH, 'utf8');
const registeredNames = parseRegisteredWorkerNames(registryText);

const docsDir = join(ROOT, 'docs');
let violations = 0;
const seen = new Set(); // deduplicate (name, file) pairs

for (const filePath of walkDocs(docsDir, docsDir)) {
  let text;
  try {
    text = readFileSync(filePath, 'utf8');
  } catch {
    continue;
  }

  const workerNames = extractWorkerNames(text);
  if (workerNames.length === 0) continue;

  const relPath = relative(ROOT, filePath).replace(/\\/g, '/');

  for (const name of workerNames) {
    if (PLACEHOLDER_NAMES.has(name)) continue; // template placeholder — skip
    if (registeredNames.has(name)) continue;   // registered — OK

    const key = `${name}::${relPath}`;
    if (seen.has(key)) continue;
    seen.add(key);

    console.error(`[docs-registry] ${relPath}: references unregistered worker "${name}.adrper79.workers.dev"`);
    violations++;
  }
}

if (violations === 0) {
  console.log(`[docs-registry] All workers.dev references resolve to registered workers (${registeredNames.size} registered).`);
  process.exit(0);
} else {
  console.error(`\n[docs-registry] ${violations} unregistered worker reference(s) found.`);
  console.error('[docs-registry] Update the doc to use the registered worker name, or add the worker to docs/service-registry.yml.');
  process.exit(1);
}
