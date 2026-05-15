import { InternalError, ValidationError } from '@latimer-woods-tech/errors';
import type { Logger } from '@latimer-woods-tech/logger';

/** Scrape selectors keyed by caller-defined field name. */
export type BrowserSelectors = Record<string, string>;

/** Text extracted for one selector. */
export interface ScrapeFieldResult {
  selector: string;
  text: string[];
}

/** Response returned by the Browser Agent scrape endpoint. */
export interface BrowserScrapeResult {
  url: string;
  scrapedAt: string;
  results: Record<string, ScrapeFieldResult>;
}

/** Response returned by the Browser Agent screenshot endpoint. */
export interface BrowserScreenshotResult {
  url: string;
  capturedAt: string;
  mimeType: 'image/png';
  dataBase64: string;
}

/** Minimal GCP service-account JSON fields required for ID-token minting. */
export interface BrowserAgentServiceAccountKey {
  client_email: string;
  private_key: string;
  token_uri?: string;
}

/** Browser Agent client configuration. */
export interface BrowserClientConfig {
  agentUrl: string;
  audience: string;
  serviceAccountKey: string | BrowserAgentServiceAccountKey;
  requestTimeoutMs?: number;
}

/** Browser Agent client. */
export interface BrowserClient {
  scrape(url: string, selectors: BrowserSelectors): Promise<BrowserScrapeResult>;
  screenshot(url: string): Promise<BrowserScreenshotResult>;
}

type FetchFn = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
type IdTokenProvider = (audience: string) => Promise<string>;

/** Injectable dependencies for tests and host runtimes. */
export interface BrowserClientDeps {
  fetch?: FetchFn;
  logger?: Logger;
  now?: () => number;
  getIdToken?: IdTokenProvider;
}

interface GoogleTokenResponse {
  id_token?: string;
  error?: string;
}

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_TOKEN_URI = 'https://oauth2.googleapis.com/token';
const TOKEN_GRANT_TYPE = 'urn:ietf:params:oauth:grant-type:jwt-bearer';
const BASE64_CHUNK_SIZE = 0x8000;
const encoder = new TextEncoder();

function normalizeUrl(value: string, field: string): string {
  if (!value.trim()) throw new ValidationError(`${field} is required`);
  const parsed = new URL(value);
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new ValidationError(`${field} must use http or https`);
  }
  return parsed.toString();
}

function parseServiceAccountKey(value: string | BrowserAgentServiceAccountKey): BrowserAgentServiceAccountKey {
  const parsed = typeof value === 'string' ? (JSON.parse(value) as unknown) : value;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new ValidationError('BROWSER_AGENT_SA_KEY must be a service-account JSON object');
  }
  const record = parsed as Record<string, unknown>;
  if (typeof record['client_email'] !== 'string' || typeof record['private_key'] !== 'string') {
    throw new ValidationError('BROWSER_AGENT_SA_KEY requires client_email and private_key');
  }
  return {
    client_email: record['client_email'],
    private_key: record['private_key'],
    token_uri: typeof record['token_uri'] === 'string' ? record['token_uri'] : undefined,
  };
}

function toBase64UrlBytes(bytes: Uint8Array): string {
  const chunks: string[] = [];
  for (let offset = 0; offset < bytes.length; offset += BASE64_CHUNK_SIZE) {
    chunks.push(String.fromCharCode(...bytes.slice(offset, offset + BASE64_CHUNK_SIZE)));
  }
  const binary = chunks.join('');
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll(/=+$/gu, '');
}

