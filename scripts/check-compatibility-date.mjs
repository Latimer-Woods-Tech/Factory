#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');
const EXPECTED_DATE = '2026-05-01';
const APPS_DIR = path.join(REPO_ROOT, 'apps');
const CHECK_FILES = [
  path.join(REPO_ROOT, 'packages', 'deploy', 'templates', 'wrangler.jsonc'),
  path.join(REPO_ROOT, 'packages', 'deploy', 'scripts', 'scaffold.mjs'),
  path.join(REPO_ROOT, 'packages', 'deploy', 'scripts', 'scaffold-factory-admin.mjs'),
];

const COMPAT_REGEX = /compatibility_date"?\s*[:=]\s*['"]([^'"\r\n]+)['"]/g;

function findAppWranglerFiles() {
  const files = [];
  const entries = readdirSync(APPS_DIR, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const wranglerPath = path.join(APPS_DIR, entry.name, 'wrangler.jsonc');
    if (existsSync(wranglerPath)) {
      files.push(wranglerPath);
    }
  }
  return files;
}

function readFile(pathname) {
  try {
    return readFileSync(pathname, 'utf8');
  } catch {
    return null;
  }
}

function validateFile(filePath) {
  const text = readFile(filePath);
  if (text === null) {
    return { filePath, error: 'file missing' };
  }

  const matches = [...text.matchAll(COMPAT_REGEX)];
  if (matches.length === 0) {
    return { filePath, error: 'compatibility_date not found' };
  }

  const mismatches = matches
    .filter((match) => match[1] !== EXPECTED_DATE)
    .map((match) => ({ actual: match[1], snippet: match[0] }));

  if (mismatches.length > 0) {
    return { filePath, mismatches };
  }

  return { filePath, valid: true };
}

const allFiles = [...findAppWranglerFiles(), ...CHECK_FILES];
const results = allFiles.map(validateFile);
const failures = results.filter((result) => result.error || result.mismatches);

if (failures.length > 0) {
  console.error(`\n✗ compatibility_date validation failed for ${failures.length} file(s).`);
  for (const fail of failures) {
    console.error(`\n- ${fail.filePath}`);
    if (fail.error) {
      console.error(`  error: ${fail.error}`);
    }
    if (fail.mismatches) {
      for (const mismatch of fail.mismatches) {
        console.error(`  found: ${mismatch.actual}  (${mismatch.snippet})`);
      }
    }
  }
  process.exit(1);
}

console.log(`✓ compatibility_date check passed for ${allFiles.length} file(s).`);
process.exit(0);
