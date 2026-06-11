#!/usr/bin/env node
// setup-project-status-options.mjs
// One-time (idempotent) bootstrap: ensures the GitHub Projects v2 board has
// all eight RFC-006 lifecycle Status options.
//
// Run via workflow_dispatch on setup-project-status-options.yml, or locally:
//   GH_TOKEN=<pat> node .github/scripts/setup-project-status-options.mjs

const PROJECT_ID = 'PVT_kwDOEL0sNc4BWWtg';

const { GH_TOKEN } = process.env;
if (!GH_TOKEN) throw new Error('GH_TOKEN required');

const DESIRED_OPTIONS = [
  { name: 'Intake',      color: 'YELLOW',  description: 'Created; not yet triaged' },
  { name: 'Ready',       color: 'BLUE',    description: 'Executable; awaiting lease' },
  { name: 'In Progress', color: 'ORANGE',  description: 'Leased; actively executing' },
  { name: 'In Review',   color: 'PURPLE',  description: 'Linked PR or review artifact' },
  { name: 'Blocked',     color: 'RED',     description: 'Named blocker; cannot proceed' },
  { name: 'Verifying',   color: 'BLUE',    description: 'Deployed; awaiting verification' },
  { name: 'Done',        color: 'GREEN',   description: 'Accepted and verified' },
  { name: 'Cancelled',   color: 'GRAY',    description: 'Intentionally stopped or superseded' },
];

async function gql(query, variables = {}) {
  const res = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${GH_TOKEN}`,
      'Content-Type': 'application/json',
      'User-Agent': 'factory-setup-project-status',
    },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.errors?.length) {
    throw new Error(`GraphQL ${res.status}: ${(json.errors ?? []).map(e => e.message).join('; ') || res.statusText}`);
  }
  return json.data;
}

async function main() {
  // 1. Read current Status field options.
  const data = await gql(`
    query($id: ID!) {
      node(id: $id) {
        ... on ProjectV2 {
          fields(first: 20) {
            nodes {
              ... on ProjectV2SingleSelectField {
                id
                name
                options { id name color description }
              }
            }
          }
        }
      }
    }
  `, { id: PROJECT_ID });

  const fields = data?.node?.fields?.nodes ?? [];
  const statusField = fields.find(f => f?.name === 'Status');
  if (!statusField) {
    console.error('[ERROR] No Status field found on project. Ensure the board has a Status single-select field.');
    process.exit(1);
  }

  const existing = new Set((statusField.options ?? []).map(o => o.name));
  console.log(`[ok] Status field id=${statusField.id}`);
  console.log(`[ok] Existing options: ${[...existing].join(', ')}`);

  const missing = DESIRED_OPTIONS.filter(o => !existing.has(o.name));
  if (missing.length === 0) {
    console.log('[ok] All lifecycle Status options already present. Nothing to do.');
    return;
  }

  console.log(`[info] Adding ${missing.length} missing option(s): ${missing.map(o => o.name).join(', ')}`);

  // 2. Build the complete options list: existing entries (with their current
  // color + description preserved — the API replaces the whole array, and
  // omitting fields would reset them) + new entries.
  const existingOptions = (statusField.options ?? []).map(o => ({
    name: o.name,
    color: o.color ?? 'GRAY',
    description: o.description ?? '',
  }));
  const newOptions = missing.map(o => ({ name: o.name, color: o.color, description: o.description }));
  const allOptions = [...existingOptions, ...newOptions];

  await gql(`
    mutation($projectId: ID!, $fieldId: ID!, $options: [ProjectV2SingleSelectFieldOptionInput!]!) {
      updateProjectV2Field(input: {
        projectId: $projectId
        fieldId: $fieldId
        singleSelectOptions: $options
      }) {
        projectV2Field {
          ... on ProjectV2SingleSelectField {
            id
            options { id name }
          }
        }
      }
    }
  `, {
    projectId: PROJECT_ID,
    fieldId: statusField.id,
    options: allOptions,
  });

  console.log('[ok] Status options updated.');

  // 3. Verify.
  const verify = await gql(`
    query($id: ID!) {
      node(id: $id) {
        ... on ProjectV2 {
          fields(first: 20) {
            nodes {
              ... on ProjectV2SingleSelectField {
                name
                options { name }
              }
            }
          }
        }
      }
    }
  `, { id: PROJECT_ID });

  const verifyField = (verify?.node?.fields?.nodes ?? []).find(f => f?.name === 'Status');
  const finalOptions = (verifyField?.options ?? []).map(o => o.name);
  console.log(`[ok] Final Status options: ${finalOptions.join(', ')}`);

  const stillMissing = DESIRED_OPTIONS.filter(o => !finalOptions.includes(o.name));
  if (stillMissing.length > 0) {
    console.error(`[ERROR] Still missing after update: ${stillMissing.map(o => o.name).join(', ')}`);
    process.exit(1);
  }
  console.log('[ok] All lifecycle Status options verified present.');
}

main().catch(err => { console.error(err); process.exit(1); });
