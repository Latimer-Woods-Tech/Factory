/**
 * @latimer-woods-tech/entitlements
 * Feature entitlement checks for Factory applications.
 * Provides typed helpers for KV- or D1-backed entitlement lookups.
 */

/** A single entitlement record. */
export interface Entitlement {
  /** Unique entitlement identifier, e.g. "feature:video-upload". */
  id: string;
  /** Human-readable label. */
  label: string;
  /** Whether the entitlement is currently active. */
  enabled: boolean;
  /** Optional expiry in ISO-8601 format. Null means never expires. */
  expiresAt: string | null;
}

/** Minimal interface for an entitlement store (KV namespace or D1 wrapper). */
export interface EntitlementStore {
  /** Retrieve all entitlements for a user. Returns empty array if none found. */
  getForUser(userId: string): Promise<Entitlement[]>;
}

/**
 * Returns true if the given user has the specified feature enabled and
 * the entitlement has not expired.
 */
export async function canAccess(
  store: EntitlementStore,
  userId: string,
  featureId: string,
): Promise<boolean> {
  const entitlements = await store.getForUser(userId);
  const found = entitlements.find((e) => e.id === featureId);
  if (!found || !found.enabled) return false;
  if (found.expiresAt !== null && new Date(found.expiresAt) < new Date()) return false;
  return true;
}

/**
 * Returns all active (enabled and non-expired) entitlements for the given user.
 */
export async function getEntitlements(
  store: EntitlementStore,
  userId: string,
): Promise<Entitlement[]> {
  const all = await store.getForUser(userId);
  const now = new Date();
  return all.filter(
    (e) => e.enabled && (e.expiresAt === null || new Date(e.expiresAt) > now),
  );
}
