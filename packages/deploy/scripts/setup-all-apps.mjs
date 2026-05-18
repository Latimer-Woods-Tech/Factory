#!/usr/bin/env node
/**
 * setup-all-apps.mjs
 *
 * One-pass script to wire configured Factory app repos from Factory Core.
 * Sets GitHub repo secrets and Wrangler Worker secrets for every app.
 * Idempotent — safe to re-run. Uses --overwrite for existing secrets.
 *
 * Prerequisites:
 *   export GITHUB_TOKEN="ghp_..."         # repo scope PAT
 *   export CF_API_TOKEN="..."             # Cloudflare "Edit Workers" token
 *   export CF_ACCOUNT_ID="..."
 *   export PACKAGES_READ_TOKEN="ghp_..."  # read:packages PAT (can equal GITHUB_TOKEN)
 *
 * Per-app Wrangler secrets — set in environment before running:
 *   export JWT_SECRET_WORDIS_BOND="..."
 *   export JWT_SECRET_CYPHER_HEALING="..."
 *   export JWT_SECRET_PRIME_SELF="..."
 *   export JWT_SECRET_IJUSTUS="..."
 *   export JWT_SECRET_THE_CALLING="..."
 *   export JWT_SECRET_NEIGHBOR_AID="..."
 *   export JWT_SECRET_VIDEOKING="..."
 *   export SENTRY_DSN_WORDIS_BOND="..."
 *   ... (same pattern for each secret × each app)
 *
 * Usage:
 *   node packages/deploy/scripts/setup-all-apps.mjs
 *   node packages/deploy/scripts/setup-all-apps.mjs --dry-run
 *   node packages/deploy/scripts/setup-all-apps.mjs --app wordis-bond
 */

import { execSync } from 'child_process';
import { createInterface } from 'readline';

// ─── App Registry ────────────────────────────────────────────────────────────

const APPS = [
  {
    name: 'daily-brief',
    isMonorepo: true,
    workerName: 'daily-brief',
    envKey: 'DAILY_BRIEF',
    extraSecrets: [
      'ANTHROPIC_API_KEY', 'GROQ_API_KEY', 'GROK_API_KEY', 'DEEPSEEK_API_KEY', 'VERTEX_ACCESS_TOKEN',
      'ELEVENLABS_API_KEY', 'ELEVENLABS_VOICE_ID', 'RESEND_API_KEY',
      'GITHUB_TOKEN', 'NEWS_API_KEY', 'STRIPE_SECRET_KEY',
      'POSTHOG_API_KEY', 'POSTHOG_PROJECT_ID', 'SENTRY_AUTH_TOKEN', 'SENTRY_ORG'
    ],
  },
  {
    name: 'wordis-bond',
    workerName: 'wordis-bond',
    envKey: 'WORDIS_BOND',
    extraSecrets: ['STRIPE_SECRET_KEY', 'TELNYX_API_KEY', 'RESEND_API_KEY'],
  },
  {
    name: 'cypher-healing',
    workerName: 'cypher-healing',
    envKey: 'CYPHER_HEALING',
    extraSecrets: ['STRIPE_SECRET_KEY', 'ANTHROPIC_API_KEY', 'DEEPSEEK_API_KEY', 'ELEVENLABS_API_KEY', 'DEEPGRAM_API_KEY', 'RESEND_API_KEY'],
  },
  {
    name: 'prime-self',
    workerName: 'prime-self-api',
    envKey: 'PRIME_SELF',
    extraSecrets: ['STRIPE_SECRET_KEY', 'ANTHROPIC_API_KEY', 'DEEPSEEK_API_KEY', 'ELEVENLABS_API_KEY', 'DEEPGRAM_API_KEY', 'RESEND_API_KEY'],
  },
  {
    name: 'ijustus',
    workerName: 'ijustus',
    envKey: 'IJUSTUS',
    extraSecrets: ['STRIPE_SECRET_KEY', 'ANTHROPIC_API_KEY', 'DEEPSEEK_API_KEY', 'ELEVENLABS_API_KEY', 'DEEPGRAM_API_KEY', 'TELNYX_API_KEY'],
  },
  {
    name: 'the-calling',
    workerName: 'the-calling',
    envKey: 'THE_CALLING',
    extraSecrets: ['STRIPE_SECRET_KEY', 'RESEND_API_KEY'],
  },
  {
    name: 'neighbor-aid',
    workerName: 'neighbor-aid',
    envKey: 'NEIGHBOR_AID',
    extraSecrets: ['STRIPE_SECRET_KEY', 'RESEND_API_KEY'],
  },
  {
    name: 'videoking',
    workerName: 'nichestream-api', // legacy Worker name preserved so api.itsjusus.com deployments keep targeting the live service
    envKey: 'VIDEOKING',
    extraSecrets: ['STRIPE_SECRET_KEY', 'BETTER_AUTH_SECRET', 'STRIPE_WEBHOOK_SECRET', 'EMAIL_API_KEY'],
  },
  {
    name: 'xico-city',
    workerName: 'xico-city',
    envKey: 'XICO_CITY',
    extraSecrets: ['STRIPE_SECRET_KEY'],
  },
];

