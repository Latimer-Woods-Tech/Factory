import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

const { completeMock } = vi.hoisted(() => ({
  completeMock: vi.fn(),
}));

vi.mock('@latimer-woods-tech/llm', () => ({
  complete: completeMock,
}));

import worker from '../index.js';
import type { Env } from '../env.js';

const password = 'correct-password';
let passwordHash = '';

const executionContext = {} as ExecutionContext;

beforeAll(async () => {
  passwordHash = await sha256Hex(password);
});

afterEach(() => {
  completeMock.mockReset();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('admin-studio ai chat route', () => {
  it('requires authentication', async () => {
    const res = await worker.fetch(
      new Request('https://admin-studio.example/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'generate',
          history: [{ role: 'user', content: 'hello', at: new Date().toISOString() }],
        }),
      }),
      buildEnv(),
      executionContext,
    );

    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toMatchObject({ error: 'Missing bearer token' });
  });

  it('validates chat payload shape after auth', async () => {
    const authToken = await login();
    const res = await worker.fetch(
      new Request('https://admin-studio.example/ai/chat', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${authToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ mode: 'generate', history: [] }),
      }),
      buildEnv(),
      executionContext,
    );

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: 'history required' });
  });

  it('streams planning-strategy responses for authenticated operators', async () => {
    const authToken = await login();
    completeMock.mockResolvedValue({
      data: {
        content: 'SMOKE_OK',
        provider: 'vertex',
        model: 'gemini-2.5-pro',
        tokens: { input: 12, output: 3 },
      },
    });

    const res = await worker.fetch(
      new Request('https://admin-studio.example/ai/chat', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${authToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          mode: 'generate',
          modelStrategy: 'planning',
          history: [{ role: 'user', content: 'Reply with SMOKE_OK', at: new Date().toISOString() }],
        }),
      }),
      buildEnv({
        AI_GATEWAY_BASE_URL: 'https://gateway.example.com',
        VERTEX_ACCESS_TOKEN: 'vertex-token',
        VERTEX_PROJECT: 'factory-test',
        VERTEX_LOCATION: 'us-central1',
      }),
      executionContext,
    );

    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toContain('text/event-stream');
    await expect(res.text()).resolves.toContain('SMOKE_OK');
    expect(completeMock).toHaveBeenCalled();
  });

  it('stops execution chat after the bounded tool-use budget is exhausted', async () => {
    const authToken = await login();
    const upstreamMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(JSON.stringify({
      content: [
        {
          type: 'tool_use',
          id: 'tool-call',
          name: 'github_list_prs',
          input: {},
        },
      ],
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }));
    vi.stubGlobal('fetch', upstreamMock);

    const res = await worker.fetch(
      new Request('https://admin-studio.example/ai/chat', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${authToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          mode: 'generate',
          modelStrategy: 'execution',
          history: [{ role: 'user', content: 'Keep using tools forever', at: new Date().toISOString() }],
        }),
      }),
      buildEnv({ GITHUB_TOKEN: undefined as unknown as string }),
      executionContext,
    );

    expect(res.status).toBe(502);
    await expect(res.json()).resolves.toEqual({
      error: 'agent loop limit exceeded',
      maxLoops: 4,
    });
    expect(upstreamMock).toHaveBeenCalledTimes(4);

    const firstInit = upstreamMock.mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(String(firstInit.body))).toMatchObject({ max_tokens: 2048 });
  });
});

async function login(): Promise<string> {
  const res = await worker.fetch(
    new Request('https://admin-studio.example/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'operator@example.com',
        password,
        env: 'production',
      }),
    }),
    buildEnv(),
    executionContext,
  );

  const body = await res.json<{ token: string }>();
  return body.token;
}

function buildEnv(envOverride: Partial<Env> = {}): Env {
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
