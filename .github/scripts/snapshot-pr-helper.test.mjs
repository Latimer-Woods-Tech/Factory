// =============================================================================
// snapshot-pr-helper.test.mjs — unit tests for the pure logic functions.
//
// Run with: node --test .github/scripts/snapshot-pr-helper.test.mjs
//
// CI-runnable: .github/workflows/scripts-tests.yml will pick this up via the
// glob `.github/scripts/*.test.mjs`. Local-runnable with the same command.
//
// Covers:
//   - parseAllowlist YAML edge cases (comments, blank lines, quotes)
//   - globToRegex semantics (single-segment vs **; anchored matching)
//   - pathMatches against realistic allowlist
//   - evaluatePr three-gate AND logic + violation reporting
//   - isAutomationPaused kill switch (presence-only)
// =============================================================================

import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, unlinkSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  parseAllowlist,
  globToRegex,
  pathMatches,
  evaluatePr,
  isAutomationPaused,
} from './snapshot-pr-helper.mjs';

// ---------------------------------------------------------------------------
// parseAllowlist
// ---------------------------------------------------------------------------
test('parseAllowlist — handles comments, blank lines, and basic lists', () => {
  const yaml = `
# top-level comment
paths:
  - docs/STATE.md
  # mid-list comment
  - docs/cost/**

branch_prefixes:
  - chore/state-snapshot-

authors:
  - github-actions[bot]
`;
  const result = parseAllowlist(yaml);
  assert.deepEqual(result.paths, ['docs/STATE.md', 'docs/cost/**']);
  assert.deepEqual(result.branch_prefixes, ['chore/state-snapshot-']);
  assert.deepEqual(result.authors, ['github-actions[bot]']);
});

test('parseAllowlist — strips inline comments and quotes', () => {
  const yaml = `
paths:
  - 'docs/STATE.md'  # inline comment
  - "docs/cost/**"
`;
  const result = parseAllowlist(yaml);
  assert.deepEqual(result.paths, ['docs/STATE.md', 'docs/cost/**']);
});

test('parseAllowlist — ignores unknown top-level keys', () => {
  const yaml = `
paths:
  - docs/STATE.md
unknown_key:
  - should-be-ignored
authors:
  - real-author
`;
  const result = parseAllowlist(yaml);
  assert.deepEqual(result.paths, ['docs/STATE.md']);
  assert.deepEqual(result.authors, ['real-author']);
  assert.deepEqual(result.branch_prefixes, []);
});

// ---------------------------------------------------------------------------
// globToRegex
// ---------------------------------------------------------------------------
test('globToRegex — exact path match', () => {
  const re = globToRegex('docs/STATE.md');
  assert.equal(re.test('docs/STATE.md'), true);
  assert.equal(re.test('docs/STATE.md.bak'), false);
  assert.equal(re.test('other/STATE.md'), false);
});

test('globToRegex — `prefix/**` matches files at any depth under prefix', () => {
  const re = globToRegex('docs/cost/**');
  assert.equal(re.test('docs/cost/2026-05-23.md'), true);
  assert.equal(re.test('docs/cost/sub/dir/file.json'), true);
  assert.equal(re.test('docs/cost/'), true);  // empty filename under prefix
  // Bare directory (no trailing slash) — does not match. In our use case the
  // helper only ever sees file paths from `gh pr view --json files`, never
  // bare directories, so this edge does not affect runtime correctness.
  assert.equal(re.test('docs/cost'), false);
  assert.equal(re.test('docs/other/file.md'), false);
  // Adjacent prefix with shared chars must not match
  assert.equal(re.test('docs/costless/file.md'), false);
});

test('globToRegex — single * does NOT cross segments', () => {
  const re = globToRegex('docs/*/file.md');
  assert.equal(re.test('docs/foo/file.md'), true);
  assert.equal(re.test('docs/foo/bar/file.md'), false);
});

