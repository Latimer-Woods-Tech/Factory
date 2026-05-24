#!/usr/bin/env node
// =============================================================================
// governance-audit.mjs — Phase 4 Defense #4 of the workflow lifecycle.
//
// Monthly receipt of what the Factory automation surface did. Scans GH
// Actions workflow runs from the last 30 days for *_AUDIT: log lines
// emitted by the four audit-line-producing workflows, aggregates by
// category, and posts a single human-readable issue.
//
// Frame is consent, not health: not "is the system healthy?" but
// "what changed, and was that wanted?"
//
// =============================================================================
//   BLAST RADIUS (enforced in code + workflow permissions + tests)
// =============================================================================
//   CAN:
//     - Read workflow run logs via gh CLI
//     - Open / comment on one rolling tracking issue per month
//     - Post Pushover notification on completion (low-priority)
//
//   CANNOT (asserted by tests):
//     - Modify any file
//     - Push code
//     - Approve, merge, or close any PR
//     - Modify workflows (no actions:write)
//     - Delete anything
//
// =============================================================================
//   DEFENSES INHERITED
// =============================================================================
//   #1 Kill switch       — first action: if .github/automation-paused exists, exit 0
//   #2 External alerting — Pushover P-1 (low) on completion summary
//   #3 Bounded blast     — workflow permissions are read + issues:write only
//   #4 Monthly audit     — this IS the monthly audit
// =============================================================================

import { existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { notify } from './pushover-notify.mjs';

// Kill switch — inlined to avoid cross-script imports drifting.
export function isAutomationPaused(p = '.github/automation-paused') {
  return existsSync(p);
}

// ---------------------------------------------------------------------------
// Audit-line schema. Each emitter prefixes single-line JSON with one of:
//   PUSHOVER_AUDIT:   — Pushover sent/no-op'd
//   WARDEN_AUDIT:     — Workflow Health Warden actions
//   COHERENCE_AUDIT:  — Coherence Check runs + results
//   FRIDGE_AUDIT:     — FRIDGE semantic check outcomes
// ---------------------------------------------------------------------------

export const AUDIT_PREFIXES = [
  'PUSHOVER_AUDIT:',
  'WARDEN_AUDIT:',
  'COHERENCE_AUDIT:',
  'FRIDGE_AUDIT:',
];

const AUDIT_LINE_RE = new RegExp(`(${AUDIT_PREFIXES.join('|')})\\s*(\\{[^\\n]*\\})`, 'g');

/**
 * Parse audit lines out of a (potentially large) log blob.
 * Returns [{prefix, entry}, ...] for each successful parse. Lines that
 * don't parse as JSON are silently dropped (logs sometimes get truncated).
 */
export function parseAuditLines(logBlob) {
  const results = [];
  if (!logBlob) return results;
  let m;
  AUDIT_LINE_RE.lastIndex = 0;
  while ((m = AUDIT_LINE_RE.exec(logBlob)) !== null) {
    try {
      const entry = JSON.parse(m[2]);
      results.push({ prefix: m[1].replace(':', ''), entry });
    } catch {
      // Tolerate truncated/garbled lines
    }
  }
  return results;
}

/**
 * Aggregate parsed audit entries into a structured summary suitable for
 * rendering into the monthly issue.
 *
 * Output shape:
 *   {
 *     period: { start, end },
 *     pushover: { sent: N, no_op: N, by_reason: {} },
 *     warden:   { evaluated: N, paged: N, logged: N, quarantined: N, by_workflow: {} },
 *     coherence:{ runs: N, drift_runs: N, by_check_id: {} },
 *     fridge:   { runs: N, pass: N, fail: N, uncertain: N, by_rule: {} },
 *   }
 */
export function aggregate(parsedLines, period = { start: null, end: null }) {
  const out = {
    period,
    pushover: { sent: 0, no_op: 0, by_reason: {} },
    warden: { evaluated: 0, paged: 0, logged: 0, quarantined: 0, by_workflow: {} },
    coherence: { runs: 0, drift_runs: 0, by_check_id: {} },
    fridge: { runs: 0, pass: 0, fail: 0, uncertain: 0, by_rule: {} },
  };
  for (const { prefix, entry } of parsedLines) {
    if (prefix === 'PUSHOVER_AUDIT') {
      if (entry.sent) out.pushover.sent++;
      else out.pushover.no_op++;
      const reason = entry.reason || 'sent';
      out.pushover.by_reason[reason] = (out.pushover.by_reason[reason] || 0) + 1;
    } else if (prefix === 'WARDEN_AUDIT') {
      if (entry.event === 'evaluated-healthy') out.warden.evaluated++;
      else if (entry.event === 'paged' || entry.event === 'pageed') out.warden.paged++;
      else if (entry.event === 'loged' || entry.event === 'logd') out.warden.logged++;
      else if (entry.event === 'quarantined') out.warden.quarantined++;
      if (entry.workflow) {
        out.warden.by_workflow[entry.workflow] = (out.warden.by_workflow[entry.workflow] || 0) + 1;
      }
    } else if (prefix === 'COHERENCE_AUDIT') {
      if (entry.event === 'run-complete') {
        out.coherence.runs++;
        if (entry.status === 'drift-detected') out.coherence.drift_runs++;
      }
      if (entry.event === 'check' && entry.ok === false && entry.id) {
        out.coherence.by_check_id[entry.id] = (out.coherence.by_check_id[entry.id] || 0) + 1;
      }
    } else if (prefix === 'FRIDGE_AUDIT') {
      if (entry.event === 'outcome') {
        out.fridge.runs++;
        if (entry.action === 'silent') out.fridge.pass++;
        else if (entry.action === 'fail') out.fridge.fail++;
        else if (entry.action === 'advisory') out.fridge.uncertain++;
      }
      if (entry.event === 'parsed' && Array.isArray(entry.verdicts)) {
        for (const [rule_id, verdict] of entry.verdicts) {
          const key = `${rule_id}:${verdict}`;
          out.fridge.by_rule[key] = (out.fridge.by_rule[key] || 0) + 1;
        }
      }
    }
  }
  return out;
}

/**
 * Render aggregated summary into a markdown issue body. Stable structure
 * so the rolling issue's body can be replaced wholesale each run.
 */
export function buildReport({ summary, period, totalAuditLines, totalRunsProcessed }) {
  const lines = [];
  lines.push(`# Factory Governance Audit — ${period.label}`);
  lines.push('');
  lines.push(`_Period: \`${period.start}\` → \`${period.end}\`. Runs processed: ${totalRunsProcessed}. Audit lines parsed: ${totalAuditLines}._`);
  lines.push('');
  lines.push('## 1. Automation actions (the receipt)');
  lines.push('');
  lines.push('| Action | Count | Note |');
  lines.push('|---|--:|---|');
  lines.push(`| Snapshot PRs auto-merged | ${summary.pushover.by_reason.sent || 0} (paged) | from PUSHOVER_AUDIT: sent=true |`);
  lines.push(`| Pushover no-op (paused / secrets / etc) | ${summary.pushover.no_op} | check by_reason for breakdown |`);
  lines.push(`| Warden: workflows evaluated healthy | ${summary.warden.evaluated} | |`);
  lines.push(`| Warden: T1/T2 paged | ${summary.warden.paged + summary.warden.logged} | |`);
  lines.push(`| Warden: T3 quarantined | ${summary.warden.quarantined} | each = a workflow disabled |`);
  lines.push(`| Coherence Check runs | ${summary.coherence.runs} | (expect ~30 for monthly cron) |`);
  lines.push(`| Coherence drift detected | ${summary.coherence.drift_runs} | |`);
  lines.push(`| FRIDGE check runs | ${summary.fridge.runs} | per Red-tier PR |`);
  lines.push(`| FRIDGE pass | ${summary.fridge.pass} | |`);
  lines.push(`| FRIDGE fail | ${summary.fridge.fail} | each = a Red-tier rule violation flagged |`);
  lines.push(`| FRIDGE uncertain | ${summary.fridge.uncertain} | |`);
  lines.push('');

  if (Object.keys(summary.warden.by_workflow).length) {
    lines.push('### Warden activity by workflow');
    lines.push('');
    lines.push('| Workflow | Events |');
    lines.push('|---|--:|');
    for (const [wf, n] of Object.entries(summary.warden.by_workflow).sort((a, b) => b[1] - a[1])) {
      lines.push(`| \`${wf}\` | ${n} |`);
    }
    lines.push('');
  }

  if (Object.keys(summary.coherence.by_check_id).length) {
    lines.push('### Coherence drift hits by check');
    lines.push('');
    lines.push('| Check ID | Drift events |');
    lines.push('|---|--:|');
    for (const [id, n] of Object.entries(summary.coherence.by_check_id).sort((a, b) => b[1] - a[1])) {
      lines.push(`| \`${id}\` | ${n} |`);
    }
    lines.push('');
  }

  lines.push('## 2. Drift indicators (the smoke test)');
  lines.push('');
  lines.push('Manual checks — operator should eyeball these:');
  lines.push('');
  lines.push('- [ ] Tier-1 red >1h count this month — acceptable: 0');
  lines.push('- [ ] Snapshot PR backlog right now — acceptable: <2 stale');
  lines.push('- [ ] Workflow count delta from last month — large positive = budget gate likely bypassed');
  lines.push('- [ ] `.github/snapshot-paths.yml` size delta — large positive = allowlist creep');
  lines.push('- [ ] `.github/workflows/REGISTRY.md` rows delta — should track workflow file count');
  lines.push('');
  lines.push('## 3. Doc / behavior drift');
  lines.push('');
  lines.push('Check the latest Coherence Check run for I6 violations (broken doc links). If runbooks haven\'t been touched in 90 days while their target code has, those are candidates for a freshness review.');
  lines.push('');
  lines.push('## 4. Action items');
  lines.push('');
  if (summary.warden.quarantined > 0) {
    lines.push(`- [ ] Review the ${summary.warden.quarantined} quarantined workflow(s) — root-cause + re-enable`);
  }
  if (summary.coherence.drift_runs > 0) {
    lines.push(`- [ ] Address coherence drift in ${summary.coherence.drift_runs} run(s) — see open \`compliance:drift\` issues`);
  }
  if (summary.fridge.fail > 0) {
    lines.push(`- [ ] Review ${summary.fridge.fail} FRIDGE fail event(s) — open PRs with the \`fridge-flagged\` label`);
  }
  if (summary.fridge.uncertain > 5) {
    lines.push(`- [ ] FRIDGE returned uncertain ${summary.fridge.uncertain} times — tune prompt or escalate to V2 (2-party consensus)`);
  }
  lines.push('- [ ] Eyeball drift indicators in §2');
  lines.push('- [ ] Close this issue once reviewed (next month opens a new one)');
  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push(`_Generated by [governance-audit.mjs](../blob/main/.github/scripts/governance-audit.mjs). Runbook: [docs/runbooks/governance-audit.md](../blob/main/docs/runbooks/governance-audit.md)._`);
  return lines.join('\n');
}

/**
 * Compute the period covered: previous calendar month relative to nowIso.
 */
export function computePeriod(nowIso = new Date().toISOString()) {
  const now = new Date(nowIso);
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));  // 1st of current month, 00:00 UTC
  const start = new Date(end);
  start.setUTCMonth(start.getUTCMonth() - 1);
  const label = `${start.getUTCFullYear()}-${String(start.getUTCMonth() + 1).padStart(2, '0')}`;
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10), label };
}

