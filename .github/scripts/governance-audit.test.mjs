// =============================================================================
// governance-audit.test.mjs — unit tests for Phase 4 Defense #4.
//
// Run: node --test .github/scripts/governance-audit.test.mjs
// =============================================================================

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  parseAuditLines,
  aggregate,
  buildReport,
  computePeriod,
  isAutomationPaused,
  AUDIT_PREFIXES,
} from './governance-audit.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SOURCE_PATH = join(__dirname, 'governance-audit.mjs');

// ---------------------------------------------------------------------------
// parseAuditLines
// ---------------------------------------------------------------------------
test('parseAuditLines — empty input returns empty array', () => {
  assert.deepEqual(parseAuditLines(''), []);
  assert.deepEqual(parseAuditLines(null), []);
});

test('parseAuditLines — extracts one PUSHOVER_AUDIT line', () => {
  const log = `Some prelude line
PUSHOVER_AUDIT: {"ts":"2026-05-23T20:14:00Z","sent":true,"reason":null}
Some other line`;
  const result = parseAuditLines(log);
  assert.equal(result.length, 1);
  assert.equal(result[0].prefix, 'PUSHOVER_AUDIT');
  assert.equal(result[0].entry.sent, true);
});

test('parseAuditLines — extracts all four prefix types', () => {
  const log = `
PUSHOVER_AUDIT: {"sent":true}
WARDEN_AUDIT: {"event":"quarantined","workflow":"foo"}
COHERENCE_AUDIT: {"event":"check","ok":false}
FRIDGE_AUDIT: {"event":"outcome","action":"fail"}
`;
  const result = parseAuditLines(log);
  const prefixes = result.map((r) => r.prefix).sort();
  assert.deepEqual(prefixes, ['COHERENCE_AUDIT', 'FRIDGE_AUDIT', 'PUSHOVER_AUDIT', 'WARDEN_AUDIT']);
});

test('parseAuditLines — silently drops malformed JSON', () => {
  const log = `
PUSHOVER_AUDIT: {not valid json
PUSHOVER_AUDIT: {"sent":true}
`;
  const result = parseAuditLines(log);
  assert.equal(result.length, 1);
  assert.equal(result[0].entry.sent, true);
});

test('parseAuditLines — handles many lines efficiently', () => {
  const lines = [];
  for (let i = 0; i < 1000; i++) {
    lines.push(`PUSHOVER_AUDIT: {"sent":true,"i":${i}}`);
  }
  const log = lines.join('\n');
  const result = parseAuditLines(log);
  assert.equal(result.length, 1000);
});

test('parseAuditLines — non-audit lines are ignored', () => {
  const log = `
echo "not an audit"
NOT_AUDIT: {"sent":true}
PUSHOVER_AUDIT: {"sent":true}
`;
  const result = parseAuditLines(log);
  assert.equal(result.length, 1);
});

// ---------------------------------------------------------------------------
// aggregate
// ---------------------------------------------------------------------------
test('aggregate — empty input yields all-zero summary', () => {
  const s = aggregate([], { start: '2026-04-01', end: '2026-05-01' });
  assert.equal(s.pushover.sent, 0);
  assert.equal(s.warden.quarantined, 0);
  assert.equal(s.coherence.runs, 0);
  assert.equal(s.fridge.runs, 0);
});

test('aggregate — Pushover sent/no-op counted separately', () => {
  const parsed = [
    { prefix: 'PUSHOVER_AUDIT', entry: { sent: true } },
    { prefix: 'PUSHOVER_AUDIT', entry: { sent: false, reason: 'secrets-missing' } },
    { prefix: 'PUSHOVER_AUDIT', entry: { sent: false, reason: 'automation-paused' } },
  ];
  const s = aggregate(parsed);
  assert.equal(s.pushover.sent, 1);
  assert.equal(s.pushover.no_op, 2);
  assert.equal(s.pushover.by_reason['secrets-missing'], 1);
  assert.equal(s.pushover.by_reason['automation-paused'], 1);
});

