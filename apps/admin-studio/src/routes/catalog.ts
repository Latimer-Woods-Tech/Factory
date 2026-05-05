/**
 * Phase E — Function catalog routes.
 *
 *   GET  /catalog                      → grouped summary (app, env, count)
 *   GET  /catalog/:app                 → catalog rows for an app (?env=…)
 *   POST /catalog/:app/refresh         → fetch the app's /manifest, validate,
 *                                        upsert into function_catalog
 *
 * The crawler is intentionally simple: HTTP GET the manifest URL we
 * already know (from `app-registry`), 5-second timeout, validate via
 * studio-core's `validateManifest`, then upsert. No pagination needed —
 * Factory apps have a few dozen routes each.
 */
import { Hono } from 'hono';
import {
  isEnvironment,
  validateManifest,
  type Environment,
  type FunctionManifest,
} from '@latimer-woods-tech/studio-core';
import type { AppEnv } from '../types.js';
import { FACTORY_APPS, manifestUrlFor } from '../lib/app-registry.js';
import { listCatalog, summariseCatalog, upsertManifest } from '../lib/catalog-store.js';
import { isTableMissing } from '../lib/schema-readiness.js';

const catalog = new Hono<AppEnv>();

const MANIFEST_TIMEOUT_MS = 5_000;
const MAX_MANIFEST_BYTES = 1_048_576; // 1 MiB — far more than any real surface

catalog.get('/', async (c) => {
  try {
    const summary = await summariseCatalog(c.env.DB);
    const known = FACTORY_APPS.map((a) => ({ id: a.id, label: a.label }));
    return c.json({ summary, apps: known });
  } catch (err) {
    if (isTableMissing(err, 'function_catalog')) {
      return c.json(
        { error: 'schema not ready', detail: 'function_catalog table does not exist — run database migrations' },
        503,
      );
    }
    return c.json({ error: 'catalog read failed', detail: (err as Error).message }, 500);
  }
});

catalog.get('/:app', async (c) => {
  const app = c.req.param('app');
  const envParam = c.req.query('env') ?? 'production';
  if (!isEnvironment(envParam)) return c.json({ error: 'invalid env' }, 400);
  try {
    const rows = await listCatalog(c.env.DB, app, envParam);
    return c.json({ app, env: envParam, rows });
  } catch (err) {
    if (isTableMissing(err, 'function_catalog')) {
      return c.json(
        { error: 'schema not ready', detail: 'function_catalog table does not exist — run database migrations' },
        503,
      );
    }
    return c.json({ error: 'catalog read failed', detail: (err as Error).message }, 500);
  }
});

catalog.post('/:app/refresh', async (c) => {
  const appId = c.req.param('app');
  const envParam = c.req.query('env') ?? 'production';
  if (!isEnvironment(envParam)) return c.json({ error: 'invalid env' }, 400);
  if (envParam === 'local') return c.json({ error: 'cannot crawl local env' }, 400);

  const app = FACTORY_APPS.find((a) => a.id === appId);
  if (!app) return c.json({ error: 'unknown app' }, 404);

  const url = manifestUrlFor(app, envParam as Environment);
  if (!url) return c.json({ error: 'no manifest URL' }, 400);

  const manifest = await fetchManifest(url);
  if ('error' in manifest) {
    return c.json({ error: manifest.error, detail: manifest.detail, url }, 502);
  }

  // Belt-and-braces: server-reported app must match the registry id, else
  // we'd silently accept a misrouted manifest after a DNS migration.
  if (manifest.app !== appId) {
    return c.json(
      { error: 'manifest app mismatch', expected: appId, actual: manifest.app, url },
      409,
    );
  }

  try {
    const result = await upsertManifest(c.env.DB, manifest);
    return c.json({
      app: appId,
      env: envParam,
      url,
      entries: manifest.entries.length,
      upserted: result.upserted,
      failed: result.failed,
      buildSha: manifest.buildSha ?? null,
      generatedAt: manifest.generatedAt,
    });
  } catch (err) {
    if (isTableMissing(err, 'function_catalog')) {
      return c.json(
        { error: 'schema not ready', detail: 'function_catalog table does not exist — run database migrations' },
        503,
      );
    }
    throw err;
  }
});

interface FetchError {
  error: string;
  detail?: string;
}

async function fetchManifest(url: string): Promise<FunctionManifest | FetchError> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), MANIFEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json', 'User-Agent': 'factory-studio-crawler/1' },
      signal: controller.signal,
    });
    if (!res.ok) {
      return { error: `manifest fetch ${res.status}`, detail: await safeText(res, 200) };
    }
    const lenHeader = res.headers.get('content-length');
    if (lenHeader && Number(lenHeader) > MAX_MANIFEST_BYTES) {
      return { error: 'manifest too large', detail: lenHeader };
    }
    const text = await res.text();
    if (text.length > MAX_MANIFEST_BYTES) {
      return { error: 'manifest too large', detail: String(text.length) };
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch (err) {
      return { error: 'invalid json', detail: (err as Error).message };
    }
    const reason = validateManifest(parsed);
    if (reason) return { error: 'invalid manifest', detail: reason };
    return parsed as FunctionManifest;
  } catch (err) {
    if ((err as Error).name === 'AbortError') return { error: 'timeout' };
    return { error: 'fetch failed', detail: (err as Error).message };
  } finally {
    clearTimeout(timer);
  }
}

async function safeText(res: Response, max: number): Promise<string> {
  try {
    const t = await res.text();
    return t.slice(0, max);
  } catch {
    return '';
  }
}

export default catalog;
