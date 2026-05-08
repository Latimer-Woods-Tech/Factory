#!/usr/bin/env node

/**
 * Phase 7: App Agent Scaffolding Template
 * 
 * This script is NOT the full agent (which will run in parallel with 5 other agents).
 * Instead, this is the TEMPLATE used by each Phase 7 agent to properly scaffold an app.
 * 
 * Agents copy this template and customize it per app, then run:
 *   npm run phase-7:scaffold -- {app-name}
 * 
 * The script:
 * 1. Calls scaffold.mjs from Factory Core to generate app structure
 * 2. Installs app-specific packages (telephony, llm, compliance, etc.)
 * 3. Generates Drizzle schema from canonical definitions
 * 4. Runs migrations against the Neon preview branch
 * 5. Applies RLS policies to multi-tenant databases
 * 6. Commits scaffolding and pushes to app repo
 * 
 * Prerequisites (all set by Phase 6):
 * - GitHub repo created (Latimer-Woods-Tech/{app-name})
 * - Neon database created
 * - Hyperdrive instance created
 * - Sentry project created
 * - PostHog project created
 * - All GitHub secrets set by setup-all-apps.mjs
 */

import * as fs from 'fs';
import * as path from 'path';
import { execSync, spawnSync } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// App configurations
const APP_CONFIGS = {
  'wordis-bond': {
    packages: [
      '@latimer-woods-tech/compliance@0.2.0',
      '@latimer-woods-tech/crm@0.2.0'
    ],
    rls: true,
    priority: 1,
    description: 'Account management and campaign consent tracking'
  },
  'cypher-healing': {
    packages: [
      '@latimer-woods-tech/telephony@0.2.0',
      '@latimer-woods-tech/llm@0.2.0',
      '@latimer-woods-tech/copy@0.2.0'
    ],
    rls: true,
    priority: 2,
    description: 'Practitioner platform with AI-powered readings'
  },
  'prime-self': {
    packages: [
      '@latimer-woods-tech/telephony@0.2.0',
      '@latimer-woods-tech/llm@0.2.0',
      '@latimer-woods-tech/copy@0.2.0'
    ],
    rls: true,
    priority: 3,
    description: 'Subscription-based courses and personal development'
  },
  'ijustus': {
    packages: [
      '@latimer-woods-tech/telephony@0.2.0',
      '@latimer-woods-tech/llm@0.2.0',
      '@latimer-woods-tech/compliance@0.2.0',
      '@latimer-woods-tech/crm@0.2.0'
    ],
    rls: true,
    priority: 4,
    description: 'Organization compliance simulator'
  },
  'the-calling': {
    packages: [],
    rls: false,
    priority: 5,
    description: 'Multiplayer game platform'
  },
  'neighbor-aid': {
    packages: [],
    rls: true,
    priority: 6,
    description: 'Geospatial community requests and offers'
  }
};

// Standard packages all apps get
const STANDARD_PACKAGES = [
  '@latimer-woods-tech/errors@0.2.0',
  '@latimer-woods-tech/logger@0.2.0',
  '@latimer-woods-tech/monitoring@0.2.0',
  '@latimer-woods-tech/auth@0.2.0',
  '@latimer-woods-tech/neon@0.2.0',
  '@latimer-woods-tech/stripe@0.2.0',
  '@latimer-woods-tech/analytics@0.2.0',
  '@latimer-woods-tech/email@0.2.0',
  '@latimer-woods-tech/flags@0.1.0',
];

/**
 * Step 1: Call scaffold.mjs to generate app structure
 */
