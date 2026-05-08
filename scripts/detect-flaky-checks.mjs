#!/usr/bin/env node

/**
 * Flaky check detector for the Factory repository.
 *
 * A "flaky" check is one that fails on an initial attempt but passes on a
 * subsequent re-run of the same workflow run (run_attempt > 1 that ends with
 * conclusion = success while an earlier attempt ended with conclusion = failure).
 *
 * Algorithm:
 *   1. Fetch all workflow runs completed in the past 7 days.
 *   2. Group by (workflow_id, head_sha) to find runs with multiple attempts.
 *   3. A flaky hit is recorded when the highest run_attempt succeeded but at
 *      least one earlier attempt for the same (workflow, sha) failed.
 *   4. Aggregate by workflow name and emit a ranked markdown report.
 *
 * Outputs:
 *   - Writes report to REPORT_PATH (default: /tmp/flaky-check-report.md)
 *   - Prints the report to stdout
 *
 * This file is intentionally dependency-free so it can run in GitHub Actions
 * without any `npm install` step.
 *
 * NOTE: This is a Node.js CI automation script, not a Cloudflare Worker.
 * `process.env` and Node.js built-ins (fs) are permitted here — the
 * no-process-env / no-Node-built-ins constraints in the Standing Orders apply
 * to Worker packages only (see CLAUDE.md § Hard Constraints).
 * Existing repo scripts (track-delivery-metrics.mjs, generate-scorecard.mjs, …)
 * follow the same pattern.
 */

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const ORG = process.env.FLAKY_REPO_OWNER || 'Latimer-Woods-Tech';
const REPO = process.env.FLAKY_REPO_NAME || 'factory';
const LOOKBACK_DAYS = Number(process.env.LOOKBACK_DAYS || '7');
const REPORT_PATH = process.env.REPORT_PATH || 'flaky-check-report.md';

if (!GITHUB_TOKEN) {
  console.error('ERROR: GITHUB_TOKEN environment variable is required.');
  process.exit(1);
}

const BASE_HEADERS = {
  Authorization: `Bearer ${GITHUB_TOKEN}`,
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
};

/** Fetch a single paginated page; returns parsed JSON. */
async function fetchPage(url) {
  const resp = await fetch(url, { headers: BASE_HEADERS });
  if (!resp.ok) {
    const body = await resp.text().catch(() => '');
    throw new Error(`GitHub API ${resp.status} for ${url}: ${body}`);
  }
  return resp.json();
}

/**
 * Fetch all items from a paginated GitHub API endpoint.
 * Stops when items older than `since` are encountered (for run-based endpoints).
 */
async function fetchAllRuns(baseUrl, since) {
  const runs = [];
  let page = 1;
  // GitHub API max per_page is 100
  const PER_PAGE = 100;

  while (true) {
    const url = `${baseUrl}&per_page=${PER_PAGE}&page=${page}`;
    const data = await fetchPage(url);
    const items = data.workflow_runs ?? [];
    if (!items.length) break;

    let stop = false;
    for (const item of items) {
      if (new Date(item.created_at) < since) {
        stop = true;
        break;
      }
      runs.push(item);
    }
    if (stop || items.length < PER_PAGE) break;
    page++;
  }
  return runs;
}

/** Fetch all workflow runs for the repo created in the lookback window. */
async function getRecentRuns(since) {
  const url =
    `https://api.github.com/repos/${ORG}/${REPO}/actions/runs` +
    `?status=completed&created=>=${since.toISOString().slice(0, 10)}`;
  return fetchAllRuns(url, since);
}

/**
 * Detect flaky checks.
 *
 * Returns an array of flaky-hit objects:
 *   { workflowName, runId, headSha, headBranch, prNumber, url, failedAttempts, successAttempt }
 */
function detectFlaky(runs) {
  // Group by workflowId + headSha so we can compare attempts for the same job.
  const groups = new Map();
  for (const run of runs) {
    const key = `${run.workflow_id}::${run.head_sha}`;
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key).push(run);
  }

  const hits = [];

  for (const [, group] of groups) {
    // Sort ascending by run_attempt so we can reason about history.
    group.sort((a, b) => (a.run_attempt ?? 1) - (b.run_attempt ?? 1));

    const latest = group[group.length - 1];
    const earlierFailed = group.slice(0, -1).some(r => r.conclusion === 'failure');

    // Flaky = latest attempt succeeded, at least one earlier attempt failed.
    if (latest.conclusion === 'success' && earlierFailed) {
      const failedAttempts = group
        .filter(r => r.conclusion === 'failure')
        .map(r => r.run_attempt ?? 1);

      hits.push({
        workflowName: latest.name,
        runId: latest.id,
        headSha: latest.head_sha.slice(0, 7),
        headBranch: latest.head_branch ?? 'unknown',
        prNumber: latest.pull_requests?.[0]?.number ?? null,
        url: latest.html_url,
        failedAttempts,
        successAttempt: latest.run_attempt ?? group.length,
      });
    }
  }

  return hits;
}

/** Aggregate flaky hits by workflow name for the summary table. */
function aggregate(hits) {
  const byWorkflow = new Map();
  for (const hit of hits) {
    if (!byWorkflow.has(hit.workflowName)) {
      byWorkflow.set(hit.workflowName, { count: 0, hits: [] });
    }
    const entry = byWorkflow.get(hit.workflowName);
    entry.count++;
    entry.hits.push(hit);
  }
  // Sort descending by flake count.
  return [...byWorkflow.entries()].sort((a, b) => b[1].count - a[1].count);
}

