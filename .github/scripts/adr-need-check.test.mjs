// =============================================================================
// adr-need-check.test.mjs — unit tests for Gap G11 ADR-need check.
//
// Run: node --test .github/scripts/adr-need-check.test.mjs
//
// Pure functions only — NO real network calls.
// =============================================================================

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  classifySignificantPaths,
  prHasAdr,
  buildLlmPrompt,
  parseLlmVerdict,
  decideVerdict,
  buildComment,
} from './adr-need-check.mjs';

// ---------------------------------------------------------------------------
// classifySignificantPaths
// ---------------------------------------------------------------------------
test('classifySignificantPaths — hits package index, wrangler, migration, CLAUDE.md, arch docs', () => {
  const files = [
    { path: 'packages/errors/src/index.ts', status: 'modified' },
    { path: 'apps/lead-gen/wrangler.jsonc', status: 'modified' },
    { path: 'migrations/0007_add_table.sql', status: 'added' },
    { path: 'apps/lead-gen/migrations/0001_init.sql', status: 'added' },
    { path: 'CLAUDE.md', status: 'modified' },
    { path: 'docs/architecture/FACTORY_V1.md', status: 'modified' },
  ];
  const cls = classifySignificantPaths(files);
  assert.equal(cls.significantTouched, true);
  assert.ok(cls.significant.includes('packages/errors/src/index.ts'));
  assert.ok(cls.significant.includes('apps/lead-gen/wrangler.jsonc'));
  assert.ok(cls.significant.includes('migrations/0007_add_table.sql'));
  assert.ok(cls.significant.includes('apps/lead-gen/migrations/0001_init.sql'));
  assert.ok(cls.significant.includes('CLAUDE.md'));
  assert.ok(cls.significant.includes('docs/architecture/FACTORY_V1.md'));
});

test('classifySignificantPaths — miss: routine source/test/docs changes are not significant', () => {
  const files = [
    { path: 'packages/errors/src/validation-error.ts', status: 'modified' },
    { path: 'packages/errors/src/index.test.ts', status: 'modified' },
    { path: 'apps/lead-gen/src/handler.ts', status: 'modified' },
    { path: 'README.md', status: 'modified' },
    { path: 'docs/STATE.md', status: 'modified' },
    { path: 'package.json', status: 'modified' },
  ];
  const cls = classifySignificantPaths(files);
  assert.equal(cls.significantTouched, false);
  assert.deepEqual(cls.significant, []);
});

test('classifySignificantPaths — new app (added wrangler.jsonc) flagged + recorded', () => {
  const files = [
    { path: 'apps/new-thing/wrangler.jsonc', status: 'added' },
    { path: 'apps/new-thing/package.json', status: 'added' },
    { path: 'apps/new-thing/src/index.ts', status: 'added' },
  ];
  const cls = classifySignificantPaths(files);
  assert.equal(cls.significantTouched, true);
  assert.ok(cls.newApps.includes('new-thing'));
});

test('classifySignificantPaths — newly added workflow flagged', () => {
  const files = [{ path: '.github/workflows/brand-new.yml', status: 'added' }];
  const cls = classifySignificantPaths(files);
  assert.equal(cls.significantTouched, true);
  assert.deepEqual(cls.addedWorkflows, ['.github/workflows/brand-new.yml']);
});

test('classifySignificantPaths — REGISTRY.md is not a workflow add', () => {
  const files = [{ path: '.github/workflows/REGISTRY.md', status: 'added' }];
  const cls = classifySignificantPaths(files);
  assert.deepEqual(cls.addedWorkflows, []);
});

test('classifySignificantPaths — deleted package index does not trip heuristic', () => {
  const files = [{ path: 'packages/old/src/index.ts', status: 'removed' }];
  const cls = classifySignificantPaths(files);
  assert.equal(cls.significantTouched, false);
});

test('classifySignificantPaths — empty/undefined input is safe', () => {
  assert.equal(classifySignificantPaths([]).significantTouched, false);
  assert.equal(classifySignificantPaths(undefined).significantTouched, false);
});

// ---------------------------------------------------------------------------
// prHasAdr
// ---------------------------------------------------------------------------
test('prHasAdr — detects added decision record', () => {
  const files = [
    { path: 'docs/decisions/2026-05-26-new-thing.md', status: 'added' },
    { path: 'packages/errors/src/index.ts', status: 'modified' },
  ];
  assert.equal(prHasAdr(files), true);
});

test('prHasAdr — detects docs/adr and bare adr dirs', () => {
  assert.equal(prHasAdr([{ path: 'docs/adr/0013-thing.md', status: 'added' }]), true);
  assert.equal(prHasAdr([{ path: 'adr/0001-thing.md', status: 'modified' }]), true);
});

test('prHasAdr — README / template do not count as an ADR', () => {
  assert.equal(prHasAdr([{ path: 'docs/decisions/README.md', status: 'modified' }]), false);
  assert.equal(prHasAdr([{ path: 'docs/adr/0000-template.md', status: 'modified' }]), false);
});

