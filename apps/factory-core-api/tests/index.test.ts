import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import app from '../src/index.js';
import { resetJwksCache } from '../src/oidc.js';
import { verifyScopedToken } from '../src/jwt.js';
import { createTestOidcKey, validClaims, type TestOidcKey } from './helpers.js';

const SIGNING_KEY = 'test-root-signing-key-0123456789';

function baseEnv(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    JWT_SIGNING_KEY: SIGNING_KEY,
    OIDC_ISSUER: 'https://oidc.test',
    OIDC_AUDIENCE: 'factory-core-api',
    GITHUB_OWNER: 'Latimer-Woods-Tech',
    ENVIRONMENT: 'test',
    ...overrides,
  };
}

function makeCtx(): ExecutionContext {
  return {
    waitUntil: vi.fn((p: Promise<unknown>) => {
      p.catch(() => {});
    }),
    passThroughOnException: vi.fn(),
  } as unknown as ExecutionContext;
}

function tokenRequest(oidcToken: string | null, body: unknown): Request {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (oidcToken) {
    headers['authorization'] = `Bearer ${oidcToken}`;
  }
  return new Request('https://factory-core-api.test/v1/auth/token', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
}

let key: TestOidcKey;

beforeEach(async () => {
  resetJwksCache();
  key = await createTestOidcKey();
  vi.spyOn(globalThis, 'fetch').mockImplementation(
    async () => new Response(JSON.stringify(key.jwks), { status: 200 }),
  );
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('factory-core-api worker', () => {
  it('GET /health returns 200 with the service name', async () => {
    const res = await app.fetch(new Request('https://factory-core-api.test/health'), baseEnv(), makeCtx());
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body['status']).toBe('ok');
    expect(body['service']).toBe('factory-core-api');
  });

  it('GET /version reports the build SHA', async () => {
    const dev = await app.fetch(new Request('https://factory-core-api.test/version'), baseEnv(), makeCtx());
    expect(((await dev.json()) as Record<string, unknown>)['sha']).toBe('dev');

    const tagged = await app.fetch(
      new Request('https://factory-core-api.test/version'),
      baseEnv({ BUILD_SHA: 'abc1234' }),
      makeCtx(),
    );
    expect(((await tagged.json()) as Record<string, unknown>)['sha']).toBe('abc1234');
  });

  it('unknown routes return 404', async () => {
    const res = await app.fetch(new Request('https://factory-core-api.test/nope'), baseEnv(), makeCtx());
    expect(res.status).toBe(404);
  });

  it('POST /v1/auth/token mints a scoped JWT from a valid OIDC token', async () => {
    const oidcToken = await key.sign(validClaims());
    const res = await app.fetch(tokenRequest(oidcToken, { audience: 'gates-ci' }), baseEnv(), makeCtx());
    expect(res.status).toBe(200);

    const body = (await res.json()) as Record<string, string | number>;
    expect(body['audience']).toBe('gates-ci');
    expect(body['token_type']).toBe('Bearer');
    expect(body['expires_in']).toBe(600);

    const verified = await verifyScopedToken(String(body['token']), SIGNING_KEY);
    expect(verified.aud).toBe('gates-ci');
    expect(verified.iss).toBe('factory-core-api');
    expect(verified.repository_owner).toBe('Latimer-Woods-Tech');
  });

  it('returns 401 when the OIDC bearer token is missing', async () => {
    const res = await app.fetch(tokenRequest(null, { audience: 'gates-ci' }), baseEnv(), makeCtx());
    expect(res.status).toBe(401);
  });

  it('returns 400 for a disallowed audience', async () => {
    const oidcToken = await key.sign(validClaims());
    const res = await app.fetch(tokenRequest(oidcToken, { audience: 'deploy-prod' }), baseEnv(), makeCtx());
    expect(res.status).toBe(400);
  });

  it('returns 400 when the audience is missing from the body', async () => {
    const oidcToken = await key.sign(validClaims());
    const res = await app.fetch(tokenRequest(oidcToken, {}), baseEnv(), makeCtx());
    expect(res.status).toBe(400);
  });

  it('returns 401 when the OIDC token is from an unauthorized owner', async () => {
    const oidcToken = await key.sign(validClaims({ repository_owner: 'someone-else' }));
    const res = await app.fetch(tokenRequest(oidcToken, { audience: 'gates-ci' }), baseEnv(), makeCtx());
    expect(res.status).toBe(401);
  });

  it('returns 500 when the signing key is not configured', async () => {
    const oidcToken = await key.sign(validClaims());
    const env = baseEnv();
    delete env['JWT_SIGNING_KEY'];
    const res = await app.fetch(tokenRequest(oidcToken, { audience: 'gates-ci' }), env, makeCtx());
    expect(res.status).toBe(500);
  });

  it('initialises monitoring when SENTRY_DSN is present', async () => {
    const env = baseEnv({ SENTRY_DSN: 'https://examplePublicKey@o0.ingest.sentry.io/0', BUILD_SHA: 'deadbee' });
    const res = await app.fetch(new Request('https://factory-core-api.test/health'), env, makeCtx());
    expect(res.status).toBe(200);
  });

  it('captures errors to Sentry when SENTRY_DSN is present', async () => {
    const env = baseEnv({ SENTRY_DSN: 'https://examplePublicKey@o0.ingest.sentry.io/0' });
    const res = await app.fetch(tokenRequest(null, { audience: 'gates-ci' }), env, makeCtx());
    expect(res.status).toBe(401);
  });
});
