import { Hono } from 'hono';
import type { Env } from './env.js';

/** One brand surface to probe on every cron tick. */
export interface ProbeTarget {
  name: string;
  url: string;
}

/** Result of one HEAD/GET probe. */
export interface ProbeResult {
  name: string;
  url: string;
  alive: boolean;
  status: number | null;
  durationMs: number;
  error?: string;
}

/** Envelope persisted to KV under key `current` and returned by GET /current. */
export interface ProbeEnvelope {
  generatedAt: string;
  results: ProbeResult[];
}

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

/** The four canonical brand surfaces shown on https://latwoodtech.com/status/. */
export const BRAND_SURFACES: readonly ProbeTarget[] = [
  { name: 'Prime Self', url: 'https://selfprime.net' },
  { name: 'Capricast', url: 'https://capricast.com' },
  { name: 'Cypher of Healing', url: 'https://cypherofhealing.com' },
  { name: 'AP Unlimited', url: 'https://apunlimited.com' },
];

const DEFAULT_TIMEOUT_MS = 8_000;
const KV_KEY_CURRENT = 'current';
const USER_AGENT = 'factory-status-prober/0.1 (+https://latwoodtech.com/status/)';

/** Status codes that some upstreams return for HEAD even though GET works. */
const HEAD_REJECT_STATUSES: ReadonlySet<number> = new Set([405, 501]);

function elapsedMs(start: number): number {
  return Math.max(0, Math.round(performance.now() - start));
}

/**
 * Probe one surface with HEAD, falling back to GET on `405` / `501`.
 *
 * @param target - Brand surface to check.
 * @param fetchImpl - Injectable fetch implementation for tests.
 * @param timeoutMs - Hard per-probe deadline; defaults to 8s.
 */
export async function probeTarget(
  target: ProbeTarget,
  fetchImpl: FetchLike = fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<ProbeResult> {
  const startedAt = performance.now();
  const baseInit: RequestInit = {
    redirect: 'follow',
    headers: { 'user-agent': USER_AGENT },
  };

  async function withTimeout(method: 'HEAD' | 'GET'): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetchImpl(target.url, {
        ...baseInit,
        method,
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }
  }

  try {
    let response = await withTimeout('HEAD');
    if (HEAD_REJECT_STATUSES.has(response.status)) {
      response = await withTimeout('GET');
    }
    const alive = response.status >= 200 && response.status < 400;
    return {
      name: target.name,
      url: target.url,
      alive,
      status: response.status,
      durationMs: elapsedMs(startedAt),
    };
  } catch (err) {
    const message =
      err instanceof Error
        ? err.name === 'AbortError'
          ? `timeout after ${timeoutMs}ms`
          : err.message
        : 'unknown probe failure';
    return {
      name: target.name,
      url: target.url,
      alive: false,
      status: null,
      durationMs: elapsedMs(startedAt),
      error: message,
    };
  }
}

/**
 * Run the full probe suite in parallel and return a populated envelope.
 *
 * @param fetchImpl - Injectable fetch implementation for tests.
 * @param targets - Override the default brand surfaces (used in tests).
 */
export async function runProbes(
  fetchImpl: FetchLike = fetch,
  targets: readonly ProbeTarget[] = BRAND_SURFACES,
): Promise<ProbeEnvelope> {
  const results = await Promise.all(targets.map((target) => probeTarget(target, fetchImpl)));
  return {
    generatedAt: new Date().toISOString(),
    results,
  };
}

/**
 * Persist the latest probe envelope to KV. Logs and swallows storage failures
 * so a flaky KV write never tanks the cron run.
 */
export async function persistEnvelope(env: Env, envelope: ProbeEnvelope): Promise<void> {
  try {
    await env.STATUS_KV.put(KV_KEY_CURRENT, JSON.stringify(envelope));
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown KV write failure';
    console.error(JSON.stringify({ event: 'status_prober.kv_write_failed', error: message }));
  }
}

/** Load the current envelope from KV, returning `null` when the namespace is cold. */
export async function loadEnvelope(env: Env): Promise<ProbeEnvelope | null> {
  const raw = await env.STATUS_KV.get(KV_KEY_CURRENT);
  if (!raw) {
    return null;
  }
  try {
    return JSON.parse(raw) as ProbeEnvelope;
  } catch {
    return null;
  }
}

const app = new Hono<{ Bindings: Env }>();

const CORS_HEADERS: Record<string, string> = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, HEAD, OPTIONS',
  'access-control-allow-headers': 'content-type',
};

app.options('/current', () => new Response(null, { status: 204, headers: CORS_HEADERS }));

app.get('/', (c) =>
  c.json({
    worker: 'status-prober',
    endpoints: {
      current: '/current',
      health: '/health',
    },
    surfaces: BRAND_SURFACES.map((target) => target.name),
  }),
);

app.get('/health', async (c) => {
  const envelope = await loadEnvelope(c.env);
  return c.json({
    ok: true,
    worker: 'status-prober',
    environment: c.env.ENVIRONMENT,
    lastProbe: envelope?.generatedAt ?? null,
    surfaceCount: BRAND_SURFACES.length,
  });
});

app.get('/current', async (c) => {
  const envelope = await loadEnvelope(c.env);
  if (!envelope) {
    return new Response(JSON.stringify({ error: 'no probe yet' }), {
      status: 503,
      headers: {
        ...CORS_HEADERS,
        'content-type': 'application/json',
        'cache-control': 'no-store',
      },
    });
  }
  return new Response(JSON.stringify(envelope), {
    status: 200,
    headers: {
      ...CORS_HEADERS,
      'content-type': 'application/json',
      'cache-control': 'public, max-age=60',
    },
  });
});

app.onError((err, c) => {
  const message = err instanceof Error ? err.message : 'unknown error';
  console.error(JSON.stringify({ event: 'status_prober.unhandled_error', error: message }));
  return c.json({ ok: false, error: message }, 500);
});

export default {
  fetch: app.fetch,
  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    const envelope = await runProbes();
    ctx.waitUntil(persistEnvelope(env, envelope));
    const aliveCount = envelope.results.filter((result) => result.alive).length;
    console.log(
      JSON.stringify({
        event: 'status_prober.run',
        environment: env.ENVIRONMENT,
        generatedAt: envelope.generatedAt,
        alive: aliveCount,
        total: envelope.results.length,
        results: envelope.results.map((result) => ({
          name: result.name,
          alive: result.alive,
          status: result.status,
          durationMs: result.durationMs,
          error: result.error,
        })),
      }),
    );
  },
};