function scaffoldApp(appName, hyperdriveId, rateLimiterId) {
  console.log(`\n1️⃣  Scaffolding ${appName} from Factory Core...\n`);

  const scaffoldPath = path.join(__dirname, '../packages/deploy/scripts/scaffold.mjs');

  if (!fs.existsSync(scaffoldPath)) {
    console.error(`❌ scaffold.mjs not found at ${scaffoldPath}`);
    process.exit(1);
  }

  try {
    const result = spawnSync('node', [scaffoldPath, appName, '--hyperdrive-id', hyperdriveId, '--rate-limiter-id', rateLimiterId, '--github'], {
      stdio: 'inherit'
    });
    if (result.status !== 0) throw new Error(`exit code ${result.status}`);
    console.log(`\n✅ Scaffolding complete\n`);
  } catch (e) {
    console.error(`❌ Scaffolding failed: ${e.message}`);
    process.exit(1);
  }
}

/**
 * Step 2: Clone the newly created repo
 */
function cloneAppRepo(appName) {
  console.log(`2️⃣  Cloning Latimer-Woods-Tech/${appName}...\n`);

  try {
    const result = spawnSync('gh', ['repo', 'clone', `Latimer-Woods-Tech/${appName}`], {
      stdio: 'inherit'
    });
    if (result.status !== 0) throw new Error(`exit code ${result.status}`);
    console.log(`✅ Cloned\n`);
  } catch (e) {
    console.error(`❌ Clone failed: ${e.message}`);
    process.exit(1);
  }
}

/**
 * Step 3: Install app-specific packages
 */
function installPackages(appName) {
  console.log(`3️⃣  Installing app-specific packages...\n`);

  const config = APP_CONFIGS[appName];
  if (!config) {
    console.error(`❌ Unknown app: ${appName}`);
    process.exit(1);
  }

  const packagesToInstall = [...STANDARD_PACKAGES, ...config.packages];

  const cwd = path.join(process.cwd(), appName);

  if (!fs.existsSync(cwd)) {
    console.error(`❌ Directory not found: ${cwd}`);
    process.exit(1);
  }

  // Add packages to package.json
  console.log(`Installing ${packagesToInstall.length} packages...`);

  try {
    const result = spawnSync('npm', ['install', ...packagesToInstall], {
      cwd,
      stdio: 'inherit'
    });
    if (result.status !== 0) throw new Error(`exit code ${result.status}`);
    console.log(`✅ Packages installed\n`);
  } catch (e) {
    console.error(`❌ npm install failed: ${e.message}`);
    process.exit(1);
  }
}

/**
 * Step 4: Write canonical schema for the app
 */
