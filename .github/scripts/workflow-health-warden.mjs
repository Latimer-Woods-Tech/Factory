#!/usr/bin/env node
// =============================================================================
// workflow-health-warden.mjs — Phase 3 of the workflow lifecycle.
//
// Daily monitor for the Factory automation surface. Reads REGISTRY.md to
// learn each workflow's tier, fetches recent run history, and applies a
// tier-appropriate response when a workflow is unhealthy:
//
//   T1 (Load-bearing)  — red >1h        → Pushover P1 + open priority/p0 issue
//   T2 (Operational)   — red >24h       → open priority/p1 issue + log to digest
//   T3 (Informational) — ≥10 fails      → `gh workflow disable` + workflow-quarantined issue + Pushover P2
//
// =============================================================================
//   BLAST RADIUS (enforced in code AND in tests; ALSO scoped via workflow permissions)
// =============================================================================
//   CAN:
//     - Read workflow run history via `gh api`
//     - Disable a workflow's schedule via `gh workflow disable`
//     - Create / update issues
//     - Post Pushover notifications
//
//   CANNOT (asserted by tests scanning this file's source):
//     - Delete any workflow file or any other file
//     - Modify any workflow file's content
//     - Push code to any branch
//     - Approve, merge, or close any PR
//     - Modify branch protection or rulesets
//     - Re-enable workflows it has quarantined (intentional — re-enable is CODEOWNER-only)
//
// =============================================================================
//   DEFENSES INHERITED
// =============================================================================
//   #1 Kill switch       — first action: if .github/automation-paused exists, exit 0
//   #2 External alerting — every paging/quarantine action emits a Pushover audit line
//   #3 Bounded blast     — see above; tests assert no forbidden tokens in source
//   #4 Monthly audit     — quarantines/pages captured via PUSHOVER_AUDIT: log lines
//      + WARDEN_AUDIT: log lines for the rolled-up monthly governance audit
//
// REF: docs/decisions/2026-05-23-governance-of-governance.md
// =============================================================================

