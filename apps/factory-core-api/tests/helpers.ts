/**
 * Test helpers: generate an RSA keypair, expose it as a JWKS, and mint signed
 * RS256 OIDC tokens — mirrors what GitHub Actions' OIDC provider produces.
 */
const encoder = new TextEncoder();

export interface OidcClaimsInput {
  iss: string;
  sub: string;
  aud: string | string[];
  repository: string;
  repository_owner: string;
  exp: number;
  iat: number;
  nbf?: number;
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

export interface TestOidcKey {
  kid: string;
  privateKey: CryptoKey;
  jwk: JsonWebKey;
  jwks: { keys: JsonWebKey[] };
  sign(claims: OidcClaimsInput): Promise<string>;
}

/** Generates an RSA keypair and returns signing helpers + its JWKS. */
export async function createTestOidcKey(kid = 'test-key-1'): Promise<TestOidcKey> {
  const pair = await crypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true,
    ['sign', 'verify'],
  );
  const jwk = (await crypto.subtle.exportKey('jwk', pair.publicKey)) as JsonWebKey & {
    kid?: string;
    alg?: string;
  };
  jwk.kid = kid;
  jwk.alg = 'RS256';

  async function sign(claims: OidcClaimsInput): Promise<string> {
    const encodedHeader = base64UrlEncodeString(JSON.stringify({ alg: 'RS256', typ: 'JWT', kid }));
    const encodedPayload = base64UrlEncodeString(JSON.stringify(claims));
    const signingInput = `${encodedHeader}.${encodedPayload}`;
    const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', pair.privateKey, encoder.encode(signingInput));
    return `${signingInput}.${base64UrlEncodeBytes(new Uint8Array(signature))}`;
  }

  return { kid, privateKey: pair.privateKey, jwk, jwks: { keys: [jwk] }, sign };
}

/** Builds a `fetch` stub that returns the given JWKS for any URL. */
export function jwksFetch(jwks: { keys: JsonWebKey[] }): typeof fetch {
  return (async () =>
    new Response(JSON.stringify(jwks), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })) as unknown as typeof fetch;
}

/** Standard valid OIDC claims for the test issuer/owner. */
export function validClaims(overrides: Partial<OidcClaimsInput> = {}): OidcClaimsInput {
  const nowSeconds = Math.floor(Date.now() / 1000);
  return {
    iss: 'https://oidc.test',
    sub: 'repo:Latimer-Woods-Tech/factory:ref:refs/heads/main',
    aud: 'factory-core-api',
    repository: 'Latimer-Woods-Tech/factory',
    repository_owner: 'Latimer-Woods-Tech',
    iat: nowSeconds,
    exp: nowSeconds + 300,
    ...overrides,
  };
}