function toBase64UrlJson(value: Record<string, unknown>): string {
  return toBase64UrlBytes(encoder.encode(JSON.stringify(value)));
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function importPrivateKey(pem: string): Promise<CryptoKey> {
  const body = pem
    .replaceAll('\\n', '\n')
    .replace('-----BEGIN PRIVATE KEY-----', '')
    .replace('-----END PRIVATE KEY-----', '')
    .replace(/\s+/gu, '');
  if (!body) throw new ValidationError('Service-account private_key is empty');

  return crypto.subtle.importKey(
    'pkcs8',
    base64ToBytes(body),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );
}

async function createJwtAssertion(
  key: BrowserAgentServiceAccountKey,
  audience: string,
  now: () => number,
): Promise<string> {
  const tokenUri = key.token_uri ?? DEFAULT_TOKEN_URI;
  const iat = Math.floor(now() / 1000);
  const header = toBase64UrlJson({ alg: 'RS256', typ: 'JWT' });
  const payload = toBase64UrlJson({
    iss: key.client_email,
    sub: key.client_email,
    aud: tokenUri,
    target_audience: audience,
    iat,
    exp: iat + 3600,
  });
  const signingInput = `${header}.${payload}`;
  const cryptoKey = await importPrivateKey(key.private_key);
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    cryptoKey,
    encoder.encode(signingInput),
  );
  return `${signingInput}.${toBase64UrlBytes(new Uint8Array(signature))}`;
}

/** Mints a Google-signed ID token for invoking an IAM-protected Cloud Run service. */
export async function mintBrowserAgentIdToken(
  serviceAccountKey: string | BrowserAgentServiceAccountKey,
  audience: string,
  deps: Pick<BrowserClientDeps, 'fetch' | 'now'> = {},
): Promise<string> {
  const key = parseServiceAccountKey(serviceAccountKey);
  const fetchImpl = deps.fetch ?? fetch;
  const tokenUri = key.token_uri ?? DEFAULT_TOKEN_URI;
  const assertion = await createJwtAssertion(key, audience, deps.now ?? Date.now);
  const response = await fetchImpl(tokenUri, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: TOKEN_GRANT_TYPE, assertion }).toString(),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => String(response.status));
    throw new InternalError(`Google token exchange failed (${String(response.status)}): ${text}`);
  }

  const json = (await response.json()) as GoogleTokenResponse;
  if (typeof json.id_token === 'string' && json.id_token) return json.id_token;
  if (typeof json.error === 'string') throw new InternalError(`Google token exchange failed: ${json.error}`);
  throw new InternalError('Google token exchange did not return id_token');
}

async function postJson<T>(
  fetchImpl: FetchFn,
  endpoint: string,
  token: string,
  body: Record<string, unknown>,
  timeoutMs: number,
): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!response.ok) {
      const text = await response.text().catch(() => String(response.status));
      throw new InternalError(`Browser Agent request failed (${String(response.status)}): ${text}`);
    }
    return (await response.json()) as T;
  } finally {
    clearTimeout(timeout);
  }
}

/** Creates a typed Browser Agent client for Worker runtimes. */
export function createBrowserClient(config: BrowserClientConfig, deps: BrowserClientDeps = {}): BrowserClient {
  const agentUrl = normalizeUrl(config.agentUrl, 'BROWSER_AGENT_URL').replace(/\/$/u, '');
  const audience = normalizeUrl(config.audience, 'BROWSER_AGENT_AUDIENCE');
  const timeoutMs = config.requestTimeoutMs ?? DEFAULT_TIMEOUT_MS;
  const fetchImpl = deps.fetch ?? fetch;
  const tokenProvider = deps.getIdToken ?? ((targetAudience) => mintBrowserAgentIdToken(
    config.serviceAccountKey,
    targetAudience,
    { fetch: fetchImpl, now: deps.now },
  ));

  return {
    async scrape(url, selectors) {
      const targetUrl = normalizeUrl(url, 'url');
      const selectorCount = Object.keys(selectors).length;
      if (selectorCount === 0) throw new ValidationError('selectors must not be empty');
      const token = await tokenProvider(audience);
      deps.logger?.info('browser.scrape', { url: targetUrl, selectorCount });
      return postJson<BrowserScrapeResult>(fetchImpl, `${agentUrl}/scrape`, token, { url: targetUrl, selectors }, timeoutMs);
    },
    async screenshot(url) {
      const targetUrl = normalizeUrl(url, 'url');
      const token = await tokenProvider(audience);
      deps.logger?.info('browser.screenshot', { url: targetUrl });
      return postJson<BrowserScreenshotResult>(fetchImpl, `${agentUrl}/screenshot`, token, { url: targetUrl }, timeoutMs);
    },
  };
}
