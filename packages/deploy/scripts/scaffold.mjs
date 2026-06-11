#!/usr/bin/env node
// @node-runtime — Node.js CLI script; not a Cloudflare Worker.
/**
 * scaffold.mjs — Factory app scaffolding CLI
 *
 * **Runtime: Node.js only.** This script runs under `node` (shebang above) in a
 * developer terminal or GitHub Actions runner — NOT inside a Cloudflare Worker.
 * `node:` protocol imports, `process.argv`, `__dirname`, and `execSync` are all
 * intentional and correct here; the Worker constraint that bans `node:` imports
 * applies only to files compiled with tsup and deployed to Workers.
 *
 * Usage:
 *   node scaffold.mjs <app-name> [--github] [--no-deploy]
 *     [--hyperdrive-id <id>] [--rate-limiter-id <id>]
 *
 * Flags:
 *   --github             Create a private GitHub repo and push (requires gh CLI + auth)
 *   --no-deploy          Skip the optional first Cloudflare deploy prompt
 *   --no-install         Skip npm install (use in CI when packages aren't yet published)
 *   --hyperdrive-id <id> Skip the Neon prompt and use this Hyperdrive ID directly
 *   --rate-limiter-id <id> Use this rate limiter namespace ID instead of placeholder
 *
 * Creates ./<app-name>/ in the current working directory with a fully wired
 * Cloudflare Worker that consumes @latimer-woods-tech/* packages.
 */

import { execSync, execFileSync } from 'child_process';
import { writeFileSync, readFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { createInterface } from 'readline';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '../../..');

// ── Args ─────────────────────────────────────────────────────────────────────────────────

const APP_NAME = process.argv[2];
const CREATE_GITHUB = process.argv.includes('--github');
const SKIP_DEPLOY = process.argv.includes('--no-deploy');
const SKIP_INSTALL = process.argv.includes('--no-install');
const NO_SECRETS = process.argv.includes('--no-secrets');
const SKIP_PREREQ = process.argv.includes('--no-prereq');
const CAPABILITY_RECIPE = (() => {
  const idx = process.argv.indexOf('--recipe');
  const value = idx !== -1 ? process.argv[idx + 1] ?? null : null;
  if (value !== null && !/^[a-z][a-z0-9-]*$/u.test(value)) {
    console.error(`Error: --recipe value "${value}" is invalid — must be a kebab-case identifier`);
    process.exit(1);
  }
  return value;
})();
const CAPABILITY_PLAN = (() => {
  const idx = process.argv.indexOf('--plan');
  return idx !== -1 ? process.argv[idx + 1] ?? null : null;
})();

const CLI_HYPERDRIVE_ID = (() => {
  const idx = process.argv.indexOf('--hyperdrive-id');
  return idx !== -1 ? process.argv[idx + 1] : null;
})();

const CLI_RATE_LIMITER_ID = (() => {
  const idx = process.argv.indexOf('--rate-limiter-id');
  return idx !== -1 ? process.argv[idx + 1] : null;
})();

const CLI_HANDOFF_PATH = (() => {
  const idx = process.argv.indexOf('--handoff');
  return idx !== -1 ? process.argv[idx + 1] : null;
})();

if (!APP_NAME) {
  console.error('Usage: node scaffold.mjs <app-name> [--github] [--no-deploy] [--no-install] [--no-secrets] [--no-prereq] [--handoff <path>] [--recipe <id>] [--plan <path>]');
  process.exit(1);
}

if (!/^[a-z][a-z0-9-]*$/.test(APP_NAME)) {
  console.error('Error: app name must be lowercase alphanumeric with hyphens, starting with a letter.');
  process.exit(1);
}

const TARGET = join(process.cwd(), APP_NAME);

