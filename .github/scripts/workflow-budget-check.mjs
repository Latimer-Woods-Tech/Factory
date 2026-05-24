#!/usr/bin/env node
// =============================================================================
// workflow-budget-check.mjs — Phase 4 Part A of the workflow lifecycle.
//
// PR-time gate. When a PR adds a new file under .github/workflows/, the PR
// body MUST contain one of:
//   - `retires: <existing-workflow.yml>` (and that file must be deleted in
//     the same PR) — LIFO retirement, the default discipline
//   - `budget-exception: <reason>` — explicit acknowledgment that a new
//     workflow is being added without retiring an existing one
//
// Modifications to existing workflows are exempt. So is the removal of
// workflows.
//
// =============================================================================
//   BLAST RADIUS (enforced in code + workflow permissions + tests)
// =============================================================================
//   CAN:
//     - Read PR diff via gh CLI
//     - Read PR body
//     - Post / edit one PR comment with a structured explanation
//     - Exit non-zero to fail the PR check
//
//   CANNOT (asserted by tests):
//     - Modify any file
//     - Push code
//     - Approve, merge, close any PR
//     - Modify workflows or branch protection
//     - Delete anything
//
// =============================================================================
//   DEFENSES INHERITED
// =============================================================================
//   #1 Kill switch       — paused → check returns success (fails-open per
//                          design; advisory under freeze)
//   #2 External alerting — none (this is a PR-time gate; failures are
//                          visible directly on the PR check)
//   #3 Bounded blast     — workflow permissions: contents:read + pull-
//                          requests:write only; source-scan tests
//   #4 Monthly audit     — WORKFLOW_BUDGET_AUDIT: log line per run
//
// REF: docs/decisions/2026-05-23-workflow-lifecycle.md (Phase 4 / Pillar 4)
// =============================================================================

import { existsSync } from 'node:fs';
import { execSync } from 'node:child_process';

// ---------------------------------------------------------------------------
// Kill switch — inlined.
// ---------------------------------------------------------------------------
export function isAutomationPaused(p = '.github/automation-paused') {
  return existsSync(p);
}

// ---------------------------------------------------------------------------
// Pure functions — testable.
// ---------------------------------------------------------------------------

/**
 * Classify a list of file paths into:
 *   addedWorkflows  — new files under .github/workflows/*.yml (excludes REGISTRY.md)
 *   removedWorkflows — deleted files in the same dir
 *   modifiedWorkflows — touched but neither added nor deleted
 *
 * Reusable workflows (_*.yml) ARE counted — adding a new reusable still
 * needs justification per the same budget discipline.
 */
export function classifyDiffFiles(diffFiles) {
  const out = { addedWorkflows: [], removedWorkflows: [], modifiedWorkflows: [] };
  for (const { path, status } of diffFiles) {
    if (!path) continue;
    if (!/^\.github\/workflows\/.+\.ya?ml$/.test(path)) continue;
    if (path.endsWith('/REGISTRY.md')) continue;  // REGISTRY.md is markdown, not a workflow
    if (status === 'added') out.addedWorkflows.push(path);
    else if (status === 'removed') out.removedWorkflows.push(path);
    else out.modifiedWorkflows.push(path);
  }
  return out;
}

/**
 * Parse a PR body for budget ack tokens. Returns:
 *   { retires: [filenames-mentioned], exceptions: [reasons] }
 *
 * Token shapes (case-insensitive on the keyword; file/reason verbatim):
 *   retires: foo.yml
 *   retires: foo.yml, bar.yml
 *   budget-exception: <free-form reason text on same line>
 *
 * Multiple retires: lines are allowed and accumulate.
 */
export function parseBudgetAcks(body) {
  const out = { retires: [], exceptions: [] };
  if (!body) return out;
  const lines = body.split(/\r?\n/);
  for (const line of lines) {
    const retMatch = line.match(/^\s*retires:\s*(.+?)\s*$/i);
    if (retMatch) {
      const files = retMatch[1].split(',').map((s) => s.trim()).filter(Boolean);
      out.retires.push(...files);
      continue;
    }
    const excMatch = line.match(/^\s*budget-exception:\s*(.+?)\s*$/i);
    if (excMatch && excMatch[1].length >= 5) {
      out.exceptions.push(excMatch[1]);
    }
  }
  return out;
}

