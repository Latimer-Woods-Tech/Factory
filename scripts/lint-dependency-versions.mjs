#!/usr/bin/env node
/**
 * FRH-08: Dependency Version Policy Linter
 *
 * Enforces ADR-0004: all external dependencies must use caret (^) ranges.
 * Workspace references (workspace:*) and peer deps are allowed to vary.
 *
 * Usage:
 *   node scripts/lint-dependency-versions.mjs
 *
 * Exit code 0 = all manifests comply.
 * Exit code 1 = one or more violations found (list printed to stdout).
 */

import { readFileSync, readdirSync, existsSync } from 'fs';
import { join, resolve } from 'path';
import { fileURLToPath } from 'url';

const ROOT = resolve(fileURLToPath(import.meta.url), '..', '..');

/** Fields to check (peerDependencies excluded — they use a different convention). */
const CHECKED_FIELDS = ['dependencies', 'devDependencies', 'optionalDependencies'];

/** Paths to scan for package.json files. */
function collectManifests() {
  const manifests = [];

  function tryPkg(dir) {
    const p = join(dir, 'package.json');
    if (existsSync(p)) manifests.push(p);
  }

  tryPkg(ROOT);

  for (const workspace of ['packages', 'apps']) {
    const wsDir = join(ROOT, workspace);
    if (!existsSync(wsDir)) continue;
    for (const entry of readdirSync(wsDir, { withFileTypes: true })) {
      if (entry.isDirectory()) tryPkg(join(wsDir, entry.name));
    }
  }

  return manifests;
}

/** Scope prefixes that are managed within this monorepo. */
const INTERNAL_SCOPES = ['@latimer-woods-tech/'];

function isInternal(name) {
  return INTERNAL_SCOPES.some((s) => name.startsWith(s));
}

/** Returns a human-readable reason string if the version string violates policy, else null. */
function violationReason(name, version) {
  if (version.startsWith('workspace:')) return null; // workspace protocol — allowed
  if (version.startsWith('npm:')) return null;       // npm alias — allowed
  if (version.startsWith('file:') && isInternal(name)) return null; // monorepo local ref — allowed

  if (version === '*') return 'unbounded wildcard (*)';
  if (version.startsWith('>=') || version.startsWith('>')) return `unbounded range "${version}"`;
  if (version.startsWith('~')) return `tilde range "${version}" — use caret (^) instead`;
  if (version.startsWith('git+') || version.startsWith('git://')) return `git reference "${version}"`;
  if (version.startsWith('file:')) return `external file reference "${version}" (only internal @latimer-woods-tech/* refs allowed)`;
  if (version.startsWith('http://') || version.startsWith('https://')) return `URL reference "${version}"`;
  if (/^\d/.test(version)) return `exact pin "${version}" — use "^${version}" instead`;

  return null; // ^X.Y.Z and similar caret ranges pass
}

let violations = 0;

for (const manifestPath of collectManifests()) {
  const rel = manifestPath.replace(ROOT + '/', '').replace(ROOT + '\\', '');
  let pkg;
  try {
    pkg = JSON.parse(readFileSync(manifestPath, 'utf8'));
  } catch {
    console.error(`[dep-lint] Cannot parse ${rel}`);
    violations++;
    continue;
  }

  for (const field of CHECKED_FIELDS) {
    const deps = pkg[field];
    if (!deps) continue;
    for (const [name, version] of Object.entries(deps)) {
      const reason = violationReason(name, String(version));
      if (reason) {
        console.error(`[dep-lint] ${rel} » ${field}.${name}: ${reason}`);
        violations++;
      }
    }
  }
}

if (violations === 0) {
  console.log('[dep-lint] All manifests comply with ADR-0004 (caret ranges only).');
  process.exit(0);
} else {
  console.error(`\n[dep-lint] ${violations} violation(s) found. See ADR-0004 for policy.`);
  process.exit(1);
}