if (existsSync(TARGET)) {
  console.error(`Error: directory "${APP_NAME}" already exists in ${process.cwd()}`);
  process.exit(1);
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const rl = createInterface({ input: process.stdin, output: process.stdout });
const ask = (q) => new Promise((res) => rl.question(q, res));

function run(cmd, opts = {}) {
  const cwd = opts.cwd ?? TARGET;
  if (!opts.silent) console.log(`  $ ${cmd}`);
  try {
    return execSync(cmd, { stdio: opts.capture ? 'pipe' : 'inherit', cwd, encoding: 'utf8' });
  } catch (err) {
    console.error(`\n❌ Command failed: ${cmd}`);
    if (err.stderr) console.error(err.stderr);
    process.exit(1);
  }
}

function write(relPath, content) {
  const full = join(TARGET, relPath);
  const dir = full.substring(0, Math.max(full.lastIndexOf('/'), full.lastIndexOf('\\')) );
  if (dir) mkdirSync(dir, { recursive: true });
  writeFileSync(full, content, 'utf8');
  console.log(`  📄 ${relPath}`);
}

// ── Capability handoff loader (optional, --handoff <path>) ───────────────────
//
// When --handoff is supplied, the script consumes a handoff package emitted
// by /capabilities/handoff (admin-studio). The handoff's compiled plan is
// the single seam between the design studio and the scaffold layer; we
// augment the generated files with:
//
//   1. plan.packages → package.json dependencies (versionRange preserved)
//   2. plan.env.secrets → .dev.vars.example entries (all secrets, idempotent)
//   3. the full handoff → factory/handoff.json (audit trail in the new repo)
//   4. plan.smokeChecks + plan.expectedSurfaces → factory/SMOKE.md
//   5. plan.env.secrets (recipe-specific) → src/env.ts Env interface
//   6. plan.env.vars (recipe-specific) → src/env.ts Env interface + wrangler.jsonc vars blocks

function loadHandoff(path) {
  if (!path) return null;
  let body;
  try {
    body = JSON.parse(readFileSync(path, 'utf8'));
  } catch (err) {
    console.error(`\n❌ Cannot read handoff at ${path}: ${err.message}`);
    process.exit(1);
  }
  // Accept either the raw handoff body or the route envelope { handoff: ... }
  const handoff = body?.handoff ?? body;
  const errors = [];
  if (handoff?.schemaVersion !== '1.0.0') errors.push(`schemaVersion must be "1.0.0" (got ${handoff?.schemaVersion})`);
  if (handoff?.kind !== 'scaffold-handoff') errors.push(`kind must be "scaffold-handoff" (got ${handoff?.kind})`);
  if (!handoff?.recipeId) errors.push('recipeId is required');
  if (!handoff?.plan?.scaffold?.stagingFirst) errors.push('plan.scaffold.stagingFirst must be true');
  if (errors.length > 0) {
    console.error(`\n❌ Invalid handoff package:`);
    for (const e of errors) console.error(`   - ${e}`);
    process.exit(1);
  }
  console.log(`\n📦 Capability handoff loaded:`);
  console.log(`   recipe: ${handoff.recipeId}`);
  console.log(`   concept: ${handoff.conceptId}`);
  if (handoff.hash) console.log(`   hash: ${handoff.hash}`);
  return handoff;
}

const HANDOFF = loadHandoff(CLI_HANDOFF_PATH);

function applyHandoffToScaffold(handoff) {
  if (!handoff) return;
  console.log('\n🧬 Applying capability handoff to scaffold...');
  const plan = handoff.plan;

  // 1. Merge plan.packages into package.json dependencies.
  const pkgPath = join(TARGET, 'package.json');
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
  pkg.dependencies ??= {};
  for (const entry of plan.packages ?? []) {
    if (!pkg.dependencies[entry.package]) {
      pkg.dependencies[entry.package] = entry.versionRange;
      console.log(`  📦 +dep ${entry.package}@${entry.versionRange}`);
    }
  }
  writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf8');

  // 2. Append plan.env.secrets to .dev.vars.example (idempotent).
  const devVarsPath = join(TARGET, '.dev.vars.example');
  if (existsSync(devVarsPath)) {
    const existing = readFileSync(devVarsPath, 'utf8');
    const additions = (plan.env?.secrets ?? [])
      .filter((secret) => !existing.includes(`${secret}=`))
      .map((secret) => `${secret}=`);
    if (additions.length > 0) {
      const block = `\n# Added from capability handoff (${handoff.recipeId})\n${additions.join('\n')}\n`;
      writeFileSync(devVarsPath, existing.trimEnd() + '\n' + block, 'utf8');
      console.log(`  🔐 +${additions.length} secret stub(s) → .dev.vars.example`);
    }
  }

  // 3. Persist the handoff itself as factory/handoff.json (audit trail).
  write('factory/handoff.json', JSON.stringify(handoff, null, 2) + '\n');

  // 4. Emit factory/SMOKE.md so the new app ships with documented expectations.
  const smokeLines = [
    `# ${APP_NAME} — Smoke Expectations`,
    '',
    `Generated from capability handoff for recipe \`${handoff.recipeId}\` (concept \`${handoff.conceptId}\`).`,
    handoff.hash ? `Handoff hash: \`${handoff.hash}\`` : '',
    '',
    '## Expected surfaces',
    '',
    ...(plan.expectedSurfaces ?? []).map((surface) => `- \`${surface}\``),
    '',
    '## Smoke checks',
    '',
    ...(plan.smokeChecks ?? []).map((check) =>
      `- \`${check.path}\` → expect ${check.expectedStatus}${check.expectContains ? `, contains \`${check.expectContains}\`` : ''}`,
    ),
    '',
    '## Required env',
    '',
    `- Secrets: ${(plan.env?.secrets ?? []).join(', ') || '_none_'}`,
    `- Vars: ${(plan.env?.vars ?? []).join(', ') || '_none_'}`,
    `- Bindings (required): ${(plan.bindings?.required ?? []).join(', ') || '_none_'}`,
    `- Bindings (optional): ${(plan.bindings?.optional ?? []).join(', ') || '_none_'}`,
    '',
    '## Constraints',
    '',
    ...(plan.constraints ?? []).map((c) => `- ${c}`),
    '',
  ].filter((line) => line !== '');
  write('factory/SMOKE.md', smokeLines.join('\n') + '\n');

  // 5. Thread recipe-specific secrets into src/env.ts (Env interface).
  //    The scaffold template ships a fixed set of base secrets. Any additional
  //    secrets declared in the recipe's envContract are injected here so the
  //    Worker's TypeScript types stay in sync with what the recipe requires.
  const BASE_ENV_SECRETS = new Set([
    'JWT_SECRET', 'SENTRY_DSN', 'POSTHOG_KEY',
    'ANTHROPIC_API_KEY', 'GROQ_API_KEY', 'DEEPSEEK_API_KEY', 'RESEND_API_KEY',
  ]);
  const secretAdditions = (plan.env?.secrets ?? []).filter((s) => !BASE_ENV_SECRETS.has(s));

  // 6. Thread recipe-specific vars into src/env.ts and wrangler.jsonc.
  const BASE_ENV_VARS = new Set(['ENVIRONMENT', 'WORKER_NAME']);
  const varAdditions = (plan.env?.vars ?? []).filter((v) => !BASE_ENV_VARS.has(v));

  const envTsPath = join(TARGET, 'src/env.ts');
  if (secretAdditions.length > 0 || varAdditions.length > 0) {
    // Use try/catch instead of existsSync+readFileSync to avoid TOCTOU (CWE-367).
    let envTs;
    try { envTs = readFileSync(envTsPath, 'utf8'); } catch { envTs = null; }
    if (envTs !== null) {
      if (secretAdditions.length > 0) {
        // Insert recipe secrets before the "Non-secret vars" comment so the
        // logical grouping (secrets vs vars) in the generated file is preserved.
        const secretLines = secretAdditions.map((s) => `  ${s}: string;`).join('\n');
        const secretBlock = `\n  // ── Recipe secrets (${handoff.recipeId}) ─────────────────────────────────────\n${secretLines}\n`;
        envTs = envTs.replace(
          /(\n  \/\/ ── Non-secret vars)/,
          `${secretBlock}$1`,
        );
        console.log(`  🔐 +${secretAdditions.length} secret type(s) → src/env.ts`);
      }
      if (varAdditions.length > 0) {
        // Append recipe vars at the end of the Env interface, before the closing `}`.
        const varLines = varAdditions.map((v) => `  ${v}: string;`).join('\n');
        const varBlock = `\n  // ── Recipe vars (${handoff.recipeId}) ───────────────────────────────────────\n${varLines}\n`;
        envTs = envTs.replace(/(\n}\s*\n?)$/, `${varBlock}$1`);
        console.log(`  ⚙️  +${varAdditions.length} var type(s) → src/env.ts`);
      }
      writeFileSync(envTsPath, envTs, 'utf8');
    }
  }

  // Thread recipe vars into wrangler.jsonc (both root and staging vars blocks).
  if (varAdditions.length > 0) {
    const wranglerPath = join(TARGET, 'wrangler.jsonc');
    // Use try/catch instead of existsSync+readFileSync to avoid TOCTOU (CWE-367).
    let wrangler;
    try { wrangler = readFileSync(wranglerPath, 'utf8'); } catch { wrangler = null; }
    if (wrangler !== null) {
      // Root vars block: 4-space indent, WORKER_NAME is the last key.
      const rootVarLines = varAdditions.map((v) => `    "${v}": ""`).join(',\n');
      wrangler = wrangler.replace(
        `    "WORKER_NAME": "${APP_NAME}"\n  },`,
        `    "WORKER_NAME": "${APP_NAME}",\n${rootVarLines}\n  },`,
      );
      // Staging vars block: 8-space indent, WORKER_NAME is the last key.
      const stagingVarLines = varAdditions.map((v) => `        "${v}": ""`).join(',\n');
      wrangler = wrangler.replace(
        `        "WORKER_NAME": "${APP_NAME}-staging"\n      }`,
        `        "WORKER_NAME": "${APP_NAME}-staging",\n${stagingVarLines}\n      }`,
      );
      writeFileSync(wranglerPath, wrangler, 'utf8');
      console.log(`  ⚙️  +${varAdditions.length} var(s) → wrangler.jsonc (root + staging)`);
    }
  }

  console.log('  ✅ Handoff applied. See factory/handoff.json and factory/SMOKE.md.');
}

