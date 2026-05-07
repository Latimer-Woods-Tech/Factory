#!/usr/bin/env node

/**
 * Weekly CI runtime telemetry reporter for the Factory repository.
 *
 * Uses the GitHub REST API to:
 *  1. Fetch completed workflow runs for the current week and the prior week.
 *  2. Compute the median duration (seconds) per workflow for each window.
 *  3. Compare medians to identify regressions (≥20% slower week-over-week).
 *  4. Open a GitHub issue for every regressing workflow.
 *  5. Append a CSV snapshot to ci-runtime-history.csv for trend archival.
 *
 * Intentionally dependency-free so it runs in GitHub Actions with no extra installs.
 *
 * Architectural exception — Hard Constraints note:
 *  This file runs as a plain Node.js CLI script inside GitHub Actions, NOT as a
 *  Cloudflare Worker. Therefore the two standing-order constraints that are
 *  inapplicable here (and the reasons why) are:
 *    • `process.env` — Workers use `env` bindings; Node.js scripts have no
 *      alternative. Using `process.env` is the correct idiom for CI scripts.
 *    • `fs` / `path` — Workers cannot use Node.js built-ins, but this script
 *      runs in a GitHub-hosted runner environment where they are available and
 *      necessary for CSV archival.
 */

// Node.js-only: `process.env` and `fs`/`path` are used intentionally here
// because this is a CI script, not a Cloudflare Worker (see header above).
/* eslint-disable no-process-env */
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const ORG = process.env.CI_RUNTIME_REPO_OWNER || 'Latimer-Woods-Tech';
const REPO = process.env.CI_RUNTIME_REPO_NAME || 'factory';

/** Percentage increase in median runtime that triggers a regression issue. */
const REGRESSION_THRESHOLD_PCT = 20;

/** Minimum number of runs required in a window before we consider a workflow. */
const MIN_RUNS_FOR_SIGNAL = 3;

if (!GITHUB_TOKEN) {
  console.error('Missing required environment variable: GITHUB_TOKEN');
  process.exit(1);
}

const GH_HEADERS = {
  Authorization: `Bearer ${GITHUB_TOKEN}`,
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function fetchJson(url) {
  const response = await fetch(url, { headers: GH_HEADERS });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`GitHub API error ${response.status} for ${url}: ${body}`);
  }
  return response.json();
}

async function postJson(url, payload) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { ...GH_HEADERS, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`GitHub API POST error ${response.status} for ${url}: ${body}`);
  }
  return response.json();
}

/**
 * ISO week boundaries (Monday 00:00:00 UTC → Sunday 23:59:59 UTC).
 * @param {number} weeksAgo  0 = current ISO week, 1 = prior week, …
 */
function weekWindow(weeksAgo = 0) {
  const now = new Date();
  // getDay() returns 0=Sun,1=Mon,…; normalise to Mon=0
  const dayOfWeek = (now.getUTCDay() + 6) % 7;
  const monday = new Date(now);
  monday.setUTCDate(now.getUTCDate() - dayOfWeek - weeksAgo * 7);
  monday.setUTCHours(0, 0, 0, 0);
  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);
  sunday.setUTCHours(23, 59, 59, 999);
  return { start: monday.toISOString(), end: sunday.toISOString() };
}

/** Compute the median of an array of numbers. */
function median(values) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

// ---------------------------------------------------------------------------
// GitHub API
// ---------------------------------------------------------------------------

/**
 * List all workflows in the repository.
 * @returns {Promise<Array<{id:number, name:string, path:string}>>}
 */
async function listWorkflows() {
  const url = `https://api.github.com/repos/${ORG}/${REPO}/actions/workflows?per_page=100`;
  const data = await fetchJson(url);
  return data.workflows || [];
}

/**
 * Fetch completed workflow runs for a given workflow within a time window.
 * Pages through up to 5 pages (500 runs max) to keep API usage bounded.
 *
 * @param {number} workflowId
 * @param {string} created  GitHub `created` filter — e.g. "2026-04-28..2026-05-04"
 * @returns {Promise<Array<{durationSeconds:number}>>}
 */
