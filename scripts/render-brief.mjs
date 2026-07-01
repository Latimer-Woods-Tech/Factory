#!/usr/bin/env node
/**
 * render-brief.mjs — one-command render trigger for a named content brief.
 *
 * Usage:
 *   node scripts/render-brief.mjs <brief_key> [--app prime-self] [--repo Latimer-Woods-Tech/Factory]
 *
 * Examples:
 *   node scripts/render-brief.mjs gate-concept-2
 *   node scripts/render-brief.mjs gate-concept-3 --app prime-self
 *
 * What it does:
 *   1. Reads apps/video-studio/content-briefs/{app}/{brief_key}.json for metadata
 *   2. POSTs to schedule.latwoodtech.work/jobs to create a job_id
 *   3. Dispatches render-video.yml with that job_id + brief metadata
 *
 * Auth: reads WORKER_API_TOKEN from GCP Secret Manager (factory-495015).
 *       Requires `gcloud` CLI to be authenticated.
 */

import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { patchAssets } from '../apps/video-studio/scripts/video-registry/patch.mjs';

const SCHEDULE_WORKER_URL = 'https://schedule.latwoodtech.work';
const GCP_PROJECT = 'factory-495015';
const REPO = 'Latimer-Woods-Tech/Factory';

// ---------------------------------------------------------------------------
// Args
// ---------------------------------------------------------------------------

const { positionals, values } = parseArgs({
  args: process.argv.slice(2),
  options: {
    app:  { type: 'string', default: 'prime-self' },
    repo: { type: 'string', default: REPO },
    ref:  { type: 'string' },   // git ref the cloud render checks out the brief from (default: repo default branch)
    'dry-run': { type: 'boolean', default: false },
  },
  allowPositionals: true,
});

const briefKey = positionals[0];
if (!briefKey) {
  console.error('Usage: node scripts/render-brief.mjs <brief_key> [--app prime-self]');
  process.exit(1);
}

const appSlug  = values['app'];
const repoName = values['repo'];
const dryRun   = values['dry-run'];

// ---------------------------------------------------------------------------
// 1. Read brief
// ---------------------------------------------------------------------------

const briefPath = resolve(
  import.meta.dirname,
  `../apps/video-studio/content-briefs/${appSlug}/${briefKey}.json`,
);

let brief;
try {
  brief = JSON.parse(readFileSync(briefPath, 'utf8'));
} catch {
  console.error(`Brief not found: ${briefPath}`);
  process.exit(1);
}

const {
  appId        = appSlug.replace(/-/g, '_'),
  topic        = brief.title ?? briefKey,
  composition  = brief.composition ?? 'EnergyBlueprintVideo',
  forgeTheme   = brief.forge ?? brief.forgeTheme ?? 'self',
  brand_color  = brief.brandColor ?? '#6366f1',
  brand_accent = brief.brandAccent ?? '#a5b4fc',
} = brief;

console.log(`\n📼  Rendering: ${briefKey}`);
console.log(`    App:         ${appId}`);
console.log(`    Topic:       ${topic}`);
console.log(`    Composition: ${composition}`);
console.log(`    Forge:       ${forgeTheme}`);
if (dryRun) console.log('    [DRY RUN — skipping API calls]\n');

// ---------------------------------------------------------------------------
// 2. Fetch WORKER_API_TOKEN from GCP SM
// ---------------------------------------------------------------------------

let workerApiToken = process.env.WORKER_API_TOKEN;   // env-first: lets batch callers pre-fetch once
try {
  if (!workerApiToken) workerApiToken = execSync(
    `gcloud secrets versions access latest --secret=WORKER_API_TOKEN --project=${GCP_PROJECT}`,
    { encoding: 'utf8' },
  ).replace(/[\r\n﻿]/g, '');
} catch (err) {
  console.error('Failed to read WORKER_API_TOKEN from GCP Secret Manager.');
  console.error('Run: gcloud auth application-default login');
  console.error(err.message);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// 3. POST /jobs to schedule-worker
// ---------------------------------------------------------------------------

let jobId;
if (dryRun) {
  jobId = 'dry-run-job-id';
} else {
  const res = await fetch(`${SCHEDULE_WORKER_URL}/jobs`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization:  `Bearer ${workerApiToken}`,
    },
    body: JSON.stringify({
      appId,
      type:          composition === 'TrainingVideo' ? 'training' : composition === 'WalkthroughVideo' ? 'walkthrough' : 'marketing',
      topic,
      triggerSource: 'manual',
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    console.error(`schedule-worker /jobs failed: ${res.status}\n${body}`);
    process.exit(1);
  }

  const data = await res.json();
  jobId = data.data?.id ?? data.job?.id ?? data.id;
  if (!jobId) {
    console.error('No job id in response:', JSON.stringify(data));
    process.exit(1);
  }
}

console.log(`\n✅  Job created: ${jobId}`);

// ---------------------------------------------------------------------------
// 4. Dispatch render-video.yml
// ---------------------------------------------------------------------------

const ghArgs = [
  `--repo ${repoName}`,
  ...(values.ref ? [`--ref ${values.ref}`] : []),
  `-f job_id=${jobId}`,
  `-f composition_id=${composition}`,
  `-f app_id=${appId}`,
  `-f topic=${JSON.stringify(topic)}`,
  `-f brief_key=${briefKey}`,
  `-f forge_theme=${forgeTheme}`,
  `-f brand_color=${brand_color}`,
  `-f brand_accent=${brand_accent}`,
].join(' ');

const cmd = `gh workflow run render-video.yml ${ghArgs}`;

if (dryRun) {
  console.log(`\n[DRY RUN] Would run:\n  ${cmd}\n`);
} else {
  execSync(cmd, { stdio: 'inherit' });
  console.log(`\n🚀  Workflow dispatched for job ${jobId}.`);
  console.log(`    Track at: https://github.com/${repoName}/actions/workflows/render-video.yml`);
  // Registry write-back: mark this brief's asset(s) rendering. On completion run
  // `node apps/video-studio/scripts/video-registry/sync.mjs ${briefKey} --stream <uid>`.
  const mark = (a) => {
    a.build.status = 'rendering';
    a.build.renderJobId = jobId;
    a.build.workflowRun = `https://github.com/${repoName}/actions/workflows/render-video.yml`;
  };
  // A render produces ONE clip for the brief's primary (gift) variant; only mark
  // that asset (fall back to the single asset for variant-less briefs).
  const patched = patchAssets(`${briefKey}--gift`, mark) || patchAssets(briefKey, mark);
  if (patched) console.log(`    Registry: ${patched} asset(s) marked rendering (job ${jobId}).`);
  console.log(`    Once complete, copy streamUid into client/data/video-manifest.js gate ${briefKey.replace('gate-concept-', '')}.\n`);
}