function generateWorkflowCallers() {
  const generatorScript = resolve(REPO_ROOT, 'scripts', 'gen-deploy-workflow.mjs');
  const parts = [
    `node "${generatorScript}"`,
    `--app-name ${APP_NAME}`,
    `--output "${TARGET}"`,
    CAPABILITY_RECIPE ? `--recipe ${CAPABILITY_RECIPE}` : '',
    CAPABILITY_PLAN ? `--plan "${resolve(process.cwd(), CAPABILITY_PLAN)}"` : '',
  ].filter(Boolean);

  run(parts.join(' '), { cwd: REPO_ROOT });
}

// ── Prerequisites ─────────────────────────────────────────────────────────────

function checkPrerequisites() {
  console.log('\n🔍 Checking prerequisites...');

  for (const tool of ['node', 'npm', 'git', 'wrangler']) {
    try {
      execSync(`${tool} --version`, { stdio: 'pipe' });
      console.log(`  ✅ ${tool}`);
    } catch {
      console.error(`  ❌ ${tool} is required but not found.`);
      process.exit(1);
    }
  }

  if (CREATE_GITHUB) {
    try {
      execSync('gh --version', { stdio: 'pipe' });
      console.log('  ✅ gh');
    } catch {
      console.error('  ❌ gh CLI required for --github. Install: https://cli.github.com');
      process.exit(1);
    }
  }

  if (!process.env.NODE_AUTH_TOKEN) {
    console.warn('\n⚠️  NODE_AUTH_TOKEN is not set.');
    console.warn('   npm install will fail without a GitHub PAT with read:packages scope.');
    console.warn('   Create one at: https://github.com/settings/tokens/new?scopes=read:packages');
    console.warn('   Then run:  export NODE_AUTH_TOKEN=<your-token>');
    console.warn('   Or set it in your shell profile and re-run.\n');
  }
}