async function fetchRunsInWindow(workflowId, created) {
  const runs = [];
  let page = 1;
  const maxPages = 5;

  while (page <= maxPages) {
    const url =
      `https://api.github.com/repos/${ORG}/${REPO}/actions/workflows/${workflowId}/runs` +
      `?status=completed&created=${encodeURIComponent(created)}&per_page=100&page=${page}`;
    const data = await fetchJson(url);
    const batch = data.workflow_runs || [];
    if (!batch.length) break;

    for (const run of batch) {
      if (!run.run_started_at || !run.updated_at) continue;
      const started = new Date(run.run_started_at).getTime();
      const ended = new Date(run.updated_at).getTime();
      const durationSeconds = Math.round((ended - started) / 1000);
      if (durationSeconds > 0) runs.push({ durationSeconds });
    }

    if (batch.length < 100) break;
    page++;
  }

  return runs;
}

/**
 * Build the GitHub `created` range filter string for a window.
 */
function createdFilter(window) {
  // Strip the time/timezone so the filter only contains dates (API requirement).
  const start = window.start.slice(0, 10);
  const end = window.end.slice(0, 10);
  return `${start}..${end}`;
}

// ---------------------------------------------------------------------------
// Regression detection & GitHub issues
// ---------------------------------------------------------------------------

/**
 * Check if a regression issue for this workflow already exists (open) to avoid
 * creating duplicate issues on repeated runs.
 *
 * @param {string} workflowName
 * @returns {Promise<boolean>}
 */
async function regressionIssueExists(workflowName) {
  const url =
    `https://api.github.com/repos/${ORG}/${REPO}/issues` +
    `?state=open&labels=ci-regression&per_page=100`;
  let data;
  try {
    data = await fetchJson(url);
  } catch {
    return false;
  }
  const issues = Array.isArray(data) ? data : [];
  return issues.some(i => i.title.includes(workflowName));
}

/**
 * Open a GitHub issue for a detected runtime regression.
 */
async function createRegressionIssue({ workflowName, workflowPath, priorMedianSec, currentMedianSec, pctChange }) {
  const title = `[CI Regression] Workflow runtime regression: ${workflowName}`;
  const priorMin = (priorMedianSec / 60).toFixed(1);
  const currentMin = (currentMedianSec / 60).toFixed(1);
  const body = [
    `## CI Runtime Regression Detected`,
    '',
    `**Workflow:** \`${workflowName}\` (\`${workflowPath}\`)`,
    `**Prior-week median:** ${priorMin} min (${priorMedianSec}s)`,
    `**Current-week median:** ${currentMin} min (${currentMedianSec}s)`,
    `**Change:** +${pctChange.toFixed(1)}% slower`,
    '',
    `### What to do`,
    `1. Review recent commits merged this week that touch \`${workflowPath}\` or its dependencies.`,
    `2. Check whether a new job step, larger matrix, or flaky retry is responsible.`,
    `3. If the increase is intentional, close this issue with a note explaining why.`,
    `4. If unintentional, optimise the workflow and confirm the next weekly report shows improvement.`,
    '',
    `_Opened automatically by the [CI Runtime Telemetry workflow](https://github.com/${ORG}/${REPO}/actions/workflows/track-ci-runtime.yml) — threshold: ≥${REGRESSION_THRESHOLD_PCT}% regression._`,
  ].join('\n');

  await postJson(`https://api.github.com/repos/${ORG}/${REPO}/issues`, {
    title,
    body,
    labels: ['ci-regression', 'engineering'],
  });
  console.log(`  ↳ Opened issue: ${title}`);
}

// ---------------------------------------------------------------------------
// CSV archival
// ---------------------------------------------------------------------------

/**
 * Append a row per workflow to the CSV history file.
 */
