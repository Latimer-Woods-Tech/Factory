/**
 * Scoped JWT minting for supervisor-initiated tool calls.
 *
 * The supervisor mints three classes of JWTs:
 *   1. supervisor.readonly — read-only access (verification queries)
 *   2. supervisor.mutator-<route> — scoped mutation (specific endpoint)
 *   3. supervisor.verifier-readonly — read-only for intent verification
 *
 * All use HS256 (HMAC-SHA256) and are verified by the receiving app's
 * @latimer-woods-tech/admin verifyJwt() function.
 */

function base64urlEncode(data: Uint8Array): string {
  let binary = '';
  for (const b of data) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function encodeSegment(obj: Record<string, unknown>): string {
  const json = JSON.stringify(obj);
  const bytes = new TextEncoder().encode(json);
  return base64urlEncode(bytes);
}

/**
 * Mint a scoped JWT for supervisor tool invocation.
 *
 * @param secret — The JWT_SECRET from env (typically 32+ bytes)
 * @param scope — Space-delimited scope string (e.g., "supervisor.readonly")
 * @param opts — Optional claims: issuer, audience, expiresInSeconds (default 900=15min)
 * @returns A signed HS256 JWT
 */
export async function mintScopedJwt(
  secret: string,
  scope: string,
  opts?: { issuer?: string; audience?: string; expiresInSeconds?: number },
): Promise<string> {
  const expiresIn = opts?.expiresInSeconds ?? 900; // 15 minutes
  const now = Math.floor(Date.now() / 1000);

  const header = encodeSegment({ alg: 'HS256', typ: 'JWT' });
  const payload = encodeSegment({
    iss: opts?.issuer ?? 'supervisor',
    aud: opts?.audience ?? '*',
    exp: now + expiresIn,
    iat: now,
    scope,
  });

  const signingInput = `${header}.${payload}`;
  const signingBytes = new TextEncoder().encode(signingInput);

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );

  const signatureBuffer = await crypto.subtle.sign('HMAC', key, signingBytes);
  const signature = base64urlEncode(new Uint8Array(signatureBuffer));

  return `${signingInput}.${signature}`;
}

/**
 * Mint a read-only JWT for verification queries.
 */
export function mintReadonlyJwt(secret: string): Promise<string> {
  return mintScopedJwt(secret, 'supervisor.readonly');
}

/**
 * Mint a mutator JWT for a specific route.
 * @param route — Route identifier, e.g., "POST /admin/users/:id/suspend"
 */
export function mintMutatorJwt(secret: string, route: string): Promise<string> {
  return mintScopedJwt(secret, `supervisor.mutator-${route}`);
}

/**
 * Mint a verifier-readonly JWT for post-execution verification.
 */
export function mintVerifierJwt(secret: string): Promise<string> {
  return mintScopedJwt(secret, 'supervisor.verifier-readonly');
}
