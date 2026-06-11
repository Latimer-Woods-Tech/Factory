#!/usr/bin/env node
// lifecycle-controller.mjs — RFC-006 Phase 1: single writer for status:* labels.
// Shadow mode by default (LIFECYCLE_SHADOW_MODE=true). Set to "false" to enforce.

// ─── State machine ────────────────────────────────────────────────────────────

/** @type {Record<string, string>} label → canonical state name */
const LABEL_TO_STATE = {
  'status:intake':      'Intake',
  'status:ready':       'Ready',
  'status:in_progress': 'In Progress',
  'status:in_review':   'In Review',
  'status:blocked':     'Blocked',
  'status:verifying':   'Verifying',
  'status:done':        'Done',
  'status:cancelled':   'Cancelled',
};

/** @type {Record<string, string>} canonical state name → label */
const STATE_TO_LABEL = {
  'Intake':      'status:intake',
  'Ready':       'status:ready',
  'In Progress': 'status:in_progress',
  'In Review':   'status:in_review',
  'Blocked':     'status:blocked',
  'Verifying':   'status:verifying',
  'Done':        'status:done',
  'Cancelled':   'status:cancelled',
};

/**
 * Valid transitions from each state. Every state can transition to Blocked
 * (enforced below in validateTransition). Listed transitions are in addition to
 * the universal Blocked edge.
 */
const TRANSITIONS = {
  'Intake':      ['Ready', 'Cancelled'],
  'Ready':       ['In Progress', 'Cancelled'],
  'In Progress': ['In Review', 'Blocked', 'Cancelled'],
  'In Review':   ['In Progress', 'Verifying', 'Ready', 'Blocked', 'Cancelled'],
  'Blocked':     ['Ready', 'In Progress', 'In Review', 'Cancelled'],
  'Verifying':   ['Done', 'In Progress', 'Blocked'],
  'Done':        ['Intake'],
  'Cancelled':   ['Intake'],
};

// ─── HTTP helpers ─────────────────────────────────────────────────────────────

const GH_TOKEN = process.env.GH_TOKEN;

/**
 * Make a GitHub REST API call.
 * @param {string} method
 * @param {string} path  Absolute URL or path relative to api.github.com
 * @param {object} [data]
 * @returns {Promise<object|null>}
 */