// ─── CLI Args ─────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const appFilter = (() => {
  const idx = args.indexOf('--app');
  return idx !== -1 ? args[idx + 1] : null;
})();

const apps = appFilter ? APPS.filter((a) => a.name === appFilter) : APPS;

if (apps.length === 0) {
  console.error(`No app found matching: ${appFilter}`);
  console.error(`Valid apps: ${APPS.map((a) => a.name).join(', ')}`);
  process.exit(1);
}

// ─── Env Validation ───────────────────────────────────────────────────────────

function requireEnv(name) {
  const val = process.env[name];
  if (!val) {
    console.error(`ERROR: Required environment variable not set: ${name}`);
    console.error(`  export ${name}="..."`);
    process.exit(1);
  }
  return val;
}

function optionalEnv(name) {
  return process.env[name] ?? null;
}

// Validate shared required variables at startup
requireEnv('GITHUB_TOKEN');
requireEnv('CF_API_TOKEN');
requireEnv('CF_ACCOUNT_ID');
requireEnv('PACKAGES_READ_TOKEN');

// ─── Exec Helpers ──────────────────────────────────────────────────────────────

function run(cmd, opts = {}) {
  if (DRY_RUN) {
    console.log(`[DRY-RUN] ${cmd}`);
    return '';
  }
  try {
    return execSync(cmd, {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
      ...opts,
    }).trim();
  } catch (err) {
    const stderr = err.stderr?.toString() ?? '';
    const stdout = err.stdout?.toString() ?? '';
    throw new Error(`Command failed: ${cmd}\n${stderr || stdout}`);
  }
}

function runOrIgnore(cmd, ignorePhrases = []) {
  try {
    return run(cmd);
  } catch (err) {
    const msg = err.message ?? '';
    const ignored = ignorePhrases.some((phrase) => msg.includes(phrase));
    if (ignored) {
      console.log(`  [ignored expected error: ${ignorePhrases.join(', ')}]`);
      return null;
    }
    throw err;
  }
}

// ─── GitHub Secret ────────────────────────────────────────────────────────────

/**
 * Set a GitHub Actions secret on a repo.
 * Uses --overwrite so it's safe to re-run.
 */
function setGitHubSecret(repo, name, value) {
  const fullRepo = `Latimer-Woods-Tech/${repo}`;
  const cmd = `gh secret set ${name} --repo ${fullRepo} --body "${value}"`;
  console.log(`  gh secret set ${name} --repo ${fullRepo}`);
  run(cmd);
}

function ensureGitHubEnvironment(repo, environment) {
  const fullRepo = `Latimer-Woods-Tech/${repo}`;
  const cmd = `gh api --method PUT -H "Accept: application/vnd.github+json" repos/${fullRepo}/environments/${environment}`;
  console.log(`  gh api --method PUT repos/${fullRepo}/environments/${environment}`);
  run(cmd);
}

// ─── Wrangler Secret ─────────────────────────────────────────────────────────

/**
 * Set a Wrangler secret on a Worker.
 * Wrangler secret put reads value from stdin.
 */
function setWranglerSecret(workerName, name, value) {
  const cmd = `echo "${value}" | wrangler secret put ${name} --name ${workerName}`;
  console.log(`  wrangler secret put ${name} --name ${workerName}`);
  if (!DRY_RUN) {
    try {
      execSync(cmd, {
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe'],
        env: {
          ...process.env,
          CLOUDFLARE_API_TOKEN: process.env['CF_API_TOKEN'],
          CLOUDFLARE_ACCOUNT_ID: process.env['CF_ACCOUNT_ID'],
        },
      });
    } catch (err) {
      const msg = err.stderr?.toString() ?? err.stdout?.toString() ?? '';
      console.warn(`  WARNING: Wrangler secret put ${name} failed: ${msg.trim()}`);
      console.warn(`  (Worker may not exist yet. Run this again after scaffold.mjs.)`);
    }
  }
}