test('prHasAdr — deleted ADR does not count as documenting', () => {
  assert.equal(prHasAdr([{ path: 'docs/decisions/old.md', status: 'removed' }]), false);
});

test('prHasAdr — no ADR present', () => {
  assert.equal(prHasAdr([{ path: 'packages/errors/src/index.ts', status: 'modified' }]), false);
  assert.equal(prHasAdr([]), false);
});

// ---------------------------------------------------------------------------
// decideVerdict — the decision table
// ---------------------------------------------------------------------------
test('decideVerdict — significant + ADR present → pass, no LLM', () => {
  const v = decideVerdict({ significantTouched: true }, true);
  assert.equal(v.decision, 'pass');
  assert.equal(v.reason, 'adr-present');
  assert.equal(v.callLlm, false);
});

test('decideVerdict — no significant paths → pass, no LLM (fast path)', () => {
  const v = decideVerdict({ significantTouched: false }, false);
  assert.equal(v.decision, 'pass');
  assert.equal(v.reason, 'no-significant-paths');
  assert.equal(v.callLlm, false);
});

test('decideVerdict — significant + no ADR → inconclusive (needs LLM)', () => {
  const v = decideVerdict({ significantTouched: true }, false);
  assert.equal(v.decision, 'inconclusive');
  assert.equal(v.reason, 'significant-no-adr');
  assert.equal(v.callLlm, true);
});

// ---------------------------------------------------------------------------
// buildLlmPrompt
// ---------------------------------------------------------------------------
test('buildLlmPrompt — includes significant paths and a strict JSON instruction', () => {
  const prompt = buildLlmPrompt(
    { significant: ['packages/errors/src/index.ts'], newApps: ['x'], addedWorkflows: ['.github/workflows/y.yml'] },
    'packages/errors/src/index.ts (+10/-2, modified)',
  );
  assert.ok(prompt.includes('packages/errors/src/index.ts'));
  assert.ok(prompt.includes('New app directories: x'));
  assert.ok(prompt.includes('.github/workflows/y.yml'));
  assert.ok(prompt.includes('Diffstat:'));
  assert.ok(prompt.includes('"adr_needed"'));
});

test('buildLlmPrompt — omits diffstat block when empty', () => {
  const prompt = buildLlmPrompt({ significant: ['CLAUDE.md'], newApps: [], addedWorkflows: [] });
  assert.ok(!prompt.includes('Diffstat:'));
});

// ---------------------------------------------------------------------------
// parseLlmVerdict — valid + garbage (fail-open → null)
// ---------------------------------------------------------------------------
test('parseLlmVerdict — clean JSON', () => {
  const v = parseLlmVerdict('{"adr_needed": true, "reason": "new public API"}');
  assert.deepEqual(v, { adrNeeded: true, reason: 'new public API' });
});

test('parseLlmVerdict — false verdict', () => {
  const v = parseLlmVerdict('{"adr_needed": false, "reason": "routine refactor"}');
  assert.deepEqual(v, { adrNeeded: false, reason: 'routine refactor' });
});

test('parseLlmVerdict — JSON wrapped in code fence + prose', () => {
  const v = parseLlmVerdict('Here is my verdict:\n```json\n{"adr_needed": true, "reason": "schema change"}\n```');
  assert.equal(v.adrNeeded, true);
  assert.equal(v.reason, 'schema change');
});

test('parseLlmVerdict — garbage / non-JSON → null (fail-open)', () => {
  assert.equal(parseLlmVerdict('I think you probably need one, yes.'), null);
  assert.equal(parseLlmVerdict(''), null);
  assert.equal(parseLlmVerdict(null), null);
  assert.equal(parseLlmVerdict('{ not valid json }'), null);
});

test('parseLlmVerdict — missing/non-boolean adr_needed → null', () => {
  assert.equal(parseLlmVerdict('{"reason": "missing field"}'), null);
  assert.equal(parseLlmVerdict('{"adr_needed": "yes"}'), null);
});

// ---------------------------------------------------------------------------
// buildComment
// ---------------------------------------------------------------------------
test('buildComment — advise variant carries marker, reason, paths, non-blocking note', () => {
  const body = buildComment({
    kind: 'advise',
    significant: ['packages/errors/src/index.ts'],
    reason: 'new public API surface',
  });
  assert.ok(body.startsWith('<!-- adr-need-check -->'));
  assert.ok(body.includes('Consider adding an ADR'));
  assert.ok(body.includes('new public API surface'));
  assert.ok(body.includes('`packages/errors/src/index.ts`'));
  assert.ok(body.includes('non-blocking'));
});

test('buildComment — failopen variant explains the detector could not run', () => {
  const body = buildComment({ kind: 'failopen', significant: ['CLAUDE.md'], reason: 'Anthropic key unavailable' });
  assert.ok(body.startsWith('<!-- adr-need-check -->'));
  assert.ok(body.includes('fail-open'));
  assert.ok(body.includes('Anthropic key unavailable'));
  assert.ok(body.includes('non-blocking'));
});
