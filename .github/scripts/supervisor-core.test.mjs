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
//   capricast#116, #81, #57, #56, #55, #54, #49, #47, #33
//
// We do not import supervisor-core.mjs (it executes main() at import time
// and reads env vars). Instead we exercise the same branching logic the
// fix relies on, using the same shape of `template` + `slots` inputs.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

function simulateMatchTemplate(issue, templates) {
  const { title, labels, body = '' } = issue;
  const scores = [];

  for (const tmpl of templates) {
    let score = 0;
    let matchedTitle = false;
    let matchedBody = false;

    if (tmpl.labels?.some((label) => labels.includes(label))) score += 0.5;

    if (tmpl.titlePattern && new RegExp(tmpl.titlePattern, 'i').test(title)) {
      score += 0.5;
      matchedTitle = true;
    }

    for (const pattern of tmpl.bodyPatterns ?? []) {
      const jsPattern = pattern.replace(/^\(\?[is]+\)/, '');
      if (new RegExp(jsPattern, 'is').test(body)) {
        score += 0.25;
        matchedBody = true;
        break;
      }
    }

    if (score >= 0.35 && (matchedTitle || matchedBody)) {
      scores.push({ tmpl, score });
    }
  }

  if (scores.length === 0) return null;
  scores.sort((a, b) => b.score - a.score);
  return scores[0].tmpl;
}

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

test('matchTemplate: label-only overlap does not match a governance template', () => {
  const templates = [
    {
      id: 'governance-hardening',
      labels: ['hardening'],
      titlePattern: '(governance|branch.protect|CLAUDE\\.md)',
      bodyPatterns: ['(branch.protect|AGENT_PROTOCOL|standing.orders)'],
    },
  ];

  const match = simulateMatchTemplate(
    {
      title: 'VK-R2-001: Migrate R2 buckets videoking-r2 → capricast-r2',
      labels: ['enhancement', 'hardening'],
      body: 'Copy objects between R2 buckets and swap wrangler bindings after parity verification.',
    },
    templates,
  );

  assert.equal(match, null);
});

// ─── feat-conversations-implementation match tests ───────────────────────────
//
// Asserts that the conversations template:
//   1. Matches the intended capricast Sprint 2 messaging issues (#74-#81, #116)
//      where both title evidence and body evidence agree.
//   2. Refuses unrelated capricast issues — specifically the call/live-broadcast
//      issues (#61-#66) which are covered by feat-call-room-implementation, and
//      governance/non-feature issues with overlapping labels.
//   3. Refuses issues where labels match but neither the title nor the body
//      mentions conversations/messaging (label-only-overlap regression — that's
//      the bug PR #815 just fixed).

function loadTemplate(id) {
  // We load the actual generated JSON so tests catch regressions in the
  // YAML → JSON pipeline, not just regressions in this test file.
  const url = new URL(
    `../../apps/supervisor/src/planner/templates.generated.json`,
    import.meta.url,
  );
  const file = readFileSync(url, 'utf8');
  const data = JSON.parse(file);
  const t = data.find((x) => x.id === id);
  if (!t) throw new Error(`template "${id}" not found in templates.generated.json`);
  // Reshape to the matchTemplate input shape (camelCase keys)
  return {
    id: t.id,
    labels: t.triggers?.labels_any_of ?? [],
    titlePattern: t.triggers?.title_pattern ?? '',
    bodyPatterns: t.triggers?.body_patterns ?? [],
  };
}

test('feat-conversations-implementation: matches capricast #77 (compose/edit/delete/reactions)', () => {
  const template = loadTemplate('feat-conversations-implementation');
  const match = simulateMatchTemplate(
    {
      title: 'Compose, edit (5min window), delete, reactions, typing, read receipts',
      labels: ['enhancement', 'sprint:2', 'supervisor:approved-source'],
      body: 'Compose box with shift+enter newline. Edit own message ≤5 min after send (shows edited badge). Soft-delete (shows `[deleted]`). Reactions (long-press / hover popover). Read receipts via `last_read_at` updated on scroll-to-bottom. Acceptance: All five behaviors work, persist across reload, broadcast to other members within 1s.',
    },
    [template],
  );
  assert.ok(match, 'expected feat-conversations-implementation to match capricast #77');
  assert.equal(match.id, 'feat-conversations-implementation');
});

test('feat-conversations-implementation: matches capricast #78 (R2 attachments)', () => {
  const template = loadTemplate('feat-conversations-implementation');
  const match = simulateMatchTemplate(
    {
      title: 'Attachments via R2 (image, video, audio, file)',
      labels: ['enhancement', 'sprint:2', 'supervisor:approved-source'],
      body: '`POST /api/conversations/:id/upload-url` returns presigned R2 PUT URL. Client uploads directly. `message_attachments` rows created on send. Inline render for image/video/audio; file shows download chip.',
    },
    [template],
  );
  assert.ok(match, 'expected feat-conversations-implementation to match capricast #78');
  assert.equal(match.id, 'feat-conversations-implementation');
});

test('feat-conversations-implementation: matches capricast #75 (schema migration)', () => {
  const template = loadTemplate('feat-conversations-implementation');
  const match = simulateMatchTemplate(
    {
      title: 'Schema migration: conversations, conversation_members, messages, message_attachments',
      labels: ['enhancement', 'sprint:2'],
      body: 'Migration `0017_conversations.sql`. Tables: `conversations(id, type, title, created_at, last_message_at)`, `conversation_members(conversation_id, user_id, role, joined_at, last_read_at, muted)`, `messages(id, conversation_id, sender_id, body, kind, deleted_at, edited_at, created_at)`.',
    },
    [template],
  );
  assert.ok(match, 'expected feat-conversations-implementation to match capricast #75');
});