test('aggregate — Warden quarantine events counted and grouped by workflow', () => {
  const parsed = [
    { prefix: 'WARDEN_AUDIT', entry: { event: 'quarantined', workflow: 'cost-observability' } },
    { prefix: 'WARDEN_AUDIT', entry: { event: 'quarantined', workflow: 'cost-observability' } },
    { prefix: 'WARDEN_AUDIT', entry: { event: 'quarantined', workflow: 'flaky-check-report' } },
    { prefix: 'WARDEN_AUDIT', entry: { event: 'evaluated-healthy', workflow: 'ci' } },
  ];
  const s = aggregate(parsed);
  assert.equal(s.warden.quarantined, 3);
  assert.equal(s.warden.evaluated, 1);
  assert.equal(s.warden.by_workflow['cost-observability'], 2);
  assert.equal(s.warden.by_workflow['flaky-check-report'], 1);
});

test('aggregate — Coherence drift events counted', () => {
  const parsed = [
    { prefix: 'COHERENCE_AUDIT', entry: { event: 'run-complete', status: 'all-pass' } },
    { prefix: 'COHERENCE_AUDIT', entry: { event: 'run-complete', status: 'drift-detected' } },
    { prefix: 'COHERENCE_AUDIT', entry: { event: 'check', ok: false, id: 'I1-registry-forward' } },
    { prefix: 'COHERENCE_AUDIT', entry: { event: 'check', ok: false, id: 'I1-registry-forward' } },
    { prefix: 'COHERENCE_AUDIT', entry: { event: 'check', ok: true, id: 'I2-registry-reverse' } },
  ];
  const s = aggregate(parsed);
  assert.equal(s.coherence.runs, 2);
  assert.equal(s.coherence.drift_runs, 1);
  assert.equal(s.coherence.by_check_id['I1-registry-forward'], 2);
  assert.equal(s.coherence.by_check_id['I2-registry-reverse'] || 0, 0);  // only ok=false counted
});

test('aggregate — FRIDGE outcomes counted (silent → pass)', () => {
  const parsed = [
    { prefix: 'FRIDGE_AUDIT', entry: { event: 'outcome', action: 'silent' } },
    { prefix: 'FRIDGE_AUDIT', entry: { event: 'outcome', action: 'silent' } },
    { prefix: 'FRIDGE_AUDIT', entry: { event: 'outcome', action: 'fail' } },
    { prefix: 'FRIDGE_AUDIT', entry: { event: 'outcome', action: 'advisory' } },
  ];
  const s = aggregate(parsed);
  assert.equal(s.fridge.runs, 4);
  assert.equal(s.fridge.pass, 2);
  assert.equal(s.fridge.fail, 1);
  assert.equal(s.fridge.uncertain, 1);
});

// ---------------------------------------------------------------------------
// computePeriod
// ---------------------------------------------------------------------------
test('computePeriod — covers the previous calendar month', () => {
  // 2026-06-01 → period should be April 2026 (start) … May 2026 (end exclusive)
  // i.e., "May" is the period being reported on June 1
  const p = computePeriod('2026-06-01T13:00:00Z');
  assert.equal(p.start, '2026-05-01');
  assert.equal(p.end, '2026-06-01');
  assert.equal(p.label, '2026-05');
});

test('computePeriod — January wraps year correctly', () => {
  const p = computePeriod('2026-01-15T13:00:00Z');
  assert.equal(p.start, '2025-12-01');
  assert.equal(p.end, '2026-01-01');
  assert.equal(p.label, '2025-12');
});

// ---------------------------------------------------------------------------
// buildReport
// ---------------------------------------------------------------------------
test('buildReport — includes the period label in heading', () => {
  const summary = aggregate([]);
  const body = buildReport({
    summary,
    period: { start: '2026-04-01', end: '2026-05-01', label: '2026-04' },
    totalAuditLines: 0,
    totalRunsProcessed: 0,
  });
  assert.ok(body.includes('Factory Governance Audit — 2026-04'));
});

