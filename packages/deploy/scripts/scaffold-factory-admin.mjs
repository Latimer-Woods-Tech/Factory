#!/usr/bin/env node
/**
 * scaffold-factory-admin.mjs
 *
 * Scaffolds the factory-admin Cloudflare Worker repo with:
 *   - Hono app with admin JWT guard
 *   - 7 Hyperdrive bindings (factory-core + 6 apps)
 *   - Routes: /, /apps, /crm, /events, /health
 *
 * Usage:
 *   node packages/deploy/scripts/scaffold-factory-admin.mjs
 *
 * Env vars required:
 *   HYPERDRIVE_FACTORY_CORE
 *   HYPERDRIVE_WORDIS_BOND
 *   HYPERDRIVE_CYPHER_HEALING
 *   HYPERDRIVE_PRIME_SELF
 *   HYPERDRIVE_IJUSTUS
 *   HYPERDRIVE_THE_CALLING
 *   HYPERDRIVE_NEIGHBOR_AID
 *   GH_TOKEN or GITHUB_TOKEN  (to push via git)
 */

import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';

// ---------- helpers ----------
const REPO = 'Latimer-Woods-Tech/factory-admin';
const TOKEN = process.env['GH_TOKEN'] ?? process.env['GITHUB_TOKEN'] ?? '';
if (!TOKEN) throw new Error('GH_TOKEN or GITHUB_TOKEN must be set');

function env(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

const HYPERDRIVE = {
  FACTORY_CORE:  env('HYPERDRIVE_FACTORY_CORE'),
  WORDIS_BOND:   env('HYPERDRIVE_WORDIS_BOND'),
  CYPHER_HEALING:env('HYPERDRIVE_CYPHER_HEALING'),
  PRIME_SELF:    env('HYPERDRIVE_PRIME_SELF'),
  IJUSTUS:       env('HYPERDRIVE_IJUSTUS'),
  THE_CALLING:   env('HYPERDRIVE_THE_CALLING'),
  NEIGHBOR_AID:  env('HYPERDRIVE_NEIGHBOR_AID'),
  XICO_CITY:     env('HYPERDRIVE_XICO_CITY'),
};

const run = (cmd, opts = {}) =>
  execSync(cmd, { stdio: 'inherit', ...opts });

// ---------- clone ----------
const TMP = 'factory-admin-scaffold-tmp';
if (existsSync(TMP)) run(`rm -rf ${TMP}`);

run(
  `git clone "https://x-access-token:${TOKEN}@github.com/${REPO}.git" ${TMP}`,
);

process.chdir(TMP);
run('git config user.email "ci@factory.dev"');
run('git config user.name "Factory CI"');

// ---------- file writer ----------
function write(relPath, content) {
  const abs = resolve(relPath);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, content, 'utf8');
  console.log(`  wrote ${relPath}`);
}

// ---------- wrangler.jsonc ----------
// Use proper JSON quoted keys (JSONC requires valid JSON syntax)
write('wrangler.jsonc', JSON.stringify({
  name: 'factory-admin',
  main: 'src/index.ts',
  compatibility_date: '2026-05-01',
  compatibility_flags: ['nodejs_compat'],
  hyperdrive: [
    { binding: 'FACTORY_CORE_DB', id: HYPERDRIVE.FACTORY_CORE },
    { binding: 'WORDIS_BOND_DB',  id: HYPERDRIVE.WORDIS_BOND },
    { binding: 'CYPHER_DB',       id: HYPERDRIVE.CYPHER_HEALING },
    { binding: 'PRIME_SELF_DB',   id: HYPERDRIVE.PRIME_SELF },
    { binding: 'IJUSTUS_DB',      id: HYPERDRIVE.IJUSTUS },
    { binding: 'THE_CALLING_DB',  id: HYPERDRIVE.THE_CALLING },
    { binding: 'NEIGHBOR_AID_DB', id: HYPERDRIVE.NEIGHBOR_AID },
    { binding: 'XICO_CITY_DB',    id: HYPERDRIVE.XICO_CITY },
  ],
}, null, 2) + '\n');

// ---------- package.json ----------
write('package.json', JSON.stringify({
  name: 'factory-admin',
  version: '0.1.0',
  private: true,
  type: 'module',
  scripts: {
    dev: 'wrangler dev',
    deploy: 'wrangler deploy',
    typecheck: 'tsc --noEmit',
    lint: 'eslint src --max-warnings 0',
  },
  dependencies: {
    '@latimer-woods-tech/auth':    '0.1.0',
    '@latimer-woods-tech/errors':  '0.1.0',
    '@latimer-woods-tech/logger':  '0.1.0',
    '@latimer-woods-tech/neon':    '0.1.0',
    hono: '^4.6.0',
  },
  devDependencies: {
    '@cloudflare/workers-types': '^4.20250422.0',
    typescript: '^5.4.5',
    wrangler: '^4.0.0',
  },
}, null, 2) + '\n');

