/**
 * GitHub Actions OIDC token verification for factory-core-api.
 *
 * Per tech guide §1.5, trusted workflow runs authenticate to GitHub OIDC and
 * exchange the resulting RS256 token here for a scoped JWT. This module
 * verifies the OIDC token's signature against the issuer's JWKS and validates
 * its claims (issuer, audience, expiry, repository owner) using the Web Crypto
 * API only — no Node `crypto`, no `Buffer`.
 */
import { AuthError } from '@latimer-woods-tech/errors';

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/** Subset of GitHub Actions OIDC claims this service relies on. */
export interface GithubOidcClaims {
  iss: string;
  sub: string;
  aud: string | string[];
  exp: number;
  iat: number;
  nbf?: number;
  /** `owner/name` of the workflow's repository. */
  repository: string;
  /** Owner (org or user) of the workflow's repository. */
  repository_owner: string;
  ref?: string;
  workflow?: string;
}

/** Options controlling OIDC verification. */
export interface OidcVerifyOptions {
  /** Expected issuer (also used to derive the JWKS URI). */
  issuer: string;
  /** Required `aud` claim value. */
  audience: string;
  /** Required `repository_owner` claim value. */
  owner: string;
  /** Current time in epoch seconds; defaults to now. Injectable for tests. */
  now?: number;
  /** Fetch implementation; defaults to the global `fetch`. Injectable for tests. */
  fetchImpl?: typeof fetch;
}

interface Jwk {
  kid: string;
  kty: string;
  n: string;
  e: string;
  alg?: string;
}

interface Jwks {
  keys: Jwk[];
}

interface JwksCacheEntry {
  keys: Map<string, Jwk>;
  expiresAtMs: number;
}

const JWKS_TTL_MS = 10 * 60 * 1000;
const jwksCache = new Map<string, JwksCacheEntry>();

/** Clears the in-memory JWKS cache. Test-only seam. */
export function resetJwksCache(): void {
  jwksCache.clear();
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

function decodeSegment<T>(segment: string): T {
  return JSON.parse(decoder.decode(base64UrlToBytes(segment))) as T;
}

async function loadJwksKeys(
  jwksUri: string,
  fetchImpl: typeof fetch,
): Promise<Map<string, Jwk>> {
  const cached = jwksCache.get(jwksUri);
  if (cached && cached.expiresAtMs > Date.now()) {
    return cached.keys;
  }
  const res = await fetchImpl(jwksUri, { headers: { accept: 'application/json' } });
  if (!res.ok) {
    throw new AuthError(`Unable to fetch OIDC signing keys (${String(res.status)})`);
  }
  const rawBody: unknown = await res.json();
  const body = rawBody as Jwks;
  const keys = new Map<string, Jwk>();
  for (const key of body.keys ?? []) {
    if (key.kid) {
      keys.set(key.kid, key);
    }
  }
  jwksCache.set(jwksUri, { keys, expiresAtMs: Date.now() + JWKS_TTL_MS });
  return keys;
}

async function importRsaKey(jwk: Jwk): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'jwk',
    { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: 'RS256', ext: true },
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['verify'],
  );
}

/**
 * Verifies a GitHub Actions OIDC token and returns its claims.
 * Throws {@link AuthError} on any signature or claim validation failure.
 */
export async function verifyGithubOidcToken(
  token: string,
  options: OidcVerifyOptions,
): Promise<GithubOidcClaims> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const now = options.now ?? Math.floor(Date.now() / 1000);

  const parts = token.split('.');
  const [encodedHeader, encodedPayload, encodedSignature] = parts;
  if (parts.length !== 3 || !encodedHeader || !encodedPayload || !encodedSignature) {
    throw new AuthError('Malformed OIDC token');
  }

  const header = decodeSegment<{ alg: string; kid?: string }>(encodedHeader);
  if (header.alg !== 'RS256') {
    throw new AuthError('Unsupported OIDC token algorithm');
  }
  if (!header.kid) {
    throw new AuthError('OIDC token missing key id');
  }

  const jwksUri = `${options.issuer.replace(/\/+$/u, '')}/.well-known/jwks`;
  const keys = await loadJwksKeys(jwksUri, fetchImpl);
  const jwk = keys.get(header.kid);
  if (!jwk) {
    throw new AuthError('OIDC signing key not found');
  }

  const key = await importRsaKey(jwk);
  const valid = await crypto.subtle.verify(
    'RSASSA-PKCS1-v1_5',
    key,
    base64UrlToBytes(encodedSignature),
    encoder.encode(`${encodedHeader}.${encodedPayload}`),
  );
  if (!valid) {
    throw new AuthError('Invalid OIDC token signature');
  }

  const claims = decodeSegment<GithubOidcClaims>(encodedPayload);
  if (claims.iss !== options.issuer) {
    throw new AuthError('Unexpected OIDC issuer');
  }
  if (claims.exp <= now) {
    throw new AuthError('OIDC token expired');
  }
  if (claims.nbf !== undefined && claims.nbf > now) {
    throw new AuthError('OIDC token not yet valid');
  }
  const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!audiences.includes(options.audience)) {
    throw new AuthError('Unexpected OIDC audience');
  }
  if (claims.repository_owner !== options.owner) {
    throw new AuthError('OIDC token from unauthorized repository owner');
  }
  return claims;
}
