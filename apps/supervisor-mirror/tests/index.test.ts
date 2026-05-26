/**
 * Unit tests for the supervisor-mirror Worker entry point (index.ts).
 *
 * Tests the /health HTTP handler and the scheduled cron handler by
 * mocking mirrorSupervisorRuns from mirror.js.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Env } from '../src/env.js';

// ── Mock mirror module ───────────────────────────────────────────────────────

const mockMirrorResult = { synced: 5, skipped: 0, errors: 0 };
/** When set, mirrorSupervisorRuns throws this value instead of resolving. */
let mirrorThrowValue: unknown = null;

vi.mock('../src/mirror.js', () => ({
  mirrorSupervisorRuns: vi.fn(async () => {
    if (mirrorThrowValue !== null) {
      // eslint-disable-next-line @typescript-eslint/no-throw-literal
      throw mirrorThrowValue;
    }
    return mockMirrorResult;
  }),
}));

// Imported after the mock is registered
const worker = (await import('../src/index.js')).default;

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeEnv(): Env {
  return {
    DB: { connectionString: 'postgres://test' },
    SUPERVISOR_D1: {} as D1Database,
    ENVIRONMENT: 'test',
  };
}

function makeCtx(): ExecutionContext {
  return {
    waitUntil: vi.fn(),
    passThroughOnException: vi.fn(),
  } as unknown as ExecutionContext;
}

beforeEach(() => {
  mirrorThrowValue = null;
});

// ── Tests ────────────────────────────────────────────────────────────────────

describe('Worker fetch handler', () => {
  it('returns 200 JSON with ok:true for /health', async () => {
    const req = new Request('https://supervisor-mirror.example.com/health');
    const res = worker.fetch(req, makeEnv(), makeCtx());
    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(body['ok']).toBe(true);
    expect(body['environment']).toBe('test');
  });

  it('returns 404 for an unknown path', async () => {
    const req = new Request('https://supervisor-mirror.example.com/unknown');
    const res = worker.fetch(req, makeEnv(), makeCtx());
    expect(res.status).toBe(404);
  });
});

describe('Worker scheduled handler', () => {
  it('calls mirrorSupervisorRuns and logs completion', async () => {
    const env = makeEnv();
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    await worker.scheduled({} as ScheduledEvent, env, makeCtx());
    expect(consoleSpy).toHaveBeenCalledTimes(2);
    consoleSpy.mockRestore();
  });

  it('rethrows and logs error when mirrorSupervisorRuns throws an Error', async () => {
    mirrorThrowValue = new Error('mirror boom');
    const env = makeEnv();
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await expect(worker.scheduled({} as ScheduledEvent, env, makeCtx())).rejects.toThrow('mirror boom');
    expect(errorSpy).toHaveBeenCalledTimes(1);
    errorSpy.mockRestore();
  });

  it('rethrows and logs error when mirrorSupervisorRuns throws a non-Error value', async () => {
    mirrorThrowValue = 'string error value';
    const env = makeEnv();
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await expect(worker.scheduled({} as ScheduledEvent, env, makeCtx())).rejects.toBe('string error value');
    const loggedArg = errorSpy.mock.calls[0]?.[0] as string | undefined;
    expect(loggedArg).toBeDefined();
    // The error field should use String(err) for non-Error values
    expect(loggedArg).toContain('string error value');
    errorSpy.mockRestore();
  });
});
