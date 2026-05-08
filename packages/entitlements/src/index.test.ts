import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  canAccess,
  getEntitlements,
  getAccessLevel,
  indexEntitlements,
  type Entitlement,
  type FeatureKey,
} from './index.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const USER_A = 'user_alpha';
const USER_B = 'user_beta';
const NOW = '2026-05-07T12:00:00.000Z';
const FUTURE = '2027-01-01T00:00:00.000Z';
const PAST = '2025-01-01T00:00:00.000Z';

function makeEntitlement(
  userId: string,
  feature: FeatureKey,
  level: Entitlement['level'],
  expiresAt?: string,
): Entitlement {
  return { userId, feature, level, expiresAt };
}

const baseEntitlements: Entitlement[] = [
  makeEntitlement(USER_A, 'video_upload', 'full'),
  makeEntitlement(USER_A, 'ai_copy', 'limited', FUTURE),
  makeEntitlement(USER_A, 'analytics_export', 'none'),
  makeEntitlement(USER_A, 'custom_domain', 'full', PAST), // expired
  makeEntitlement(USER_B, 'video_upload', 'limited'),
];

// ---------------------------------------------------------------------------
// indexEntitlements
// ---------------------------------------------------------------------------

describe('indexEntitlements', () => {
  it('returns a Map of active entitlements keyed by feature', () => {
    const index = indexEntitlements(
      baseEntitlements.filter((e) => e.userId === USER_A),
      NOW,
    );
    expect(index.size).toBe(3); // video_upload, ai_copy, analytics_export (custom_domain expired)
    expect(index.has('video_upload')).toBe(true);
    expect(index.has('ai_copy')).toBe(true);
    expect(index.has('analytics_export')).toBe(true);
  });

  it('excludes expired entitlements', () => {
    const index = indexEntitlements(
      baseEntitlements.filter((e) => e.userId === USER_A),
      NOW,
    );
    expect(index.has('custom_domain')).toBe(false);
  });

  it('returns an empty Map when all entitlements are expired', () => {
    const expired = [makeEntitlement(USER_A, 'api_access', 'full', PAST)];
    const index = indexEntitlements(expired, NOW);
    expect(index.size).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// canAccess
// ---------------------------------------------------------------------------

describe('canAccess', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(NOW));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns true for a full entitlement', () => {
    expect(canAccess(USER_A, 'video_upload', baseEntitlements)).toBe(true);
  });

  it('returns true for a limited entitlement', () => {
    expect(canAccess(USER_A, 'ai_copy', baseEntitlements)).toBe(true);
  });

  it('returns false for a "none" entitlement', () => {
    expect(canAccess(USER_A, 'analytics_export', baseEntitlements)).toBe(false);
  });

  it('returns false when the feature is not in the entitlements list', () => {
    expect(canAccess(USER_A, 'seo_audit', baseEntitlements)).toBe(false);
  });

  it('returns false for an expired full entitlement', () => {
    expect(canAccess(USER_A, 'custom_domain', baseEntitlements)).toBe(false);
  });

  it('returns false when the userId does not match', () => {
    // USER_B does not have video_upload as 'full', but USER_A does
    // passing USER_B with USER_A's entitlement record should fail the userId check
    const wrongUserEntitlements = [makeEntitlement(USER_A, 'video_upload', 'full')];
    expect(canAccess(USER_B, 'video_upload', wrongUserEntitlements)).toBe(false);
  });

  it('accepts a pre-built EntitlementIndex', () => {
    const index = indexEntitlements(
      baseEntitlements.filter((e) => e.userId === USER_A),
      NOW,
    );
    // Index does not have userId filtering in canAccess — pass matching userId
    const entry = index.get('video_upload');
    expect(entry?.userId).toBe(USER_A);
    expect(canAccess(USER_A, 'video_upload', index)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// getEntitlements
// ---------------------------------------------------------------------------

describe('getEntitlements', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(NOW));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns all active entitlements for a user', () => {
    const result = getEntitlements(USER_A, baseEntitlements);
    // video_upload (full), ai_copy (limited), analytics_export (none) — custom_domain expired
    expect(result).toHaveLength(3);
    expect(result.every((e) => e.userId === USER_A)).toBe(true);
  });

  it('does not return entitlements belonging to other users', () => {
    const result = getEntitlements(USER_A, baseEntitlements);
    expect(result.some((e) => e.userId === USER_B)).toBe(false);
  });

  it('excludes expired entitlements', () => {
    const result = getEntitlements(USER_A, baseEntitlements);
    expect(result.some((e) => e.feature === 'custom_domain')).toBe(false);
  });

  it('filters by level when filterLevel is provided', () => {
    const fullOnly = getEntitlements(USER_A, baseEntitlements, 'full');
    expect(fullOnly.every((e) => e.level === 'full')).toBe(true);
    expect(fullOnly.length).toBeGreaterThan(0);
  });

  it('returns empty array for unknown user', () => {
    const result = getEntitlements('user_unknown', baseEntitlements);
    expect(result).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// getAccessLevel
// ---------------------------------------------------------------------------

describe('getAccessLevel', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(NOW));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns "full" for a full entitlement', () => {
    expect(getAccessLevel(USER_A, 'video_upload', baseEntitlements)).toBe('full');
  });

  it('returns "limited" for a limited entitlement', () => {
    expect(getAccessLevel(USER_A, 'ai_copy', baseEntitlements)).toBe('limited');
  });

  it('returns "none" for a "none" entitlement', () => {
    expect(getAccessLevel(USER_A, 'analytics_export', baseEntitlements)).toBe('none');
  });

  it('returns "none" for a missing feature', () => {
    expect(getAccessLevel(USER_A, 'seo_audit', baseEntitlements)).toBe('none');
  });

  it('returns "none" for an expired entitlement', () => {
    expect(getAccessLevel(USER_A, 'custom_domain', baseEntitlements)).toBe('none');
  });
});
