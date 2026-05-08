#!/usr/bin/env node
/**
 * rollback-template.mjs
 *
 * Safely removes a template from the supervisor pipeline.
 * Archives the YAML (never deletes — forensic trail preserved).
 * Re-labels affected GitHub issues for re-processing.
 * Sends a Pushover notification.
 *
 * Usage:
 *   node scripts/rollback-template.mjs --template-id <id>
 *
 * Required env: GH_TOKEN, REPO (owner/repo)
 * Optional env: PUSHOVER_TOKEN, PUSHOVER_USER
 */

import { readFileSync, writeFileSync, renameSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import { execSync } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const require = createRequire(join(ROOT, 'apps', 'supervisor', 'package.json'));
const { load: yamlLoad, dump: yamlDump } = require('js-yaml');

const GH_TOKEN       = process.env.GH_TOKEN;
const REPO           = process.env.REPO ?? 'Latimer-Woods-Tech/Factory';
const PUSHOVER_TOKEN = process.env.PUSHOVER_TOKEN;
const PUSHOVER_USER  = process.env.PUSHOVER_USER;

const PLANS_DIR     = join(ROOT, 'docs', 'supervisor', 'plans');
const ARCHIVE_DIR   = join(PLANS_DIR, 'archived');
const REGISTRY_PATH = join(ROOT, 'docs', 'supervisor', 'template-registry.yml');

// ── CLI args ─────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const idIdx = args.indexOf('--template-id');
if (idIdx === -1 || !args[idIdx + 1]) {
  console.error('Usage: node scripts/rollback-template.mjs --template-id <id>');
  process.exit(1);
}
const TEMPLATE_ID = args[idIdx + 1];

// ── GitHub helpers ────────────────────────────────────────────────────────────

async function ghFetch(path, opts = {}) {
  const res = await fetch(`https://api.github.com${path}`, {
    ...opts,
    headers: {
      Authorization: `Bearer ${GH_TOKEN}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
      ...(opts.headers ?? {}),
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  // 204 No Content and 404/422 (already removed) are not errors
  if (!res.ok && res.status !== 204 && res.status !== 404 && res.status !== 422) {
    const text = await res.text();
    throw new Error(`GitHub ${res.status} ${path}: ${text}`);
  }
  if (res.status === 204) return null;
  return res.json().catch(() => null);
}

async function findAffectedIssues() {
  // Search open issues where supervisor commented with this template ID
  const q = encodeURIComponent(`repo:${REPO} is:issue is:open "${TEMPLATE_ID}" in:comments`);
  const data = await ghFetch(`/search/issues?q=${q}&per_page=50`);
  return (data?.items ?? []).map(i => i.number);
}

async function reQueueIssue(num) {
  // Post rollback notice
  await ghFetch(`/repos/${REPO}/issues/${num}/comments`, {
    method: 'POST',
    body: {
      body: [
        `**Supervisor rollback notice**`,
        ``,
        `Template \`${TEMPLATE_ID}\` has been rolled back and removed from the pipeline.`,
        `This issue has been re-queued (\`supervisor:no-template\`) for re-processing.`,
        ``,
        `A human should author a replacement template in \`docs/supervisor/plans/\` `,
        `or handle this issue manually.`,
        ``,
        `_Rollback performed by \`scripts/rollback-template.mjs\`_`,
      ].join('\n'),
    },
  });

  // Read current labels
  const issue = await ghFetch(`/repos/${REPO}/issues/${num}`);
  const currentLabels = (issue?.labels ?? []).map(l => l.name);

  // Remove supervisor/agent labels that no longer apply
  const toRemove = currentLabels.filter(
    n => n.startsWith('agent:claimed:') || n === 'status:done' || n === 'supervisor:approved-source'
  );
  for (const label of toRemove) {
    await ghFetch(`/repos/${REPO}/issues/${num}/labels/${encodeURIComponent(label)}`, {
      method: 'DELETE',
    });
  }

  // Re-apply no-template so the author workflow can re-try when a new template is ready
  await ghFetch(`/repos/${REPO}/issues/${num}/labels`, {
    method: 'POST',
    body: { labels: ['supervisor:no-template'] },
  });

  console.log(`  ✓ Re-queued issue #${num}`);
}

