/**
 * JWT authentication and RBAC middleware for qa-tools-worker.
 *
 * Token format: HS256 JWT with claims:
 *   { sub, email, role, app_ids, aud, exp }
 *
 * Roles:
 *   qa_viewer  — read-only access to own app_ids
 *   qa_runner  — can trigger runs + read results for own app_ids
 *   qa_admin   — full access across all apps
 *
 * See: docs/architecture/QA_TOOLS_ARCHITECTURE.md §2.3
 */

import { AuthError } from '@latimer-woods-tech/errors';
import type { QaJwtClaims, QaRole, AppId } from '../types.js';

const encoder = new TextEncoder();

// ---------------------------------------------------------------------------
// Base64url helpers (Web Crypto — no Node.js Buffer)
// ---------------------------------------------------------------------------

function base64UrlToBytes(b64: string): Uint8Array {
  const padded = b64.replace(/-/g, '+').replace(/_/g, '/');
  const pad = padded.length % 4;
  const padded2 = pad > 0 ? padded + '='.repeat(4 - pad) : padded;
  const binary = atob(padded2);
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

function base64UrlDecode(b64: string): string {
  return new TextDecoder().decode(base64UrlToBytes(b64));
}

// ---------------------------------------------------------------------------
// JWT verification (HS256 only — matches QA_TOOLS_JWT_SECRET)
// ---------------------------------------------------------------------------

/**
 * Verifies an HS256 JWT signature and returns the decoded claims.
 * Throws {@link AuthError} on invalid signature, expiry, or malformed token.
 * Any native decoding error (e.g. atob InvalidCharacterError on garbage input)
 * is caught and re-thrown as AuthError so the global handler returns 401.
 */
export async function verifyQaJwt(token: string, secret: string): Promise<QaJwtClaims> {
  try {
    return await verifyQaJwtInner(token, secret);
  } catch (err) {
    if (err instanceof AuthError) throw err;
    // Native decoding failures (InvalidCharacterError, SyntaxError, etc.)
    throw new AuthError('Malformed JWT');
  }
}

async function verifyQaJwtInner(token: string, secret: string): Promise<QaJwtClaims> {
  const parts = token.split('.');
  if (parts.length !== 3) throw new AuthError('Malformed JWT');
  const [headerB64, payloadB64, sigB64] = parts as [string, string, string];

  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify'],
  );

  const signingInput = `${headerB64}.${payloadB64}`;
  const valid = await crypto.subtle.verify(
    'HMAC',
    key,
    // Cast to ArrayBuffer: Uint8Array.buffer has type ArrayBufferLike in strict
    // TS but Web Crypto requires the narrower ArrayBuffer. The underlying bytes
    // are always a plain ArrayBuffer here (created from atob → charCodeAt).
    base64UrlToBytes(sigB64).buffer as ArrayBuffer,
    encoder.encode(signingInput),
  );
  if (!valid) throw new AuthError('Invalid JWT signature');

  let claims: unknown;
  try {
    claims = JSON.parse(base64UrlDecode(payloadB64));
  } catch {
    throw new AuthError('Malformed JWT payload');
  }

  if (!claims || typeof claims !== 'object' || Array.isArray(claims)) {
    throw new AuthError('JWT payload is not an object');
  }

  const c = claims as Record<string, unknown>;

  // Expiry check
  const exp = typeof c['exp'] === 'number' ? c['exp'] : null;
  if (exp === null || exp < Math.floor(Date.now() / 1000)) {
    throw new AuthError('JWT expired');
  }

  // Required claims
  const sub = typeof c['sub'] === 'string' ? c['sub'] : '';
  const role = typeof c['role'] === 'string' ? c['role'] : '';
  if (!sub) throw new AuthError('JWT missing sub claim');
  if (!isValidRole(role)) throw new AuthError(`JWT has invalid role: ${role}`);

  const rawAppIds = Array.isArray(c['app_ids']) ? c['app_ids'] : undefined;
  const app_ids = rawAppIds?.filter((id): id is AppId => typeof id === 'string');

  return {
    sub,
    email: typeof c['email'] === 'string' ? c['email'] : undefined,
    role,
    app_ids,
    aud: typeof c['aud'] === 'string' ? c['aud'] : undefined,
    exp,
    iat: typeof c['iat'] === 'number' ? c['iat'] : undefined,
  };
}

function isValidRole(role: string): role is QaRole {
  return role === 'qa_viewer' || role === 'qa_runner' || role === 'qa_admin';
}

// ---------------------------------------------------------------------------
// Authorization helpers
// ---------------------------------------------------------------------------

/**
 * Asserts the token claims authorize access to the given appId.
 * qa_admin bypasses the app_ids check.
 */
export function assertAppAccess(claims: QaJwtClaims, appId: string): void {
  if (claims.role === 'qa_admin') return;
  if (!claims.app_ids?.includes(appId as AppId)) {
    throw new AuthError(`Token not authorized for app: ${appId}`);
  }
}

/**
 * Asserts the token has at least the required role level.
 * Role hierarchy: qa_viewer < qa_runner < qa_admin
 */
export function assertRole(claims: QaJwtClaims, required: QaRole): void {
  const LEVELS: Record<QaRole, number> = { qa_viewer: 0, qa_runner: 1, qa_admin: 2 };
  if (LEVELS[claims.role] < LEVELS[required]) {
    throw new AuthError(`Role '${claims.role}' cannot perform this action (requires ${required})`);
  }
}

// ---------------------------------------------------------------------------
// Token minting (for tests + CI service tokens)
// ---------------------------------------------------------------------------

/**
 * Mints an HS256 JWT with the given claims. Used in tests and for issuing
 * CI service tokens. Never call from production request handlers.
 */
export async function mintQaJwt(
  claims: Omit<QaJwtClaims, 'iat'> & { iat?: number },
  secret: string,
): Promise<string> {
  const header = { alg: 'HS256', typ: 'JWT' };
  const payload = { ...claims, iat: claims.iat ?? Math.floor(Date.now() / 1000) };

  const b64Header = btoa(JSON.stringify(header)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const b64Payload = btoa(JSON.stringify(payload)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const signingInput = `${b64Header}.${b64Payload}`;

  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(signingInput));
  const b64Sig = btoa(String.fromCharCode(...new Uint8Array(sig))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

  return `${signingInput}.${b64Sig}`;
}

// ---------------------------------------------------------------------------
// Request extraction helper
// ---------------------------------------------------------------------------

/**
 * Extracts and verifies the Bearer JWT from an Authorization header.
 * Returns verified claims or throws AuthError.
 */
export async function requireAuth(
  authHeader: string | undefined,
  jwtSecret: string,
): Promise<QaJwtClaims> {
  if (!authHeader?.startsWith('Bearer ')) {
    throw new AuthError('Authorization: Bearer <token> required');
  }
  return verifyQaJwt(authHeader.slice(7), jwtSecret);
}
