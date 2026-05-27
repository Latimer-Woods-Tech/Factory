import { describe, it, expect, beforeEach } from 'vitest';
import { verifyGithubOidcToken, resetJwksCache } from '../src/oidc.js';
import { createTestOidcKey, jwksFetch, validClaims, type TestOidcKey } from './helpers.js';

const ISSUER = 'https://oidc.test';
const OWNER = 'Latimer-Woods-Tech';
const AUDIENCE = 'factory-core-api';

function encodeSegment(value: object): string {
  return btoa(JSON.stringify(value)).replaceAll('+', '-').replaceAll('/', '_').replaceAll(/=+$/gu, '');
}

let key: TestOidcKey;

beforeEach(async () => {
  resetJwksCache();
  key = await createTestOidcKey();
});

function opts(overrides: Partial<Parameters<typeof verifyGithubOidcToken>[1]> = {}) {
  return { issuer: ISSUER, audience: AUDIENCE, owner: OWNER, fetchImpl: jwksFetch(key.jwks), ...overrides };
}

describe('verifyGithubOidcToken', () => {
  it('returns claims for a valid token', async () => {
    const token = await key.sign(validClaims());
    const claims = await verifyGithubOidcToken(token, opts());
    expect(claims.repository).toBe('Latimer-Woods-Tech/factory');
    expect(claims.repository_owner).toBe(OWNER);
  });

  it('accepts an array `aud` containing the expected audience', async () => {
    const token = await key.sign(validClaims({ aud: ['other', AUDIENCE] }));
    await expect(verifyGithubOidcToken(token, opts())).resolves.toBeTruthy();
  });

  it('caches JWKS across calls (second call needs no fetch)', async () => {
    const token = await key.sign(validClaims());
    await verifyGithubOidcToken(token, opts());
    const failingFetch = (() => {
      throw new Error('should not fetch — cache miss');
    }) as unknown as typeof fetch;
    await expect(verifyGithubOidcToken(token, opts({ fetchImpl: failingFetch }))).resolves.toBeTruthy();
  });

  it('rejects an unexpected issuer', async () => {
    const token = await key.sign(validClaims({ iss: 'https://evil.test' }));
    await expect(verifyGithubOidcToken(token, opts())).rejects.toThrow(/issuer/i);
  });

  it('rejects an expired token', async () => {
    const past = Math.floor(Date.now() / 1000) - 10;
    const token = await key.sign(validClaims({ iat: past - 300, exp: past }));
    await expect(verifyGithubOidcToken(token, opts())).rejects.toThrow(/expired/i);
  });

  it('rejects a not-yet-valid token (nbf in future)', async () => {
    const future = Math.floor(Date.now() / 1000) + 600;
    const token = await key.sign(validClaims({ nbf: future }));
    await expect(verifyGithubOidcToken(token, opts())).rejects.toThrow(/not yet valid/i);
  });

  it('rejects a mismatched audience', async () => {
    const token = await key.sign(validClaims({ aud: 'some-other-service' }));
    await expect(verifyGithubOidcToken(token, opts())).rejects.toThrow(/audience/i);
  });

  it('rejects a token from an unauthorized owner', async () => {
    const token = await key.sign(validClaims({ repository_owner: 'someone-else' }));
    await expect(verifyGithubOidcToken(token, opts())).rejects.toThrow(/owner/i);
  });

  it('rejects when the signing key id is not in the JWKS', async () => {
    const token = await key.sign(validClaims());
    const otherKey = await createTestOidcKey('different-kid');
    await expect(
      verifyGithubOidcToken(token, opts({ fetchImpl: jwksFetch(otherKey.jwks) })),
    ).rejects.toThrow(/signing key not found/i);
  });

  it('rejects an invalid signature', async () => {
    const token = await key.sign(validClaims());
    // A different key published under the same kid → signature verification fails.
    const impostor = await createTestOidcKey('test-key-1');
    await expect(
      verifyGithubOidcToken(token, opts({ fetchImpl: jwksFetch(impostor.jwks) })),
    ).rejects.toThrow(/invalid oidc token signature/i);
  });

  it('rejects a non-RS256 algorithm', async () => {
    const token = `${encodeSegment({ alg: 'HS256', typ: 'JWT', kid: 'x' })}.${encodeSegment(validClaims())}.sig`;
    await expect(verifyGithubOidcToken(token, opts())).rejects.toThrow(/algorithm/i);
  });

  it('rejects a token missing a key id', async () => {
    const token = `${encodeSegment({ alg: 'RS256', typ: 'JWT' })}.${encodeSegment(validClaims())}.sig`;
    await expect(verifyGithubOidcToken(token, opts())).rejects.toThrow(/key id/i);
  });

  it('rejects a malformed token', async () => {
    await expect(verifyGithubOidcToken('not-a-token', opts())).rejects.toThrow(/malformed/i);
  });

  it('ignores JWKS entries that have no key id', async () => {
    const token = await key.sign(validClaims());
    const mixed = { keys: [{ kty: 'RSA', n: 'x', e: 'AQAB' }, ...key.jwks.keys] };
    await expect(verifyGithubOidcToken(token, opts({ fetchImpl: jwksFetch(mixed) }))).resolves.toBeTruthy();
  });

  it('throws when the JWKS endpoint is unreachable', async () => {
    const token = await key.sign(validClaims());
    const failing = (async () => new Response('nope', { status: 500 })) as unknown as typeof fetch;
    await expect(verifyGithubOidcToken(token, opts({ fetchImpl: failing }))).rejects.toThrow(
      /unable to fetch oidc signing keys/i,
    );
  });
});
