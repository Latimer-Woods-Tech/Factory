/**
 * Unit tests for factory-events-archiver core logic (P2.13c).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runArchiveBatch, makeBatchKey, ARCHIVE_AGE_DAYS, BATCH_SIZE } from '../src/archiver.js';
import type { ArchiverOps, EventRow } from '../src/archiver.js';

const NOW = new Date('2026-05-26T02:00:00Z');

function makeEvent(id: string): EventRow {
  return {
    id,
    source_system: 'github-webhook',
    source_event_type: 'push',
    source_event_id: `evt-${id}`,
    payload: { ref: 'refs/heads/main' },
    payload_size_bytes: 42,
    payload_sha256: 'abc123',
    ingest_actor: 'webhook-fanout',
    derivation_status: 'derived',
    derivation_targets: ['factory_gates'],
    derivation_error: null,
    derivation_at: '2026-02-01T00:00:00+00',
    observed_at: '2026-02-01T00:00:00+00',
    ingested_at: '2026-02-01T00:00:00+00',
  };
}

function makeMockOps(overrides: Partial<ArchiverOps> = {}): ArchiverOps {
  return {
    fetchCandidates: vi.fn(async () => []),
    archiveKeyExists: vi.fn(async () => false),
    writeArchiveBatch: vi.fn(async () => {}),
    deleteRows: vi.fn(async () => 0),
    ...overrides,
  };
}

describe('makeBatchKey', () => {
  it('formats key with date and epoch', () => {
    const key = makeBatchKey(NOW, 1234567890000);
    expect(key).toBe('factory-events-archiver/2026-05-26/batch-1234567890000.ndjson');
  });
});

describe('runArchiveBatch', () => {
  it('returns zero counts when no candidates', async () => {
    const ops = makeMockOps();
    const result = await runArchiveBatch(ops, { now: NOW });
    expect(result).toEqual({
      candidatesFound: 0,
      batchesWritten: 0,
      rowsArchived: 0,
      rowsDeleted: 0,
      dryRun: false,
    });
  });

  it('dry-run: reports candidates without writing or deleting', async () => {
    const ops = makeMockOps({
      fetchCandidates: vi.fn(async () => [makeEvent('id-1'), makeEvent('id-2')]),
    });
    const result = await runArchiveBatch(ops, { dryRun: true, now: NOW });
    expect(result.candidatesFound).toBe(2);
    expect(result.batchesWritten).toBe(0);
    expect(result.rowsDeleted).toBe(0);
    expect(result.dryRun).toBe(true);
    expect(ops.writeArchiveBatch).not.toHaveBeenCalled();
    expect(ops.deleteRows).not.toHaveBeenCalled();
  });

  it('writes batch and deletes rows on normal run', async () => {
    const events = [makeEvent('id-1'), makeEvent('id-2')];
    const ops = makeMockOps({
      fetchCandidates: vi.fn(async () => events),
      deleteRows: vi.fn(async () => 2),
    });
    const result = await runArchiveBatch(ops, { now: NOW });
    expect(result.batchesWritten).toBe(1);
    expect(result.rowsArchived).toBe(2);
    expect(result.rowsDeleted).toBe(2);
    expect(ops.writeArchiveBatch).toHaveBeenCalledOnce();
    expect(ops.deleteRows).toHaveBeenCalledWith(['id-1', 'id-2']);
  });

  it('skips write when R2 key already exists but still deletes', async () => {
    const events = [makeEvent('id-1')];
    const ops = makeMockOps({
      fetchCandidates: vi.fn(async () => events),
      archiveKeyExists: vi.fn(async () => true),
      deleteRows: vi.fn(async () => 1),
    });
    const result = await runArchiveBatch(ops, { now: NOW });
    expect(result.batchesWritten).toBe(0);
    expect(result.rowsArchived).toBe(0);
    expect(result.rowsDeleted).toBe(1);
    expect(ops.writeArchiveBatch).not.toHaveBeenCalled();
  });

  it('calls fetchCandidates with correct cutoff and batch size', async () => {
    const ops = makeMockOps();
    await runArchiveBatch(ops, { now: NOW });
    const expectedCutoff = new Date(NOW.getTime() - ARCHIVE_AGE_DAYS * 24 * 60 * 60 * 1000);
    expect(ops.fetchCandidates).toHaveBeenCalledWith(expectedCutoff, BATCH_SIZE);
  });

  it('writes NDJSON with one JSON object per line', async () => {
    const events = [makeEvent('id-1'), makeEvent('id-2')];
    let capturedNdjson = '';
    const ops = makeMockOps({
      fetchCandidates: vi.fn(async () => events),
      writeArchiveBatch: vi.fn(async (_key, ndjson) => { capturedNdjson = ndjson; }),
    });
    await runArchiveBatch(ops, { now: NOW });
    const lines = capturedNdjson.split('\n');
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0] ?? '')).toMatchObject({ id: 'id-1' });
    expect(JSON.parse(lines[1] ?? '')).toMatchObject({ id: 'id-2' });
  });

  it('propagates fetchCandidates errors', async () => {
    const ops = makeMockOps({
      fetchCandidates: vi.fn(async () => { throw new Error('db error'); }),
    });
    await expect(runArchiveBatch(ops, { now: NOW })).rejects.toThrow('db error');
  });
});
