#!/usr/bin/env node
/**
 * sync-renders.mjs — pull completed render streamUids into both manifests.
 *
 * Usage:
 *   node scripts/sync-renders.mjs [--limit 20] [--repo Latimer-Woods-Tech/Factory]
 *
 * What it does:
 *   1. Lists recent successful render-video.yml workflow runs
 *   2. For each run, reads inputs.brief_key + inputs.job_id
 *   3. Fetches the schedule-worker job to get the streamUid
 *   4. Updates apps/video-studio/render-manifest.json with new entries
 *   5. Prints a HumanDesign/client/data/video-manifest.js patch for copy/paste
 *      (HumanDesign lives in a sibling repo — script prints rather than mutates)
 *
 * Auth: reads WORKER_API_TOKEN from GCP SM. Requires gcloud CLI + gh CLI.
 */

import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';

const SCHEDULE_WORKER_URL = 'https://schedule.latwoodtech.work';
const GCP_PROJECT = 'factory-495015';
const MANIFEST_PATH = resolve(import.meta.dirname, '../apps/video-studio/render-manifest.json');

const { values } = parseArgs({
  args: process.argv.slice(2),
  options: {
    limit:  { type: 'string',  default: '20' },
    repo:   { type: 'string',  default: 'Latimer-Woods-Tech/Factory' },
    commit: { type: 'boolean', default: false },
  },
  allowPositionals: false,
});

const LIMIT  = parseInt(values['limit'], 10);
const REPO   = values['repo'];
const COMMIT = values['commit'];

// ---------------------------------------------------------------------------
// 1. Auth
// ---------------------------------------------------------------------------

let workerApiToken;
try {
  workerApiToken = execSync(
    `gcloud secrets versions access latest --secret=WORKER_API_TOKEN --project=${GCP_PROJECT}`,
    { encoding: 'utf8' },
  ).replace(/[\r\n﻿]/g, '');
} catch {
  console.error('Cannot read WORKER_API_TOKEN from GCP SM. Run: gcloud auth application-default login');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// 2. Fetch recent successful render runs from GitHub
// ---------------------------------------------------------------------------

const runsRaw = execSync(
  `gh run list --workflow render-video.yml --status success --limit ${LIMIT} --repo ${REPO} --json databaseId,conclusion,updatedAt`,
  { encoding: 'utf8' },
);
const runs = JSON.parse(runsRaw);

if (runs.length === 0) {
  console.log('No successful render runs found.');
  process.exit(0);
}

console.log(`\nFound ${runs.length} successful render run(s). Fetching inputs...\n`);

// ---------------------------------------------------------------------------
// 3. For each run, get inputs
// ---------------------------------------------------------------------------

const renders = [];

for (const run of runs) {
  let runDetails;
  try {
    runDetails = JSON.parse(
      execSync(`gh run view ${run.databaseId} --repo ${REPO} --json databaseId,jobs`, { encoding: 'utf8' }),
    );
  } catch {
    continue;
  }

  // Extract inputs from the job steps or trigger event
  const triggerRaw = execSync(
    `gh api /repos/${REPO}/actions/runs/${run.databaseId}`,
    { encoding: 'utf8' },
  ).trim();

  let inputs = {};
  try { inputs = JSON.parse(triggerRaw).inputs ?? {}; } catch { continue; }

  const briefKey = inputs.brief_key;
  const jobId    = inputs.job_id;
  if (!briefKey || !jobId) continue;

  renders.push({ databaseId: run.databaseId, briefKey, jobId, updatedAt: run.updatedAt });
}

if (renders.length === 0) {
  console.log('No renders with brief_key found in recent runs.');
  process.exit(0);
}

console.log(`Fetching streamUids for ${renders.length} render(s)...\n`);

// ---------------------------------------------------------------------------
// 4. Fetch streamUid from schedule-worker for each job
// ---------------------------------------------------------------------------

const now = new Date().toISOString().slice(0, 10);
const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));
const streamAccount = manifest.streamAccount;

const newEntries = {};

