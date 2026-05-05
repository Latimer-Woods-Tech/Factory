#!/usr/bin/env node

/**
 * Docs quality validator — checks for broken internal links in markdown files.
 *
 * This script intentionally runs under Node.js in CI and is not shipped to,
 * imported by, or executed inside Cloudflare Workers runtime code.
 *
 * Usage:
 *   node scripts/validate-docs-quality.mjs [options] [dirs...]
 *
 * Options:
 *   --max-errors N      Stop after N broken links (default: 50; 0 = unlimited).
 *   --json              Emit a JSON report to stdout instead of human-readable output.
 *   --progress-every N  Log progress every N files (default: 50; 0 = disable).
 *   --max-depth N       Maximum directory traversal depth (default: 10).
 *
 * Positional arguments:
 *   dirs  One or more directories to scan (default: docs/ at the repo root).
 *
 * Exit codes:
 *   0   All internal links resolve.
 *   1   One or more broken internal links detected.
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// ---------------------------------------------------------------------------
// Argument parsing
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
let maxErrors = 50;
let jsonMode = false;
let progressEvery = 50;
let maxDepth = 10;
const scanDirs = [];

for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if (arg === '--json') {
    jsonMode = true;
  } else if (arg === '--max-errors') {
    const raw = args[++i];
    maxErrors = Number(raw);
    if (!Number.isFinite(maxErrors) || maxErrors < 0 || !Number.isInteger(maxErrors)) {
      console.error('[docs-quality] --max-errors must be a non-negative integer');
      process.exit(1);
    }
  } else if (arg === '--progress-every') {
    const raw = args[++i];
    progressEvery = Number(raw);
    if (!Number.isFinite(progressEvery) || progressEvery < 0 || !Number.isInteger(progressEvery)) {
      console.error('[docs-quality] --progress-every must be a non-negative integer');
      process.exit(1);
    }
  } else if (arg === '--max-depth') {
    const raw = args[++i];
    maxDepth = Number(raw);
    if (!Number.isFinite(maxDepth) || maxDepth < 0 || !Number.isInteger(maxDepth)) {
      console.error('[docs-quality] --max-depth must be a non-negative integer');
      process.exit(1);
    }
  } else if (!arg.startsWith('--')) {
    scanDirs.push(path.resolve(arg));
  } else {
    console.error(`[docs-quality] Unknown option: ${arg}`);
    process.exit(1);
  }
}

// Default: scan docs/ at the repo root.
if (scanDirs.length === 0) {
  scanDirs.push(path.join(REPO_ROOT, 'docs'));
}

// ---------------------------------------------------------------------------
// Markdown internal-link extractor
// ---------------------------------------------------------------------------

/** Matches [text](target) pairs in Markdown source. */
const LINK_RE = /\[[^\]]*\]\(([^)]+)\)/g;

/**
 * Return all internal file-path targets from Markdown source.
 * Skips external links (http/https) and pure anchor links (#section).
 *
 * @param {string} content
 * @returns {string[]}
 */
function extractInternalLinks(content) {
  const links = [];
  LINK_RE.lastIndex = 0;
  let match;
  while ((match = LINK_RE.exec(content)) !== null) {
    const raw = match[1].trim();
    // Skip external links and any URI scheme (mailto:, tel:, data:, etc.).
    if (/^[a-zA-Z][a-zA-Z0-9+\-.]*:/.test(raw)) continue;
    // Skip pure anchor links with no file part.
    if (raw.startsWith('#')) continue;
    // Strip inline anchor from the file path.
    const hashIdx = raw.indexOf('#');
    const filePart = hashIdx >= 0 ? raw.slice(0, hashIdx) : raw;
    if (!filePart) continue;
    links.push(filePart);
  }
  return links;
}

// ---------------------------------------------------------------------------
// Directory walker with symlink / inode loop detection
// ---------------------------------------------------------------------------

