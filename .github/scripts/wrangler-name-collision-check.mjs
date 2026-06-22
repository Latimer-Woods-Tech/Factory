#!/usr/bin/env node
// wrangler-name-collision-check.mjs
// Prevents silent Worker overwrites caused by shared `name` values across
// apps/*/wrangler.jsonc files. Two rules:
//   R1  All worker names (top-level + env.*.name) are unique across files.
//   R2  Every env.production.name appears in docs/service-registry.yml.
// Stdlib only. No external deps.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** State-machine JSONC stripper — respects string literals, handles `//` in URLs. */
function stripComments(src) {
  let out = '', i = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === '"') {                          // string — copy verbatim
      out += c; i++;
      while (i < src.length) {
        const s = src[i]; out += s; i++;
        if (s === '\\') { if (i < src.length) { out += src[i]; i++; } }
        else if (s === '"') break;
      }
    } else if (c === '/' && src[i+1] === '*') { // block comment
      i += 2;
      while (i < src.length) {
        if (src[i] === '*' && src[i+1] === '/') { i += 2; break; }
        out += src[i] === '\n' ? '\n' : ' '; i++;
      }
    } else if (c === '/' && src[i+1] === '/') { // line comment
      while (i < src.length && src[i] !== '\n') i++;
    } else {
      out += c; i++;
    }
  }
  return out;
}

function extractNames(cfg, rel) {
  const r = [];
  if (typeof cfg.name === 'string') r.push({ name: cfg.name, src: `${rel} (top-level)` });
  for (const [k, v] of Object.entries(cfg.env ?? {}))
    if (v && typeof v.name === 'string') r.push({ name: v.name, src: `${rel} (env.${k}.name)` });
  return r;
}

function findWranglerFiles() {
  return readdirSync(join(ROOT, 'apps'))
    .map(e => join(ROOT, 'apps', e, 'wrangler.jsonc'))
    .filter(f => { try { statSync(f); return true; } catch { return false; } })
    .sort();
}

// ── main ────────────────────────────────────────────────────────────────────
const files = findWranglerFiles();
const registry = readFileSync(join(ROOT, 'docs', 'service-registry.yml'), 'utf8');
const entries = [], parseErrors = [];

for (const f of files) {
  const rel = f.replace(ROOT, '').replace(/^[\\/]/, '').replace(/\\/g, '/');
  try {
    entries.push(...extractNames(JSON.parse(stripComments(readFileSync(f, 'utf8'))), rel));
  } catch (e) {
    parseErrors.push(`  ${rel}: ${e.message}`);
  }
}

// R1: same name in >1 distinct source files
const byFile = new Map();   // name -> Set<file-prefix>
const bySrc  = new Map();   // name -> [src, ...]
for (const { name, src } of entries) {
  const fp = src.split(' ')[0];
  (byFile.get(name) ?? (byFile.set(name, new Set()), byFile.get(name))).add(fp);
  (bySrc.get(name)  ?? (bySrc.set(name, []),         bySrc.get(name))).push(src);
}
const collisions = [...byFile.entries()].filter(([, s]) => s.size > 1)
  .map(([name]) => ({ name, sources: bySrc.get(name) }));

// R2: env.production.name not in registry
const unregistered = entries
  .filter(({ src }) => src.includes('env.production.name'))
  .filter(({ name }) => !registry.includes(name));

// ── report ───────────────────────────────────────────────────────────────────
console.log('\n=== wrangler-name-collision-check ===');
console.log(`Scanned ${files.length} wrangler.jsonc files, ${entries.length} name declarations\n`);
for (const { name, src } of entries) console.log(`  ${name.padEnd(42)} <- ${src}`);
console.log('');

let failed = false;

if (parseErrors.length) {
  console.error('PARSE ERRORS:');
  parseErrors.forEach(e => console.error(e));
  console.error('');
  failed = true;
}
if (collisions.length) {
  console.error('FAIL R1 — Duplicate worker names (silent overwrite risk on deploy):');
  for (const { name, sources } of collisions) {
    console.error(`  Collision: "${name}"`);
    sources.forEach(s => console.error(`    - ${s}`));
  }
  console.error('');
  failed = true;
}
if (unregistered.length) {
  console.error('FAIL R2 — env.production.name values missing from docs/service-registry.yml:');
  for (const { name, src } of unregistered)
    console.error(`  "${name}"  from ${src}`);
  console.error('  Fix: add the worker entry to docs/service-registry.yml before deploying.\n');
  failed = true;
}

if (!failed) console.log('PASS — No name collisions. All env.production.name values are registered.\n');
process.exit(failed ? 1 : 0);