// ── Pushover ──────────────────────────────────────────────────────────────────

async function pushover(title, message) {
  if (!PUSHOVER_TOKEN || !PUSHOVER_USER) return;
  try {
    await fetch('https://api.pushover.net/1/messages.json', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: PUSHOVER_TOKEN, user: PUSHOVER_USER, title, message }),
    });
  } catch (e) {
    console.warn('[WARN] Pushover failed:', e.message);
  }
}

// ── Registry update ───────────────────────────────────────────────────────────

function markRolledBack() {
  try {
    const registry = yamlLoad(readFileSync(REGISTRY_PATH, 'utf8')) ?? { templates: [] };
    registry.templates = registry.templates ?? [];
    const entry = registry.templates.find(t => t.id === TEMPLATE_ID);
    if (entry) {
      entry.status = 'rolled-back';
      entry.rolled_back_at = new Date().toISOString();
    } else {
      console.warn(`[WARN] Template "${TEMPLATE_ID}" not found in registry — skipping registry update`);
      return;
    }
    writeFileSync(REGISTRY_PATH, `# Auto-maintained — do not edit manually\n${yamlDump(registry, { lineWidth: 120 })}`, 'utf8');
    console.log('✓ Registry updated');
  } catch (e) {
    console.warn('[WARN] Could not update registry:', e.message);
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const templatePath = join(PLANS_DIR, `${TEMPLATE_ID}.yml`);

  if (!existsSync(templatePath)) {
    console.error(`[ERROR] Template not found: ${templatePath}`);
    process.exit(1);
  }

  console.log(`\nRolling back template: ${TEMPLATE_ID}\n`);

  // 1. Archive — never delete (forensic trail)
  mkdirSync(ARCHIVE_DIR, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const archivePath = join(ARCHIVE_DIR, `${TEMPLATE_ID}-${timestamp}.yml`);
  renameSync(templatePath, archivePath);
  console.log(`✓ Archived → ${archivePath.replace(ROOT, '.')}`);

  // 2. Regenerate JSON/TS without the removed template
  try {
    execSync('node scripts/generate-supervisor-templates.mjs', { cwd: ROOT, stdio: 'inherit' });
    console.log('✓ templates.generated.json regenerated');
  } catch (e) {
    // Restore and abort — don't leave the pipeline broken
    console.error('[ERROR] Regeneration failed — restoring template');
    renameSync(archivePath, templatePath);
    console.error(e.message);
    process.exit(1);
  }

  // 3. Mark rolled back in registry
  markRolledBack();

  // 4. Re-queue affected GitHub issues
  if (GH_TOKEN) {
    console.log('\nSearching for affected issues...');
    const affected = await findAffectedIssues();
    console.log(`Found ${affected.length} open issue(s) to re-queue`);
    for (const num of affected) {
      await reQueueIssue(num);
    }
  } else {
    console.warn('[WARN] GH_TOKEN not set — skipping GitHub issue re-queue');
    console.warn('       Re-queue manually: remove agent:claimed:* and add supervisor:no-template');
  }

  // 5. Notify
  await pushover(
    'Supervisor: template rolled back',
    `"${TEMPLATE_ID}" rolled back + archived. ${GH_TOKEN ? 'Affected issues re-queued.' : 'Re-queue issues manually.'}`
  );

  console.log(`\n✓ Rollback complete`);
  console.log(`  Archive : ${archivePath.replace(ROOT, '.')}`);
  console.log(`  Restore : move archive back + run node scripts/generate-supervisor-templates.mjs`);
}

main().catch(e => {
  console.error('[FATAL]', e.message);
  process.exit(1);
});
