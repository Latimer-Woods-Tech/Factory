import { describe, it, expect, vi } from 'vitest';
import type { Entitlement, EntitlementStore } from './index.js';
import { canAccess, getEntitlements } from './index.js';

function makeStore(entitlements: Entitlement[]): EntitlementStore {
  return { getForUser: vi.fn(() => Promise.resolve(entitlements)) };
}

describe('canAccess', () => {
  it('returns true for an active, non-expired entitlement', async () => {
    const store = makeStore([
      { id: 'feature:video', label: 'Video', enabled: true, expiresAt: null },
    ]);
    expect(await canAccess(store, 'user_1', 'feature:video')).toBe(true);
  });

  it('returns false when feature is not found', async () => {
    const store = makeStore([]);
    expect(await canAccess(store, 'user_1', 'feature:video')).toBe(false);
  });

  it('returns false when entitlement is disabled', async () => {
    const store = makeStore([
      { id: 'feature:video', label: 'Video', enabled: false, expiresAt: null },
    ]);
    expect(await canAccess(store, 'user_1', 'feature:video')).toBe(false);
  });

  it('returns false when entitlement has expired', async () => {
    const store = makeStore([
      { id: 'feature:video', label: 'Video', enabled: true, expiresAt: '2020-01-01T00:00:00Z' },
    ]);
    expect(await canAccess(store, 'user_1', 'feature:video')).toBe(false);
  });

  it('returns true for a future expiry', async () => {
    const store = makeStore([
      { id: 'feature:video', label: 'Video', enabled: true, expiresAt: '2099-01-01T00:00:00Z' },
    ]);
    expect(await canAccess(store, 'user_1', 'feature:video')).toBe(true);
  });
});

describe('getEntitlements', () => {
  it('returns only enabled, non-expired entitlements', async () => {
    const store = makeStore([
      { id: 'feature:video', label: 'Video', enabled: true, expiresAt: null },
      { id: 'feature:analytics', label: 'Analytics', enabled: false, expiresAt: null },
      { id: 'feature:legacy', label: 'Legacy', enabled: true, expiresAt: '2020-01-01T00:00:00Z' },
    ]);
    const result = await getEntitlements(store, 'user_1');
    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe('feature:video');
  });

  it('returns empty array when no entitlements exist', async () => {
    const store = makeStore([]);
    expect(await getEntitlements(store, 'user_1')).toEqual([]);
  });

  it('returns all enabled non-expired entitlements when multiple qualify', async () => {
    const store = makeStore([
      { id: 'feature:a', label: 'A', enabled: true, expiresAt: null },
      { id: 'feature:b', label: 'B', enabled: true, expiresAt: '2099-01-01T00:00:00Z' },
    ]);
    const result = await getEntitlements(store, 'user_1');
    expect(result).toHaveLength(2);
  });
});
