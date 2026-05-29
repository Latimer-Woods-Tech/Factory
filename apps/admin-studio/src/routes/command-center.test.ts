/**
 * Unit tests for command-center fetch helpers (P2.13).
 *
 * Mocks createDb to avoid live DB connections.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchRuns, fetchArtifacts, fetchGates } from './command-center.js';
import { createDb } from '@latimer-woods-tech/neon';

vi.mock('@latimer-woods-tech/neon', async (importOriginal) => {
  const real = await importOriginal<typeof import('@latimer-woods-tech/neon')>();
  return { ...real, createDb: vi.fn() };
});

const mockExecute = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(createDb).mockReturnValue({ execute: mockExecute } as unknown as ReturnType<typeof createDb>);
});

// ── fetchRuns ─────────────────────────────────────────────────────────────────

const FAKE_RUN = {
  id: 'run-uuid-001',
  template_id: 'scaffold-app',
  template_version: 1,
  description: 'Scaffold new app',
  source: 'github:issue',
  status: 'passed',
  dry_run: false,
  pr_url: 'https://github.com/org/repo/pull/1',
  started_at: '2026-05-26T10:00:00+00',
  finished_at: '2026-05-26T10:05:00+00',
  mirrored_at: '2026-05-26T10:06:00+00',
  gates_passed: 3,
  gates_failed: 0,
  gates_pending: 0,
  last_gate_observed_at: '2026-05-26T10:04:00+00',
  deploy_url: 'https://app.example.com',
};

describe('fetchRuns', () => {
  it('returns empty array when factoryDb is null', async () => {
    const rows = await fetchRuns(null);
    expect(rows).toEqual([]);
    expect(createDb).not.toHaveBeenCalled();
  });

  it('returns empty array when factoryDb is undefined', async () => {
    const rows = await fetchRuns(undefined);
    expect(rows).toEqual([]);
  });

  it('returns rows from factory_runs_v', async () => {
    mockExecute.mockResolvedValue({ rows: [FAKE_RUN] });
    const rows = await fetchRuns({ connectionString: 'postgres://test' });
    expect(rows).toEqual([FAKE_RUN]);
    expect(mockExecute).toHaveBeenCalledOnce();
  });

  it('returns empty array when view has no rows', async () => {
    mockExecute.mockResolvedValue({ rows: [] });
    const rows = await fetchRuns({ connectionString: 'postgres://test' });
    expect(rows).toEqual([]);
  });

  it('passes custom limit and offset', async () => {
    mockExecute.mockResolvedValue({ rows: [] });
    await fetchRuns({ connectionString: 'postgres://test' }, { limit: 10, offset: 20 });
    expect(mockExecute).toHaveBeenCalledOnce();
  });

  it('propagates DB errors', async () => {
    mockExecute.mockRejectedValue(new Error('connection refused'));
    await expect(
      fetchRuns({ connectionString: 'postgres://test' }),
    ).rejects.toThrow('connection refused');
  });
});

// ── fetchGates ────────────────────────────────────────────────────────────────

const FAKE_GATE = {
  id: 'gate-uuid-001',
  ingest_event_id: 'event-uuid-001',
  gate_type: 'ci',
  source_system: 'github-actions',
  source_ref: 'run/123',
  subject_type: 'pr',
  subject_repo: 'Org/Repo',
  subject_ref: 'pr/42',
  state: 'passed',
  evidence_url: 'https://github.com/runs/123',
  evidence_summary: { conclusion: 'success' },
  observed_at: '2026-05-26T10:00:00+00',
  ingested_at: '2026-05-26T10:00:01+00',
};

describe('fetchGates', () => {
  it('returns empty array when factoryDb is null', async () => {
    const rows = await fetchGates(null);
    expect(rows).toEqual([]);
    expect(createDb).not.toHaveBeenCalled();
  });

  it('returns empty array when factoryDb is undefined', async () => {
    const rows = await fetchGates(undefined);
    expect(rows).toEqual([]);
  });

  it('returns rows from factory_gates', async () => {
    mockExecute.mockResolvedValue({ rows: [FAKE_GATE] });
    const rows = await fetchGates({ connectionString: 'postgres://test' });
    expect(rows).toEqual([FAKE_GATE]);
    expect(mockExecute).toHaveBeenCalledOnce();
  });

  it('returns empty array when table has no rows', async () => {
    mockExecute.mockResolvedValue({ rows: [] });
    const rows = await fetchGates({ connectionString: 'postgres://test' });
    expect(rows).toEqual([]);
  });

  it('passes custom limit and offset', async () => {
    mockExecute.mockResolvedValue({ rows: [] });
    await fetchGates({ connectionString: 'postgres://test' }, { limit: 25, offset: 50 });
    expect(mockExecute).toHaveBeenCalledOnce();
  });

  it('propagates DB errors', async () => {
    mockExecute.mockRejectedValue(new Error('db timeout'));
    await expect(
      fetchGates({ connectionString: 'postgres://test' }),
    ).rejects.toThrow('db timeout');
  });
});

// ── fetchArtifacts ────────────────────────────────────────────────────────────

const FAKE_ARTIFACT = {
  id: 'art-uuid-001',
  artifact_type: 'deploy-url',
  producer_type: 'cloudflare-deploy',
  producer_ref: 'run/456',
  subject_app: 'capricast',
  subject_repo: 'Org/capricast',
  subject_ref: 'production',
  uri: 'https://capricast.com',
  uri_scheme: 'https',
  checksum: null,
  size_bytes: null,
  mime_type: null,
  duration_ms: null,
  metadata: { environment: 'production' },
  created_at: '2026-05-26T10:00:00+00',
  expires_at: null,
};

describe('fetchArtifacts', () => {
  it('returns empty array when factoryDb is null', async () => {
    const rows = await fetchArtifacts(null);
    expect(rows).toEqual([]);
    expect(createDb).not.toHaveBeenCalled();
  });

  it('returns empty array when factoryDb is undefined', async () => {
    const rows = await fetchArtifacts(undefined);
    expect(rows).toEqual([]);
  });

  it('returns rows from factory_artifacts', async () => {
    mockExecute.mockResolvedValue({ rows: [FAKE_ARTIFACT] });
    const rows = await fetchArtifacts({ connectionString: 'postgres://test' });
    expect(rows).toEqual([FAKE_ARTIFACT]);
    expect(mockExecute).toHaveBeenCalledOnce();
  });

  it('returns empty array when table has no rows', async () => {
    mockExecute.mockResolvedValue({ rows: [] });
    const rows = await fetchArtifacts({ connectionString: 'postgres://test' });
    expect(rows).toEqual([]);
  });

  it('passes custom limit and offset', async () => {
    mockExecute.mockResolvedValue({ rows: [] });
    await fetchArtifacts({ connectionString: 'postgres://test' }, { limit: 100, offset: 10 });
    expect(mockExecute).toHaveBeenCalledOnce();
  });

  it('propagates DB errors', async () => {
    mockExecute.mockRejectedValue(new Error('query failed'));
    await expect(
      fetchArtifacts({ connectionString: 'postgres://test' }),
    ).rejects.toThrow('query failed');
  });
});
