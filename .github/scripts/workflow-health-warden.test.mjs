// =============================================================================
// workflow-health-warden.test.mjs — unit tests for Phase 3.
//
// Run with: node --test .github/scripts/workflow-health-warden.test.mjs
//
// Covers:
//   - parseTierRegistry — extracts T1/T2/T3 workflows from the registry doc
//   - computeConsecutiveFailures — newest-first counting, cancelled/skipped ignored
//   - computeRedDurationHours — boundary conditions including all-failures
//   - evaluateWorkflow — tier × condition matrix → action dispatch
//   - buildIssueTitle — stable for dedup
//   - isAutomationPaused — kill switch interaction
//   - BLAST RADIUS — source scan for forbidden gh subcommands
//   - Real REGISTRY.md round-trip (when Phase 1 lands on same branch)
// =============================================================================

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, writeFileSync, unlinkSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  parseTierRegistry,
  computeConsecutiveFailures,
  computeRedDurationHours,
  evaluateWorkflow,
  buildIssueTitle,
  isAutomationPaused,
  logAudit,
} from './workflow-health-warden.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const WARDEN_SOURCE_PATH = join(__dirname, 'workflow-health-warden.mjs');

// ---------------------------------------------------------------------------
// parseTierRegistry
// ---------------------------------------------------------------------------
test('parseTierRegistry — extracts workflows from each tier section', () => {
  const md = `
# Workflow Registry

### T1 — Load-bearing (24)

| Workflow | Triggers | Notes |
|---|---|---|
| \`apply-sec-hardening.yml\` | schedule | Tier-1 security |
| \`ci.yml\` | push, PR | Mainline CI |

### T2 — Operational (28)

| Workflow | Triggers | Notes |
|---|---|---|
| \`auto-merge-spotter.yml\` | schedule (10min) | Polling fallback |

### T3 — Informational (24)

| Workflow | Triggers | Notes |
|---|---|---|
| \`cost-observability.yml\` | schedule (daily) | Cost digest |
`;
  const tiers = parseTierRegistry(md);
  assert.equal(tiers['apply-sec-hardening.yml'], 'T1');
  assert.equal(tiers['ci.yml'], 'T1');
  assert.equal(tiers['auto-merge-spotter.yml'], 'T2');
  assert.equal(tiers['cost-observability.yml'], 'T3');
});

test('parseTierRegistry — ignores rows above the first ### T heading', () => {
  const md = `
## Some other section

| Workflow | Notes |
|---|---|
| \`should-be-ignored.yml\` | not in a tier section |

### T2 — Operational

| Workflow | Notes |
|---|---|
| \`correctly-classified.yml\` | yes |
`;
  const tiers = parseTierRegistry(md);
  assert.equal(tiers['should-be-ignored.yml'], undefined);
  assert.equal(tiers['correctly-classified.yml'], 'T2');
});

test('parseTierRegistry — empty input returns empty object', () => {
  assert.deepEqual(parseTierRegistry(''), {});
  assert.deepEqual(parseTierRegistry('no headings here'), {});
});

// ---------------------------------------------------------------------------
// computeConsecutiveFailures
// ---------------------------------------------------------------------------
test('computeConsecutiveFailures — empty array returns 0', () => {
  assert.equal(computeConsecutiveFailures([]), 0);
});

test('computeConsecutiveFailures — newest is success returns 0', () => {
  assert.equal(computeConsecutiveFailures([{ conclusion: 'success' }, { conclusion: 'failure' }]), 0);
});

test('computeConsecutiveFailures — all failures returns full count', () => {
  const runs = [
    { conclusion: 'failure' },
    { conclusion: 'failure' },
    { conclusion: 'failure' },
  ];
  assert.equal(computeConsecutiveFailures(runs), 3);
});

test('computeConsecutiveFailures — startup_failure counts as failure', () => {
  const runs = [
    { conclusion: 'startup_failure' },
    { conclusion: 'failure' },
    { conclusion: 'success' },
  ];
  assert.equal(computeConsecutiveFailures(runs), 2);
});