/**
 * Decide the verdict given classified diff + parsed acks.
 *
 * Returns: { ok, violations[] }
 *
 * Rules:
 *   - If no workflows added → ok (modifications/removals are exempt)
 *   - For each added workflow, require EITHER:
 *     * a `retires: X` token AND X is in removedWorkflows (file basename match), OR
 *     * a `budget-exception: ...` token (any one applies — exceptions are
 *       per-PR, not per-file, since the operator may add 2 workflows in
 *       one exception PR with valid reason)
 */
export function evaluateBudget({ added, removed, acks }) {
  const violations = [];
  if (added.length === 0) {
    return { ok: true, violations: [], reason: 'no-new-workflows' };
  }

  // If any budget-exception is present, all adds pass (operator took explicit
  // responsibility for the PR body's content).
  if (acks.exceptions.length > 0) {
    return { ok: true, violations: [], reason: `budget-exception:${acks.exceptions[0].slice(0, 80)}` };
  }

  const removedBasenames = new Set(removed.map((p) => p.split('/').pop()));
  const retiresBasenames = new Set(acks.retires.map((p) => p.split('/').pop()));

  for (const addPath of added) {
    // Need at least one retires that matches a removed file
    const hasMatchingRetire = acks.retires.some((retired) => {
      const base = retired.split('/').pop();
      return removedBasenames.has(base) && retiresBasenames.has(base);
    });
    if (!hasMatchingRetire) {
      violations.push(addPath);
    }
  }

  if (violations.length === 0) {
    return { ok: true, violations: [], reason: 'retires-balanced' };
  }
  return { ok: false, violations };
}

/**
 * Build the PR comment / log explanation. Stable structure → comment is
 * edited in place on synchronize.
 */
export function buildExplanation({ added, removed, acks, verdict }) {
  const lines = [];
  lines.push('<!-- workflow-budget-check -->');
  if (verdict.ok) {
    lines.push(`✓ **Workflow budget check: PASS** (${verdict.reason})`);
    lines.push('');
    if (added.length || removed.length) {
      lines.push(`- Added: ${added.length ? added.map((f) => `\`${f}\``).join(', ') : '_(none)_'}`);
      lines.push(`- Removed: ${removed.length ? removed.map((f) => `\`${f}\``).join(', ') : '_(none)_'}`);
      lines.push(`- \`retires:\` tokens: ${acks.retires.length ? acks.retires.map((f) => `\`${f}\``).join(', ') : '_(none)_'}`);
      lines.push(`- \`budget-exception:\` tokens: ${acks.exceptions.length ? acks.exceptions.length + ' present' : '_(none)_'}`);
    }
    return lines.join('\n');
  }

  lines.push('🚫 **Workflow budget check: FAIL**');
  lines.push('');
  lines.push('This PR adds new workflow file(s) without a matching `retires:` token in the PR body, and no `budget-exception:` was provided.');
  lines.push('');
  lines.push(`**Added workflows:** ${added.map((f) => `\`${f}\``).join(', ')}`);
  if (removed.length) {
    lines.push(`**Removed workflows:** ${removed.map((f) => `\`${f}\``).join(', ')}`);
  }
  lines.push('');
  lines.push('**To unblock this PR, edit the PR body to include ONE of:**');
  lines.push('');
  lines.push('1. Default — LIFO retirement (delete an existing workflow you\'re replacing):');
  lines.push('   ```');
  lines.push('   retires: <existing-workflow.yml>');
  lines.push('   ```');
  lines.push('2. Exception — adding a workflow that genuinely doesn\'t replace anything:');
  lines.push('   ```');
  lines.push('   budget-exception: <one-line reason; CODEOWNER-acknowledged>');
  lines.push('   ```');
  lines.push('');
  lines.push('Reference: [`docs/decisions/2026-05-23-workflow-lifecycle.md`](../blob/main/docs/decisions/2026-05-23-workflow-lifecycle.md) Pillar 4 (Workflow Budget Gate).');
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Audit log
// ---------------------------------------------------------------------------
function logAudit(entry) {
  console.log(`WORKFLOW_BUDGET_AUDIT: ${JSON.stringify({ ts: new Date().toISOString(), ...entry })}`);
}

