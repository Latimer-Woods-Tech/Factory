import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

const {
  approveGraphRevisionMock,
  createGraphMock,
  deleteGraphMock,
  findGraphByIdMock,
  findGraphRevisionByIdMock,
  listGraphRevisionApprovalsMock,
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
  approveGraphRevisionMock: vi.fn(),
  createGraphMock: vi.fn(),
  deleteGraphMock: vi.fn(),
  findGraphByIdMock: vi.fn(),
  findGraphRevisionByIdMock: vi.fn(),
  listGraphRevisionApprovalsMock: vi.fn(),
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
  approveGraphRevision: approveGraphRevisionMock,
  createGraph: createGraphMock,
  deleteGraph: deleteGraphMock,
  findGraphById: findGraphByIdMock,
  findGraphRevisionById: findGraphRevisionByIdMock,
  listGraphRevisionApprovals: listGraphRevisionApprovalsMock,
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
  approveGraphRevisionMock.mockReset();
  createGraphMock.mockReset();
  deleteGraphMock.mockReset();
  findGraphByIdMock.mockReset();
  findGraphRevisionByIdMock.mockReset();
  listGraphRevisionApprovalsMock.mockReset();
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
        publishedRevisionId: 'rev-4',
        publishedRevisionNumber: 4,
        publishedRevisionHash: 'hash-4',
      },
      revisions: [
        expect.objectContaining({ id: 'rev-4', revisionNumber: 4, graphVersion: 4 }),
        expect.objectContaining({ id: 'rev-3', revisionNumber: 3, graphVersion: 3 }),
      ],
    });
    expect(listGraphRevisionsMock).toHaveBeenCalledWith(expect.anything(), 'graph-1', { limit: 2 });
  });

  it('approves an immutable revision with review context', async () => {
    const authToken = await login();
    approveGraphRevisionMock.mockResolvedValue({
      status: 'ok',
      graph: {
        id: 'graph-1',
        name: 'Sales graph',
        description: null,
        version: 4,
        currentRevisionId: 'rev-4',
        currentRevisionNumber: 4,
        currentRevisionHash: 'hash-4',
        publishedRevisionId: 'rev-3',
        publishedRevisionNumber: 3,
        publishedRevisionHash: 'hash-3',
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
        approvalId: 'approval-1',
        approvedEnvironment: 'staging',
        approvedAt: '2026-06-07T00:05:30.000Z',
        approvedBy: 'operator@example.com',
        approvalSummary: 'Reviewed topology and ready for staging compile.',
        publishedAt: null,
        publishedBy: null,
      },
      approval: {
        id: 'approval-1',
        graphId: 'graph-1',
        revisionId: 'rev-4',
        targetEnvironment: 'staging',
        mutationClass: 'graph-revision-publish',
        summary: 'Reviewed topology and ready for staging compile.',
        approvedBy: 'operator@example.com',
        approvedAt: '2026-06-07T00:05:30.000Z',
        expiresAt: null,
      },
    });

    const res = await worker.fetch(
      new Request('https://admin-studio.example/capabilities/graphs/graph-1/revisions/rev-4/approve', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${authToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ summary: 'Reviewed topology and ready for staging compile.' }),
      }),
      buildEnv({ STUDIO_ENV: 'staging' }),
      executionContext,
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      revision: {
        id: 'rev-4',
        approvedBy: 'operator@example.com',
        approvalSummary: 'Reviewed topology and ready for staging compile.',
      },
      approval: {
        id: 'approval-1',
        targetEnvironment: 'staging',
        mutationClass: 'graph-revision-publish',
      },
    });
    expect(approveGraphRevisionMock).toHaveBeenCalledWith(expect.anything(), 'graph-1', 'rev-4', {
      approvedBy: 'operator@example.com',
      approvalSummary: 'Reviewed topology and ready for staging compile.',
      env: 'staging',
    });
  });

  it('lists append-only approval records for a revision', async () => {
    const authToken = await login();
    findGraphByIdMock.mockResolvedValue({
      id: 'graph-1',
      name: 'Sales graph',
      description: null,
      version: 4,
      currentRevisionId: 'rev-4',
      currentRevisionNumber: 4,
      currentRevisionHash: 'hash-4',
      publishedRevisionId: null,
      publishedRevisionNumber: null,
      publishedRevisionHash: null,
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
      nodes: [],
      edges: [],
      contentHash: 'hash-4',
      createdBy: 'operator@example.com',
      createdAt: '2026-06-07T00:05:00.000Z',
      approvalId: 'approval-1',
      approvedEnvironment: 'staging',
      approvedAt: '2026-06-07T00:05:30.000Z',
      approvedBy: 'reviewer@example.com',
      approvalSummary: 'Reviewed topology and ready for staging compile.',
      publishedAt: null,
      publishedBy: null,
    });
    listGraphRevisionApprovalsMock.mockResolvedValue([
      {
        id: 'approval-1',
        graphId: 'graph-1',
        revisionId: 'rev-4',
        targetEnvironment: 'staging',
        mutationClass: 'graph-revision-publish',
        summary: 'Reviewed topology and ready for staging compile.',
        approvedBy: 'reviewer@example.com',
        approvedAt: '2026-06-07T00:05:30.000Z',
        expiresAt: null,
      },
    ]);

    const res = await worker.fetch(
      new Request('https://admin-studio.example/capabilities/graphs/graph-1/revisions/rev-4/approvals', {
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
      revision: {
        id: 'rev-4',
        revisionNumber: 4,
      },
      approvals: [
        expect.objectContaining({
          id: 'approval-1',
          targetEnvironment: 'staging',
          approvedBy: 'reviewer@example.com',
        }),
      ],
    });
    expect(listGraphRevisionApprovalsMock).toHaveBeenCalledWith(expect.anything(), 'graph-1', 'rev-4');
  });

  it('rejects production self-approval of a revision', async () => {
    const authToken = await signTestJwt({
      env: 'production',
      userId: 'operator@example.com',
      userEmail: 'operator@example.com',
    });
    approveGraphRevisionMock.mockResolvedValue({
      status: 'self_approval_forbidden',
    });

    const res = await worker.fetch(
      new Request('https://admin-studio.example/capabilities/graphs/graph-1/revisions/rev-4/approve', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${authToken}`,
          'Content-Type': 'application/json',
          'X-Confirmed': 'true',
        },
        body: JSON.stringify({ summary: 'Reviewed topology and ready for production.' }),
      }),
      buildEnv({ STUDIO_ENV: 'production' }),
      executionContext,
    );

    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toMatchObject({
      error: 'Production revisions must be approved by a different principal than the author',
    });
    expect(approveGraphRevisionMock).toHaveBeenCalledWith(expect.anything(), 'graph-1', 'rev-4', {
      approvedBy: 'operator@example.com',
      approvalSummary: 'Reviewed topology and ready for production.',
      env: 'production',
    });
  });

  it('rejects replacing an existing revision approval', async () => {
    const authToken = await login();
    approveGraphRevisionMock.mockResolvedValue({
      status: 'revision_already_approved',
    });

    const res = await worker.fetch(
      new Request('https://admin-studio.example/capabilities/graphs/graph-1/revisions/rev-4/approve', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${authToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ summary: 'Attempted replacement approval.' }),
      }),
      buildEnv({ STUDIO_ENV: 'staging' }),
      executionContext,
    );

    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toMatchObject({
      error: 'Revision has already been approved',
    });
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
        approvedAt: '2026-06-07T00:05:30.000Z',
        approvedBy: 'operator@example.com',
        approvalSummary: 'Reviewed topology and ready for staging compile.',
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
      env: 'staging',
    });
  });

  it('rejects publishing an unapproved revision', async () => {
    const authToken = await login();
    publishGraphRevisionMock.mockResolvedValue({
      status: 'revision_not_approved',
    });

    const res = await worker.fetch(
      new Request('https://admin-studio.example/capabilities/graphs/graph-1/publish', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${authToken}`,
          'Content-Type': 'application/json',
          'X-Confirmed': 'true',
        },
        body: JSON.stringify({ revisionId: 'rev-4' }),
      }),
      buildEnv({ STUDIO_ENV: 'staging' }),
      executionContext,
    );

    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toMatchObject({
      error: 'Revision must be approved before publishing',
    });
  });

  it('rejects publishing with an approval scoped to another environment', async () => {
    const authToken = await login();
    publishGraphRevisionMock.mockResolvedValue({
      status: 'approval_environment_mismatch',
    });

    const res = await worker.fetch(
      new Request('https://admin-studio.example/capabilities/graphs/graph-1/publish', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${authToken}`,
          'Content-Type': 'application/json',
          'X-Confirmed': 'true',
        },
        body: JSON.stringify({ revisionId: 'rev-4' }),
      }),
      buildEnv({ STUDIO_ENV: 'staging' }),
      executionContext,
    );

    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toMatchObject({
      error: 'Revision approval does not match the requested environment',
    });
  });

  it('publishes an explicitly selected immutable revision', async () => {
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
        publishedRevisionId: 'rev-3',
        publishedRevisionNumber: 3,
        publishedRevisionHash: 'hash-3',
        nodes: [],
        edges: [],
        compiledPlan: null,
        compiledAt: null,
        createdBy: 'operator@example.com',
        createdAt: '2026-06-07T00:00:00.000Z',
        updatedAt: '2026-06-07T00:05:00.000Z',
      },
      revision: {
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
        approvedAt: '2026-06-07T00:04:30.000Z',
        approvedBy: 'operator@example.com',
        approvalSummary: 'Reverted to the last known stable topology.',
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
        body: JSON.stringify({ revisionId: 'rev-3' }),
      }),
      buildEnv({ STUDIO_ENV: 'staging' }),
      executionContext,
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      graph: {
        id: 'graph-1',
        publishedRevisionId: 'rev-3',
        publishedRevisionNumber: 3,
      },
      revision: {
        id: 'rev-3',
        revisionNumber: 3,
      },
    });
    expect(publishGraphRevisionMock).toHaveBeenCalledWith(expect.anything(), 'graph-1', {
      revisionId: 'rev-3',
      publishedBy: 'operator@example.com',
      env: 'staging',
    });
  });

  it('rejects production publish by the same principal that approved the revision', async () => {
    const authToken = await signTestJwt({
      env: 'production',
      userId: 'reviewer@example.com',
      userEmail: 'reviewer@example.com',
    });
    publishGraphRevisionMock.mockResolvedValue({
      status: 'publisher_must_differ_from_approver',
    });
    const confirmToken = await expectedConfirmToken(
      'capabilities.graph.publish',
      'reviewer@example.com',
      'production',
    );

    const res = await worker.fetch(
      new Request('https://admin-studio.example/capabilities/graphs/graph-1/publish', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${authToken}`,
          'Content-Type': 'application/json',
          'X-Confirm-Token': confirmToken,
        },
        body: JSON.stringify({ revisionId: 'rev-4' }),
      }),
      buildEnv({ STUDIO_ENV: 'production' }),
      executionContext,
    );

    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toMatchObject({
      error: 'Production revisions must be published by a different principal than the approver',
    });
    expect(publishGraphRevisionMock).toHaveBeenCalledWith(expect.anything(), 'graph-1', {
      revisionId: 'rev-4',
      publishedBy: 'reviewer@example.com',
      env: 'production',
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
        approvedAt: '2026-06-07T00:05:30.000Z',
        approvedBy: 'operator@example.com',
        approvalSummary: 'Reviewed topology and ready for staging compile.',
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
        approvedAt: '2026-06-07T00:05:30.000Z',
        approvedBy: 'operator@example.com',
        approvalSummary: 'Reviewed topology and ready for staging compile.',
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

async function signTestJwt(input: {
  env: 'local' | 'staging' | 'production';
  userId: string;
  userEmail: string;
}): Promise<string> {
  const nowSeconds = Math.floor(Date.now() / 1000);
  const header = base64UrlEncode(new TextEncoder().encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' })));
  const payload = base64UrlEncode(new TextEncoder().encode(JSON.stringify({
    env: input.env,
    sessionId: crypto.randomUUID(),
    userId: input.userId,
    userEmail: input.userEmail,
    role: 'owner',
    envLockedAt: Date.now(),
    iat: nowSeconds,
    exp: nowSeconds + 3600,
    iss: 'factory-admin-studio',
    sub: input.userId,
  })));
  const data = new TextEncoder().encode(`${header}.${payload}`);
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode('test-jwt-secret-with-enough-entropy'),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, data);
  return `${header}.${payload}.${base64UrlEncode(new Uint8Array(signature))}`;
}

async function expectedConfirmToken(action: string, userId: string, env: string): Promise<string> {
  return (await sha256Hex(`${action}:${userId}:${env}`)).slice(0, 16);
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
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