// ---------------------------------------------------------------------------
// Audit-log emission
// ---------------------------------------------------------------------------
function logAudit(entry) {
  console.log(`GOVERNANCE_AUDIT: ${JSON.stringify({ ts: new Date().toISOString(), ...entry })}`);
}

// ---------------------------------------------------------------------------
// gh CLI wrappers — narrow surface.
// ---------------------------------------------------------------------------
function gh(args, opts = {}) {
  return execSync(`gh ${args}`, { encoding: 'utf-8', ...opts });
}

const AUDIT_WORKFLOWS = [
  'snapshot-pr-auto-merge.yml',
  'workflow-health-warden.yml',
  'coherence-check.yml',
  'fridge-semantic-check.yml',
];

function listRecentRuns({ workflow, since, limit = 50 }) {
  const json = gh(`run list --workflow=${workflow} --limit ${limit} --created='>=${since}' --json databaseId,conclusion,createdAt -q '.'`).trim();
  return JSON.parse(json || '[]');
}

function fetchRunLog(runId) {
  try {
    return gh(`run view ${runId} --log 2>/dev/null`);
  } catch {
    return '';  // Old runs may have purged logs
  }
}

async function openOrUpdateMonthlyIssue({ label, body, dryRun }) {
  const title = `Factory Governance Audit — ${label}`;
  if (dryRun) {
    console.log('--- DRY RUN: issue title ---');
    console.log(title);
    console.log('--- DRY RUN: issue body ---');
    console.log(body);
    return { number: null, action: 'dry-run' };
  }
  const escaped = title.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  let existing = null;
  try {
    const json = gh(`search issues --repo Latimer-Woods-Tech/Factory "${escaped}" in:title state:open --json number,title --limit 5`).trim();
    existing = JSON.parse(json || '[]').filter((i) => i.title === title)[0]?.number ?? null;
  } catch { /* swallow */ }

  if (existing) {
    // Replace the body wholesale — rolling issue updates each run
    gh(`api --method PATCH repos/Latimer-Woods-Tech/Factory/issues/${existing} --field body=${JSON.stringify(body)}`);
    return { number: existing, action: 'updated' };
  }
  const result = gh(`issue create --title ${JSON.stringify(title)} --body ${JSON.stringify(body)} --label governance-audit --label priority/p2`);
  const match = result.match(/\/issues\/(\d+)/);
  return { number: match ? Number(match[1]) : null, action: 'created' };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  const DRY_RUN = process.env.GOVERNANCE_DRY_RUN === 'true';
  const MAX_RUNS_PER_WORKFLOW = Number(process.env.MAX_RUNS_PER_WORKFLOW) || 50;

  if (isAutomationPaused()) {
    logAudit({ event: 'paused-skip-run' });
    console.log('⏸  Automation paused; governance-audit exiting clean.');
    return;
  }

  const period = computePeriod();
  logAudit({ event: 'run-start', period: period.label, dry_run: DRY_RUN });

  // Collect all audit lines from all four audit-line-emitting workflows
  // for the previous calendar month.
  const allParsed = [];
  let totalRunsProcessed = 0;
  for (const workflow of AUDIT_WORKFLOWS) {
    let runs;
    try {
      runs = listRecentRuns({ workflow, since: period.start, limit: MAX_RUNS_PER_WORKFLOW });
    } catch (err) {
      logAudit({ event: 'list-runs-error', workflow, error: err.message });
      continue;
    }
    logAudit({ event: 'workflow-scan-start', workflow, run_count: runs.length });
    for (const run of runs) {
      // Only process runs that completed within the period
      const createdAt = new Date(run.createdAt);
      const endDate = new Date(period.end);
      if (createdAt >= endDate) continue;  // Future of period (i.e. current month)
      const log = fetchRunLog(run.databaseId);
      const parsed = parseAuditLines(log);
      allParsed.push(...parsed);
      totalRunsProcessed++;
    }
  }

  const summary = aggregate(allParsed, period);
  const body = buildReport({ summary, period, totalAuditLines: allParsed.length, totalRunsProcessed });

  logAudit({ event: 'aggregated', period: period.label, audit_lines: allParsed.length, runs_processed: totalRunsProcessed });

  const { number, action } = await openOrUpdateMonthlyIssue({ label: period.label, body, dryRun: DRY_RUN });
  logAudit({ event: `issue-${action}`, period: period.label, issue: number });

  // Pushover low-priority on completion — operator should see the report exists
  if (!DRY_RUN) {
    try {
      await notify({
        title: `[Factory · AUDIT] ${period.label} governance audit ready`,
        message: `${totalRunsProcessed} runs processed; ${allParsed.length} audit lines. Issue #${number}.`,
        url: `https://github.com/Latimer-Woods-Tech/Factory/issues/${number}`,
        priority: -1,  // low — not urgent
      });
    } catch (err) {
      logAudit({ event: 'notify-error', error: err.message });
    }
  }
}

if (import.meta.url === `file://${process.argv[1]}` || import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/'))) {
  main().catch((err) => {
    console.error('FATAL:', err);
    process.exit(1);
  });
}
