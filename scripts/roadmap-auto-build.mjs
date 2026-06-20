#!/usr/bin/env node
/**
 * roadmap-auto-build.mjs — Phase 4 (PROPOSE→EXECUTE, auto-file path) of the Platform Brain.
 *
 * Scans queued roadmap items from the entity graph and auto-files deduplicated
 * GitHub issues so the Supervisor can execute them. Only apps in `build` or
 * `growth` mode are eligible — `maintain` and `hands-off` apps are skipped.
 *
 * Dedup strategy: each issue body contains `<!-- roadmap:{item_id} -->`. On
 * subsequent runs the script lists open issues with label `roadmap` and skips
 * any fingerprint that already appears in an open issue body.
 *
 * Filed issues get:
 *   - labels: `roadmap`, `supervisor:no-template`
 *   - the template-author workflow (supervisor-template-author.yml) fires on
 *     `supervisor:no-template` and drafts a matching template, then re-queues
 *     the issue with `supervisor:approved-source` for the Supervisor to execute.
 *
 * Reads:
 *   docs/registry/entity-graph.json   — roadmap item nodes + app edges
 *   docs/app-lifecycle.yml            — per-app operational mode
 * Environment:
 *   APPLY=true   — actually file issues (default: dry-run)
 *   GH_TOKEN     — GitHub token (set by GHA; falls back to gh CLI auth)
 *
 * Node 20+. Runs inside generate-founder-stats.yml (hourly).
 */

import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import yaml from 'js-yaml';

const execFileP = promisify(execFile);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const GRAPH_FILE = join(ROOT, 'docs', 'registry', 'entity-graph.json');
const LIFECYCLE_FILE = join(ROOT, 'docs', 'app-lifecycle.yml');
const REPO = 'Latimer-Woods-Tech/Factory';
const APPLY = process.env.APPLY === 'true';

const ELIGIBLE_MODES = new Set(['build', 'growth']);

const fingerprint = (itemId) => `roadmap:${itemId}`;
const marker = (itemId) => `<!-- roadmap:${itemId} -->`;

/** Build a map of canonical app id → operational mode from app-lifecycle.yml. */
async function buildModeMap() {
  const raw = yaml.load(await readFile(LIFECYCLE_FILE, 'utf8'));
  const map = new Map();
  for (const entry of raw.apps ?? []) {
    if (!entry.mode) continue;
    // Index by lifecycle id
    if (entry.id) map.set(entry.id, entry.mode);
    // Index by repo name (bridges lifecycle id → entity-graph canonical id)
    if (entry.repo) map.set(entry.repo, entry.mode);
    // Index by any declared aliases
    for (const alias of entry.aliases ?? []) {
      if (!map.has(alias)) map.set(alias, entry.mode);
    }
  }
  return map;
}

/** Return the set of roadmap fingerprints that already have an open issue. */
async function existingFingerprints() {
  try {
    const { stdout } = await execFileP('gh', [
      'issue', 'list', '--repo', REPO, '--label', 'roadmap', '--state', 'open',
      '--json', 'number,body', '--limit', '500',
    ]);
    const issues = JSON.parse(stdout);
    const set = new Set();
    for (const it of issues) {
      const matches = (it.body || '').match(/<!-- roadmap:([^>]+?) -->/g) || [];
      for (const tag of matches) {
        const itemId = tag.replace('<!-- roadmap:', '').replace(' -->', '').trim();
        // Store the same value fingerprint() produces so the dedup check in
        // main() matches. Previously this stored the bare itemId while the
        // check compared against fingerprint(itemId) (`roadmap:${itemId}`),
        // so the set never matched and dupes were filed every run.
        set.add(fingerprint(itemId));
      }
    }
    return set;
  } catch (err) {
    throw new Error(`Could not verify roadmap dedup state; refusing to file issues: ${err.message}`);
  }
}

async function ensureLabels() {
  const labels = [
    ['roadmap', '0075CA'],
  ];
  for (const [name, color] of labels) {
    try {
      await execFileP('gh', ['label', 'create', name, '--repo', REPO, '--color', color, '--force']);
    } catch { /* ignore */ }
  }
}

async function fileIssue(appId, item) {
  const title = `[Roadmap] ${appId}: ${item.label}`;
  const body = [
    `**App:** \`${appId}\``,
    `**Roadmap item ID:** \`${item.id}\``,
    item.quarter ? `**Target quarter:** ${item.quarter}` : null,
    item.description ? `\n${item.description}` : null,
    '',
    '---',
    `**Source:** Platform Brain roadmap-auto-build (Phase 4). Auto-filed from \`feature-registry.yml\`.`,
    `The Supervisor will draft a template for this item via \`supervisor:no-template\` → \`supervisor:approved-source\`.`,
    '',
    marker(item.id),
  ].filter((l) => l != null).join('\n');

  await execFileP('gh', [
    'issue', 'create', '--repo', REPO,
    '--title', title,
    '--body', body,
    '--label', 'roadmap',
    '--label', 'supervisor:no-template',
  ]);
  console.log(`  FILED: ${title}`);
}

async function main() {
  if (!existsSync(GRAPH_FILE)) {
    throw new Error('entity-graph.json missing — run build-entity-graph.mjs first');
  }

  const graph = JSON.parse(await readFile(GRAPH_FILE, 'utf8'));
  const modeMap = await buildModeMap();

  const roadmapItems = graph.nodes?.roadmapItems ?? [];
  const queued = roadmapItems.filter((item) => item.status === 'queued');

  // Resolve mode for each queued item via its appId
  const eligible = queued.filter((item) => {
    const mode = modeMap.get(item.appId) ?? 'build';
    return ELIGIBLE_MODES.has(mode);
  });

  console.log(`roadmap-auto-build: ${roadmapItems.length} total items, ${queued.length} queued, ${eligible.length} eligible (build/growth mode)`);

  if (eligible.length === 0) {
    console.log('Nothing to file.');
    return;
  }

  const existing = APPLY ? await existingFingerprints() : new Set();
  if (APPLY) await ensureLabels();

  let filed = 0, skipped = 0;

  for (const item of eligible) {
    const fp = fingerprint(item.id);
    if (existing.has(fp)) {
      console.log(`  dup-skip: ${item.appId} / ${item.id}`);
      skipped++;
      continue;
    }
    if (APPLY) {
      await fileIssue(item.appId, item);
      existing.add(fp);
      filed++;
    } else {
      console.log(`  would-file: [Roadmap] ${item.appId}: ${item.label} (${item.quarter ?? 'no quarter'})`);
    }
  }

  console.log(`Done — filed: ${filed}, dup-skipped: ${skipped}${APPLY ? '' : ' (dry-run)'}`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
