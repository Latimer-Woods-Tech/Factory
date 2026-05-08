/**
 * @latimer-woods-tech/entitlements
 *
 * Feature flag and entitlement check helpers for Factory applications.
 *
 * Provides typed helpers to query which features a user can access, backed
 * by a KV or D1 data source supplied by the caller (this package is
 * data-source agnostic — it defines the types and pure business logic only).
 *
 * Designed for Cloudflare Workers — no Node.js built-ins, no Buffer.
 *
 * @example
 * ```ts
 * import { canAccess, getEntitlements } from '@latimer-woods-tech/entitlements';
 *
 * const allowed = canAccess(userId, 'video_upload', entitlements);
 * const all = getEntitlements(userId, entitlements);
 * ```
 */

// ============================================================================
// TYPES
// ============================================================================

/**
 * The set of recognised feature identifiers within the Factory platform.
 * Extend this union as new features are gated.
 */
export type FeatureKey =
  | 'video_upload'
  | 'ai_copy'
  | 'analytics_export'
  | 'custom_domain'
  | 'seo_audit'
  | 'advanced_scheduling'
  | 'team_collaboration'
  | 'api_access';

/**
 * Access level for a given feature.
 * - `'full'` — unrestricted access.
 * - `'limited'` — access with quotas or reduced functionality.
 * - `'none'` — feature is not accessible.
 */
export type AccessLevel = 'full' | 'limited' | 'none';

/**
 * A single entitlement record describing a user's access to one feature.
 */
export interface Entitlement {
  /** The user this entitlement belongs to. */
  userId: string;
  /** The feature this entitlement governs. */
  feature: FeatureKey;
  /** Effective access level. */
  level: AccessLevel;
  /**
   * Optional numeric quota (e.g. max uploads per month).
   * Only meaningful when `level` is `'limited'`.
   */
  quota?: number;
  /** Optional ISO-8601 expiry datetime. `undefined` means no expiry. */
  expiresAt?: string;
}

/**
 * A map of feature keys to their entitlements — used as an efficient lookup
 * index. Constructed from an array of {@link Entitlement} records via
 * {@link indexEntitlements}.
 */
export type EntitlementIndex = Map<FeatureKey, Entitlement>;

// ============================================================================
// UTILITIES
// ============================================================================

/**
 * Builds an {@link EntitlementIndex} from a flat array of {@link Entitlement}
 * records for a single user.
 *
 * Filters out expired records (compares against `now` if provided, otherwise
 * uses the current wall-clock time).
 *
 * @param entitlements - Array of entitlement records for a single user.
 * @param now - Optional ISO-8601 datetime to use as "now" (useful in tests).
 * @returns A {@link EntitlementIndex} keyed by feature.
 */
export function indexEntitlements(
  entitlements: Entitlement[],
  now: string = new Date().toISOString(),
): EntitlementIndex {
  const index: EntitlementIndex = new Map();
  for (const e of entitlements) {
    if (e.expiresAt !== undefined && e.expiresAt <= now) {
      // Expired — skip
      continue;
    }
    index.set(e.feature, e);
  }
  return index;
}

// ============================================================================
// CORE ENTITLEMENT FUNCTIONS
// ============================================================================

/**
 * Checks whether a user can access a given feature.
 *
 * Returns `true` if the user has a `'full'` or `'limited'` entitlement for
 * the feature; returns `false` for `'none'` or if no entitlement exists.
 *
 * @param userId - The user ID to check.
 * @param feature - The feature key to check.
 * @param entitlements - The user's entitlements (array or pre-built index).
 * @returns `true` if the user can access the feature, `false` otherwise.
 *
 * @example
 * ```ts
 * const allowed = canAccess('user_abc', 'video_upload', userEntitlements);
 * if (!allowed) return c.json({ error: 'Upgrade required' }, 403);
 * ```
 */
export function canAccess(
  userId: string,
  feature: FeatureKey,
  entitlements: Entitlement[] | EntitlementIndex,
): boolean {
  const index: EntitlementIndex =
    entitlements instanceof Map
      ? entitlements
      : indexEntitlements(entitlements.filter((e) => e.userId === userId));

  const entitlement = index.get(feature);
  if (entitlement === undefined) return false;
  if (entitlement.userId !== userId) return false;
  return entitlement.level === 'full' || entitlement.level === 'limited';
}

/**
 * Returns all active entitlements for a given user, optionally filtered by
 * access level.
 *
 * @param userId - The user ID to retrieve entitlements for.
 * @param entitlements - The full pool of entitlements to search.
 * @param filterLevel - If provided, only returns entitlements at this level.
 * @returns An array of {@link Entitlement} records that belong to `userId`.
 *
 * @example
 * ```ts
 * const all = getEntitlements('user_abc', allEntitlements);
 * const fullOnly = getEntitlements('user_abc', allEntitlements, 'full');
 * ```
 */
export function getEntitlements(
  userId: string,
  entitlements: Entitlement[],
  filterLevel?: AccessLevel,
): Entitlement[] {
  const now = new Date().toISOString();
  return entitlements.filter((e) => {
    if (e.userId !== userId) return false;
    if (e.expiresAt !== undefined && e.expiresAt <= now) return false;
    if (filterLevel !== undefined && e.level !== filterLevel) return false;
    return true;
  });
}

/**
 * Returns the effective access level for a user on a specific feature.
 *
 * Returns `'none'` if no matching entitlement is found.
 *
 * @param userId - The user ID to check.
 * @param feature - The feature to look up.
 * @param entitlements - The user's entitlements.
 * @returns The {@link AccessLevel} for this user/feature pair.
 */
export function getAccessLevel(
  userId: string,
  feature: FeatureKey,
  entitlements: Entitlement[],
): AccessLevel {
  const now = new Date().toISOString();
  const match = entitlements.find(
    (e) =>
      e.userId === userId &&
      e.feature === feature &&
      (e.expiresAt === undefined || e.expiresAt > now),
  );
  return match?.level ?? 'none';
}
