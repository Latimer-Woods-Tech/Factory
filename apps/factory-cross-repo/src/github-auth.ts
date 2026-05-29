/**
 * GitHub App installation token minting via Web Crypto API.
 * Adapted from apps/supervisor/src/tools/github-auth.ts.
 */

const GITHUB_API = 'https://api.github.com';
const TIMEOUT_MS = 10_000;

function base64ToUint8Array(b64: string): Uint8Array {
  const standard = b64.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(standard);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function uint8ArrayToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) {
    binary += String.fromCharCode(b);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function encodeJwtSegment(obj: Record<string, unknown>): string {
  return uint8ArrayToBase64Url(new TextEncoder().encode(JSON.stringify(obj)));
}

function pemToDer(pem: string): Uint8Array {
  const lines = pem
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('-----'));
  return base64ToUint8Array(lines.join(''));
}

async function importRsaPrivateKey(pem: string): Promise<CryptoKey> {
  const der = pemToDer(pem);
  const buf = der.buffer.slice(der.byteOffset, der.byteOffset + der.byteLength) as ArrayBuffer;
  return crypto.subtle.importKey(
    'pkcs8',
    buf,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );
}

async function buildAppJwt(appId: string, privateKeyPem: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = encodeJwtSegment({ alg: 'RS256', typ: 'JWT' });
  const payload = encodeJwtSegment({ iat: now - 60, exp: now + 540, iss: appId });
  const signingInput = `${header}.${payload}`;
  const key = await importRsaPrivateKey(privateKeyPem);
  const signatureBuffer = await crypto.subtle.sign(
    { name: 'RSASSA-PKCS1-v1_5' },
    key,
    new TextEncoder().encode(signingInput),
  );
  return `${signingInput}.${uint8ArrayToBase64Url(new Uint8Array(signatureBuffer))}`;
}

export async function getInstallationToken(
  appId: string,
  privateKeyPem: string,
  installationId: string,
): Promise<string> {
  const jwt = await buildAppJwt(appId, privateKeyPem);
  const res = await fetch(`${GITHUB_API}/app/installations/${installationId}/access_tokens`, {
    method: 'POST',
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: {
      Authorization: `Bearer ${jwt}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '(no body)');
    throw new Error(`GitHub App token error ${res.status}: ${text.slice(0, 200)}`);
  }
  const data = (await res.json()) as { token: string };
  if (!data.token) throw new Error('GitHub App token response missing token field');
  return data.token;
}