// ── Capability Plan Loading ─────────────────────────────────────────────────

function loadCapabilityPlan() {
  if (CAPABILITY_PLAN) {
    const planPath = resolve(process.cwd(), CAPABILITY_PLAN);
    if (!existsSync(planPath)) {
      console.error(`Error: plan file not found: ${planPath}`);
      process.exit(1);
    }
    return JSON.parse(readFileSync(planPath, 'utf8'));
  }

  if (CAPABILITY_RECIPE) {
    const compiledPlanPath = join(REPO_ROOT, 'capabilities', 'compiled', `${CAPABILITY_RECIPE}.plan.json`);
    if (!existsSync(compiledPlanPath)) {
      console.log(`
🔧 Compiled plan for recipe ${CAPABILITY_RECIPE} not found — compiling now...`);
      try {
        // Invoke shell-free via execFileSync with an explicit argv array so the
        // repo path and recipe id are passed as literal arguments rather than
        // interpolated into a shell string (fixes CodeQL command-injection).
        execFileSync(
          'node',
          [
            join(REPO_ROOT, 'scripts', 'compile-capability-recipe.mjs'),
            '--recipe', CAPABILITY_RECIPE,
            '--output', compiledPlanPath,
          ],
          { stdio: 'inherit', cwd: REPO_ROOT },
        );
      } catch (err) {
        console.error('Failed to compile capability recipe:', err.message);
        process.exit(1);
      }
    }
    return JSON.parse(readFileSync(compiledPlanPath, 'utf8'));
  }

  return null;
}

// ── File Generation Helpers ────────────────────────────────────────────────────

function buildPackageDependencies(plan) {
  const base = {
    '@latimer-woods-tech/errors': '^0.2.0',
    '@latimer-woods-tech/logger': '^0.2.0',
    '@latimer-woods-tech/monitoring': '^0.2.0',
    '@latimer-woods-tech/auth': '^0.2.0',
    '@latimer-woods-tech/neon': '^0.2.0',
    '@latimer-woods-tech/flags': '^0.1.0',
    '@latimer-woods-tech/deploy': '^0.2.0',
    hono: '^4.12.15',
  };
  const packages = plan?.packages ?? [];
  for (const pkg of packages) {
    base[pkg.package] = pkg.versionRange;
  }
  return base;
}

function renderWranglerJson(plan, hyperdriveId, rateLimiterId) {
  const bindings = plan?.bindings ?? {};
  const config = {
    name: APP_NAME,
    main: 'src/index.ts',
    compatibility_date: '2026-05-01',
    compatibility_flags: ['nodejs_compat'],
    hyperdrive: [{ binding: 'DB', id: hyperdriveId }],
    // Flagship feature flags (every Factory app binds FLAGS).
    flagship: { binding: 'FLAGS' },
    // Flag telemetry sink (shared flag-meter D1 database).
    d1_databases: [
      { binding: 'FLAG_TELEMETRY', database_id: 'f03af37d-11d9-4428-b0db-b3cdca8fe7c4', database_name: 'flag-meter' },
    ],
    vars: { ENVIRONMENT: 'production', WORKER_NAME: APP_NAME },
    ...(rateLimiterId ? {
      unsafe: {
        bindings: [
          {
            type: 'ratelimit',
            name: 'AUTH_RATE_LIMITER',
            namespace_id: String(rateLimiterId),
            simple: { limit: 60, period: 60 },
          },
        ],
      },
    } : {}),
    ...(bindings.kv?.length ? {
      kv_namespaces: bindings.kv.map((b) => ({ binding: b, id: 'REPLACE_WITH_KV_ID' })),
    } : {}),
    env: {
      staging: {
        name: `${APP_NAME}-staging`,
        vars: { ENVIRONMENT: 'staging', WORKER_NAME: `${APP_NAME}-staging` },
      },
    },
  };
  return JSON.stringify(config, null, 2) + '\n';
}

function renderDevVarsExample(plan) {
  const secrets = plan?.env?.secrets ?? [];
  const vars = plan?.env?.vars ?? [];
  const lines = [
    '# Local dev secrets — copy to .dev.vars and fill in values.',
    '# Never commit .dev.vars to git.',
    '',
    ...secrets.map((s) => `${s}=`),
    ...vars.map((v) => `${v}=`),
  ];
  return lines.join('\n') + '\n';
}