async function ghRest(method, path, data) {
  const url = path.startsWith('http') ? path : `https://api.github.com${path}`;
  let res;
  try {
    res = await fetch(url, {
      method,
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${GH_TOKEN}`,
        'X-GitHub-Api-Version': '2022-11-28',
        ...(data ? { 'Content-Type': 'application/json' } : {}),
      },
      body: data ? JSON.stringify(data) : undefined,
    });
  } catch (err) {
    throw new Error(`GH ${method} ${path} network error: ${err.message}`);
  }
  if (!res.ok) {
    let body = '';
    try { body = await res.text(); } catch { /* ignore */ }
    throw new Error(`GH ${method} ${path} → ${res.status}: ${body.slice(0, 300)}`);
  }
  return res.status === 204 ? null : res.json();
}

// ─── Core transition logic ────────────────────────────────────────────────────

/**
 * Validate whether a transition from → to is permitted.
 * @param {string|null} fromState  Current state name, or null if no status label.
 * @param {string} toState         Target state name.
 * @param {object} evidence        Evidence bag — must include blockerType for → Blocked.
 * @returns {{ ok: boolean, reason?: string }}
 */
function validateTransition(fromState, toState, evidence) {
  // toState must be a known state.
  if (!STATE_TO_LABEL[toState]) {
    return { ok: false, reason: `Unknown target state "${toState}"` };
  }

  // Any state → Blocked requires a named blockerType.
  if (toState === 'Blocked') {
    if (!evidence?.blockerType) {
      return { ok: false, reason: 'Transition to Blocked requires evidence.blockerType' };
    }
    return { ok: true };
  }

  // No current status label → only Intake is valid as a first write.
  if (!fromState) {
    if (toState === 'Intake') return { ok: true };
    return { ok: false, reason: `No current status label; only "Intake" is valid as an initial state, got "${toState}"` };
  }

  const allowed = TRANSITIONS[fromState] ?? [];
  if (!allowed.includes(toState)) {
    return {
      ok: false,
      reason: `Transition "${fromState}" → "${toState}" is not in the state machine. Allowed: ${allowed.join(', ')}`,
    };
  }

  return { ok: true };
}

/**
 * Read the current status label(s) from a GitHub issue.
 * Returns the canonical state name (e.g. "In Progress") or null.
 * @param {string} repo   "owner/repo"
 * @param {number} issueNumber
 * @returns {Promise<{ fromState: string|null, currentStatusLabels: string[] }>}
 */
async function readCurrentState(repo, issueNumber) {
  const issue = await ghRest('GET', `/repos/${repo}/issues/${issueNumber}`);
  const labels = (issue.labels ?? []).map(l => l.name);
  const statusLabels = labels.filter(l => LABEL_TO_STATE[l]);
  const fromState = statusLabels.length > 0 ? LABEL_TO_STATE[statusLabels[0]] : null;
  return { fromState, currentStatusLabels: statusLabels };
}

/**
 * Remove a label from a GitHub issue.
 * @param {string} repo
 * @param {number} issueNumber
 * @param {string} label
 */
async function removeLabel(repo, issueNumber, label) {
  const encoded = encodeURIComponent(label);
  await ghRest('DELETE', `/repos/${repo}/issues/${issueNumber}/labels/${encoded}`);
}

/**
 * Add a label to a GitHub issue.
 * @param {string} repo
 * @param {number} issueNumber
 * @param {string} label
 */
async function addLabel(repo, issueNumber, label) {
  await ghRest('POST', `/repos/${repo}/issues/${issueNumber}/labels`, { labels: [label] });
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * @typedef {object} TransitionOpts
 * @property {string}  issueNodeId   GraphQL node ID (informational in Phase 1)
 * @property {number}  issueNumber
 * @property {string}  repo          "owner/repo"
 * @property {string}  toState       Target state name e.g. "In Progress"
 * @property {string}  actor         Who/what is requesting
 * @property {object}  evidence      Free-form: { prNumber?, deployUrl?, blockerType?, reason? }
 * @property {string}  correlationId UUID / run ID
 */

/**
 * Request a lifecycle state transition for a GitHub issue.
 * Emits a JSON receipt to stdout regardless of outcome.
 *
 * @param {TransitionOpts} opts
 * @returns {Promise<object>} receipt object
 */
export async function requestTransition(opts) {
  const { issueNodeId, issueNumber, repo, toState, actor, evidence, correlationId } = opts;

  const shadowMode = process.env.LIFECYCLE_SHADOW_MODE !== 'false';

  const timestamp = new Date().toISOString();

  // 1. Read current state.
  let fromState;
  let currentStatusLabels;
  try {
    ({ fromState, currentStatusLabels } = await readCurrentState(repo, issueNumber));
  } catch (err) {
    const receipt = {
      correlationId,
      issueNumber,
      repo,
      fromState: null,
      toState,
      actor,
      timestamp,
      shadowMode,
      result: 'rejected',
      reason: `Failed to read issue state: ${err.message}`,
    };
    process.stdout.write(JSON.stringify(receipt) + '\n');
    return receipt;
  }

  // 2. Noop check — target label already present.
  const targetLabel = STATE_TO_LABEL[toState];
  if (targetLabel && currentStatusLabels.includes(targetLabel)) {
    const receipt = {
      correlationId,
      issueNumber,
      repo,
      fromState,
      toState,
      actor,
      timestamp,
      shadowMode,
      result: 'noop',
    };
    process.stdout.write(JSON.stringify(receipt) + '\n');
    return receipt;
  }

  // 3. Validate transition.
  const { ok, reason } = validateTransition(fromState, toState, evidence ?? {});
  if (!ok) {
    const receipt = {
      correlationId,
      issueNumber,
      repo,
      fromState,
      toState,
      actor,
      timestamp,
      shadowMode,
      result: 'rejected',
      reason,
    };
    process.stdout.write(JSON.stringify(receipt) + '\n');
    return receipt;
  }

  // 4. Apply or shadow.
  if (shadowMode) {
    console.log(
      `[lifecycle-controller][shadow] would transition #${issueNumber} ${fromState ?? '(none)'} → ${toState}` +
      ` (remove: ${currentStatusLabels.join(', ') || 'none'}, add: ${targetLabel})`
    );
  } else {
    // Remove all existing status:* labels first, then add the target.
    for (const lbl of currentStatusLabels) {
      try {
        await removeLabel(repo, issueNumber, lbl);
      } catch (err) {
        console.warn(`[lifecycle-controller] warn: could not remove label "${lbl}" from #${issueNumber}: ${err.message}`);
      }
    }
    try {
      await addLabel(repo, issueNumber, targetLabel);
    } catch (err) {
      const receipt = {
        correlationId,
        issueNumber,
        repo,
        fromState,
        toState,
        actor,
        timestamp,
        shadowMode,
        result: 'rejected',
        reason: `Failed to add label "${targetLabel}": ${err.message}`,
      };
      process.stdout.write(JSON.stringify(receipt) + '\n');
      return receipt;
    }
  }

  const receipt = {
    correlationId,
    issueNumber,
    repo,
    fromState,
    toState,
    actor,
    timestamp,
    shadowMode,
    result: 'applied',
  };
  process.stdout.write(JSON.stringify(receipt) + '\n');
  return receipt;
}

// ─── CLI / workflow entrypoint ────────────────────────────────────────────────

/**
 * Derive the target state from workflow event env vars.
 * Used when the workflow is triggered by an issues event rather than
 * workflow_dispatch (where TO_STATE is supplied directly).
 *
 * @returns {string|null} state name, '__closed__' sentinel, or null when the event should be skipped
 */
function deriveToStateFromEvent() {
  const action = process.env.EVENT_ACTION ?? '';
  const labelName = process.env.EVENT_LABEL ?? '';

  switch (action) {
    case 'opened':
      return 'Intake';

    case 'reopened':
      return 'Intake';

    case 'closed':
      // Closed with no status label context — lifecycle-controller will read
      // labels in requestTransition → read current state. We need to decide
      // here which terminal state to request. Delegate to a label read inside
      // main() by returning a sentinel.
      return '__closed__';

    case 'labeled':
      if (labelName.startsWith('status:') && LABEL_TO_STATE[labelName]) {
        return LABEL_TO_STATE[labelName];
      }
      // Not a status label — skip.
      return null;

    case 'unlabeled':
      // Lifecycle controller does not respond to label removal alone.
      console.log(`[lifecycle-controller] unlabeled event for "${labelName}" — skipping (label removal is not a transition request)`);
      return null;

    default:
      return null;
  }
}

/**
 * Main CLI entrypoint. Reads env vars and calls requestTransition().
 */
export async function main() {
  if (!GH_TOKEN) {
    console.error('[lifecycle-controller] GH_TOKEN env var required');
    process.exit(1);
  }

  const issueNumberStr = process.env.ISSUE_NUMBER ?? '';
  const repo = process.env.REPO ?? '';
  const actor = process.env.ACTOR ?? 'lifecycle-controller';
  const evidenceJson = process.env.EVIDENCE_JSON ?? '{}';
  const correlationId = process.env.CORRELATION_ID ?? `manual-${Date.now()}`;
  const eventAction = process.env.EVENT_ACTION ?? '';

  if (!issueNumberStr || !repo) {
    console.log('[lifecycle-controller] ISSUE_NUMBER or REPO not set — skipping');
    return;
  }

  const issueNumber = parseInt(issueNumberStr, 10);
  if (Number.isNaN(issueNumber)) {
    console.error(`[lifecycle-controller] Invalid ISSUE_NUMBER: "${issueNumberStr}"`);
    process.exit(1);
  }

  let evidence;
  try {
    evidence = JSON.parse(evidenceJson);
  } catch {
    console.error(`[lifecycle-controller] Invalid EVIDENCE_JSON: ${evidenceJson}`);
    process.exit(1);
  }

  // Determine toState — either supplied directly or derived from the event.
  let toState = process.env.TO_STATE ?? '';

  if (!toState && eventAction) {
    const derived = deriveToStateFromEvent();
    if (derived === null) {
      console.log('[lifecycle-controller] No actionable state derived from event — exiting cleanly');
      return;
    }
    toState = derived;
  }

  // Special sentinel for closed events — read labels to decide Done vs Cancelled.
  if (toState === '__closed__') {
    let currentLabels = [];
    try {
      const issue = await ghRest('GET', `/repos/${repo}/issues/${issueNumber}`);
      currentLabels = (issue.labels ?? []).map(l => l.name);
    } catch (err) {
      console.error(`[lifecycle-controller] Could not read issue labels for closed event: ${err.message}`);
      process.exit(1);
    }
    const hasDoneEvidence = currentLabels.some(l => l === 'status:done' || l === 'status:verifying');
    toState = hasDoneEvidence ? 'Done' : 'Cancelled';
    console.log(`[lifecycle-controller] closed event → "${toState}" (labels: ${currentLabels.filter(l => l.startsWith('status:')).join(', ') || 'none'})`);
  }

  if (!toState) {
    console.log('[lifecycle-controller] TO_STATE not set and no event action — skipping');
    return;
  }

  // issueNodeId is not available in the workflow env for all event paths in Phase 1;
  // pass a placeholder — the REST path uses issueNumber directly.
  const issueNodeId = process.env.ISSUE_NODE_ID ?? '';

  await requestTransition({
    issueNodeId,
    issueNumber,
    repo,
    toState,
    actor,
    evidence,
    correlationId,
  });
}

// Run when invoked directly (not imported as a module).
// `import.meta.url` comparison works for both `node script.mjs` and
// GitHub Actions `run: node .github/scripts/lifecycle-controller.mjs`.
if (process.argv[1] && new URL(import.meta.url).pathname === process.argv[1]) {
  main().catch(err => {
    console.error('[lifecycle-controller] fatal:', err.message);
    process.exit(1);
  });
}
