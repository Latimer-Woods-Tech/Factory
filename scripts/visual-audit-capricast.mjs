#!/usr/bin/env node
/**
 * Runs visual-review + audit against Capricast's key public pages via the
 * Browser Agent Cloud Run service. Called by visual-audit-capricast.yml.
 *
 * Env vars:
 *   BROWSER_AGENT_URL   – Cloud Run service URL (no trailing slash)
 *   BROWSER_AGENT_TOKEN – Google ID token with aud=BROWSER_AGENT_URL
 *   FAIL_ON_CRITICAL    – "true" (default) exits 1 when critical findings found
 */

import { writeFileSync } from 'node:fs';

const AGENT_URL = (process.env['BROWSER_AGENT_URL'] ?? '').replace(/\/$/, '');
const TOKEN = process.env['BROWSER_AGENT_TOKEN'] ?? '';
const FAIL_ON_CRITICAL = process.env['FAIL_ON_CRITICAL'] !== 'false';

if (!AGENT_URL) { console.error('BROWSER_AGENT_URL is required'); process.exit(1); }
if (!TOKEN)     { console.error('BROWSER_AGENT_TOKEN is required'); process.exit(1); }

// Pages to audit — public pages only; authenticated pages need a test JWT.
const PAGES = [
  {
    slug: 'home',
    url: 'https://capricast.com/',
    rubric: [
      'Identify broken layout, missing hero image, or unstyled flashes.',
      'Check that navigation links are visible and readable on both viewports.',
      'Look for placeholder or lorem-ipsum copy.',
      'Identify color contrast issues that hurt readability.',
      'Verify that the video feed or featured content section renders without errors.',
    ],
    runAxe: true,
  },
  {
    slug: 'watch',
    url: 'https://capricast.com/watch/7646228e-f046-43fa-92eb-ef2bef7ecab7',
    rubric: [
      'Check that the video player renders and is not a blank/broken element.',
      'Verify that video title and metadata (author, date) are present and readable.',
      'Look for layout issues around the player on mobile viewport.',
      'Check that related/recommended video section is present.',
      'Identify any console-driven loading errors visible in the UI.',
    ],
    runAxe: true,
  },
  {
    slug: 'conference',
    url: 'https://capricast.com/conference/visual-audit-review-3b6d0467',
    rubric: [
      'Check that the conference room UI renders correctly — participant grid, controls bar, chat panel.',
      'Verify that the join/start button is visible and clearly labeled.',
      'Look for layout issues on mobile viewport — controls should not overlap video areas.',
      'Check for any placeholder text, broken icons, or unfinished UI elements.',
      'Identify accessibility issues: missing button labels, poor contrast on controls.',
    ],
    runAxe: true,
  },
];

async function postJson(endpoint, body) {
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(120_000),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => String(res.status));
    throw new Error(`Browser Agent ${res.status}: ${text}`);
  }
  return res.json();
}

let overallCritical = 0;
const summaries = [];

for (const page of PAGES) {
  console.log(`\n▶ Auditing ${page.slug}: ${page.url}`);
  const start = Date.now();

  let result;
  try {
    result = await postJson(`${AGENT_URL}/visual-review`, {
      url: page.url,
      rubric: page.rubric,
      runAxe: page.runAxe,
    });
  } catch (err) {
    console.error(`  ✗ Failed: ${err.message}`);
    summaries.push({ slug: page.slug, url: page.url, error: err.message });
    continue;
  }

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  const findings = result.review?.findings ?? [];
  const criticalCount = findings.filter(f => f.severity === 'critical').length;
  const highCount    = findings.filter(f => f.severity === 'high').length;
  const axeCount     = result.axeViolations?.length ?? 0;

  console.log(`  ✓ Done in ${elapsed}s`);
  console.log(`  Findings: critical=${criticalCount} high=${highCount} total=${findings.length}`);
  console.log(`  Axe violations: ${axeCount}`);
  if (result.consoleErrors.length > 0) console.log(`  Console errors: ${result.consoleErrors.length}`);
  if (result.pageErrors.length > 0)    console.log(`  Page errors: ${result.pageErrors.length}`);
  if (result.failedRequests.length > 0) console.log(`  Failed HTTP requests: ${result.failedRequests.length}`);

  if (findings.length > 0) {
    console.log('\n  Top findings:');
    for (const f of findings.slice(0, 5)) {
      const icon = f.severity === 'critical' ? '🔴' : f.severity === 'high' ? '🟠' : '🟡';
      console.log(`    ${icon} [${f.severity}/${f.viewport}] ${f.description}`);
    }
  }

  if (result.review?.summary) {
    console.log(`\n  Summary: ${result.review.summary}`);
  }

  overallCritical += criticalCount;

  const outPath = `/tmp/capricast-audit-${page.slug}.json`;
  writeFileSync(outPath, JSON.stringify(result, null, 2));
  console.log(`  Report saved: ${outPath}`);

  summaries.push({
    slug: page.slug,
    url: page.url,
    elapsedSeconds: parseFloat(elapsed),
    findings: { critical: criticalCount, high: highCount, total: findings.length },
    axeViolations: axeCount,
    consoleErrors: result.consoleErrors.length,
    pageErrors: result.pageErrors.length,
    failedRequests: result.failedRequests.length,
    summary: result.review?.summary ?? null,
  });
}

console.log('\n═══ Capricast Visual Audit Summary ═══');
for (const s of summaries) {
  if (s.error) {
    console.log(`  ${s.slug}: ERROR — ${s.error}`);
  } else {
    const status = s.findings.critical > 0 ? '🔴 CRITICAL' : s.findings.high > 0 ? '🟠 HIGH' : '✅ PASS';
    console.log(`  ${s.slug}: ${status} (critical=${s.findings.critical} high=${s.findings.high} axe=${s.axeViolations})`);
  }
}

if (FAIL_ON_CRITICAL && overallCritical > 0) {
  console.error(`\n✗ ${overallCritical} critical finding(s) found — failing build.`);
  process.exit(1);
}

console.log('\n✓ Audit complete.');
