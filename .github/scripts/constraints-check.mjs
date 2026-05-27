#!/usr/bin/env node
/**
 * constraints-check.mjs — Better Gate Layer 1 (deterministic).
 *
 * Checks PR-diff added lines for CLAUDE.md hard-constraint violations.
 * Outputs structured JSON to stdout and posts a summary review comment.
 *
 * Exempt from Cloudflare hard constraints — runs in GitHub Actions (Node.js).
 *
 * Required env: GH_TOKEN, REPO, PR_NUMBER, BASE_SHA, HEAD_SHA
 * Optional env: GITHUB_STEP_SUMMARY (set automatically in Actions)
 *
 * Exit 0 = no errors (warnings OK).  Exit 1 = one or more error violations.
 */

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const { GH_TOKEN, REPO, PR_NUMBER, HEAD_SHA, GITHUB_STEP_SUMMARY } = process.env;

if (!GH_TOKEN || !REPO || !PR_NUMBER || !HEAD_SHA) {
  console.error('Missing required env: GH_TOKEN, REPO, PR_NUMBER, HEAD_SHA');
  process.exit(2);
}

// ── Constraint definitions (tech guide §2.1.2) ──────────────────────────────

/**
 * @typedef {{ id: string, pattern: RegExp, severity: 'error'|'warn',
 *             message: string, allowlistPaths: string[],
 *             fileFilter?: (f: string) => boolean }} Constraint
 */

