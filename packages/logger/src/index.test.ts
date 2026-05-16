import { Hono } from 'hono';
import { describe, expect, it, vi } from 'vitest';

// Mock @latimer-woods-tech/monitoring before importing logger
vi.mock('@latimer-woods-tech/monitoring', () => ({
  captureError: vi.fn().mockReturnValue('mock-sentry-event-id'),
}));

import { captureError } from '@latimer-woods-tech/monitoring';
import {
  createLogger,
  generateRequestId,
  getRequestId,
  requestTracingMiddleware,
  sanitizeId,
  tracedFetch,
  withRequestId,
} from './index.js';

// ---------------------------------------------------------------------------
// createLogger
// ---------------------------------------------------------------------------

describe('createLogger', () => {
  it('emits info as JSON to console.log', () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const logger = createLogger({ workerId: 'w1', requestId: 'r1' });
    logger.info('Hello world', { extra: 'data' });

    expect(consoleSpy).toHaveBeenCalledOnce();
    const emitted = JSON.parse(consoleSpy.mock.calls[0]![0] as string) as Record<string, unknown>;
    expect(emitted.level).toBe('info');
    expect(emitted.msg).toBe('Hello world');
    expect(emitted.workerId).toBe('w1');
    expect(emitted.requestId).toBe('r1');
    expect(emitted.extra).toBe('data');
    expect(typeof emitted.ts).toBe('string');
  });

  it('emits warn with level=warn', () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const logger = createLogger({ workerId: 'w1', requestId: 'r1' });
    logger.warn('Watch out');
    const emitted = JSON.parse(consoleSpy.mock.calls[0]![0] as string) as Record<string, unknown>;
    expect(emitted.level).toBe('warn');
    expect(emitted.msg).toBe('Watch out');
  });

  it('emits error with errorMessage and calls captureError', () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const logger = createLogger({ workerId: 'w1', requestId: 'r1', userId: 'u1', tenantId: 't1' });
    const err = new Error('boom');
    logger.error('Something broke', err, { attempt: 2 });

    expect(vi.mocked(captureError)).toHaveBeenCalledWith(err, {
      requestId: 'r1',
      userId: 'u1',
      tenantId: 't1',
      extra: { attempt: 2 },
    });

    const emitted = JSON.parse(consoleSpy.mock.calls[0]![0] as string) as Record<string, unknown>;
    expect(emitted.level).toBe('error');
    expect(emitted.errorMessage).toBe('boom');
    expect(emitted.errorName).toBe('Error');
  });

  it('emits error without calling captureError when err is undefined', () => {
    (captureError as unknown as { mockClear(): void }).mockClear();
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const logger = createLogger({ workerId: 'w1', requestId: 'r1' });
    logger.error('Something broke');
    expect(vi.mocked(captureError)).not.toHaveBeenCalled();
  });

  it('includes non-Error error value in the emitted log', () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const logger = createLogger({ workerId: 'w1', requestId: 'r1' });
    logger.error('Crash', { weirdError: true });
    const emitted = JSON.parse(consoleSpy.mock.calls[0]![0] as string) as Record<string, unknown>;
    expect(emitted.error).toEqual({ weirdError: true });
  });

  it('emits debug in non-production environments', () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const logger = createLogger({ workerId: 'w1', requestId: 'r1', environment: 'development' });
    logger.debug('debug line');
    expect(consoleSpy).toHaveBeenCalledOnce();
    const emitted = JSON.parse(consoleSpy.mock.calls[0]![0] as string) as Record<string, unknown>;
    expect(emitted.level).toBe('debug');
  });

  it('suppresses debug in production', () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const logger = createLogger({ workerId: 'w1', requestId: 'r1', environment: 'production' });
    logger.debug('should be suppressed');
    expect(consoleSpy).not.toHaveBeenCalled();
  });

  it('child() returns a logger with merged context', () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const parent = createLogger({ workerId: 'w1', requestId: 'r1' });
    const child = parent.child({ userId: 'u99' });
    child.info('from child');
    const emitted = JSON.parse(consoleSpy.mock.calls[0]![0] as string) as Record<string, unknown>;
    expect(emitted.workerId).toBe('w1');
    expect(emitted.requestId).toBe('r1');
    expect(emitted.userId).toBe('u99');
  });

  it('child() overrides parent context fields', () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const parent = createLogger({ workerId: 'w1', requestId: 'r1', userId: 'original' });
    const child = parent.child({ userId: 'overridden' });
    child.info('override');
    const emitted = JSON.parse(consoleSpy.mock.calls[0]![0] as string) as Record<string, unknown>;
    expect(emitted.userId).toBe('overridden');
  });
});

