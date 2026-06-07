import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

const {
  createGraphMock,
  deleteGraphMock,
  findGraphByIdMock,
  findGraphRevisionByIdMock,
  listGraphsMock,
  listGraphRevisionsMock,
  publishGraphRevisionMock,
  saveCompiledPlanMock,
  updateGraphLayoutMock,
  persistHandoffMock,
  findHandoffByIdMock,
  findHandoffByHashMock,
  findProvisionRequestByIdMock,
  findServiceByServiceIdMock,
  listHandoffsMock,
  listProvisionRequestsMock,
  listServicesMock,
  recordProvisionRequestMock,
  touchServiceDriftCheckMock,
  transitionProvisionRequestMock,
  upsertServiceMock,
  validateProofGatesMock,
} = vi.hoisted(() => ({
  createGraphMock: vi.fn(),
  deleteGraphMock: vi.fn(),
  findGraphByIdMock: vi.fn(),
  findGraphRevisionByIdMock: vi.fn(),
  listGraphsMock: vi.fn(),
  listGraphRevisionsMock: vi.fn(),
  publishGraphRevisionMock: vi.fn(),
  saveCompiledPlanMock: vi.fn(),
  updateGraphLayoutMock: vi.fn(),
  persistHandoffMock: vi.fn(),
  findHandoffByIdMock: vi.fn(),
  findHandoffByHashMock: vi.fn(),
  findProvisionRequestByIdMock: vi.fn(),
  findServiceByServiceIdMock: vi.fn(),
  listHandoffsMock: vi.fn(),
  listProvisionRequestsMock: vi.fn(),
  listServicesMock: vi.fn(),
  recordProvisionRequestMock: vi.fn(),
  touchServiceDriftCheckMock: vi.fn(),
  transitionProvisionRequestMock: vi.fn(),
  upsertServiceMock: vi.fn(),
  validateProofGatesMock: vi.fn(),
}));

vi.mock('../lib/graph-store.js', () => ({
  createGraph: createGraphMock,
  deleteGraph: deleteGraphMock,
  findGraphById: findGraphByIdMock,
  findGraphRevisionById: findGraphRevisionByIdMock,
  listGraphs: listGraphsMock,
  listGraphRevisions: listGraphRevisionsMock,
  publishGraphRevision: publishGraphRevisionMock,
  saveCompiledPlan: saveCompiledPlanMock,
  updateGraphLayout: updateGraphLayoutMock,
}));