function writeSchema(appName) {
  console.log(`4️⃣  Generating Drizzle schema...\n`);

  const cwd = path.join(process.cwd(), appName);
  const schemaPath = path.join(cwd, 'src/db/schema.ts');

  const schemas = {
    'wordis-bond': `import { pgTable, text, varchar, uuid, timestamp, boolean } from 'drizzle-orm/pg-core';

/**
 * Accounts — user login and profile
 */
export const accounts = pgTable('accounts', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenant_id: text('tenant_id').notNull(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  password_hash: varchar('password_hash', { length: 255 }).notNull(),
  family_name: varchar('family_name', { length: 255 }),
  given_name: varchar('given_name', { length: 255 }),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

/**
 * Contacts — leads and recipients for campaigns
 */
export const contacts = pgTable('contacts', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenant_id: text('tenant_id').notNull(),
  account_id: uuid('account_id').notNull().references(() => accounts.id, { onDelete: 'cascade' }),
  email: varchar('email', { length: 255 }),
  phone: varchar('phone', { length: 20 }),
  family_name: varchar('family_name', { length: 255 }),
  given_name: varchar('given_name', { length: 255 }),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

/**
 * consent_log — consent audit trail (GDPR, outreach opt-in/opt-out)
 */
export const consent_log = pgTable('consent_log', {
  id: uuid('id').primaryKey().defaultRandom(),
  contact_id: uuid('contact_id').notNull().references(() => contacts.id, { onDelete: 'cascade' }),
  consent_type: varchar('consent_type', { length: 50 }).notNull(), // 'sms', 'email', 'phone'
  granted: boolean('granted').notNull(),
  ip_address: varchar('ip_address', { length: 45 }),
  user_agent: text('user_agent'),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});`,

    'cypher-healing': `import { pgTable, text, varchar, uuid, timestamp, decimal, boolean } from 'drizzle-orm/pg-core';

/**
 * Practitioners — healers and readers
 */
export const practitioners = pgTable('practitioners', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenant_id: text('tenant_id').notNull(),
  email: varchar('email', { length: 255 }).notNull(),
  phone: varchar('phone', { length: 20 }).notNull(),
  family_name: varchar('family_name', { length: 255 }).notNull(),
  given_name: varchar('given_name', { length: 255 }).notNull(),
  bio: text('bio'),
  photo_url: varchar('photo_url', { length: 512 }),
  rate_cents: decimal('rate_cents', { precision: 10, scale: 0 }).notNull(),
  active: boolean('active').defaultTrue().notNull(),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

/**
 * Clients — customers booking readings
 */
export const clients = pgTable('clients', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenant_id: text('tenant_id').notNull(),
  email: varchar('email', { length: 255 }).notNull(),
  phone: varchar('phone', { length: 20 }).notNull(),
  family_name: varchar('family_name', { length: 255 }).notNull(),
  given_name: varchar('given_name', { length: 255 }).notNull(),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

/**
 * Bookings — appointments
 */
export const bookings = pgTable('bookings', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenant_id: text('tenant_id').notNull(),
  practitioner_id: uuid('practitioner_id').notNull().references(() => practitioners.id, { onDelete: 'restrict' }),
  client_id: uuid('client_id').notNull().references(() => clients.id, { onDelete: 'cascade' }),
  scheduled_at: timestamp('scheduled_at', { withTimezone: true }).notNull(),
  duration_minutes: decimal('duration_minutes', { precision: 5, scale: 0 }).notNull(),
  status: varchar('status', { length: 50 }).notNull(), // 'pending', 'confirmed', 'completed', 'cancelled'
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});`,

    'prime-self': `import { pgTable, text, varchar, uuid, timestamp, decimal, boolean, smallint } from 'drizzle-orm/pg-core';

/**
 * Users — learners and subscribers
 */
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenant_id: text('tenant_id').notNull(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  family_name: varchar('family_name', { length: 255 }).notNull(),
  given_name: varchar('given_name', { length: 255 }).notNull(),
  stripe_customer_id: varchar('stripe_customer_id', { length: 255 }),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

/**
 * Subscriptions — active memberships
 */
export const subscriptions = pgTable('subscriptions', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenant_id: text('tenant_id').notNull(),
  user_id: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  stripe_subscription_id: varchar('stripe_subscription_id', { length: 255 }).notNull().unique(),
  plan: varchar('plan', { length: 50 }).notNull(), // 'monthly', 'annual'
  status: varchar('status', { length: 50 }).notNull(), // 'active', 'canceled', 'past_due'
  current_period_end: timestamp('current_period_end', { withTimezone: true }).notNull(),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

/**
 * Courses — content modules
 */
export const courses = pgTable('courses', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenant_id: text('tenant_id').notNull(),
  title: varchar('title', { length: 255 }).notNull(),
  description: text('description'),
  slug: varchar('slug', { length: 255 }).notNull().unique(),
  duration_days: smallint('duration_days').notNull(),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

/**
 * Enrollments — user course progress
 */
export const enrollments = pgTable('enrollments', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenant_id: text('tenant_id').notNull(),
  user_id: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  course_id: uuid('course_id').notNull().references(() => courses.id, { onDelete: 'restrict' }),
  progress_percent: smallint('progress_percent').defaultValue(0).notNull(),
  completed_at: timestamp('completed_at', { withTimezone: true }),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});`,

    'ijustus': `import { pgTable, text, varchar, uuid, timestamp, boolean, smallint, integer } from 'drizzle-orm/pg-core';

/**
 * Organizations — simulator customers
 */
export const organizations = pgTable('organizations', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenant_id: text('tenant_id').notNull(),
  name: varchar('name', { length: 255 }).notNull(),
  country: varchar('country', { length: 100 }).notNull(),
  industry: varchar('industry', { length: 100 }),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

/**
 * Simulators — training scenarios
 */
export const simulators = pgTable('simulators', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenant_id: text('tenant_id').notNull(),
  organization_id: uuid('organization_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  title: varchar('title', { length: 255 }).notNull(),
  description: text('description'),
  difficulty: varchar('difficulty', { length: 50 }).notNull(), // 'beginner', 'intermediate', 'advanced'
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

/**
 * Attempts — participant simulation scores
 */
export const attempts = pgTable('attempts', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenant_id: text('tenant_id').notNull(),
  simulator_id: uuid('simulator_id').notNull().references(() => simulators.id, { onDelete: 'cascade' }),
  participant_email: varchar('participant_email', { length: 255 }).notNull(),
  score: smallint('score').notNull(),
  duration_seconds: integer('duration_seconds').notNull(),
  passed: boolean('passed').notNull(),
  completed_at: timestamp('completed_at', { withTimezone: true }).notNull(),
});

/**
 * Score history — audit trail
 */
export const score_history = pgTable('score_history', {
  id: uuid('id').primaryKey().defaultRandom(),
  attempt_id: uuid('attempt_id').notNull().references(() => attempts.id, { onDelete: 'cascade' }),
  question_id: varchar('question_id', { length: 100 }).notNull(),
  selected_answer: varchar('selected_answer', { length: 255 }),
  correct: boolean('correct').notNull(),
  score_awarded: smallint('score_awarded').notNull(),
});`,

    'the-calling': `import { pgTable, text, varchar, uuid, timestamp, smallint, integer } from 'drizzle-orm/pg-core';

/**
 * Games — multiplayer game instances
 */
export const games = pgTable('games', {
  id: uuid('id').primaryKey().defaultRandom(),
  title: varchar('title', { length: 255 }).notNull(),
  description: text('description'),
  max_players: smallint('max_players').notNull().defaultValue(4),
  genre: varchar('genre', { length: 100 }),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

/**
 * Players — user game accounts
 */
export const players = pgTable('players', {
  id: uuid('id').primaryKey().defaultRandom(),
  username: varchar('username', { length: 255 }).notNull().unique(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  avatar_url: varchar('avatar_url', { length: 512 }),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

/**
 * Questions — trivia/game content
 */
export const questions = pgTable('questions', {
  id: uuid('id').primaryKey().defaultRandom(),
  game_id: uuid('game_id').notNull().references(() => games.id, { onDelete: 'cascade' }),
  question: text('question').notNull(),
  answer_correct: varchar('answer_correct', { length: 255 }).notNull(),
  answer_wrong1: varchar('answer_wrong1', { length: 255 }).notNull(),
  answer_wrong2: varchar('answer_wrong2', { length: 255 }).notNull(),
  answer_wrong3: varchar('answer_wrong3', { length: 255 }).notNull(),
});

/**
 * Leaderboards — scores
 */
export const leaderboards = pgTable('leaderboards', {
  id: uuid('id').primaryKey().defaultRandom(),
  game_id: uuid('game_id').notNull().references(() => games.id, { onDelete: 'cascade' }),
  player_id: uuid('player_id').notNull().references(() => players.id, { onDelete: 'cascade' }),
  score: integer('score').notNull().defaultValue(0),
  rank: smallint('rank'),
  updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});`,

    'neighbor-aid': `import { pgTable, text, varchar, uuid, timestamp, boolean, numeric } from 'drizzle-orm/pg-core';

/**
 * Users — community members
 */
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenant_id: text('tenant_id').notNull(),
  email: varchar('email', { length: 255 }).notNull(),
  phone: varchar('phone', { length: 20 }).notNull(),
  family_name: varchar('family_name', { length: 255 }).notNull(),
  given_name: varchar('given_name', { length: 255 }).notNull(),
  latitude: numeric('latitude', { precision: 10, scale: 7 }),
  longitude: numeric('longitude', { precision: 10, scale: 7 }),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

/**
 * Requests — help needed (e.g., "I need a ride", "Looking for groceries")
 */
export const requests = pgTable('requests', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenant_id: text('tenant_id').notNull(),
  user_id: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  title: varchar('title', { length: 255 }).notNull(),
  description: text('description'),
  latitude: numeric('latitude', { precision: 10, scale: 7 }).notNull(),
  longitude: numeric('longitude', { precision: 10, scale: 7 }).notNull(),
  status: varchar('status', { length: 50 }).notNull(), // 'open', 'in_progress', 'completed'
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

/**
 * Offers — help offered (e.g., "I can help", "Available to chat")
 */
export const offers = pgTable('offers', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenant_id: text('tenant_id').notNull(),
  user_id: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  title: varchar('title', { length: 255 }).notNull(),
  description: text('description'),
  latitude: numeric('latitude', { precision: 10, scale: 7 }).notNull(),
  longitude: numeric('longitude', { precision: 10, scale: 7 }).notNull(),
  active: boolean('active').defaultTrue().notNull(),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

/**
 * Matches — request–offer pairings
 */
export const matches = pgTable('matches', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenant_id: text('tenant_id').notNull(),
  request_id: uuid('request_id').notNull().references(() => requests.id, { onDelete: 'cascade' }),
  offer_id: uuid('offer_id').notNull().references(() => offers.id, { onDelete: 'cascade' }),
  status: varchar('status', { length: 50 }).notNull(), // 'proposed', 'accepted', 'declined'
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});`
  };

  const schema = schemas[appName];
  if (!schema) {
    console.warn(`⚠️  No canonical schema defined for ${appName}, skipping`);
    return;
  }

  try {
    fs.writeFileSync(schemaPath, schema);
    console.log(`✅ Schema written to src/db/schema.ts\n`);
  } catch (e) {
    console.error(`❌ Failed to write schema: ${e.message}`);
    process.exit(1);
  }
}