// ---------------------------------------------------------------------------
// withRequestId middleware
// ---------------------------------------------------------------------------

describe('withRequestId', () => {
  it('attaches requestId and logger to context', async () => {
    const app = new Hono();
    app.use('*', withRequestId());
    app.get('/test', (c) => {
      const requestId = c.get('requestId');
      const logger = c.get('logger');
      return c.json({ hasId: typeof requestId === 'string', hasLogger: logger !== undefined });
    });

    const res = await app.request('/test', {
      headers: { 'x-worker-id': 'my-worker' },
    });
    expect(res.status).toBe(200);
    const body = await res.json() as { hasId: boolean; hasLogger: boolean };
    expect(body.hasId).toBe(true);
    expect(body.hasLogger).toBe(true);
  });

  it('generates different requestIds per request', async () => {
    const ids: string[] = [];
    const app = new Hono();
    app.use('*', withRequestId());
    app.get('/id', (c) => {
      ids.push(c.get('requestId'));
      return c.json({ ok: true });
    });

    await app.request('/id');
    await app.request('/id');
    expect(ids[0]).toBeDefined();
    expect(ids[1]).toBeDefined();
    expect(ids[0]).not.toBe(ids[1]);
  });

  it('uses unknown-worker when x-worker-id header is absent', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const app = new Hono();
    app.use('*', withRequestId());
    app.get('/log', (c) => {
      c.get('logger').info('no worker header');
      return c.json({ ok: true });
    });

    await app.request('/log');
    if (consoleSpy.mock.calls.length > 0) {
      const emitted = JSON.parse(consoleSpy.mock.calls[0]![0] as string) as Record<string, unknown>;
      expect(emitted.workerId).toBe('unknown-worker');
    }
  });

  it('uses x-worker-id header when provided', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const app = new Hono();
    app.use('*', withRequestId());
    app.get('/log', (c) => {
      c.get('logger').info('has worker header');
      return c.json({ ok: true });
    });

    await app.request('/log', { headers: { 'x-worker-id': 'api-gateway' } });
    const emitted = JSON.parse(consoleSpy.mock.calls[0]![0] as string) as Record<string, unknown>;
    expect(emitted.workerId).toBe('api-gateway');
  });
});

// ---------------------------------------------------------------------------
// generateRequestId
// ---------------------------------------------------------------------------

describe('generateRequestId', () => {
  it('returns a 12-character lowercase hex string', () => {
    const id = generateRequestId();
    expect(id).toMatch(/^[0-9a-f]{12}$/);
  });

  it('returns unique values on successive calls', () => {
    const ids = new Set(Array.from({ length: 20 }, () => generateRequestId()));
    expect(ids.size).toBe(20);
  });
});

// ---------------------------------------------------------------------------
// sanitizeId
// ---------------------------------------------------------------------------

describe('sanitizeId', () => {
  it('truncates IDs longer than 8 characters and appends an ellipsis', () => {
    expect(sanitizeId('a3b4c5d6-1234-5678-abcd-ef0123456789')).toBe('a3b4c5d6\u2026');
  });

  it('returns short IDs unchanged (8 chars or fewer)', () => {
    expect(sanitizeId('abcd1234')).toBe('abcd1234');
    expect(sanitizeId('short')).toBe('short');
  });

  it('returns an empty string for null', () => {
    expect(sanitizeId(null)).toBe('');
  });

  it('returns an empty string for undefined', () => {
    expect(sanitizeId(undefined)).toBe('');
  });

  it('returns an empty string for an empty string', () => {
    expect(sanitizeId('')).toBe('');
  });
});

