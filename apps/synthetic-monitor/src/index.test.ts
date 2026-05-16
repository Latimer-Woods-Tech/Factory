import { describe, expect, it, vi } from 'vitest';
import worker, { checkTarget, parseTargets, runSyntheticChecks } from './index.js';
import type { Env } from './env.js';

const env: Env = {
  ENVIRONMENT: 'test',
  TARGETS_JSON: JSON.stringify([
    { id: 'home', url: 'https://example.com/', contains: 'Welcome' },
    { id: 'health', url: 'https://api.example.com/health', expectedStatus: 204, method: 'HEAD' },
  ]),
};

function textResponse(body: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: { 'content-type': 'text/html; charset=utf-8' },
  });
}

function parseUnknownJson(text: string): unknown {
  return JSON.parse(text) as unknown;
}

describe('parseTargets', () => {
  it('falls back to default targets when configuration is empty', () => {
    const fallback = parseTargets('[]');
    // Generated (4 liveness) + custom (3 manifest + 3 page + 4 SLO journeys) = 14
    expect(fallback.length).toBeGreaterThanOrEqual(14);
    expect(fallback.some((target) => target.id === 'schedule-worker.health')).toBe(true);
    expect(fallback.some((target) => target.id === 'schedule-worker.manifest')).toBe(true);
    expect(fallback.some((target) => target.id === 'slo.journey.auth-api')).toBe(true);
    expect(parseTargets('[ ]').length).toBeGreaterThanOrEqual(14);
    expect(parseTargets(undefined).length).toBeGreaterThanOrEqual(14);
  });

  it('validates configured targets', () => {
    const targets = parseTargets(env.TARGETS_JSON);
    expect(targets).toEqual([
      expect.objectContaining({ id: 'home', method: 'GET', expectedStatus: 200 }),
      expect.objectContaining({ id: 'health', method: 'HEAD', expectedStatus: 204 }),
    ]);
  });

  it('rejects invalid target configuration', () => {
    expect(() => parseTargets('{"bad":true}')).toThrow('TARGETS_JSON must be a JSON array');
    expect(() => parseTargets(JSON.stringify([{ id: 'bad', url: 'ftp://example.com' }]))).toThrow('target url must use http or https');
    expect(() => parseTargets(JSON.stringify([{ id: 'bad', url: 'https://example.com', method: 'POST' }]))).toThrow('method must be GET or HEAD');
    expect(() => parseTargets(JSON.stringify([{ url: 'https://example.com' }]))).toThrow('target id is required');
    expect(() => parseTargets(JSON.stringify([{ id: 'bad' }]))).toThrow('target url is required');
    expect(() => parseTargets(JSON.stringify([{ id: 'bad', url: 'https://example.com', contains: 42 }]))).toThrow('contains must be a string when provided');
    expect(() => parseTargets(JSON.stringify([{ id: 'bad', url: 'https://example.com', expectedStatus: 0 }]))).toThrow('expectedStatus must be a positive integer');
    expect(() => parseTargets(JSON.stringify([{ id: 'bad', url: 'https://example.com', timeoutMs: -1 }]))).toThrow('timeoutMs must be a positive integer');
  });
});

describe('checkTarget', () => {
  it('passes when status and body text match', async () => {
    const fetchImpl = vi.fn(() => Promise.resolve(textResponse('Welcome to Prime Self')));
    const result = await checkTarget({ id: 'home', url: 'https://example.com/', contains: 'Welcome' }, fetchImpl);

    expect(result.ok).toBe(true);
    expect(result.status).toBe(200);
    expect(result.error).toBeUndefined();
    expect(fetchImpl).toHaveBeenCalledWith('https://example.com/', expect.objectContaining({ method: 'GET' }));
  });

  it('fails when expected body text is absent', async () => {
    const fetchImpl = vi.fn(() => Promise.resolve(textResponse('Different content')));
    const result = await checkTarget({ id: 'home', url: 'https://example.com/', contains: 'Welcome' }, fetchImpl);

    expect(result.ok).toBe(false);
    expect(result.error).toContain('Response did not contain expected text: Welcome');
    expect(result.error).toContain('Body snippet: Different content');
  });

  it('fails when status does not match', async () => {
    const fetchImpl = vi.fn(() => Promise.resolve(textResponse('Not found', 404)));
    const result = await checkTarget({ id: 'home', url: 'https://example.com/' }, fetchImpl);

    expect(result.ok).toBe(false);
    expect(result.status).toBe(404);
  });

  it('captures fetch failures without throwing', async () => {
    const fetchImpl = vi.fn(() => Promise.reject(new Error('network down')));
    const result = await checkTarget({ id: 'home', url: 'https://example.com/' }, fetchImpl);

    expect(result.ok).toBe(false);
    expect(result.status).toBeNull();
    expect(result.error).toBe('network down');
  });

  it('does not read non-text response bodies for contains checks', async () => {
    const fetchImpl = vi.fn(() => Promise.resolve(new Response('binary-ish', {
      status: 200,
      headers: { 'content-type': 'application/octet-stream' },
    })));
    const result = await checkTarget({ id: 'asset', url: 'https://example.com/file', contains: 'binary-ish' }, fetchImpl);

    expect(result.ok).toBe(false);
    expect(result.error).toContain('Response did not contain expected text: binary-ish');
  });
});

