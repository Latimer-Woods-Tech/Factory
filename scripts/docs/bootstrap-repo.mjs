#!/usr/bin/env node

import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const TOOLS_ROOT = resolve(SCRIPT_DIR, '..', '..');

function argValue(name, fallback) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

const targetRoot = resolve(argValue('--target', process.env.DOCS_TARGET_ROOT ?? process.cwd()));
const profile = argValue('--profile', 'app');
const force = process.argv.includes('--force');

const templates = [
  {
    from: 'docs/_governance/templates/repo-docs-health.yml',
    to: '.github/workflows/docs-health.yml',
  },
  {
    from: 'docs/_governance/templates/repo-canonical-docs.yml',
    to: 'docs/_governance/canonical-docs.yml',
  },
  {
    from: 'docs/_governance/templates/repo-doc-overrides.yml',
    to: 'docs/_governance/doc-overrides.yml',
  },
  {
    from: 'docs/_governance/templates/repo-agent-truth-map.json',
    to: 'docs/_catalog/agent-truth-map.json',
  },
];

for (const template of templates) {
  const from = join(TOOLS_ROOT, template.from);
  const to = join(targetRoot, template.to);
  if (existsSync(to) && !force) {
    console.log(`[docs:bootstrap] exists, skipping ${template.to}`);
    continue;
  }
  mkdirSync(dirname(to), { recursive: true });
  copyFileSync(from, to);
  console.log(`[docs:bootstrap] wrote ${template.to}`);
}

console.log(`[docs:bootstrap] ${profile} docs control-plane seed complete at ${targetRoot}`);