vi.mock('../lib/handoff-store.js', () => ({
  findHandoffByHash: findHandoffByHashMock,
  findHandoffById: findHandoffByIdMock,
  findProvisionRequestById: findProvisionRequestByIdMock,
  findServiceByServiceId: findServiceByServiceIdMock,
  listHandoffs: listHandoffsMock,
  listProvisionRequests: listProvisionRequestsMock,
  listServices: listServicesMock,
  persistHandoff: persistHandoffMock,
  recordProvisionRequest: recordProvisionRequestMock,
  touchServiceDriftCheck: touchServiceDriftCheckMock,
  transitionProvisionRequest: transitionProvisionRequestMock,
  upsertService: upsertServiceMock,
  validateProofGates: validateProofGatesMock,
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
  findGraphRevisionByIdMock.mockReset();
  listGraphsMock.mockReset();
  listGraphRevisionsMock.mockReset();
  publishGraphRevisionMock.mockReset();
  saveCompiledPlanMock.mockReset();
  updateGraphLayoutMock.mockReset();
  persistHandoffMock.mockReset();
  findHandoffByIdMock.mockReset();
  findHandoffByHashMock.mockReset();
  findProvisionRequestByIdMock.mockReset();
  findServiceByServiceIdMock.mockReset();
  listHandoffsMock.mockReset();
  listProvisionRequestsMock.mockReset();
  listServicesMock.mockReset();
  recordProvisionRequestMock.mockReset();
  touchServiceDriftCheckMock.mockReset();
  transitionProvisionRequestMock.mockReset();
  upsertServiceMock.mockReset();
  validateProofGatesMock.mockReset();
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
        currentRevisionId: 'rev-4',
        currentRevisionNumber: 4,
        currentRevisionHash: 'sha256:rev-4',
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
        updatedBy: 'operator@example.com',
      }),
    );
  });

  it('lists immutable graph revisions for the selected graph', async () => {
    const authToken = await login();
    findGraphByIdMock.mockResolvedValue({
      id: 'graph-1',
      name: 'Sales graph',
      description: null,
      version: 4,
      currentRevisionId: 'rev-4',
      currentRevisionNumber: 4,
      currentRevisionHash: 'hash-4',
      publishedRevisionId: 'rev-4',
      publishedRevisionNumber: 4,
      publishedRevisionHash: 'hash-4',
      nodes: [],
      edges: [],
      compiledPlan: null,
      compiledAt: null,
      createdBy: 'operator@example.com',
      createdAt: '2026-06-07T00:00:00.000Z',
      updatedAt: '2026-06-07T00:05:00.000Z',
    });
    listGraphRevisionsMock.mockResolvedValue([
      {
        id: 'rev-4',
        graphId: 'graph-1',
        revisionNumber: 4,
        graphVersion: 4,
        name: 'Sales graph',
        description: null,
        nodes: [],
        edges: [],
        contentHash: 'hash-4',
        createdBy: 'operator@example.com',
        createdAt: '2026-06-07T00:05:00.000Z',
      },
      {
        id: 'rev-3',
        graphId: 'graph-1',
        revisionNumber: 3,
        graphVersion: 3,
        name: 'Sales graph',
        description: null,
        nodes: [],
        edges: [],
        contentHash: 'hash-3',
        createdBy: 'operator@example.com',
        createdAt: '2026-06-07T00:04:00.000Z',
      },
    ]);

    const res = await worker.fetch(
      new Request('https://admin-studio.example/capabilities/graphs/graph-1/revisions?limit=2', {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      }),
      buildEnv({ STUDIO_ENV: 'staging' }),
      executionContext,
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      graph: {
        id: 'graph-1',
        currentRevisionId: 'rev-4',
        currentRevisionNumber: 4,
        currentRevisionHash: 'hash-4',
      },
      revisions: [
        expect.objectContaining({ id: 'rev-4', revisionNumber: 4, graphVersion: 4 }),
        expect.objectContaining({ id: 'rev-3', revisionNumber: 3, graphVersion: 3 }),
      ],
    });
    expect(listGraphRevisionsMock).toHaveBeenCalledWith(expect.anything(), 'graph-1', { limit: 2 });
  });

  it('publishes the current draft revision for execution', async () => {
    const authToken = await login();
    publishGraphRevisionMock.mockResolvedValue({
      status: 'ok',
      graph: {
        id: 'graph-1',
        name: 'Sales graph',
        description: null,
        version: 4,
        currentRevisionId: 'rev-4',
        currentRevisionNumber: 4,
        currentRevisionHash: 'hash-4',
        publishedRevisionId: 'rev-4',
        publishedRevisionNumber: 4,
        publishedRevisionHash: 'hash-4',
        nodes: [],
        edges: [],
        compiledPlan: null,
        compiledAt: null,
        createdBy: 'operator@example.com',
        createdAt: '2026-06-07T00:00:00.000Z',
        updatedAt: '2026-06-07T00:05:00.000Z',
      },
      revision: {
        id: 'rev-4',
        graphId: 'graph-1',
        revisionNumber: 4,
        graphVersion: 4,
        name: 'Sales graph',
        description: null,
        nodes: [],
        edges: [],
        contentHash: 'hash-4',
        createdBy: 'operator@example.com',
        createdAt: '2026-06-07T00:05:00.000Z',
        publishedAt: '2026-06-07T00:06:00.000Z',
        publishedBy: 'operator@example.com',
      },
    });

    const res = await worker.fetch(
      new Request('https://admin-studio.example/capabilities/graphs/graph-1/publish', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${authToken}`,
          'Content-Type': 'application/json',
          'X-Confirmed': 'true',
        },
        body: JSON.stringify({}),
      }),
      buildEnv({ STUDIO_ENV: 'staging' }),
      executionContext,
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      graph: {
        id: 'graph-1',
        publishedRevisionId: 'rev-4',
        publishedRevisionNumber: 4,
        publishedRevisionHash: 'hash-4',
      },
      revision: {
        id: 'rev-4',
        revisionNumber: 4,
        publishedBy: 'operator@example.com',
      },
    });
    expect(publishGraphRevisionMock).toHaveBeenCalledWith(expect.anything(), 'graph-1', {
      revisionId: undefined,
      publishedBy: 'operator@example.com',
    });
  });

  it('compiles against the published immutable graph revision head', async () => {
    const authToken = await login();
    findGraphByIdMock.mockResolvedValue({
      id: 'graph-1',
      name: 'Sales graph',
      description: null,
      version: 4,
      currentRevisionId: 'rev-4',
      currentRevisionNumber: 4,
      currentRevisionHash: 'hash-4',
      publishedRevisionId: 'rev-4',
      publishedRevisionNumber: 4,
      publishedRevisionHash: 'hash-4',
      nodes: [],
      edges: [],
      compiledPlan: null,
      compiledAt: null,
      createdBy: 'operator@example.com',
      createdAt: '2026-06-07T00:00:00.000Z',
      updatedAt: '2026-06-07T00:05:00.000Z',
    });
    findGraphRevisionByIdMock.mockResolvedValue({
      id: 'rev-4',
      graphId: 'graph-1',
      revisionNumber: 4,
      graphVersion: 4,
      name: 'Sales graph',
      description: null,
      nodes: [
        {
          id: 'concept-1',
          nodeType: 'concept',
          ref: 'outbound-dialer-campaign',
          position: { x: 100, y: 100 },
          params: {
            workerDomain: 'dialer.example.com',
            campaignSource: 'csv-import',
          },
        },
      ],
      edges: [],
      contentHash: 'hash-4',
      createdBy: 'operator@example.com',
      createdAt: '2026-06-07T00:05:00.000Z',
      publishedAt: '2026-06-07T00:06:00.000Z',
      publishedBy: 'operator@example.com',
    });
    saveCompiledPlanMock.mockResolvedValue(null);

    const res = await worker.fetch(
      new Request('https://admin-studio.example/capabilities/graphs/graph-1/compile', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      }),
      buildEnv({ STUDIO_ENV: 'staging' }),
      executionContext,
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      graphId: 'graph-1',
      success: true,
      sourceGraph: {
        graphId: 'graph-1',
        revisionId: 'rev-4',
        revisionNumber: 4,
        graphVersion: 4,
        contentHash: 'hash-4',
      },
    });
    expect(findGraphRevisionByIdMock).toHaveBeenCalledWith(expect.anything(), 'rev-4');
    expect(saveCompiledPlanMock).toHaveBeenCalled();
  });

  it('pins graph-authored handoffs to the published revision provenance', async () => {
    const authToken = await login();
    findGraphByIdMock.mockResolvedValue({
      id: 'graph-1',
      name: 'Sales graph',
      description: null,
      version: 4,
      currentRevisionId: 'rev-4',
      currentRevisionNumber: 4,
      currentRevisionHash: 'hash-4',
      publishedRevisionId: 'rev-4',
      publishedRevisionNumber: 4,
      publishedRevisionHash: 'hash-4',
      nodes: [],
      edges: [],
      compiledPlan: null,
      compiledAt: null,
      createdBy: 'operator@example.com',
      createdAt: '2026-06-07T00:00:00.000Z',
      updatedAt: '2026-06-07T00:05:00.000Z',
    });
    findGraphRevisionByIdMock.mockResolvedValue({
      id: 'rev-4',
      graphId: 'graph-1',
      revisionNumber: 4,
      graphVersion: 4,
      name: 'Sales graph',
      description: null,
      nodes: [
        {
          id: 'concept-1',
          nodeType: 'concept',
          ref: 'outbound-dialer-campaign',
          position: { x: 100, y: 100 },
          params: {
            workerDomain: 'dialer.example.com',
            campaignSource: 'csv-import',
          },
        },
      ],
      edges: [],
      contentHash: 'hash-4',
      createdBy: 'operator@example.com',
      createdAt: '2026-06-07T00:05:00.000Z',
      publishedAt: '2026-06-07T00:06:00.000Z',
      publishedBy: 'operator@example.com',
    });
    persistHandoffMock.mockResolvedValue({
      id: 'handoff-1',
      kind: 'scaffold-handoff',
      hash: 'abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789',
      schemaVersion: '1.0.0',
      conceptId: 'outbound-dialer-campaign',
      recipeId: 'outbound-dialer-importer',
      parameters: {
        workerDomain: 'dialer.example.com',
        campaignSource: 'csv-import',
      },
      plan: {
        schemaVersion: '1.0.0',
        recipeId: 'outbound-dialer-importer',
        packages: [],
        secrets: [],
        vars: [],
        scaffold: { stagingFirst: true, notes: [] },
      },
      preview: 'preview',
      nextAction: {
        action: 'request-staging-provision',
        conceptId: 'outbound-dialer-campaign',
        recipeId: 'outbound-dialer-importer',
      },
      sourceGraph: {
        graphId: 'graph-1',
        revisionId: 'rev-4',
        revisionNumber: 4,
        graphVersion: 4,
        contentHash: 'hash-4',
      },
      createdAt: '2026-06-07T00:06:00.000Z',
      createdBy: 'operator@example.com',
      env: 'staging',
    });

    const res = await worker.fetch(
      new Request('https://admin-studio.example/capabilities/graphs/graph-1/handoff', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      }),
      buildEnv({ STUDIO_ENV: 'staging' }),
      executionContext,
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      handoff: {
        id: 'handoff-1',
        sourceGraph: {
          graphId: 'graph-1',
          revisionId: 'rev-4',
          revisionNumber: 4,
          graphVersion: 4,
          contentHash: 'hash-4',
        },
      },
    });
    expect(persistHandoffMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        sourceGraph: {
          graphId: 'graph-1',
          revisionId: 'rev-4',
          revisionNumber: 4,
          graphVersion: 4,
          contentHash: 'hash-4',
        },
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
