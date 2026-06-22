#!/usr/bin/env node

/**
 * Pre-deploy verification script for admin-studio Worker.
 * 
 * Per CLAUDE.md Verification Requirement:
 * "A fix is done when you have run curl and observed the expected HTTP status code with your own eyes.
 *  CI green = code compiled. curl 200 = it actually works. These are not the same thing."
 * 
 * This script runs comprehensive smoke tests on deployed admin-studio workers.
 * Usage:
 *   node scripts/verify-deployment.mjs [env]
 *   node scripts/verify-deployment.mjs [env] --base-url https://api.example.com
 *   VERIFY_BASE_URL=https://api.example.com node scripts/verify-deployment.mjs [env]
 */

import { spawn } from 'child_process';

const DEFAULT_ENV = 'staging';
// Custom domains — workers.dev URLs return 1042 "Route not active" once a
// Custom Domain is attached, so prefer the branded host.
const ENVS = {
  staging: 'api.admin.latimerwoods.dev',
  production: 'api.apunlimited.com',
};

async function curl(url, options = {}) {
  return new Promise((resolve) => {
    const args = ['-s', '-w', '%{http_code}', '-X', options.method || 'GET'];
    
    if (options.headers) {
      Object.entries(options.headers).forEach(([k, v]) => {
        args.push('-H', `${k}: ${v}`);
      });
    }
    
    if (options.data) {
      args.push('-H', 'Content-Type: application/json');
      args.push('-d', JSON.stringify(options.data));
    }
    
    if (options.timeout) {
      args.push('--max-time', String(options.timeout));
    }
    
    args.push(url);

    let stdout = '';
    const proc = spawn('curl', args, { stdio: 'pipe' });
    
    proc.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    
    proc.on('close', () => {
      const status = stdout.slice(-3);
      const body = stdout.slice(0, -3);
      resolve({ status: parseInt(status, 10), body });
    });
  });
}

function parseJsonSafe(text) {
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch {
    return { ok: false, value: null };
  }
}

async function test(name, fn) {
  try {
    await fn();
    console.log(`✅ ${name}`);
    return true;
  } catch (err) {
    console.error(`❌ ${name}`);
    console.error(`   Error: ${err.message}`);
    return false;
  }
}

function resolveBaseUrl(env, argv) {
  const cliIdx = argv.indexOf('--base-url');
  const cliBase = cliIdx >= 0 ? argv[cliIdx + 1] : undefined;
  const envBase = process.env.VERIFY_BASE_URL;

  if (cliBase) return cliBase.replace(/\/$/, '');
  if (envBase) return envBase.replace(/\/$/, '');

  const host = ENVS[env];
  if (!host) {
    throw new Error(`Unknown env: ${env}. Must be one of: ${Object.keys(ENVS).join(', ')}`);
  }
  return `https://${host}`;
}

function assertNotEdgeError(res, base) {
  const body = res.body ?? '';
  if (res.status === 404 && body.includes('error code: 1042')) {
    throw new Error(
      `Route not active for ${base} (Cloudflare 1042). Use --base-url with the active custom domain.`,
    );
  }
}

