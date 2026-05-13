#!/usr/bin/env node

/**
 * check-migration-drift.mjs
 *
 * Tooling-only CI guard and cron alert script for GitHub Actions.
 * NOT shipped to or executed inside Cloudflare Workers runtime code.
 *
 * Compares the migrations committed in the repo (via meta/_journal.json) against
 * the migrations applied in the production database (drizzle.__drizzle_migrations
 * row count). Fails with exit code 1 when the repo is ahead of production.
 *
 * Required env vars:
 *   DATABASE_URL     — PostgreSQL direct connection string (not Hyperdrive)
 *   MIGRATIONS_DIR   — Relative or absolute path to the migrations folder
 *                      (e.g. "workers/src/db/migrations")
 *   APP_NAME         — Human-readable label for alert messages (e.g. "HumanDesign")
 *
 * Optional env vars:
 *   SEND_PUSHOVER    — Set to "1" to send a Pushover alert when drift is found
 *   PUSHOVER_TOKEN   — Pushover application token
 *   PUSHOVER_USER    — Pushover user / group key
 *
 * Exit codes:
 *   0 — in sync (or no migrations found)
 *   1 — drift detected (repo ahead of prod)
 *   2 — configuration / connection error
 */

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const MIGRATIONS_DIR = process.env['MIGRATIONS_DIR'];
const DATABASE_URL = process.env['DATABASE_URL'];
const APP_NAME = process.env['APP_NAME'] ?? 'Unknown App';
const SEND_PUSHOVER = process.env['SEND_PUSHOVER'] === '1';
const PUSHOVER_TOKEN = process.env['PUSHOVER_TOKEN'];
const PUSHOVER_USER = process.env['PUSHOVER_USER'];

// ─── Validate required env vars ───────────────────────────────────────────────

if (!MIGRATIONS_DIR) {
  console.error('Error: MIGRATIONS_DIR env var is required.');
  process.exit(2);
}

if (!DATABASE_URL) {
  console.error('Error: DATABASE_URL env var is required.');
  process.exit(2);
}

// ─── Read journal from repo ────────────────────────────────────────────────────

const journalPath = path.resolve(MIGRATIONS_DIR, 'meta', '_journal.json');

if (!existsSync(journalPath)) {
  console.log(`No migration journal found at ${journalPath}. Skipping drift check.`);
  process.exit(0);
}

let journal;
try {
  journal = JSON.parse(readFileSync(journalPath, 'utf8'));
} catch (err) {
  console.error(`Failed to parse journal at ${journalPath}: ${err.message}`);
  process.exit(2);
}

/** @type {Array<{ idx: number; tag: string; when: number }>} */
const repoEntries = Array.isArray(journal.entries) ? journal.entries : [];
const repoCount = repoEntries.length;
const repoLatestTag = repoEntries.at(-1)?.tag ?? 'none';

if (repoCount === 0) {
  console.log('No migrations in journal. Nothing to check.');
  process.exit(0);
}

console.log(`Repo: ${repoCount} migration(s) in journal, latest: ${repoLatestTag}`);

// ─── Query the production database ────────────────────────────────────────────

// Dynamic import so the module is resolved from node_modules installed by the
// workflow step rather than a factory-level package.json.
let postgres;
try {
  ({ default: postgres } = await import('postgres'));
} catch {
  console.error(
    "Failed to import 'postgres'. Run `npm install --no-save postgres` before this script.",
  );
  process.exit(2);
}

let sql;
let prodCount = 0;
let tableExists = false;

try {
  sql = postgres(DATABASE_URL, {
    max: 1,
    idle_timeout: 20,
    connect_timeout: 15,
  });

  const [row] = await sql`
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = 'drizzle'
        AND table_name = '__drizzle_migrations'
    ) AS "exists"
  `;

  tableExists = row?.exists === true;

  if (tableExists) {
    const [countRow] = await sql`SELECT COUNT(*)::int AS n FROM drizzle.__drizzle_migrations`;
    prodCount = countRow?.n ?? 0;
  }
} catch (err) {
  console.error(`Database error: ${err.message}`);
  await sql?.end().catch(() => {});
  process.exit(2);
} finally {
  await sql?.end().catch(() => {});
}

