/**
 * Unit tests for the factory-events-replay Worker entrypoint (P1.10).
 *
 * Mocks replayFailedEvents at module level so the scheduled handler can be
 * exercised without a live DB connection.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { replayFailedEvents } from '../src/replay.js';
import type { Env } from '../src/env.js';

vi.mock('../src/replay.js', () => ({
  replayFailedEvents: vi.fn(),
}));

const replayMock = vi.mocked(replayFailedEvents);

function makeEnv(): Env {
  return { DB: { connectionString: 'postgres://test' }, ENVIRONMENT: 'test' };
}

function makeCtx(): ExecutionContext {
  return {
    waitUntil: vi.fn((p: Promise<unknown>) => { p.catch(() => {}); }),
    passThroughOnException: vi.fn(),
  } as unknown as ExecutionContext;
}

describe('fetch handler', () => {
  let worker: typeof import('../src/index.js')['default'];

  beforeEach(async () => {
    worker = (await import('../src/index.js')).default;
  });

  it('GET /health returns 200 with ok=true', async () => {
    const req = new Request('https://factory-events-replay.test/health');
    const res = worker.fetch(req, makeEnv(), makeCtx());
    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(body['ok']).toBe(true);
    expect(body['environment']).toBe('test');
  });

  it('GET /other returns 404', async () => {
    const req = new Request('https://factory-events-replay.test/other');
    const res = worker.fetch(req, makeEnv(), makeCtx());
    expect(res.status).toBe(404);
  });
});

describe('scheduled handler', () => {
  let worker: typeof import('../src/index.js')['default'];

  beforeEach(async () => {
    vi.clearAllMocks();
    worker = (await import('../src/index.js')).default;
  });

  it('calls replayFailedEvents and logs result on success', async () => {
    replayMock.mockResolvedValue({ replayed: 3, failed: 0, skipped: 1 });
    const event = {} as ScheduledEvent;
    await worker.scheduled(event, makeEnv(), makeCtx());
    expect(replayMock).toHaveBeenCalledOnce();
    expect(replayMock).toHaveBeenCalledWith(expect.objectContaining({ ENVIRONMENT: 'test' }));
  });

  it('re-throws when replayFailedEvents throws', async () => {
    replayMock.mockRejectedValue(new Error('fatal'));
    const event = {} as ScheduledEvent;
    await expect(worker.scheduled(event, makeEnv(), makeCtx())).rejects.toThrow('fatal');
  });
});
