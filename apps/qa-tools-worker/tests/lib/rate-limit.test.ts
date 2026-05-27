/**
 * Unit tests for lib/rate-limit.ts
 *
 * Uses an in-memory KV stub — no real Cloudflare KV binding required.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  acquireConcurrencySlot,
  releaseConcurrencySlot,
  buildRateLimitHeaders,
} from '../../src/lib/rate-limit.js';
import type { QaJwtClaims } from '../../src/types.js';

// ---------------------------------------------------------------------------
// KV stub factory
// ---------------------------------------------------------------------------

/**
 * Creates a minimal KVNamespace stub whose get/put/delete track state
 * internally using a simple Map.
 */
function makeKv(initial: Record<string, string> = {}) {
  const store = new Map<string, string>(Object.entries(initial));
  return {
    get: vi.fn(async (key: string) => store.get(key) ?? null),
    put: vi.fn(async (key: string, value: string) => { store.set(key, value); }),
    delete: vi.fn(async (key: string) => { store.delete(key); }),
  };
}

// ---------------------------------------------------------------------------
// acquireConcurrencySlot
// ---------------------------------------------------------------------------

describe('acquireConcurrencySlot', () => {
  it('allows first slot when counter is absent (0)', async () => {
    const kv = makeKv();
    const result = await acquireConcurrencySlot(kv as unknown as KVNamespace, 'capricast');
    expect(result.allowed).toBe(true);
    expect(kv.put).toHaveBeenCalledWith(
      'rl:concurrent:capricast',
      '1',
      { expirationTtl: 120 },
    );
  });

  it('allows slot when counter is 1 (below max)', async () => {
    const kv = makeKv({ 'rl:concurrent:selfprime': '1' });
    const result = await acquireConcurrencySlot(kv as unknown as KVNamespace, 'selfprime');
    expect(result.allowed).toBe(true);
    expect(kv.put).toHaveBeenCalledWith('rl:concurrent:selfprime', '2', { expirationTtl: 120 });
  });

  it('allows slot when counter is 2 (one below max)', async () => {
    const kv = makeKv({ 'rl:concurrent:capricast': '2' });
    const result = await acquireConcurrencySlot(kv as unknown as KVNamespace, 'capricast');
    expect(result.allowed).toBe(true);
    expect(kv.put).toHaveBeenCalledWith('rl:concurrent:capricast', '3', { expirationTtl: 120 });
  });

  it('blocks slot when counter is at max (3)', async () => {
    const kv = makeKv({ 'rl:concurrent:capricast': '3' });
    const result = await acquireConcurrencySlot(kv as unknown as KVNamespace, 'capricast');
    expect(result.allowed).toBe(false);
    expect(result.retryAfterMs).toBe(30_000);
    expect(kv.put).not.toHaveBeenCalled();
  });

  it('blocks slot when counter exceeds max (4)', async () => {
    const kv = makeKv({ 'rl:concurrent:xicocity': '4' });
    const result = await acquireConcurrencySlot(kv as unknown as KVNamespace, 'xicocity');
    expect(result.allowed).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// releaseConcurrencySlot
// ---------------------------------------------------------------------------

describe('releaseConcurrencySlot', () => {
  it('deletes the key when counter is 1 (last slot)', async () => {
    const kv = makeKv({ 'rl:concurrent:capricast': '1' });
    await releaseConcurrencySlot(kv as unknown as KVNamespace, 'capricast');
    expect(kv.delete).toHaveBeenCalledWith('rl:concurrent:capricast');
    expect(kv.put).not.toHaveBeenCalled();
  });

  it('decrements counter when count is 2', async () => {
    const kv = makeKv({ 'rl:concurrent:selfprime': '2' });
    await releaseConcurrencySlot(kv as unknown as KVNamespace, 'selfprime');
    expect(kv.put).toHaveBeenCalledWith('rl:concurrent:selfprime', '1', { expirationTtl: 120 });
    expect(kv.delete).not.toHaveBeenCalled();
  });

  it('decrements counter when count is 3', async () => {
    const kv = makeKv({ 'rl:concurrent:capricast': '3' });
    await releaseConcurrencySlot(kv as unknown as KVNamespace, 'capricast');
    expect(kv.put).toHaveBeenCalledWith('rl:concurrent:capricast', '2', { expirationTtl: 120 });
  });

  it('deletes key when counter is absent (already expired via TTL)', async () => {
    const kv = makeKv(); // empty — counter expired
    await releaseConcurrencySlot(kv as unknown as KVNamespace, 'capricast');
    // count=0 → delete is called (current <= 1)
    expect(kv.delete).toHaveBeenCalledWith('rl:concurrent:capricast');
  });
});

// ---------------------------------------------------------------------------
// buildRateLimitHeaders
// ---------------------------------------------------------------------------

describe('buildRateLimitHeaders', () => {
  const claims: QaJwtClaims = {
    sub: 'user-1',
    role: 'qa_runner',
    app_ids: ['capricast'],
    exp: Math.floor(Date.now() / 1000) + 3600,
  };

  it('returns X-RateLimit-App-Concurrent header with current/max format', async () => {
    const kv = makeKv({ 'rl:concurrent:capricast': '2' });
    const headers = await buildRateLimitHeaders(kv as unknown as KVNamespace, 'capricast', claims);
    expect(headers['X-RateLimit-App-Concurrent']).toBe('2/3');
  });

  it('returns 0/3 when no concurrent runs', async () => {
    const kv = makeKv(); // empty
    const headers = await buildRateLimitHeaders(kv as unknown as KVNamespace, 'capricast', claims);
    expect(headers['X-RateLimit-App-Concurrent']).toBe('0/3');
  });

  it('works for any app ID', async () => {
    const kv = makeKv({ 'rl:concurrent:selfprime': '1' });
    const headers = await buildRateLimitHeaders(kv as unknown as KVNamespace, 'selfprime', claims);
    expect(headers['X-RateLimit-App-Concurrent']).toBe('1/3');
  });
});
