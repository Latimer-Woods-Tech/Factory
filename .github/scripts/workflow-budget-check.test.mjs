// =============================================================================
// workflow-budget-check.test.mjs — unit tests for Phase 4A.
//
// Run: node --test .github/scripts/workflow-budget-check.test.mjs
// =============================================================================

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  classifyDiffFiles,
  parseBudgetAcks,
  evaluateBudget,
  buildExplanation,
  isAutomationPaused,
} from './workflow-budget-check.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SOURCE_PATH = join(__dirname, 'workflow-budget-check.mjs');

// ---------------------------------------------------------------------------
// classifyDiffFiles
// ---------------------------------------------------------------------------
test('classifyDiffFiles — categorizes added/removed/modified workflows', () => {
  const files = [
    { path: '.github/workflows/new-thing.yml', status: 'added' },
    { path: '.github/workflows/old-thing.yml', status: 'removed' },
    { path: '.github/workflows/existing.yml', status: 'modified' },
    { path: 'docs/decisions/foo.md', status: 'added' },  // not a workflow
    { path: 'apps/admin/src/foo.ts', status: 'added' },  // not a workflow
  ];
  const c = classifyDiffFiles(files);
  assert.deepEqual(c.addedWorkflows, ['.github/workflows/new-thing.yml']);
  assert.deepEqual(c.removedWorkflows, ['.github/workflows/old-thing.yml']);
  assert.deepEqual(c.modifiedWorkflows, ['.github/workflows/existing.yml']);
});

test('classifyDiffFiles — REGISTRY.md is excluded (not a workflow)', () => {
  const files = [
    { path: '.github/workflows/REGISTRY.md', status: 'added' },
    { path: '.github/workflows/real-workflow.yml', status: 'added' },
  ];
  const c = classifyDiffFiles(files);
  assert.equal(c.addedWorkflows.length, 1);
  assert.equal(c.addedWorkflows[0], '.github/workflows/real-workflow.yml');
});

test('classifyDiffFiles — reusable workflows (_*.yml) ARE counted', () => {
  // Adding a new reusable still requires budget discipline
  const files = [
    { path: '.github/workflows/_app-deploy-fly.yml', status: 'added' },
  ];
  const c = classifyDiffFiles(files);
  assert.equal(c.addedWorkflows.length, 1);
});

test('classifyDiffFiles — empty input returns empty arrays', () => {
  const c = classifyDiffFiles([]);
  assert.deepEqual(c.addedWorkflows, []);
  assert.deepEqual(c.removedWorkflows, []);
  assert.deepEqual(c.modifiedWorkflows, []);
});

// ---------------------------------------------------------------------------
// parseBudgetAcks
// ---------------------------------------------------------------------------
test('parseBudgetAcks — parses single retires: line', () => {
  const r = parseBudgetAcks('Some prelude\nretires: old.yml\nMore text');
  assert.deepEqual(r.retires, ['old.yml']);
});

test('parseBudgetAcks — parses comma-separated retires', () => {
  const r = parseBudgetAcks('retires: foo.yml, bar.yml');
  assert.deepEqual(r.retires, ['foo.yml', 'bar.yml']);
});

test('parseBudgetAcks — parses multiple retires: lines', () => {
  const r = parseBudgetAcks(`
retires: foo.yml
Some explanation
retires: bar.yml, baz.yml
`);
  assert.deepEqual(r.retires.sort(), ['bar.yml', 'baz.yml', 'foo.yml']);
});

test('parseBudgetAcks — parses budget-exception: line', () => {
  const r = parseBudgetAcks('budget-exception: net-new capability per Q3 plan');
  assert.deepEqual(r.exceptions, ['net-new capability per Q3 plan']);
});

test('parseBudgetAcks — budget-exception requires substantive reason (>= 5 chars)', () => {
  const r = parseBudgetAcks('budget-exception: ok');
  assert.deepEqual(r.exceptions, []);  // "ok" is too short
});

test('parseBudgetAcks — keyword matching is case-insensitive', () => {
  const r = parseBudgetAcks('Retires: foo.yml\nBUDGET-EXCEPTION: testing case');
  assert.deepEqual(r.retires, ['foo.yml']);
  assert.deepEqual(r.exceptions, ['testing case']);
});

test('parseBudgetAcks — empty/null input returns empty arrays', () => {
  assert.deepEqual(parseBudgetAcks('').retires, []);
  assert.deepEqual(parseBudgetAcks(null).retires, []);
  assert.deepEqual(parseBudgetAcks(undefined).exceptions, []);
});

// ---------------------------------------------------------------------------
// evaluateBudget
// ---------------------------------------------------------------------------
test('evaluateBudget — no workflows added → pass trivially', () => {
  const r = evaluateBudget({ added: [], removed: ['foo.yml'], acks: { retires: [], exceptions: [] } });
  assert.equal(r.ok, true);
  assert.equal(r.reason, 'no-new-workflows');
});

