#!/usr/bin/env node
/**
 * write-schema.mjs — Writes the canonical Drizzle ORM schema for each Factory app.
 *
 * Usage:
 *   node write-schema.mjs <app-name>
 *
 * Overwrites <app-name>/src/db/schema.ts with the app's real schema.
 * Called by scaffold-all-apps.yml after scaffold.mjs generates the base files.
 */

import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

const APP = process.argv[2];
if (!APP) {
  console.error('Usage: node write-schema.mjs <app-name>');
  process.exit(1);
}

const SCHEMAS = {
  'wordis-bond': `/**
 * Drizzle ORM schema for wordis-bond.
 * Multi-tenant outreach platform — accounts, contacts, campaigns, call logs.
 */
import {
  pgTable,
  text,
  uuid,
  boolean,
  integer,
  timestamptz,
  jsonb,
} from 'drizzle-orm/pg-core';

/** Multi-tenant root: one row per tenant. */
export const accounts = pgTable('accounts', {
  id:        uuid('id').primaryKey().defaultRandom(),
  name:      text('name').notNull(),
  plan:      text('plan').notNull().default('starter'),  // starter | pro | enterprise
  createdAt: timestamptz('created_at').notNull().defaultNow(),
  updatedAt: timestamptz('updated_at').notNull().defaultNow(),
});

/** Individual campaign targets with consent tracking. */
export const contacts = pgTable('contacts', {
  id:             uuid('id').primaryKey().defaultRandom(),
  tenantId:       uuid('tenant_id').notNull().references(() => accounts.id, { onDelete: 'cascade' }),
  firstName:      text('first_name').notNull(),
  lastName:       text('last_name').notNull(),
  phone:          text('phone').notNull(),
  email:          text('email'),
  consentStatus:  text('consent_status').notNull().default('unknown'), // unknown | opted_in | opted_out | do_not_contact
  consentUpdated: timestamptz('consent_updated_at'),
  metadata:       jsonb('metadata'),
  createdAt:      timestamptz('created_at').notNull().defaultNow(),
  updatedAt:      timestamptz('updated_at').notNull().defaultNow(),
});

/** Outreach campaigns: a batch of contacts targeted for a given campaign objective. */
export const campaigns = pgTable('campaigns', {
  id:        uuid('id').primaryKey().defaultRandom(),
  tenantId:  uuid('tenant_id').notNull().references(() => accounts.id, { onDelete: 'cascade' }),
  name:      text('name').notNull(),
  status:    text('status').notNull().default('draft'),  // draft | active | paused | completed
  script:    text('script'),
  startedAt: timestamptz('started_at'),
  endedAt:   timestamptz('ended_at'),
  createdAt: timestamptz('created_at').notNull().defaultNow(),
  updatedAt: timestamptz('updated_at').notNull().defaultNow(),
});

/** Individual AI call attempts per contact per campaign. */
export const callLogs = pgTable('call_logs', {
  id:           uuid('id').primaryKey().defaultRandom(),
  contactId:    uuid('contact_id').notNull().references(() => contacts.id),
  campaignId:   uuid('campaign_id').notNull().references(() => campaigns.id),
  providerCallId: text('provider_call_id'),
  provider:       text('provider').notNull().default('telnyx'),
  status:         text('status').notNull().default('queued'),  // queued | in_progress | completed | failed
  outcome:        text('outcome'),        // agreed | declined | callback | no_answer | voicemail
  durationSecs: integer('duration_secs'),
  transcript:   text('transcript'),
  recordingUrl: text('recording_url'),
  createdAt:    timestamptz('created_at').notNull().defaultNow(),
});
`,

  'cypher-healing': `/**
 * Drizzle ORM schema for cypher-healing.
 * AI-powered holistic health coaching platform — clients, bookings, courses.
 */
import {
  pgTable,
  text,
  uuid,
  integer,
  boolean,
  timestamptz,
  jsonb,
  doublePrecision,
} from 'drizzle-orm/pg-core';

/** Practitioners / tenants who run healing practices on the platform. */
export const tenants = pgTable('tenants', {
  id:        uuid('id').primaryKey().defaultRandom(),
  name:      text('name').notNull(),
  subdomain: text('subdomain').notNull().unique(),
  plan:      text('plan').notNull().default('starter'),
  createdAt: timestamptz('created_at').notNull().defaultNow(),
  updatedAt: timestamptz('updated_at').notNull().defaultNow(),
});

/** Clients (patients / members) of a healing practice. */
export const clients = pgTable('clients', {
  id:        uuid('id').primaryKey().defaultRandom(),
  tenantId:  uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  firstName: text('first_name').notNull(),
  lastName:  text('last_name').notNull(),
  email:     text('email').notNull(),
  phone:     text('phone'),
  voiceId:   text('voice_id'),          // ElevenLabs voice clone ID for personalised audio
  metadata:  jsonb('metadata'),
  createdAt: timestamptz('created_at').notNull().defaultNow(),
  updatedAt: timestamptz('updated_at').notNull().defaultNow(),
});

/** Appointments / session bookings. */
export const bookings = pgTable('bookings', {
  id:           uuid('id').primaryKey().defaultRandom(),
  clientId:     uuid('client_id').notNull().references(() => clients.id),
  tenantId:     uuid('tenant_id').notNull().references(() => tenants.id),
  sessionType:  text('session_type').notNull(),  // coaching | sound-bath | reiki | etc.
  status:       text('status').notNull().default('pending'),  // pending | confirmed | completed | cancelled
  scheduledAt:  timestamptz('scheduled_at').notNull(),
  completedAt:  timestamptz('completed_at'),
  notes:        text('notes'),
  recordingUrl: text('recording_url'),
  createdAt:    timestamptz('created_at').notNull().defaultNow(),
  updatedAt:    timestamptz('updated_at').notNull().defaultNow(),
});

/** Self-paced digital courses / programmes. */
export const courses = pgTable('courses', {
  id:          uuid('id').primaryKey().defaultRandom(),
  tenantId:    uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  title:       text('title').notNull(),
  description: text('description'),
  priceUsd:    doublePrecision('price_usd').notNull().default(0),
  status:      text('status').notNull().default('draft'),  // draft | published
  modules:     jsonb('modules'),        // ordered array of { title, audioUrl, videoUrl }
  createdAt:   timestamptz('created_at').notNull().defaultNow(),
  updatedAt:   timestamptz('updated_at').notNull().defaultNow(),
});
`,

  'prime-self': `/**
 * Drizzle ORM schema for prime-self.
 * AI astrology + body-chart reading platform — practitioners, charts, readings.
 */
import {
  pgTable,
  text,
  uuid,
  timestamptz,
  jsonb,
} from 'drizzle-orm/pg-core';

/** Practitioners who provide readings on the platform. */
export const practitioners = pgTable('practitioners', {
  id:        uuid('id').primaryKey().defaultRandom(),
  tenantId:  uuid('tenant_id').notNull(),  // maps to a billing account
  name:      text('name').notNull(),
  email:     text('email').notNull().unique(),
  specialty: text('specialty').notNull(),  // astrology | human-design | gene-keys | numerology
  voiceId:   text('voice_id'),             // ElevenLabs voice clone
  bio:       text('bio'),
  createdAt: timestamptz('created_at').notNull().defaultNow(),
  updatedAt: timestamptz('updated_at').notNull().defaultNow(),
});

/** A member's birth / human-design chart data. */
export const charts = pgTable('charts', {
  id:            uuid('id').primaryKey().defaultRandom(),
  userId:        text('user_id').notNull(),  // JWT sub
  chartType:     text('chart_type').notNull(),  // astrology | human-design | gene-keys
  chartData:     jsonb('chart_data').notNull(),  // raw computed chart object
  readingStatus: text('reading_status').notNull().default('pending'),  // pending | generated | delivered
  createdAt:     timestamptz('created_at').notNull().defaultNow(),
  updatedAt:     timestamptz('updated_at').notNull().defaultNow(),
});

/** Generated or live AI readings for a chart. */
export const readings = pgTable('readings', {
  id:           uuid('id').primaryKey().defaultRandom(),
  chartId:      uuid('chart_id').notNull().references(() => charts.id),
  practId:      uuid('practitioner_id').references(() => practitioners.id),  // null = AI-only
  text:         text('text').notNull(),
  audioUrl:     text('audio_url'),    // ElevenLabs output
  provider:     text('provider').notNull().default('ai'),  // ai | live
  deliveredAt:  timestamptz('delivered_at'),
  createdAt:    timestamptz('created_at').notNull().defaultNow(),
});
`,

  'ijustus': `/**
 * Drizzle ORM schema for ijustus.
 * AI legal coaching platform — organizations, simulators, call sessions.
 */
import {
  pgTable,
  text,
  uuid,
  integer,
  boolean,
  doublePrecision,
  timestamptz,
  jsonb,
} from 'drizzle-orm/pg-core';

/** Law firms / legal-aid orgs that access the platform. */
export const organizations = pgTable('organizations', {
  id:        uuid('id').primaryKey().defaultRandom(),
  name:      text('name').notNull(),
  plan:      text('plan').notNull().default('starter'),  // starter | pro | enterprise
  createdAt: timestamptz('created_at').notNull().defaultNow(),
  updatedAt: timestamptz('updated_at').notNull().defaultNow(),
});

/** AI moot-court opponent / debt-collector simulator configurations. */
export const simulators = pgTable('simulators', {
  id:           uuid('id').primaryKey().defaultRandom(),
  tenantId:     uuid('tenant_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  name:         text('name').notNull(),
  persona:      text('persona').notNull(),  // e.g. "aggressive debt collector" | "opposing counsel"
  systemPrompt: text('system_prompt').notNull(),
  voiceId:      text('voice_id'),           // ElevenLabs voice
  active:       boolean('active').notNull().default(true),
  createdAt:    timestamptz('created_at').notNull().defaultNow(),
  updatedAt:    timestamptz('updated_at').notNull().defaultNow(),
});

/** A live or replayed practice call session. */
export const callSessions = pgTable('call_sessions', {
  id:          uuid('id').primaryKey().defaultRandom(),
  simulatorId: uuid('simulator_id').notNull().references(() => simulators.id),
  userId:      text('user_id').notNull(),      // JWT sub — the practising attorney / student
  transcript:  jsonb('transcript'),            // array of { role, content, timestamp }
  score:       doublePrecision('score'),       // 0–100 coach score computed post-session
  feedback:    text('feedback'),               // AI-generated coaching feedback
  durationSecs: integer('duration_secs'),
  completedAt: timestamptz('completed_at'),
  createdAt:   timestamptz('created_at').notNull().defaultNow(),
});
`,

  'the-calling': `/**
 * Drizzle ORM schema for the-calling.
 * Real-time spiritual calling quiz platform — players, games, questions.
 */
import {
  pgTable,
  text,
  uuid,
  integer,
  boolean,
  timestamptz,
  jsonb,
} from 'drizzle-orm/pg-core';

/** Registered players. */
export const players = pgTable('players', {
  id:           uuid('id').primaryKey().defaultRandom(),
  userId:       text('user_id').notNull().unique(),  // JWT sub
  displayName:  text('display_name').notNull(),
  avatarUrl:    text('avatar_url'),
  score:        integer('score').notNull().default(0),
  gamesPlayed:  integer('games_played').notNull().default(0),
  createdAt:    timestamptz('created_at').notNull().defaultNow(),
  updatedAt:    timestamptz('updated_at').notNull().defaultNow(),
});

/** A game lobby / session (live or async). */
export const games = pgTable('games', {
  id:          uuid('id').primaryKey().defaultRandom(),
  hostId:      uuid('host_id').notNull().references(() => players.id),
  code:        text('code').notNull().unique(),      // 6-char join code
  category:    text('category').notNull(),           // prophets | parables | psalms | etc.
  status:      text('status').notNull().default('lobby'),  // lobby | active | completed
  maxPlayers:  integer('max_players').notNull().default(8),
  currentQ:    integer('current_question').notNull().default(0),
  startedAt:   timestamptz('started_at'),
  endedAt:     timestamptz('ended_at'),
  createdAt:   timestamptz('created_at').notNull().defaultNow(),
  updatedAt:   timestamptz('updated_at').notNull().defaultNow(),
});

/** Question bank — seeded from content ingestion. */
export const questions = pgTable('questions', {
  id:          uuid('id').primaryKey().defaultRandom(),
  category:    text('category').notNull(),
  text:        text('text').notNull(),
  options:     jsonb('options').notNull(),            // string[] — the 4 answer choices
  answer:      integer('answer').notNull(),            // 0-indexed correct choice
  explanation: text('explanation'),
  order:       integer('order').notNull().default(0),
  difficulty:  text('difficulty').notNull().default('medium'),  // easy | medium | hard
  active:      boolean('active').notNull().default(true),
  createdAt:   timestamptz('created_at').notNull().defaultNow(),
});
`,

  'neighbor-aid': `/**
 * Drizzle ORM schema for neighbor-aid.
 * Hyper-local mutual-aid marketplace — users, requests, offers.
 */
import {
  pgTable,
  text,
  uuid,
  boolean,
  doublePrecision,
  integer,
  timestamptz,
  jsonb,
} from 'drizzle-orm/pg-core';

/** Registered community members. */
export const users = pgTable('users', {
  id:          uuid('id').primaryKey().defaultRandom(),
  userId:      text('user_id').notNull().unique(),  // JWT sub
  tenantId:    text('tenant_id'),                   // optional neighbourhood / org scope
  displayName: text('display_name').notNull(),
  avatarUrl:   text('avatar_url'),
  lat:         doublePrecision('lat'),
  lng:         doublePrecision('lng'),
  radius:      integer('radius_km').notNull().default(5),  // search radius in km
  verified:    boolean('verified').notNull().default(false),
  createdAt:   timestamptz('created_at').notNull().defaultNow(),
  updatedAt:   timestamptz('updated_at').notNull().defaultNow(),
});

/** Help requests posted by community members. */
export const requests = pgTable('requests', {
  id:          uuid('id').primaryKey().defaultRandom(),
  requesterId: uuid('requester_id').notNull().references(() => users.id),
  title:       text('title').notNull(),
  description: text('description'),
  category:    text('category').notNull(),   // groceries | transport | childcare | elder-care | etc.
  lat:         doublePrecision('lat'),
  lng:         doublePrecision('lng'),
  status:      text('status').notNull().default('open'),  // open | matched | completed | cancelled
  metadata:    jsonb('metadata'),
  expiresAt:   timestamptz('expires_at'),
  createdAt:   timestamptz('created_at').notNull().defaultNow(),
  updatedAt:   timestamptz('updated_at').notNull().defaultNow(),
});

/** Offers of help from community members responding to a request. */
export const offers = pgTable('offers', {
  id:        uuid('id').primaryKey().defaultRandom(),
  requestId: uuid('request_id').notNull().references(() => requests.id, { onDelete: 'cascade' }),
  helperId:  uuid('helper_id').notNull().references(() => users.id),
  message:   text('message'),
  status:    text('status').notNull().default('pending'),  // pending | accepted | rejected | withdrawn
  createdAt: timestamptz('created_at').notNull().defaultNow(),
  updatedAt: timestamptz('updated_at').notNull().defaultNow(),
});
`,

  'xpelevator': `/**
 * Drizzle ORM schema for xpelevator.
 * Experience elevation platform — members, journeys, milestones, subscriptions.
 */
import {
  pgTable,
  text,
  uuid,
  integer,
  boolean,
  doublePrecision,
  timestamptz,
  jsonb,
} from 'drizzle-orm/pg-core';

/** Registered members on the platform. */
export const members = pgTable('members', {
  id:          uuid('id').primaryKey().defaultRandom(),
  userId:      text('user_id').notNull().unique(),  // JWT sub
  email:       text('email').notNull().unique(),
  displayName: text('display_name').notNull(),
  avatarUrl:   text('avatar_url'),
  plan:        text('plan').notNull().default('free'),  // free | starter | pro | elite
  stripeCustomerId: text('stripe_customer_id'),
  createdAt:   timestamptz('created_at').notNull().defaultNow(),
  updatedAt:   timestamptz('updated_at').notNull().defaultNow(),
});

/** Structured growth journeys that members enroll in. */
export const journeys = pgTable('journeys', {
  id:          uuid('id').primaryKey().defaultRandom(),
  title:       text('title').notNull(),
  description: text('description'),
  category:    text('category').notNull(),  // mindset | career | fitness | finance | relationships
  difficulty:  text('difficulty').notNull().default('beginner'),  // beginner | intermediate | advanced
  durationDays: integer('duration_days').notNull(),
  status:      text('status').notNull().default('draft'),  // draft | published | archived
  metadata:    jsonb('metadata'),
  createdAt:   timestamptz('created_at').notNull().defaultNow(),
  updatedAt:   timestamptz('updated_at').notNull().defaultNow(),
});

/** A member's enrollment in a journey with progress tracking. */
export const enrollments = pgTable('enrollments', {
  id:          uuid('id').primaryKey().defaultRandom(),
  memberId:    uuid('member_id').notNull().references(() => members.id, { onDelete: 'cascade' }),
  journeyId:   uuid('journey_id').notNull().references(() => journeys.id),
  status:      text('status').notNull().default('active'),  // active | paused | completed | dropped
  progressPct: doublePrecision('progress_pct').notNull().default(0),
  startedAt:   timestamptz('started_at').notNull().defaultNow(),
  completedAt: timestamptz('completed_at'),
  createdAt:   timestamptz('created_at').notNull().defaultNow(),
  updatedAt:   timestamptz('updated_at').notNull().defaultNow(),
});

/** Discrete milestones within a journey that members check off. */
export const milestones = pgTable('milestones', {
  id:           uuid('id').primaryKey().defaultRandom(),
  enrollmentId: uuid('enrollment_id').notNull().references(() => enrollments.id, { onDelete: 'cascade' }),
  journeyId:    uuid('journey_id').notNull().references(() => journeys.id),
  title:        text('title').notNull(),
  dayNumber:    integer('day_number').notNull(),
  completed:    boolean('completed').notNull().default(false),
  completedAt:  timestamptz('completed_at'),
  notes:        text('notes'),
  createdAt:    timestamptz('created_at').notNull().defaultNow(),
});

/** Stripe subscription records per member. */
export const subscriptions = pgTable('subscriptions', {
  id:                   uuid('id').primaryKey().defaultRandom(),
  memberId:             uuid('member_id').notNull().references(() => members.id, { onDelete: 'cascade' }),
  stripeSubscriptionId: text('stripe_subscription_id').notNull().unique(),
  stripePriceId:        text('stripe_price_id').notNull(),
  status:               text('status').notNull(),  // active | past_due | canceled | trialing
  currentPeriodEnd:     timestamptz('current_period_end').notNull(),
  createdAt:            timestamptz('created_at').notNull().defaultNow(),
  updatedAt:            timestamptz('updated_at').notNull().defaultNow(),
});
`,

  'xico-city': `/**
 * Drizzle ORM schema for xico-city.
 * City experience platform — users, experiences, bookings, subscriptions.
 */
import {
  pgTable,
  text,
  uuid,
  integer,
  boolean,
  doublePrecision,
  timestamptz,
  jsonb,
} from 'drizzle-orm/pg-core';

/** Registered users on the platform. */
export const users = pgTable('users', {
  id:               uuid('id').primaryKey().defaultRandom(),
  userId:           text('user_id').notNull().unique(),  // JWT sub
  email:            text('email').notNull().unique(),
  displayName:      text('display_name').notNull(),
  avatarUrl:        text('avatar_url'),
  plan:             text('plan').notNull().default('free'),  // free | explorer | local
  stripeCustomerId: text('stripe_customer_id'),
  createdAt:        timestamptz('created_at').notNull().defaultNow(),
  updatedAt:        timestamptz('updated_at').notNull().defaultNow(),
});

/** City experiences available on the platform. */
export const experiences = pgTable('experiences', {
  id:          uuid('id').primaryKey().defaultRandom(),
  title:       text('title').notNull(),
  description: text('description'),
  category:    text('category').notNull(),  // food | culture | adventure | nightlife | wellness
  location:    text('location').notNull(),
  priceUsd:    doublePrecision('price_usd').notNull().default(0),
  capacity:    integer('capacity'),
  status:      text('status').notNull().default('draft'),  // draft | published | archived
  metadata:    jsonb('metadata'),
  createdAt:   timestamptz('created_at').notNull().defaultNow(),
  updatedAt:   timestamptz('updated_at').notNull().defaultNow(),
});

/** User bookings for city experiences. */
export const bookings = pgTable('bookings', {
  id:            uuid('id').primaryKey().defaultRandom(),
  userId:        uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  experienceId:  uuid('experience_id').notNull().references(() => experiences.id),
  status:        text('status').notNull().default('pending'),  // pending | confirmed | cancelled | completed
  attendees:     integer('attendees').notNull().default(1),
  totalUsd:      doublePrecision('total_usd').notNull(),
  bookedAt:      timestamptz('booked_at').notNull().defaultNow(),
  cancelledAt:   timestamptz('cancelled_at'),
  createdAt:     timestamptz('created_at').notNull().defaultNow(),
  updatedAt:     timestamptz('updated_at').notNull().defaultNow(),
});

/** Stripe subscription records per user. */
export const subscriptions = pgTable('subscriptions', {
  id:                   uuid('id').primaryKey().defaultRandom(),
  userId:               uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  stripeSubscriptionId: text('stripe_subscription_id').notNull().unique(),
  stripePriceId:        text('stripe_price_id').notNull(),
  status:               text('status').notNull(),  // active | past_due | canceled | trialing
  currentPeriodEnd:     timestamptz('current_period_end').notNull(),
  createdAt:            timestamptz('created_at').notNull().defaultNow(),
  updatedAt:            timestamptz('updated_at').notNull().defaultNow(),
});
`,
};

const schema = SCHEMAS[APP];
if (!schema) {
  console.error(`Unknown app: ${APP}. Valid apps: ${Object.keys(SCHEMAS).join(', ')}`);
  process.exit(1);
}

const schemaPath = join(process.cwd(), APP, 'src', 'db', 'schema.ts');
writeFileSync(schemaPath, schema, 'utf8');
console.log(`✅ Wrote schema for ${APP} → ${schemaPath}`);
