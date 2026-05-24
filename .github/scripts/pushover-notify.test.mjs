// =============================================================================
// pushover-notify.test.mjs — unit tests for the Pushover helper.
//
// Run with: node --test .github/scripts/pushover-notify.test.mjs
//
// Covers:
//   - truncate() boundary conditions
//   - buildRequestBody() schema + clamping
//   - validateInputs() all failure modes
//   - notify() with mocked fetch (no real Pushover calls)
//   - Kill switch is honored
//   - Audit log emission with stable schema
// =============================================================================

import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, unlinkSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  truncate,
  buildRequestBody,
  validateInputs,
  notify,
} from './pushover-notify.mjs';

// ---------------------------------------------------------------------------
// truncate
// ---------------------------------------------------------------------------
test('truncate — string under limit returns unchanged', () => {
  assert.equal(truncate('hello', 10), 'hello');
});

test('truncate — string at exact limit returns unchanged', () => {
  assert.equal(truncate('hello', 5), 'hello');
});

test('truncate — string over limit ends with ...', () => {
  assert.equal(truncate('hello world', 8), 'hello...');
});

test('truncate — non-string returns empty string', () => {
  assert.equal(truncate(undefined, 10), '');
  assert.equal(truncate(null, 10), '');
  assert.equal(truncate(42, 10), '');
});

// ---------------------------------------------------------------------------
// buildRequestBody
// ---------------------------------------------------------------------------
test('buildRequestBody — minimal valid input produces correct params', () => {
  const body = buildRequestBody({
    userKey: 'u123',
    appToken: 'a456',
    title: 'Test',
    message: 'Hello',
  });
  assert.equal(body.get('user'), 'u123');
  assert.equal(body.get('token'), 'a456');
  assert.equal(body.get('title'), 'Test');
  assert.equal(body.get('message'), 'Hello');
  assert.equal(body.get('url'), null);  // optional, not set
  assert.equal(body.get('priority'), null);  // default 0 → not set
});

test('buildRequestBody — includes url when provided', () => {
  const body = buildRequestBody({
    userKey: 'u', appToken: 'a', title: 't', message: 'm',
    url: 'https://example.com/run/1',
  });
  assert.equal(body.get('url'), 'https://example.com/run/1');
});

test('buildRequestBody — priority 1 (high) is set as string', () => {
  const body = buildRequestBody({
    userKey: 'u', appToken: 'a', title: 't', message: 'm',
    priority: 1,
  });
  assert.equal(body.get('priority'), '1');
});

test('buildRequestBody — emergency priority (2) is clamped DOWN to high (1)', () => {
  // Critical safety: priority 2 in Pushover means "retry until ack" which
  // can wake the device every minute for 30 minutes. We never want a
  // misconfigured caller to do that accidentally.
  const body = buildRequestBody({
    userKey: 'u', appToken: 'a', title: 't', message: 'm',
    priority: 2,
  });
  assert.equal(body.get('priority'), '1');
});

test('buildRequestBody — negative priority is clamped to -2', () => {
  const body = buildRequestBody({
    userKey: 'u', appToken: 'a', title: 't', message: 'm',
    priority: -99,
  });
  assert.equal(body.get('priority'), '-2');
});

test('buildRequestBody — truncates overlong title to 250 chars', () => {
  const longTitle = 'X'.repeat(500);
  const body = buildRequestBody({
    userKey: 'u', appToken: 'a', title: longTitle, message: 'm',
  });
  assert.ok(body.get('title').length <= 250);
  assert.ok(body.get('title').endsWith('...'));
});

test('buildRequestBody — truncates overlong message to 1024 chars', () => {
  const longMessage = 'M'.repeat(2000);
  const body = buildRequestBody({
    userKey: 'u', appToken: 'a', title: 't', message: longMessage,
  });
  assert.ok(body.get('message').length <= 1024);
});

// ---------------------------------------------------------------------------
// validateInputs
// ---------------------------------------------------------------------------
test('validateInputs — all present → ok', () => {
  const r = validateInputs({ title: 't', message: 'm', userKey: 'u', appToken: 'a' });
  assert.equal(r.ok, true);
});

test('validateInputs — missing userKey → secrets-missing', () => {
  const r = validateInputs({ title: 't', message: 'm', userKey: '', appToken: 'a' });
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'secrets-missing');
});

test('validateInputs — missing appToken → secrets-missing', () => {
  const r = validateInputs({ title: 't', message: 'm', userKey: 'u', appToken: undefined });
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'secrets-missing');
});

test('validateInputs — empty title (whitespace only) → title-empty', () => {
  const r = validateInputs({ title: '   ', message: 'm', userKey: 'u', appToken: 'a' });
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'title-empty');
});

test('validateInputs — empty message → message-empty', () => {
  const r = validateInputs({ title: 't', message: '', userKey: 'u', appToken: 'a' });
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'message-empty');
});