// ─── Per-App Setup ────────────────────────────────────────────────────────────

async function setupApp(app) {
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`  Setting up: ${app.name}`);
  console.log(`${'═'.repeat(60)}`);

  const { name, workerName, envKey, extraSecrets } = app;

  // ── GitHub Secrets ──────────────────────────────────────────────
  console.log('\n  [GitHub Secrets]');

  if (app.isMonorepo) {
    console.log(`  [skipped] ${name} is a monorepo app, skipping GitHub repo secrets`);
  } else {
    setGitHubSecret(name, 'PACKAGES_READ_TOKEN', requireEnv('PACKAGES_READ_TOKEN'));
  setGitHubSecret(name, 'CF_API_TOKEN', requireEnv('CF_API_TOKEN'));
  setGitHubSecret(name, 'CF_ACCOUNT_ID', requireEnv('CF_ACCOUNT_ID'));
  ensureGitHubEnvironment(name, 'staging');
  ensureGitHubEnvironment(name, 'production');

  // Optional: Neon preview branch URL for CI migration dry-run
  const neonPreviewUrl = optionalEnv(`NEON_PREVIEW_URL_${envKey}`);
  if (neonPreviewUrl) {
    setGitHubSecret(name, 'NEON_PREVIEW_URL', neonPreviewUrl);
  } else {
    console.log(`  [skipped] NEON_PREVIEW_URL_${envKey} not set`);
  }

  // Optional: Sentry DSN for CI
  const sentryDsn = optionalEnv(`SENTRY_DSN_${envKey}`);
  if (sentryDsn) {
    setGitHubSecret(name, 'SENTRY_DSN', sentryDsn);
  } else {
    console.log(`  [skipped] SENTRY_DSN_${envKey} not set`);
  }

  }

  // ── Wrangler Secrets ────────────────────────────────────────────
  console.log('\n  [Wrangler Secrets]');

  // JWT_SECRET — required per app
  const jwtSecret = optionalEnv(`JWT_SECRET_${envKey}`);
  if (jwtSecret) {
    setWranglerSecret(workerName, 'JWT_SECRET', jwtSecret);
  } else {
    console.log(`  [skipped] JWT_SECRET_${envKey} not set — set it before deploying`);
  }

  // Sentry DSN as Wrangler secret (runtime use)
  if (sentryDsn) {
    setWranglerSecret(workerName, 'SENTRY_DSN', sentryDsn);
  }

  // PostHog key
  const posthogKey = optionalEnv(`POSTHOG_KEY_${envKey}`);
  if (posthogKey) {
    setWranglerSecret(workerName, 'POSTHOG_KEY', posthogKey);
  } else {
    console.log(`  [skipped] POSTHOG_KEY_${envKey} not set`);
  }

  // Extra app-specific secrets
  for (const secretName of extraSecrets) {
    const envVarName = `${secretName}_${envKey}`;
    const value = optionalEnv(envVarName);
    if (value) {
      setWranglerSecret(workerName, secretName, value);
    } else {
      console.log(`  [skipped] ${envVarName} not set`);
    }
  }

  console.log(`\n  Done: ${app.name}`);
}

// ─── Summary ──────────────────────────────────────────────────────────────────

function printSummary(results) {
  console.log(`\n${'═'.repeat(60)}`);
  console.log('  SUMMARY');
  console.log(`${'═'.repeat(60)}`);

  for (const { name, status, error } of results) {
    const icon = status === 'ok' ? '✅' : '❌';
    console.log(`  ${icon}  ${name}${error ? `: ${error}` : ''}`);
  }

  const failed = results.filter((r) => r.status !== 'ok');
  if (failed.length > 0) {
    console.log(`\n  ${failed.length} app(s) failed. Re-run with --app {name} to retry.`);
    process.exit(1);
  } else {
    console.log('\n  All apps wired successfully.');
    if (DRY_RUN) {
      console.log('  (This was a dry run — no changes were made.)');
    }
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('Factory Core — setup-all-apps.mjs');
  if (DRY_RUN) console.log('[DRY RUN MODE]');
  console.log(`Apps: ${apps.map((a) => a.name).join(', ')}`);

  const results = [];

  for (const app of apps) {
    try {
      await setupApp(app);
      results.push({ name: app.name, status: 'ok' });
    } catch (err) {
      console.error(`\n  ERROR for ${app.name}:`, err.message);
      results.push({ name: app.name, status: 'fail', error: err.message });
    }
  }

  printSummary(results);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