// ---------- .npmrc ----------
write('.npmrc', [
  '@latimer-woods-tech:registry=https://npm.pkg.github.com',
  '//npm.pkg.github.com/:_authToken=${NODE_AUTH_TOKEN}',
].join('\n') + '\n');

// ---------- tsconfig.json ----------
write('tsconfig.json', JSON.stringify({
  compilerOptions: {
    target: 'ES2022',
    module: 'ESNext',
    moduleResolution: 'Bundler',
    strict: true,
    skipLibCheck: true,
    noUncheckedIndexedAccess: true,
    types: ['@cloudflare/workers-types'],
    lib: ['ES2022'],
    outDir: 'dist',
    rootDir: 'src',
  },
  include: ['src/**/*.ts'],
}, null, 2) + '\n');

// ---------- src/env.ts ----------
write('src/env.ts', `/**
 * Cloudflare Worker bindings for factory-admin.
 * All 7 Hyperdrive instances are available — one per database.
 */
export interface Env {
  /** factory_core DB — CRM leads, compliance, factory_events */
  FACTORY_CORE_DB: Hyperdrive;
  /** wordis-bond app DB */
  WORDIS_BOND_DB:  Hyperdrive;
  /** cypher-healing app DB */
  CYPHER_DB:       Hyperdrive;
  /** prime-self app DB */
  PRIME_SELF_DB:   Hyperdrive;
  /** ijustus app DB */
  IJUSTUS_DB:      Hyperdrive;
  /** the-calling app DB */
  THE_CALLING_DB:  Hyperdrive;
  /** neighbor-aid app DB */
  NEIGHBOR_AID_DB: Hyperdrive;
  /** xico-city app DB */
  XICO_CITY_DB:    Hyperdrive;
  /** Admin JWT secret — independent of any per-app secret */
  ADMIN_JWT_SECRET: string;
}
`);

// ---------- src/index.ts ----------
write('src/index.ts', `import { Hono } from 'hono';
import { verifyToken } from '@latimer-woods-tech/auth';
import { overviewRouter } from './routes/overview.js';
import { appsRouter }    from './routes/apps.js';
import { crmRouter }     from './routes/crm.js';
import { eventsRouter }  from './routes/events.js';
import { healthRouter }  from './routes/health.js';
import type { Env } from './env.js';

const app = new Hono<{ Bindings: Env }>();

/** Admin JWT guard — all routes require a valid ADMIN_JWT_SECRET token */
app.use('*', async (c, next) => {
  const header = c.req.header('Authorization');
  if (!header?.startsWith('Bearer ')) {
    return c.json({ error: 'Unauthorized' }, 401);
  }
  const token = header.slice(7);
  const payload = await verifyToken(token, c.env.ADMIN_JWT_SECRET).catch(() => null);
  if (!payload) return c.json({ error: 'Unauthorized' }, 401);
  c.set('jwtPayload' as never, payload);
  return next();
});

app.route('/', overviewRouter);
app.route('/apps', appsRouter);
app.route('/crm', crmRouter);
app.route('/events', eventsRouter);
app.route('/health', healthRouter);

export default app;
`);

// ---------- src/routes/health.ts ----------
write('src/routes/health.ts', `import { Hono } from 'hono';
import { createDb } from '@latimer-woods-tech/neon';
import type { Env } from '../env.js';

export const healthRouter = new Hono<{ Bindings: Env }>();

const BINDINGS: Array<{ label: string; key: keyof Env }> = [
  { label: 'factory-core', key: 'FACTORY_CORE_DB' },
  { label: 'wordis-bond',  key: 'WORDIS_BOND_DB' },
  { label: 'cypher',       key: 'CYPHER_DB' },
  { label: 'prime-self',   key: 'PRIME_SELF_DB' },
  { label: 'ijustus',      key: 'IJUSTUS_DB' },
  { label: 'the-calling',  key: 'THE_CALLING_DB' },
  { label: 'neighbor-aid', key: 'NEIGHBOR_AID_DB' },
  { label: 'xico-city',    key: 'XICO_CITY_DB' },
];

/** GET /health — ping all 7 Hyperdrive connections */
healthRouter.get('/', async (c) => {
  const checks = await Promise.allSettled(
    BINDINGS.map(async ({ label, key }) => {
      const db = createDb(c.env[key] as Hyperdrive);
      await db.execute('SELECT 1');
      return { label, ok: true };
    }),
  );

  const results = checks.map((r, i) => ({
    label: BINDINGS[i]!.label,
    ok:    r.status === 'fulfilled',
    error: r.status === 'rejected' ? String(r.reason) : undefined,
  }));

  const allOk = results.every((r) => r.ok);
  return c.json({ status: allOk ? 'ok' : 'degraded', databases: results },
    allOk ? 200 : 503);
});
`);

