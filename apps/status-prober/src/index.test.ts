import { describe, expect, it, vi } from 'vitest';
import worker, {
  BRAND_SURFACES,
  loadEnvelope,
  persistEnvelope,
  probeTarget,
  runProbes,
  type ProbeEnvelope,
} from './index.js';
import type { Env } from './env.js';

function makeKv(initial: Map<string, string> = new Map()): KVNamespace {
  const store = new Map(initial);
  const kv = {
    get: vi.fn((key: string) => Promise.resolve(store.get(key) ?? null)),
    put: vi.fn((key: string, value: string) => {
      store.set(key, value);
      return Promise.resolve();
    }),
    delete: vi.fn((key: string) => {
      store.delete(key);
      return Promise.resolve();
    }),
    list: vi.fn(() =>
      Promise.resolve({ keys: [...store.keys()].map((name) => ({ name })) }),
    ),
    __store: store,
  } as unknown as KVNamespace & { __store: Map<string, string> };
  return kv;
}

function makeEnv(initial?: Map<string, string>): Env {
  return {
    STATUS_KV: makeKv(initial),
    ENVIRONMENT: 'test',
  };
}

function headResponse(status = 200): Response {
  return new Response(null, { status });
}

function jsonOf<T>(text: string): T {
  return JSON.parse(text) as T;
}

describe('probeTarget', () => {
  it('marks 2xx responses alive', async () => {
    const fetchImpl = vi.fn(() => Promise.resolve(headResponse(200)));
    const result = await probeTarget({ name: 'X', url: 'https://example.com/' }, fetchImpl);

    expect(result.alive).toBe(true);
    expect(result.status).toBe(200);
    expect(result.error).toBeUndefined();
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://example.com/',
      expect.objectContaining({ method: 'HEAD', redirect: 'follow' }),
    );
  });

  it('falls back to GET when HEAD returns 405', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(headResponse(405))
      .mockResolvedValueOnce(new Response('ok', { status: 200 }));

    const result = await probeTarget({ name: 'X', url: 'https://example.com/' }, fetchImpl);

    expect(result.alive).toBe(true);
    expect(result.status).toBe(200);
    expect(fetchImpl).toHaveBeenNthCalledWith(
      1,
      'https://example.com/',
      expect.objectContaining({ method: 'HEAD' }),
    );
    expect(fetchImpl).toHaveBeenNthCalledWith(
      2,
      'https://example.com/',
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('falls back to GET when HEAD returns 501', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(headResponse(501))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));

    const result = await probeTarget({ name: 'X', url: 'https://example.com/' }, fetchImpl);

    expect(result.alive).toBe(true);
    expect(result.status).toBe(204);
  });

  it('flags 5xx responses dead', async () => {
    const fetchImpl = vi.fn(() => Promise.resolve(headResponse(503)));
    const result = await probeTarget({ name: 'X', url: 'https://example.com/' }, fetchImpl);

    expect(result.alive).toBe(false);
    expect(result.status).toBe(503);
  });

  it('captures network failures without throwing', async () => {
    const fetchImpl = vi.fn(() => Promise.reject(new Error('boom')));
    const result = await probeTarget({ name: 'X', url: 'https://example.com/' }, fetchImpl);

    expect(result.alive).toBe(false);
    expect(result.status).toBeNull();
    expect(result.error).toBe('boom');
  });

  it('reports timeout via abort', async () => {
    const fetchImpl = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          reject(new DOMException('aborted', 'AbortError'));
        });
      });
    });
    const result = await probeTarget({ name: 'X', url: 'https://example.com/' }, fetchImpl, 5);

    expect(result.alive).toBe(false);
    expect(result.error).toContain('timeout');
  });

  it('reports generic failure when fetch rejects with a non-Error', async () => {
    const fetchImpl = vi.fn(() => Promise.reject('plain string'));
    const result = await probeTarget({ name: 'X', url: 'https://example.com/' }, fetchImpl);

    expect(result.alive).toBe(false);
    expect(result.error).toBe('unknown probe failure');
  });
});