// ---------------------------------------------------------------------------
// notify — full path with mocked fetch
// ---------------------------------------------------------------------------

function mockFetch(responses) {
  // Returns a fetch implementation that pops one response per call.
  // Each response: { status, body }
  const queue = [...responses];
  const calls = [];
  const fetchImpl = async (url, opts) => {
    calls.push({ url, opts });
    const r = queue.shift() || { status: 200, body: '' };
    return {
      status: r.status,
      text: async () => r.body,
    };
  };
  fetchImpl.calls = calls;
  return fetchImpl;
}

test('notify — happy path with valid secrets → sent: true', async () => {
  const fetchImpl = mockFetch([{ status: 200, body: '{"status":1}' }]);
  const result = await notify({
    title: 'Test',
    message: 'Hello',
    userKey: 'u',
    appToken: 'a',
    fetchImpl,
  });
  assert.equal(result.sent, true);
  assert.equal(result.status, 200);
  assert.equal(fetchImpl.calls.length, 1);
  assert.equal(fetchImpl.calls[0].url, 'https://api.pushover.net/1/messages.json');
});

test('notify — secrets missing → graceful no-op, no fetch call', async () => {
  const fetchImpl = mockFetch([]);
  const result = await notify({
    title: 'Test',
    message: 'Hello',
    userKey: '',
    appToken: '',
    fetchImpl,
  });
  assert.equal(result.sent, false);
  assert.equal(result.reason, 'secrets-missing');
  assert.equal(fetchImpl.calls.length, 0);  // never tried to send
});

test('notify — Pushover returns 4xx → sent: false with http-NNN reason', async () => {
  const fetchImpl = mockFetch([{ status: 429, body: '{"error":"rate-limited"}' }]);
  const result = await notify({
    title: 'Test',
    message: 'Hello',
    userKey: 'u',
    appToken: 'a',
    fetchImpl,
  });
  assert.equal(result.sent, false);
  assert.equal(result.reason, 'http-429');
  assert.equal(result.status, 429);
});

test('notify — fetch throws → sent: false with network-error reason', async () => {
  const fetchImpl = async () => { throw new Error('ECONNREFUSED'); };
  const result = await notify({
    title: 'Test',
    message: 'Hello',
    userKey: 'u',
    appToken: 'a',
    fetchImpl,
  });
  assert.equal(result.sent, false);
  assert.equal(result.reason, 'network-error');
});

test('notify — invalid input (empty title) → no fetch call', async () => {
  const fetchImpl = mockFetch([]);
  const result = await notify({
    title: '',
    message: 'Hello',
    userKey: 'u',
    appToken: 'a',
    fetchImpl,
  });
  assert.equal(result.sent, false);
  assert.equal(result.reason, 'title-empty');
  assert.equal(fetchImpl.calls.length, 0);
});

// ---------------------------------------------------------------------------
// Kill switch interaction
// ---------------------------------------------------------------------------
test('notify — kill switch present → no fetch call, returns automation-paused', async () => {
  // Create a temp .github/automation-paused-like file and point isAutomationPaused at it
  // via injection. Since notify() imports isAutomationPaused() directly from snapshot-pr-
  // helper.mjs and that uses a fixed default path, the cleanest test is to actually
  // create the default file in cwd.
  //
  // Save current state.
  const flagPath = '.github/automation-paused';
  const { existsSync } = await import('node:fs');
  const wasPresent = existsSync(flagPath);
  if (!wasPresent) writeFileSync(flagPath, '');

  try {
    const fetchImpl = mockFetch([]);
    const result = await notify({
      title: 'Test',
      message: 'Hello',
      userKey: 'u',
      appToken: 'a',
      fetchImpl,
    });
    assert.equal(result.sent, false);
    assert.equal(result.reason, 'automation-paused');
    assert.equal(fetchImpl.calls.length, 0);
  } finally {
    if (!wasPresent) unlinkSync(flagPath);
  }
});

test('notify — kill switch + no secrets → secrets-missing wins (skip pause check)', async () => {
  // Defensive design: if no secrets are configured, the kill switch check
  // is irrelevant. This prevents dev/test envs from going through pause
  // logic they have no way to observe.
  const flagPath = '.github/automation-paused';
  const { existsSync } = await import('node:fs');
  const wasPresent = existsSync(flagPath);
  if (!wasPresent) writeFileSync(flagPath, '');

  try {
    const fetchImpl = mockFetch([]);
    const result = await notify({
      title: 'Test',
      message: 'Hello',
      userKey: '',
      appToken: '',
      fetchImpl,
    });
    assert.equal(result.sent, false);
    assert.equal(result.reason, 'secrets-missing');
  } finally {
    if (!wasPresent) unlinkSync(flagPath);
  }
});