function renderIndexSource(appName, plan) {
  const primitives = plan?.packages ?? [];
  const imports = primitives.map((p) => `// import { ... } from '${p.package}';`).join('\n');

  // Infer HTTP method: action-verb last segment → POST, otherwise GET.
  const ACTION_VERBS = new Set(['start', 'stop', 'end', 'submit', 'publish', 'pause', 'resume', 'cancel', 'trigger', 'fire', 'send', 'create', 'delete', 'update', 'approve', 'reject']);
  const surfaces = (plan?.expectedSurfaces ?? []).filter((s) => s !== '/health');
  const extraRoutes = surfaces.map((surface) => {
    const lastSegment = surface.split('/').pop() ?? '';
    const method = ACTION_VERBS.has(lastSegment) ? 'post' : 'get';
    return `app.${method}('${surface}', (c) => c.json({ todo: true }));`;
  });

  const routeLines = [
    `app.get('/health', (c) => c.json({ status: 'ok', app: '${appName}' }));`,
    ...extraRoutes,
  ].join('\n');

  return `import { Hono } from 'hono';
import type { Env } from './env.js';

${imports ? imports + '\n\n' : ''}const app = new Hono<{ Bindings: Env }>();

${routeLines}

export default app;
`;
}

// ── File Generation ───────────────────────────────────────────────────────────

function generateFiles(hyperdriveId, rateLimiterId, capabilityPlan = null) {
  console.log('\n📁 Generating files...');

  // .gitignore
  write('.gitignore', `node_modules/
.wrangler/
coverage/
.dev.vars
*.local
`);

  // .npmrc — GitHub Packages auth for @adrper79-dot scope
  write('.npmrc', `@latimer-woods-tech:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=\${NODE_AUTH_TOKEN}
`);

  // package.json
  const dependencies = buildPackageDependencies(capabilityPlan);
  write('package.json', JSON.stringify({
    name: APP_NAME,
    version: '0.1.0',
    private: true,
    type: 'module',
    scripts: {
      dev: 'wrangler dev',
      deploy: 'wrangler deploy',
      'deploy:staging': 'wrangler deploy --env staging',
      typecheck: 'tsc --noEmit',
      lint: 'biome check src',
      format: 'biome format --write src',
      test: 'vitest run',
      'test:watch': 'vitest',
    },
    dependencies,
    devDependencies: {
      '@latimer-woods-tech/biome-config': '^0.1.0',
      '@latimer-woods-tech/testing': '^0.2.0',
      '@biomejs/biome': '^1.9.4',
      '@cloudflare/workers-types': '^4.20260426.1',
      '@cloudflare/vitest-pool-workers': '^0.8.0',
      'drizzle-kit': '^0.31.0',
      typescript: '^5.4.0',
      wrangler: '^4.0.0',
      vitest: '^1.6.0',
      '@vitest/coverage-v8': '^1.6.0',
    },
  }, null, 2) + '\n');

  // biome.json — extends shared config; existing apps are unaffected.
  write('biome.json', JSON.stringify({
    $schema: 'https://biomejs.dev/schemas/1.9.4/schema.json',
    extends: ['@latimer-woods-tech/biome-config/biome.json'],
  }, null, 2) + '\n');

  // tsconfig.json
  write('tsconfig.json', JSON.stringify({
    compilerOptions: {
      target: 'ES2022',
      module: 'ESNext',
      moduleResolution: 'bundler',
      lib: ['ES2022', 'WebWorker'],
      strict: true,
      noUncheckedIndexedAccess: true,
      types: ['@cloudflare/workers-types'],
      noEmit: true,
    },
    include: ['src/**/*'],
    exclude: ['node_modules'],
  }, null, 2) + '\n');

  // wrangler.jsonc
  write('wrangler.jsonc', renderWranglerJson(capabilityPlan, hyperdriveId, rateLimiterId));

  // src/env.ts — Cloudflare Worker bindings type
  write('src/env.ts', `/**
 * Cloudflare Worker environment bindings for ${APP_NAME}.
 * Extend this interface as you add Hyperdrive, KV, R2, or other bindings.
 */
export interface Env {
  // ── Cloudflare bindings ──────────────────────────────────────────────────
  DB: Hyperdrive;
  AUTH_RATE_LIMITER: RateLimit;
  /** Cloudflare Flagship feature-flag binding. */
  FLAGS: Fetcher;
  /** flag-meter D1 database for flag evaluation telemetry. */
  FLAG_TELEMETRY: D1Database;

  // ── Secrets (set via wrangler secret put or GitHub Actions env secrets) ──
  JWT_SECRET: string;
  SENTRY_DSN: string;
  POSTHOG_KEY: string;
  ANTHROPIC_API_KEY: string;
  GROQ_API_KEY: string;
  DEEPSEEK_API_KEY?: string;
  RESEND_API_KEY: string;

  // ── Non-secret vars (wrangler.jsonc [vars]) ──────────────────────────────
  ENVIRONMENT: string;
  WORKER_NAME: string;
}
`);

  // src/index.ts — minimal working Hono app
  write('src/index.ts', renderIndexSource(APP_NAME, capabilityPlan));







  // drizzle.config.ts
  write('drizzle.config.ts', `import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './src/db/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env['DATABASE_URL'] ?? '',
  },
});
`);

  // src/db/schema.ts — placeholder
  write('src/db/schema.ts', `/**
 * Drizzle ORM schema for ${APP_NAME}.
 * Replace this placeholder with your app's table definitions.
 * Run: npx drizzle-kit generate  (to create SQL migration files)
 * Run: npx drizzle-kit migrate   (to apply migrations to Neon)
 */
import { pgTable, text, uuid, timestamptz } from 'drizzle-orm/pg-core';

// Example table — delete this and add your own:
export const example = pgTable('example', {
  id:        uuid('id').primaryKey().defaultRandom(),
  userId:    text('user_id').notNull(),
  createdAt: timestamptz('created_at').notNull().defaultNow(),
});
`);

  // src/db/migrations/.gitkeep
  write('src/db/migrations/.gitkeep', '');

  // renovate.json
  write('renovate.json', JSON.stringify({
    '$schema': 'https://docs.renovatebot.com/renovate-schema.json',
    extends: ['config:base'],
    registryUrls: ['https://npm.pkg.github.com'],
    packageRules: [{
      matchPackagePrefixes: ['@latimer-woods-tech/'],
      pinVersions: true,
      automerge: false,
      labels: ['factory-core-update'],
      commitMessagePrefix: 'chore(deps):',
    }],
  }, null, 2) + '\n');

  // docs/runbooks/ skeleton
  const runbooks = [
    ['getting-started.md', `# ${APP_NAME} — Getting Started\n\n## Local Dev\n\n\`\`\`bash\ncp .dev.vars.example .dev.vars\n# Fill in .dev.vars values\nnpm install\nnpm run dev\n\`\`\`\n\n## First Deploy\n\nSee deployment.md\n`],
    ['deployment.md', `# ${APP_NAME} — Deployment\n\n## Staging\n\n\`\`\`bash\nwrangler deploy --env staging\ncurl https://${APP_NAME}-staging.adrper79.workers.dev/health\n\`\`\`\n\n## Production\n\n\`\`\`bash\nwrangler deploy\ncurl https://${APP_NAME}.adrper79.workers.dev/health\n\`\`\`\n\n## Rollback\n\n\`\`\`bash\nwrangler rollback\n\`\`\`\n`],
    ['secret-rotation.md', `# ${APP_NAME} — Secret Rotation\n\n| Secret | Rotate Every | Command |\n|---|---|---|\n| JWT_SECRET | 90 days | \`wrangler secret put JWT_SECRET --name ${APP_NAME}\` |\n| SENTRY_DSN | Never (on compromise) | \`wrangler secret put SENTRY_DSN --name ${APP_NAME}\` |\n| POSTHOG_KEY | Never (on compromise) | \`wrangler secret put POSTHOG_KEY --name ${APP_NAME}\` |\n`],
    ['database.md', `# ${APP_NAME} — Database\n\n## Generate Migration\n\n\`\`\`bash\nnpx drizzle-kit generate\n\`\`\`\n\n## Apply Migration\n\n\`\`\`bash\nexport DATABASE_URL=\"postgresql://...\"\nnpx drizzle-kit migrate\n\`\`\`\n\n## Preview Branch (CI)\n\nSet NEON_PREVIEW_URL in GitHub repo secrets to run migration dry-run in CI.\n`],
    ['slo.md', `# ${APP_NAME} — SLO\n\n## Targets\n\n| Metric | Target |\n|---|---|\n| p99 latency | < 200ms |\n| Error rate | < 0.1% |\n| Availability | 99.9% |\n\n## Error Budget\n\n0.1% errors / 30 days = ~43 minutes downtime budget.\nSentry alert threshold: > 10 errors/hour triggers immediate response.\n`],
  ];
  for (const [name, content] of runbooks) {
    write(`docs/runbooks/${name}`, content);
  }

  // src/index.test.ts — starter test
  write('src/index.test.ts', `import { describe, it, expect } from 'vitest';
import app from './index.js';

describe('${APP_NAME}', () => {
  it('GET /health returns ok', async () => {
    const res = await app.request('/health', {}, {
      ENVIRONMENT: 'test',
      WORKER_NAME: '${APP_NAME}',
      DB: {} as Hyperdrive,
      FLAGS: {} as Fetcher,
      FLAG_TELEMETRY: {} as D1Database,
      AUTH_RATE_LIMITER: {} as RateLimit,
      JWT_SECRET: 'test-secret',
      SENTRY_DSN: '',
      POSTHOG_KEY: '',
      ANTHROPIC_API_KEY: '',
      GROQ_API_KEY: '',
      RESEND_API_KEY: '',
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ status: 'ok' });
  });
});
`);

  // vitest.config.ts
  write('vitest.config.ts', `import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    coverage: {
      provider: 'v8',
      thresholds: { lines: 80, functions: 80, branches: 75 },
    },
  },
});
`);

  // .dev.vars.example — local dev secrets template
  write('.dev.vars.example', renderDevVarsExample(capabilityPlan));

  // .github/workflows/ci.yml + deploy.yml
  generateWorkflowCallers();

  console.log('\n  ✅ All files generated.');
}