/**
 * Step 5: Run Drizzle migrations
 */
function runMigrations(appName) {
  console.log(`5️⃣  Running Drizzle migrations...\n`);

  const cwd = path.join(process.cwd(), appName);

  try {
    execSync(`npx drizzle-kit generate`, { cwd, stdio: 'inherit' });
    console.log();
    execSync(`npx drizzle-kit migrate`, { cwd, stdio: 'inherit' });
    console.log(`✅ Migrations applied\n`);
  } catch (e) {
    console.error(`❌ Migrations failed: ${e.message}`);
    process.exit(1);
  }
}

/**
 * Step 6: Apply RLS policies
 */
function applyRLS(appName) {
  const config = APP_CONFIGS[appName];

  if (!config.rls) {
    console.log(`6️⃣  RLS not needed for ${appName}\n`);
    return;
  }

  console.log(`6️⃣  Applying RLS policies...\n`);

  // Get tables from schema
  const cwd = path.join(process.cwd(), appName);
  const schemaPath = path.join(cwd, 'src/db/schema.ts');

  if (!fs.existsSync(schemaPath)) {
    console.warn(`⚠️  schema.ts not found, skipping RLS\n`);
    return;
  }

  const content = fs.readFileSync(schemaPath, 'utf-8');
  const tableMatches = content.match(/export const (\w+) = pgTable/g) || [];
  const tables = tableMatches.map(m => m.replace(/export const (\w+) = pgTable/, '$1'));

  if (tables.length === 0) {
    console.warn(`⚠️  No tables found in schema, skipping RLS\n`);
    return;
  }

  const rlsSql = tables.map(table => `
ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON ${table};
CREATE POLICY tenant_isolation ON ${table}
  USING (tenant_id = current_setting('app.tenant_id', true));
  `.trim()).join('\n\n');

  console.log('RLS policies to apply:');
  tables.forEach(t => console.log(`  - ${t}`));
  console.log();
  console.log('Run via psql:');
  console.log('```sql');
  console.log(rlsSql);
  console.log('```\n');
}