async function verify(env = DEFAULT_ENV, argv = process.argv.slice(2)) {
  const base = resolveBaseUrl(env, argv);
  console.log(`\n🔍 Verifying admin-studio (${env}): ${base}\n`);

  const results = [];

  // ─────────────────────────────────────────────────────────────────────
  // Public endpoints (no auth)
  // ─────────────────────────────────────────────────────────────────────

  results.push(
    await test('/health returns 200 + env field', async () => {
      const res = await curl(`${base}/health`, { timeout: 5 });
      assertNotEdgeError(res, base);
      if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
      const parsed = parseJsonSafe(res.body);
      if (!parsed.ok) throw new Error('Health response was not valid JSON');
      const json = parsed.value;
      if (!json.env) throw new Error('Missing env field');
      if (json.env !== env) throw new Error(`Expected env=${env}, got ${json.env}`);
    })
  );

  results.push(
    await test('/manifest is public + has manifestVersion', async () => {
      const res = await curl(`${base}/manifest`, { timeout: 5 });
      assertNotEdgeError(res, base);
      if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
      const parsed = parseJsonSafe(res.body);
      if (!parsed.ok) throw new Error('Manifest response was not valid JSON');
      const json = parsed.value;
      if (json.manifestVersion !== 1) throw new Error('manifestVersion not 1');
      if (json.app !== 'admin-studio') throw new Error('app field wrong');
    })
  );

  // ─────────────────────────────────────────────────────────────────────
  // Auth endpoint
  // ─────────────────────────────────────────────────────────────────────

  results.push(
    await test('/auth/login rejects bad credentials (or is disabled in production)', async () => {
      const res = await curl(`${base}/auth/login`, {
        method: 'POST',
        data: { email: 'bad@example.com', password: 'wrong', env },
        timeout: 5,
      });
      assertNotEdgeError(res, base);
      const expectedStatus = env === 'production' ? 503 : 401;
      if (res.status !== expectedStatus) throw new Error(`Expected ${expectedStatus}, got ${res.status}`);
      const parsed = parseJsonSafe(res.body);
      if (!parsed.ok) throw new Error('Login response was not valid JSON');
      const json = parsed.value;
      if (!json.error) throw new Error('Missing error field');
    })
  );

  results.push(
    await test('/auth/login validates env claim', async () => {
      const wrongEnv = env === 'production' ? 'staging' : 'production';
      const res = await curl(`${base}/auth/login`, {
        method: 'POST',
        data: { email: 'test@example.com', password: 'test', env: wrongEnv },
        timeout: 5,
      });
      assertNotEdgeError(res, base);
      // Should reject with 400 because env doesn't match worker's env
      if (res.status !== 400) throw new Error(`Expected 400, got ${res.status}`);
    })
  );

  // ─────────────────────────────────────────────────────────────────────
  // Protected endpoints (no auth = 401)
  // ─────────────────────────────────────────────────────────────────────

  results.push(
    await test('/me returns 401 without bearer token', async () => {
      const res = await curl(`${base}/me`, { timeout: 5 });
      assertNotEdgeError(res, base);
      if (res.status !== 401) throw new Error(`Expected 401, got ${res.status}`);
      const parsed = parseJsonSafe(res.body);
      if (!parsed.ok) throw new Error('/me response was not valid JSON');
      const json = parsed.value;
      if (!json.error) throw new Error('Missing error field');
    })
  );

  results.push(
    await test('/me returns 401 with invalid token + includes requestId', async () => {
      const res = await curl(`${base}/me`, {
        headers: { Authorization: 'Bearer invalid' },
        timeout: 5,
      });
      assertNotEdgeError(res, base);
      if (res.status !== 401) throw new Error(`Expected 401, got ${res.status}`);
      const parsed = parseJsonSafe(res.body);
      if (!parsed.ok) throw new Error('/me invalid-token response was not valid JSON');
      const json = parsed.value;
      if (!json.error) throw new Error('Missing error field');
      if (!json.requestId) throw new Error('Missing requestId for observability');
    })
  );

  results.push(
    await test('/tests returns 401 without token', async () => {
      const res = await curl(`${base}/tests`, { timeout: 5 });
      assertNotEdgeError(res, base);
      if (res.status !== 401) throw new Error(`Expected 401, got ${res.status}`);
    })
  );

  results.push(
    await test('/repo/tree returns 401 without token', async () => {
      const res = await curl(`${base}/repo/tree`, { timeout: 5 });
      assertNotEdgeError(res, base);
      if (res.status !== 401) throw new Error(`Expected 401, got ${res.status}`);
    })
  );

  // ─────────────────────────────────────────────────────────────────────
  // Not found (404)
  // ─────────────────────────────────────────────────────────────────────

  results.push(
    await test('404 on unknown path', async () => {
      const res = await curl(`${base}/unknown-route-xyz123`, { timeout: 5 });
      assertNotEdgeError(res, base);
      if (res.status !== 404) throw new Error(`Expected 404, got ${res.status}`);
      const parsed = parseJsonSafe(res.body);
      if (!parsed.ok) throw new Error('404 response was not valid JSON');
      const json = parsed.value;
      if (!json.error) throw new Error('Missing error field');
      if (!json.requestId) throw new Error('Missing requestId');
    })
  );

  // ─────────────────────────────────────────────────────────────────────
  // Report
  // ─────────────────────────────────────────────────────────────────────

  const passed = results.filter(Boolean).length;
  const total = results.length;

  console.log(`\n📊 Results: ${passed}/${total} passed\n`);

  if (passed === total) {
    console.log('✅ All verification tests passed!');
    process.exit(0);
  } else {
    console.log('❌ Some tests failed. See above for details.');
    process.exit(1);
  }
}

const env = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : DEFAULT_ENV;
verify(env, process.argv.slice(2)).catch((err) => {
  console.error('Fatal error:', err.message);
  process.exit(2);
});
