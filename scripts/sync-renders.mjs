#!/usr/bin/env node
/**
 * sync-renders.mjs — pull completed render streamUids into both manifests.
 *
 * Usage:
 *   node scripts/sync-renders.mjs [--limit 80] [--repo Latimer-Woods-Tech/Factory] [--commit]
 *
 * What it does:
 *   1. Lists recent successful render-video.yml workflow runs
 *   2. For each run, greps the logs for INPUT_BRIEF_KEY + STREAM_UID
 *   3. Skips briefKeys already in render-manifest.json
 *   4. Updates apps/video-studio/render-manifest.json with new entries
 *   5. Prints a HumanDesign/client/data/video-manifest.js patch (copy/paste)
 *
 * Auth: requires gh CLI (already authed) + gcloud optional (not needed here).
 */

import { execSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';

const GCP_PROJECT        = 'factory-495015';
const CF_STREAM_CUSTOMER = 'customer-op4b8eq1uv0ciwqy';
const MANIFEST_PATH = resolve(import.meta.dirname, '../apps/video-studio/render-manifest.json');
const BRIEFS_DIR    = resolve(import.meta.dirname, '../apps/video-studio/content-briefs');

const { values } = parseArgs({
  args: process.argv.slice(2),
  options: {
    limit:    { type: 'string',  default: '80' },
    repo:     { type: 'string',  default: 'Latimer-Woods-Tech/Factory' },
    commit:   { type: 'boolean', default: false },
    'hd-path': { type: 'string', default: '' },
  },
  allowPositionals: false,
});

const LIMIT   = Math.min(parseInt(values['limit'], 10), 100);
const REPO    = values['repo'];
const COMMIT  = values['commit'];

// Locate HumanDesign: try sibling-of-Factory (main checkout) first,
// then sibling-of-Factory-root for worktrees (.claude/worktrees/*/scripts).
function findHdPath(explicitPath) {
  if (explicitPath) return resolve(explicitPath);
  // Walk up from scripts/ looking for a GitHub directory
  const candidates = [
    resolve(import.meta.dirname, '../../HumanDesign'),           // main checkout
    resolve(import.meta.dirname, '../../../../../HumanDesign'),   // worktree
  ];
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  return candidates[0];
}

const HD_PATH = findHdPath(values['hd-path']);

// ---------------------------------------------------------------------------
// 1. Load manifest (skip already-known entries)
// ---------------------------------------------------------------------------

const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));
const alreadyKnown = new Set(Object.keys(manifest.videos));

// ---------------------------------------------------------------------------
// 2. List recent successful runs
// ---------------------------------------------------------------------------

console.log(`\nFetching up to ${LIMIT} recent successful render runs…`);

const runsRaw = execSync(
  `gh run list --workflow render-video.yml --status success --limit ${LIMIT} --repo ${REPO} --json databaseId,updatedAt`,
  { encoding: 'utf8' },
);
const runs = JSON.parse(runsRaw);

if (runs.length === 0) {
  console.log('No successful render runs found.');
  process.exit(0);
}

console.log(`Found ${runs.length} run(s). Scanning logs…\n`);

// ---------------------------------------------------------------------------
// 3. Grep logs for brief_key + stream_uid
// ---------------------------------------------------------------------------

function extractFromLogs(runId) {
  // Uses a targeted grep on the log output to avoid encoding issues on Windows.
  // The log step outputs are plain ASCII for the env-var echo lines we need.
  try {
    const log = execSync(
      `gh run view ${runId} --log --repo ${REPO}`,
      { encoding: 'latin1' },        // latin1 avoids the charmap crash on Windows
    );
    let briefKey = null;
    let streamUid = null;

    for (const line of log.split('\n')) {
      if (!briefKey && line.includes('INPUT_BRIEF_KEY:') && line.includes('gate-concept')) {
        const m = line.match(/INPUT_BRIEF_KEY:\s*(gate-concept-\d+)/);
        if (m) briefKey = m[1];
      }
      if (!streamUid && line.includes('Publish to Capricast') && line.includes('STREAM_UID:')) {
        const m = line.match(/STREAM_UID:\s*([a-f0-9]{32})/);
        if (m) streamUid = m[1];
      }
      if (briefKey && streamUid) break;
    }
    return { briefKey, streamUid };
  } catch {
    return { briefKey: null, streamUid: null };
  }
}

// ---------------------------------------------------------------------------
// 4. Collect new entries (skip known briefKeys)
// ---------------------------------------------------------------------------

const now = new Date().toISOString().slice(0, 10);
const newEntries = {};

