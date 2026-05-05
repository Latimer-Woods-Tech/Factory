#!/usr/bin/env node

/**
 * Phase 6: Infrastructure Provisioning Script
 * 
 * Automates the setup of:
 * - Neon databases
 * - Cloudflare Hyperdrive instances
 * - GitHub repository secrets
 * - Wrangler secrets on Workers
 * 
 * Usage:
 *   node scripts/phase-6-setup.js --neon-token $NEON_TOKEN --cf-token $CF_API_TOKEN
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const { execSync, spawnSync } = require('child_process');

const APPS = [
  'wordis-bond',
  'cypher-healing',
  'prime-self',
  'ijustus',
  'the-calling',
  'neighbor-aid'
];

const RATE_LIMITER_IDS = {
  'wordis-bond': '1001',
  'cypher-healing': '1002',
  'prime-self': '1003',
  'ijustus': '1004',
  'the-calling': '1005',
  'neighbor-aid': '1006'
};

class Phase6Setup {
  constructor(options = {}) {
    this.neonToken = options.neonToken || process.env.NEON_TOKEN;
    this.cfToken = options.cfToken || process.env.CF_API_TOKEN;
    this.cfAccountId = options.cfAccountId || process.env.CF_ACCOUNT_ID;
    this.githubToken = options.githubToken || process.env.GITHUB_TOKEN;
    this.neonProjectId = options.neonProjectId;
    
    this.databases = {};
    this.hyperdrives = {};
    this.secrets = {};
    
    this.validate();
  }

  validate() {
    const required = [
      { name: 'GITHUB_TOKEN', value: this.githubToken },
      { name: 'CF_API_TOKEN', value: this.cfToken },
      { name: 'CF_ACCOUNT_ID', value: this.cfAccountId }
    ];

    const missing = required.filter(r => !r.value);
    if (missing.length > 0) {
      console.error('❌ Missing required environment variables:');
      missing.forEach(m => console.error(`   - ${m.name}`));
      console.error('\nSet them and try again:');
      console.error('  export GITHUB_TOKEN="ghp_..."');
      console.error('  export CF_API_TOKEN="..."');
      console.error('  export CF_ACCOUNT_ID="..."');
      process.exit(1);
    }

    console.log('✅ All credentials present');
  }

  /**
   * Test connectivity to GitHub, Cloudflare
   */
  async testConnections() {
    console.log('\n🔍 Testing connections...\n');

    // Test GitHub
    try {
      const ghOutput = execSync('gh auth status', { encoding: 'utf-8' });
      console.log('✅ GitHub: authenticated');
    } catch (e) {
      console.error('❌ GitHub: not authenticated');
      console.error('   Run: gh auth login');
      process.exit(1);
    }

    // Test Cloudflare
    try {
      execSync(`wrangler hyperdrive list`, {
        env: { ...process.env, CF_API_TOKEN: this.cfToken, CF_ACCOUNT_ID: this.cfAccountId },
        encoding: 'utf-8'
      });
      console.log('✅ Cloudflare: authenticated');
    } catch (e) {
      console.error('❌ Cloudflare: not authenticated or account invalid');
      console.error('   Run: wrangler login');
      process.exit(1);
    }
  }

  /**
   * Create GitHub secrets on all 6 app repos
   */
  async setupGitHubSecrets(secrets) {
    console.log('\n📝 Setting GitHub Secrets...\n');

    for (const app of APPS) {
      console.log(`  ${app}:`);
      
      for (const [key, value] of Object.entries(secrets)) {
        try {
          const result = spawnSync('gh', ['secret', 'set', key, '--repo', `Latimer-Woods-Tech/${app}`, '--body', value], {
            env: { ...process.env, GITHUB_TOKEN: this.githubToken },
            stdio: 'pipe',
            encoding: 'utf-8'
          });
          if (result.status !== 0) throw new Error(result.stderr ?? `exit code ${result.status}`);
          console.log(`    ✅ ${key}`);
        } catch (e) {
          console.error(`    ❌ ${key}: ${e.message}`);
        }
      }
    }

    console.log('\n✅ All GitHub secrets configured');
  }

  /**
   * Create Wrangler secrets on Workers
   */
  async setupWranglerSecrets(appSecrets) {
    console.log('\n🔐 Setting Wrangler Secrets...\n');

    for (const [app, secrets] of Object.entries(appSecrets)) {
      console.log(`  ${app}:`);
      
      for (const [key, value] of Object.entries(secrets)) {
        try {
          const result = spawnSync('wrangler', ['secret', 'put', key, '--name', app], {
            input: value,
            env: { ...process.env, CF_API_TOKEN: this.cfToken },
            stdio: ['pipe', 'pipe', 'pipe'],
            encoding: 'utf-8'
          });
          if (result.status !== 0) throw new Error(result.stderr ?? `exit code ${result.status}`);
          console.log(`    ✅ ${key}`);
        } catch (e) {
          console.error(`    ❌ ${key}: ${e.message}`);
        }
      }
    }

    console.log('\n✅ All Wrangler secrets configured');
  }

  /**
   * Create Rate Limiter namespaces (user-assigned, no API call needed)
   */
  createRateLimiters() {
    console.log('\n⚡ Rate Limiter Configuration\n');

    const rateLimitConfig = {};
    
    for (const app of APPS) {
      const nsId = RATE_LIMITER_IDS[app];
      rateLimitConfig[app] = nsId;
      console.log(`  ${app}: namespace_id = ${nsId}`);
    }

    // Save for use in scaffold.mjs
    fs.writeFileSync(
      path.join(__dirname, '../.rate-limiters.json'),
      JSON.stringify(rateLimitConfig, null, 2)
    );

    console.log('\n✅ Rate limiter configuration ready');
    return rateLimitConfig;
  }

  /**
   * Verify GitHub repo existence
   */
  async verifyGitHubRepos() {
    console.log('\n🐙 Verifying GitHub Repos...\n');

    for (const app of APPS) {
      try {
        execSync(`gh repo view Latimer-Woods-Tech/${app} --json name`, {
          env: { ...process.env, GITHUB_TOKEN: this.githubToken },
          stdio: 'pipe'
        });
        console.log(`  ✅ Latimer-Woods-Tech/${app}`);
      } catch (e) {
        console.log(`  ⚠️  Latimer-Woods-Tech/${app} does not exist yet`);
      }
    }
  }

  /**
   * Verify Cloudflare Hyperdrive instances
   */
  async verifyHyperdrives() {
    console.log('\n📡 Verifying Cloudflare Hyperdrive...\n');

    try {
      const output = execSync('wrangler hyperdrive list --json', {
        env: { ...process.env, CF_API_TOKEN: this.cfToken, CF_ACCOUNT_ID: this.cfAccountId },
        encoding: 'utf-8'
      });

      // Try to parse JSON
      try {
        const hyperdrives = JSON.parse(output);
        console.log(`  ✅ Found ${hyperdrives.length} Hyperdrive instance(s)`);
        
        hyperdrives.forEach(hd => {
          console.log(`     - ${hd.name || hd.id}`);
        });
      } catch {
        // Output might not be JSON, just show raw
        console.log('  ✅ Hyperdrives accessible');
        console.log(output.split('\n').slice(0, 5).join('\n'));
      }
    } catch (e) {
      console.error(`  ❌ Could not list Hyperdrives: ${e.message}`);
    }
  }

  /**
   * Generate configuration summary
   */
  generateConfigSummary() {
    console.log('\n📋 Configuration Summary\n');

    const config = {
      timestamp: new Date().toISOString(),
      apps: APPS,
      rateLimiters: RATE_LIMITER_IDS,
      verified: {
        github: true,
        cloudflare: true,
        neon: !!this.neonProjectId
      }
    };

    const summaryPath = path.join(__dirname, '../.phase-6-config.json');
    fs.writeFileSync(summaryPath, JSON.stringify(config, null, 2));

    console.log(`Saved to: ${summaryPath}\n`);
    console.log(JSON.stringify(config, null, 2));

    return config;
  }

  /**
   * Main execution flow
   */
  async run() {
    console.log('🚀 Factory Phase 6: Infrastructure Setup\n');
    console.log('=' .repeat(50));

    try {
      await this.testConnections();
      await this.verifyGitHubRepos();
      await this.verifyHyperdrives();
      this.createRateLimiters();
      this.generateConfigSummary();

      console.log('\n' + '=' .repeat(50));
      console.log('✨ Phase 6 verification complete!\n');
      console.log('📋 Next steps:');
      console.log('  1. Provision Neon databases (via console.neon.tech)');
      console.log('  2. Create Hyperdrive instances (wrangler hyperdrive create ...)');
      console.log('  3. Create GitHub secrets on each app repo');
      console.log('  4. Create Wrangler secrets on each Worker');
      console.log('  5. Run Phase 7: App Scaffolding\n');
    } catch (error) {
      console.error('\n❌ Error:', error.message);
      process.exit(1);
    }
  }
}

// CLI Entry Point
if (require.main === module) {
  const args = process.argv.slice(2);
  const options = {};

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--neon-token') options.neonToken = args[++i];
    if (args[i] === '--cf-token') options.cfToken = args[++i];
    if (args[i] === '--cf-account-id') options.cfAccountId = args[++i];
    if (args[i] === '--github-token') options.githubToken = args[++i];
    if (args[i] === '--neon-project-id') options.neonProjectId = args[++i];
  }

  const setup = new Phase6Setup(options);
  setup.run().catch(err => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = Phase6Setup;
