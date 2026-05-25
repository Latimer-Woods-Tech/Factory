#!/usr/bin/env node
// Rewrite `node-version: '24'` (the canonical version) to
// `node-version-file: .nvmrc` so future bumps are a one-file change.
//
// Skips workflows pinned to Node 20 or 22 — those are intentionally different
// (older actions/setup-node@v4 era, or specific dep constraints). Bump those
// case-by-case in follow-ups.

import fs from 'node:fs';

const TARGET_VERSION = "'24'";

function rewriteFile(file) {
  const src = fs.readFileSync(file, 'utf8');
  // Match `node-version: '24'` (with optional double-quote variant) and
  // replace ONLY that line; leave other node-version values untouched.
  const re = /^(\s*)node-version:\s*['"]?24['"]?\s*$/gm;
  let changes = 0;
  const out = src.replace(re, (_m, indent) => {
    changes++;
    return `${indent}node-version-file: .nvmrc`;
  });
  if (changes > 0) {
    fs.writeFileSync(file, out);
  }
  return changes;
}

const files = process.argv.slice(2);
if (files.length === 0) {
  console.error('usage: use-nvmrc-in-workflows.mjs <workflow.yml> [...]');
  process.exit(1);
}

let total = 0;
for (const f of files) {
  if (!fs.existsSync(f)) continue;
  const n = rewriteFile(f);
  if (n > 0) console.log(`${f}: rewrote ${n} node-version line(s)`);
  total += n;
}
console.log(`\nTotal: ${total} rewrite(s) across ${files.length} file(s).`);