/**
 * Step 7: Commit and push scaffolding
 */
function commitAndPush(appName) {
  console.log(`7️⃣  Committing scaffolding...\n`);

  const cwd = path.join(process.cwd(), appName);

  try {
    execSync(`git add -A`, { cwd });
    execSync(`git commit -m "chore(core): scaffold app packages and schema"`, { cwd });
    execSync(`git push --set-upstream origin main`, { cwd });
    console.log(`✅ Pushed to Latimer-Woods-Tech/${appName}/main\n`);
  } catch (e) {
    console.warn(`⚠️  Could not commit (may already be committed): ${e.message}\n`);
  }
}

/**
 * Main entry point
 */
function main() {
  const ARGS = process.argv.slice(2);

  if (ARGS.length === 0 || ARGS[0] === '--help') {
    console.log(`
Phase 7: App Agent Scaffolding Template

Usage:
  npm run phase-7:scaffold -- {app-name} [--hyperdrive-id ID] [--rate-limiter-id ID]

Examples:
  npm run phase-7:scaffold -- wordis-bond --hyperdrive-id abc123 --rate-limiter-id 1001
  npm run phase-7:scaffold -- cypher-healing

Supported apps:
${Object.entries(APP_CONFIGS).map(([name, cfg]) =>
  `  - ${name} (priority ${cfg.priority}): ${cfg.description}`
).join('\n')}

Prerequisites:
  - All 19 @latimer-woods-tech/* packages at v0.2.0
  - Phase 6 infrastructure setup complete
  - GitHub repo created
  - Neon database created
`);
    return;
  }

  const appName = ARGS[0];
  const config = APP_CONFIGS[appName];

  if (!config) {
    console.error(`❌ Unknown app: ${appName}`);
    console.error(`\nSupported apps: ${Object.keys(APP_CONFIGS).join(', ')}`);
    process.exit(1);
  }

  // Parse optional arguments
  let hyperdriveId = null;
  let rateLimiterId = null;

  for (let i = 1; i < ARGS.length; i++) {
    if (ARGS[i] === '--hyperdrive-id') hyperdriveId = ARGS[++i];
    if (ARGS[i] === '--rate-limiter-id') rateLimiterId = ARGS[++i];
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log(`🚀 PHASE 7: Scaffolding ${appName}`);
  console.log(`${'='.repeat(60)}`);

  // Execute all steps
  if (hyperdriveId && rateLimiterId) {
    scaffoldApp(appName, hyperdriveId, rateLimiterId);
  } else {
    console.warn(`⚠️  Skipping scaffold.mjs (use --hyperdrive-id and --rate-limiter-id to auto-scaffold)`);
  }

  cloneAppRepo(appName);
  installPackages(appName);
  writeSchema(appName);
  runMigrations(appName);
  applyRLS(appName);
  commitAndPush(appName);

  console.log(`\n${'='.repeat(60)}`);
  console.log(`✨ ${appName} scaffolding complete!`);
  console.log(`${'='.repeat(60)}\n`);
  console.log(`Next steps for agent:`);
  console.log(`  1. cd ${appName}`);
  console.log(`  2. npm run dev          # Test locally`);
  console.log(`  3. npm run test         # Verify tests pass`);
  console.log(`  4. npm run typecheck    # Verify types`);
  console.log(`  5. git push             # CI will deploy to staging`);
  console.log();
}

main();
