/**
 * M2M authentication for the Factory network layer.
 *
 * Apps (selfprime, capricast, etc.) authenticate to /v1/network/* with a
 * per-app bearer token. The plaintext token lives as a wrangler secret in
 * the consumer app (FACTORY_NETWORK_TOKEN); only its SHA-256 hex hash is
 * stored in factory_app_keys. This matches the WEBHOOK_FANOUT_INGEST_KEY
 * and SUPERVISOR_PUSH_KEY patterns already in use.
 *
 * Uses Web Crypto only — no Node crypto, no Buffer (CLAUDE.md hard constraint).
 */
import { AuthError } from '@latimer-woods-tech/errors';
import { createDb, sql } from '@latimer-woods-tech/neon';

const encoder = new TextEncoder();

/** SHA-256 hex digest of a plaintext token — never stored plaintext. */
export async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(token));
  return Array.from(new Uint8Array(digest))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/** Minimal Hyperdrive-compatible binding shape. */
interface HyperdriveBinding {
  readonly connectionString: string;
}

/**
 * Validates an app bearer token against factory_app_keys.
 * Returns the app_id on success; throws AuthError on failure.
 *
 * Accepts `Authorization: Bearer <token>` or a raw token string.
 */
export async function validateAppToken(
  authHeader: string | undefined,
  networkDb: HyperdriveBinding,
): Promise<string> {
  if (!authHeader?.startsWith('Bearer ')) {
    throw new AuthError('Missing app bearer token');
  }
  const token = authHeader.slice(7).trim();
  if (!token) {
    throw new AuthError('Empty app bearer token');
  }

  const keyHash = await hashToken(token);
  const db = createDb(networkDb);

  const rows = await db.execute<{ app_id: string }>(sql`
    SELECT app_id FROM factory_app_keys
    WHERE key_hash = ${keyHash}
      AND revoked_at IS NULL
    LIMIT 1
  `);

  const appId = rows.rows[0]?.app_id;
  if (!appId) {
    throw new AuthError('Invalid or revoked app token');
  }
  return appId;
}