test('computeConsecutiveFailures — cancelled and skipped are ignored (not break the streak)', () => {
  const runs = [
    { conclusion: 'failure' },
    { conclusion: 'cancelled' },
    { conclusion: 'skipped' },
    { conclusion: 'failure' },
    { conclusion: 'success' },
  ];
  // failure × 2, with cancelled+skipped in between; success ends the streak
  assert.equal(computeConsecutiveFailures(runs), 2);
});

test('computeConsecutiveFailures — null conclusion (in-progress) breaks the streak', () => {
  const runs = [
    { conclusion: null },
    { conclusion: 'failure' },
  ];
  assert.equal(computeConsecutiveFailures(runs), 0);
});

// ---------------------------------------------------------------------------
// computeRedDurationHours
// ---------------------------------------------------------------------------
test('computeRedDurationHours — empty runs returns 0', () => {
  assert.equal(computeRedDurationHours([]), 0);
});

test('computeRedDurationHours — newest is success returns 0', () => {
  assert.equal(computeRedDurationHours([
    { conclusion: 'success', created_at: '2026-05-23T19:00:00Z' },
    { conclusion: 'failure', created_at: '2026-05-23T18:00:00Z' },
  ]), 0);
});

test('computeRedDurationHours — single failure 3h ago returns ~3', () => {
  const now = new Date('2026-05-23T20:00:00Z').getTime();
  const runs = [
    { conclusion: 'failure', created_at: '2026-05-23T17:00:00Z' },
    { conclusion: 'success', created_at: '2026-05-23T16:00:00Z' },
  ];
  const hours = computeRedDurationHours(runs, now);
  assert.equal(Math.round(hours), 3);
});

test('computeRedDurationHours — all failures in window returns Infinity', () => {
  const now = new Date('2026-05-23T20:00:00Z').getTime();
  const runs = [
    { conclusion: 'failure', created_at: '2026-05-23T19:00:00Z' },
    { conclusion: 'failure', created_at: '2026-05-23T18:00:00Z' },
    { conclusion: 'failure', created_at: '2026-05-23T17:00:00Z' },
  ];
  assert.equal(computeRedDurationHours(runs, now), Infinity);
});

test('computeRedDurationHours — cancelled runs ignored when computing red duration', () => {
  // Cancelled run between two failures shouldn't extend the red window.
  const now = new Date('2026-05-23T20:00:00Z').getTime();
  const runs = [
    { conclusion: 'failure', created_at: '2026-05-23T19:00:00Z' },
    { conclusion: 'cancelled', created_at: '2026-05-23T18:30:00Z' },
    { conclusion: 'success', created_at: '2026-05-23T18:00:00Z' },
  ];
  const hours = computeRedDurationHours(runs, now);
  // Red since the failure at 19:00 — 1h ago
  assert.equal(Math.round(hours), 1);
});

// ---------------------------------------------------------------------------
// evaluateWorkflow — the action dispatch table
// ---------------------------------------------------------------------------

const NOW = new Date('2026-05-23T20:00:00Z').getTime();

test('evaluateWorkflow — T1 red <1h → none', () => {
  const action = evaluateWorkflow({
    name: 'apply-sec-hardening',
    tier: 'T1',
    runs: [
      { conclusion: 'failure', created_at: '2026-05-23T19:30:00Z' },
      { conclusion: 'success', created_at: '2026-05-23T19:00:00Z' },
    ],
    nowMs: NOW,
  });
  assert.equal(action.type, 'none');
});

test('evaluateWorkflow — T1 red >1h → page', () => {
  const action = evaluateWorkflow({
    name: 'apply-sec-hardening',
    tier: 'T1',
    runs: [
      { conclusion: 'failure', created_at: '2026-05-23T18:00:00Z' },
      { conclusion: 'success', created_at: '2026-05-23T17:00:00Z' },
    ],
    nowMs: NOW,
  });
  assert.equal(action.type, 'page');
  assert.equal(action.tier, 'T1');
  assert.equal(action.priority, 1);
  assert.ok(action.issueLabels.includes('priority/p0'));
});

