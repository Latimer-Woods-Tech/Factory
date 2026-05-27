/**
 * Unit tests for replayFailedEvents (P1.10).
 *
 * Uses dependency injection (the `ops` parameter) — no live DB connection or
 * module mocking needed. All assertions are against the mock's recorded calls.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { replayFailedEvents } from '../src/replay.js';
import type { ReplayDb, FailedEvent } from '../src/replay-db.js';
import type { Env } from '../src/env.js';

// ── helpers ──────────────────────────────────────────────────────────────────

function makeEnv(): Env {
  return { DB: { connectionString: 'postgres://test' }, ENVIRONMENT: 'test' };
}

const OBS = new Date('2025-01-01T00:00:00Z');

function makeGateEvent(overrides: Partial<FailedEvent> = {}): FailedEvent {
  return {
    id: 'evt-gate-1',
    sourceEventType: 'gate.ci',
    derivationTargets: ['factory_gates'],
    observedAt: OBS,
    payload: {
      gate_type: 'ci',
      source_system: 'github-actions',
      source_ref: 'run/123',
      subject_type: 'pr',
      subject_ref: 'pr/42',
      subject_repo: 'Org/Repo',
      state: 'passed',
      evidence_url: 'https://github.com/Org/Repo/actions/runs/123',
      evidence_summary: { conclusion: 'success' },
      observed_at: OBS.toISOString(),
    },
    ...overrides,
  };
}

function makeArtifactEvent(overrides: Partial<FailedEvent> = {}): FailedEvent {
  return {
    id: 'evt-art-1',
    sourceEventType: 'artifact.video',
    derivationTargets: ['factory_artifacts'],
    observedAt: OBS,
    payload: {
      artifact_type: 'video',
      producer_type: 'video-pipeline',
      producer_ref: 'run/workflow/456',
      subject_app: 'capricast',
      subject_repo: 'Org/Repo',
      subject_ref: 'sha/abc123',
      uri: 'r2://bucket/key.mp4',
      checksum: 'sha256:abc',
      size_bytes: 1024,
      mime_type: 'video/mp4',
      duration_ms: 30000,
      metadata: { resolution: '1080p' },
      expires_at: null,
      observed_at: OBS.toISOString(),
    },
    ...overrides,
  };
}

interface MockOps extends ReplayDb {
  insertGateCalls: Parameters<ReplayDb['insertGate']>[0][];
  insertArtifactCalls: Parameters<ReplayDb['insertArtifact']>[0][];
  markReplayedIds: string[];
  markReplayFailedCalls: Array<{ id: string; error: string }>;
  insertGateError: Error | null;
  insertArtifactError: Error | null;
  markReplayedError: Error | null;
}

function makeMockOps(events: FailedEvent[]): MockOps {
  const ops: MockOps = {
    insertGateCalls: [],
    insertArtifactCalls: [],
    markReplayedIds: [],
    markReplayFailedCalls: [],
    insertGateError: null,
    insertArtifactError: null,
    markReplayedError: null,

    async fetchFailedEvents(_limit) {
      return events;
    },

    async insertGate(gate) {
      ops.insertGateCalls.push(gate);
      if (ops.insertGateError) throw ops.insertGateError;
    },

    async insertArtifact(artifact) {
      ops.insertArtifactCalls.push(artifact);
      if (ops.insertArtifactError) throw ops.insertArtifactError;
    },

    async markReplayed(id) {
      if (ops.markReplayedError) throw ops.markReplayedError;
      ops.markReplayedIds.push(id);
    },

    async markReplayFailed(id, error) {
      ops.markReplayFailedCalls.push({ id, error });
    },
  };
  return ops;
}

// ── tests ────────────────────────────────────────────────────────────────────

describe('replayFailedEvents', () => {
  let env: Env;

  beforeEach(() => {
    env = makeEnv();
  });

  it('returns zeros when there are no failed events', async () => {
    const ops = makeMockOps([]);
    const result = await replayFailedEvents(env, 50, ops);
    expect(result).toEqual({ replayed: 0, failed: 0, skipped: 0 });
  });

  it('replays a gate event and marks it replayed', async () => {
    const event = makeGateEvent();
    const ops = makeMockOps([event]);
    const result = await replayFailedEvents(env, 50, ops);

    expect(result).toEqual({ replayed: 1, failed: 0, skipped: 0 });
    expect(ops.insertGateCalls).toHaveLength(1);
    const gate = ops.insertGateCalls[0]!;
    expect(gate.ingestEventId).toBe('evt-gate-1');
    expect(gate.gateType).toBe('ci');
    expect(gate.sourceSystem).toBe('github-actions');
    expect(gate.sourceRef).toBe('run/123');
    expect(gate.subjectType).toBe('pr');
    expect(gate.subjectRef).toBe('pr/42');
    expect(gate.subjectRepo).toBe('Org/Repo');
    expect(gate.state).toBe('passed');
    expect(gate.evidenceUrl).toBe('https://github.com/Org/Repo/actions/runs/123');
    expect(gate.evidenceSummary).toEqual({ conclusion: 'success' });
    expect(gate.observedAt).toEqual(OBS);
    expect(ops.markReplayedIds).toContain('evt-gate-1');
  });

  it('replays an artifact event and marks it replayed', async () => {
    const event = makeArtifactEvent();
    const ops = makeMockOps([event]);
    const result = await replayFailedEvents(env, 50, ops);

    expect(result).toEqual({ replayed: 1, failed: 0, skipped: 0 });
    expect(ops.insertArtifactCalls).toHaveLength(1);
    const art = ops.insertArtifactCalls[0]!;
    expect(art.artifactType).toBe('video');
    expect(art.producerType).toBe('video-pipeline');
    expect(art.producerRef).toBe('run/workflow/456');
    expect(art.uri).toBe('r2://bucket/key.mp4');
    expect(art.checksum).toBe('sha256:abc');
    expect(art.sizeBytes).toBe(1024);
    expect(art.mimeType).toBe('video/mp4');
    expect(art.durationMs).toBe(30000);
    expect(art.metadata).toEqual({ resolution: '1080p' });
    expect(art.expiresAt).toBeUndefined();
    expect(ops.markReplayedIds).toContain('evt-art-1');
  });

  it('skips events with unknown derivation targets', async () => {
    const event = makeGateEvent({ derivationTargets: ['unknown_table'] });
    const ops = makeMockOps([event]);
    const result = await replayFailedEvents(env, 50, ops);

    expect(result).toEqual({ replayed: 0, failed: 0, skipped: 1 });
    expect(ops.insertGateCalls).toHaveLength(0);
    expect(ops.markReplayedIds).toHaveLength(0);
  });

  it('skips events with null derivation targets', async () => {
    const event = makeGateEvent({ derivationTargets: null });
    const ops = makeMockOps([event]);
    const result = await replayFailedEvents(env, 50, ops);

    expect(result).toEqual({ replayed: 0, failed: 0, skipped: 1 });
  });

  it('marks as failed and increments failed count when insertGate throws', async () => {
    const event = makeGateEvent();
    const ops = makeMockOps([event]);
    ops.insertGateError = new Error('db insert failed');
    const result = await replayFailedEvents(env, 50, ops);

    expect(result).toEqual({ replayed: 0, failed: 1, skipped: 0 });
    expect(ops.markReplayFailedCalls).toHaveLength(1);
    expect(ops.markReplayFailedCalls[0]!.id).toBe('evt-gate-1');
    expect(ops.markReplayFailedCalls[0]!.error).toContain('db insert failed');
    expect(ops.markReplayedIds).toHaveLength(0);
  });

  it('marks as failed when insertArtifact throws', async () => {
    const event = makeArtifactEvent();
    const ops = makeMockOps([event]);
    ops.insertArtifactError = new Error('artifact error');
    const result = await replayFailedEvents(env, 50, ops);

    expect(result).toEqual({ replayed: 0, failed: 1, skipped: 0 });
    expect(ops.markReplayFailedCalls[0]!.error).toContain('artifact error');
  });

  it('continues processing subsequent events when one fails', async () => {
    const gate = makeGateEvent({ id: 'evt-gate-1' });
    const art = makeArtifactEvent({ id: 'evt-art-1' });
    const ops = makeMockOps([gate, art]);
    ops.insertGateError = new Error('gate insert failed');

    const result = await replayFailedEvents(env, 50, ops);

    expect(result).toEqual({ replayed: 1, failed: 1, skipped: 0 });
    expect(ops.markReplayedIds).toContain('evt-art-1');
    expect(ops.markReplayFailedCalls.some((c) => c.id === 'evt-gate-1')).toBe(true);
  });

  it('processes a mixed batch of gate and artifact events', async () => {
    const events = [
      makeGateEvent({ id: 'g1' }),
      makeArtifactEvent({ id: 'a1' }),
      makeGateEvent({ id: 'g2' }),
    ];
    const ops = makeMockOps(events);
    const result = await replayFailedEvents(env, 50, ops);

    expect(result).toEqual({ replayed: 3, failed: 0, skipped: 0 });
    expect(ops.insertGateCalls).toHaveLength(2);
    expect(ops.insertArtifactCalls).toHaveLength(1);
    expect(ops.markReplayedIds).toEqual(['g1', 'a1', 'g2']);
  });

  it('throws when gate payload is missing required fields', async () => {
    const event = makeGateEvent({ payload: { gate_type: 'ci' } });
    const ops = makeMockOps([event]);
    const result = await replayFailedEvents(env, 50, ops);

    expect(result.failed).toBe(1);
    expect(ops.markReplayFailedCalls[0]!.error).toContain('missing required fields');
  });

  it('throws when artifact payload is missing required fields', async () => {
    const event = makeArtifactEvent({ payload: { artifact_type: 'video' } });
    const ops = makeMockOps([event]);
    const result = await replayFailedEvents(env, 50, ops);

    expect(result.failed).toBe(1);
    expect(ops.markReplayFailedCalls[0]!.error).toContain('missing required fields');
  });

  it('handles artifact with expiresAt date string', async () => {
    const expiresAt = '2026-12-31T00:00:00Z';
    const event = makeArtifactEvent({
      payload: { ...(makeArtifactEvent().payload as object), expires_at: expiresAt },
    });
    const ops = makeMockOps([event]);
    await replayFailedEvents(env, 50, ops);

    const art = ops.insertArtifactCalls[0]!;
    expect(art.expiresAt).toEqual(new Date(expiresAt));
  });

  it('handles artifact with null metadata (uses empty object fallback)', async () => {
    const event = makeArtifactEvent({
      payload: {
        artifact_type: 'video',
        producer_type: 'video-pipeline',
        producer_ref: 'run/1',
        uri: 'r2://bucket/key.mp4',
        // metadata omitted — should default to {}
        observed_at: OBS.toISOString(),
      },
    });
    const ops = makeMockOps([event]);
    const result = await replayFailedEvents(env, 50, ops);

    expect(result.replayed).toBe(1);
    expect(ops.insertArtifactCalls[0]!.metadata).toEqual({});
  });

  it('handles gate with no evidence fields', async () => {
    const event = makeGateEvent({
      payload: {
        gate_type: 'ci',
        source_system: 'github-actions',
        source_ref: 'run/1',
        subject_type: 'pr',
        subject_ref: 'pr/1',
        state: 'passed',
        observed_at: OBS.toISOString(),
      },
    });
    const ops = makeMockOps([event]);
    const result = await replayFailedEvents(env, 50, ops);

    expect(result.replayed).toBe(1);
    const gate = ops.insertGateCalls[0]!;
    expect(gate.subjectRepo).toBeUndefined();
    expect(gate.evidenceUrl).toBeUndefined();
    expect(gate.evidenceSummary).toEqual({});
  });

  it('continues even when markReplayFailed throws', async () => {
    const gate = makeGateEvent({ id: 'g-bad' });
    const art = makeArtifactEvent({ id: 'a-ok' });
    const ops = makeMockOps([gate, art]);
    ops.insertGateError = new Error('gate error');
    // markReplayFailed for the gate will throw
    const originalMarkFailed = ops.markReplayFailed.bind(ops);
    ops.markReplayFailed = async (id, error) => {
      if (id === 'g-bad') throw new Error('mark failed error');
      await originalMarkFailed(id, error);
    };

    const result = await replayFailedEvents(env, 50, ops);
    // Even though markReplayFailed throws for the gate, the artifact should still be processed
    expect(result).toEqual({ replayed: 1, failed: 1, skipped: 0 });
    expect(ops.markReplayedIds).toContain('a-ok');
  });
});
