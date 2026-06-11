#!/usr/bin/env node
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
//   issue.labeled.status, issue.labeled.agent,
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
  const data = await ghGraphql(`
    query($id: ID!) {
      node(id: $id) {
        ... on Issue { projectItems(first: 10) { nodes { id project { id } } } }
        ... on PullRequest { projectItems(first: 10) { nodes { id project { id } } } }
      }
    }
  `, { id: contentNodeId });
  const items = data.node?.projectItems?.nodes ?? [];
  const existing = items.find(i => i.project?.id === PROJECT_ID);
  if (existing) return existing.id;

  const add = await ghGraphql(`
    mutation($projectId: ID!, $contentId: ID!) {
      addProjectV2ItemById(input: { projectId: $projectId, contentId: $contentId }) {
        item { id }
      }
    }
  `, { projectId: PROJECT_ID, contentId: contentNodeId });
  return add.addProjectV2ItemById.item.id;
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
    case 'intake':                   return ['Intake', null];
    case 'ready':                    return ['Ready', null];
    case 'in_progress':
    case 'wip':                      return ['In Progress', null];
    case 'in_review':                return ['In Review', 'In Progress'];
    case 'blocked':                  return ['Blocked', 'In Progress'];
    case 'verifying':                return ['Verifying', 'In Review'];
    case 'done':                     return ['Done', null];
    case 'cancelled':
    case 'abandoned':                return ['Cancelled', null];
    default:                         return [null, null];
  }
}

// Determine Done vs Cancelled from issue labels when a close event fires.
// A manual close without a status:done label → Cancelled.
// Returns 'Done' only when the issue carried explicit completion evidence.
function terminalStatusFromLabels(labelNames) {
  if (labelNames.some(l => l === 'status:done' || l === 'status:verifying')) return 'Done';
  return 'Cancelled';
}

function statusFromComment(body) {
  const m = body && body.match(/state:\s*([a-z_]+)/);
  if (!m) return [null, null];
  return statusFromLabel(`status:${m[1]}`);
}

async function tryAssignCopilot(repo, issueNumber) {
  const issue = await ghRest('GET', `/repos/${repo}/issues/${issueNumber}`);
  if ((issue.assignees ?? []).length > 0) {
    console.log(`[skip] #${issueNumber} already assigned`);
    return;
  }
  try {
    await ghRest('POST', `/repos/${repo}/issues/${issueNumber}/assignees`, {
      assignees: ['copilot-swe-agent'],
    });
    console.log(`[ok] #${issueNumber} auto-assigned to copilot-swe-agent`);
  } catch (e) {
    console.log(`[warn] could not assign copilot-swe-agent to #${issueNumber}: ${e.message}`);
  }
}

