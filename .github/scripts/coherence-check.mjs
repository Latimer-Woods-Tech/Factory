#!/usr/bin/env node
// =============================================================================
// coherence-check.mjs — drift detection for the Factory automation surface.
//
// Phase 6 of the workflow lifecycle. Addresses the question:
//   "How do we measure that the system is staying coherent with the design,
//    and detect drift over time?"
//
// Every PR-time gate, every runtime monitor, every defense is POINT-IN-TIME.
// None of them ask: does the system still match the design we wrote down?
//
// This script asks that question. Runs daily. Emits structured violations
// to stdout + opens a tracking issue on any failure. Greppable audit lines
// roll into the monthly governance audit.
//
// =============================================================================
//   BLAST RADIUS (enforced in code AND in tests)
// =============================================================================
//   CAN:
//     - Read any file in the repo
//     - Open / comment on issues (one tracking issue per check, deduped)
//     - Post Pushover notifications
//
//   CANNOT (asserted by tests scanning this file's source):
//     - Modify any file
//     - Push code
//     - Approve, merge, close any PR
//     - Modify workflows
//     - Modify branch protection or rulesets
//     - Delete anything
//     - Auto-fix any drift it detects (deliberate — drift fixes go through
//       human-reviewed PRs, not automation)
//
// =============================================================================
//   THE INVARIANTS (each as a check function, dispatched by main)
// =============================================================================
//   I1  registry-vs-filesystem-forward  — every .github/workflows/*.yml is in REGISTRY.md
//   I2  registry-vs-filesystem-reverse  — every REGISTRY.md row points to a real file
//   I3  push-pr-has-concurrency         — every push/PR workflow has top-level concurrency:
//   I4  scripts-have-kill-switch        — every state-mutating script consults isAutomationPaused
//   I5  scripts-import-notify           — every state-mutating script imports notify (paging)
//   I6  doc-links-resolve               — markdown links in docs/decisions + docs/runbooks resolve
//   I7  no-pause-on-main                — .github/automation-paused must NOT exist on main
//
// Each check returns { id, ok, violations[] } where violations is empty on ok=true.
// =============================================================================

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, resolve, relative } from 'node:path';
import { notify } from './pushover-notify.mjs';

// ---------------------------------------------------------------------------
// Kill switch — inlined duplicate (single-line existsSync, cannot drift
// from the canonical definitions elsewhere).
// ---------------------------------------------------------------------------
export function isAutomationPaused(pausePath = '.github/automation-paused') {
  return existsSync(pausePath);
}

// ---------------------------------------------------------------------------
// Small utilities (pure, testable).
// ---------------------------------------------------------------------------

export function listFilesRecursive(dir, predicate = () => true) {
  const out = [];
  function walk(d) {
    let entries;
    try { entries = readdirSync(d); } catch { return; }
    for (const e of entries) {
      const p = join(d, e);
      let st;
      try { st = statSync(p); } catch { continue; }
      if (st.isDirectory()) walk(p);
      else if (predicate(p)) out.push(p.replace(/\\/g, '/'));
    }
  }
  walk(dir);
  return out;
}