test('evaluateBudget — added with matching retires → pass', () => {
  const r = evaluateBudget({
    added: ['.github/workflows/new.yml'],
    removed: ['.github/workflows/old.yml'],
    acks: { retires: ['old.yml'], exceptions: [] },
  });
  assert.equal(r.ok, true);
  assert.equal(r.reason, 'retires-balanced');
});

test('evaluateBudget — added without retires or exception → fail', () => {
  const r = evaluateBudget({
    added: ['.github/workflows/sprawl.yml'],
    removed: [],
    acks: { retires: [], exceptions: [] },
  });
  assert.equal(r.ok, false);
  assert.ok(r.violations.includes('.github/workflows/sprawl.yml'));
});

test('evaluateBudget — added with retires: that does NOT match a removed file → fail', () => {
  const r = evaluateBudget({
    added: ['.github/workflows/new.yml'],
    removed: [],  // nothing actually removed
    acks: { retires: ['ghost.yml'], exceptions: [] },
  });
  assert.equal(r.ok, false);  // retires must match a real removal
});

test('evaluateBudget — added with budget-exception → pass with exception reason', () => {
  const r = evaluateBudget({
    added: ['.github/workflows/new.yml'],
    removed: [],
    acks: { retires: [], exceptions: ['net-new capability per quarterly plan'] },
  });
  assert.equal(r.ok, true);
  assert.ok(r.reason.startsWith('budget-exception:'));
});

test('evaluateBudget — exception covers MULTIPLE added workflows in one PR', () => {
  // Deliberate: a PR with an exception is operator taking responsibility
  // for the entire body; we don't require per-file exceptions.
  const r = evaluateBudget({
    added: [
      '.github/workflows/new1.yml',
      '.github/workflows/new2.yml',
    ],
    removed: [],
    acks: { retires: [], exceptions: ['both workflows are part of new capability X'] },
  });
  assert.equal(r.ok, true);
});

test('evaluateBudget — basenames matched (path prefix in retires: tolerated)', () => {
  const r = evaluateBudget({
    added: ['.github/workflows/new.yml'],
    removed: ['.github/workflows/old.yml'],
    acks: { retires: ['.github/workflows/old.yml'], exceptions: [] },  // full path
  });
  assert.equal(r.ok, true);
});

// ---------------------------------------------------------------------------
// buildExplanation
// ---------------------------------------------------------------------------
test('buildExplanation — pass body starts with marker', () => {
  const body = buildExplanation({
    added: [],
    removed: [],
    acks: { retires: [], exceptions: [] },
    verdict: { ok: true, reason: 'no-new-workflows' },
  });
  assert.ok(body.startsWith('<!-- workflow-budget-check -->'));
  assert.ok(body.includes('PASS'));
});

test('buildExplanation — fail body includes both unblock options', () => {
  const body = buildExplanation({
    added: ['.github/workflows/sprawl.yml'],
    removed: [],
    acks: { retires: [], exceptions: [] },
    verdict: { ok: false, violations: ['.github/workflows/sprawl.yml'] },
  });
  assert.ok(body.includes('FAIL'));
  assert.ok(body.includes('retires:'));
  assert.ok(body.includes('budget-exception:'));
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

test('blast-radius — source contains NO gh pr merge', () => {
  const code = stripComments(readFileSync(SOURCE_PATH, 'utf-8'));
  assert.ok(!code.includes('gh pr merge'));
});

test('blast-radius — source contains NO gh pr review', () => {
  const code = stripComments(readFileSync(SOURCE_PATH, 'utf-8'));
  assert.ok(!code.includes('gh pr review'));
});

test('blast-radius — source contains NO gh workflow disable', () => {
  const code = stripComments(readFileSync(SOURCE_PATH, 'utf-8'));
  assert.ok(!code.includes('gh workflow disable'));
});

test('blast-radius — source contains NO gh workflow enable', () => {
  const code = stripComments(readFileSync(SOURCE_PATH, 'utf-8'));
  assert.ok(!code.includes('gh workflow enable'));
});

test('blast-radius — source contains NO git push', () => {
  const code = stripComments(readFileSync(SOURCE_PATH, 'utf-8'));
  assert.ok(!code.includes('git push'));
});

test('blast-radius — source contains NO file deletion calls', () => {
  const code = stripComments(readFileSync(SOURCE_PATH, 'utf-8'));
  assert.ok(!code.includes('unlinkSync'));
  assert.ok(!code.includes('rmSync'));
});

test('blast-radius — source contains NO -X DELETE / -X PUT', () => {
  const code = stripComments(readFileSync(SOURCE_PATH, 'utf-8'));
  assert.ok(!code.includes('-X DELETE'));
  assert.ok(!code.includes('-X PUT'));
});