test('feat-conversations-implementation: REFUSES capricast #63 (DirectCallRoom DO — wrong template)', () => {
  const template = loadTemplate('feat-conversations-implementation');
  const match = simulateMatchTemplate(
    {
      title: 'DirectCallRoom DO + 1:1 video-call endpoints',
      labels: ['enhancement', 'sprint:2', 'supervisor:approved-source'],
      body: 'New Durable Object `DirectCallRoom` (simpler than ConferenceRoom — exactly 2 participants). Reuse the WHIP/WHEP routes from PR #23. Endpoints: `POST /calls/initiate {to_user_id}`, `POST /calls/accept`, `POST /calls/decline`, `POST /calls/hangup`.',
    },
    [template],
  );
  assert.equal(match, null, 'feat-conversations-implementation must NOT match call-room issues');
});

test('feat-conversations-implementation: REFUSES label-only overlap (no title/body evidence)', () => {
  const template = loadTemplate('feat-conversations-implementation');
  // Labels match (`enhancement`, `sprint:2`) but neither title nor body
  // mention conversations/messaging — this is the regression PR #815 fixed.
  const match = simulateMatchTemplate(
    {
      title: 'Bump @sentry/cloudflare to 8.45.0',
      labels: ['enhancement', 'sprint:2', 'dependencies'],
      body: 'Routine dependency bump for the Sentry SDK. Patch release notes attached. No behavior change expected.',
    },
    [template],
  );
  assert.equal(match, null, 'label-only matches must be rejected — title/body evidence required');
});

// ─── feat-call-room-implementation match tests ───────────────────────────────
//
// Asserts that the call-room template:
//   1. Matches the intended capricast Sprint 2 call/live-broadcast issues
//      (#61-#66) where both title evidence and body evidence agree.
//   2. Refuses the conversation/messaging issues (#74-#81, #116) covered by
//      feat-conversations-implementation.
//   3. Refuses label-only overlap.

test('feat-call-room-implementation: matches capricast #63 (DirectCallRoom DO)', () => {
  const template = loadTemplate('feat-call-room-implementation');
  const match = simulateMatchTemplate(
    {
      title: 'DirectCallRoom DO + 1:1 video-call endpoints',
      labels: ['enhancement', 'sprint:2', 'supervisor:approved-source'],
      body: 'New Durable Object `DirectCallRoom` (simpler than ConferenceRoom — exactly 2 participants). Reuse the WHIP/WHEP routes from PR #23. Endpoints: `POST /calls/initiate {to_user_id}`, `POST /calls/accept`, `POST /calls/decline`, `POST /calls/hangup`. Push notification on call-incoming.',
    },
    [template],
  );
  assert.ok(match, 'expected feat-call-room-implementation to match capricast #63');
  assert.equal(match.id, 'feat-call-room-implementation');
});

test('feat-call-room-implementation: matches capricast #65 (Cloudflare Stream Live Inputs)', () => {
  const template = loadTemplate('feat-call-room-implementation');
  const match = simulateMatchTemplate(
    {
      title: 'Cloudflare Stream Live Inputs — creator Go Live flow',
      labels: ['enhancement', 'sprint:2', 'supervisor:approved-source'],
      body: 'Backend creates a Stream Live Input on `POST /live/start`, returns RTMPS URL+key (for OBS path) and a WHIP URL (for in-app path). On `live_input.connected` webhook, mark broadcast active and notify followers.',
    },
    [template],
  );
  assert.ok(match, 'expected feat-call-room-implementation to match capricast #65');
  assert.equal(match.id, 'feat-call-room-implementation');
});

test('feat-call-room-implementation: matches capricast #66 (LiveBroadcastRoom DO)', () => {
  const template = loadTemplate('feat-call-room-implementation');
  const match = simulateMatchTemplate(
    {
      title: 'Live broadcast viewer page + LiveBroadcastRoom DO chat',
      labels: ['enhancement', 'sprint:2'],
      body: '`/live/:slug` viewer page: HLS playback via the existing Stream player, chat panel powered by new `LiveBroadcastRoom` DO (mirrors `VideoRoom` shape but tuned for higher concurrent fanout — DO hibernation already supports thousands of WS sessions).',
    },
    [template],
  );
  assert.ok(match, 'expected feat-call-room-implementation to match capricast #66');
});

test('feat-call-room-implementation: REFUSES capricast #77 (conversations — wrong template)', () => {
  const template = loadTemplate('feat-call-room-implementation');
  const match = simulateMatchTemplate(
    {
      title: 'Compose, edit (5min window), delete, reactions, typing, read receipts',
      labels: ['enhancement', 'sprint:2', 'supervisor:approved-source'],
      body: 'Compose box with shift+enter newline. Edit own message ≤5 min after send. Read receipts via `last_read_at` updated on scroll-to-bottom.',
    },
    [template],
  );
  assert.equal(match, null, 'feat-call-room-implementation must NOT match conversations issues');
});

test('feat-call-room-implementation: REFUSES label-only overlap (no title/body evidence)', () => {
  const template = loadTemplate('feat-call-room-implementation');
  const match = simulateMatchTemplate(
    {
      title: 'Add weekly README freshness check workflow',
      labels: ['enhancement', 'sprint:2', 'hardening'],
      body: 'Adds a GitHub Actions cron job that lints README.md and fails if the last-updated stamp is older than 30 days.',
    },
    [template],
  );
  assert.equal(match, null, 'label-only matches must be rejected — title/body evidence required');
});