// ── Hyperdrive ────────────────────────────────────────────────────────────────

async function createHyperdrive() {
  // If --hyperdrive-id was passed on the CLI, skip the interactive prompt
  if (CLI_HYPERDRIVE_ID) {
    console.log(`\n🗄️  Hyperdrive ID provided via CLI: ${CLI_HYPERDRIVE_ID}`);
    return CLI_HYPERDRIVE_ID;
  }

  console.log('\n🗄️  Neon / Hyperdrive setup');
  console.log('   (Press Enter to skip — update wrangler.jsonc manually later)');
  const neonUrl = await ask('   Neon connection string (postgres://...): ');

  if (!neonUrl.trim()) {
    console.log('   ⏭  Skipped. Set the "id" in wrangler.jsonc before deploying.');
    return 'REPLACE_WITH_HYPERDRIVE_ID';
  }

  console.log('\n  Creating Hyperdrive binding...');
  try {
    const output = execSync(
      `wrangler hyperdrive create ${APP_NAME}-db --connection-string "${neonUrl.trim()}"`,
      { encoding: 'utf8', stdio: 'pipe', cwd: process.cwd() },
    );
    const match = /([0-9a-f]{32}|[0-9a-f-]{36})/i.exec(output);
    if (match?.[1]) {
      console.log(`  ✅ Hyperdrive ID: ${match[1]}`);
      return match[1];
    }
    console.warn('  ⚠️  Could not parse Hyperdrive ID from output:');
    console.warn('  ', output.trim());
    console.warn('     Update wrangler.jsonc manually.');
    return 'REPLACE_WITH_HYPERDRIVE_ID';
  } catch (err) {
    console.warn('  ⚠️  Hyperdrive creation failed. Create it manually:');
    console.warn(`     wrangler hyperdrive create ${APP_NAME}-db --connection-string "..."`);
    return 'REPLACE_WITH_HYPERDRIVE_ID';
  }
}

