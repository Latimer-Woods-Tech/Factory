#!/usr/bin/env node
// setup-project-autoarchive.mjs
// Idempotent bootstrap: enable native GitHub Projects v2 auto-archive for
// "Done" items after 30 days.
//
// Run via workflow_dispatch on setup-project-autoarchive.yml, or locally:
//   GH_TOKEN=<pat> node .github/scripts/setup-project-autoarchive.mjs
//
// RFC-006 Phase 0 §14 — Project auto-archive exit criterion.
//
// NOTE ON API AVAILABILITY:
// As of 2026-06, the GitHub Projects v2 GraphQL API does not expose a mutation
// for enabling the built-in "Auto-archive items" workflow (Settings → Workflows
// → Auto-archive items). That workflow is a UI-only project setting.
//
// This script:
//   1. Queries the project to confirm it is reachable and prints current settings.
//   2. Attempts the closest available mutation (none exists yet for auto-archive).
//   3. Prints manual instructions so the exit criterion can be satisfied via UI.

const PROJECT_ID = 'PVT_kwDOEL0sNc4BWWtg';

const { GH_TOKEN } = process.env;
if (!GH_TOKEN) throw new Error('GH_TOKEN required');

async function gql(query, variables = {}) {
  const res = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${GH_TOKEN}`,
      'Content-Type': 'application/json',
      'User-Agent': 'factory-setup-project-autoarchive',
    },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.errors?.length) {
    throw new Error(
      `GraphQL ${res.status}: ${(json.errors ?? []).map(e => e.message).join('; ') || res.statusText}`
    );
  }
  return json.data;
}

async function main() {
  console.log('[info] Querying project settings...');

  const data = await gql(`
    query($id: ID!) {
      node(id: $id) {
        ... on ProjectV2 {
          id
          title
          closed
          public
          fields(first: 20) {
            nodes {
              ... on ProjectV2SingleSelectField {
                id
                name
                options { id name color }
              }
              ... on ProjectV2Field {
                id
                name
              }
            }
          }
        }
      }
    }
  `, { id: PROJECT_ID });

  const project = data?.node;
  if (!project) {
    console.error('[ERROR] Project not found. Check PROJECT_ID and token scopes (needs project read).');
    process.exit(1);
  }

  console.log(`[ok] Project: "${project.title}" (id=${project.id})`);
  console.log(`[ok] Closed: ${project.closed}, Public: ${project.public}`);

  const fields = project.fields?.nodes ?? [];
  const statusField = fields.find(f => f?.name === 'Status');
  if (statusField) {
    const doneOption = (statusField.options ?? []).find(o => o.name === 'Done');
    console.log(`[ok] Status field id=${statusField.id}`);
    if (doneOption) {
      console.log(`[ok] Done option id=${doneOption.id} — auto-archive target confirmed present.`);
    } else {
      console.warn('[warn] "Done" option not found on Status field. Run setup-project-status-options.yml first.');
    }
  } else {
    console.warn('[warn] No Status field found on project.');
  }

  // The GitHub Projects v2 GraphQL API does not (as of 2026-06) expose a
  // mutation to enable or configure the built-in auto-archive workflow.
  // The feature lives at: Project → Settings → Workflows → Auto-archive items.
  // There is no updateProjectV2 mutation field for auto-archive configuration.
  //
  // Reference: https://docs.github.com/en/graphql/reference/mutations#updateprojectv2
  // The mutation accepts: clientMutationId, closed, public, readme, shortDescription,
  // title — none of which controls auto-archive.
  //
  // When the API gains this capability, add the mutation here.

  console.log('');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('[manual] GitHub Projects v2 auto-archive is not yet configurable via API.');
  console.log('[manual] Complete this one-time step in the GitHub UI:');
  console.log('[manual]');
  console.log('[manual]   1. Open: https://github.com/orgs/Latimer-Woods-Tech/projects/7/settings');
  console.log('[manual]      (or navigate: Projects board → Settings → Workflows)');
  console.log('[manual]   2. Find "Auto-archive items" in the Workflows section.');
  console.log('[manual]   3. Set filter: Status = Done');
  console.log('[manual]   4. Set duration: 30 days');
  console.log('[manual]   5. Enable the workflow and save.');
  console.log('[manual]');
  console.log('[manual] RFC-006 Phase 0 exit criterion: "Project auto-archive enabled"');
  console.log('[manual] Once completed, mark this exit criterion satisfied in:');
  console.log('[manual]   docs/rfc/RFC-006-baseline-metrics.md');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
}

main().catch(err => { console.error(err); process.exit(1); });
