// supervisor-core.test.mjs
//
// Regression test for the empty-branch PR creation bug observed in
// Supervisor Loop run 25611174210 (2026-05-09 20:34Z), where ~10 issues
// per run failed with HTTP 422
//   "No commits between main and supervisor/<slug>-<ts>"
// because the supervisor matched off-topic templates, slot extraction
// returned all nulls, and the file-write loop committed nothing — yet the
// PR-creation step still fired.
//
// Affected issues at the time of the fix:
//   factory#529, factory#500
//   videoking#116, #81, #57, #56, #55, #54, #49, #47, #33
//
// We do not import supervisor-core.mjs (it executes main() at import time
// and reads env vars). Instead we exercise the same branching logic the
// fix relies on, using the same shape of `template` + `slots` inputs.

import { test } from 'node:test';
import assert from 'node:assert/strict';

// Reproduces the file-write loop + empty-branch guard from executeGreen()
// in .github/scripts/supervisor-core.mjs. If you change the guard there,
// mirror the change here.
async function simulateExecuteGreen({ template, slots, ghCalls }) {
  const gh = (method, path) => {
    ghCalls.push(`${method} ${path}`);
    if (method === 'GET' && path.endsWith('/git/ref/heads/main'))
      return Promise.resolve({ object: { sha: 'deadbeef' } });
    if (method === 'POST' && path.endsWith('/git/refs')) return Promise.resolve({});
    if (method === 'GET' && path.includes('/contents/'))
      return Promise.reject(new Error('GH GET ... → 404')); // new file
    if (method === 'PUT' && path.includes('/contents/')) return Promise.resolve({});
    if (method === 'DELETE' && path.includes('/git/refs/heads/'))
      return Promise.resolve(null);
    if (method === 'POST' && path.endsWith('/pulls'))
      return Promise.resolve({ number: 123, html_url: 'https://github.com/x/y/pull/123' });
    throw new Error(`unexpected gh call: ${method} ${path}`);
  };

  const branch = 'supervisor/test-branch-1';
  await gh('GET', '/repos/org/repo/git/ref/heads/main');
  await gh('POST', '/repos/org/repo/git/refs');

  const changedFiles = [];
  for (const { pathSlot, contentSlot } of template.prFiles) {
    const filePath = slots[pathSlot];
    const content = slots[contentSlot];
    if (!filePath || !content) continue;
    try {
      await gh('GET', `/repos/org/repo/contents/${filePath}?ref=${branch}`);
    } catch {
      /* new file */
    }
    await gh('PUT', `/repos/org/repo/contents/${filePath}`);
    changedFiles.push(filePath);
  }

  if (changedFiles.length === 0) {
    await gh('DELETE', `/repos/org/repo/git/refs/heads/${branch}`);
    return { branch, prUrl: null, prNumber: null, skipped: true, reason: 'no-file-changes' };
  }

  const pr = await gh('POST', '/repos/org/repo/pulls');
  return { branch, prUrl: pr.html_url, prNumber: pr.number, skipped: false };
}

test('executeGreen: empty slots → no PR, branch deleted, returns skipped sentinel', async () => {
  const template = {
    id: 'docs-naming-convention',
    prFiles: [{ pathSlot: 'target_path', contentSlot: 'doc_body' }],
  };
  // This is the exact slot shape from the failing run for factory#500
  const slots = {
    target_path: null,
    parent_dir: null,
    commit_message: null,
    doc_body: null,
    branch_name: null,
    scope: null,
  };
  const ghCalls = [];

  const result = await simulateExecuteGreen({ template, slots, ghCalls });

  assert.equal(result.skipped, true, 'must return skipped: true when no files change');
  assert.equal(result.reason, 'no-file-changes');
  assert.equal(result.prUrl, null, 'must NOT have prUrl when skipped');
  assert.equal(result.prNumber, null, 'must NOT have prNumber when skipped');

  // Critical regression assertion: NO POST to /pulls happens
  const pullsCalls = ghCalls.filter((c) => c === 'POST /repos/org/repo/pulls');
  assert.equal(pullsCalls.length, 0, 'must NOT call POST /pulls when nothing was committed');

  // The empty branch must be cleaned up so it doesn't pile up in the repo
  const deleteCalls = ghCalls.filter((c) => c.startsWith('DELETE'));
  assert.equal(deleteCalls.length, 1, 'must DELETE the empty branch ref');
});

test('executeGreen: valid slots → file committed and PR created', async () => {
  const template = {
    id: 'docs-naming-convention',
    prFiles: [{ pathSlot: 'target_path', contentSlot: 'doc_body' }],
  };
  const slots = { target_path: 'docs/foo.md', doc_body: '# Foo' };
  const ghCalls = [];

  const result = await simulateExecuteGreen({ template, slots, ghCalls });

  assert.equal(result.skipped, false, 'must not be skipped when files were committed');
  assert.equal(result.prNumber, 123);
  assert.match(result.prUrl, /pull\/123$/);

  const pullsCalls = ghCalls.filter((c) => c === 'POST /repos/org/repo/pulls');
  assert.equal(pullsCalls.length, 1, 'must POST /pulls exactly once when content was committed');

  const putCalls = ghCalls.filter((c) => c.startsWith('PUT '));
  assert.equal(putCalls.length, 1, 'must PUT exactly one file');
});

test('executeGreen: partial slots (some null) → only valid files committed, PR opens if at least one', async () => {
  const template = {
    id: 'multi-file',
    prFiles: [
      { pathSlot: 'p1', contentSlot: 'c1' },
      { pathSlot: 'p2', contentSlot: 'c2' },
    ],
  };
  const slots = { p1: 'docs/ok.md', c1: 'ok', p2: null, c2: null };
  const ghCalls = [];

  const result = await simulateExecuteGreen({ template, slots, ghCalls });

  assert.equal(result.skipped, false, 'one valid file is enough to open a PR');
  const putCalls = ghCalls.filter((c) => c.startsWith('PUT '));
  assert.equal(putCalls.length, 1);
  const pullsCalls = ghCalls.filter((c) => c === 'POST /repos/org/repo/pulls');
  assert.equal(pullsCalls.length, 1);
});
