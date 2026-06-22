import { beforeAll, describe, expect, it } from 'vitest';
import worker from '../index.js';
import type { Env } from '../env.js';

const password = 'correct-password';
let passwordHash = '';

const executionContext = {} as ExecutionContext;

beforeAll(async () => {
  passwordHash = await sha256Hex(password);
});

describe('admin-studio auth', () => {
  it('disables bootstrap login in production', async () => {
    const res = await postLogin(
      { email: 'operator@example.com', password, env: 'production' },
    );

    expect(res.status).toBe(503);
    await expect(res.json()).resolves.toEqual({
      error: 'Studio bootstrap login is disabled in production',
    });
  });

  it('rejects login when bootstrap credentials are not configured outside production', async () => {
    const res = await postLogin(
      { email: 'operator@example.com', password, env: 'staging' },
      { STUDIO_ENV: 'staging', STUDIO_ADMIN_PASSWORD_SHA256: '' },
    );

    expect(res.status).toBe(503);
    await expect(res.json()).resolves.toEqual({
      error: 'Studio bootstrap credentials are not configured',
    });
  });

  it('rejects invalid bootstrap credentials without issuing a token', async () => {
    const res = await postLogin({
      email: 'operator@example.com',
      password: 'wrong-password',
      env: 'staging',
    }, { STUDIO_ENV: 'staging' });

    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({ error: 'Invalid credentials' });
  });

  it('issues an env-locked token for configured bootstrap credentials', async () => {
    const login = await postLogin({
      email: ' OPERATOR@example.com ',
      password,
      env: 'staging',
      app: 'factory',
    }, { STUDIO_ENV: 'staging' });

    expect(login.status).toBe(200);
    const body = await login.json<LoginResponse>();
    expect(typeof body.token).toBe('string');
    expect(body.expiresAt).toBeGreaterThan(Date.now());

    const me = await worker.fetch(
      new Request('https://admin-studio.example/me', {
        headers: { Authorization: `Bearer ${body.token}` },
      }),
      buildEnv({ STUDIO_ENV: 'staging' }),
      executionContext,
    );
    expect(me.status).toBe(200);
    await expect(me.json()).resolves.toMatchObject({
      env: 'staging',
      app: 'factory',
      user: { email: 'operator@example.com', role: 'owner' },
    });
  });

  it('refuses to issue tokens for a different worker environment', async () => {
    const res = await postLogin(
      {
        email: 'operator@example.com',
        password,
        env: 'production',
      },
      { STUDIO_ENV: 'staging' },
    );

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({
      error: "This studio worker only issues tokens for env 'staging'",
    });
  });
});

interface LoginResponse {
  token: string;
  expiresAt: number;
}

type EnvOverride = Partial<Pick<Env, 'STUDIO_ADMIN_EMAIL' | 'STUDIO_ADMIN_PASSWORD_SHA256' | 'STUDIO_ENV'>>;

async function postLogin(body: Record<string, unknown>, envOverride: EnvOverride = {}): Promise<Response> {
  return worker.fetch(
    new Request('https://admin-studio.example/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
    buildEnv(envOverride),
    executionContext,
  );
}

function buildEnv(envOverride: EnvOverride = {}): Env {
  return {
    STUDIO_ENV: 'production',
    ALLOWED_ORIGINS: 'https://admin-studio.example',
    DB: { connectionString: 'postgres://example' } as Env['DB'],
    JWT_SECRET: 'test-jwt-secret-with-enough-entropy',
    STUDIO_ADMIN_EMAIL: 'operator@example.com',
    STUDIO_ADMIN_PASSWORD_SHA256: passwordHash,
    STUDIO_GOOGLE_WORKSPACE_DOMAIN: 'latwoodtech.com',
    GITHUB_TOKEN: 'github-token',
    ANTHROPIC_API_KEY: 'anthropic-key',
    ...envOverride,
  };
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}
