import { describe, it, expect } from 'vitest';
import {
  signRenderPayload,
  verifyRenderSignature,
  RENDER_HMAC_SECRET_NAME,
  RENDER_REPLAY_TOLERANCE_SECONDS,
} from './index.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const SECRET = 'super-secret-shared-hmac-key';
const RAW_BODY = JSON.stringify({
  videoObjectId: '11111111-1111-1111-1111-111111111111',
  userId: '22222222-2222-2222-2222-222222222222',
  callbackUrl: 'https://api.selfprime.net/api/internal/video/callback',
  spec: { sources: ['blueprint', 'transits'], format: 'full_film', segments: [] },
});

// A fixed clock so timestamp math is deterministic.
const NOW_MS = 1_700_000_000_000;
const NOW_SECONDS = Math.floor(NOW_MS / 1000).toString();

describe('render-contract constants', () => {
  it('exposes the documented secret name and replay tolerance', () => {
    expect(RENDER_HMAC_SECRET_NAME).toBe('VIDEO_RENDER_HMAC_SECRET');
    expect(RENDER_REPLAY_TOLERANCE_SECONDS).toBe(300);
  });
});

describe('signRenderPayload', () => {
  it('produces a hex signature and echoes the injected timestamp', async () => {
    const { signature, timestamp } = await signRenderPayload({
      rawBody: RAW_BODY,
      secret: SECRET,
      timestamp: NOW_SECONDS,
    });
    expect(timestamp).toBe(NOW_SECONDS);
    expect(signature).toMatch(/^[0-9a-f]{64}$/); // SHA-256 → 32 bytes → 64 hex chars
  });

  it('defaults the timestamp to now when omitted', async () => {
    const before = Math.floor(Date.now() / 1000);
    const { timestamp } = await signRenderPayload({ rawBody: RAW_BODY, secret: SECRET });
    const after = Math.floor(Date.now() / 1000);
    const ts = Number(timestamp);
    expect(ts).toBeGreaterThanOrEqual(before);
    expect(ts).toBeLessThanOrEqual(after);
  });

  it('binds the timestamp: same body + different timestamp → different signature', async () => {
    const a = await signRenderPayload({ rawBody: RAW_BODY, secret: SECRET, timestamp: '1700000000' });
    const b = await signRenderPayload({ rawBody: RAW_BODY, secret: SECRET, timestamp: '1700000001' });
    expect(a.signature).not.toBe(b.signature);
  });
});

