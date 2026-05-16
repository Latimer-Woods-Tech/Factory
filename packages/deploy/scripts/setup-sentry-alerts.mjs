#!/usr/bin/env node
/**
 * setup-sentry-alerts.mjs
 *
 * Creates Phase 10 Sentry alert rules for all Factory app projects.
 *
 * Alert rules created per project:
 *   1. Error spike       — > 10 new errors / hour  → notify issue owners (email)
 *   2. Error rate        — > 1% requests are errors → notify issue owners (email)
 *   3. New issue type    — first seen event          → notify issue owners (email)
 *
 * Prerequisites:
 *   export SENTRY_AUTH_TOKEN="sntrys_..."   # project:write scope
 *   export SENTRY_ORG="latwood-tech"        # org slug
 *
 * Usage:
 *   node packages/deploy/scripts/setup-sentry-alerts.mjs
 *   node packages/deploy/scripts/setup-sentry-alerts.mjs --dry-run
 */

const DRY_RUN = process.argv.includes('--dry-run');

const SENTRY_AUTH_TOKEN = process.env['SENTRY_AUTH_TOKEN'];
const SENTRY_ORG = process.env['SENTRY_ORG'];

if (!SENTRY_AUTH_TOKEN) {
  console.error('ERROR: SENTRY_AUTH_TOKEN is not set.');
  process.exit(1);
}
if (!SENTRY_ORG) {
  console.error('ERROR: SENTRY_ORG is not set.');
  process.exit(1);
}

// ─── Project list ─────────────────────────────────────────────────────────────

const PROJECTS = [
  'wordis-bond-worker',
  'cypher-healing-worker',
  'prime-self-worker',
  'ijustus-worker',
  'the-calling-worker',
  'neighbor-aid-worker',
  'xico-city-worker',
  'videoking',
  'factory-admin-worker',
];

// ─── Alert rule templates ─────────────────────────────────────────────────────

/**
 * Issue alert: notifies issue owners by email.
 * The `IssueOwners` target type routes to the team/user that owns the code.
 */
const NOTIFY_OWNERS = [
  {
    id: 'sentry.mail.actions.NotifyEmailAction',
    targetType: 'IssueOwners',
    fallthroughType: 'ActiveMembers',
  },
];

/**
 * Build the three standard alert rule bodies per Phase 10.
 * @param {string} projectSlug
 */
function buildAlertRules(projectSlug) {
  return [
    {
      name: 'Error spike — > 10 new errors per hour',
      actionMatch: 'all',
      filterMatch: 'all',
      frequency: 60, // minutes between alerts (cooldown)
      conditions: [
        {
          id: 'sentry.rules.conditions.event_frequency.EventFrequencyCondition',
          value: 10,
          comparisonType: 'count',
          interval: '1h',
        },
      ],
      filters: [],
      actions: NOTIFY_OWNERS,
    },
    {
      name: 'New issue type — first seen',
      actionMatch: 'all',
      filterMatch: 'all',
      frequency: 30,
      conditions: [
        {
          id: 'sentry.rules.conditions.first_seen_event.FirstSeenEventCondition',
        },
      ],
      filters: [],
      actions: NOTIFY_OWNERS,
    },
    {
      name: 'High error rate — > 1% of requests',
      actionMatch: 'all',
      filterMatch: 'all',
      frequency: 60,
      conditions: [
        {
          id: 'sentry.rules.conditions.event_frequency.EventFrequencyPercentCondition',
          value: 1.0,
          interval: '5m',
        },
      ],
      filters: [],
      actions: NOTIFY_OWNERS,
    },
  ];
}

// ─── API helpers ──────────────────────────────────────────────────────────────

const BASE = 'https://sentry.io/api/0';

async function sentryPost(path, body) {
  const url = `${BASE}${path}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${SENTRY_AUTH_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`POST ${url} → ${res.status}: ${text}`);
  }
  return JSON.parse(text);
}

async function sentryGet(path) {
  const url = `${BASE}${path}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${SENTRY_AUTH_TOKEN}` },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`GET ${url} → ${res.status}: ${text}`);
  return JSON.parse(text);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function setupProjectAlerts(projectSlug) {
  console.log(`\n[${projectSlug}]`);

  if (DRY_RUN) {
    const rules = buildAlertRules(projectSlug);
    rules.forEach((r) => console.log(`  [DRY RUN] Would create: ${r.name}`));
    return;
  }

  // Fetch existing rules to avoid duplicates
  let existing = [];
  try {
    existing = await sentryGet(`/projects/${SENTRY_ORG}/${projectSlug}/rules/`);
  } catch (err) {
    console.warn(`  WARNING: Could not fetch existing rules: ${err.message}`);
  }

  const existingNames = new Set(existing.map((r) => r.name));
  const rules = buildAlertRules(projectSlug);

  for (const rule of rules) {
    if (existingNames.has(rule.name)) {
      console.log(`  [skip] Already exists: ${rule.name}`);
      continue;
    }
    try {
      const created = await sentryPost(
        `/projects/${SENTRY_ORG}/${projectSlug}/rules/`,
        rule,
      );
      console.log(`  ✅ Created: ${created.name} (id=${created.id})`);
    } catch (err) {
      console.error(`  ❌ Failed to create "${rule.name}": ${err.message}`);
    }
  }
}

async function main() {
  console.log('Factory — setup-sentry-alerts.mjs');
  console.log(`Org: ${SENTRY_ORG}`);
  if (DRY_RUN) console.log('[DRY RUN — no API calls will be made]');
  console.log(`Projects: ${PROJECTS.join(', ')}\n`);

  for (const slug of PROJECTS) {
    await setupProjectAlerts(slug);
  }

  console.log('\nDone.');
  if (!DRY_RUN) {
    console.log('\nNext steps:');
    console.log('  1. Verify alerts at https://sentry.io/organizations/latwood-tech/alerts/rules/');
    console.log('  2. Add Slack integration in Sentry → Settings → Integrations → Slack');
    console.log('     then update alert actions from email to Slack channel notification.');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