/**
 * Recursively collect all Markdown files under dir.
 * Skips symlinks to avoid loops. Uses inode tracking to detect hard-link loops.
 *
 * @param {string} dir
 * @param {Set<string>} visitedInodes  inode keys already processed ("dev:ino")
 * @param {number} depth
 * @param {string[]} files  accumulator
 */
function walk(dir, visitedInodes, depth, files) {
  if (depth > maxDepth) return;

  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    // Skip well-known expensive / irrelevant subtrees.
    if (entry.name === 'node_modules' || entry.name === '.git') continue;

    const fullPath = path.join(dir, entry.name);

    // Symlinks are skipped entirely — no dereferencing — to prevent loops.
    if (entry.isSymbolicLink()) continue;

    if (entry.isDirectory()) {
      let stat;
      try {
        stat = statSync(fullPath);
      } catch {
        continue;
      }
      const inode = `${stat.dev}:${stat.ino}`;
      if (visitedInodes.has(inode)) continue;
      visitedInodes.add(inode);
      walk(fullPath, visitedInodes, depth + 1, files);
      continue;
    }

    if (entry.isFile() && /\.mdx?$/i.test(entry.name)) {
      files.push(fullPath);
    }
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const visitedInodes = new Set();
const files = [];

for (const dir of scanDirs) {
  if (!existsSync(dir)) {
    if (!jsonMode) {
      process.stderr.write(`[docs-quality] Warning: scan directory not found: ${dir}\n`);
    }
    continue;
  }
  let stat;
  try {
    stat = statSync(dir);
  } catch {
    continue;
  }
  const inode = `${stat.dev}:${stat.ino}`;
  if (visitedInodes.has(inode)) continue;
  visitedInodes.add(inode);
  walk(dir, visitedInodes, 0, files);
}

/** @type {Array<{file: string, target: string}>} */
const errors = [];
let filesScanned = 0;

for (const file of files) {
  if (maxErrors > 0 && errors.length >= maxErrors) break;

  let content;
  try {
    content = readFileSync(file, 'utf8');
  } catch {
    continue;
  }

  filesScanned++;

  if (progressEvery > 0 && filesScanned % progressEvery === 0 && !jsonMode) {
    process.stderr.write(`[docs-quality] Scanned ${filesScanned} / ${files.length} files...\n`);
  }

  const links = extractInternalLinks(content);
  for (const link of links) {
    if (maxErrors > 0 && errors.length >= maxErrors) break;
    // Root-relative links (starting with '/') are resolved from the repo root,
    // matching the convention used by most Markdown tooling and static-site generators.
    const resolved = link.startsWith('/')
      ? path.resolve(REPO_ROOT, link.slice(1))
      : path.resolve(path.dirname(file), link);
    if (!existsSync(resolved)) {
      errors.push({ file: path.relative(REPO_ROOT, file), target: link });
    }
  }
}

const truncated = maxErrors > 0 && errors.length >= maxErrors;

if (jsonMode) {
  process.stdout.write(
    JSON.stringify(
      {
        filesScanned,
        totalFiles: files.length,
        brokenLinks: errors.length,
        truncated,
        maxErrors,
        errors,
      },
      null,
      2,
    ) + '\n',
  );
} else {
  if (errors.length > 0) {
    process.stderr.write(
      `[docs-quality] ${errors.length} broken internal link(s) found` +
        ` (scanned ${filesScanned} / ${files.length} file(s)):\n`,
    );
    for (const { file, target } of errors) {
      process.stderr.write(`  ${file} -> ${target}\n`);
    }
    if (truncated) {
      process.stderr.write(
        `  (capped at --max-errors ${maxErrors}; re-run with --max-errors 0 for the full list)\n`,
      );
    }
  } else {
    process.stdout.write(
      `[docs-quality] All internal links valid. Scanned ${filesScanned} file(s).\n`,
    );
  }
}

if (errors.length > 0) process.exit(1);
