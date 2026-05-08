import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getInstallationToken } from './github-auth';

// ---------------------------------------------------------------------------
// Minimal synthetic RSA key pair for unit tests.
// These are throwaway test keys — never used in production.
// Generated with: openssl genrsa 2048 (then exported to PKCS#8 DER).
//
// For unit-test purposes we stub crypto.subtle so the actual key material is
// irrelevant; the test merely verifies the orchestration logic (JWT structure,
// correct API endpoint, Bearer header, token extraction).
// ---------------------------------------------------------------------------

const FAKE_APP_ID = '999888';
const FAKE_INSTALLATION_ID = '111222';
const FAKE_PEM = `-----BEGIN RSA PRIVATE KEY-----
MIIEowIBAAKCAQEA0Z3VS5JJcds3xHn/ygWep4PAtAzLN50Nc7WLBX5MxlDHPcVD
pLFMmExampleTestKeyNotRealDoNotUseInProduction111111111111111111111111
-----END RSA PRIVATE KEY-----`;

const FAKE_JWT = 'header.payload.signature';
const FAKE_INSTALLATION_TOKEN = 'ghs_installation_token_abc123';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a minimal mock Response. */
function mockResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('getInstallationToken', () => {
  beforeEach(() => {
    // Stub global fetch
    vi.stubGlobal('fetch', vi.fn());

    // Stub crypto.subtle to avoid real RSA operations in unit tests.
    // We verify the orchestration (correct URL, headers, token extraction)
    // rather than actual cryptographic correctness — that belongs in an
    // integration test with real keys.
    vi.stubGlobal('crypto', {
      subtle: {
        importKey: vi.fn().mockResolvedValue({ type: 'private' } as CryptoKey),
        sign: vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3, 4]).buffer),
      },
    });

    // atob/btoa are used by the PEM parser and base64url encoder. Stub them
    // so the test does not depend on the runtime providing these globals.
    vi.stubGlobal('atob', (s: string) => Buffer.from(s, 'base64').toString('binary'));
    vi.stubGlobal('btoa', (s: string) => Buffer.from(s, 'binary').toString('base64'));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('calls the correct GitHub installation access_tokens endpoint', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      mockResponse({ token: FAKE_INSTALLATION_TOKEN }, 201),
    );

    await getInstallationToken(FAKE_APP_ID, FAKE_PEM, FAKE_INSTALLATION_ID);

    const [url] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      `https://api.github.com/app/installations/${FAKE_INSTALLATION_ID}/access_tokens`,
    );
  });

  it('sends Authorization: Bearer <jwt> header (not the installation token)', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      mockResponse({ token: FAKE_INSTALLATION_TOKEN }, 201),
    );

    await getInstallationToken(FAKE_APP_ID, FAKE_PEM, FAKE_INSTALLATION_ID);

    const [, init] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    const auth = (init.headers as Record<string, string>)['Authorization'];
    // The header must start with "Bearer " followed by a JWT (three dot-separated segments)
    expect(auth).toMatch(/^Bearer [A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
  });

  it('uses POST method', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      mockResponse({ token: FAKE_INSTALLATION_TOKEN }, 201),
    );

    await getInstallationToken(FAKE_APP_ID, FAKE_PEM, FAKE_INSTALLATION_ID);

    const [, init] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    expect(init.method).toBe('POST');
  });

  it('returns the installation token from the API response', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      mockResponse({ token: FAKE_INSTALLATION_TOKEN }, 201),
    );

    const token = await getInstallationToken(FAKE_APP_ID, FAKE_PEM, FAKE_INSTALLATION_ID);
    expect(token).toBe(FAKE_INSTALLATION_TOKEN);
  });

  it('throws on non-2xx response from GitHub', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response('{"message":"Bad credentials"}', { status: 401 }),
    );

    await expect(
      getInstallationToken(FAKE_APP_ID, FAKE_PEM, FAKE_INSTALLATION_ID),
    ).rejects.toThrow('getInstallationToken: GitHub API error 401');
  });

  it('throws if response body is missing token field', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      mockResponse({ expires_at: '2099-01-01T00:00:00Z' }, 201),
    );

    await expect(
      getInstallationToken(FAKE_APP_ID, FAKE_PEM, FAKE_INSTALLATION_ID),
    ).rejects.toThrow('getInstallationToken: response missing token field');
  });

  it('includes X-GitHub-Api-Version header', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      mockResponse({ token: FAKE_INSTALLATION_TOKEN }, 201),
    );

    await getInstallationToken(FAKE_APP_ID, FAKE_PEM, FAKE_INSTALLATION_ID);

    const [, init] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers['X-GitHub-Api-Version']).toBe('2022-11-28');
  });

  it('calls crypto.subtle.importKey with pkcs8 format', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      mockResponse({ token: FAKE_INSTALLATION_TOKEN }, 201),
    );

    await getInstallationToken(FAKE_APP_ID, FAKE_PEM, FAKE_INSTALLATION_ID);

    expect(crypto.subtle.importKey).toHaveBeenCalledWith(
      'pkcs8',
      expect.any(ArrayBuffer),
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['sign'],
    );
  });

  it('calls crypto.subtle.sign with RSASSA-PKCS1-v1_5', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      mockResponse({ token: FAKE_INSTALLATION_TOKEN }, 201),
    );

    await getInstallationToken(FAKE_APP_ID, FAKE_PEM, FAKE_INSTALLATION_ID);

    expect(crypto.subtle.sign).toHaveBeenCalledWith(
      { name: 'RSASSA-PKCS1-v1_5' },
      expect.anything(),
      expect.any(Uint8Array),
    );
  });
});