describe('runProbes', () => {
  it('returns one result per target', async () => {
    const fetchImpl = vi.fn(() => Promise.resolve(headResponse(200)));
    const envelope = await runProbes(fetchImpl, [
      { name: 'A', url: 'https://a.example/' },
      { name: 'B', url: 'https://b.example/' },
    ]);

    expect(envelope.results).toHaveLength(2);
    expect(envelope.results.every((entry) => entry.alive)).toBe(true);
    expect(envelope.generatedAt).toMatch(/\d{4}-\d{2}-\d{2}T/);
  });

  it('defaults to the four brand surfaces', async () => {
    const fetchImpl = vi.fn(() => Promise.resolve(headResponse(200)));
    const envelope = await runProbes(fetchImpl);

    expect(envelope.results).toHaveLength(BRAND_SURFACES.length);
    expect(envelope.results.map((entry) => entry.name)).toEqual(
      BRAND_SURFACES.map((target) => target.name),
    );
  });
});

describe('persistEnvelope', () => {
  it('writes the envelope JSON to KV', async () => {
    const env = makeEnv();
    const envelope: ProbeEnvelope = {
      generatedAt: '2026-05-23T00:00:00.000Z',
      results: [],
    };

    await persistEnvelope(env, envelope);
    const stored = await env.STATUS_KV.get('current');

    expect(stored).not.toBeNull();
    expect(jsonOf<ProbeEnvelope>(stored ?? '')).toEqual(envelope);
  });

  it('swallows KV write failures and logs', async () => {
    const env = makeEnv();
    (env.STATUS_KV.put as unknown as ReturnType<typeof vi.fn>).mockImplementationOnce(() =>
      Promise.reject(new Error('kv down')),
    );
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    await expect(
      persistEnvelope(env, { generatedAt: 'now', results: [] }),
    ).resolves.toBeUndefined();
    expect(err).toHaveBeenCalledWith(expect.stringContaining('status_prober.kv_write_failed'));
  });
});

describe('loadEnvelope', () => {
  it('returns null when KV is empty', async () => {
    const env = makeEnv();
    await expect(loadEnvelope(env)).resolves.toBeNull();
  });

  it('returns the parsed envelope when present', async () => {
    const envelope: ProbeEnvelope = {
      generatedAt: '2026-05-23T00:00:00.000Z',
      results: [
        { name: 'X', url: 'https://x.example/', alive: true, status: 200, durationMs: 7 },
      ],
    };
    const env = makeEnv(new Map([['current', JSON.stringify(envelope)]]));

    await expect(loadEnvelope(env)).resolves.toEqual(envelope);
  });

  it('returns null when KV holds invalid JSON', async () => {
    const env = makeEnv(new Map([['current', '{ not json']]));
    await expect(loadEnvelope(env)).resolves.toBeNull();
  });
});