describe('runSyntheticChecks', () => {
  it('returns ok when all checks pass', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(textResponse('Welcome'))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));

    const result = await runSyntheticChecks(env, fetchImpl);
    expect(result.status).toBe('ok');
    expect(result.results).toHaveLength(2);
  });

  it('returns degraded when any check fails', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(textResponse('Missing marker'))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));

    const result = await runSyntheticChecks(env, fetchImpl);
    expect(result.status).toBe('degraded');
    expect(result.results.some((entry) => !entry.ok)).toBe(true);
  });
});

describe('worker routes', () => {
  it('GET /health returns monitor health', async () => {
    const res = await worker.fetch(new Request('https://monitor.test/health'), env);

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ status: 'ok', worker: 'synthetic-monitor' });
  });

  it('GET /manifest returns function catalog metadata', async () => {
    const res = await worker.fetch(new Request('https://monitor.test/manifest'), env);

    expect(res.status).toBe(200);
    const body = parseUnknownJson(await res.text());
    const payload = body as {
      manifestVersion?: unknown;
      app?: unknown;
      entries?: Array<{ path?: unknown }>;
    };
    expect(payload.manifestVersion).toBe(1);
    expect(payload.app).toBe('synthetic-monitor');
    expect(payload.entries?.some((entry) => entry.path === '/checks/run')).toBe(true);
  });

  it('GET /checks/run returns 422 for invalid configured targets', async () => {
    const res = await worker.fetch(new Request('https://monitor.test/checks/run'), {
      ENVIRONMENT: 'test',
      TARGETS_JSON: '{"bad":true}',
    });

    expect(res.status).toBe(422);
    const body = parseUnknownJson(await res.text());
    const payload = body as { error?: { code?: unknown } };
    expect(payload.error?.code).toBe('VALIDATION_ERROR');
  });

  it('GET /checks/run returns ok for passing configured targets', async () => {
    const fetchImpl = vi.fn(() => Promise.resolve(textResponse('Welcome')));
    vi.stubGlobal('fetch', fetchImpl);

    const res = await worker.fetch(new Request('https://monitor.test/checks/run'), {
      ENVIRONMENT: 'test',
      TARGETS_JSON: JSON.stringify([{ id: 'home', url: 'https://example.com/', contains: 'Welcome' }]),
    });

    expect(res.status).toBe(200);
    const body = parseUnknownJson(await res.text());
    const payload = body as { status?: unknown; results?: Array<{ ok?: unknown }> };
    expect(payload.status).toBe('ok');
    expect(payload.results?.[0]?.ok).toBe(true);
  });

  it('scheduled checks write a structured log summary', async () => {
    const fetchImpl = vi.fn(() => Promise.resolve(textResponse('Missing marker')));
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.stubGlobal('fetch', fetchImpl);

    await worker.scheduled({} as ScheduledEvent, {
      ENVIRONMENT: 'test',
      TARGETS_JSON: JSON.stringify([{ id: 'home', url: 'https://example.com/', contains: 'Welcome' }]),
    });

    expect(log).toHaveBeenCalledWith(expect.stringContaining('synthetic_monitor.run'));
    expect(log).toHaveBeenCalledWith(expect.stringContaining('degraded'));
  });
});
