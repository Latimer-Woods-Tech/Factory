#!/usr/bin/env node
/**
 * update-stack-manifest.js
 *
 * Reads all packages/*/package.json files and updates the AUTO-UPDATED block
 * in docs/STACK.md with current package names and versions.
 *
 * Usage:  node scripts/update-stack-manifest.js
 *   --check   Dry-run: exit 1 if STACK.md is out of sync (no file write).
 *
 * Trigger: .github/workflows/update-stack-manifest.yml (after successful package publish)
 */

const fs = require('fs');
const path = require('path');

const CHECK_ONLY = process.argv.includes('--check');

const STACK_MD_PATH = path.join(__dirname, '../docs/STACK.md');
const PACKAGES_DIR = path.join(__dirname, '../packages');
const AUTO_START = '<!-- AUTO-UPDATED-START -->';
const AUTO_END   = '<!-- AUTO-UPDATED-END -->';

const pkgDirs = fs.readdirSync(PACKAGES_DIR).filter((d) => {
  const p = path.join(PACKAGES_DIR, d, 'package.json');
  return fs.existsSync(p) && fs.statSync(path.join(PACKAGES_DIR, d)).isDirectory();
});

const versions = [];
for (const dir of pkgDirs.sort()) {
  try {
    const json = JSON.parse(fs.readFileSync(path.join(PACKAGES_DIR, dir, 'package.json'), 'utf8'));
    if (json.name && json.version) versions.push({ name: json.name, version: json.version });
  } catch (err) {
    console.error('  Skipping ' + dir + ': ' + err.message);
  }
}

if (!versions.length) { console.error('No packages found. Aborting.'); process.exit(1); }

const rows = versions.map(({ name, version }) => '| `' + name + '` | `' + version + '` | stable |').join('
');
const newBlock = AUTO_START + '
| Package | Version | Status |
|---------|---------|--------|
' + rows + '
' + AUTO_END;

const stackContent = fs.readFileSync(STACK_MD_PATH, 'utf8');
const startIdx = stackContent.indexOf(AUTO_START);
const endIdx   = stackContent.indexOf(AUTO_END);
if (startIdx === -1 || endIdx === -1) {
  console.error('AUTO-UPDATED markers not found in docs/STACK.md. Aborting.');
  process.exit(1);
}

const currentBlock = stackContent.slice(startIdx, endIdx + AUTO_END.length);
if (currentBlock === newBlock) {
  console.log('STACK.md is already up to date.');
  process.exit(0);
}

if (CHECK_ONLY) {
  console.error('DRIFT DETECTED: docs/STACK.md package versions are out of sync with packages/*/package.json');
  console.error('Run: node scripts/update-stack-manifest.js to fix.');
  process.exit(1);
}

const today = new Date().toISOString().split('T')[0];
const updated = stackContent.slice(0, startIdx) + newBlock + stackContent.slice(endIdx + AUTO_END.length);
const final = updated.replace(
  /\*Last updated: .+?\*/,
  '*Last updated: ' + today + ' (auto-update: see `.github/workflows/update-stack-manifest.yml`)*'
);

fs.writeFileSync(STACK_MD_PATH, final, 'utf8');
console.log('Updated docs/STACK.md with ' + versions.length + ' packages (' + today + ')');
versions.forEach(({ name, version }) => console.log('  ' + name + '@' + version));