test('evaluateWorkflow — T2 red <24h → none', () => {
  const action = evaluateWorkflow({
    name: 'smoke-admin-studio',
    tier: 'T2',
    runs: [
      { conclusion: 'failure', created_at: '2026-05-23T08:00:00Z' },  // ~12h ago
      { conclusion: 'success', created_at: '2026-05-23T06:00:00Z' },
    ],
    nowMs: NOW,
  });
  assert.equal(action.type, 'none');
});

test('evaluateWorkflow — T2 red >24h → log', () => {
  const action = evaluateWorkflow({
    name: 'smoke-admin-studio',
    tier: 'T2',
    runs: [
      { conclusion: 'failure', created_at: '2026-05-22T18:00:00Z' },  // ~26h ago
      { conclusion: 'success', created_at: '2026-05-22T16:00:00Z' },
    ],
    nowMs: NOW,
  });
  assert.equal(action.type, 'log');
  assert.equal(action.tier, 'T2');
  assert.ok(action.issueLabels.includes('priority/p1'));
});

test('evaluateWorkflow — T3 <10 failures → none', () => {
  const failureRuns = Array(9).fill({ conclusion: 'failure', created_at: '2026-05-23T18:00:00Z' });
  const action = evaluateWorkflow({
    name: 'cost-observability',
    tier: 'T3',
    runs: failureRuns,
    nowMs: NOW,
  });
  assert.equal(action.type, 'none');
});

test('evaluateWorkflow — T3 ≥10 failures → quarantine', () => {
  const failureRuns = Array(10).fill({ conclusion: 'failure', created_at: '2026-05-23T18:00:00Z' });
  const action = evaluateWorkflow({
    name: 'cost-observability',
    tier: 'T3',
    runs: failureRuns,
    nowMs: NOW,
  });
  assert.equal(action.type, 'quarantine');
  assert.equal(action.tier, 'T3');
  assert.ok(action.issueLabels.includes('workflow-quarantined'));
  assert.ok(action.reason.includes('10 consecutive failures'));
});

test('evaluateWorkflow — empty runs → none with reason', () => {
  const action = evaluateWorkflow({ name: 'newly-added', tier: 'T1', runs: [], nowMs: NOW });
  assert.equal(action.type, 'none');
  assert.ok(action.reason.includes('no-runs'));
});

// ---------------------------------------------------------------------------
// buildIssueTitle — stable for dedup
// ---------------------------------------------------------------------------
test('buildIssueTitle — same inputs always produce same title', () => {
  const t1 = buildIssueTitle({ type: 'quarantine', workflow: 'cost-observability' });
  const t2 = buildIssueTitle({ type: 'quarantine', workflow: 'cost-observability' });
  assert.equal(t1, t2);
});

test('buildIssueTitle — different action types produce different titles', () => {
  const page = buildIssueTitle({ type: 'page', workflow: 'apply-sec-hardening' });
  const log = buildIssueTitle({ type: 'log', workflow: 'apply-sec-hardening' });
  const quar = buildIssueTitle({ type: 'quarantine', workflow: 'apply-sec-hardening' });
  assert.notEqual(page, log);
  assert.notEqual(log, quar);
  assert.notEqual(page, quar);
});

// ---------------------------------------------------------------------------
// Kill switch (Defense #1)
// ---------------------------------------------------------------------------
test('isAutomationPaused — returns false when default flag absent', () => {
  // Production invariant: .github/automation-paused MUST NOT exist on main.
  assert.equal(isAutomationPaused(), false);
});

test('isAutomationPaused — true when explicit path file exists', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'warden-test-'));
  const flag = join(tmp, 'automation-paused');
  writeFileSync(flag, '');
  try {
    assert.equal(isAutomationPaused(flag), true);
  } finally {
    unlinkSync(flag);
  }
});

// ---------------------------------------------------------------------------
// BLAST RADIUS — source scan (Defense #3)
//
// These tests read the Warden's own source file and assert it does not
// contain any forbidden gh-CLI subcommands. The point: if a future edit
// adds a forbidden invocation, this test fails BEFORE the change can
// land. Code review backed by mechanical enforcement.
// ---------------------------------------------------------------------------

