#!/usr/bin/env node
/**
 * Enforces ≥90% JSDoc coverage on exported symbols across all Factory packages.
 *
 * Why: CLAUDE.md quality gate requires ≥90% of exported symbols be documented.
 * This script catches undocumented exports before they land on main.
 *
 * Exit 0 = passed. Exit 1 = below threshold.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const REPO_ROOT = join(__dirname, '..');
const PACKAGES_DIR = join(REPO_ROOT, 'packages');

const THRESHOLD = 0.90;

/** Recursively collect non-test .ts files, skipping node_modules/dist/__tests__ */
function collectTsFiles(dir) {
  const results = [];
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return results;
  }
  for (const entry of entries) {
    if (entry === 'node_modules' || entry === 'dist' || entry === '__tests__') continue;
    const fullPath = join(dir, entry);
    let stat;
    try {
      stat = statSync(fullPath);
    } catch {
      continue;
    }
    if (stat.isDirectory()) {
      results.push(...collectTsFiles(fullPath));
    } else if (
      entry.endsWith('.ts') &&
      !entry.endsWith('.test.ts') &&
      !entry.endsWith('.spec.ts') &&
      !entry.endsWith('.d.ts')
    ) {
      results.push(fullPath);
    }
  }
  return results;
}

/**
 * Matches exported declarations that benefit from JSDoc.
 * Captures: function, async function, class, abstract class,
 * const, let, interface, type alias, enum.
 */
const DECLARATION_EXPORT =
  /^export\s+(?:declare\s+)?(?:default\s+)?(?:async\s+)?(?:function\*?|abstract\s+class|class|const|let|interface|type|enum)\s+\w/;

/** Re-exports and grouped exports — no JSDoc required */
const REEXPORT = /^export\s+(?:\*|\{)/;

/**
 * Analyzes lines of a TypeScript file, returning exported symbols with
 * whether each has a preceding JSDoc block (/** ... *\/).
 */
function analyzeFile(lines) {
  const results = [];

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trimStart();

    if (!trimmed.startsWith('export ')) continue;
    if (REEXPORT.test(trimmed)) continue;
    if (!DECLARATION_EXPORT.test(trimmed)) continue;

    // Look backward for JSDoc — skip blank lines and decorator lines (@...)
    let j = i - 1;
    while (j >= 0 && (lines[j].trim() === '' || lines[j].trimStart().startsWith('@'))) {
      j--;
    }

    let hasJsDoc = false;
    if (j >= 0) {
      const prevLine = lines[j].trim();
      if (prevLine === '*/') {
        // Multi-line JSDoc — trace back to opening /**
        let k = j - 1;
        while (k >= 0 && !lines[k].trimStart().startsWith('/**')) {
          k--;
        }
        if (k >= 0 && lines[k].trimStart().startsWith('/**')) {
          hasJsDoc = true;
        }
      } else if (prevLine.startsWith('/**') && prevLine.endsWith('*/')) {
        // Single-line JSDoc: /** ... */
        hasJsDoc = true;
      }
    }

    // Extract symbol name for reporting
    const nameMatch = trimmed.match(
      /export\s+(?:declare\s+)?(?:default\s+)?(?:async\s+)?(?:function\*?|abstract\s+class|class|const|let|interface|type|enum)\s+(\w+)/,
    );
    const name = nameMatch ? nameMatch[1] : '<unknown>';

    results.push({ lineNum: i + 1, name, hasJsDoc });
  }

  return results;
}

// Enumerate packages
const packageNames = readdirSync(PACKAGES_DIR)
  .filter((p) => {
    try {
      return statSync(join(PACKAGES_DIR, p)).isDirectory();
    } catch {
      return false;
    }
  })
  .sort();

let totalSymbols = 0;
let totalDocumented = 0;
const allViolations = [];
const packageResults = [];

for (const pkg of packageNames) {
  const srcDir = join(PACKAGES_DIR, pkg, 'src');
  const files = collectTsFiles(srcDir);
  if (files.length === 0) continue;

  let pkgSymbols = 0;
  let pkgDocumented = 0;
  const pkgViolations = [];

  for (const file of files) {
    let content;
    try {
      content = readFileSync(file, 'utf8');
    } catch {
      continue;
    }
    const lines = content.split(/\r?\n/);
    const symbols = analyzeFile(lines);

    for (const sym of symbols) {
      pkgSymbols++;
      if (sym.hasJsDoc) {
        pkgDocumented++;
      } else {
        pkgViolations.push({
          file: relative(REPO_ROOT, file).replace(/\\/g, '/'),
          line: sym.lineNum,
          name: sym.name,
        });
      }
    }
  }

  if (pkgSymbols === 0) continue;

  totalSymbols += pkgSymbols;
  totalDocumented += pkgDocumented;

  const coverage = pkgDocumented / pkgSymbols;
  packageResults.push({ pkg, coverage, pkgSymbols, pkgDocumented });

  if (coverage < THRESHOLD) {
    allViolations.push(...pkgViolations);
  }
}

// ── Report ────────────────────────────────────────────────────────────────────

console.log('\nJSDoc coverage by package:');
for (const { pkg, coverage, pkgSymbols, pkgDocumented } of packageResults) {
  const pct = (coverage * 100).toFixed(1);
  const status = coverage >= THRESHOLD ? '✓' : '✗';
  console.log(`  ${status} ${pkg.padEnd(22)} ${String(pkgDocumented).padStart(3)}/${pkgSymbols} (${pct}%)`);
}

const overallCoverage = totalSymbols > 0 ? totalDocumented / totalSymbols : 1;
const overallPct = (overallCoverage * 100).toFixed(1);
console.log(`\nOverall: ${totalDocumented}/${totalSymbols} (${overallPct}%) — threshold: ${THRESHOLD * 100}%\n`);

if (allViolations.length > 0) {
  console.error(`FAIL: ${allViolations.length} exported symbol(s) below threshold (${THRESHOLD * 100}%)\n`);
  const MAX_SHOWN = 50;
  for (const v of allViolations.slice(0, MAX_SHOWN)) {
    console.error(`  ${v.file}:${v.line}  ${v.name}`);
  }
  if (allViolations.length > MAX_SHOWN) {
    console.error(`  ... and ${allViolations.length - MAX_SHOWN} more`);
  }
  process.exit(1);
}

console.log('JSDoc coverage check passed.');