// ── Secrets ───────────────────────────────────────────────────────────────────

async function configureSecrets() {
  const SECRETS = [
    'JWT_SECRET',
    'SENTRY_DSN',
    'POSTHOG_KEY',
    'ANTHROPIC_API_KEY',
    'DEEPSEEK_API_KEY',
    'GROK_API_KEY',
    'GROQ_API_KEY',
    'RESEND_API_KEY',
  ];

  console.log(`\n  Configuring secrets for Worker: ${APP_NAME}`);
  console.log('  (Leave blank to skip — set later with: wrangler secret put <NAME>)');

  for (const secret of SECRETS) {
    const value = await ask(`  ${secret}: `);
    if (value.trim()) {
      try {
        execSync(`wrangler secret put ${secret} --name ${APP_NAME}`, {
          input: value.trim(),
          stdio: ['pipe', 'inherit', 'inherit'],
          cwd: TARGET,
          encoding: 'utf8',
        });
        console.log(`  ✅ ${secret} set.`);
      } catch {
        console.warn(`  ⚠️  Failed to set ${secret}. Set it manually later.`);
      }
    } else {
      console.log(`  ⏭  ${secret} skipped.`);
    }
  }
}

// ── Flag Registry ─────────────────────────────────────────────────────────────

/**
 * Appends two standard flag entries to flags/registry.yml in the Factory Core
 * repo (the directory from which scaffold.mjs is invoked, typically the repo root).
 *
 * Two flags are added per app:
 *   {appName}:ks:maintenance_mode  — kill switch for instant app-level maintenance
 *   {appName}:ops:llm_tier         — ops override for LLM tier selection
 *
 * If the registry file does not exist this is a no-op with a warning so that
 * running scaffold.mjs outside the Factory Core repo does not hard-fail.
 */
