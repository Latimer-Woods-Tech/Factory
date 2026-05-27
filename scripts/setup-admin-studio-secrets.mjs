#!/usr/bin/env node

/**
 * Setup script for admin-studio secrets in Cloudflare Workers.
 *
 * This script stores all required secrets for the AI agent:
 * - GITHUB_TOKEN: Repository access
 * - ANTHROPIC_API_KEY: Claude API access
 * - GCP_SA_KEY: GCP Secret Manager access (base64-encoded service account key)
 *
 * Usage:
 *   node scripts/setup-admin-studio-secrets.mjs --env staging
 *   node scripts/setup-admin-studio-secrets.mjs --env production
 *
 * Prerequisites:
 *   - CLOUDFLARE_API_TOKEN environment variable set
 *   - Have the three secrets ready (paste when prompted)
 */

import readline from 'readline';
import { execSync } from 'child_process';

const args = process.argv.slice(2);
const envFlag = args.includes('--env') ? args[args.indexOf('--env') + 1] : 'staging';

if (!['staging', 'production'].includes(envFlag)) {
  console.error('❌ Invalid environment. Use: --env staging or --env production');
  process.exit(1);
}

if (!process.env.CLOUDFLARE_API_TOKEN) {
  console.error('❌ CLOUDFLARE_API_TOKEN not set');
  console.error('   Export: export CLOUDFLARE_API_TOKEN="..."');
  process.exit(1);
}

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

const secrets = {
  GITHUB_TOKEN: {
    prompt: 'GitHub PAT (with repo, workflow scopes): ',
    validate: (v) => v.startsWith('github_pat_') || v.startsWith('ghp_'),
  },
  ANTHROPIC_API_KEY: {
    prompt: 'Anthropic API key (sk-ant-...): ',
    validate: (v) => v.startsWith('sk-ant-'),
  },
  GCP_SA_KEY: {
    prompt: 'GCP SA key (base64-encoded JSON): ',
    validate: (v) => {
      try {
        const decoded = Buffer.from(v, 'base64').toString('utf-8');
        const json = JSON.parse(decoded);
        return json.type === 'service_account' && json.project_id === 'factory-495015';
      } catch {
        return false;
      }
    },
  },
};

const secretNames = Object.keys(secrets);
const collectedSecrets = {};

console.log(`\n✨ Admin Studio Secret Setup (${envFlag})`);
console.log('=========================================\n');

async function promptSecret(name, config) {
  return new Promise((resolve) => {
    rl.question(`${name}:\n  ${config.prompt}`, (value) => {
      if (!config.validate(value)) {
        console.error(`  ❌ Invalid format. Please try again.`);
        resolve(promptSecret(name, config)); // Retry
      } else {
        console.log('  ✅ Accepted\n');
        resolve(value);
      }
    });
  });
}

async function main() {
  // Collect all secrets interactively
  for (const name of secretNames) {
    collectedSecrets[name] = await promptSecret(name, secrets[name]);
  }

  // Confirm before storing
  console.log('Ready to store secrets:');
  for (const name of secretNames) {
    console.log(`  ✓ ${name}`);
  }
  console.log('');

  rl.question('Proceed? (yes/no): ', async (answer) => {
    if (answer.toLowerCase() !== 'yes') {
      console.log('Cancelled.');
      process.exit(0);
    }

    // Store secrets via wrangler
    console.log(`\nStoring secrets to ${envFlag}...\n`);

    for (const name of secretNames) {
      try {
        const cmd = `echo "${collectedSecrets[name]}" | npx wrangler secret put ${name} --env ${envFlag}`;
        execSync(cmd, { cwd: 'apps/admin-studio', stdio: 'pipe' });
        console.log(`✅ ${name} stored`);
      } catch (err) {
        console.error(`❌ Failed to store ${name}:`);
        console.error(`   ${err.message}`);
        process.exit(1);
      }
    }

    console.log('\n✨ All secrets stored successfully!\n');

    // Verify
    try {
      const output = execSync(`npx wrangler secret list --env ${envFlag}`, {
        cwd: 'apps/admin-studio',
        encoding: 'utf-8',
      });
      console.log('Verification (secret list):');
      console.log(output);
    } catch (err) {
      console.warn('⚠️  Could not verify secrets. Secrets may still be stored correctly.');
    }

    console.log('Next step: npm run deploy:staging');
    rl.close();
  });
}

main().catch(console.error);
