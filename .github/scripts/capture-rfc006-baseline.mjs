#!/usr/bin/env node
// capture-rfc006-baseline.mjs
// Queries the GitHub REST API for RFC-006 Phase 0 baseline metrics and writes
// docs/rfc/RFC-006-baseline-metrics.md.
//
// Run via workflow_dispatch on rfc006-baseline-capture.yml, or locally:
//   GH_TOKEN=<pat> node .github/scripts/capture-rfc006-baseline.mjs
//
// RFC-006 Phase 0 §14 — "Baseline dashboard exists" exit criterion.

import { writeFileSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import { fileURLToPath } from 'url';

const OWNER = 'Latimer-Woods-Tech';
const REPO = 'Factory';
const OUTPUT_PATH = new URL('../../docs/rfc/RFC-006-baseline-metrics.md', import.meta.url);

const { GH_TOKEN } = process.env;
if (!GH_TOKEN) throw new Error('GH_TOKEN required');

const BASE = 'https://api.github.com';

async function ghGet(path, params = {}) {
  const url = new URL(`${BASE}${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
  const res = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${GH_TOKEN}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'factory-rfc006-baseline',
    },
  });
  if (!res.ok) {
    throw new Error(`GET ${path} → ${res.status} ${res.statusText}`);
  }
  return res.json();
}

async function countIssuesByLabel(label) {
  const data = await ghGet(`/search/issues`, {
    q: `repo:${OWNER}/${REPO} is:open is:issue label:${label}`,
    per_page: 1,
  });
  return data.total_count ?? 0;
}

async function countIssuesUnlabeled() {
  // Total open issues minus issues with any status:* label
  const [total, withStatus] = await Promise.all([
    ghGet(`/search/issues`, { q: `repo:${OWNER}/${REPO} is:open is:issue`, per_page: 1 }),
    ghGet(`/search/issues`, {
      q: `repo:${OWNER}/${REPO} is:open is:issue label:status:intake,status:ready,status:in_progress,status:in_review,status:blocked,status:verifying,status:done,status:cancelled`,
      per_page: 1,
    }),
  ]);
  return Math.max(0, (total.total_count ?? 0) - (withStatus.total_count ?? 0));
}

async function countPRs(extra = '') {
  const data = await ghGet(`/search/issues`, {
    q: `repo:${OWNER}/${REPO} is:open is:pr${extra ? ' ' + extra : ''}`,
    per_page: 1,
  });
  return data.total_count ?? 0;
}

async function main() {
  console.log('[info] Capturing RFC-006 Phase 0 baseline metrics...');
  const timestamp = new Date().toISOString();

  // Issue label counts — run in parallel to stay within rate limits
  const [
    intake,
    ready,
    inProgress,
    inReview,
    blocked,
    verifying,
    done,
    cancelled,
  ] = await Promise.all([
    countIssuesByLabel('status:intake'),
    countIssuesByLabel('status:ready'),
    countIssuesByLabel('status:in_progress'),
    countIssuesByLabel('status:in_review'),
    countIssuesByLabel('status:blocked'),
    countIssuesByLabel('status:verifying'),
    countIssuesByLabel('status:done'),
    countIssuesByLabel('status:cancelled'),
  ]);

  const unlabeled = await countIssuesUnlabeled();
  const totalIssues = intake + ready + inProgress + inReview + blocked + verifying + done + cancelled + unlabeled;

  // PR counts — snapshot PRs are chore(*) bot-authored
  const [totalPRs, snapshotPRs] = await Promise.all([
    countPRs(),
    countPRs('author:github-actions[bot] OR author:factory-cross-repo[bot]'),
  ]);
  const implPRs = Math.max(0, totalPRs - snapshotPRs);

  console.log(`[ok] Issues: intake=${intake} ready=${ready} in_progress=${inProgress} in_review=${inReview} blocked=${blocked} verifying=${verifying} done=${done} cancelled=${cancelled} unlabeled=${unlabeled} total=${totalIssues}`);
  console.log(`[ok] PRs: total=${totalPRs} impl=${implPRs} snapshot=${snapshotPRs}`);

  const markdown = `# RFC-006 Phase 0 Baseline Metrics

*Captured: ${timestamp}*
*Purpose: 14-day observation window baseline. Compare after Phase 1 enforcement.*

## Issue state distribution

| Status | Count |
|---|---:|
| status:intake | ${intake} |
| status:ready | ${ready} |
| status:in_progress | ${inProgress} |
| status:in_review | ${inReview} |
| status:blocked | ${blocked} |
| status:verifying | ${verifying} |
| status:done | ${done} |
| status:cancelled | ${cancelled} |
| (unlabeled) | ${unlabeled} |
| **Total open** | **${totalIssues}** |

## PR queue

| Metric | Count |
|---|---:|
| Open PRs total | ${totalPRs} |
| Open impl PRs (non-snapshot, non-chore) | ${implPRs} |
| Open snapshot PRs | ${snapshotPRs} |

## Key Phase 0 exit criteria status

- [ ] \`In Progress\` items all have valid owner/lease or review artifact
- [ ] All blockers have type, owner, next action
- [ ] Duplicate cleanup: survivor records for all closed duplicates
- [x] Snapshot PR backlog older than 24h = zero — 19 stale snapshot PRs closed 2026-06-11
- [ ] Project auto-archive enabled — run \`setup-project-autoarchive.yml\` and follow manual UI step
- [x] Baseline dashboard captured — this document

## Notes

- \`status:*\` labels were added by RFC-006 Phase 0 (setup-project-status-options bootstrap).
  The high \`unlabeled\` count reflects issues created before labels were provisioned.
- \`status:in_progress\` count reflects issues carrying that label, which includes Sentry-mirrored
  issues claimed by the supervisor loop — many lack an explicit human lease. Phase 2 enforces leases.
- Snapshot PR count reflects bot-authored PRs. After the stale drain on 2026-06-11, new snapshot
  PRs created by workflows are not stale and are excluded from the drain target.

## Next check-in

Compare these numbers after 14 days (by 2026-06-25) before promoting Phase 1 to enforce mode.
`;

  const outPath = fileURLToPath(OUTPUT_PATH);
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, markdown, 'utf8');
  console.log(`[ok] Wrote ${outPath}`);
}

main().catch(err => { console.error(err); process.exit(1); });
