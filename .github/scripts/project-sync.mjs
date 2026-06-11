#!/usr/bin/env node
// projection-only: reads issue labels → writes Project Status. Labels are written only by lifecycle-controller.mjs.
// project-sync.mjs — unified GitHub Project board sync
//
// Replaces:
//   .github/workflows/auto-add-to-project.yml
//   .github/workflows/project-board-sync.yml
//   .github/workflows/project-status-sync.yml
//
// Dispatched per event by the matching job in .github/workflows/project-sync.yml.
// Each invocation receives an EVENT_KIND env var so this script can route
// without re-parsing the GitHub event payload.
//
// EVENT_KIND values:
//   issue.opened, issue.reopened, issue.assigned, issue.closed,
//   issue.status.changed, issue.labeled.agent,
//   issue_comment.status,
//   pr.opened, pr.reopened, pr.ready_for_review, pr.synchronize, pr.closed,
//   reconcile
//
// HARD CONSTRAINT: per-issue lookup uses projectItems(first: 10) only.
// Never regress to items(first: 100) full-board scan.

const PROJECT_ID = 'PVT_kwDOEL0sNc4BWWtg';
const PROJECT_NUMBER = '1';
const PROJECT_OWNER = 'Latimer-Woods-Tech';

const {
  GH_TOKEN,
  EVENT_KIND,
  REPO,
  ISSUE_NUMBER,
  ISSUE_NODE_ID,
  PR_NUMBER,
  PR_NODE_ID,
  PR_BODY,
  PR_MERGED,
  MERGE_SHA,
  LABEL_NAME,
  LABEL_ACTION,
  COMMENT_BODY,
} = process.env;

if (!GH_TOKEN) throw new Error('GH_TOKEN env var required');
if (!EVENT_KIND) throw new Error('EVENT_KIND env var required');