describe('JWT structure (header + payload encoding)', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
    vi.stubGlobal('crypto', {
      subtle: {
        importKey: vi.fn().mockResolvedValue({ type: 'private' } as CryptoKey),
        sign: vi.fn().mockResolvedValue(new Uint8Array([0xde, 0xad, 0xbe, 0xef]).buffer),
      },
    });
    vi.stubGlobal('atob', (s: string) => Buffer.from(s, 'base64').toString('binary'));
    vi.stubGlobal('btoa', (s: string) => Buffer.from(s, 'binary').toString('base64'));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('JWT header decodes to {alg:"RS256",typ:"JWT"}', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ token: FAKE_INSTALLATION_TOKEN }), { status: 201 }),
    );

    await getInstallationToken(FAKE_APP_ID, FAKE_PEM, FAKE_INSTALLATION_ID);

    const [, init] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    const auth = (init.headers as Record<string, string>)['Authorization'] as string;
    const jwt = auth.replace('Bearer ', '');
    const segments = jwt.split('.');
    const headerB64 = segments[0] as string;

    // Restore base64url padding and decode
    const padded = headerB64.replace(/-/g, '+').replace(/_/g, '/');
    const json = atob(padded.padEnd(Math.ceil(padded.length / 4) * 4, '='));
    const header = JSON.parse(json) as Record<string, string>;

    expect(header.alg).toBe('RS256');
    expect(header.typ).toBe('JWT');
  });

  it('JWT payload contains iss equal to appId', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ token: FAKE_INSTALLATION_TOKEN }), { status: 201 }),
    );

    await getInstallationToken(FAKE_APP_ID, FAKE_PEM, FAKE_INSTALLATION_ID);

    const [, init] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    const auth = (init.headers as Record<string, string>)['Authorization'] as string;
    const jwt = auth.replace('Bearer ', '');
    const segments = jwt.split('.');
    const payloadB64 = segments[1] as string;

    const padded = payloadB64.replace(/-/g, '+').replace(/_/g, '/');
    const json = atob(padded.padEnd(Math.ceil(padded.length / 4) * 4, '='));
    const payload = JSON.parse(json) as Record<string, unknown>;

    expect(payload.iss).toBe(FAKE_APP_ID);
  });

  it('JWT payload has iat <= now and exp > now', async () => {
    const before = Math.floor(Date.now() / 1000);

    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ token: FAKE_INSTALLATION_TOKEN }), { status: 201 }),
    );

    await getInstallationToken(FAKE_APP_ID, FAKE_PEM, FAKE_INSTALLATION_ID);

    const after = Math.floor(Date.now() / 1000);

    const [, init] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    const auth = (init.headers as Record<string, string>)['Authorization'] as string;
    const jwt = auth.replace('Bearer ', '');
    const segments = jwt.split('.');
    const payloadB64 = segments[1] as string;

    const padded = payloadB64.replace(/-/g, '+').replace(/_/g, '/');
    const json = atob(padded.padEnd(Math.ceil(padded.length / 4) * 4, '='));
    const payload = JSON.parse(json) as { iat: number; exp: number };

    // iat is now - 60 (clock-skew buffer), so it must be ≤ before
    expect(payload.iat).toBeLessThanOrEqual(before);
    // exp is now + 540, so it must be > after
    expect(payload.exp).toBeGreaterThan(after);
  });
});
