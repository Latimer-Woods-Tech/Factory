/**
 * Scoped-JWT minting for factory-core-api.
 *
 * Per tech guide §1.5, each ingestion source receives a short-lived JWT scoped
 * to a single ingestion topic via its `aud` claim (e.g. `gates-ci`). Tokens are
 * signed HS256 with the root signing key (`env.JWT_SIGNING_KEY`) using the Web
 * Crypto API only — no Node `crypto`, no `Buffer`.
 */
import { AuthError } from '@latimer-woods-tech/errors';

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/** Claims carried by a minted scoped JWT. */
export interface ScopedTokenClaims {
  /** Issuer — always `factory-core-api`. */
  iss: string;
  /** Subject — the originating OIDC `sub` (e.g. `repo:owner/name:ref:...`). */
  sub: string;
  /** Audience — the ingestion topic this token is scoped to (e.g. `gates-ci`). */
  aud: string;
  /** Source repository (`owner/name`). */
  repository: string;
  /** Source repository owner. */
  repository_owner: string;
  /** Issued-at (epoch seconds). */
  iat: number;
  /** Expiry (epoch seconds). */
  exp: number;
}

/**
 * Allowed ingestion-scope audiences: `gates-*`, `artifacts-*`, `audit-*`,
 * `runs-*`. The endpoint route validates the specific `aud` against itself;
 * this gate rejects anything outside the known topic families.
 */
const AUDIENCE_PATTERN = /^(?:gates|artifacts|audit|runs|network)-[a-z0-9-]{1,40}$/u;

/** Returns true when `audience` is a recognised ingestion scope. */
export function isAllowedAudience(audience: string): boolean {
  return AUDIENCE_PATTERN.test(audience);
}

function base64UrlEncodeBytes(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll(/=+$/gu, '');
}

function base64UrlEncodeString(value: string): string {
  return base64UrlEncodeBytes(encoder.encode(value));
}

function base64UrlToBytes(value: string): Uint8Array<ArrayBuffer> {
  const base64 = value.replaceAll('-', '+').replaceAll('_', '/');
  const padded = `${base64}${'='.repeat((4 - (base64.length % 4)) % 4)}`;
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function importSigningKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
}

/**
 * Mints a scoped JWT for the given claims, valid for `ttlSeconds`.
 */
export async function signScopedToken(
  claims: Omit<ScopedTokenClaims, 'iat' | 'exp'>,
  secret: string,
  ttlSeconds: number,
): Promise<{ token: string; expiresIn: number; claims: ScopedTokenClaims }> {
  const iat = Math.floor(Date.now() / 1000);
  const fullClaims: ScopedTokenClaims = { ...claims, iat, exp: iat + ttlSeconds };
  const encodedHeader = base64UrlEncodeString(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const encodedPayload = base64UrlEncodeString(JSON.stringify(fullClaims));
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const key = await importSigningKey(secret);
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(signingInput));
  const encodedSignature = base64UrlEncodeBytes(new Uint8Array(signature));
  return { token: `${signingInput}.${encodedSignature}`, expiresIn: ttlSeconds, claims: fullClaims };
}

/**
 * Verifies a scoped JWT's signature and expiry, returning its claims.
 * Throws {@link AuthError} on any failure.
 */
export async function verifyScopedToken(token: string, secret: string): Promise<ScopedTokenClaims> {
  const parts = token.split('.');
  const [encodedHeader, encodedPayload, providedSignature] = parts;
  if (parts.length !== 3 || !encodedHeader || !encodedPayload || !providedSignature) {
    throw new AuthError('Malformed scoped token');
  }
  const key = await importSigningKey(secret);
  const valid = await crypto.subtle.verify(
    'HMAC',
    key,
    base64UrlToBytes(providedSignature),
    encoder.encode(`${encodedHeader}.${encodedPayload}`),
  );
  if (!valid) {
    throw new AuthError('Invalid scoped token signature');
  }
  const claims = JSON.parse(decoder.decode(base64UrlToBytes(encodedPayload))) as ScopedTokenClaims;
  if (claims.exp <= Math.floor(Date.now() / 1000)) {
    throw new AuthError('Scoped token expired');
  }
  return claims;
}
