// Determinism tests for scripts/capabilities/compile.mjs.
//
// Guards against the squash-merge drift class of failures (see PR #1009):
//   1. Two back-to-back regen runs must produce byte-identical output.
//   2. Mutating a source file must change the content signature.
//
// Run with: node --test scripts/capabilities/__tests__/compile.test.mjs
//
// Zero deps — uses Node's built-in test runner so this works in any CI step
// that already has Node installed (no Vitest setup required at repo root).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, cpSync, writeFileSync, readFileSync, rmSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '../../..');
const COMPILE = join(REPO_ROOT, 'scripts/capabilities/compile.mjs');

// Run the compiler in a temporary repo clone so we never touch the working
// tree. Returns the catalog JSON string from `capabilities/dist/catalog.json`.
function runCompileInTempCopy(mutator) {
  const tmp = mkdtempSync(join(tmpdir(), 'cap-compile-'));
  try {
    cpSync(join(REPO_ROOT, 'capabilities'), join(tmp, 'capabilities'), { recursive: true });
    cpSync(join(REPO_ROOT, 'scripts'), join(tmp, 'scripts'), { recursive: true });
    // admin-studio TS sink is written by compile.mjs — create the path so
    // writeFileSync doesn't fail. Content is rewritten by the compiler.
    cpSync(
      join(REPO_ROOT, 'apps/admin-studio/src/lib'),
      join(tmp, 'apps/admin-studio/src/lib'),
      { recursive: true },
    );

    if (typeof mutator === 'function') {
      mutator(tmp);
    }

    // Execute the compiler against the temp tree by overriding cwd-relative
    // paths via a copy of the script. Simpler: invoke node with the temp
    // script (which uses __dirname to resolve REPO_ROOT relative to itself).
    execFileSync(process.execPath, [join(tmp, 'scripts/capabilities/compile.mjs')], {
      stdio: 'pipe',
    });
    return readFileSync(join(tmp, 'capabilities/dist/catalog.json'), 'utf8');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

test('compile.mjs produces byte-identical output across two runs', () => {
  const first = runCompileInTempCopy();
  const second = runCompileInTempCopy();
  assert.equal(second, first, 'second regen diverged from the first');

  // Sanity: the field is a content hash, not a timestamp.
  const parsed = JSON.parse(first);
  assert.match(
    parsed.generatedAt,
    /^sha256:[a-f0-9]{16}$/,
    'generatedAt should be a sha256:<16hex> content signature',
  );
});

test('compile.mjs content signature changes when a concept changes', () => {
  const baseline = runCompileInTempCopy();
  const baselineHash = JSON.parse(baseline).generatedAt;

  const mutated = runCompileInTempCopy((tmpRoot) => {
    // Pick the first concept file and tweak its description in a way that
    // genuinely changes the catalog payload (not just whitespace).
    const conceptsDir = join(tmpRoot, 'capabilities/concepts');
    const files = readdirSync(conceptsDir).filter((f) => f.endsWith('.json')).sort();
    assert.ok(files.length > 0, 'expected at least one concept file');
    const target = join(conceptsDir, files[0]);
    const data = JSON.parse(readFileSync(target, 'utf8'));
    data.description = `${data.description ?? ''} (mutated for determinism test)`;
    writeFileSync(target, JSON.stringify(data, null, 2), 'utf8');
  });

  const mutatedHash = JSON.parse(mutated).generatedAt;
  assert.notEqual(
    mutatedHash,
    baselineHash,
    'mutating a concept should change the content signature',
  );
  assert.match(mutatedHash, /^sha256:[a-f0-9]{16}$/);
});

test('compile.mjs ignores trailing-whitespace-only edits to source files', () => {
  const baseline = runCompileInTempCopy();
  const baselineHash = JSON.parse(baseline).generatedAt;

  const whitespaceOnly = runCompileInTempCopy((tmpRoot) => {
    // Re-serialise with different indentation — semantically identical content.
    const conceptsDir = join(tmpRoot, 'capabilities/concepts');
    for (const f of readdirSync(conceptsDir).filter((x) => x.endsWith('.json'))) {
      const target = join(conceptsDir, f);
      const data = JSON.parse(readFileSync(target, 'utf8'));
      // Write with different indent + trailing newline tweak.
      writeFileSync(target, JSON.stringify(data, null, 4) + '\n\n', 'utf8');
    }
  });

  const whitespaceHash = JSON.parse(whitespaceOnly).generatedAt;
  assert.equal(
    whitespaceHash,
    baselineHash,
    'whitespace-only reformatting of source files must not change the signature',
  );
});