if (!tableExists) {
  console.log('drizzle.__drizzle_migrations table not found — no migrations applied yet.');
}

console.log(`Prod: ${prodCount} migration(s) applied`);

// ─── Compare and report ────────────────────────────────────────────────────────

if (prodCount >= repoCount) {
  console.log(`✅ No migration drift detected on ${APP_NAME}.`);
  process.exit(0);
}

// Drift detected — build gap information.
const prodLatestTag = prodCount > 0 ? (repoEntries[prodCount - 1]?.tag ?? 'none') : 'none';
const gapEntries = repoEntries.slice(prodCount);
const gapTags = gapEntries.map((e) => e.tag);

// Format gap as a range when tags share a numeric prefix pattern (e.g. 0081..0090).
const gapDisplay = formatGap(gapTags);

console.error(`\n❌ Migration drift detected on ${APP_NAME}:`);
console.error(`   Prod applied: ${prodLatestTag}`);
console.error(`   Repo latest:  ${repoLatestTag}`);
console.error(`   Gap (${gapEntries.length} pending): ${gapDisplay}`);
console.error('\nApply the missing migrations to production before merging this PR.');

if (SEND_PUSHOVER) {
  await sendPushover(APP_NAME, prodLatestTag, repoLatestTag, gapDisplay, gapEntries.length);
}

process.exit(1);

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Format a list of migration tags for display. When the tags form a contiguous
 * numeric range (e.g. "0081_foo" … "0090_bar"), renders as "0081..0090". Otherwise
 * renders as a comma-separated list.
 *
 * @param {string[]} tags
 * @returns {string}
 */
function formatGap(tags) {
  if (tags.length === 0) return '(none)';
  if (tags.length === 1) return tags[0];

  const prefixes = tags.map((t) => {
    const m = t.match(/^(\d+)/);
    return m ? Number(m[1]) : null;
  });

  const allNumeric = prefixes.every((p) => p !== null);
  if (allNumeric) {
    const min = prefixes[0];
    const max = prefixes.at(-1);
    const isContiguous = prefixes.every((p, i) => p === min + i);
    if (isContiguous) {
      return `${String(min).padStart(4, '0')}..${String(max).padStart(4, '0')}`;
    }
  }

  return tags.join(', ');
}

/**
 * Send a Pushover alert reporting the detected drift.
 *
 * @param {string} appName
 * @param {string} prodLatest
 * @param {string} repoLatest
 * @param {string} gapDisplay
 * @param {number} gapCount
 */
async function sendPushover(appName, prodLatest, repoLatest, gapDisplay, gapCount) {
  if (!PUSHOVER_TOKEN || !PUSHOVER_USER) {
    console.warn('PUSHOVER_TOKEN or PUSHOVER_USER not set — skipping notification.');
    return;
  }

  const message =
    `Migration drift detected on ${appName}: ` +
    `prod at ${prodLatest}, repo at ${repoLatest}, ` +
    `gap (${gapCount}): [${gapDisplay}]`;

  const body = new URLSearchParams({
    token: PUSHOVER_TOKEN,
    user: PUSHOVER_USER,
    message,
    title: `⚠️ Migration Drift: ${appName}`,
    priority: '0',
  });

  try {
    const response = await fetch('https://api.pushover.net/1/messages.json', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });

    if (!response.ok) {
      const text = await response.text();
      console.warn(`Pushover notification failed (HTTP ${response.status}): ${text}`);
    } else {
      console.log('✅ Pushover notification sent.');
    }
  } catch (err) {
    console.warn(`Pushover notification error: ${err.message}`);
  }
}