/**
 * Return the ISO 8601 week number for a UTC date.
 *
 * ISO 8601 defines week 1 as the week that contains the year's first Thursday.
 * Weeks run Monday–Sunday. This matches `date -u +%V` on Linux.
 */
function isoWeekNumber(date) {
  // Work on a copy shifted to the nearest Thursday (ISO anchor day).
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  // Sunday = 0 in getUTCDay(), but ISO treats it as 7; shift to Monday-based.
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
}

/** Format a date range label like "2026-W18 (2026-04-27 – 2026-05-03)". */
function weekLabel(since, now) {
  const pad = n => String(n).padStart(2, '0');
  const iso = d => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  const weekNum = isoWeekNumber(now);
  return `${now.getUTCFullYear()}-W${pad(weekNum)} (${iso(since)} – ${iso(now)})`;
}

/** Build the full markdown report. */
function buildReport(hits, since, now) {
  const repoUrl = `https://github.com/${ORG}/${REPO}`;
  const week = weekLabel(since, now);
  const totalFlakeHits = hits.length;
  const aggregated = aggregate(hits);

  const lines = [
    `# 🔬 Flaky Check Report — ${week}`,
    '',
    `> **Repository:** [${ORG}/${REPO}](${repoUrl})  `,
    `> **Lookback:** last ${LOOKBACK_DAYS} days  `,
    `> **Generated:** ${now.toISOString()}  `,
    '',
    `## Summary`,
    '',
    totalFlakeHits === 0
      ? '✅ No flaky checks detected this week. All workflow runs that were re-run had consistent results.'
      : `**${totalFlakeHits}** flaky check hit${totalFlakeHits === 1 ? '' : 's'} detected across **${aggregated.length}** workflow${aggregated.length === 1 ? '' : 's'}.`,
    '',
  ];

  if (totalFlakeHits > 0) {
    // Summary table
    lines.push('## Flakiness Leaderboard', '');
    lines.push('| Rank | Workflow | Flake Hits | % of total |');
    lines.push('|------|----------|-----------|------------|');
    aggregated.forEach(([name, { count }], idx) => {
      const pct = Math.round((count / totalFlakeHits) * 100);
      lines.push(`| ${idx + 1} | \`${name}\` | ${count} | ${pct}% |`);
    });
    lines.push('');

    // Detail section per workflow
    lines.push('## Details by Workflow', '');
    for (const [name, { hits: wHits }] of aggregated) {
      lines.push(`### \`${name}\``, '');
      lines.push('| Run | Commit | Branch / PR | Failed attempts | Passed on attempt |');
      lines.push('|-----|--------|-------------|----------------|-------------------|');
      for (const h of wHits) {
        const pr = h.prNumber ? `[PR #${h.prNumber}](${repoUrl}/pull/${h.prNumber})` : h.headBranch;
        const failList = h.failedAttempts.join(', ');
        lines.push(
          `| [#${h.runId}](${h.url}) | \`${h.headSha}\` | ${pr} | ${failList} | ${h.successAttempt} |`,
        );
      }
      lines.push('');
    }

    // Remediation checklist
    lines.push('## Remediation Checklist', '');
    lines.push('For each flaky workflow listed above:');
    lines.push('');
    lines.push('- [ ] Review the failing job logs to identify the root cause');
    lines.push('- [ ] Determine whether the flakiness is due to: test isolation, timing, external dependency, or resource contention');
    lines.push('- [ ] Apply one or more fixes: add retry logic, improve test isolation, mock external calls, or increase timeouts');
    lines.push('- [ ] Add the workflow to a watchlist if flakiness recurs in the following week');
    lines.push('- [ ] Close this issue once all flaky workflows have been remediated or accepted as known');
    lines.push('');
  }

  lines.push('---');
  lines.push(`*Auto-generated by [detect-flaky-checks.mjs](${repoUrl}/blob/main/scripts/detect-flaky-checks.mjs) via [flaky-check-report.yml](${repoUrl}/blob/main/.github/workflows/flaky-check-report.yml).*`);

  return lines.join('\n');
}

async function main() {
  const now = new Date();
  const since = new Date(now.getTime() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000);

  console.log(`🔍 Scanning ${ORG}/${REPO} for flaky checks (last ${LOOKBACK_DAYS} days)…`);

  const runs = await getRecentRuns(since);
  console.log(`   Fetched ${runs.length} completed workflow run(s).`);

  const hits = detectFlaky(runs);
  console.log(`   Detected ${hits.length} flaky hit(s).`);

  const report = buildReport(hits, since, now);

  // Write report file so the workflow can read it back.
  const { writeFileSync } = await import('fs');
  writeFileSync(REPORT_PATH, report, 'utf8');
  console.log(`\n📝 Report written to ${REPORT_PATH}\n`);
  console.log(report);

  // Expose outputs for the GitHub Actions workflow.
  const outputFile = process.env.GITHUB_OUTPUT;
  if (outputFile) {
    const { appendFileSync } = await import('fs');
    appendFileSync(outputFile, `flaky_count=${hits.length}\n`);
    appendFileSync(outputFile, `workflow_count=${aggregate(hits).length}\n`);
  }
}

main().catch(err => {
  console.error('❌ FATAL:', err);
  process.exit(1);
});
