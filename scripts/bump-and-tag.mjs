#!/usr/bin/env node
/**
 * bump-and-tag.mjs
 *
 * Usage:
 *   node scripts/bump-and-tag.mjs <package-short-name> <patch|minor|major>
 *
 * Example:
 *   node scripts/bump-and-tag.mjs auth patch       # creates auth/v1.0.1
 *   node scripts/bump-and-tag.mjs neon minor       # creates neon/v1.1.0
 *
 * This script:
 *   1. Bumps the version in packages/<name>/package.json via `npm version`
 *   2. Creates git tag <name>/v<new-version>
 *   3. Pushes the tag to origin — triggers publish.yml automatically
 *
 * Requires: git, npm, and a clean working tree.
 * W360-025 — cross-repo release train.
 */

import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = join(__dirname, '..');

const VALID_BUMPS = ['patch', 'minor', 'major'];

const PACKAGE_ORDER = [
  'errors', 'monitoring', 'logger', 'auth', 'neon', 'stripe',
  'llm', 'telephony', 'analytics', 'deploy', 'testing', 'email',
  'copy', 'content', 'social', 'seo', 'crm', 'compliance', 'admin',
  'video', 'schedule', 'validation',
];

/**
 * Run a command with explicit argument array (no shell interpolation).
 * Throws on non-zero exit.
 */
function run(cmd, args, cwd = repoRoot) {
  const result = spawnSync(cmd, args, { cwd, stdio: 'pipe', encoding: 'utf-8' });
  if (result.status !== 0) {
    throw new Error((result.stderr ?? '').trim() || `${cmd} exited with code ${result.status}`);
  }
  return (result.stdout ?? '').trim();
}

function die(msg) {
  console.error(`\nERROR: ${msg}\n`);
  process.exit(1);
}

// ── Validate arguments ──────────────────────────────────────────────────────

const [pkgShortName, bumpType] = process.argv.slice(2);

if (!pkgShortName) die('Missing package short name. Usage: bump-and-tag.mjs <name> <patch|minor|major>');
if (!VALID_BUMPS.includes(bumpType)) die(`Invalid bump type "${bumpType}". Must be one of: ${VALID_BUMPS.join(', ')}`);
if (!PACKAGE_ORDER.includes(pkgShortName)) die(`Unknown package "${pkgShortName}". Known: ${PACKAGE_ORDER.join(', ')}`);

const pkgDir = join(repoRoot, 'packages', pkgShortName);

// ── Pre-flight: working tree must be clean ──────────────────────────────────

const status = run('git', ['status', '--porcelain']);
if (status.length > 0) {
  die(`Working tree is dirty. Commit or stash changes first:\n${status}`);
}

// ── Bump the version ────────────────────────────────────────────────────────

console.log(`\nBumping @latimer-woods-tech/${pkgShortName} (${bumpType})…`);

// --no-git-tag-version because we create the tag with a custom prefix
const rawOut = run('npm', ['version', bumpType, '--no-git-tag-version'], pkgDir);
const newVersion = rawOut.startsWith('v') ? rawOut.slice(1) : rawOut;
const tag = `${pkgShortName}/v${newVersion}`;

console.log(`  New version : ${newVersion}`);
console.log(`  Tag         : ${tag}`);

// Commit the package.json change
run('git', ['add', `packages/${pkgShortName}/package.json`]);
run('git', ['commit', '-m', `chore(${pkgShortName}): bump to v${newVersion}`]);

// ── Create and push the tag ─────────────────────────────────────────────────

run('git', ['tag', '-a', tag, '-m', `Release ${tag}`]);
console.log(`\nTag created: ${tag}`);

run('git', ['push', 'origin', 'main']);
run('git', ['push', 'origin', tag]);

console.log(`\nTag pushed. GitHub Actions publish.yml will now build and publish @latimer-woods-tech/${pkgShortName}@${newVersion}.`);

// ── Read the new version from package.json for confirmation ─────────────────

const pkgJson = JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf-8'));
if (pkgJson.version !== newVersion) {
  die(`Version mismatch: package.json shows ${pkgJson.version}, expected ${newVersion}`);
}

console.log(`
Next steps:
  1. Wait for publish.yml to complete:
       gh run watch --repo Latimer-Woods-Tech/factory --workflow publish.yml

  2. Update internal consumers (apps/ in Factory repo):
       cd apps/<app> && npm install @latimer-woods-tech/${pkgShortName}@${newVersion}

  3. Update external consumers (prime-self, xico-city, etc.):
       cd <repo> && npm install @latimer-woods-tech/${pkgShortName}@${newVersion}

  4. Deploy consumers to staging, run smoke, then deploy to production.

  See docs/operations/CROSS_REPO_RELEASE_TRAIN.md for the full procedure.
`);
