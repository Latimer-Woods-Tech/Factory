#!/usr/bin/env node
// =============================================================================
// adr-need-check.mjs — Gap G11. PR-time "does this PR need an ADR?" check.
//
// ADVISORY / SHADOW MODE: this check NEVER blocks a PR. It always exits 0.
// It posts (or edits) a single PR comment when it believes an ADR is warranted.
//
// Two-stage detector:
//   1. Path heuristic (fast path, no API call):
//      - No architecturally-significant paths touched → PASS (silent).
//      - Significant paths touched AND an ADR file is present in the PR → PASS
//        (the change is already documented).
//      - Significant paths touched AND no ADR present → INCONCLUSIVE → stage 2.
//   2. Claude fallback (ONE call per PR, only when inconclusive):
//      - Ask claude-haiku-4-5 whether the changed paths warrant an ADR.
//      - yes → advisory comment "consider adding an ADR".
//      - no  → PASS.
//      - FAIL-OPEN: missing key / API error / unparseable response → PASS with
//        a note. Never blocks.
//
// =============================================================================
//   BLAST RADIUS
// =============================================================================
//   CAN:
//     - Read PR file list via gh CLI
//     - Make ONE Anthropic Messages API call (claude-haiku-4-5, ~50 tokens)
//     - Post / edit one PR comment
//     - Always exit 0 (advisory)
//   CANNOT:
//     - Modify any file, push code, approve / merge / close any PR
//     - Fail the PR (no non-zero exit on a "needs ADR" verdict)
//
// =============================================================================
//   DEFENSES INHERITED
// =============================================================================
//   #1 Kill switch       — paused → returns PASS (advisory under freeze)
//   #2 Fail-open         — any LLM error → PASS + note
//   #3 Bounded blast     — workflow permissions: contents:read + pull-
//                          requests:write only
//   #4 Audit             — ADR_NEED_AUDIT: log line per run
//
// REF: docs/GAP_REGISTER.md G11
// =============================================================================

import { existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { notify } from './pushover-notify.mjs';

const ANTHROPIC_MODEL = 'claude-haiku-4-5';
const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';
const COMMENT_MARKER = '<!-- adr-need-check -->';

// ---------------------------------------------------------------------------
// Kill switch — inlined.
// ---------------------------------------------------------------------------
export function isAutomationPaused(p = '.github/automation-paused') {
  return existsSync(p);
}

// ---------------------------------------------------------------------------
// Pure functions — testable.
// ---------------------------------------------------------------------------

/**
 * Architecturally-significant path predicates. A PR touching any of these
 * MAY warrant an ADR. Matched against changed file paths (any status except
 * pure deletion is treated as "touched"; new-app detection also keys off
 * 'added').
 */
const SIGNIFICANT_MATCHERS = [
  // Public package API surface.
  (p) => /^packages\/[^/]+\/src\/index\.ts$/.test(p),
  // Binding / runtime topology of an app.
  (p) => /^apps\/[^/]+\/wrangler\.jsonc$/.test(p),
  // Schema changes (top-level or nested migrations dirs).
  (p) => /^migrations\/.+\.sql$/.test(p),
  (p) => /(^|\/)migrations\/.+\.sql$/.test(p),
  // Architecture docs.
  (p) => /^docs\/architecture\//.test(p),
  // Root operating contract.
  (p) => p === 'CLAUDE.md',
];

/**
 * Classify a PR file list into the set of architecturally-significant paths
 * touched, plus the structural signals (new app, new workflow).
 *
 * @param {{path:string,status:string}[]} files
 * @returns {{ significant: string[], newApps: string[], addedWorkflows: string[], significantTouched: boolean }}
 */
export function classifySignificantPaths(files) {
  const significant = new Set();
  const newApps = new Set();
  const addedWorkflows = [];

  for (const f of files || []) {
    const path = f && f.path;
    const status = f && f.status;
    if (!path) continue;

    // Deleted files don't introduce new architecture (a removed index.ts is
    // an API removal — still significant — but a pure tidy-delete shouldn't
    // trip the heuristic). We treat 'removed' as non-touching for matchers
    // EXCEPT we never need an ADR just to delete, so skip deletions.
    const touched = status !== 'removed';

    if (touched) {
      for (const match of SIGNIFICANT_MATCHERS) {
        if (match(path)) {
          significant.add(path);
          break;
        }
      }
    }

    // A whole new app: a freshly-added file under apps/<name>/ where the
    // wrangler.jsonc or package.json is added implies a new app surface.
    if (status === 'added') {
      const appMatch = path.match(/^apps\/([^/]+)\//);
      if (appMatch && /(^|\/)(wrangler\.jsonc|package\.json)$/.test(path)) {
        newApps.add(appMatch[1]);
        significant.add(path);
      }
    }

    // A newly-added workflow is a new automation surface.
    if (status === 'added' && /^\.github\/workflows\/.+\.ya?ml$/.test(path) && !path.endsWith('/REGISTRY.md')) {
      addedWorkflows.push(path);
      significant.add(path);
    }
  }

  return {
    significant: [...significant],
    newApps: [...newApps],
    addedWorkflows,
    significantTouched: significant.size > 0,
  };
}

/**
 * Detect whether the PR already adds or modifies an ADR file. ADR files live
 * under docs/decisions/**, docs/adr/**, or adr/** and carry a .md extension.
 * Pure deletions don't count as "documenting".
 *
 * @param {{path:string,status:string}[]} files
 * @returns {boolean}
 */
export function prHasAdr(files) {
  for (const f of files || []) {
    const path = f && f.path;
    const status = f && f.status;
    if (!path || status === 'removed') continue;
    if (!/\.md$/.test(path)) continue;
    if (/^docs\/decisions\//.test(path) || /^docs\/adr\//.test(path) || /^adr\//.test(path)) {
      // README.md / template scaffolding isn't a decision record.
      const base = path.split('/').pop().toLowerCase();
      if (base === 'readme.md' || base === '0000-template.md') continue;
      return true;
    }
  }
  return false;
}

/**
 * Build the Claude prompt asking for an ADR-need verdict. Kept terse — one
 * cheap call. Includes the significant paths and (optionally) a short
 * diffstat summary.
 *
 * @param {{ significant: string[], newApps: string[], addedWorkflows: string[] }} cls
 * @param {string} [diffstat]
 * @returns {string}
 */
export function buildLlmPrompt(cls, diffstat = '') {
  const lines = [];
  lines.push(
    'You are a software architecture reviewer. Decide whether the following pull request makes a change significant enough to warrant a new Architecture Decision Record (ADR).',
  );
  lines.push('');
  lines.push('Warrant an ADR when the PR introduces or changes: a public package API, a new application or service, database schema/topology, a new automation/CI surface, or a cross-cutting architectural pattern. Do NOT warrant an ADR for routine bug fixes, refactors, tests, docs, or dependency bumps.');
  lines.push('');
  lines.push('Architecturally-significant paths touched in this PR:');
  for (const p of cls.significant) lines.push(`- ${p}`);
  if (cls.newApps && cls.newApps.length) {
    lines.push('');
    lines.push(`New app directories: ${cls.newApps.join(', ')}`);
  }
  if (cls.addedWorkflows && cls.addedWorkflows.length) {
    lines.push('');
    lines.push(`New workflows: ${cls.addedWorkflows.join(', ')}`);
  }
  if (diffstat && diffstat.trim()) {
    lines.push('');
    lines.push('Diffstat:');
    lines.push(diffstat.trim().slice(0, 2000));
  }
  lines.push('');
  lines.push('Respond with ONLY a single-line JSON object, no prose, no code fence:');
  lines.push('{"adr_needed": true|false, "reason": "<=20 words"}');
  return lines.join('\n');
}

/**
 * Parse Claude's response text into a verdict. Defensive: tolerates code
 * fences, surrounding prose, and missing fields. Returns null when no
 * parseable verdict is found (caller fails-open).
 *
 * @param {string} text
 * @returns {{ adrNeeded: boolean, reason: string } | null}
 */
export function parseLlmVerdict(text) {
  if (typeof text !== 'string' || !text.trim()) return null;
  // Extract the first {...} JSON object, even inside a ```json fence.
  const match = text.match(/\{[\s\S]*?\}/);
  if (!match) return null;
  let obj;
  try {
    obj = JSON.parse(match[0]);
  } catch {
    return null;
  }
  if (obj === null || typeof obj !== 'object') return null;
  if (typeof obj.adr_needed !== 'boolean') return null;
  const reason = typeof obj.reason === 'string' ? obj.reason.slice(0, 200) : '';
  return { adrNeeded: obj.adr_needed, reason };
}

/**
 * Decide the high-level verdict from the path heuristic alone.
 *
 * Returns one of:
 *   { decision: 'pass', reason: 'no-significant-paths' }      — fast path, no LLM
 *   { decision: 'pass', reason: 'adr-present' }               — documented
 *   { decision: 'inconclusive', reason: 'significant-no-adr' } — needs LLM call
 *
 * @param {{ significantTouched: boolean }} cls
 * @param {boolean} hasAdr
 */
export function decideVerdict(cls, hasAdr) {
  if (!cls.significantTouched) {
    return { decision: 'pass', reason: 'no-significant-paths', callLlm: false };
  }
  if (hasAdr) {
    return { decision: 'pass', reason: 'adr-present', callLlm: false };
  }
  return { decision: 'inconclusive', reason: 'significant-no-adr', callLlm: true };
}

/**
 * Build the advisory PR comment body. Only called when we want to advise an
 * ADR (LLM said yes), or to surface a fail-open note. Stable marker so the
 * comment is edited in place on synchronize.
 *
 * @param {object} args
 * @param {'advise'|'failopen'} args.kind
 * @param {string[]} args.significant
 * @param {string} [args.reason]
 * @returns {string}
 */
export function buildComment({ kind, significant = [], reason = '' }) {
  const lines = [];
  lines.push(COMMENT_MARKER);
  if (kind === 'failopen') {
    lines.push('### Consider an ADR? (advisory — fail-open)');
    lines.push('');
    lines.push('This PR touches architecturally-significant paths and adds no ADR. The Claude fallback detector could not run (missing key or API error), so this check passed open without a verdict.');
    if (reason) {
      lines.push('');
      lines.push(`_Note: ${reason}_`);
    }
  } else {
    lines.push('### Consider adding an ADR');
    lines.push('');
    lines.push('This PR appears to make an architecturally-significant change but does not add an Architecture Decision Record. Consider documenting the decision under `docs/decisions/` (template: `docs/adr/0000-template.md`).');
    if (reason) {
      lines.push('');
      lines.push(`**Why:** ${reason}`);
    }
  }
  if (significant.length) {
    lines.push('');
    lines.push('**Significant paths touched:**');
    for (const p of significant.slice(0, 20)) lines.push(`- \`${p}\``);
  }
  lines.push('');
  lines.push('---');
  lines.push('_This is a **non-blocking** advisory check (Gap G11, shadow mode). It never prevents merge. False positive? Ignore it._');
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Audit log
// ---------------------------------------------------------------------------
function logAudit(entry) {
  console.log(`ADR_NEED_AUDIT: ${JSON.stringify({ ts: new Date().toISOString(), ...entry })}`);
}

// ---------------------------------------------------------------------------
// gh CLI wrappers — narrow.
// ---------------------------------------------------------------------------
function gh(args, opts = {}) {
  return execSync(`gh ${args}`, { encoding: 'utf-8', ...opts });
}

function fetchPrFilesWithStatus(repo, prNumber) {
  const n = String(parseInt(prNumber, 10));
  const json = gh(
    `api repos/${repo}/pulls/${n}/files --paginate -q '[.[] | {path:.filename, status, additions, deletions}]'`,
  ).trim();
  return JSON.parse(json || '[]');
}

function buildDiffstat(files) {
  return (files || [])
    .map((f) => `${f.path} (+${f.additions || 0}/-${f.deletions || 0}, ${f.status})`)
    .slice(0, 60)
    .join('\n');
}

function postOrUpdateComment(repo, prNumber, body, marker) {
  const n = String(parseInt(prNumber, 10));
  let existing = null;
  try {
    const out = gh(
      `api repos/${repo}/issues/${n}/comments --paginate --jq '[.[] | select(.body | startswith("${marker}")) | .id] | first // empty'`,
    ).trim();
    existing = out ? Number(out) : null;
  } catch {
    /* swallow */
  }
  if (existing) {
    execSync(`gh api --method PATCH repos/${repo}/issues/comments/${existing} --field "body=@-"`, {
      input: body,
      encoding: 'utf-8',
    });
    return { id: existing, action: 'updated' };
  }
  execSync(`gh pr comment ${n} --repo ${repo} --body-file -`, { input: body, encoding: 'utf-8' });
  return { id: null, action: 'created' };
}

/**
 * Make the ONE Anthropic call. Returns parsed verdict or null on any error
 * (caller fails-open). Never throws.
 */
async function callClaude(apiKey, prompt) {
  try {
    const res = await fetch(ANTHROPIC_URL, {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': ANTHROPIC_VERSION,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: ANTHROPIC_MODEL,
        max_tokens: 50,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      return { error: `anthropic ${res.status}: ${errText.slice(0, 120)}` };
    }
    const data = await res.json();
    const text = Array.isArray(data?.content)
      ? data.content.map((b) => (typeof b?.text === 'string' ? b.text : '')).join('')
      : '';
    const verdict = parseLlmVerdict(text);
    if (!verdict) return { error: 'unparseable LLM response' };
    return { verdict };
  } catch (err) {
    return { error: err && err.message ? err.message : String(err) };
  }
}

// ---------------------------------------------------------------------------
// Main — advisory, ALWAYS exits 0.
// ---------------------------------------------------------------------------
async function main() {
  const rawPrNumber = process.env.PR_NUMBER;
  const repo = process.env.REPO || 'Latimer-Woods-Tech/Factory';

  if (!rawPrNumber || !/^\d+$/.test(rawPrNumber)) {
    logAudit({ event: 'no-pr-number-skip' });
    console.log('No valid PR_NUMBER; ADR-need check is advisory — skipping (pass).');
    return;
  }
  const PR_NUMBER = rawPrNumber;

  if (isAutomationPaused()) {
    logAudit({ event: 'paused-skip', pr: PR_NUMBER });
    console.log('Automation paused; ADR-need check passes open.');
    return;
  }

  let files;
  try {
    files = fetchPrFilesWithStatus(repo, PR_NUMBER);
  } catch (err) {
    logAudit({ event: 'fetch-files-error', pr: PR_NUMBER, error: err.message });
    console.log('Could not fetch PR files; passing open.');
    return;
  }

  const cls = classifySignificantPaths(files);
  const hasAdr = prHasAdr(files);
  const verdict = decideVerdict(cls, hasAdr);
  logAudit({
    event: 'heuristic',
    pr: PR_NUMBER,
    significant: cls.significant.length,
    hasAdr,
    decision: verdict.decision,
    reason: verdict.reason,
  });

  if (verdict.decision === 'pass') {
    console.log(`ADR-need check: PASS (${verdict.reason}). No LLM call.`);
    return;
  }

  // INCONCLUSIVE → one Claude call.
  const apiKey = process.env.ANTHROPIC_API_KEY || process.env.LATIMER_ANTHROPIC_API;
  if (!apiKey) {
    logAudit({ event: 'no-key-failopen', pr: PR_NUMBER });
    const body = buildComment({ kind: 'failopen', significant: cls.significant, reason: 'Anthropic key unavailable' });
    await safePostComment(repo, PR_NUMBER, body);
    console.log('No Anthropic key; ADR-need check fails open (advisory note posted).');
    return;
  }

  const prompt = buildLlmPrompt(cls, buildDiffstat(files));
  const result = await callClaude(apiKey, prompt);

  if (result.error) {
    logAudit({ event: 'llm-failopen', pr: PR_NUMBER, error: result.error });
    const body = buildComment({ kind: 'failopen', significant: cls.significant, reason: result.error });
    await safePostComment(repo, PR_NUMBER, body);
    console.log(`LLM call failed (${result.error}); ADR-need check fails open.`);
    return;
  }

  logAudit({ event: 'llm-verdict', pr: PR_NUMBER, adrNeeded: result.verdict.adrNeeded });

  if (result.verdict.adrNeeded) {
    const body = buildComment({ kind: 'advise', significant: cls.significant, reason: result.verdict.reason });
    await safePostComment(repo, PR_NUMBER, body);
    console.log('ADR-need check: Claude advises an ADR (advisory comment posted).');
  } else {
    console.log('ADR-need check: Claude says no ADR needed. PASS.');
  }
}

async function safePostComment(repo, prNumber, body) {
  try {
    const { action } = postOrUpdateComment(repo, prNumber, body, COMMENT_MARKER);
    logAudit({ event: `comment-${action}`, pr: prNumber });
  } catch (err) {
    logAudit({ event: 'comment-error', pr: prNumber, error: err.message });
    console.error('Comment post failed (non-fatal):', err.message);
    // Out-of-band page on the one operational failure worth surfacing: the
    // advisory comment could not be posted. notify() self-guards on missing
    // Pushover secrets / paused automation and never throws.
    try {
      await notify({
        title: 'adr-need-check: comment post failed',
        message: `PR #${prNumber} in ${repo}: ${err.message}`,
        priority: -1,
      });
    } catch {
      /* paging is best-effort; never block the advisory check */
    }
  }
}

if (
  import.meta.url === `file://${process.argv[1]}` ||
  import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/'))
) {
  main().catch((err) => {
    // Advisory: even an unexpected crash must not block the PR.
    console.error('ADR-need check encountered an error; passing open:', err);
    process.exit(0);
  });
}
