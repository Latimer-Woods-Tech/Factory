import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

const {
  createGraphMock,
  deleteGraphMock,
  findGraphByIdMock,
  listGraphsMock,
  saveCompiledPlanMock,
  updateGraphLayoutMock,
} = vi.hoisted(() => ({
  createGraphMock: vi.fn(),
  deleteGraphMock: vi.fn(),
  findGraphByIdMock: vi.fn(),
  listGraphsMock: vi.fn(),
  saveCompiledPlanMock: vi.fn(),
  updateGraphLayoutMock: vi.fn(),
}));

vi.mock('../lib/graph-store.js', () => ({
  createGraph: createGraphMock,
  deleteGraph: deleteGraphMock,
  findGraphById: findGraphByIdMock,
  listGraphs: listGraphsMock,
  saveCompiledPlan: saveCompiledPlanMock,
  updateGraphLayout: updateGraphLayoutMock,
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
  createGraphMock.mockReset();
  deleteGraphMock.mockReset();
  findGraphByIdMock.mockReset();
  listGraphsMock.mockReset();
  saveCompiledPlanMock.mockReset();
  updateGraphLayoutMock.mockReset();
  vi.restoreAllMocks();
});

describe('capability graph routes', () => {
  it('rejects malformed graph patch payloads before store mutation', async () => {
    const authToken = await login();

    const res = await worker.fetch(
      new Request('https://admin-studio.example/capabilities/graphs/graph-1', {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${authToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          expectedVersion: 2,
          nodes: 'not-an-array',
        }),
      }),
      buildEnv({ STUDIO_ENV: 'staging' }),
      executionContext,
    );

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({
      error: 'nodes must be an array',
      issues: [
        expect.objectContaining({ field: 'nodes', message: 'nodes must be an array' }),
      ],
    });
    expect(updateGraphLayoutMock).not.toHaveBeenCalled();
  });

  it('returns a 409 conflict with current graph state when expectedVersion is stale', async () => {
    const authToken = await login();
    updateGraphLayoutMock.mockResolvedValue({
      status: 'conflict',
      currentGraph: {
        id: 'graph-1',
        name: 'Sales graph',
        description: null,
        version: 4,
        nodes: [],
        edges: [],
        compiledPlan: null,
        compiledAt: null,
        createdBy: 'operator@example.com',
        createdAt: '2026-06-07T00:00:00.000Z',
        updatedAt: '2026-06-07T00:05:00.000Z',
      },
    });

    const res = await worker.fetch(
      new Request('https://admin-studio.example/capabilities/graphs/graph-1', {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${authToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          expectedVersion: 3,
          nodes: [],
          edges: [],
        }),
      }),
      buildEnv({ STUDIO_ENV: 'staging' }),
      executionContext,
    );

    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toMatchObject({
      error: 'Graph was updated by another session. Refresh and try again.',
      currentVersion: 4,
      graph: expect.objectContaining({
        id: 'graph-1',
        version: 4,
      }),
    });
    expect(updateGraphLayoutMock).toHaveBeenCalledWith(
      expect.anything(),
      'graph-1',
      expect.objectContaining({
        expectedVersion: 3,
        nodes: [],
        edges: [],
      }),
    );
  });
});

async function login(): Promise<string> {
  const response = await worker.fetch(
    new Request('https://admin-studio.example/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'operator@example.com',
        password,
        env: 'staging',
      }),
    }),
    buildEnv({ STUDIO_ENV: 'staging' }),
    executionContext,
  );

  const body = await response.json<{ token: string }>();
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
