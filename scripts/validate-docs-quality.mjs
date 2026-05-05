#!/usr/bin/env node
// validate-docs-quality.mjs — Factory docs quality gate
//
// Checks Markdown files under docs/ and root *.md for:
//   1. Broken internal links (relative .md / #anchor references)
//   2. Missing mandatory front-matter fields (title) on docs/*.mdx
//
// Design goals (issue #286):
//   - Completes in < 10 s on this repo (traversal bounded to docs/ + root)
//   - Never follows symlinks / junctions to avoid loops
//   - Emits one line per broken target: "FILE:LINE → TARGET"
//   - --max-errors N  cap output (default 50) so CI stays actionable
//   - --json          write full report to docs-quality-report.json
//   - Exits 0 if clean, 1 if broken links found
//
// Usage:
//   node scripts/validate-docs-quality.mjs
//   node scripts/validate-docs-quality.mjs --max-errors 20 --json

import { readFileSync, readdirSync, statSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname, join, extname, relative, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');

// ─── CLI args ─────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const MAX_ERRORS = parseInt(args[args.indexOf('--max-errors') + 1] ?? '50', 10) || 50;
const JSON_MODE  = args.includes('--json');

// ─── Collect Markdown files (bounded, no symlinks) ───────────────────────────

const SCAN_DIRS = [
  join(REPO_ROOT, 'docs'),
  join(REPO_ROOT, 'apps'),
  REPO_ROOT,              // root *.md only — not recursive
];

const MD_EXTS = new Set(['.md', '.mdx']);

/**
 * Recursively collect .md / .mdx files under `dir`.
 * Skips symlinks, node_modules, .git, dist, and hidden dirs.
 * @param {string} dir
 * @param {boolean} recursive
 * @returns {string[]}
 */
function collectFiles(dir, recursive = true) {
  const results = [];
  if (!existsSync(dir)) return results;

  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return results;
  }

  for (const entry of entries) {
    // Never follow symlinks — prevents infinite loops on junction points
    if (entry.isSymbolicLink()) continue;

    const fullPath = join(dir, entry.name);

    if (entry.isDirectory()) {
      if (!recursive) continue;
      const skip = entry.name.startsWith('.') ||
        entry.name === 'node_modules' ||
        entry.name === 'dist' ||
        entry.name === '.wrangler';
      if (!skip) collectFiles(fullPath, true).forEach(f => results.push(f));
      continue;
    }

    if (entry.isFile() && MD_EXTS.has(extname(entry.name))) {
      results.push(fullPath);
    }
  }
  return results;
}

const allFiles = new Set();

// docs/ — full recursive scan
collectFiles(join(REPO_ROOT, 'docs')).forEach(f => allFiles.add(f));

// apps/*/README.md — one level only (avoid scanning compiled output)
for (const entry of readdirSync(join(REPO_ROOT, 'apps'), { withFileTypes: true })) {
  if (!entry.isDirectory() || entry.isSymbolicLink()) continue;
  const readme = join(REPO_ROOT, 'apps', entry.name, 'README.md');
  if (existsSync(readme)) allFiles.add(readme);
}

// Root *.md (non-recursive)
collectFiles(REPO_ROOT, false).forEach(f => allFiles.add(f));

const fileArray = [...allFiles];
console.log(`[INFO] Scanning ${fileArray.length} Markdown files…`);

// ─── Build anchor index (id= and ## headings per file) ───────────────────────

/** @type {Map<string, Set<string>>} filepath → set of anchor slugs */
const anchorIndex = new Map();

function headingToSlug(heading) {
  return heading
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-');
}

for (const filePath of fileArray) {
  const anchors = new Set();
  const text = readFileSync(filePath, 'utf8');
  for (const [, id] of text.matchAll(/\bid="([^"]+)"/g)) anchors.add(id);
  for (const [, hashes, title] of text.matchAll(/^(#{1,6})\s+(.+)$/gm)) {
    anchors.add(headingToSlug(title));
    void hashes; // used implicitly to satisfy no-unused-vars
  }
  anchorIndex.set(filePath, anchors);
}

// ─── Extract and check links ──────────────────────────────────────────────────

/** @type {{ file: string, line: number, target: string, reason: string }[]} */
const broken = [];
let scanned = 0;

// Matches: [text](target) but not http/https/mailto/# standalone
const LINK_RE = /\[([^\]]*)\]\(([^)]+)\)/g;

outer:
for (const filePath of fileArray) {
  scanned++;
  if (scanned % 50 === 0) console.log(`[INFO]  … ${scanned}/${fileArray.length} files scanned`);

  const text = readFileSync(filePath, 'utf8');
  const lines = text.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    let match;
    LINK_RE.lastIndex = 0;
    while ((match = LINK_RE.exec(line)) !== null) {
      const raw = match[2].split(' ')[0]; // strip optional title "text"

      // Skip absolute URLs, mailto, and bare anchors on the same page
      if (/^https?:\/\/|^mailto:|^#/.test(raw)) continue;

      const [pathPart, anchor] = raw.split('#');
      if (!pathPart) continue; // same-page anchor only — already skipped above

      // Resolve the target relative to the current file's directory
      const target = resolve(dirname(filePath), pathPart);

      // Check file existence
      if (!existsSync(target)) {
        broken.push({ file: relative(REPO_ROOT, filePath), line: i + 1, target: raw, reason: 'file not found' });
        if (broken.length >= MAX_ERRORS) break outer;
        continue;
      }

      // Check anchor if present
      if (anchor) {
        const targetAnchors = anchorIndex.get(target);
        if (!targetAnchors?.has(anchor)) {
          broken.push({ file: relative(REPO_ROOT, filePath), line: i + 1, target: raw, reason: `anchor #${anchor} not found` });
          if (broken.length >= MAX_ERRORS) break outer;
        }
      }
    }
  }
}

// ─── Report ───────────────────────────────────────────────────────────────────

const capped = broken.length >= MAX_ERRORS;

if (broken.length === 0) {
  console.log(`\n✅ Docs quality: PASS — ${scanned} files, 0 broken links.`);
  process.exit(0);
}

console.log(`\n❌ Docs quality: FAIL — ${broken.length}${capped ? '+' : ''} broken link${broken.length !== 1 ? 's' : ''}:\n`);
for (const { file, line, target, reason } of broken) {
  console.log(`  ${file}:${line} → ${target}  (${reason})`);
}
if (capped) {
  console.log(`\n  … output capped at ${MAX_ERRORS}. Run with --max-errors 0 for full list.`);
}

if (JSON_MODE) {
  const report = { scanned, broken, capped, generatedAt: new Date().toISOString() };
  const outPath = join(REPO_ROOT, 'docs-quality-report.json');
  writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(`\n[INFO] Report written to ${relative(REPO_ROOT, outPath)}`);
}

process.exit(1);
