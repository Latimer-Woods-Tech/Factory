/**
 * Tests for smoke-probe.ts
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { executeSmokeProbes } from './smoke-probe.js';
import type { SmokeProbe } from './manifest.js';

describe('executeSmokeProbes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('executes a single probe and passes on 200', async () => {
    const mockFetch = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    globalThis.fetch = mockFetch;

    const probes: SmokeProbe[] = [
      {
        label: 'happy path',
        expectedStatus: 200,
      },
    ];

    const result = await executeSmokeProbes(
      'https://api.example.com',
      'GET',
      '/health',
      'public',
      probes,
    );

    expect(result.passed).toBe(1);
    expect(result.total).toBe(1);
    expect(result.results[0]!.passed).toBe(true);
    expect(result.results[0]!.status).toBe(200);
  });

  it('fails probe on status mismatch', async () => {
    const mockFetch = vi.fn<typeof fetch>().mockResolvedValue(
      new Response('Not Found', { status: 404 }),
    );
    globalThis.fetch = mockFetch;

    const probes: SmokeProbe[] = [
      {
        label: 'should be 200',
        expectedStatus: 200,
      },
    ];

    const result = await executeSmokeProbes(
      'https://api.example.com',
      'GET',
      '/dead-route',
      'public',
      probes,
    );

    expect(result.passed).toBe(0);
    expect(result.results[0]!.passed).toBe(false);
    expect(result.results[0]!.status).toBe(404);
    expect(result.results[0]!.reason).toContain('expected 200, got 404');
  });

  it('passes probe with POST body and content check', async () => {
    const mockFetch = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ uuid: 'abc123' }), {
        status: 200,
      }),
    );
    globalThis.fetch = mockFetch;

    const probes: SmokeProbe[] = [
      {
        label: 'create returns uuid',
        body: { name: 'test' },
        expectedStatus: 200,
        expectContains: 'abc123',
      },
    ];

    const result = await executeSmokeProbes(
      'https://api.example.com',
      'POST',
      '/items',
      'session',
      probes,
      'token123',
    );

    expect(result.passed).toBe(1);
    expect(result.results[0]!.passed).toBe(true);
  });

  it('fails probe when response body does not contain expected substring', async () => {
    const mockFetch = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ id: '999' }), { status: 200 }),
    );
    globalThis.fetch = mockFetch;

    const probes: SmokeProbe[] = [
      {
        label: 'expects uuid',
        expectedStatus: 200,
        expectContains: 'abc123',
      },
    ];

    const result = await executeSmokeProbes(
      'https://api.example.com',
      'GET',
      '/items/1',
      'public',
      probes,
    );

    expect(result.passed).toBe(0);
    expect(result.results[0]!.passed).toBe(false);
    expect(result.results[0]!.reason).toContain('does not contain');
  });

  it('handles DELETE with explicit expectedStatus override', async () => {
    const mockFetch = vi.fn<typeof fetch>().mockResolvedValue(
      new Response('', { status: 200 }),
    );
    globalThis.fetch = mockFetch;

    const probes: SmokeProbe[] = [
      {
        label: 'delete succeeds with 200',
        expectedStatus: 200,
      },
    ];

    const result = await executeSmokeProbes(
      'https://api.example.com',
      'DELETE',
      '/items/1',
      'admin',
      probes,
      'admin-token',
    );

    expect(result.passed).toBe(1);
    expect(result.results[0]!.passed).toBe(true);
    expect(result.results[0]!.status).toBe(200);
  });

  it('rejects auth=admin without token', async () => {
    const probes: SmokeProbe[] = [
      {
        label: 'admin-only endpoint',
      },
    ];

    const result = await executeSmokeProbes(
      'https://api.example.com',
      'GET',
      '/admin/settings',
      'admin',
      probes,
      undefined,
    );

    expect(result.passed).toBe(0);
    expect(result.results[0]!.passed).toBe(false);
    expect(result.results[0]!.reason).toContain('no token provided');
  });

  it('executes multiple probes sequentially', async () => {
    const mockFetch = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ id: 1 }), { status: 200 }),
    );
    globalThis.fetch = mockFetch;

    const probes: SmokeProbe[] = [
      { label: 'probe1' },
      { label: 'probe2' },
      { label: 'probe3' },
    ];

    const result = await executeSmokeProbes(
      'https://api.example.com',
      'GET',
      '/endpoint',
      'public',
      probes,
    );

    expect(result.total).toBe(3);
    expect(result.passed).toBe(3);
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  it('appends query string when probe.query is set', async () => {
    let capturedUrl = '';
    const mockFetch = vi.fn<typeof fetch>().mockImplementation((url) => {
      capturedUrl = url instanceof URL ? url.href : url instanceof Request ? url.url : url;
      return Promise.resolve(new Response(JSON.stringify({}), { status: 200 }));
    });
    globalThis.fetch = mockFetch;

    const probes: SmokeProbe[] = [
      {
        label: 'with query',
        query: '?limit=5&status=pending',
        expectedStatus: 200,
      },
    ];

    const result = await executeSmokeProbes(
      'https://api.example.com',
      'GET',
      '/items',
      'public',
      probes,
    );

    expect(result.passed).toBe(1);
    expect(capturedUrl).toContain('limit=5');
    expect(capturedUrl).toContain('status=pending');
  });

  it('handles fetch AbortError as timeout reason', async () => {
    const abortErr = new DOMException('signal timed out', 'AbortError');
    const mockFetch = vi.fn<typeof fetch>().mockRejectedValue(abortErr);
    globalThis.fetch = mockFetch;

    const probes: SmokeProbe[] = [{ label: 'timeout probe' }];

    const result = await executeSmokeProbes(
      'https://api.example.com',
      'GET',
      '/slow',
      'public',
      probes,
    );

    expect(result.passed).toBe(0);
    expect(result.results[0]!.passed).toBe(false);
    expect(result.results[0]!.reason).toBe('timeout');
    expect(result.results[0]!.status).toBe(0);
  });

  it('handles generic fetch network error', async () => {
    const networkErr = new TypeError('Failed to fetch');
    const mockFetch = vi.fn<typeof fetch>().mockRejectedValue(networkErr);
    globalThis.fetch = mockFetch;

    const probes: SmokeProbe[] = [{ label: 'network error probe' }];

    const result = await executeSmokeProbes(
      'https://api.example.com',
      'GET',
      '/unreachable',
      'public',
      probes,
    );

    expect(result.passed).toBe(0);
    expect(result.results[0]!.passed).toBe(false);
    expect(result.results[0]!.reason).toContain('TypeError');
  });

  it('uses default DELETE status 204 when expectedStatus not set', async () => {
    const mockFetch = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(null, { status: 204 }),
    );
    globalThis.fetch = mockFetch;

    const probes: SmokeProbe[] = [{ label: 'delete default 204' }];

    const result = await executeSmokeProbes(
      'https://api.example.com',
      'DELETE',
      '/items/1',
      'admin',
      probes,
      'admin-token',
    );

    expect(result.passed).toBe(1);
    expect(result.results[0]!.passed).toBe(true);
    expect(result.results[0]!.status).toBe(204);
  });
});