test('buildReport — surfaces quarantine action items when count > 0', () => {
  const parsed = [
    { prefix: 'WARDEN_AUDIT', entry: { event: 'quarantined', workflow: 'foo' } },
  ];
  const summary = aggregate(parsed);
  const body = buildReport({
    summary,
    period: { start: '2026-04-01', end: '2026-05-01', label: '2026-04' },
    totalAuditLines: 1,
    totalRunsProcessed: 1,
  });
  assert.ok(body.includes('quarantined workflow(s) — root-cause + re-enable'));
});

test('buildReport — clean month surfaces no FRIDGE action item', () => {
  const summary = aggregate([
    { prefix: 'FRIDGE_AUDIT', entry: { event: 'outcome', action: 'silent' } },
    { prefix: 'FRIDGE_AUDIT', entry: { event: 'outcome', action: 'silent' } },
  ]);
  const body = buildReport({
    summary,
    period: { start: '2026-04-01', end: '2026-05-01', label: '2026-04' },
    totalAuditLines: 2,
    totalRunsProcessed: 2,
  });
  assert.ok(!body.includes('FRIDGE fail event(s) — open PRs'));
});

// ---------------------------------------------------------------------------
// Kill switch
// ---------------------------------------------------------------------------
test('isAutomationPaused — production default path absent', () => {
  assert.equal(isAutomationPaused(), false);
});

// ---------------------------------------------------------------------------
// BLAST RADIUS source scan
// ---------------------------------------------------------------------------
function stripComments(src) {
  return src.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
}

test('blast-radius — source contains NO `gh pr merge`', () => {
  const code = stripComments(readFileSync(SOURCE_PATH, 'utf-8'));
  assert.ok(!code.includes('gh pr merge'));
});

test('blast-radius — source contains NO `gh pr review`', () => {
  const code = stripComments(readFileSync(SOURCE_PATH, 'utf-8'));
  assert.ok(!code.includes('gh pr review'));
});

test('blast-radius — source contains NO `gh workflow disable`', () => {
  const code = stripComments(readFileSync(SOURCE_PATH, 'utf-8'));
  assert.ok(!code.includes('gh workflow disable'));
});

test('blast-radius — source contains NO `gh workflow enable`', () => {
  const code = stripComments(readFileSync(SOURCE_PATH, 'utf-8'));
  assert.ok(!code.includes('gh workflow enable'));
});

test('blast-radius — source contains NO `gh ruleset`', () => {
  const code = stripComments(readFileSync(SOURCE_PATH, 'utf-8'));
  assert.ok(!code.includes('gh ruleset'));
});

test('blast-radius — source contains NO `git push`', () => {
  const code = stripComments(readFileSync(SOURCE_PATH, 'utf-8'));
  assert.ok(!code.includes('git push'));
});

test('blast-radius — source contains NO file deletion calls', () => {
  const code = stripComments(readFileSync(SOURCE_PATH, 'utf-8'));
  assert.ok(!code.includes('unlinkSync'));
  assert.ok(!code.includes('rmSync'));
});

test('blast-radius — source contains NO `-X PUT` / `-X DELETE`', () => {
  const code = stripComments(readFileSync(SOURCE_PATH, 'utf-8'));
  assert.ok(!code.includes('-X PUT'));
  assert.ok(!code.includes('-X DELETE'));
});

// ---------------------------------------------------------------------------
// AUDIT_PREFIXES list is stable — exposed so other tools can re-use it
// ---------------------------------------------------------------------------
test('AUDIT_PREFIXES — contains all four expected prefixes', () => {
  assert.deepEqual(AUDIT_PREFIXES.sort(), [
    'COHERENCE_AUDIT:',
    'FRIDGE_AUDIT:',
    'PUSHOVER_AUDIT:',
    'WARDEN_AUDIT:',
  ]);
});
