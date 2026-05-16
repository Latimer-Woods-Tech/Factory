#!/usr/bin/env node
/**
 * create-sentry-projects.mjs
 *
 * Creates all 7 Sentry projects via the Sentry Management API and writes
 * the DSNs to .env.sentry (gitignored) for use by setup-all-apps.mjs.
 *
 * Prerequisites:
 *   export SENTRY_AUTH_TOKEN="sntrys_..."  # Settings → Auth Tokens → project:write + project:read
 *   export SENTRY_ORG="your-org-slug"      # visible in Sentry URL: sentry.io/organizations/{slug}/
 *
 * Usage:
 *   node packages/deploy/scripts/create-sentry-projects.mjs
 *   node packages/deploy/scripts/create-sentry-projects.mjs --dry-run
 */

import { writeFileSync, appendFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

// ─── Config ───────────────────────────────────────────────────────────────────

const DRY_RUN = process.argv.includes('--dry-run');

const SENTRY_AUTH_TOKEN = process.env['SENTRY_AUTH_TOKEN'];
const SENTRY_ORG = process.env['SENTRY_ORG'];

if (!SENTRY_AUTH_TOKEN) {
  console.error('ERROR: SENTRY_AUTH_TOKEN is not set.');
  console.error('  Create one at: https://sentry.io/settings/account/api/auth-tokens/');
  console.error('  Required scopes: project:write, project:read, team:write');
  console.error('  Then: export SENTRY_AUTH_TOKEN="sntrys_..."');
  process.exit(1);
}

if (!SENTRY_ORG) {
  console.error('ERROR: SENTRY_ORG is not set.');
  console.error('  Find it in your Sentry URL: sentry.io/organizations/{slug}/');
  console.error('  Then: export SENTRY_ORG="your-org-slug"');
  process.exit(1);
}

// ─── Project Definitions ──────────────────────────────────────────────────────

const PROJECTS = [
  { name: 'wordis-bond-worker',     slug: 'wordis-bond-worker',     envKey: 'WORDIS_BOND' },
  { name: 'cypher-healing-worker',  slug: 'cypher-healing-worker',  envKey: 'CYPHER_HEALING' },
  { name: 'prime-self-worker',      slug: 'prime-self-worker',      envKey: 'PRIME_SELF' },
  { name: 'ijustus-worker',         slug: 'ijustus-worker',         envKey: 'IJUSTUS' },
  { name: 'the-calling-worker',     slug: 'the-calling-worker',     envKey: 'THE_CALLING' },
  { name: 'neighbor-aid-worker',    slug: 'neighbor-aid-worker',    envKey: 'NEIGHBOR_AID' },
  { name: 'xico-city-worker',       slug: 'xico-city-worker',       envKey: 'XICO_CITY' },
  { name: 'videoking',              slug: 'videoking',              envKey: 'VIDEOKING' },
  { name: 'factory-admin-worker',   slug: 'factory-admin-worker',   envKey: 'FACTORY_ADMIN' },
];

const BASE_URL = `https://sentry.io/api/0`;
const PLATFORM = 'node-cloudflare-workers';

// ─── API Helpers ──────────────────────────────────────────────────────────────

async function sentryRequest(path, method = 'GET', body = null) {
  const url = `${BASE_URL}${path}`;
  const opts = {
    method,
    headers: {
      Authorization: `Bearer ${SENTRY_AUTH_TOKEN}`,
      'Content-Type': 'application/json',
    },
  };
  if (body) opts.body = JSON.stringify(body);

  const res = await fetch(url, opts);

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Sentry API ${method} ${url} → ${res.status}: ${text}`);
  }

  return res.json();
}

/** Ensure the default team exists (Sentry requires a team to create a project). */
async function ensureTeam() {
  const teams = await sentryRequest(`/organizations/${SENTRY_ORG}/teams/`);
  if (teams.length > 0) {
    console.log(`  Using team: ${teams[0].slug}`);
    return teams[0].slug;
  }

  console.log('  No teams found. Creating default team...');
  const team = await sentryRequest(`/organizations/${SENTRY_ORG}/teams/`, 'POST', {
    name: 'factory',
    slug: 'factory',
  });
  console.log(`  Created team: ${team.slug}`);
  return team.slug;
}

/** Fetch DSN from the client keys endpoint (works for all existing projects). */
async function fetchDsn(projectSlug) {
  const keys = await sentryRequest(`/projects/${SENTRY_ORG}/${projectSlug}/keys/`);
  if (!Array.isArray(keys) || keys.length === 0) return null;
  return keys[0].dsn?.public ?? null;
}

/** Create a Sentry project. Returns the DSN or null on failure. */
async function createProject(teamSlug, project) {
  try {
    const data = await sentryRequest(
      `/teams/${SENTRY_ORG}/${teamSlug}/projects/`,
      'POST',
      { name: project.name, slug: project.slug, platform: PLATFORM },
    );
    // Newly created: prefer DSN from create response, fall back to keys endpoint
    return data.dsn?.public ?? (await fetchDsn(project.slug));
  } catch (err) {
    // Log the full error so we can diagnose — then check if it's a 409/already-exists
    console.warn(`  Create error for ${project.slug}: ${err.message}`);
    if (
      err.message.includes('already exists') ||
      err.message.includes('400') ||
      err.message.includes('409')
    ) {
      console.log(`  [exists] ${project.slug} — fetching existing DSN`);
      try {
        return await fetchDsn(project.slug);
      } catch (fetchErr) {
        console.warn(`  WARNING: Could not fetch existing DSN for ${project.slug}: ${fetchErr.message}`);
        return null;
      }
    }
    throw err;
  }
}

// ─── Output ───────────────────────────────────────────────────────────────────

const ENV_FILE = join(process.cwd(), '.env.sentry');

function writeDsn(envKey, dsn) {
  const line = `SENTRY_DSN_${envKey}="${dsn}"\n`;
  appendFileSync(ENV_FILE, line, 'utf8');
  console.log(`  ✅ ${envKey}: ${dsn.substring(0, 48)}...`);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('Factory — create-sentry-projects.mjs');
  console.log(`Org: ${SENTRY_ORG}`);
  if (DRY_RUN) console.log('[DRY RUN — no API calls will be made]\n');

  if (!DRY_RUN) {
    // Truncate/create output file
    writeFileSync(ENV_FILE, '# Sentry DSNs — generated by create-sentry-projects.mjs\n# DO NOT COMMIT — this file is gitignored\n\n', 'utf8');
    console.log(`Writing DSNs to: ${ENV_FILE}\n`);
  }

  let teamSlug;
  if (!DRY_RUN) {
    console.log('Fetching Sentry team...');
    teamSlug = await ensureTeam();
  }

  const results = [];

  for (const project of PROJECTS) {
    console.log(`\nCreating: ${project.slug}`);

    if (DRY_RUN) {
      console.log(`  [DRY RUN] POST /teams/${SENTRY_ORG}/{team}/projects/ { slug: "${project.slug}" }`);
      results.push({ project, dsn: 'https://dry-run@sentry.io/0', ok: true });
      continue;
    }

    try {
      const dsn = await createProject(teamSlug, project);
      if (dsn) {
        writeDsn(project.envKey, dsn);
        results.push({ project, dsn, ok: true });
      } else {
        console.warn(`  WARNING: No DSN returned for ${project.slug}. Set it manually.`);
        results.push({ project, dsn: null, ok: false });
      }
    } catch (err) {
      console.error(`  ERROR for ${project.slug}: ${err.message}`);
      results.push({ project, dsn: null, ok: false, error: err.message });
    }

    // Small delay to avoid rate limiting
    await new Promise((r) => setTimeout(r, 300));
  }

  // ── Summary ────────────────────────────────────────────────────────────────
  console.log('\n' + '═'.repeat(60));
  console.log('SUMMARY');
  console.log('═'.repeat(60));

  const failed = results.filter((r) => !r.ok);
  for (const { project, ok, error } of results) {
    console.log(`  ${ok ? '✅' : '❌'}  ${project.slug}${error ? ': ' + error : ''}`);
  }

  if (!DRY_RUN && failed.length === 0) {
    console.log(`\n  All 8 DSNs written to: ${ENV_FILE}`);
    console.log('\n  Next steps:');
    console.log('  1. source .env.sentry  (or load it into your shell)');
    console.log('  2. node packages/deploy/scripts/setup-all-apps.mjs');
    console.log('\n  ⚠️  Add .env.sentry to .gitignore before committing.');
  } else if (failed.length > 0) {
    console.log(`\n  ${failed.length} project(s) failed. Re-run to retry.`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
