#!/usr/bin/env node
// check-wrangler-registry-drift.mjs
//
// Enforcement rule FRH-WRNG-01:
//
// Every Cloudflare Worker name defined in apps/[app]/wrangler.jsonc (the
// top-level `name` field and any `env.<env>.name` override) must have a
// matching entry in docs/service-registry.yml under the `workers:` list.
//
// Reverse check (warning only):
//   Any `workers:` entry in the service registry that has no corresponding
//   wrangler.jsonc in this repo prints a WARNING but does NOT fail CI.
//   The worker may live in an external repo (e.g. prime-self, videoking).
//
// Known exceptions list (REGISTRY_EXEMPT):
//   Worker names in REGISTRY_EXEMPT are excluded from the hard-fail check.
//   Use this for workers intentionally not yet registered (e.g. in-progress
//   scaffolding). Keep this list short; the goal is zero exemptions.
//
// Exit 0 -- all wrangler names are registered (or exempted).
// Exit 1 -- one or more wrangler names are missing from the registry.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

// Use process.cwd() so the script works when invoked from the repo root (CI).
const REPO_ROOT = process.cwd();
const APPS_DIR = path.join(REPO_ROOT, 'apps');
const REGISTRY_PATH = path.join(REPO_ROOT, 'docs', 'service-registry.yml');

// Worker names deliberately not yet in the service registry.
// Each entry must have a comment explaining why.
// Remove entries once the worker is registered.
const REGISTRY_EXEMPT = new Set([
  // factory-supervisor: internal orchestrator, not yet promoted to production.
  // Register once the worker is live-verified.
  'factory-supervisor',

  // daily-brief: experimental cron, not yet promoted to production.
  // Register once deployment is verified.
  'daily-brief',

  // admin-studio: top-level wrangler.jsonc default name used only for local dev.
  // Deployed environments use admin-studio-staging and admin-studio-production,
  // which ARE registered. The base name is never deployed directly.
  'admin-studio',
]);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Strip JSONC comments so the file can be parsed with JSON.parse.
// Uses a character-level state machine so it never strips `//` or `/* */`
// that appear inside string literals (e.g. URLs like "https://example.com").
function stripJsoncComments(src) {
  let out = '';
  let i = 0;
  while (i < src.length) {
    // Inside a double-quoted string — copy verbatim until closing quote.
    if (src[i] === '"') {
      out += src[i++];
      while (i < src.length) {
        if (src[i] === '\\') {
          // Escape sequence — copy both characters.
          out += src[i++];
          if (i < src.length) out += src[i++];
        } else if (src[i] === '"') {
          out += src[i++];
          break;
        } else {
          out += src[i++];
        }
      }
      continue;
    }
    // Block comment /* ... */
    if (src[i] === '/' && src[i + 1] === '*') {
      i += 2;
      while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) i++;
      i += 2; // skip closing */
      continue;
    }
    // Line comment // ...
    if (src[i] === '/' && src[i + 1] === '/') {
      while (i < src.length && src[i] !== '\n') i++;
      continue;
    }
    out += src[i++];
  }
  return out;
}

// Read and parse a JSONC file. Returns null on any error.
function readJsonc(filePath) {
  let raw;
  try {
    raw = readFileSync(filePath, 'utf8');
  } catch {
    return null;
  }
  try {
    return JSON.parse(stripJsoncComments(raw));
  } catch (err) {
    console.warn(`WARN  Could not parse ${filePath}: ${err.message}`);
    return null;
  }
}

// Extract all worker names from a parsed wrangler config object.
// Collects the top-level `name` and any `env.<env>.name` overrides.
function extractWranglerNames(cfg) {
  const names = new Set();
  if (typeof cfg.name === 'string' && cfg.name.trim()) {
    names.add(cfg.name.trim());
  }
  if (cfg.env && typeof cfg.env === 'object') {
    for (const envCfg of Object.values(cfg.env)) {
      if (envCfg && typeof envCfg.name === 'string' && envCfg.name.trim()) {
        names.add(envCfg.name.trim());
      }
    }
  }
  return [...names];
}