describe('worker routes', () => {
  it('GET / returns a terse index', async () => {
    const env = makeEnv();
    const res = await worker.fetch(new Request('https://status.test/'), env, {
      waitUntil: () => undefined,
      passThroughOnException: () => undefined,
    } as unknown as ExecutionContext);

    expect(res.status).toBe(200);
    const body = jsonOf<{ worker?: string; endpoints?: Record<string, string>; surfaces?: string[] }>(
      await res.text(),
    );
    expect(body.worker).toBe('status-prober');
    expect(body.endpoints?.current).toBe('/current');
    expect(body.endpoints?.health).toBe('/health');
    expect(body.surfaces).toContain('Prime Self');
  });

  it('GET /health returns lastProbe=null when KV is cold', async () => {
    const env = makeEnv();
    const res = await worker.fetch(new Request('https://status.test/health'), env, {
      waitUntil: () => undefined,
      passThroughOnException: () => undefined,
    } as unknown as ExecutionContext);

    expect(res.status).toBe(200);
    const body = jsonOf<{ ok?: boolean; lastProbe?: string | null }>(await res.text());
    expect(body.ok).toBe(true);
    expect(body.lastProbe).toBeNull();
  });

  it('GET /health surfaces the latest probe timestamp', async () => {
    const envelope: ProbeEnvelope = {
      generatedAt: '2026-05-23T12:34:56.000Z',
      results: [],
    };
    const env = makeEnv(new Map([['current', JSON.stringify(envelope)]]));

    const res = await worker.fetch(new Request('https://status.test/health'), env, {
      waitUntil: () => undefined,
      passThroughOnException: () => undefined,
    } as unknown as ExecutionContext);

    expect(res.status).toBe(200);
    const body = jsonOf<{ lastProbe?: string | null }>(await res.text());
    expect(body.lastProbe).toBe('2026-05-23T12:34:56.000Z');
  });

  it('GET /current returns 503 when KV is cold', async () => {
    const env = makeEnv();
    const res = await worker.fetch(new Request('https://status.test/current'), env, {
      waitUntil: () => undefined,
      passThroughOnException: () => undefined,
    } as unknown as ExecutionContext);

    expect(res.status).toBe(503);
    expect(res.headers.get('access-control-allow-origin')).toBe('*');
    const body = jsonOf<{ error?: string }>(await res.text());
    expect(body.error).toBe('no probe yet');
  });

  it('GET /current returns the envelope with CORS + cache headers', async () => {
    const envelope: ProbeEnvelope = {
      generatedAt: '2026-05-23T00:00:00.000Z',
      results: [
        { name: 'X', url: 'https://x.example/', alive: true, status: 200, durationMs: 9 },
      ],
    };
    const env = makeEnv(new Map([['current', JSON.stringify(envelope)]]));

    const res = await worker.fetch(new Request('https://status.test/current'), env, {
      waitUntil: () => undefined,
      passThroughOnException: () => undefined,
    } as unknown as ExecutionContext);

    expect(res.status).toBe(200);
    expect(res.headers.get('access-control-allow-origin')).toBe('*');
    expect(res.headers.get('cache-control')).toBe('public, max-age=60');
    const body = jsonOf<ProbeEnvelope>(await res.text());
    expect(body.results).toHaveLength(1);
  });

  it('OPTIONS /current returns CORS preflight', async () => {
    const env = makeEnv();
    const res = await worker.fetch(
      new Request('https://status.test/current', { method: 'OPTIONS' }),
      env,
      {
        waitUntil: () => undefined,
        passThroughOnException: () => undefined,
      } as unknown as ExecutionContext,
    );

    expect(res.status).toBe(204);
    expect(res.headers.get('access-control-allow-origin')).toBe('*');
  });
});

describe('scheduled handler', () => {
  it('writes a fresh envelope to KV and logs the run summary', async () => {
    const env = makeEnv();
    const fetchImpl = vi.fn(() => Promise.resolve(headResponse(200)));
    vi.stubGlobal('fetch', fetchImpl);
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    const waitUntilPromises: Array<Promise<unknown>> = [];
    const ctx: ExecutionContext = {
      waitUntil: (promise: Promise<unknown>) => {
        waitUntilPromises.push(promise);
      },
      passThroughOnException: () => undefined,
    } as ExecutionContext;

    await worker.scheduled({} as ScheduledEvent, env, ctx);
    await Promise.all(waitUntilPromises);

    const stored = await env.STATUS_KV.get('current');
    expect(stored).not.toBeNull();
    const envelope = jsonOf<ProbeEnvelope>(stored ?? '');
    expect(envelope.results).toHaveLength(BRAND_SURFACES.length);
    expect(envelope.results.every((entry) => entry.alive)).toBe(true);
    expect(log).toHaveBeenCalledWith(expect.stringContaining('status_prober.run'));
  });
});