for (const run of runs) {
  const { briefKey, streamUid } = extractFromLogs(run.databaseId);

  if (!briefKey || !streamUid) continue;
  if (alreadyKnown.has(briefKey)) {
    console.log(`  skip   ${briefKey} (already in manifest)`);
    continue;
  }
  if (newEntries[briefKey]) continue; // duplicate run

  // Read brief for forge/composition
  let forge = 'self';
  let composition = 'EnergyBlueprintVideo';
  const appSlug = 'prime-self';
  try {
    const brief = JSON.parse(readFileSync(`${BRIEFS_DIR}/${appSlug}/${briefKey}.json`, 'utf8'));
    forge       = brief.forge ?? brief.forgeTheme ?? 'self';
    composition = brief.composition ?? 'EnergyBlueprintVideo';
  } catch { /* ignore */ }

  newEntries[briefKey] = {
    streamUid,
    renderedAt:    run.updatedAt.slice(0, 10),
    lastValidated: now,
    forge,
    composition,
  };
  console.log(`  ✅  ${briefKey}: ${streamUid}  forge=${forge}`);
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

// Sort keys: daily-transits-guide first, then gate-concept-N numerically
const sorted = Object.fromEntries(
  Object.entries(manifest.videos).sort(([a], [b]) => {
    const numA = parseInt(a.replace('gate-concept-', ''), 10) || -1;
    const numB = parseInt(b.replace('gate-concept-', ''), 10) || -1;
    return numA - numB;
  }),
);
manifest.videos = sorted;

writeFileSync(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
console.log(`\n✅ Updated render-manifest.json (+${Object.keys(newEntries).length} entries, ${Object.keys(manifest.videos).length} total).`);

// ---------------------------------------------------------------------------
// 6. Print HumanDesign video-manifest.js patch
// ---------------------------------------------------------------------------

console.log('\n─────────────────────────────────────────────────────');
console.log('Paste into HumanDesign/client/data/video-manifest.js:');
console.log('─────────────────────────────────────────────────────\n');

const gateEntries = Object.entries(newEntries)
  .filter(([k]) => k.startsWith('gate-concept-'))
  .sort(([a], [b]) => parseInt(a.split('-').pop(), 10) - parseInt(b.split('-').pop(), 10));

for (const [briefKey, entry] of gateEntries) {
  const gateNum = briefKey.replace('gate-concept-', '');
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
// 7. Write to HumanDesign video-manifest.js (if repo found)
// ---------------------------------------------------------------------------

const hdManifestPath = resolve(HD_PATH, 'client/data/video-manifest.js');
if (existsSync(hdManifestPath)) {
  const current = readFileSync(hdManifestPath, 'utf8');

  // Insert new gate entries before the closing `};` of GATE_VIDEOS
  const insertionPoint = current.lastIndexOf('};');
  if (insertionPoint === -1) {
    console.warn('\nCould not find closing `};` in video-manifest.js — skipping auto-update.');
  } else {
    let insertion = '';
    for (const [briefKey, entry] of gateEntries) {
      const gateNum = briefKey.replace('gate-concept-', '');
      // Skip gates already in the file
      if (current.includes(`  ${gateNum}: {`)) continue;
      insertion +=
        `  ${gateNum}: {\n` +
        `    streamUid: '${entry.streamUid}',\n` +
        `    forge: '${entry.forge}',\n` +
        `    variants: [\n` +
        `      { id: 'gift',     label: '✦ Gift',     streamUid: '${entry.streamUid}', prompt: 'Does this land? Drop a ✦ if this is you.',                active: true },\n` +
        `      { id: 'shadow',   label: '◈ Shadow',   streamUid: null, prompt: 'Caught yourself here before? Tell me where.' },\n` +
        `      { id: 'practice', label: '◉ Practice', streamUid: null, prompt: 'Try it today. Come back and tell me what shifted.' },\n` +
        `      { id: 'mirror',   label: '◎ Mirror',   streamUid: null, prompt: 'Who in your life does this explain? Tag the feeling.' },\n` +
        `    ],\n` +
        `    participationPrompt: 'Does this land? Drop a ✦ if this is you.',\n` +
        `  },\n`;
    }
    if (insertion) {
      const updated = current.slice(0, insertionPoint) + insertion + current.slice(insertionPoint);
      writeFileSync(hdManifestPath, updated, 'utf8');
      console.log(`\n✅ Updated ${hdManifestPath}`);
    } else {
      console.log('\nAll new gates already in HumanDesign video-manifest.js.');
    }
  }
} else {
  console.log(`\nHumanDesign repo not found at ${HD_PATH} — skipping auto-update.`);
  console.log('Pass --hd-path /path/to/HumanDesign to enable direct update.');
}

// ---------------------------------------------------------------------------
// 8. Optionally commit
// ---------------------------------------------------------------------------

if (COMMIT) {
  try {
    execSync('git add apps/video-studio/render-manifest.json', { stdio: 'inherit' });
    const keys = Object.keys(newEntries).sort().join(', ');
    execSync(
      `git commit -m "chore(video): sync render-manifest — ${keys}"`,
      { stdio: 'inherit' },
    );
    console.log('\n✅ Committed render-manifest.json.');
  } catch (err) {
    console.warn('\nCommit step skipped:', err.message);
  }
}