// ---------------------------------------------------------------------------
// gh CLI wrappers — narrow.
// ---------------------------------------------------------------------------
function gh(args, opts = {}) {
  return execSync(`gh ${args}`, { encoding: 'utf-8', ...opts });
}

function fetchPrFilesWithStatus(prNumber) {
  // `gh pr view --json files` returns [{path, additions, deletions, ...}].
  // We need status (added/removed/modified). Use the REST API instead.
  const json = gh(`api repos/Latimer-Woods-Tech/Factory/pulls/${prNumber}/files --paginate -q '[.[] | {path:.filename, status}]'`).trim();
  return JSON.parse(json || '[]');
}

function fetchPrBody(prNumber) {
  return gh(`pr view ${prNumber} --json body -q '.body'`).trim();
}

function postOrUpdateComment(prNumber, body, marker) {
  let existing = null;
  try {
    const out = gh(`api repos/Latimer-Woods-Tech/Factory/issues/${prNumber}/comments --jq '[.[] | select(.body | startswith("${marker}")) | .id] | .[0] // ""'`).trim();
    existing = out ? Number(out) : null;
  } catch { /* swallow */ }
  if (existing) {
    // Pass body via stdin (--field body=@-) to avoid shell injection from markdown backticks.
    execSync(`gh api --method PATCH repos/Latimer-Woods-Tech/Factory/issues/comments/${existing} --field "body=@-"`, { input: body, encoding: 'utf-8' });
    return { id: existing, action: 'updated' };
  }
  // Pass body via --body-file - (stdin) to avoid shell injection from markdown backticks.
  execSync(`gh pr comment ${prNumber} --body-file -`, { input: body, encoding: 'utf-8' });
  return { id: null, action: 'created' };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  const rawPrNumber = process.env.PR_NUMBER;
  const DRY_RUN = process.env.BUDGET_DRY_RUN === 'true';

  if (!rawPrNumber || !/^\d+$/.test(rawPrNumber)) {
    console.error('FATAL: PR_NUMBER must be a positive integer.');
    process.exit(2);
  }
  const PR_NUMBER = rawPrNumber;

  if (isAutomationPaused()) {
    logAudit({ event: 'paused-skip-fail-open', pr: PR_NUMBER });
    console.log('⏸  Automation paused; budget check fails-open (returning pass).');
    return;
  }

  const files = fetchPrFilesWithStatus(PR_NUMBER);
  const { addedWorkflows: added, removedWorkflows: removed, modifiedWorkflows: modified } = classifyDiffFiles(files);
  logAudit({ event: 'classified', pr: PR_NUMBER, added: added.length, removed: removed.length, modified: modified.length });

  if (added.length === 0) {
    logAudit({ event: 'no-additions-pass', pr: PR_NUMBER });
    console.log('✓ No new workflows added; budget check passes trivially.');
    return;
  }

  const body = fetchPrBody(PR_NUMBER);
  const acks = parseBudgetAcks(body);
  const verdict = evaluateBudget({ added, removed, acks });
  logAudit({ event: 'verdict', pr: PR_NUMBER, ok: verdict.ok, reason: verdict.reason, violations: verdict.violations?.length || 0 });

  const explanation = buildExplanation({ added, removed, acks, verdict });

  if (DRY_RUN) {
    console.log('--- DRY RUN: comment body ---');
    console.log(explanation);
    if (!verdict.ok) process.exit(1);
    return;
  }

  try {
    const { action } = postOrUpdateComment(PR_NUMBER, explanation, '<!-- workflow-budget-check -->');
    logAudit({ event: `comment-${action}`, pr: PR_NUMBER });
  } catch (err) {
    logAudit({ event: 'comment-error', pr: PR_NUMBER, error: err.message });
    console.error('Comment post failed:', err.message);
  }

  if (!verdict.ok) {
    console.error(`✗ Workflow budget check FAILED. See PR comment for details.`);
    process.exit(1);
  }
  console.log(`✓ Workflow budget check passed (${verdict.reason}).`);
}

if (import.meta.url === `file://${process.argv[1]}` || import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/'))) {
  main().catch((err) => {
    console.error('FATAL:', err);
    process.exit(2);
  });
}