test('globToRegex — anchors at both ends', () => {
  const re = globToRegex('completion-tracker.json');
  assert.equal(re.test('completion-tracker.json'), true);
  assert.equal(re.test('prefix-completion-tracker.json'), false);
  assert.equal(re.test('completion-tracker.json.bak'), false);
});

test('globToRegex — escapes regex metacharacters', () => {
  const re = globToRegex('docs/file.with.dots.md');
  assert.equal(re.test('docs/file.with.dots.md'), true);
  assert.equal(re.test('docs/fileXwithXdotsXmd'), false);
});

// ---------------------------------------------------------------------------
// pathMatches
// ---------------------------------------------------------------------------
test('pathMatches — matches if ANY glob matches', () => {
  const globs = ['docs/STATE.md', 'docs/cost/**', 'completion-tracker.json'];
  assert.equal(pathMatches('docs/STATE.md', globs), true);
  assert.equal(pathMatches('docs/cost/2026-05-23.md', globs), true);
  assert.equal(pathMatches('completion-tracker.json', globs), true);
  assert.equal(pathMatches('docs/random.md', globs), false);
  assert.equal(pathMatches('apps/admin/src/foo.ts', globs), false);
});

// ---------------------------------------------------------------------------
// evaluatePr — three-gate AND
// ---------------------------------------------------------------------------
const TEST_ALLOWLIST = {
  paths: ['docs/STATE.md', 'docs/cost/**', 'completion-tracker.json'],
  branch_prefixes: ['chore/state-snapshot-', 'completion-tracker/'],
  authors: ['github-actions[bot]', 'adrper79-dot'],
};

test('evaluatePr — all gates pass → ok=true', () => {
  const result = evaluatePr({
    author: 'github-actions[bot]',
    branch: 'chore/state-snapshot-2026-05-23-1903',
    files: ['docs/STATE.md'],
    allowlist: TEST_ALLOWLIST,
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.violations, []);
});

test('evaluatePr — unknown author → rejected', () => {
  const result = evaluatePr({
    author: 'random-contributor',
    branch: 'chore/state-snapshot-2026-05-23',
    files: ['docs/STATE.md'],
    allowlist: TEST_ALLOWLIST,
  });
  assert.equal(result.ok, false);
  assert.ok(result.violations.some((v) => v.startsWith('author:')));
});

test('evaluatePr — wrong branch prefix → rejected', () => {
  const result = evaluatePr({
    author: 'github-actions[bot]',
    branch: 'feat/sneaky-pr',
    files: ['docs/STATE.md'],
    allowlist: TEST_ALLOWLIST,
  });
  assert.equal(result.ok, false);
  assert.ok(result.violations.some((v) => v.startsWith('branch:')));
});

test('evaluatePr — mixed paths (one allowlisted + one not) → rejected', () => {
  const result = evaluatePr({
    author: 'github-actions[bot]',
    branch: 'chore/state-snapshot-2026-05-23',
    files: ['docs/STATE.md', 'apps/admin/src/sneaky.ts'],
    allowlist: TEST_ALLOWLIST,
  });
  assert.equal(result.ok, false);
  const pathViolation = result.violations.find((v) => v.startsWith('paths:'));
  assert.ok(pathViolation);
  assert.ok(pathViolation.includes('apps/admin/src/sneaky.ts'));
  assert.ok(!pathViolation.includes('docs/STATE.md'));
});

test('evaluatePr — empty file list → ok=true (no gate violation)', () => {
  // Edge case: PR with no file changes (unlikely but possible on edited-body).
  // We still pass because empty list trivially satisfies "every file matches."
  const result = evaluatePr({
    author: 'github-actions[bot]',
    branch: 'chore/state-snapshot-2026-05-23',
    files: [],
    allowlist: TEST_ALLOWLIST,
  });
  assert.equal(result.ok, true);
});

test('evaluatePr — all three gates fail → all three violations reported', () => {
  const result = evaluatePr({
    author: 'random-contributor',
    branch: 'feat/sneaky-pr',
    files: ['apps/admin/src/sneaky.ts'],
    allowlist: TEST_ALLOWLIST,
  });
  assert.equal(result.ok, false);
  assert.equal(result.violations.length, 3);
});

// ---------------------------------------------------------------------------
// Real allowlist sanity check
// ---------------------------------------------------------------------------
test('parseAllowlist — production .github/snapshot-paths.yml loads cleanly', async () => {
  const { readFileSync } = await import('node:fs');
  const yaml = readFileSync('.github/snapshot-paths.yml', 'utf-8');
  const result = parseAllowlist(yaml);
  assert.ok(result.paths.length > 0, 'paths must be non-empty');
  assert.ok(result.branch_prefixes.length > 0, 'branch_prefixes must be non-empty');
  assert.ok(result.authors.length > 0, 'authors must be non-empty');
  // Spot-check a known entry
  assert.ok(result.paths.includes('docs/STATE.md'));
  assert.ok(result.authors.includes('github-actions[bot]'));
});

test('evaluatePr — historic real PR #915 (state snapshot) would be auto-merged', async () => {
  const { readFileSync } = await import('node:fs');
  const allowlist = parseAllowlist(readFileSync('.github/snapshot-paths.yml', 'utf-8'));
  const result = evaluatePr({
    author: 'github-actions[bot]',
    branch: 'chore/state-snapshot-2026-05-23-1903',
    files: ['docs/STATE.md'],
    allowlist,
  });
  assert.equal(result.ok, true, `PR #915 should pass; violations: ${JSON.stringify(result.violations)}`);
});

// ---------------------------------------------------------------------------
// Kill switch — isAutomationPaused
// ---------------------------------------------------------------------------
test('isAutomationPaused — returns false when the flag file does not exist', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'snapshot-helper-test-'));
  const nonExistent = join(tmp, 'does-not-exist');
  assert.equal(isAutomationPaused(nonExistent), false);
});