function appendFlagRegistryEntries(appName) {
  // Resolve the registry relative to the Factory Core repo root (two levels up
  // from packages/deploy/scripts/).
  const factoryCoreRoot = join(__dirname, '../../..');
  const registryPath = join(factoryCoreRoot, 'flags/registry.yml');

  if (!existsSync(registryPath)) {
    console.warn(`\n⚠️  flags/registry.yml not found at ${registryPath}`);
    console.warn('   Skipping flag registry update. Add these entries manually:\n');
    console.warn(`   - key: "${appName}:ks:maintenance_mode"`);
    console.warn(`     type: kill_switch`);
    console.warn(`     description: "Kill switch — enables maintenance mode for ${appName}"`);
    console.warn(`     apps: ["${appName}"]`);
    console.warn(`     owner: ${appName}`);
    console.warn(`     status: active`);
    console.warn(`     default_value: false`);
    console.warn(`     created_at: "${new Date().toISOString().slice(0, 10)}"`);
    console.warn(`     cleanup_policy: permanent\n`);
    console.warn(`   - key: "${appName}:ops:llm_tier"`);
    console.warn(`     type: ops`);
    console.warn(`     description: "LLM tier for ${appName}: balanced | fast | quality"`);
    console.warn(`     apps: ["${appName}"]`);
    console.warn(`     owner: ${appName}`);
    console.warn(`     status: active`);
    console.warn(`     default_value: "balanced"`);
    console.warn(`     created_at: "${new Date().toISOString().slice(0, 10)}"`);
    console.warn(`     cleanup_policy: permanent\n`);
    return;
  }

  const today = new Date().toISOString().slice(0, 10);
  const existing = readFileSync(registryPath, 'utf8');

  // Guard against duplicate entries so re-running scaffold is idempotent.
  if (existing.includes(`"${appName}:ks:maintenance_mode"`)) {
    console.log(`\n  ℹ️  Flag entries for ${appName} already present in registry.yml — skipping.`);
    return;
  }

  const entries = `
# ── ${appName} ─────────────────────────────────────────────────────────────────

- key: "${appName}:ks:maintenance_mode"
  type: kill_switch
  description: "Kill switch — enables maintenance mode for ${appName}"
  apps: ["${appName}"]
  owner: ${appName}
  status: active
  default_value: false
  created_at: "${today}"
  cleanup_policy: permanent

- key: "${appName}:ops:llm_tier"
  type: ops
  description: "LLM tier for ${appName}: balanced | fast | quality"
  apps: ["${appName}"]
  owner: ${appName}
  status: active
  default_value: "balanced"
  created_at: "${today}"
  cleanup_policy: permanent
`;

  writeFileSync(registryPath, existing.trimEnd() + '\n' + entries, 'utf8');
  console.log(`\n  📋 Appended ${appName}:ks:maintenance_mode and ${appName}:ops:llm_tier to flags/registry.yml`);
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n🏭 Factory App Scaffold');
  console.log(`   App:    ${APP_NAME}`);
  console.log(`   Target: ${TARGET}`);
  if (CREATE_GITHUB) console.log('   GitHub: yes (--github)');
  if (NO_SECRETS) console.log('   No secrets mode: skipping interactive secret configuration');
  if (SKIP_PREREQ) console.log('   Skipping prerequisites checks (--no-prereq)');

  if (!SKIP_PREREQ) {
    checkPrerequisites();
  }

  // Hyperdrive (runs before file gen so ID is injected)
  const hyperdriveId = await createHyperdrive();

  // Rate limiter namespace ID (CLI flag or placeholder)
  const rateLimiterId = CLI_RATE_LIMITER_ID ?? 'REPLACE_WITH_RATE_LIMITER_NAMESPACE_ID';
  if (CLI_RATE_LIMITER_ID) {
    console.log(`\n⚡ Rate Limiter ID provided via CLI: ${rateLimiterId}`);
  }

  // Create directory + all files
  mkdirSync(TARGET, { recursive: true });
  const capabilityPlan = await loadCapabilityPlan();
  generateFiles(hyperdriveId, rateLimiterId, capabilityPlan);

  // Apply capability handoff if --handoff was supplied. Must run AFTER
  // generateFiles so package.json/.dev.vars.example exist, and BEFORE
  // npm install so the augmented dependency set is what gets installed.
  applyHandoffToScaffold(HANDOFF);

  // Append app-specific flags to Factory Core flag registry
  console.log('\n🏳️  Wiring Flagship flags...');
  appendFlagRegistryEntries(APP_NAME);

  // git init
  console.log('\n🔧 Initialising git...');
  run('git init');
  run('git add -A');
  run('git commit -m "chore: scaffold Factory app"');

  // GitHub repo (optional)
  if (CREATE_GITHUB) {
    console.log('\n📡 Creating GitHub repo...');
    run(`gh repo create ${APP_NAME} --private --source . --remote origin --push`);
    console.log('  ✅ Repo created and pushed.');
  }

  // npm install
  if (SKIP_INSTALL) {
    console.log('\n📦 Skipping npm install (--no-install).');
  } else {
    console.log('\n📦 Installing packages...');
    run('npm install');
  }

  // Secrets
  if (NO_SECRETS) {
    console.log('\n🔐 Skipping Wrangler secrets configuration (--no-secrets).');
    console.log('  ⏭  Run later:');
    console.log(`     node node_modules/@latimer-woods-tech/deploy/scripts/setup-secrets.sh ${APP_NAME}`);
  } else {
    const doSecrets = await ask('\n🔐 Configure Wrangler secrets interactively now? (y/N): ');
    if (doSecrets.trim().toLowerCase() === 'y') {
      await configureSecrets();
    } else {
      console.log('  ⏭  Skipped. Run later:');
      console.log(`     node node_modules/@latimer-woods-tech/deploy/scripts/setup-secrets.sh ${APP_NAME}`);
    }
  }

  // First deploy
  if (!SKIP_DEPLOY) {
    const doDeploy = await ask('\n🚀 Deploy to Cloudflare now? (y/N): ');
    if (doDeploy.trim().toLowerCase() === 'y') {
      console.log('\n  Deploying...');
      run('wrangler deploy');
      console.log(`\n  ✅ Deployed! Health check: https://${APP_NAME}.adrper79.workers.dev/health`);
    }
  }

  rl.close();

  console.log(`
✅ ${APP_NAME} is ready.

Next steps:
  1. Copy .dev.vars.example → .dev.vars and fill in secrets for local dev
  2. Add these secrets to your GitHub repo (Settings → Secrets → Actions):
       PACKAGES_READ_TOKEN  — GitHub PAT with read:packages
       CF_API_TOKEN         — Cloudflare API token (Edit Workers)
       CF_ACCOUNT_ID        — Cloudflare account ID
  3. cd ${APP_NAME} && npm run dev
  4. Push to main to trigger CI/CD

Optional extras (install as needed):
  @latimer-woods-tech/stripe     — Stripe billing + webhooks
  @latimer-woods-tech/llm        — Anthropic → Grok → Groq failover
  @latimer-woods-tech/telephony  — Telnyx + Deepgram + ElevenLabs
  @latimer-woods-tech/email      — Resend transactional + drip
  @latimer-woods-tech/crm        — cross-app lead + conversion tracking
  @latimer-woods-tech/compliance — consent audit logging (opt-in / opt-out / do-not-contact)
  @latimer-woods-tech/admin      — Hono admin router (dashboard, users, events)
`);
}

main().catch((err) => {
  console.error('\n❌ Scaffold failed:', err.message);
  rl.close();
  process.exit(1);
});
