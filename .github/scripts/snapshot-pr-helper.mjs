#!/usr/bin/env node
// =============================================================================
// snapshot-pr-helper.mjs — validates and auto-merges snapshot PRs.
//
// Phase 2 of the workflow lifecycle decision
// (docs/decisions/2026-05-23-workflow-lifecycle.md, Pillar 3).
//
// Invoked by .github/workflows/snapshot-pr-auto-merge.yml on
// pull_request events. Reads the allowlist from .github/snapshot-paths.yml
// and gates:
//   1. PR author is in the authors allowlist
//   2. PR branch starts with one of the branch_prefixes
//   3. EVERY file in the PR matches at least one path glob
//
// If all three pass → approve the PR + enable auto-merge.
// If ANY fails → post an explanatory comment on the PR and exit 1.
//
// The script intentionally has zero external dependencies. The runner
// has node and gh CLI; that's all we use.
// =============================================================================

import { readFileSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';

// ---------------------------------------------------------------------------
// Kill switch — global emergency-stop for Factory automation. Defense layer
// #1 from the workflow lifecycle decision's "governance of governance"
// recommendations. Any automation that mutates external state (approve,
// merge, comment, disable a workflow) MUST consult this before acting.
//
// To pause: commit an empty file at .github/automation-paused (via PR, since
//   .github/** is CODEOWNER-gated). Any automation that consults this on its
//   next event will skip-cleanly with an explanatory comment.
// To resume: delete the file in another PR.
//
// Strictly file-existence — no content parsing. Reduces the failure modes of
// the kill switch itself to "present" (paused) or "absent" (run). No need
// to read, parse, or interpret the file. Less surface area = harder to break.
// ---------------------------------------------------------------------------
export function isAutomationPaused(pausePath = '.github/automation-paused') {
  return existsSync(pausePath);
}

// ---------------------------------------------------------------------------
// Minimal YAML reader — only handles the subset we use: top-level lists of
// strings under `paths:`, `branch_prefixes:`, `authors:`. No anchors, no
// flow style, no nested maps. Anything else throws.
// ---------------------------------------------------------------------------
export function parseAllowlist(yamlText) {
  const lines = yamlText.split('\n');
  const result = { paths: [], branch_prefixes: [], authors: [] };
  let currentKey = null;
  for (const rawLine of lines) {
    const line = rawLine.replace(/#.*$/, '').trimEnd();
    if (!line.trim()) continue;
    const topMatch = line.match(/^([a-z_]+):\s*$/);
    if (topMatch) {
      currentKey = topMatch[1];
      continue;
    }
    const itemMatch = line.match(/^\s+-\s+(.+)$/);
    if (itemMatch && currentKey && currentKey in result) {
      const value = itemMatch[1].trim().replace(/^['"]/, '').replace(/['"]$/, '');
      result[currentKey].push(value);
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Glob to RegExp: gitignore-style. `**` matches any number of segments
// (including zero); `*` matches a single segment (no slashes).
// ---------------------------------------------------------------------------
export function globToRegex(glob) {
  // Escape regex metacharacters except * and /
  let pattern = '';
  let i = 0;
  while (i < glob.length) {
    const c = glob[i];
    if (c === '*') {
      if (glob[i + 1] === '*') {
        // ** — matches anything including slashes
        pattern += '.*';
        i += 2;
        // Consume a trailing slash if present (so `docs/cost/**` matches
        // `docs/cost/anything` AND `docs/cost`)
        if (glob[i] === '/') i++;
      } else {
        // * — single segment, no slashes
        pattern += '[^/]*';
        i++;
      }
    } else if ('.+()[]{}^$|\\?'.includes(c)) {
      pattern += '\\' + c;
      i++;
    } else {
      pattern += c;
      i++;
    }
  }
  return new RegExp('^' + pattern + '$');
}

export function pathMatches(filePath, globs) {
  return globs.some((g) => globToRegex(g).test(filePath));
}

// ---------------------------------------------------------------------------
// Evaluate the three gates against given inputs. Returns { ok, violations }.
// Pure function — no I/O, no gh calls. Lets the test suite drive end-to-end
// validation logic deterministically.
// ---------------------------------------------------------------------------
export function evaluatePr({ author, branch, files, allowlist }) {
  const violations = [];
  if (!allowlist.authors.includes(author)) {
    violations.push(`author:${author}`);
  }
  if (!allowlist.branch_prefixes.some((p) => branch.startsWith(p))) {
    violations.push(`branch:${branch}`);
  }
  const outOfAllowlist = files.filter((f) => !pathMatches(f, allowlist.paths));
  if (outOfAllowlist.length > 0) {
    violations.push(`paths:${outOfAllowlist.join(',')}`);
  }
  return { ok: violations.length === 0, violations };
}

// ---------------------------------------------------------------------------
// Wrappers around gh CLI. Errors propagate; the workflow surface them as
// step failures.
// ---------------------------------------------------------------------------
function gh(args, opts = {}) {
  return execSync(`gh ${args}`, { encoding: 'utf-8', ...opts }).trim();
}

function fetchPrFiles(prNumber) {
  const json = gh(`pr view ${prNumber} --json files -q '.files[].path'`);
  return json.split('\n').filter(Boolean);
}

function approveAndAutoMerge(prNumber, reason) {
  // Two tokens, two different operations:
  //
  //   REVIEW_TOKEN = github.token (github-actions[bot])
  //     Used for `gh pr review --approve`. github-actions[bot] is listed as a
  //     CODEOWNER for the snapshot paths (.github/CODEOWNERS Green tier) so its
  //     approval satisfies require_code_owner_review. It is NOT the PR author
  //     (factory-cross-repo[bot] opens PRs), so self-approval is never an issue.
  //
  //   GH_TOKEN = factory-cross-repo App token
  //     Used for `gh pr merge --auto`. factory-cross-repo[bot] is a bypass actor
  //     on ruleset 15843812, so the auto-merge flag persists across
  //     dismiss_stale_reviews_on_push synchronize events.
  //
  // Both are idempotent: re-running on an already-approved PR is safe.
  const reviewToken = process.env.REVIEW_TOKEN;
  try {
    const approveEnv = reviewToken ? { ...process.env, GH_TOKEN: reviewToken } : process.env;
    execSync(
      `gh pr review ${prNumber} --approve --body ${JSON.stringify(`✅ Snapshot PR auto-approved per [workflow lifecycle Phase 2](../blob/main/docs/decisions/2026-05-23-workflow-lifecycle.md).\n\n${reason}`)}`,
      { encoding: 'utf-8', env: approveEnv }
    );
    console.log('Approve OK');
  } catch (err) {
    if (err.message.includes('approve your own pull request')) {
      console.error('APPROVE FAILED: self-approval blocked. REVIEW_TOKEN must be a different identity than the PR author. Check that REVIEW_TOKEN is set to github.token in the workflow step.');
    } else {
      // Already approved on a prior synchronize run — safe to continue.
      console.warn(`Approve step warning (likely already approved): ${err.message}`);
    }
  }
  gh(`pr merge ${prNumber} --auto --squash`);
  console.log('Auto-merge enabled');
}

function postRejectionComment(prNumber, violations) {
  const body = [
    '🚫 **Snapshot PR auto-merge rejected.**',
    '',
    'This PR was opened on a branch matching the snapshot pattern, but it does **not** satisfy the auto-merge contract. Reasons:',
    '',
    ...violations.map((v) => `- ${v}`),
    '',
    '---',
    '',
    'Snapshot PR auto-merge is bounded by:',
    '1. PR author must be in `.github/snapshot-paths.yml` `authors:` list',
    '2. PR branch must start with one of `branch_prefixes:`',
    '3. **EVERY** changed file must match at least one of `paths:`',
    '',
    'To merge this PR, either:',
    '- Get a CODEOWNER review and merge manually, OR',
    '- Open a follow-up PR that splits out the non-snapshot file changes',
    '',
    'See [`docs/decisions/2026-05-23-workflow-lifecycle.md`](../blob/main/docs/decisions/2026-05-23-workflow-lifecycle.md) Pillar 3 for the full contract.',
  ].join('\n');
  gh(`pr comment ${prNumber} --body ${JSON.stringify(body)}`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
function main() {
  const PR_NUMBER = process.env.PR_NUMBER;
  const PR_AUTHOR = process.env.PR_AUTHOR;
  const PR_BRANCH = process.env.PR_BRANCH;
  const ALLOWLIST_PATH = process.env.ALLOWLIST_PATH || '.github/snapshot-paths.yml';
  const PAUSE_FLAG_PATH = process.env.PAUSE_FLAG_PATH || '.github/automation-paused';

  if (!PR_NUMBER || !PR_AUTHOR || !PR_BRANCH) {
    console.error('FATAL: PR_NUMBER, PR_AUTHOR, PR_BRANCH must all be set in env.');
    process.exit(2);
  }

  // Kill switch — checked FIRST, before allowlist parsing or any external
  // call. If paused, exit cleanly (status 0) with a one-line comment on the
  // PR so the operator sees why nothing happened. Exit 0 (not 1) because
  // paused is a deliberate operational state, not an error.
  if (isAutomationPaused(PAUSE_FLAG_PATH)) {
    console.log(`⏸  Automation paused (${PAUSE_FLAG_PATH} present). Skipping evaluation of PR #${PR_NUMBER}.`);
    try {
      gh(`pr comment ${PR_NUMBER} --body ${JSON.stringify(`⏸ **Snapshot PR auto-merge paused** — \`${PAUSE_FLAG_PATH}\` is present on main. This PR will be re-evaluated on the next \`synchronize\` event after the kill switch is cleared. See [\`docs/runbooks/snapshot-pr-contract.md\`](../blob/main/docs/runbooks/snapshot-pr-contract.md#kill-switch).`)}`);
    } catch (err) {
      console.warn(`Could not post pause comment (likely already posted): ${err.message}`);
    }
    process.exit(0);
  }

  const allowlist = parseAllowlist(readFileSync(ALLOWLIST_PATH, 'utf-8'));

  console.log(`PR #${PR_NUMBER} · author=${PR_AUTHOR} · branch=${PR_BRANCH}`);
  console.log(`Allowlist: ${allowlist.paths.length} paths, ${allowlist.branch_prefixes.length} branch prefixes, ${allowlist.authors.length} authors`);

  const files = fetchPrFiles(PR_NUMBER);
  console.log(`PR touches ${files.length} file(s): ${files.join(', ')}`);

  const { ok, violations } = evaluatePr({
    author: PR_AUTHOR,
    branch: PR_BRANCH,
    files,
    allowlist,
  });

  if (!ok) {
    // Pretty up the violation strings for human consumption — the pure
    // evaluator returns terse codes for testability.
    const pretty = violations.map((v) => {
      if (v.startsWith('author:')) {
        return `PR author \`${PR_AUTHOR}\` is not in the snapshot-paths authors allowlist. Allowed: ${allowlist.authors.map((a) => `\`${a}\``).join(', ')}`;
      }
      if (v.startsWith('branch:')) {
        return `PR branch \`${PR_BRANCH}\` does not start with any allowed snapshot prefix. Allowed prefixes: ${allowlist.branch_prefixes.map((p) => `\`${p}\``).join(', ')}`;
      }
      if (v.startsWith('paths:')) {
        const offending = v.slice('paths:'.length).split(',');
        return `The following file(s) are not in the snapshot-paths allowlist:\n  ${offending.map((f) => `\`${f}\``).join('\n  ')}`;
      }
      return v;
    });
    console.error('REJECTED. Violations:');
    for (const v of pretty) console.error('  - ' + v);
    postRejectionComment(PR_NUMBER, pretty);
    process.exit(1);
  }

  console.log('All gates passed. Approving + enabling auto-merge.');
  const reason = `Author \`${PR_AUTHOR}\` opened branch \`${PR_BRANCH}\` touching ${files.length} file(s), all within the snapshot allowlist (\`${allowlist.paths.length}\` patterns checked).`;
  approveAndAutoMerge(PR_NUMBER, reason);
  console.log('Done.');
}

// Only execute main() when invoked directly (not when imported by tests).
if (import.meta.url === `file://${process.argv[1]}` || import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/'))) {
  main();
}