// ─── Router ───────────────────────────────────────────────────────────────
async function main() {
  console.log(`[project-sync] event=${EVENT_KIND} repo=${REPO}`);

  switch (EVENT_KIND) {
    case 'issue.opened':
    case 'issue.reopened': {
      // Add to board (factor of auto-add-to-project) + auto-assign Copilot
      // (factor of project-board-sync). Status is set by issue.assigned/labeled
      // events that follow.
      await getOrCreateItemForContent(ISSUE_NODE_ID);
      console.log(`[ok] #${ISSUE_NUMBER} added to project board`);
      if (EVENT_KIND === 'issue.opened') {
        await tryAssignCopilot(REPO, ISSUE_NUMBER);
      }
      if (EVENT_KIND === 'issue.reopened') {
        const issue = await ghRest('GET', `/repos/${REPO}/issues/${ISSUE_NUMBER}`);
        const status = (issue.assignees ?? []).length > 0 ? 'In Progress' : 'Intake';
        await setStatus(ISSUE_NODE_ID, 'Issue', status);
      }
      break;
    }

    case 'issue.assigned': {
      await setStatus(ISSUE_NODE_ID, 'Issue', 'In Progress');
      break;
    }

    case 'issue.closed': {
      // Closing an issue is transport state, not proof of completion.
      // Read labels to decide Done vs Cancelled per RFC-006 §5.3 and ADR
      // 2026-06-11 Decision 3: only status:done or status:verifying labels
      // (written by the verifier or an authorized human) warrant Done.
      const closedIssue = await ghRest('GET', `/repos/${REPO}/issues/${ISSUE_NUMBER}`);
      const closedLabels = (closedIssue.labels ?? []).map(l => l.name);
      const terminal = terminalStatusFromLabels(closedLabels);
      await setStatus(ISSUE_NODE_ID, 'Issue', terminal);
      console.log(`[ok] #${ISSUE_NUMBER} closed → "${terminal}" (labels: ${closedLabels.filter(l => l.startsWith('status:')).join(', ') || 'none'})`);
      break;
    }

    case 'issue.labeled.status': {
      const [primary, fallback] = statusFromLabel(LABEL_NAME);
      if (!primary) { console.log(`[skip] unknown status label ${LABEL_NAME}`); break; }
      let optionId = await getOptionId(primary);
      let used = primary;
      if (!optionId && fallback) { optionId = await getOptionId(fallback); used = fallback; }
      if (!optionId) { console.log(`[skip] no matching status option`); break; }
      const itemId = await getOrCreateItemForContent(ISSUE_NODE_ID);
      const status = await getStatusField();
      await setSingleSelect(itemId, status.id, optionId);
      console.log(`[ok] #${ISSUE_NUMBER} status="${used}" (from label ${LABEL_NAME})`);
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
            await setStatus(issue.node_id, 'Issue', 'Done');
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
  const { execSync } = await import('node:child_process');
  const exec = (cmd) => execSync(cmd, { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });

  const repo = REPO;
  const status = await getStatusField();
  if (!status) { console.log('[skip] no Status field'); return; }
  const todoOpt = await getOptionId('Todo') ?? await getOptionId('Intake');
  const intakeOpt = await getOptionId('Intake') ?? todoOpt;
  const inProgressOpt = await getOptionId('In Progress');
  const doneOpt = await getOptionId('Done');
  const cancelledOpt = await getOptionId('Cancelled');

  const boardJson = exec(
    `gh project item-list ${PROJECT_NUMBER} --owner ${PROJECT_OWNER} --limit 1000 --format json`
  );
  const boardItems = JSON.parse(boardJson).items ?? [];
  const boardNumbers = new Set(
    boardItems
      .filter(i => i.content?.type === 'Issue' && i.content?.repository === repo)
      .map(i => i.content.number)
  );

  const openJson = exec(
    `gh issue list --repo ${repo} --state open --limit 500 --json number,id`
  );
  const open = JSON.parse(openJson);

  let added = 0;
  for (const issue of open) {
    if (boardNumbers.has(issue.number)) continue;
    try {
      await getOrCreateItemForContent(issue.id);
      added++;
      console.log(`[ok] added missing card #${issue.number}`);
    } catch (e) {
      console.log(`[warn] add #${issue.number}: ${e.message}`);
    }
  }

  let reconciled = 0;
  for (const item of boardItems) {
    if (item.content?.type !== 'Issue') continue;
    const issueRepo = item.content.repository;
    const num = item.content.number;
    const boardStatus = item.status;

    let issueState, assigneeCount, labels = [];
    try {
      const j = exec(
        `gh issue view ${num} --repo ${issueRepo} --json state,assignees,labels`
      );
      const data = JSON.parse(j);
      issueState = data.state;
      assigneeCount = (data.assignees ?? []).length;
      labels = (data.labels ?? []).map(l => l.name);
    } catch {
      continue;
    }

    let target = null;
    let targetOpt = null;
    if (issueState === 'CLOSED') {
      const terminal = terminalStatusFromLabels(labels);
      if (boardStatus !== terminal) {
        target = terminal;
        targetOpt = terminal === 'Done' ? doneOpt : (cancelledOpt ?? doneOpt);
      }
    } else if (issueState === 'OPEN' && boardStatus === 'Done') {
      if (labels.some(l => /^status:(wip|in_progress)$/.test(l))) {
        target = 'In Progress'; targetOpt = inProgressOpt;
      } else if (assigneeCount > 0) {
        target = 'In Progress'; targetOpt = inProgressOpt;
      } else {
        target = 'Intake'; targetOpt = intakeOpt;
      }
    }
    if (!target || !targetOpt) continue;

    try {
      await setSingleSelect(item.id, status.id, targetOpt);
      reconciled++;
      console.log(`[ok] ${issueRepo}#${num}: ${boardStatus} → ${target}`);
    } catch (e) {
      console.log(`[warn] reconcile ${issueRepo}#${num}: ${e.message}`);
    }
  }

  console.log(`[done] reconcile added=${added} reconciled=${reconciled}`);
}

await main();