const STATE_MUTATING_PATTERNS = [
  // gh <verb> in either bash form (gh pr merge) OR JS form (gh("pr merge"))
  /gh\s*\(?\s*['"`]?(pr|issue|workflow)\s+(merge|review|comment|create|close|edit|disable|enable|run)\b/,
  // explicit mutating HTTP methods (covers `gh api -X PUT/POST/...` and direct curl)
  /-X\s+(POST|PUT|PATCH|DELETE)\b/,
  // direct Pushover API call (callers who pager themselves without notify())
  /\bfetch\s*\(\s*['"`]https:\/\/api\.pushover\.net/,
];

/**
 * Does the script source contain at least one state-mutating call?
 * Used to decide whether the script must include a kill-switch check
 * and a notify() import.
 */
export function isStateMutatingScript(source) {
  return STATE_MUTATING_PATTERNS.some((re) => re.test(source));
}

/**
 * Does the script source consult the kill switch?
 * Looks for any call to isAutomationPaused() or `.github/automation-paused`
 * presence-check via existsSync.
 */
export function hasKillSwitchCheck(source) {
  if (/\bisAutomationPaused\s*\(/.test(source)) return true;
  if (/existsSync\s*\(\s*['"`]?[^)]*automation-paused/.test(source)) return true;
  return false;
}

/**
 * Does the script import notify (paging) from pushover-notify?
 * Accepts the canonical import OR an inline duplicate (rare but allowed).
 */
export function hasNotifyImport(source) {
  // Any relative path ending in pushover-notify(.mjs)? — works for './', '../',
  // '../../scripts/', etc.
  if (/from\s+['"`][^'"`]*pushover-notify(\.mjs)?['"`]/.test(source)) return true;
  if (/['"`]https:\/\/api\.pushover\.net/.test(source)) return true;  // direct caller counts as its own pager
  return false;
}

// ---------------------------------------------------------------------------
// The invariant checks. Each returns { id, ok, violations: string[] }.
// ---------------------------------------------------------------------------

export function checkRegistryVsFilesystemForward({ workflowsDir = '.github/workflows', registryPath = '.github/workflows/REGISTRY.md' } = {}) {
  const id = 'I1-registry-forward';
  if (!existsSync(registryPath)) return { id, ok: true, violations: [], note: 'REGISTRY.md absent — skipping (Phase 1 not landed)' };

  const registryText = readFileSync(registryPath, 'utf-8');
  const registryFiles = new Set();
  const ROW_RE = /^\|\s*`([^`]+\.ya?ml)`\s*\|/gm;
  let m;
  while ((m = ROW_RE.exec(registryText)) !== null) registryFiles.add(m[1]);

  const fsFiles = listFilesRecursive(workflowsDir, (p) => /\.(ya?ml)$/.test(p))
    .map((p) => p.split('/').pop())
    .filter((f) => !f.startsWith('_') && f !== 'REGISTRY.md');

  const missing = fsFiles.filter((f) => !registryFiles.has(f));
  return {
    id,
    ok: missing.length === 0,
    violations: missing.map((f) => `Workflow ${f} exists on disk but is not classified in REGISTRY.md`),
  };
}

export function checkRegistryVsFilesystemReverse({ workflowsDir = '.github/workflows', registryPath = '.github/workflows/REGISTRY.md' } = {}) {
  const id = 'I2-registry-reverse';
  if (!existsSync(registryPath)) return { id, ok: true, violations: [], note: 'REGISTRY.md absent — skipping' };

  const registryText = readFileSync(registryPath, 'utf-8');
  const registryFiles = [];
  const ROW_RE = /^\|\s*`([^`]+\.ya?ml)`\s*\|/gm;
  let m;
  while ((m = ROW_RE.exec(registryText)) !== null) registryFiles.push(m[1]);

  const fsFiles = new Set(
    listFilesRecursive(workflowsDir, (p) => /\.(ya?ml)$/.test(p)).map((p) => p.split('/').pop())
  );

  const orphaned = registryFiles.filter((f) => !fsFiles.has(f));
  return {
    id,
    ok: orphaned.length === 0,
    violations: orphaned.map((f) => `REGISTRY.md row references ${f} but no such file exists in .github/workflows/`),
  };
}

export function checkPushPrHasConcurrency({ workflowsDir = '.github/workflows' } = {}) {
  const id = 'I3-concurrency';
  const violations = [];
  const files = listFilesRecursive(workflowsDir, (p) => /\.(ya?ml)$/.test(p));
  for (const f of files) {
    const src = readFileSync(f, 'utf-8');
    // Skip reusable-only workflows (workflow_call as sole trigger)
    if (/^\s+workflow_call:/m.test(src) && !/^\s+(push|pull_request):/m.test(src)) continue;
    if (!/^\s+(push|pull_request):/m.test(src)) continue;  // no relevant trigger
    if (!/^concurrency:/m.test(src)) {
      violations.push(`${f.split('/').pop()} has push/PR triggers but no top-level concurrency: block`);
    }
  }
  return { id, ok: violations.length === 0, violations };
}

export function checkScriptsHaveKillSwitch({ scriptsDir = '.github/scripts' } = {}) {
  const id = 'I4-kill-switch-coverage';
  const violations = [];
  const files = listFilesRecursive(scriptsDir, (p) => /\.mjs$/.test(p) && !p.endsWith('.test.mjs'));
  for (const f of files) {
    const src = readFileSync(f, 'utf-8');
    if (!isStateMutatingScript(src)) continue;
    if (!hasKillSwitchCheck(src)) {
      violations.push(`${f.split('/').pop()} performs state-mutating calls but does NOT consult the kill switch`);
    }
  }
  return { id, ok: violations.length === 0, violations };
}

export function checkScriptsImportNotify({ scriptsDir = '.github/scripts' } = {}) {
  const id = 'I5-notify-coverage';
  const violations = [];
  const files = listFilesRecursive(scriptsDir, (p) => /\.mjs$/.test(p) && !p.endsWith('.test.mjs'));
  for (const f of files) {
    const src = readFileSync(f, 'utf-8');
    if (!isStateMutatingScript(src)) continue;
    // Skip pushover-notify itself (it IS the notify; can't import itself)
    if (f.endsWith('pushover-notify.mjs')) continue;
    if (!hasNotifyImport(src)) {
      violations.push(`${f.split('/').pop()} performs state-mutating calls but does NOT import notify() / page out-of-band`);
    }
  }
  return { id, ok: violations.length === 0, violations };
}

const MARKDOWN_LINK_RE = /\[([^\]]+)\]\((?!https?:|mailto:|#)([^)]+)\)/g;

export function checkDocLinksResolve({ rootDirs = ['docs/decisions', 'docs/runbooks'] } = {}) {
  const id = 'I6-doc-links';
  const violations = [];
  for (const dir of rootDirs) {
    if (!existsSync(dir)) continue;
    const mds = listFilesRecursive(dir, (p) => p.endsWith('.md'));
    for (const md of mds) {
      const src = readFileSync(md, 'utf-8');
      let m;
      MARKDOWN_LINK_RE.lastIndex = 0;
      while ((m = MARKDOWN_LINK_RE.exec(src)) !== null) {
        let target = m[2].split('#')[0];  // strip anchor
        if (!target) continue;  // pure anchor link
        const resolved = resolve(dirname(md), target);
        if (!existsSync(resolved)) {
          violations.push(`${md}: link "[${m[1]}](${m[2]})" points to non-existent path ${relative(process.cwd(), resolved).replace(/\\/g, '/')}`);
        }
      }
    }
  }
  return { id, ok: violations.length === 0, violations };
}

export function checkNoPauseOnMain({ pausePath = '.github/automation-paused' } = {}) {
  const id = 'I7-no-pause-on-main';
  const present = existsSync(pausePath);
  return {
    id,
    ok: !present,
    violations: present ? [`${pausePath} is present on main — automation is paused. If this is intentional, the operator should acknowledge in a comment on the tracking issue; otherwise remove via PR.`] : [],
  };
}

// ---------------------------------------------------------------------------
// Audit log — same convention as Warden / Pushover helper.
// ---------------------------------------------------------------------------
export function logAudit(entry) {
  const audit = { ts: new Date().toISOString(), ...entry };
  console.log(`COHERENCE_AUDIT: ${JSON.stringify(audit)}`);
}

// ---------------------------------------------------------------------------
// gh CLI wrappers — narrow surface (only the allowed subcommands).
// ---------------------------------------------------------------------------
import { execSync } from 'node:child_process';
function gh(args, opts = {}) {
  return execSync(`gh ${args}`, { encoding: 'utf-8', ...opts }).trim();
}

async function findExistingOpenIssue(title) {
  const escaped = title.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  try {
    const json = gh(`search issues --repo Latimer-Woods-Tech/Factory "${escaped}" in:title state:open --json number,title --limit 5`);
    return JSON.parse(json).filter((i) => i.title === title)[0]?.number ?? null;
  } catch {
    return null;
  }
}

async function openOrUpdateTrackingIssue({ checkId, violations }) {
  const title = `[Coherence] ${checkId} drift detected`;
  const existing = await findExistingOpenIssue(title);
  const body = [
    `**Check:** \`${checkId}\``,
    `**Drift count:** ${violations.length}`,
    '',
    '**Violations:**',
    ...violations.map((v) => `- ${v}`),
    '',
    '---',
    `Generated by [coherence-check](../blob/main/.github/scripts/coherence-check.mjs).`,
    `Runbook: [docs/runbooks/coherence-check.md](../blob/main/docs/runbooks/coherence-check.md).`,
    '',
    `_Close this issue once drift is resolved. Next coherence run will reopen if drift recurs._`,
  ].join('\n');

  if (existing) {
    gh(`issue comment ${existing} --body ${JSON.stringify(body)}`);
    return { number: existing, action: 'updated' };
  }
  const result = gh(`issue create --title ${JSON.stringify(title)} --body ${JSON.stringify(body)} --label compliance:drift --label priority/p2`);
  const numberMatch = result.match(/\/issues\/(\d+)/);
  return { number: numberMatch ? Number(numberMatch[1]) : null, action: 'created' };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
const ALL_CHECKS = [
  checkRegistryVsFilesystemForward,
  checkRegistryVsFilesystemReverse,
  checkPushPrHasConcurrency,
  checkScriptsHaveKillSwitch,
  checkScriptsImportNotify,
  checkDocLinksResolve,
  checkNoPauseOnMain,
];

async function main() {
  const DRY_RUN = process.env.COHERENCE_DRY_RUN === 'true';

  if (isAutomationPaused()) {
    logAudit({ event: 'paused-skip-run' });
    console.log('⏸  Automation paused; coherence-check exiting clean.');
    return;
  }

  logAudit({ event: 'run-start', check_count: ALL_CHECKS.length, dry_run: DRY_RUN });

  const allResults = [];
  for (const check of ALL_CHECKS) {
    try {
      const result = check();
      allResults.push(result);
      logAudit({ event: 'check', id: result.id, ok: result.ok, violation_count: result.violations.length });
    } catch (err) {
      logAudit({ event: 'check-error', check: check.name, error: err.message });
    }
  }

  const failed = allResults.filter((r) => !r.ok);

  if (failed.length === 0) {
    logAudit({ event: 'run-complete', status: 'all-pass' });
    console.log('✓ All coherence checks passed.');
    return;
  }

  logAudit({ event: 'run-complete', status: 'drift-detected', failed_check_count: failed.length });
  console.error(`✗ ${failed.length} coherence check(s) detected drift.`);
  for (const r of failed) {
    console.error(`  [${r.id}] ${r.violations.length} violation(s):`);
    for (const v of r.violations.slice(0, 5)) console.error(`    - ${v}`);
    if (r.violations.length > 5) console.error(`    ... (${r.violations.length - 5} more)`);
  }

  if (DRY_RUN) {
    logAudit({ event: 'dry-run-skip-actions' });
    console.log('Dry-run mode: no tracking issues opened, no notifications sent.');
    // Dry-run: advisory-only — violations visible in logs/summary but do not block PRs.
    // The scheduled run (non-dry) exits 1, opens issues, and pages on-call.
    return;
  }

  // Open / update one tracking issue per failed check.
  for (const r of failed) {
    try {
      const { number, action } = await openOrUpdateTrackingIssue({ checkId: r.id, violations: r.violations });
      logAudit({ event: `issue-${action}`, check: r.id, issue: number });
    } catch (err) {
      logAudit({ event: 'issue-error', check: r.id, error: err.message });
    }
  }

  // One Pushover notification summarizing the run — not per-check (to avoid fatigue).
  try {
    await notify({
      title: `[Factory · COHERENCE] ${failed.length} drift(s) detected`,
      message: failed.map((r) => `${r.id}: ${r.violations.length}`).join('; '),
      url: `https://github.com/Latimer-Woods-Tech/Factory/issues?q=label%3Acompliance%3Adrift+is%3Aopen`,
      priority: 0,  // normal — drift isn't urgent, but you should know about it
    });
  } catch (err) {
    logAudit({ event: 'notify-error', error: err.message });
  }

  process.exit(1);
}

if (import.meta.url === `file://${process.argv[1]}` || import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/'))) {
  main().catch((err) => {
    console.error('FATAL:', err);
    process.exit(2);
  });
}
