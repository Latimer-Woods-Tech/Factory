/**
 * Unit tests for the /v1/blocking route helper (P1.11).
 *
 * Mocks createDb at module level to avoid live DB connections.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchBlockingGates } from './blocking.js';
import { createDb } from '@latimer-woods-tech/neon';

vi.mock('@latimer-woods-tech/neon', async (importOriginal) => {
  const real = await importOriginal<typeof import('@latimer-woods-tech/neon')>();
  return { ...real, createDb: vi.fn() };
});

const mockExecute = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(createDb).mockReturnValue({ execute: mockExecute } as ReturnType<typeof createDb>);
});

const FAKE_GATE = {
  id: 'gate-uuid-001',
  gate_type: 'ci',
  source_system: 'github-actions',
  source_ref: 'run/123',
  subject_type: 'pr',
  subject_repo: 'Org/Repo',
  subject_ref: 'pr/42',
  state: 'failed',
  evidence_url: 'https://github.com/runs/123',
  evidence_summary: { conclusion: 'failure' },
  observed_at: '2025-01-01T00:00:00+00',
};

describe('fetchBlockingGates', () => {
  it('returns empty array when factoryDb is null', async () => {
    const gates = await fetchBlockingGates(null);
    expect(gates).toEqual([]);
    expect(createDb).not.toHaveBeenCalled();
  });

  it('returns empty array when factoryDb is undefined', async () => {
    const gates = await fetchBlockingGates(undefined);
    expect(gates).toEqual([]);
  });

  it('returns rows from factory_gates_blocking view', async () => {
    mockExecute.mockResolvedValue({ rows: [FAKE_GATE] });
    const gates = await fetchBlockingGates({ connectionString: 'postgres://test' });
    expect(gates).toEqual([FAKE_GATE]);
    expect(mockExecute).toHaveBeenCalledOnce();
  });

  it('returns empty array when view has no rows', async () => {
    mockExecute.mockResolvedValue({ rows: [] });
    const gates = await fetchBlockingGates({ connectionString: 'postgres://test' });
    expect(gates).toEqual([]);
  });

  it('propagates DB errors', async () => {
    mockExecute.mockRejectedValue(new Error('connection refused'));
    await expect(
      fetchBlockingGates({ connectionString: 'postgres://test' }),
    ).rejects.toThrow('connection refused');
  });
});
