// supervisor-replan-loop.test.mjs
// Unit tests for the PR-1/PR-2/PR-4 guards added to supervisor-core.mjs.
// Mirrors the simulate-the-logic style of supervisor-core.test.mjs — we do
// not import supervisor-core (it runs main() at import time).

import { test } from 'node:test';
import assert from 'node:assert/strict';

const PLAN_COMMENT_MARKER = '🤖 Supervisor plan';
const STALE_RELEASE_MARKER = 'Supervisor: releasing stale agent claim';
const REPLAN_COOLDOWN_HOURS = 24;
const STALE_RELEASE_COOLDOWN_MINUTES = 60;

function findRecentBotComment(comments, minutesBack, marker, now = Date.now()) {
  const cutoff = now - minutesBack * 60 * 1000;
  return comments.find((c) =>
    (c.user?.type === 'Bot' || (c.user?.login || '').endsWith('[bot]')) &&
    typeof c.body === 'string' &&
    c.body.includes(marker) &&
    new Date(c.created_at).getTime() >= cutoff
  ) || null;
}

test('PR-1: detects bot-posted supervisor plan within 24h', () => {
  const now = Date.now();
  const comments = [
    { user: { type: 'Bot', login: 'factory-cross-repo[bot]' },
      body: '🤖 Supervisor plan for **issue title**\n…',
      created_at: new Date(now - 3 * 60 * 60 * 1000).toISOString() },
  ];
  const hit = findRecentBotComment(comments, REPLAN_COOLDOWN_HOURS * 60, PLAN_COMMENT_MARKER, now);
  assert.ok(hit, 'expected a recent plan comment to be found');
});

test('PR-1: ignores bot plan comments older than 24h', () => {
  const now = Date.now();
  const comments = [
    { user: { type: 'Bot', login: 'factory-cross-repo[bot]' },
      body: '🤖 Supervisor plan for **issue title**',
      created_at: new Date(now - 48 * 60 * 60 * 1000).toISOString() },
  ];
  const hit = findRecentBotComment(comments, REPLAN_COOLDOWN_HOURS * 60, PLAN_COMMENT_MARKER, now);
  assert.equal(hit, null);
});

test('PR-1: ignores human-authored comments quoting the plan marker', () => {
  const now = Date.now();
  const comments = [
    { user: { type: 'User', login: 'adrper79-dot' },
      body: 'Reviewed the 🤖 Supervisor plan — looks fine',
      created_at: new Date(now - 1 * 60 * 60 * 1000).toISOString() },
  ];
  const hit = findRecentBotComment(comments, REPLAN_COOLDOWN_HOURS * 60, PLAN_COMMENT_MARKER, now);
  assert.equal(hit, null);
});

test('PR-2: detects stale-release comment within cooldown window', () => {
  const now = Date.now();
  const comments = [
    { user: { type: 'Bot', login: 'factory-cross-repo[bot]' },
      body: '🔄 Supervisor: releasing stale agent claim (agent:claimed:supervisor) — no activity…',
      created_at: new Date(now - 5 * 60 * 1000).toISOString() },
  ];
  const hit = findRecentBotComment(comments, STALE_RELEASE_COOLDOWN_MINUTES, STALE_RELEASE_MARKER, now);
  assert.ok(hit, 'expected the recent stale-release comment to be found');
});

test('PR-2: stale-release older than cooldown window does not block re-claim', () => {
  const now = Date.now();
  const comments = [
    { user: { type: 'Bot', login: 'factory-cross-repo[bot]' },
      body: '🔄 Supervisor: releasing stale agent claim — …',
      created_at: new Date(now - 120 * 60 * 1000).toISOString() },
  ];
  const hit = findRecentBotComment(comments, STALE_RELEASE_COOLDOWN_MINUTES, STALE_RELEASE_MARKER, now);
  assert.equal(hit, null);
});