describe('verifyRenderSignature', () => {
  async function sign(rawBody: string, timestamp: string) {
    return signRenderPayload({ rawBody, secret: SECRET, timestamp });
  }

  it('verifies a valid, fresh signature', async () => {
    const { signature, timestamp } = await sign(RAW_BODY, NOW_SECONDS);
    const res = await verifyRenderSignature({
      rawBody: RAW_BODY,
      signature,
      timestamp,
      secret: SECRET,
      nowMs: NOW_MS,
    });
    expect(res).toEqual({ valid: true });
  });

  it('rejects a tampered body as bad_signature', async () => {
    const { signature, timestamp } = await sign(RAW_BODY, NOW_SECONDS);
    const res = await verifyRenderSignature({
      rawBody: RAW_BODY + 'x', // body changed after signing
      signature,
      timestamp,
      secret: SECRET,
      nowMs: NOW_MS,
    });
    expect(res).toEqual({ valid: false, reason: 'bad_signature' });
  });

  it('rejects a tampered signature as bad_signature', async () => {
    const { signature, timestamp } = await sign(RAW_BODY, NOW_SECONDS);
    // Flip the last hex char while keeping the length valid.
    const last = signature.slice(-1);
    const flipped = signature.slice(0, -1) + (last === '0' ? '1' : '0');
    const res = await verifyRenderSignature({
      rawBody: RAW_BODY,
      signature: flipped,
      timestamp,
      secret: SECRET,
      nowMs: NOW_MS,
    });
    expect(res).toEqual({ valid: false, reason: 'bad_signature' });
  });

  it('rejects a wrong-length signature as bad_signature (constant-time length guard)', async () => {
    const { timestamp } = await sign(RAW_BODY, NOW_SECONDS);
    const res = await verifyRenderSignature({
      rawBody: RAW_BODY,
      signature: 'abcd', // valid hex but not 64 chars → length mismatch
      timestamp,
      secret: SECRET,
      nowMs: NOW_MS,
    });
    expect(res).toEqual({ valid: false, reason: 'bad_signature' });
  });

  it('rejects a signature made with a different secret', async () => {
    const { signature, timestamp } = await signRenderPayload({
      rawBody: RAW_BODY,
      secret: 'a-different-secret',
      timestamp: NOW_SECONDS,
    });
    const res = await verifyRenderSignature({
      rawBody: RAW_BODY,
      signature,
      timestamp,
      secret: SECRET,
      nowMs: NOW_MS,
    });
    expect(res).toEqual({ valid: false, reason: 'bad_signature' });
  });

  it('rejects a timestamp just outside tolerance as stale (future)', async () => {
    const futureTs = (Math.floor(NOW_MS / 1000) + RENDER_REPLAY_TOLERANCE_SECONDS + 1).toString();
    const { signature, timestamp } = await sign(RAW_BODY, futureTs);
    const res = await verifyRenderSignature({
      rawBody: RAW_BODY,
      signature,
      timestamp,
      secret: SECRET,
      nowMs: NOW_MS,
    });
    expect(res).toEqual({ valid: false, reason: 'stale' });
  });

  it('rejects a timestamp just outside tolerance as stale (past)', async () => {
    const pastTs = (Math.floor(NOW_MS / 1000) - RENDER_REPLAY_TOLERANCE_SECONDS - 1).toString();
    const { signature, timestamp } = await sign(RAW_BODY, pastTs);
    const res = await verifyRenderSignature({
      rawBody: RAW_BODY,
      signature,
      timestamp,
      secret: SECRET,
      nowMs: NOW_MS,
    });
    expect(res).toEqual({ valid: false, reason: 'stale' });
  });

  it('accepts a timestamp exactly at the tolerance boundary', async () => {
    const edgeTs = (Math.floor(NOW_MS / 1000) - RENDER_REPLAY_TOLERANCE_SECONDS).toString();
    const { signature, timestamp } = await sign(RAW_BODY, edgeTs);
    const res = await verifyRenderSignature({
      rawBody: RAW_BODY,
      signature,
      timestamp,
      secret: SECRET,
      nowMs: NOW_MS,
    });
    expect(res).toEqual({ valid: true });
  });

  it('treats a fresh-but-replayed payload (same body, within window) as valid — replay protection is the idempotency layer\'s job', async () => {
    const { signature, timestamp } = await sign(RAW_BODY, NOW_SECONDS);
    const first = await verifyRenderSignature({ rawBody: RAW_BODY, signature, timestamp, secret: SECRET, nowMs: NOW_MS });
    const replay = await verifyRenderSignature({ rawBody: RAW_BODY, signature, timestamp, secret: SECRET, nowMs: NOW_MS + 1000 });
    expect(first).toEqual({ valid: true });
    expect(replay).toEqual({ valid: true });
  });

  it('respects a custom toleranceSeconds', async () => {
    const ts = (Math.floor(NOW_MS / 1000) - 10).toString();
    const { signature, timestamp } = await sign(RAW_BODY, ts);
    const res = await verifyRenderSignature({
      rawBody: RAW_BODY,
      signature,
      timestamp,
      secret: SECRET,
      toleranceSeconds: 5, // 10s drift now exceeds tolerance
      nowMs: NOW_MS,
    });
    expect(res).toEqual({ valid: false, reason: 'stale' });
  });

  it.each([
    ['empty signature', { signature: '' }],
    ['empty timestamp', { timestamp: '' }],
    ['empty secret', { secret: '' }],
    ['non-numeric timestamp', { timestamp: 'not-a-number' }],
    ['float timestamp', { timestamp: '1700000000.5' }],
  ])('rejects %s as malformed', async (_label, override) => {
    const base = {
      rawBody: RAW_BODY,
      signature: 'deadbeef',
      timestamp: NOW_SECONDS,
      secret: SECRET,
      nowMs: NOW_MS,
    };
    const res = await verifyRenderSignature({ ...base, ...override });
    expect(res).toEqual({ valid: false, reason: 'malformed' });
  });
});