// ─── HTTP helpers ─────────────────────────────────────────────────────────
async function ghRest(method, path, data) {
  const url = path.startsWith('http') ? path : `https://api.github.com${path}`;
  const res = await fetch(url, {
    method,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${GH_TOKEN}`,
      'X-GitHub-Api-Version': '2022-11-28',
      ...(data ? { 'Content-Type': 'application/json' } : {}),
    },
    body: data ? JSON.stringify(data) : undefined,
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`GH ${method} ${path} → ${res.status}: ${t.slice(0, 300)}`);
  }
  return res.status === 204 ? null : res.json();
}

async function ghGraphql(query, variables = {}) {
  const res = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${GH_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`GraphQL → ${res.status}: ${t.slice(0, 300)}`);
  }
  const json = await res.json();
  if (json.errors) {
    throw new Error(`GraphQL errors: ${JSON.stringify(json.errors).slice(0, 300)}`);
  }
  return json.data;
}

// ─── Project field cache (one fetch per run) ──────────────────────────────
let _fields = null;
async function getProjectFields() {
  if (_fields) return _fields;
  const data = await ghGraphql(`
    query($id: ID!) {
      node(id: $id) {
        ... on ProjectV2 {
          fields(first: 30) {
            nodes {
              __typename
              ... on ProjectV2Field { id name }
              ... on ProjectV2SingleSelectField { id name options { id name } }
            }
          }
        }
      }
    }
  `, { id: PROJECT_ID });
  _fields = data.node.fields.nodes;
  return _fields;
}

async function getStatusField() {
  const fields = await getProjectFields();
  return fields.find(f => f.name === 'Status');
}

async function getOptionId(statusName) {
  const status = await getStatusField();
  if (!status) return null;
  const opt = status.options.find(o => o.name === statusName);
  return opt ? opt.id : null;
}

async function getFieldId(name) {
  const fields = await getProjectFields();
  const f = fields.find(x => x.name === name);
  return f ? f.id : null;
}

// ─── Per-issue project item lookup (O(1)) ─────────────────────────────────
// HARD CONSTRAINT: must use projectItems(first: 10) per node, never the
// full-board items(first: 100) scan.
async function getOrCreateItemForContent(contentNodeId) {
  const existing = await getProjectItemForContent(contentNodeId);
  if (existing) return existing.id;
  return addProjectItem(contentNodeId);
}

async function addProjectItem(contentNodeId) {
  const add = await ghGraphql(`
    mutation($projectId: ID!, $contentId: ID!) {
      addProjectV2ItemById(input: { projectId: $projectId, contentId: $contentId }) {
        item { id }
      }
    }
  `, { projectId: PROJECT_ID, contentId: contentNodeId });
  return add.addProjectV2ItemById.item.id;
}

async function getProjectItemForContent(contentNodeId) {
  const data = await ghGraphql(`
    query($id: ID!) {
      node(id: $id) {
        ... on Issue {
          projectItems(first: 10) {
            nodes {
              id
              project { id }
              fieldValueByName(name: "Status") {
                ... on ProjectV2ItemFieldSingleSelectValue { name }
              }
            }
          }
        }
        ... on PullRequest {
          projectItems(first: 10) {
            nodes {
              id
              project { id }
              fieldValueByName(name: "Status") {
                ... on ProjectV2ItemFieldSingleSelectValue { name }
              }
            }
          }
        }
      }
    }
  `, { id: contentNodeId });
  const items = data.node?.projectItems?.nodes ?? [];
  const existing = items.find(i => i.project?.id === PROJECT_ID);
  return existing
    ? { id: existing.id, status: existing.fieldValueByName?.name ?? null }
    : null;
}

async function setSingleSelect(itemId, fieldId, optionId) {
  await ghGraphql(`
    mutation($p: ID!, $i: ID!, $f: ID!, $v: String!) {
      updateProjectV2ItemFieldValue(input: {
        projectId: $p, itemId: $i, fieldId: $f, value: { singleSelectOptionId: $v }
      }) { projectV2Item { id } }
    }
  `, { p: PROJECT_ID, i: itemId, f: fieldId, v: optionId });
}

async function setText(itemId, fieldId, text) {
  await ghGraphql(`
    mutation($p: ID!, $i: ID!, $f: ID!, $v: String!) {
      updateProjectV2ItemFieldValue(input: {
        projectId: $p, itemId: $i, fieldId: $f, value: { text: $v }
      }) { projectV2Item { id } }
    }
  `, { p: PROJECT_ID, i: itemId, f: fieldId, v: text });
}

async function setStatus(contentNodeId, contentType, statusName) {
  const status = await getStatusField();
  if (!status) {
    console.log(`[skip] Status field not found on project`);
    return;
  }
  const optionId = await getOptionId(statusName);
  if (!optionId) {
    console.log(`[skip] Status option "${statusName}" not on board`);
    return;
  }
  const itemId = await getOrCreateItemForContent(contentNodeId);
  await setSingleSelect(itemId, status.id, optionId);
  console.log(`[ok] ${contentType} → status="${statusName}"`);
}

async function setAgentField(contentNodeId, agentName) {
  const fieldId = await getFieldId('Agent');
  if (!fieldId) {
    console.log(`[skip] Agent field not found`);
    return;
  }
  const itemId = await getOrCreateItemForContent(contentNodeId);
  await setText(itemId, fieldId, agentName);
  console.log(`[ok] Issue → agent="${agentName}"`);
}

async function setDeploySha(issueNodeId, sha) {
  const deployId = await getFieldId('Deploy SHA');
  if (!deployId) {
    console.log(`[skip] Deploy SHA field not found`);
    return;
  }
  const itemId = await getOrCreateItemForContent(issueNodeId);
  await setText(itemId, deployId, sha);
  console.log(`[ok] Issue → deploy_sha=${sha}`);
}

function parseLinkedIssues(body) {
  if (!body) return [];
  const matches = body.match(/(?:clos(?:es|ed)|fix(?:es|ed)|resolv(?:es|ed))[\s]+#(\d+)/gi) ?? [];
  const nums = matches.map(m => parseInt(m.match(/\d+/)[0], 10));
  return [...new Set(nums)];
}

function statusFromLabel(labelName) {
  const state = labelName.replace(/^status:/, '');
  switch (state) {
    case 'in_progress':
    case 'wip':       return ['In Progress', null];
    case 'blocked':   return ['Blocked', 'In Progress'];
    case 'done':      return ['Done', null];
    case 'abandoned': return ['Abandoned', 'Done'];
    default:          return [null, null];
  }
}

function statusFromComment(body) {
  const m = body && body.match(/state:\s*([a-z_]+)/);
  if (!m) return [null, null];
  return statusFromLabel(`status:${m[1]}`);
}

function desiredIssueStatus(issue) {
  if (issue.state === 'closed') return 'Done';
  const labels = (issue.labels ?? []).map(label => typeof label === 'string' ? label : label.name);
  if (labels.includes('status:blocked')) return 'Blocked';
  if (labels.includes('status:done') || labels.includes('status:abandoned')) return 'Done';
  if (labels.some(label => /^status:(wip|in_progress)$/.test(label))) return 'In Progress';
  if ((issue.assignees ?? []).length > 0) return 'In Progress';
  return 'Todo';
}

async function listOpenIssues(repo) {
  const issues = [];
  for (let page = 1; ; page++) {
    const batch = await ghRest(
      'GET',
      `/repos/${repo}/issues?state=open&per_page=100&page=${page}`,
    );
    issues.push(...batch.filter(issue => !issue.pull_request));
    if (batch.length < 100) return issues;
  }
}

// ─── Router ───────────────────────────────────────────────────────────────
async function main() {
  console.log(`[project-sync] event=${EVENT_KIND} repo=${REPO}`);

  switch (EVENT_KIND) {
    case 'issue.opened':
    case 'issue.reopened': {
      // Intake only: add the card, then let triage/supervisor decide whether
      // the issue is eligible for execution and who should own it.
      if (EVENT_KIND === 'issue.opened') {
        await setStatus(ISSUE_NODE_ID, 'Issue', 'Todo');
      } else {
        const issue = await ghRest('GET', `/repos/${REPO}/issues/${ISSUE_NUMBER}`);
        const status = (issue.assignees ?? []).length > 0 ? 'In Progress' : 'Todo';
        await setStatus(ISSUE_NODE_ID, 'Issue', status);
      }
      break;
    }

    case 'issue.assigned': {
      await setStatus(ISSUE_NODE_ID, 'Issue', 'In Progress');
      break;
    }

    case 'issue.closed': {
      await setStatus(ISSUE_NODE_ID, 'Issue', 'Done');
      break;
    }

    case 'issue.status.changed': {
      const issue = await ghRest('GET', `/repos/${REPO}/issues/${ISSUE_NUMBER}`);
      const desired = desiredIssueStatus(issue);
      await setStatus(ISSUE_NODE_ID, 'Issue', desired);
      break;
    }

    case 'issue.labeled.agent': {
      const agent = LABEL_ACTION === 'labeled'
        ? LABEL_NAME.replace(/^agent:claimed:/, '')
        : '';
      await setAgentField(ISSUE_NODE_ID, agent);
      break;
    }

    case 'issue_comment.status': {
      const [primary, fallback] = statusFromComment(COMMENT_BODY ?? '');
      if (!primary) { console.log(`[skip] no state in /status comment`); break; }
      let optionId = await getOptionId(primary);
      let used = primary;
      if (!optionId && fallback) { optionId = await getOptionId(fallback); used = fallback; }
      if (!optionId) { console.log(`[skip] no matching status option`); break; }
      const itemId = await getOrCreateItemForContent(ISSUE_NODE_ID);
      const status = await getStatusField();
      await setSingleSelect(itemId, status.id, optionId);
      console.log(`[ok] #${ISSUE_NUMBER} status="${used}" (from /status comment)`);
      break;
    }

    case 'pr.opened':
    case 'pr.reopened':
    case 'pr.ready_for_review': {
      await setStatus(PR_NODE_ID, 'PullRequest', 'In Progress');
      const linked = parseLinkedIssues(PR_BODY ?? '');
      for (const n of linked) {
        try {
          const issue = await ghRest('GET', `/repos/${REPO}/issues/${n}`);
          await setStatus(issue.node_id, 'Issue', 'In Progress');
        } catch (e) {
          console.log(`[warn] linked issue #${n}: ${e.message}`);
        }
      }
      break;
    }

    case 'pr.synchronize': {
      await getOrCreateItemForContent(PR_NODE_ID);
      console.log(`[ok] PR card present (status unchanged on synchronize)`);
      break;
    }

    case 'pr.closed': {
      await setStatus(PR_NODE_ID, 'PullRequest', 'Done');
      if (PR_MERGED === 'true') {
        const linked = parseLinkedIssues(PR_BODY ?? '');
        for (const n of linked) {
          try {
            const issue = await ghRest('GET', `/repos/${REPO}/issues/${n}`);
            await setDeploySha(issue.node_id, MERGE_SHA);
          } catch (e) {
            console.log(`[warn] linked issue #${n}: ${e.message}`);
          }
        }
      }
      break;
    }

    case 'reconcile': {
      await reconcile();
      break;
    }

    default:
      console.log(`[skip] unknown EVENT_KIND ${EVENT_KIND}`);
  }
}

async function reconcile() {
  const repo = REPO;
  const status = await getStatusField();
  if (!status) { console.log('[skip] no Status field'); return; }
  const options = new Map(status.options.map(option => [option.name, option.id]));
  const open = await listOpenIssues(repo);

  let added = 0;
  let reconciled = 0;
  for (const issue of open) {
    try {
      const desired = desiredIssueStatus(issue);
      const optionId = options.get(desired);
      if (!optionId) {
        console.log(`[warn] #${issue.number}: Status option "${desired}" not found`);
        continue;
      }
      const existing = await getProjectItemForContent(issue.node_id);
      const itemId = existing?.id ?? await addProjectItem(issue.node_id);
      if (!existing) {
        added++;
        console.log(`[ok] added missing card #${issue.number}`);
      }
      if (existing?.status === desired) continue;
      await setSingleSelect(itemId, status.id, optionId);
      reconciled++;
      console.log(`[ok] ${repo}#${issue.number}: ${existing?.status ?? '(unset)'} → ${desired}`);
    } catch (e) {
      console.log(`[warn] reconcile ${repo}#${issue.number}: ${e.message}`);
    }
  }

  console.log(`[done] reconcile added=${added} reconciled=${reconciled}`);
}

await main();
