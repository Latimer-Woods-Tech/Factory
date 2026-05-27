/**
 * Rate limiting for qa-tools-worker using Cloudflare KV.
 *
 * Tracks concurrent runs per app to prevent overloading the browser-agent.
 * State is stored with a 2-minute TTL so counters auto-expire if a Worker
 * crashes mid-audit without decrementing.
 *
 * Limits (per architecture §6.5):
 *   Per-app concurrent runs: 3
 *   Per-user runs/hour: 20 (Phase 2+)
 */

import type { QaJwtClaims } from '../types.js';

const MAX_CONCURRENT_PER_APP = 3;
const TTL_SECONDS = 120; // 2-minute TTL — longer than max audit duration (90s)

// ---------------------------------------------------------------------------
// Concurrent run limiter
// ---------------------------------------------------------------------------

/**
 * Returns the current concurrent run count for an app.
 * Uses KV as a shared counter — approximate under heavy concurrency (acceptable).
 */
async function getConcurrentCount(kv: KVNamespace, appId: string): Promise<number> {
  const key = `rl:concurrent:${appId}`;
  const value = await kv.get(key);
  return value ? parseInt(value, 10) : 0;
}

/**
 * Checks and increments the concurrent run counter for an app.
 * Returns `{ allowed: true }` on success or `{ allowed: false, retryAfterMs }`.
 */
export async function acquireConcurrencySlot(
  kv: KVNamespace,
  appId: string,
): Promise<{ allowed: boolean; retryAfterMs?: number }> {
  const current = await getConcurrentCount(kv, appId);
  if (current >= MAX_CONCURRENT_PER_APP) {
    return { allowed: false, retryAfterMs: 30_000 };
  }

  const key = `rl:concurrent:${appId}`;
  await kv.put(key, String(current + 1), { expirationTtl: TTL_SECONDS });
  return { allowed: true };
}

/**
 * Decrements the concurrent run counter after a run completes or errors.
 * Safe to call even if the counter has already expired via TTL.
 */
export async function releaseConcurrencySlot(kv: KVNamespace, appId: string): Promise<void> {
  const current = await getConcurrentCount(kv, appId);
  if (current <= 1) {
    await kv.delete(`rl:concurrent:${appId}`);
  } else {
    await kv.put(`rl:concurrent:${appId}`, String(current - 1), { expirationTtl: TTL_SECONDS });
  }
}

// ---------------------------------------------------------------------------
// Rate limit headers helper
// ---------------------------------------------------------------------------

/**
 * Builds standard X-RateLimit-* headers to include in API responses.
 */
export async function buildRateLimitHeaders(
  kv: KVNamespace,
  appId: string,
  _claims: QaJwtClaims,
): Promise<Record<string, string>> {
  const concurrent = await getConcurrentCount(kv, appId);
  return {
    'X-RateLimit-App-Concurrent': `${String(concurrent)}/${String(MAX_CONCURRENT_PER_APP)}`,
    // Per-user hourly limit tracking comes in Phase 2
  };
}