test('isAutomationPaused — returns true when the flag file exists (empty)', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'snapshot-helper-test-'));
  const flagPath = join(tmp, 'automation-paused');
  writeFileSync(flagPath, '');
  try {
    assert.equal(isAutomationPaused(flagPath), true);
  } finally {
    unlinkSync(flagPath);
  }
});

test('isAutomationPaused — returns true regardless of file content', () => {
  // Presence-only semantics — content is intentionally ignored. This guards
  // against accidental "the file says PAUSED=false so it's not really
  // paused" misinterpretations downstream.
  const tmp = mkdtempSync(join(tmpdir(), 'snapshot-helper-test-'));
  const flagPath = join(tmp, 'automation-paused');
  writeFileSync(flagPath, 'PAUSED=false\nRESUME=true\nlol');
  try {
    assert.equal(isAutomationPaused(flagPath), true);
  } finally {
    unlinkSync(flagPath);
  }
});

test('isAutomationPaused — defaults to .github/automation-paused', () => {
  // In production with no file present, the default path should yield false.
  // Repo invariant: .github/automation-paused MUST NOT exist on main except
  // during a deliberate freeze. If this test fails, someone shipped a
  // permanent kill switch — investigate.
  assert.equal(isAutomationPaused(), false);
});

test('evaluatePr — Phase 2 PR itself would be REJECTED (workflows + scripts not in allowlist)', async () => {
  const { readFileSync } = await import('node:fs');
  const allowlist = parseAllowlist(readFileSync('.github/snapshot-paths.yml', 'utf-8'));
  const result = evaluatePr({
    author: 'adrper79-dot',
    branch: 'chore/workflow-lifecycle-phase-2',
    files: [
      '.github/snapshot-paths.yml',
      '.github/scripts/snapshot-pr-helper.mjs',
      '.github/workflows/snapshot-pr-auto-merge.yml',
      'docs/runbooks/snapshot-pr-contract.md',
    ],
    allowlist,
  });
  assert.equal(result.ok, false);
  // Must reject on BOTH branch prefix AND non-allowlisted paths
  assert.ok(result.violations.some((v) => v.startsWith('branch:')));
  assert.ok(result.violations.some((v) => v.startsWith('paths:')));
});
