/**
 * GCP Secret Manager integration for Cloudflare Workers.
 *
 * Authenticates via service account JWT → OAuth2 token → Secret Manager API.
 * Uses Web Crypto for all cryptographic operations (no Node.js imports).
 *
 * Usage:
 *   const secret = await gcpGetSecret('NEON_FACTORY_DATABASE_URL', env);
 *
 * Prerequisites:
 *   - Store service account key as base64 in Worker secret `GCP_SA_KEY`
 *   - Service account must have `secretmanager.secretAccessor` role
 *   - Secret name format: `project/projects/{project_id}/secrets/{secret_name}`
 *     or just `{secret_name}` if project_id is in the SA key
 */

export interface ServiceAccountKey {
  type: 'service_account';
  project_id: string;
  private_key_id: string;
  private_key: string;
  client_email: string;
  client_id: string;
  auth_uri: string;
  token_uri: string;
  auth_provider_x509_cert_url: string;
}

interface OAuth2Response {
  access_token: string;
  expires_in: number;
  token_type: string;
}

interface SecretPayload {
  name: string;
  payload: {
    data: string;
  };
}

/**
 * Fetch a secret from GCP Secret Manager by name.
 * Returns the secret value as a UTF-8 string.
 */
export async function gcpGetSecret(
  secretName: string,
  env: { GCP_SA_KEY: string },
): Promise<string> {
  const saKey = JSON.parse(atob(env.GCP_SA_KEY)) as ServiceAccountKey;
  const accessToken = await mintGcpToken(saKey);

  const secretPath = `projects/${saKey.project_id}/secrets/${secretName}/versions/latest:access`;
  const url = `https://secretmanager.googleapis.com/v1/${secretPath}`;

  const res = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GCP Secret Manager ${res.status}: ${text}`);
  }

  const data = await res.json<SecretPayload>();
  const secretBytes = atob(data.payload.data);
  return secretBytes;
}

/**
 * Mint a short-lived OAuth2 access token using service account JWT.
 * Token is valid for 1 hour (GCP default).
 */
async function mintGcpToken(saKey: ServiceAccountKey): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const expiresAt = now + 3600; // 1 hour

  const header = { alg: 'RS256', typ: 'JWT' };
  const payload = {
    iss: saKey.client_email,
    scope: 'https://www.googleapis.com/auth/cloud-platform',
    aud: saKey.token_uri,
    exp: expiresAt,
    iat: now,
  };

  const jwt = await createJwt(header, payload, saKey.private_key);

  const res = await fetch(saKey.token_uri, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GCP OAuth2 ${res.status}: ${text}`);
  }

  const data = await res.json<OAuth2Response>();
  return data.access_token;
}

/**
 * Create a JWT signed with the service account private key.
 * Uses Web Crypto RSASSA-PKCS1-v1_5 (matches GCP expectations).
 */
async function createJwt(
  header: Record<string, string>,
  payload: Record<string, unknown>,
  privateKeyPem: string,
): Promise<string> {
  const headerJson = JSON.stringify(header);
  const payloadJson = JSON.stringify(payload);

  const headerB64 = base64UrlEncode(stringToBytes(headerJson));
  const payloadB64 = base64UrlEncode(stringToBytes(payloadJson));
  const signatureInput = `${headerB64}.${payloadB64}`;

  const cryptoKey = await importPrivateKey(privateKeyPem);
  const signatureBytes = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    cryptoKey,
    // Uint8Array.buffer is ArrayBufferLike in strict TS but Web Crypto requires
    // the narrower ArrayBuffer. The buffer is always a plain ArrayBuffer when
    // created by stringToBytes (TextEncoder.encode path, not SharedArrayBuffer).
    stringToBytes(signatureInput).buffer as ArrayBuffer,
  );
  const signatureB64 = base64UrlEncode(new Uint8Array(signatureBytes));

  return `${signatureInput}.${signatureB64}`;
}

/**
 * Import a PEM-encoded PKCS#8 private key into a CryptoKey.
 */
async function importPrivateKey(pemKey: string): Promise<CryptoKey> {
  const pemLines = pemKey
    .split('\n')
    .filter((line) => !line.startsWith('-----'));
  const pemString = pemLines.join('');
  const binaryString = atob(pemString);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }

  return crypto.subtle.importKey(
    'pkcs8',
    bytes.buffer,
    {
      name: 'RSASSA-PKCS1-v1_5',
      hash: 'SHA-256',
    },
    false,
    ['sign'],
  );
}

/**
 * Encode bytes as base64url (RFC 4648 §5).
 * Standard base64 with - and _ instead of + and /; no padding.
 */
function base64UrlEncode(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

/**
 * Convert a UTF-8 string to bytes.
 */
function stringToBytes(str: string): Uint8Array {
  return new TextEncoder().encode(str);
}