for (const { briefKey, jobId, updatedAt } of renders) {
  if (manifest.videos[briefKey]?.streamUid) {
    console.log(`  ${briefKey}: already in manifest (${manifest.videos[briefKey].streamUid}) — skipping`);
    continue;
  }

  const res = await fetch(`${SCHEDULE_WORKER_URL}/jobs/${jobId}`, {
    headers: { Authorization: `Bearer ${workerApiToken}` },
  });

  if (!res.ok) {
    console.warn(`  ${briefKey}: schedule-worker returned ${res.status} — skipping`);
    continue;
  }

  const data = await res.json();
  const job = data.data ?? data;
  const streamUid = job.streamUid;

  if (!streamUid) {
    console.log(`  ${briefKey}: no streamUid yet (status: ${job.status})`);
    continue;
  }

  // Read brief to get forge + composition
  let forge = 'self';
  let composition = 'EnergyBlueprintVideo';
  try {
    const briefPath = resolve(import.meta.dirname, `../apps/video-studio/content-briefs/prime-self/${briefKey}.json`);
    const brief = JSON.parse(readFileSync(briefPath, 'utf8'));
    forge = brief.forge ?? brief.forgeTheme ?? 'self';
    composition = brief.composition ?? 'EnergyBlueprintVideo';
  } catch { /* ignore missing brief */ }

  const renderedAt = updatedAt.slice(0, 10);
  newEntries[briefKey] = { streamUid, renderedAt, lastValidated: now, forge, composition };
  console.log(`  ✅ ${briefKey}: streamUid=${streamUid} forge=${forge}`);
}

if (Object.keys(newEntries).length === 0) {
  console.log('\nNothing new to add to the manifest.');
  process.exit(0);
}

// ---------------------------------------------------------------------------
// 5. Update render-manifest.json
// ---------------------------------------------------------------------------

for (const [key, entry] of Object.entries(newEntries)) {
  manifest.videos[key] = {
    streamUid:     entry.streamUid,
    renderedAt:    entry.renderedAt,
    lastValidated: entry.lastValidated,
    forge:         entry.forge,
    composition:   entry.composition,
  };
}

writeFileSync(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
console.log(`\n✅ Updated render-manifest.json with ${Object.keys(newEntries).length} new entry(s).`);

// ---------------------------------------------------------------------------
// 6. Print HumanDesign video-manifest.js patch
// ---------------------------------------------------------------------------

console.log('\n─────────────────────────────────────────────────────');
console.log('Add these entries to HumanDesign/client/data/video-manifest.js:');
console.log('─────────────────────────────────────────────────────\n');

const CF_STREAM = `https://customer-op4b8eq1uv0ciwqy.cloudflarestream.com`;

for (const [briefKey, entry] of Object.entries(newEntries)) {
  const gateNum = parseInt(briefKey.replace('gate-concept-', ''), 10);
  if (!gateNum) continue;

  console.log(`  // Gate ${gateNum} — ${entry.forge}`);
  console.log(`  ${gateNum}: {`);
  console.log(`    streamUid: '${entry.streamUid}',`);
  console.log(`    forge: '${entry.forge}',`);
  console.log(`    variants: [`);
  console.log(`      { id: 'gift',     label: '✦ Gift',     streamUid: '${entry.streamUid}', prompt: 'Does this land? Drop a ✦ if this is you.',                active: true },`);
  console.log(`      { id: 'shadow',   label: '◈ Shadow',   streamUid: null, prompt: 'Caught yourself here before? Tell me where.' },`);
  console.log(`      { id: 'practice', label: '◉ Practice', streamUid: null, prompt: 'Try it today. Come back and tell me what shifted.' },`);
  console.log(`      { id: 'mirror',   label: '◎ Mirror',   streamUid: null, prompt: 'Who in your life does this explain? Tag the feeling.' },`);
  console.log(`    ],`);
  console.log(`    participationPrompt: 'Does this land? Drop a ✦ if this is you.',`);
  console.log(`  },`);
}

// ---------------------------------------------------------------------------
// 7. Optionally commit render-manifest.json
// ---------------------------------------------------------------------------

if (COMMIT) {
  try {
    execSync('git add apps/video-studio/render-manifest.json', { stdio: 'inherit' });
    const keys = Object.keys(newEntries).join(', ');
    execSync(`git commit -m "chore(video): sync render-manifest — ${keys}"`, { stdio: 'inherit' });
    console.log('\n✅ Committed render-manifest.json update.');
  } catch (err) {
    console.warn('\nCommit failed (maybe nothing staged?):', err.message);
  }
}
