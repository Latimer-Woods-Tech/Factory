// constraints-loader.test.mjs — unit tests for the CLAUDE.md constraints parser.
//
// Run: node --test .github/scripts/constraints-loader.test.mjs

import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadHardConstraints, buildConstraintSystemBlock } from './constraints-loader.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));

function tmp() {
  const dir = mkdtempSync(join(__dirname, '.test-constraints-'));
  return { dir, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

// ── loadHardConstraints ──────────────────────────────────────────────────────

test('returns null when file does not exist', () => {
  const result = loadHardConstraints('/nonexistent/path/CLAUDE.md');
  assert.strictEqual(result, null);
});

test('returns null when ## Hard Constraints heading is absent', () => {
  const { dir, cleanup } = tmp();
  try {
    const path = join(dir, 'CLAUDE.md');
    writeFileSync(path, '## Mission\nDo great things.\n\n## Stack\nHono.\n');
    assert.strictEqual(loadHardConstraints(path), null);
  } finally {
    cleanup();
  }
});

test('extracts items from a minimal Hard Constraints section', () => {
  const { dir, cleanup } = tmp();
  try {
    const path = join(dir, 'CLAUDE.md');
    writeFileSync(
      path,
      '## Hard Constraints\n- No process.env\n- No Buffer\n\n## Other Section\nmore content\n',
    );
    const result = loadHardConstraints(path);
    assert.ok(result);
    assert.deepStrictEqual(result.items, [
      { text: 'No process.env' },
      { text: 'No Buffer' },
    ]);
  } finally {
    cleanup();
  }
});

test('slices only to the next ## heading, not beyond', () => {
  const { dir, cleanup } = tmp();
  try {
    const path = join(dir, 'CLAUDE.md');
    writeFileSync(
      path,
      '## Hard Constraints\n- Rule A\n\n## Next Section\n- Not a constraint\n',
    );
    const result = loadHardConstraints(path);
    assert.ok(result);
    assert.strictEqual(result.items.length, 1);
    assert.strictEqual(result.items[0].text, 'Rule A');
  } finally {
    cleanup();
  }
});

test('handles Hard Constraints at end of file (no following ##)', () => {
  const { dir, cleanup } = tmp();
  try {
    const path = join(dir, 'CLAUDE.md');
    writeFileSync(path, '## Hard Constraints\n- Only rule\n');
    const result = loadHardConstraints(path);
    assert.ok(result);
    assert.strictEqual(result.items.length, 1);
    assert.strictEqual(result.items[0].text, 'Only rule');
  } finally {
    cleanup();
  }
});

test('strips leading whitespace from indented bullet items', () => {
  const { dir, cleanup } = tmp();
  try {
    const path = join(dir, 'CLAUDE.md');
    writeFileSync(path, '## Hard Constraints\n  - Indented item\n');
    const result = loadHardConstraints(path);
    assert.ok(result);
    assert.strictEqual(result.items[0].text, 'Indented item');
  } finally {
    cleanup();
  }
});

test('source field reflects the path passed in', () => {
  const { dir, cleanup } = tmp();
  try {
    const path = join(dir, 'CLAUDE.md');
    writeFileSync(path, '## Hard Constraints\n- Rule\n');
    const result = loadHardConstraints(path);
    assert.strictEqual(result?.source, path);
  } finally {
    cleanup();
  }
});

test('raw field contains the full section text', () => {
  const { dir, cleanup } = tmp();
  try {
    const path = join(dir, 'CLAUDE.md');
    writeFileSync(path, '## Hard Constraints\n- Rule A\n- Rule B\n\n## Next\n');
    const result = loadHardConstraints(path);
    assert.ok(result?.raw.includes('Rule A'));
    assert.ok(result?.raw.includes('Rule B'));
    assert.ok(!result?.raw.includes('## Next'));
  } finally {
    cleanup();
  }
});

// ── buildConstraintSystemBlock ───────────────────────────────────────────────

test('returns fallback string when file is missing', () => {
  const block = buildConstraintSystemBlock('/nonexistent/CLAUDE.md');
  assert.ok(block.includes('fallback'));
  assert.ok(block.includes('process.env'));
});

test('block includes scope annotation and items', () => {
  const { dir, cleanup } = tmp();
  try {
    const path = join(dir, 'CLAUDE.md');
    writeFileSync(path, '## Hard Constraints\n- No process.env\n- No Buffer\n');
    const block = buildConstraintSystemBlock(path);
    assert.ok(block.includes('Hard Constraints (live from CLAUDE.md)'));
    assert.ok(block.includes('Scope'));
    assert.ok(block.includes('No process.env'));
    assert.ok(block.includes('No Buffer'));
  } finally {
    cleanup();
  }
});

test('parses real CLAUDE.md from repo root', () => {
  const repoRoot = join(__dirname, '..', '..');
  const path = join(repoRoot, 'CLAUDE.md');
  const result = loadHardConstraints(path);
  // CLAUDE.md exists and has a Hard Constraints section with real items.
  assert.ok(result, 'Expected real CLAUDE.md to have a Hard Constraints section');
  assert.ok(result.items.length >= 5, `Expected ≥5 constraint items, got ${result.items.length}`);
  assert.ok(
    result.items.some((i) => /process\.env/.test(i.text)),
    'Expected a process.env constraint',
  );
});