// ---------- src/routes/overview.ts ----------
write('src/routes/overview.ts', `import { Hono } from 'hono';
import { createDb } from '@latimer-woods-tech/neon';
import type { Env } from '../env.js';

export const overviewRouter = new Hono<{ Bindings: Env }>();

/** GET / — cross-app summary: event count, lead count */
overviewRouter.get('/', async (c) => {
  const db = createDb(c.env.FACTORY_CORE_DB);

  const [eventRow, leadRow] = await Promise.all([
    db.execute('SELECT COUNT(*) AS total FROM factory_events'),
    db.execute("SELECT COUNT(*) AS total FROM crm_leads"),
  ]);

  return c.json({
    factory_events_total: Number((eventRow.rows[0] as Record<string, unknown>)?.['total'] ?? 0),
    crm_leads_total:      Number((leadRow.rows[0]  as Record<string, unknown>)?.['total'] ?? 0),
  });
});
`);

// ---------- src/routes/apps.ts ----------
write('src/routes/apps.ts', `import { Hono } from 'hono';
import type { Env } from '../env.js';

export const appsRouter = new Hono<{ Bindings: Env }>();

const APPS = [
  'wordis-bond',
  'cypher-healing',
  'prime-self',
  'ijustus',
  'the-calling',
  'neighbor-aid',
  'xico-city',
] as const;

/** GET /apps — list all managed apps */
appsRouter.get('/', (c) => {
  return c.json({ apps: APPS });
});

/** GET /apps/:id — placeholder; extend with Cloudflare API calls */
appsRouter.get('/:id', (c) => {
  const id = c.req.param('id');
  if (!(APPS as readonly string[]).includes(id)) {
    return c.json({ error: 'App not found' }, 404);
  }
  return c.json({ app: id, status: 'active' });
});
`);

// ---------- src/routes/crm.ts ----------
write('src/routes/crm.ts', `import { Hono } from 'hono';
import { createDb } from '@latimer-woods-tech/neon';
import type { Env } from '../env.js';

export const crmRouter = new Hono<{ Bindings: Env }>();

/** GET /crm — cross-app lead funnel grouped by status */
crmRouter.get('/', async (c) => {
  const db = createDb(c.env.FACTORY_CORE_DB);
  const result = await db.execute(
    "SELECT app_id, status, COUNT(*) AS total FROM crm_leads GROUP BY app_id, status ORDER BY app_id, status",
  );
  return c.json({ funnel: result.rows });
});
`);

// ---------- src/routes/events.ts ----------
write('src/routes/events.ts', `import { Hono } from 'hono';
import { createDb, sql } from '@latimer-woods-tech/neon';
import type { Env } from '../env.js';

export const eventsRouter = new Hono<{ Bindings: Env }>();

/** GET /events?app=&event=&limit= — recent factory_events (max 500) */
eventsRouter.get('/', async (c) => {
  const appId  = c.req.query('app');
  const event  = c.req.query('event');
  const limit  = Math.min(Number(c.req.query('limit') ?? 100), 500);

  const db = createDb(c.env.FACTORY_CORE_DB);

  // Build safe parameterised query using drizzle sql template literals
  const conditions: ReturnType<typeof sql>[] = [];
  if (appId) conditions.push(sql\`app_id = \${appId}\`);
  if (event) conditions.push(sql\`event = \${event}\`);

  const where = conditions.length > 0
    ? sql\`WHERE \${sql.join(conditions, sql\` AND \`)}\`
    : sql\`\`;

  const result = await db.execute(
    sql\`SELECT id, app_id, user_id, event, properties, created_at
        FROM factory_events \${where}
        ORDER BY created_at DESC
        LIMIT \${limit}\`,
  );
  return c.json({ events: result.rows, count: result.rows.length });
});
`);

// ---------- .github/workflows/ci.yml ----------
write('.github/workflows/ci.yml', `name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  typecheck:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '22'
          registry-url: 'https://npm.pkg.github.com'
          scope: '@adrper79-dot'
      - name: Install
        run: npm install
        env:
          NODE_AUTH_TOKEN: \${{ secrets.PACKAGES_READ_TOKEN }}
      - run: npm run typecheck
`);

// ---------- .github/workflows/deploy.yml ----------
write('.github/workflows/deploy.yml', `name: Deploy

on:
  push:
    branches: [main]
  workflow_dispatch:

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '22'
          registry-url: 'https://npm.pkg.github.com'
          scope: '@adrper79-dot'
      - name: Install
        run: npm install
        env:
          NODE_AUTH_TOKEN: \${{ secrets.PACKAGES_READ_TOKEN }}
      - name: Deploy to Cloudflare
        run: npx wrangler deploy
        env:
          CLOUDFLARE_API_TOKEN: \${{ secrets.CF_API_TOKEN }}
          CLOUDFLARE_ACCOUNT_ID: \${{ secrets.CF_ACCOUNT_ID }}
`);

// ---------- commit & push ----------
console.log('\n📦 Committing factory-admin scaffold...');
run('git add -A');
run('git diff --staged --stat');
run('git commit -m "feat(admin): scaffold factory-admin Cloudflare Worker (Phase 8)"');
run(`git push "https://x-access-token:${TOKEN}@github.com/${REPO}.git" main`);

console.log('\n✅ factory-admin scaffolded and pushed!');