// ---------------------------------------------------------------------------
// requestTracingMiddleware
// ---------------------------------------------------------------------------

describe('requestTracingMiddleware', () => {
  it('mints a new request ID when x-request-id header is absent', async () => {
    const app = new Hono();
    app.use('*', requestTracingMiddleware());
    app.get('/test', (c) => c.json({ id: c.get('requestId') }));

    const res = await app.request('/test');
    const body = await res.json() as { id: string };
    expect(typeof body.id).toBe('string');
    expect(body.id.length).toBeGreaterThan(0);
  });

  it('propagates incoming x-request-id header', async () => {
    const app = new Hono();
    app.use('*', requestTracingMiddleware());
    app.get('/test', (c) => c.json({ id: c.get('requestId') }));

    const res = await app.request('/test', { headers: { 'x-request-id': 'upstream-abc123' } });
    const body = await res.json() as { id: string };
    expect(body.id).toBe('upstream-abc123');
  });

  it('echoes x-request-id in the response header', async () => {
    const app = new Hono();
    app.use('*', requestTracingMiddleware());
    app.get('/test', (c) => c.json({ ok: true }));

    const res = await app.request('/test', { headers: { 'x-request-id': 'my-id' } });
    expect(res.headers.get('x-request-id')).toBe('my-id');
  });
});

// ---------------------------------------------------------------------------
// getRequestId
// ---------------------------------------------------------------------------

describe('getRequestId', () => {
  it('returns the requestId stored in context', async () => {
    const app = new Hono();
    app.use('*', requestTracingMiddleware());
    let captured: string | undefined;
    app.get('/test', (c) => {
      captured = getRequestId(c);
      return c.json({ ok: true });
    });

    await app.request('/test', { headers: { 'x-request-id': 'trace-xyz' } });
    expect(captured).toBe('trace-xyz');
  });

  it('returns undefined when requestId is not set', () => {
    const mockCtx = { get: (key: 'requestId'): string | undefined => { void key; return undefined; } };
    expect(getRequestId(mockCtx)).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// tracedFetch
// ---------------------------------------------------------------------------

describe('tracedFetch', () => {
  it('injects x-request-id header into outbound requests', async () => {
    let capturedHeaders: Headers | undefined;
    const mockFetch = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
      capturedHeaders = new Headers(init?.headers);
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    });

    const tfetch = tracedFetch('test-request-id', mockFetch as unknown as typeof fetch);
    await tfetch('https://example.workers.dev/api', { method: 'GET' });

    expect(mockFetch).toHaveBeenCalledOnce();
    expect(capturedHeaders?.get('x-request-id')).toBe('test-request-id');
  });

  it('preserves existing headers alongside the injected request ID', async () => {
    let capturedHeaders: Headers | undefined;
    const mockFetch = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
      capturedHeaders = new Headers(init?.headers);
      return new Response('', { status: 200 });
    });

    const tfetch = tracedFetch('my-id', mockFetch as unknown as typeof fetch);
    await tfetch('https://example.workers.dev/', { headers: { authorization: 'Bearer token' } });

    expect(capturedHeaders?.get('authorization')).toBe('Bearer token');
    expect(capturedHeaders?.get('x-request-id')).toBe('my-id');
  });

  it('injects a default 30 s AbortSignal when none is provided', async () => {
    let capturedInit: RequestInit | undefined;
    const mockFetch = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
      capturedInit = init;
      return new Response('', { status: 200 });
    });

    const tfetch = tracedFetch('req-1', mockFetch as unknown as typeof fetch);
    await tfetch('https://example.workers.dev/');

    expect(capturedInit?.signal).toBeInstanceOf(AbortSignal);
  });

  it('respects a caller-provided AbortSignal over the default', async () => {
    let capturedInit: RequestInit | undefined;
    const mockFetch = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
      capturedInit = init;
      return new Response('', { status: 200 });
    });

    const callerSignal = AbortSignal.timeout(5_000);
    const tfetch = tracedFetch('req-2', mockFetch as unknown as typeof fetch);
    await tfetch('https://example.workers.dev/', { signal: callerSignal });

    expect(capturedInit?.signal).toBe(callerSignal);
  });
});