/** @type {Constraint[]} */
const CONSTRAINTS = [
  {
    id: 'no-process-env',
    pattern: /\bprocess\.env\b/,
    severity: 'error',
    message: 'Use Cloudflare Worker bindings (c.env.VAR or env.VAR), not process.env',
    allowlistPaths: ['.github/scripts/', '.github/workflows/'],
  },
  {
    id: 'no-node-builtin-import',
    pattern: /from\s+['"]node:/,
    severity: 'error',
    message: "Node.js built-ins (e.g. 'node:fs') are not available in Cloudflare Workers",
    allowlistPaths: ['.github/scripts/', '.github/workflows/'],
  },
  {
    id: 'no-commonjs-require',
    pattern: /\brequire\(['"]/,
    severity: 'error',
    message: 'Use ESM import/export — CommonJS require() is banned',
    allowlistPaths: ['.github/scripts/', '.github/workflows/'],
  },
  {
    id: 'no-buffer',
    pattern: /\bBuffer\.(from|alloc|isBuffer)\b|\bnew\s+Buffer\b/,
    severity: 'error',
    message: 'Use Uint8Array, TextEncoder, or TextDecoder instead of Buffer',
    allowlistPaths: [],
  },
  {
    id: 'no-workers-dev-in-ui',
    pattern: /\.workers\.dev/,
    severity: 'error',
    message:
      'workers.dev URLs must not appear in user-facing files. Use the branded custom domain from docs/service-registry.yml',
    allowlistPaths: ['docs/', '.github/'],
    fileFilter: (f) => /\.(html|tsx?|jsx?)$/.test(f),
  },
];

// ── GitHub API helpers ───────────────────────────────────────────────────────

/** @param {string} path @param {RequestInit} [opts] */
async function ghFetch(path, opts = {}) {
  const url = path.startsWith('https://') ? path : `https://api.github.com${path}`;
  const res = await fetch(url, {
    ...opts,
    headers: {
      Authorization: `Bearer ${GH_TOKEN}`,
      Accept: 'application/vnd.github.v3+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
      ...(opts.headers ?? {}),
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`GitHub API ${res.status} at ${url}: ${text.slice(0, 200)}`);
  }
  return res.json();
}

/** Fetches the list of files changed in this PR (max 100 files). */
async function fetchPRFiles() {
  const [owner, repo] = REPO.split('/');
  return ghFetch(
    `/repos/${owner}/${repo}/pulls/${PR_NUMBER}/files?per_page=100`,
  );
}

/** Posts a review comment on the PR. */
async function postReview(body) {
  const [owner, repo] = REPO.split('/');
  await ghFetch(`/repos/${owner}/${repo}/pulls/${PR_NUMBER}/reviews`, {
    method: 'POST',
    body: JSON.stringify({ commit_id: HEAD_SHA, body, event: 'COMMENT' }),
  });
}

// ── Core logic ───────────────────────────────────────────────────────────────

/**
 * Checks added lines of one file against all constraints.
 * @param {{ filename: string, patch: string | undefined }} prFile
 * @returns {{ id: string, severity: string, file: string, line: number, col: number, message: string }[]}
 */
function checkFile(prFile) {
  const { filename, patch } = prFile;
  if (!patch) return [];

  const results = [];
  let lineNumber = 0;

  for (const rawLine of patch.split('\n')) {
    // Track line numbers from diff hunk headers: @@ -a,b +c,d @@
    const hunkMatch = rawLine.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
    if (hunkMatch) {
      lineNumber = parseInt(hunkMatch[1], 10) - 1;
      continue;
    }

    if (rawLine.startsWith('+') && !rawLine.startsWith('+++')) {
      lineNumber++;
      const line = rawLine.slice(1); // strip leading '+'

      for (const constraint of CONSTRAINTS) {
        // File-type filter: skip if fileFilter defined and file doesn't match
        if (constraint.fileFilter && !constraint.fileFilter(filename)) continue;

        // Allowlist: skip if file is in an exempt path
        if (constraint.allowlistPaths.some((p) => filename.startsWith(p))) continue;

        const match = line.match(constraint.pattern);
        if (match) {
          results.push({
            id: constraint.id,
            severity: constraint.severity,
            file: filename,
            line: lineNumber,
            col: line.indexOf(match[0]) + 1,
            message: constraint.message,
          });
        }
      }
    } else if (!rawLine.startsWith('-')) {
      lineNumber++;
    }
  }

  return results;
}

// ── .cjs file check (file-level, not line-level) ─────────────────────────────

/**
 * @param {{ filename: string, status: string }[]} files
 * @returns {{ id: string, severity: string, file: string, line: number, col: number, message: string }[]}
 */
function checkCjsFiles(files) {
  return files
    .filter((f) => f.status !== 'removed' && /\.cjs$/.test(f.filename))
    .filter((f) => /\/(src|packages\/[^/]+\/src)\//.test(f.filename))
    .map((f) => ({
      id: 'no-cjs-in-src',
      severity: 'error',
      file: f.filename,
      line: 1,
      col: 1,
      message: 'CommonJS .cjs files are banned in src/ — use ESM (.mjs or .js with type:module)',
    }));
}

// ── Reporting ─────────────────────────────────────────────────────────────────

/** @param {{ id: string, severity: string, file: string, line: number, message: string }[]} violations */
function buildReviewBody(violations) {
  const errors = violations.filter((v) => v.severity === 'error');
  const warnings = violations.filter((v) => v.severity === 'warn');

  const icon = errors.length > 0 ? '🔴' : '🟡';
  const lines = [
    `## ${icon} CLAUDE.md Hard Constraints Gate`,
    '',
    errors.length > 0
      ? `Found **${errors.length} error(s)** that must be fixed before merge.`
      : `No constraint errors found.`,
    warnings.length > 0 ? `Found **${warnings.length} warning(s)** (non-blocking).` : '',
    '',
  ];

  if (errors.length > 0) {
    lines.push('### Errors (must fix)');
    for (const v of errors) {
      lines.push(`- **\`${v.file}:${v.line}\`** \`[${v.id}]\` — ${v.message}`);
    }
    lines.push('');
  }

  if (warnings.length > 0) {
    lines.push('### Warnings (advisory)');
    for (const v of warnings) {
      lines.push(`- **\`${v.file}:${v.line}\`** \`[${v.id}]\` — ${v.message}`);
    }
    lines.push('');
  }

  lines.push(
    '_Governed by [CLAUDE.md](../../CLAUDE.md) Hard Constraints. ' +
      'See [Better Gate Layer 1](../../docs/architecture/ADMIN_TECHNICAL_GUIDE.md#layer-1)._',
  );

  return lines.filter((l) => l !== undefined).join('\n');
}

// ── Entry point ───────────────────────────────────────────────────────────────

async function main() {
  console.log(`Checking PR #${PR_NUMBER} in ${REPO} (head: ${HEAD_SHA.slice(0, 8)})`);

  let files;
  try {
    files = await fetchPRFiles();
  } catch (err) {
    console.error('Failed to fetch PR files:', err.message);
    process.exit(2);
  }

  const violations = [
    ...files.flatMap(checkFile),
    ...checkCjsFiles(files),
  ];

  const errors = violations.filter((v) => v.severity === 'error');
  const warnings = violations.filter((v) => v.severity === 'warn');

  // Structured JSON output (captured by the workflow for gate evidence)
  const report = {
    pr: PR_NUMBER,
    repo: REPO,
    head_sha: HEAD_SHA,
    files_checked: files.length,
    errors: errors.length,
    warnings: warnings.length,
    violations,
  };
  console.log(JSON.stringify(report, null, 2));

  // Step summary (visible in Actions UI)
  if (GITHUB_STEP_SUMMARY) {
    const summaryLine =
      errors.length > 0
        ? `### 🔴 Constraint check: ${errors.length} error(s), ${warnings.length} warning(s)`
        : `### ✅ Constraint check: no violations (${warnings.length} warning(s))`;
    const fs = await import('node:fs');
    fs.appendFileSync(GITHUB_STEP_SUMMARY, summaryLine + '\n');
  }

  // Post PR review comment if there are any violations
  if (violations.length > 0) {
    try {
      await postReview(buildReviewBody(violations));
    } catch (err) {
      console.warn('Could not post review comment:', err.message);
      // Non-fatal — the exit code still signals pass/fail to CI
    }
  }

  if (errors.length > 0) {
    console.error(`\n✗ ${errors.length} constraint error(s) detected. Fix before merging.`);
    process.exit(1);
  }

  console.log(`\n✓ Constraint check passed (${warnings.length} warning(s)).`);
  process.exit(0);
}

main().catch((err) => {
  console.error('Unexpected error:', err);
  process.exit(2);
});