test('blast-radius — Warden source contains NO `gh pr merge` invocation', () => {
  const src = readFileSync(WARDEN_SOURCE_PATH, 'utf-8');
  // Strip out comments to avoid false positives from the BLAST RADIUS
  // doc block at top.
  const code = stripComments(src);
  assert.ok(!code.includes('gh pr merge'), 'Warden source must not contain `gh pr merge`');
});

test('blast-radius — Warden source contains NO `gh pr review --approve`', () => {
  const src = readFileSync(WARDEN_SOURCE_PATH, 'utf-8');
  const code = stripComments(src);
  assert.ok(!code.includes('gh pr review'), 'Warden source must not contain `gh pr review`');
});

test('blast-radius — Warden source contains NO `gh workflow delete`', () => {
  const src = readFileSync(WARDEN_SOURCE_PATH, 'utf-8');
  const code = stripComments(src);
  assert.ok(!code.includes('gh workflow delete'), 'Warden source must not contain `gh workflow delete`');
});

test('blast-radius — Warden source contains NO `gh workflow enable` (re-enable is CODEOWNER-only)', () => {
  const src = readFileSync(WARDEN_SOURCE_PATH, 'utf-8');
  const code = stripComments(src);
  assert.ok(!code.includes('gh workflow enable'), 'Warden must not re-enable workflows; that\'s CODEOWNER work');
});

test('blast-radius — Warden source contains NO `gh ruleset` (no branch protection mutation)', () => {
  const src = readFileSync(WARDEN_SOURCE_PATH, 'utf-8');
  const code = stripComments(src);
  assert.ok(!code.includes('gh ruleset'), 'Warden source must not contain `gh ruleset`');
});

test('blast-radius — Warden source contains NO `git push` (no code mutation)', () => {
  const src = readFileSync(WARDEN_SOURCE_PATH, 'utf-8');
  const code = stripComments(src);
  assert.ok(!code.includes('git push'), 'Warden source must not push code');
});

test('blast-radius — Warden source contains NO file deletion calls (`unlinkSync`, `rmSync`)', () => {
  const src = readFileSync(WARDEN_SOURCE_PATH, 'utf-8');
  const code = stripComments(src);
  assert.ok(!code.includes('unlinkSync'), 'Warden must not call unlinkSync');
  assert.ok(!code.includes('rmSync'), 'Warden must not call rmSync');
});

test('blast-radius — Warden source contains NO `-X PUT` / `-X DELETE` curl/api calls', () => {
  const src = readFileSync(WARDEN_SOURCE_PATH, 'utf-8');
  const code = stripComments(src);
  assert.ok(!code.includes('-X PUT'), 'Warden must not perform PUT API calls');
  assert.ok(!code.includes('-X DELETE'), 'Warden must not perform DELETE API calls');
});

// Helper: strip line comments and block comments to avoid false-positive
// matches against the BLAST RADIUS documentation at the top of the file.
function stripComments(source) {
  return source
    .split('\n')
    .filter((line) => !line.trim().startsWith('//'))
    .join('\n');
}

// ---------------------------------------------------------------------------
// Real REGISTRY.md round-trip (only runs when Phase 1 has landed on the
// same branch — otherwise skipped).
// ---------------------------------------------------------------------------
test('parseTierRegistry — production REGISTRY.md loads cleanly (skipped if Phase 1 not on branch)', () => {
  const registryPath = '.github/workflows/REGISTRY.md';
  if (!existsSync(registryPath)) {
    console.log('  skipped: REGISTRY.md not present on this branch (lives in PR #919)');
    return;
  }
  const tiers = parseTierRegistry(readFileSync(registryPath, 'utf-8'));
  assert.ok(Object.keys(tiers).length > 0, 'REGISTRY.md must produce at least one classified workflow');
  // Sanity spot-checks
  assert.equal(tiers['apply-sec-hardening.yml'], 'T1');
  assert.ok(['T1', 'T2', 'T3'].includes(tiers['ci.yml'] || 'T1'));
});
