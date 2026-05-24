// =============================================================================
// coherence-check.test.mjs — unit tests for the drift-detection helper.
//
// Run: node --test .github/scripts/coherence-check.test.mjs
//
// Covers:
//   - Pure helpers: listFilesRecursive, isStateMutatingScript,
//     hasKillSwitchCheck, hasNotifyImport
//   - Each invariant check function on fixture inputs
//   - BLAST RADIUS scan of coherence-check.mjs itself
//   - Real-repo smoke (skipped when dependent branches aren't on this one)
// =============================================================================

import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdirSync, mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  listFilesRecursive,
  isStateMutatingScript,
  hasKillSwitchCheck,
  hasNotifyImport,
  checkRegistryVsFilesystemForward,
  checkRegistryVsFilesystemReverse,
  checkPushPrHasConcurrency,
  checkScriptsHaveKillSwitch,
  checkScriptsImportNotify,
  checkDocLinksResolve,
  checkNoPauseOnMain,
  isAutomationPaused,
} from './coherence-check.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const COHERENCE_SOURCE_PATH = join(__dirname, 'coherence-check.mjs');

function tmp() {
  const dir = mkdtempSync(join(tmpdir(), 'coherence-test-'));
  return { dir, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

// ---------------------------------------------------------------------------
// listFilesRecursive
// ---------------------------------------------------------------------------
test('listFilesRecursive — finds nested files matching predicate', () => {
  const { dir, cleanup } = tmp();
  try {
    mkdirSync(join(dir, 'sub/nested'), { recursive: true });
    writeFileSync(join(dir, 'a.yml'), '');
    writeFileSync(join(dir, 'b.txt'), '');
    writeFileSync(join(dir, 'sub/c.yml'), '');
    writeFileSync(join(dir, 'sub/nested/d.yml'), '');
    const files = listFilesRecursive(dir, (p) => p.endsWith('.yml')).sort();
    assert.equal(files.length, 3);
    assert.ok(files.some((f) => f.endsWith('/a.yml')));
    assert.ok(files.some((f) => f.endsWith('/d.yml')));
    assert.ok(!files.some((f) => f.endsWith('b.txt')));
  } finally { cleanup(); }
});

test('listFilesRecursive — non-existent dir returns empty array', () => {
  const files = listFilesRecursive('/tmp/does-not-exist-coherence-test');
  assert.deepEqual(files, []);
});

// ---------------------------------------------------------------------------
// isStateMutatingScript
// ---------------------------------------------------------------------------
test('isStateMutatingScript — detects gh pr merge', () => {
  assert.equal(isStateMutatingScript('execSync("gh pr merge 123 --auto");'), true);
});

test('isStateMutatingScript — detects gh issue create', () => {
  assert.equal(isStateMutatingScript('gh(`issue create --title "..."`);'), true);
});

test('isStateMutatingScript — detects gh workflow disable', () => {
  assert.equal(isStateMutatingScript('await gh("workflow disable foo.yml");'), true);
});

test('isStateMutatingScript — detects gh api -X PUT/POST/DELETE', () => {
  assert.equal(isStateMutatingScript('gh("api /repos/x/y -X PUT")'), true);
  assert.equal(isStateMutatingScript('gh("api /repos/x/y -X DELETE")'), true);
});

test('isStateMutatingScript — detects direct Pushover API call', () => {
  assert.equal(isStateMutatingScript('fetch("https://api.pushover.net/1/messages.json")'), true);
});

test('isStateMutatingScript — does NOT match read-only gh subcommands', () => {
  assert.equal(isStateMutatingScript('execSync("gh run list --limit 5")'), false);
  assert.equal(isStateMutatingScript('gh("workflow list")'), false);
  assert.equal(isStateMutatingScript('gh("api /repos/x/y")'), false);  // no -X
});

// ---------------------------------------------------------------------------
// hasKillSwitchCheck
// ---------------------------------------------------------------------------
test('hasKillSwitchCheck — detects isAutomationPaused() call', () => {
  assert.equal(hasKillSwitchCheck('if (isAutomationPaused()) exit(0);'), true);
});

test('hasKillSwitchCheck — detects direct existsSync(automation-paused)', () => {
  assert.equal(hasKillSwitchCheck("existsSync('.github/automation-paused')"), true);
});

test('hasKillSwitchCheck — false when no kill-switch reference', () => {
  assert.equal(hasKillSwitchCheck('console.log("hello");'), false);
});

// ---------------------------------------------------------------------------
// hasNotifyImport
// ---------------------------------------------------------------------------
test('hasNotifyImport — detects canonical import', () => {
  assert.equal(hasNotifyImport("import { notify } from './pushover-notify.mjs';"), true);
});

test('hasNotifyImport — detects relative import with .. ', () => {
  assert.equal(hasNotifyImport("import { notify } from '../scripts/pushover-notify.mjs';"), true);
});

test('hasNotifyImport — detects direct Pushover API call (counts as own pager)', () => {
  assert.equal(hasNotifyImport('fetch("https://api.pushover.net/1/messages.json")'), true);
});

test('hasNotifyImport — false when no Pushover reference', () => {
  assert.equal(hasNotifyImport("import { foo } from 'bar';"), false);
});

// ---------------------------------------------------------------------------
// checkRegistryVsFilesystemForward
// ---------------------------------------------------------------------------
test('checkRegistryVsFilesystemForward — all workflows in registry → ok', () => {
  const { dir, cleanup } = tmp();
  try {
    const wf = join(dir, '.github/workflows');
    mkdirSync(wf, { recursive: true });
    writeFileSync(join(wf, 'a.yml'), 'on: push');
    writeFileSync(join(wf, 'b.yml'), 'on: push');
    writeFileSync(join(wf, 'REGISTRY.md'), `### T1\n| \`a.yml\` | x |\n### T2\n| \`b.yml\` | y |`);
    const r = checkRegistryVsFilesystemForward({ workflowsDir: wf, registryPath: join(wf, 'REGISTRY.md') });
    assert.equal(r.ok, true);
    assert.deepEqual(r.violations, []);
  } finally { cleanup(); }
});

test('checkRegistryVsFilesystemForward — orphan on disk → violation', () => {
  const { dir, cleanup } = tmp();
  try {
    const wf = join(dir, '.github/workflows');
    mkdirSync(wf, { recursive: true });
    writeFileSync(join(wf, 'a.yml'), 'on: push');
    writeFileSync(join(wf, 'unclassified.yml'), 'on: push');
    writeFileSync(join(wf, 'REGISTRY.md'), `### T1\n| \`a.yml\` | x |`);
    const r = checkRegistryVsFilesystemForward({ workflowsDir: wf, registryPath: join(wf, 'REGISTRY.md') });
    assert.equal(r.ok, false);
    assert.ok(r.violations[0].includes('unclassified.yml'));
  } finally { cleanup(); }
});

test('checkRegistryVsFilesystemForward — reusable _*.yml workflows are excluded', () => {
  const { dir, cleanup } = tmp();
  try {
    const wf = join(dir, '.github/workflows');
    mkdirSync(wf, { recursive: true });
    writeFileSync(join(wf, '_app-deploy.yml'), 'on: workflow_call');  // reusable — excluded
    writeFileSync(join(wf, 'a.yml'), 'on: push');
    writeFileSync(join(wf, 'REGISTRY.md'), `### T1\n| \`a.yml\` | x |`);
    const r = checkRegistryVsFilesystemForward({ workflowsDir: wf, registryPath: join(wf, 'REGISTRY.md') });
    assert.equal(r.ok, true);
  } finally { cleanup(); }
});

test('checkRegistryVsFilesystemForward — REGISTRY.md absent → skip cleanly', () => {
  const { dir, cleanup } = tmp();
  try {
    const wf = join(dir, '.github/workflows');
    mkdirSync(wf, { recursive: true });
    writeFileSync(join(wf, 'a.yml'), 'on: push');
    const r = checkRegistryVsFilesystemForward({ workflowsDir: wf, registryPath: join(wf, 'REGISTRY.md') });
    assert.equal(r.ok, true);
    assert.ok(r.note.includes('absent'));
  } finally { cleanup(); }
});

// ---------------------------------------------------------------------------
// checkRegistryVsFilesystemReverse
// ---------------------------------------------------------------------------
test('checkRegistryVsFilesystemReverse — registry row → missing file is violation', () => {
  const { dir, cleanup } = tmp();
  try {
    const wf = join(dir, '.github/workflows');
    mkdirSync(wf, { recursive: true });
    writeFileSync(join(wf, 'a.yml'), 'on: push');
    writeFileSync(join(wf, 'REGISTRY.md'), `### T1\n| \`a.yml\` | x |\n| \`ghost.yml\` | y |`);
    const r = checkRegistryVsFilesystemReverse({ workflowsDir: wf, registryPath: join(wf, 'REGISTRY.md') });
    assert.equal(r.ok, false);
    assert.ok(r.violations[0].includes('ghost.yml'));
  } finally { cleanup(); }
});

// ---------------------------------------------------------------------------
// checkPushPrHasConcurrency
// ---------------------------------------------------------------------------
test('checkPushPrHasConcurrency — push workflow without concurrency → violation', () => {
  const { dir, cleanup } = tmp();
  try {
    const wf = join(dir, '.github/workflows');
    mkdirSync(wf, { recursive: true });
    writeFileSync(join(wf, 'no-conc.yml'), `name: x\non:\n  push:\n    branches: [main]\njobs:\n  x:\n    runs-on: ubuntu-latest`);
    writeFileSync(join(wf, 'has-conc.yml'), `name: y\non:\n  push:\n    branches: [main]\nconcurrency:\n  group: y\njobs:\n  y:\n    runs-on: ubuntu-latest`);
    const r = checkPushPrHasConcurrency({ workflowsDir: wf });
    assert.equal(r.ok, false);
    assert.equal(r.violations.length, 1);
    assert.ok(r.violations[0].includes('no-conc.yml'));
  } finally { cleanup(); }
});

test('checkPushPrHasConcurrency — workflow_call-only is exempt', () => {
  const { dir, cleanup } = tmp();
  try {
    const wf = join(dir, '.github/workflows');
    mkdirSync(wf, { recursive: true });
    writeFileSync(join(wf, '_reusable.yml'), `name: r\non:\n  workflow_call:\njobs:\n  r:\n    runs-on: ubuntu-latest`);
    const r = checkPushPrHasConcurrency({ workflowsDir: wf });
    assert.equal(r.ok, true);
  } finally { cleanup(); }
});

// ---------------------------------------------------------------------------
// checkScriptsHaveKillSwitch
// ---------------------------------------------------------------------------
test('checkScriptsHaveKillSwitch — state-mutating script without kill switch → violation', () => {
  const { dir, cleanup } = tmp();
  try {
    const s = join(dir, '.github/scripts');
    mkdirSync(s, { recursive: true });
    writeFileSync(join(s, 'bad.mjs'), `execSync('gh issue create --title foo');`);
    const r = checkScriptsHaveKillSwitch({ scriptsDir: s });
    assert.equal(r.ok, false);
    assert.ok(r.violations[0].includes('bad.mjs'));
  } finally { cleanup(); }
});

test('checkScriptsHaveKillSwitch — state-mutating script with kill switch → ok', () => {
  const { dir, cleanup } = tmp();
  try {
    const s = join(dir, '.github/scripts');
    mkdirSync(s, { recursive: true });
    writeFileSync(join(s, 'good.mjs'), `import { isAutomationPaused } from './x.mjs';\nif (isAutomationPaused()) process.exit(0);\nexecSync('gh issue create --title foo');`);
    const r = checkScriptsHaveKillSwitch({ scriptsDir: s });
    assert.equal(r.ok, true);
  } finally { cleanup(); }
});

test('checkScriptsHaveKillSwitch — read-only script (no state mutation) → exempt', () => {
  const { dir, cleanup } = tmp();
  try {
    const s = join(dir, '.github/scripts');
    mkdirSync(s, { recursive: true });
    writeFileSync(join(s, 'readonly.mjs'), `execSync('gh run list --limit 5');`);
    const r = checkScriptsHaveKillSwitch({ scriptsDir: s });
    assert.equal(r.ok, true);
  } finally { cleanup(); }
});

test('checkScriptsHaveKillSwitch — .test.mjs files are excluded', () => {
  const { dir, cleanup } = tmp();
  try {
    const s = join(dir, '.github/scripts');
    mkdirSync(s, { recursive: true });
    writeFileSync(join(s, 'a.test.mjs'), `execSync('gh issue create --title foo');`);
    const r = checkScriptsHaveKillSwitch({ scriptsDir: s });
    assert.equal(r.ok, true);
  } finally { cleanup(); }
});

// ---------------------------------------------------------------------------
// checkScriptsImportNotify
// ---------------------------------------------------------------------------
test('checkScriptsImportNotify — state-mutating script without notify → violation', () => {
  const { dir, cleanup } = tmp();
  try {
    const s = join(dir, '.github/scripts');
    mkdirSync(s, { recursive: true });
    writeFileSync(join(s, 'silent.mjs'), `if (isAutomationPaused()) exit(0);\nexecSync('gh workflow disable foo.yml');`);
    const r = checkScriptsImportNotify({ scriptsDir: s });
    assert.equal(r.ok, false);
    assert.ok(r.violations[0].includes('silent.mjs'));
  } finally { cleanup(); }
});

test('checkScriptsImportNotify — pushover-notify itself is exempt', () => {
  const { dir, cleanup } = tmp();
  try {
    const s = join(dir, '.github/scripts');
    mkdirSync(s, { recursive: true });
    writeFileSync(join(s, 'pushover-notify.mjs'), `fetch('https://api.pushover.net/1/messages.json');`);
    const r = checkScriptsImportNotify({ scriptsDir: s });
    assert.equal(r.ok, true);
  } finally { cleanup(); }
});

// ---------------------------------------------------------------------------
// checkDocLinksResolve
// ---------------------------------------------------------------------------
test('checkDocLinksResolve — broken markdown link → violation', () => {
  const { dir, cleanup } = tmp();
  try {
    const d = join(dir, 'docs/decisions');
    mkdirSync(d, { recursive: true });
    writeFileSync(join(d, 'decision.md'), `See [missing](../runbooks/does-not-exist.md).`);
    const r = checkDocLinksResolve({ rootDirs: [d] });
    assert.equal(r.ok, false);
    assert.ok(r.violations[0].includes('does-not-exist.md'));
  } finally { cleanup(); }
});

test('checkDocLinksResolve — anchor-only links are ignored', () => {
  const { dir, cleanup } = tmp();
  try {
    const d = join(dir, 'docs/decisions');
    mkdirSync(d, { recursive: true });
    writeFileSync(join(d, 'decision.md'), `See [section](#summary).`);
    const r = checkDocLinksResolve({ rootDirs: [d] });
    assert.equal(r.ok, true);
  } finally { cleanup(); }
});

test('checkDocLinksResolve — external (https) links are ignored', () => {
  const { dir, cleanup } = tmp();
  try {
    const d = join(dir, 'docs/decisions');
    mkdirSync(d, { recursive: true });
    writeFileSync(join(d, 'decision.md'), `See [GH](https://github.com/x/y).`);
    const r = checkDocLinksResolve({ rootDirs: [d] });
    assert.equal(r.ok, true);
  } finally { cleanup(); }
});

// ---------------------------------------------------------------------------
// checkNoPauseOnMain
// ---------------------------------------------------------------------------
test('checkNoPauseOnMain — flag absent → ok', () => {
  const r = checkNoPauseOnMain({ pausePath: '/tmp/coherence-test-nonexistent-pause' });
  assert.equal(r.ok, true);
});

test('checkNoPauseOnMain — flag present → violation', () => {
  const { dir, cleanup } = tmp();
  try {
    const flag = join(dir, 'automation-paused');
    writeFileSync(flag, '');
    const r = checkNoPauseOnMain({ pausePath: flag });
    assert.equal(r.ok, false);
    assert.ok(r.violations[0].includes('paused'));
  } finally { cleanup(); }
});

// ---------------------------------------------------------------------------
// Kill switch (the coherence-check itself must honor it)
// ---------------------------------------------------------------------------
test('isAutomationPaused — production default path absent on main', () => {
  assert.equal(isAutomationPaused(), false);
});

// ---------------------------------------------------------------------------
// BLAST RADIUS — source scan
// ---------------------------------------------------------------------------

function stripComments(source) {
  return source.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
}

test('blast-radius — coherence-check source contains NO gh pr merge', () => {
  const code = stripComments(readFileSync(COHERENCE_SOURCE_PATH, 'utf-8'));
  assert.ok(!code.includes('gh pr merge'));
});

test('blast-radius — coherence-check source contains NO gh pr review', () => {
  const code = stripComments(readFileSync(COHERENCE_SOURCE_PATH, 'utf-8'));
  assert.ok(!code.includes('gh pr review'));
});

test('blast-radius — coherence-check source contains NO gh workflow disable', () => {
  const code = stripComments(readFileSync(COHERENCE_SOURCE_PATH, 'utf-8'));
  assert.ok(!code.includes('gh workflow disable'));
});

test('blast-radius — coherence-check source contains NO gh workflow enable', () => {
  const code = stripComments(readFileSync(COHERENCE_SOURCE_PATH, 'utf-8'));
  assert.ok(!code.includes('gh workflow enable'));
});

test('blast-radius — coherence-check source contains NO git push', () => {
  const code = stripComments(readFileSync(COHERENCE_SOURCE_PATH, 'utf-8'));
  assert.ok(!code.includes('git push'));
});

test('blast-radius — coherence-check source contains NO file deletion calls', () => {
  const code = stripComments(readFileSync(COHERENCE_SOURCE_PATH, 'utf-8'));
  assert.ok(!code.includes('unlinkSync'));
  assert.ok(!code.includes('rmSync'));
});

test('blast-radius — coherence-check source contains NO -X PUT / -X DELETE', () => {
  const code = stripComments(readFileSync(COHERENCE_SOURCE_PATH, 'utf-8'));
  assert.ok(!code.includes('-X PUT'));
  assert.ok(!code.includes('-X DELETE'));
});

// ---------------------------------------------------------------------------
// Real-repo smoke (skips when dependent branches aren't on this one)
// ---------------------------------------------------------------------------
test('real-repo — production runs would skip cleanly when REGISTRY.md absent', () => {
  // On this branch (off main), REGISTRY.md doesn't exist. Forward check should
  // return ok=true with a note about absence.
  if (existsSync('.github/workflows/REGISTRY.md')) {
    console.log('  REGISTRY.md present — skipping absence test');
    return;
  }
  const r = checkRegistryVsFilesystemForward();
  assert.equal(r.ok, true);
  assert.ok(r.note && r.note.includes('absent'));
});