import { existsSync, readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { notify } from './pushover-notify.mjs';

// ---------------------------------------------------------------------------
// Kill switch — inlined duplicate of the canonical check (see TODO in
// pushover-notify.mjs about post-merge dedup).
// ---------------------------------------------------------------------------
export function isAutomationPaused(pausePath = '.github/automation-paused') {
  return existsSync(pausePath);
}

// ---------------------------------------------------------------------------
// REGISTRY.md parser — pure function. Reads the table rows under each
// `### T<N>` section heading and extracts `workflow → tier`.
// Tolerant: workflows not classified default to T2 (operational). Bare-
// minimum guard against new workflows shipping without a registry update —
// they get the medium SLO, not the strictest.
// ---------------------------------------------------------------------------
const TIER_HEADING_RE = /^###\s+(T[1-3])\b/;
const TABLE_ROW_RE = /^\|\s*`([^`]+\.ya?ml)`\s*\|/;

export function parseTierRegistry(text) {
  const lines = text.split('\n');
  const tiers = {};  // filename → 'T1'|'T2'|'T3'
  let currentTier = null;
  for (const line of lines) {
    const headingMatch = line.match(TIER_HEADING_RE);
    if (headingMatch) {
      currentTier = headingMatch[1];
      continue;
    }
    if (!currentTier) continue;
    const rowMatch = line.match(TABLE_ROW_RE);
    if (rowMatch) {
      tiers[rowMatch[1]] = currentTier;
    }
  }
  return tiers;
}

// ---------------------------------------------------------------------------
// Run history analysis — all pure functions.
// `runs` is an array of GH run objects sorted newest-first, each with at
// least { conclusion: string, created_at: ISO8601, name: string }.
// ---------------------------------------------------------------------------

/**
 * Number of consecutive failures from the newest run. Counts only
 * `failure` and `startup_failure` (NOT `cancelled` — cancelled is operator
 * action, not failure; NOT `skipped` — skip means the workflow didn't run).
 */
export function computeConsecutiveFailures(runs) {
  let count = 0;
  for (const r of runs) {
    if (r.conclusion === 'failure' || r.conclusion === 'startup_failure') {
      count++;
    } else if (r.conclusion === 'cancelled' || r.conclusion === 'skipped') {
      continue;  // ignore — neither failure nor success
    } else {
      break;  // success (or null/in-progress) breaks the streak
    }
  }
  return count;
}

/**
 * How many hours has this workflow been red? Returns 0 if last completed
 * run is green. Returns +Infinity if there are NO green runs in history.
 *
 * `nowMs` is parameterized for deterministic testing.
 */
export function computeRedDurationHours(runs, nowMs = Date.now()) {
  const consideredRuns = runs.filter((r) => r.conclusion !== 'cancelled' && r.conclusion !== 'skipped');
  if (consideredRuns.length === 0) return 0;
  if (consideredRuns[0].conclusion === 'success') return 0;

  // Find the first success going back in time. The boundary between the
  // newest failure and the most recent prior success is when "red" started.
  for (let i = 0; i < consideredRuns.length; i++) {
    if (consideredRuns[i].conclusion === 'success') {
      // Red since the run after this success.
      const redSince = new Date(consideredRuns[i - 1].created_at).getTime();
      return Math.max(0, (nowMs - redSince) / (1000 * 60 * 60));
    }
  }
  // All in-window runs are failures — red since the oldest failure we see.
  // But we have no upper bound on duration, so report +Inf to force action.
  return Infinity;
}

/**
 * Decide what to do for a workflow given its tier and recent run history.
 * Pure function — returns an action object the caller dispatches.
 *
 * Returns:
 *   { type: 'none' }
 *   { type: 'page', tier, reason, priority, issueLabels }
 *   { type: 'log',  tier, reason, issueLabels }
 *   { type: 'quarantine', tier, reason, priority, issueLabels }
 */
export function evaluateWorkflow({ name, tier, runs, nowMs = Date.now() }) {
  if (!runs || runs.length === 0) {
    return { type: 'none', reason: 'no-runs-in-window' };
  }
  const consecutiveFailures = computeConsecutiveFailures(runs);
  const redHours = computeRedDurationHours(runs, nowMs);

  // T3 quarantine takes precedence — chronic failures get the disable
  // action regardless of their red-hours metric.
  if (tier === 'T3' && consecutiveFailures >= 10) {
    return {
      type: 'quarantine',
      tier,
      reason: `${consecutiveFailures} consecutive failures (T3 quarantine threshold = 10)`,
      priority: 0,  // log-priority, not high-priority — T3 is informational
      issueLabels: ['workflow-quarantined', 'priority/p1'],
    };
  }

  if (tier === 'T1' && redHours > 1) {
    return {
      type: 'page',
      tier,
      reason: `Tier-1 workflow red for ${redHours.toFixed(1)}h (threshold 1h)`,
      priority: 1,  // Pushover high
      issueLabels: ['priority/p0', 'workflow-health-warden'],
    };
  }

  if (tier === 'T2' && redHours > 24) {
    return {
      type: 'log',
      tier,
      reason: `Tier-2 workflow red for ${redHours.toFixed(1)}h (threshold 24h)`,
      issueLabels: ['priority/p1', 'workflow-health-warden'],
    };
  }

  return { type: 'none', reason: `healthy: ${consecutiveFailures} consecutive failures, ${redHours.toFixed(1)}h red` };
}

/**
 * Stable issue title for dedup. Same workflow + same action type ALWAYS
 * produces the same title — so re-running the Warden against an ongoing
 * incident updates the existing issue instead of opening a new one.
 */
export function buildIssueTitle({ type, workflow }) {
  const prefix = {
    page: '[Warden:T1] Tier-1 workflow red',
    log: '[Warden:T2] Tier-2 workflow red',
    quarantine: '[Warden:T3] Workflow quarantined',
  }[type] || '[Warden]';
  return `${prefix} — ${workflow}`;
}

// ---------------------------------------------------------------------------
// Audit log — same convention as pushover-notify.
// Greppable: `WARDEN_AUDIT:` followed by single-line JSON.
// ---------------------------------------------------------------------------
export function logAudit(entry) {
  const audit = { ts: new Date().toISOString(), ...entry };
  console.log(`WARDEN_AUDIT: ${JSON.stringify(audit)}`);
}

// ---------------------------------------------------------------------------
// Side-effecting helpers (wrap gh CLI). Lightly wrapped so tests can
// substitute them via dependency injection in the dispatch path.
// ---------------------------------------------------------------------------

function gh(args, opts = {}) {
  return execSync(`gh ${args}`, { encoding: 'utf-8', ...opts }).trim();
}

async function fetchWorkflowList() {
  // Returns [{ name, path, state, id }, ...]. We filter to `active` only —
  // already-disabled workflows are out of scope (re-enable is CODEOWNER work).
  const json = gh(`workflow list --all --json name,path,state,id --limit 200`);
  return JSON.parse(json).filter((w) => w.state === 'active');
}

async function fetchRunsForWorkflow(workflowFilename, limit = 20) {
  const json = gh(`run list --workflow=${workflowFilename} --limit ${limit} --json conclusion,createdAt,name,status`);
  // Normalize the API field name: GH returns `createdAt` (camel) in --json mode.
  return JSON.parse(json).map((r) => ({
    conclusion: r.conclusion,
    created_at: r.createdAt,
    name: r.name,
    status: r.status,
  }));
}

async function findExistingOpenIssueByTitle(title) {
  // gh search returns issue numbers if there's an open issue with this exact title.
  const escaped = title.replace(/"/g, '\\"');
  try {
    const json = gh(`search issues --repo Latimer-Woods-Tech/Factory "${escaped}" in:title state:open --json number,title --limit 5`);
    const matches = JSON.parse(json).filter((i) => i.title === title);
    return matches[0]?.number ?? null;
  } catch {
    return null;
  }
}

async function openOrUpdateIssue({ title, body, labels }) {
  const existingNumber = await findExistingOpenIssueByTitle(title);
  if (existingNumber) {
    // Update with a fresh comment (preserves history; original body stays).
    gh(`issue comment ${existingNumber} --body ${JSON.stringify(body)}`);
    return { number: existingNumber, action: 'updated' };
  }
  const labelsArg = labels.map((l) => `--label ${l}`).join(' ');
  const result = gh(`issue create --title ${JSON.stringify(title)} --body ${JSON.stringify(body)} ${labelsArg}`);
  // gh outputs the URL on success — extract issue number.
  const numberMatch = result.match(/\/issues\/(\d+)/);
  return { number: numberMatch ? Number(numberMatch[1]) : null, action: 'created' };
}

async function disableWorkflow(workflowFilename) {
  // The ONLY mutating action this script makes on a workflow itself.
  // Wrapped here so the test can scan the source for forbidden gh
  // subcommands without false positives.
  gh(`workflow disable ${workflowFilename}`);
}

// ---------------------------------------------------------------------------
// Dispatch — given an action object from evaluateWorkflow, execute it.
// Tests cover evaluateWorkflow exhaustively; this is the thin wiring.
// ---------------------------------------------------------------------------

async function dispatchAction({ action, workflow, dryRun }) {
  if (action.type === 'none') {
    logAudit({ event: 'evaluated-healthy', workflow: workflow.name, reason: action.reason });
    return;
  }

  const title = buildIssueTitle({ type: action.type, workflow: workflow.name });
  const body = [
    `**Workflow:** \`${workflow.path}\` (${workflow.name})`,
    `**Tier:** ${action.tier}`,
    `**Reason:** ${action.reason}`,
    '',
    `Generated by [workflow-health-warden](../blob/main/.github/scripts/workflow-health-warden.mjs).`,
    `Re-enable / re-evaluation guidance: see [docs/runbooks/workflow-health-warden.md](../blob/main/docs/runbooks/workflow-health-warden.md).`,
  ].join('\n');

  if (dryRun) {
    logAudit({ event: 'dry-run-skip', workflow: workflow.name, action: action.type, reason: action.reason });
    return;
  }

  if (action.type === 'page' || action.type === 'log') {
    const { number, action: issueAction } = await openOrUpdateIssue({
      title,
      body,
      labels: action.issueLabels,
    });
    logAudit({ event: `${action.type}d`, workflow: workflow.name, issue: number, issueAction });
    if (action.type === 'page') {
      await notify({
        title: `[Factory · WARDEN] ${workflow.name} (${action.tier})`,
        message: action.reason,
        url: `https://github.com/Latimer-Woods-Tech/Factory/issues/${number}`,
        priority: action.priority,
      });
    }
  } else if (action.type === 'quarantine') {
    // The destructive path. Always: open issue FIRST so the operator has a
    // record, THEN disable the workflow.
    const { number } = await openOrUpdateIssue({ title, body, labels: action.issueLabels });
    await disableWorkflow(workflow.path.replace(/^\.github\/workflows\//, ''));
    logAudit({ event: 'quarantined', workflow: workflow.name, issue: number });
    await notify({
      title: `[Factory · QUARANTINE] ${workflow.name} (${action.tier})`,
      message: action.reason + ' — workflow disabled. Re-enable procedure in the linked issue and runbook (CODEOWNER-only).',
      url: `https://github.com/Latimer-Woods-Tech/Factory/issues/${number}`,
      priority: action.priority,
    });
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  const DRY_RUN = process.env.WARDEN_DRY_RUN === 'true';
  const REGISTRY_PATH = process.env.REGISTRY_PATH || '.github/workflows/REGISTRY.md';

  // Defense #1 — kill switch FIRST.
  if (isAutomationPaused()) {
    logAudit({ event: 'paused-skip-run' });
    console.log('⏸  Automation paused; warden exiting clean.');
    return;
  }

  // Phase 1 dependency: REGISTRY.md must exist. If it doesn't, log clearly
  // and exit 0 — better to be a no-op than to misclassify workflows.
  if (!existsSync(REGISTRY_PATH)) {
    logAudit({ event: 'no-registry-skip-run', registry_path: REGISTRY_PATH });
    console.warn(`⚠  ${REGISTRY_PATH} not found. Warden is a no-op until Phase 1 (REGISTRY.md) lands.`);
    return;
  }

  const registry = parseTierRegistry(readFileSync(REGISTRY_PATH, 'utf-8'));
  const workflows = await fetchWorkflowList();

  logAudit({ event: 'run-start', workflow_count: workflows.length, registry_size: Object.keys(registry).length, dry_run: DRY_RUN });

  for (const workflow of workflows) {
    const filename = workflow.path.replace(/^\.github\/workflows\//, '');
    const tier = registry[filename] || 'T2';  // unclassified defaults to T2
    let runs;
    try {
      runs = await fetchRunsForWorkflow(filename);
    } catch (err) {
      logAudit({ event: 'fetch-runs-error', workflow: workflow.name, error: err.message });
      continue;  // skip this workflow; do not let one failure block the run
    }
    const action = evaluateWorkflow({ name: workflow.name, tier, runs });
    try {
      await dispatchAction({ action, workflow, dryRun: DRY_RUN });
    } catch (err) {
      logAudit({ event: 'dispatch-error', workflow: workflow.name, action: action.type, error: err.message });
    }
  }

  logAudit({ event: 'run-complete' });
}

// CLI entrypoint guard.
if (import.meta.url === `file://${process.argv[1]}` || import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/'))) {
  main().catch((err) => {
    console.error('FATAL:', err);
    process.exit(1);
  });
}