async function writeCsv(rows) {
  const fs = await import('fs/promises');
  const path = await import('path');
  const csvPath = path.resolve('ci-runtime-history.csv');

  let needsHeader = false;
  try {
    await fs.access(csvPath);
  } catch {
    needsHeader = true;
  }

  const lines = [];
  if (needsHeader) {
    lines.push('timestamp,workflow_name,workflow_path,current_week_start,prior_week_start,current_median_sec,prior_median_sec,current_run_count,prior_run_count,pct_change');
  }
  const timestamp = new Date().toISOString();
  for (const row of rows) {
    lines.push(
      [
        timestamp,
        `"${row.workflowName.replace(/"/g, '""')}"`,
        `"${row.workflowPath.replace(/"/g, '""')}"`,
        row.currentWeekStart,
        row.priorWeekStart,
        row.currentMedianSec,
        row.priorMedianSec,
        row.currentRunCount,
        row.priorRunCount,
        row.pctChange !== null ? row.pctChange.toFixed(2) : 'N/A',
      ].join(','),
    );
  }
  await fs.appendFile(csvPath, lines.join('\n') + '\n', 'utf8');
  console.log(`CSV updated: ${csvPath} (+${rows.length} rows)`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const currentWindow = weekWindow(0);
  const priorWindow = weekWindow(1);

  console.log(`Current week : ${currentWindow.start.slice(0, 10)} → ${currentWindow.end.slice(0, 10)}`);
  console.log(`Prior week   : ${priorWindow.start.slice(0, 10)} → ${priorWindow.end.slice(0, 10)}`);

  const workflows = await listWorkflows();
  console.log(`Found ${workflows.length} workflows.`);

  /** @type {Array<object>} */
  const csvRows = [];
  /** @type {Array<object>} */
  const regressions = [];

  for (const wf of workflows) {
    process.stdout.write(`  ${wf.name} … `);

    const [currentRuns, priorRuns] = await Promise.all([
      fetchRunsInWindow(wf.id, createdFilter(currentWindow)),
      fetchRunsInWindow(wf.id, createdFilter(priorWindow)),
    ]);

    const currentMedianSec = median(currentRuns.map(r => r.durationSeconds));
    const priorMedianSec = median(priorRuns.map(r => r.durationSeconds));

    let pctChange = null;
    if (priorMedianSec > 0) {
      pctChange = ((currentMedianSec - priorMedianSec) / priorMedianSec) * 100;
    }

    const trend = pctChange !== null
      ? `${pctChange >= 0 ? '+' : ''}${pctChange.toFixed(1)}%`
      : 'n/a';

    console.log(
      `current=${currentMedianSec}s (n=${currentRuns.length}), ` +
      `prior=${priorMedianSec}s (n=${priorRuns.length}), trend=${trend}`,
    );

    csvRows.push({
      workflowName: wf.name,
      workflowPath: wf.path,
      currentWeekStart: currentWindow.start.slice(0, 10),
      priorWeekStart: priorWindow.start.slice(0, 10),
      currentMedianSec,
      priorMedianSec,
      currentRunCount: currentRuns.length,
      priorRunCount: priorRuns.length,
      pctChange,
    });

    if (
      pctChange !== null &&
      pctChange >= REGRESSION_THRESHOLD_PCT &&
      currentRuns.length >= MIN_RUNS_FOR_SIGNAL &&
      priorRuns.length >= MIN_RUNS_FOR_SIGNAL
    ) {
      regressions.push({ workflowName: wf.name, workflowPath: wf.path, priorMedianSec, currentMedianSec, pctChange });
    }
  }

  // Persist CSV history
  await writeCsv(csvRows);

  // Surface regressions as GitHub issues
  if (regressions.length === 0) {
    console.log('\n✅ No workflow runtime regressions detected this week.');
  } else {
    console.log(`\n⚠️  ${regressions.length} regression(s) detected — opening GitHub issues…`);
    for (const reg of regressions) {
      const alreadyOpen = await regressionIssueExists(reg.workflowName);
      if (alreadyOpen) {
        console.log(`  ↳ Issue already open for "${reg.workflowName}" — skipping.`);
        continue;
      }
      await createRegressionIssue(reg);
    }
  }

  // Print a summary table to the job log
  console.log('\n--- CI Runtime Summary ---');
  console.log(
    'Workflow'.padEnd(45) +
    'Current (s)'.padStart(12) +
    'Prior (s)'.padStart(11) +
    'Trend'.padStart(9),
  );
  console.log('-'.repeat(77));
  for (const row of csvRows) {
    const trend = row.pctChange !== null
      ? `${row.pctChange >= 0 ? '+' : ''}${row.pctChange.toFixed(1)}%`
      : 'n/a';
    console.log(
      row.workflowName.slice(0, 44).padEnd(45) +
      String(row.currentMedianSec).padStart(12) +
      String(row.priorMedianSec).padStart(11) +
      trend.padStart(9),
    );
  }

  process.exit(0);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