// Parse worker names from service-registry.yml without an external YAML dep.
// Scans lines between the `workers:` top-level key and the next top-level key.
// Captures every `name: <value>` line found in that block.
// This is intentionally simple -- the registry follows a consistent style.
function parseRegistryWorkerNames(src) {
  const names = [];
  const lines = src.split(/\r?\n/);
  let inWorkers = false;

  for (const line of lines) {
    // Detect the `workers:` top-level key.
    if (/^workers:/.test(line)) {
      inWorkers = true;
      continue;
    }
    // A non-indented, non-comment, non-blank line ends the workers block.
    if (inWorkers && /^[a-zA-Z_]/.test(line)) {
      inWorkers = false;
    }
    if (!inWorkers) continue;

    // Capture `  name: some-value` lines (optional inline comment after #).
    const m = line.match(/^\s+name:\s+([^\s#]+)/);
    if (m) {
      names.push(m[1].trim());
    }
  }

  return names;
}

// ---------------------------------------------------------------------------
// Collect wrangler names from apps/
// ---------------------------------------------------------------------------

const appEntries = []; // Array<{ app: string, names: string[] }>

let appDirs;
try {
  appDirs = readdirSync(APPS_DIR);
} catch {
  console.error(`ERROR  Cannot read apps directory: ${APPS_DIR}`);
  process.exit(1);
}

for (const dir of appDirs) {
  const appPath = path.join(APPS_DIR, dir);
  let stat;
  try {
    stat = statSync(appPath);
  } catch {
    continue;
  }
  if (!stat.isDirectory()) continue;

  const wranglerPath = path.join(appPath, 'wrangler.jsonc');
  const cfg = readJsonc(wranglerPath);
  if (!cfg) continue; // no wrangler.jsonc or unparseable

  const names = extractWranglerNames(cfg);
  if (names.length > 0) {
    appEntries.push({ app: dir, names });
  }
}

// ---------------------------------------------------------------------------
// Collect registered names from docs/service-registry.yml
// ---------------------------------------------------------------------------

let registrySrc;
try {
  registrySrc = readFileSync(REGISTRY_PATH, 'utf8');
} catch {
  console.error(`ERROR  Cannot read service registry: ${REGISTRY_PATH}`);
  process.exit(1);
}

const registeredNames = new Set(parseRegistryWorkerNames(registrySrc));

// ---------------------------------------------------------------------------
// Forward check: wrangler names must appear in registry
// ---------------------------------------------------------------------------

const unregistered = []; // Array<{ app: string, name: string }>

for (const { app, names } of appEntries) {
  for (const name of names) {
    if (!registeredNames.has(name) && !REGISTRY_EXEMPT.has(name)) {
      unregistered.push({ app, name });
    }
  }
}

// ---------------------------------------------------------------------------
// Reverse check: registry entries with no local wrangler.jsonc (warn only)
// ---------------------------------------------------------------------------

const allWranglerNames = new Set(appEntries.flatMap((e) => e.names));
const registryOrphans = [];

for (const regName of registeredNames) {
  if (!allWranglerNames.has(regName)) {
    registryOrphans.push(regName);
  }
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

console.log('\n-- Wrangler <-> Service-Registry Drift Check (FRH-WRNG-01) ------------');
console.log(`   Scanned ${appEntries.length} app(s) with wrangler.jsonc`);
console.log(`   Registry entries: ${registeredNames.size}`);
console.log(`   Exempt (not yet registered): ${[...REGISTRY_EXEMPT].join(', ') || 'none'}`);
console.log('------------------------------------------------------------------------\n');

if (registryOrphans.length > 0) {
  console.warn('[WARN] Service registry entries with no local wrangler.jsonc:');
  console.warn('       (Expected for workers in external repos -- no CI failure)');
  for (const name of registryOrphans) {
    console.warn(`         - ${name}`);
  }
  console.warn('');
}

if (unregistered.length === 0) {
  console.log('OK  All wrangler worker names are registered in docs/service-registry.yml.');
  process.exit(0);
}

console.error('[ERROR] Wrangler worker names NOT in docs/service-registry.yml:');
console.error('');
for (const { app, name } of unregistered) {
  console.error(`  app: ${app}`);
  console.error(`    worker name: "${name}"`);
  console.error(`    fix: add an entry under  workers:  in docs/service-registry.yml`);
  console.error(`         OR add "${name}" to REGISTRY_EXEMPT in this script if the`);
  console.error(`         worker is intentionally not yet promoted to production.`);
  console.error('');
}
console.error(
  `${unregistered.length} unregistered worker name(s) found. ` +
    'Register them in docs/service-registry.yml before merging.',
);
process.exit(1);
