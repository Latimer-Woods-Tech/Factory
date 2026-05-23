/**
 * Deterministic content hash for capability handoff packages.
 *
 * The hash is the SHA-256 hex digest of a canonical JSON serialization where
 * every object key is sorted lexicographically. This makes two structurally
 * identical handoffs hash to the same value regardless of property insertion
 * order, which is the whole point of a content-addressable artifact.
 *
 * Workers expose Web Crypto via the global `crypto` object — no Node polyfill
 * needed.
 */

export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

function canonicalize(value: unknown): unknown {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(canonicalize);
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  const out: Record<string, unknown> = {};
  for (const [k, v] of entries) out[k] = canonicalize(v);
  return out;
}

export async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function hashHandoffBody(body: unknown): Promise<string> {
  return sha256Hex(canonicalJson(body));
}
