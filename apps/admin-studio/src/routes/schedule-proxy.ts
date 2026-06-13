import { Hono } from 'hono';
import type { AppEnv } from '../types.js';

const scheduleProxy = new Hono<AppEnv>();

function scheduleWorkerHeaders(env: { WORKER_API_TOKEN?: string }): Headers {
  const headers = new Headers({ 'Content-Type': 'application/json' });
  if (env.WORKER_API_TOKEN) {
    headers.set('Authorization', `Bearer ${env.WORKER_API_TOKEN}`);
  }
  return headers;
}

// Mounted at /training-library → this handler sees path /
scheduleProxy.get('/', async (c) => {
  if (!c.env.SCHEDULE_WORKER) {
    return c.json({ error: 'Schedule worker binding not configured' }, 503);
  }
  const appId = c.req.query('appId');
  if (!appId) {
    return c.json({ error: 'appId is required' }, 400);
  }
  const url = `https://schedule-worker.internal/training-library?appId=${encodeURIComponent(appId)}`;
  const res = await c.env.SCHEDULE_WORKER.fetch(new Request(url, {
    headers: scheduleWorkerHeaders(c.env),
  }));
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: 'upstream error' }));
    return c.json(body as Record<string, unknown>, res.status as 400 | 401 | 403 | 404 | 500 | 503);
  }
  const wrapped = await res.json<{ data: unknown }>();
  return c.json(wrapped.data);
});

// Mounted at /jobs → this handler sees path /from-brief
scheduleProxy.post('/from-brief', async (c) => {
  if (!c.env.SCHEDULE_WORKER) {
    return c.json({ error: 'Schedule worker binding not configured' }, 503);
  }
  const body = await c.req.text();
  const res = await c.env.SCHEDULE_WORKER.fetch(
    new Request('https://schedule-worker.internal/jobs/from-brief', {
      method: 'POST',
      headers: scheduleWorkerHeaders(c.env),
      body,
    }),
  );
  const resBody = await res.json().catch(() => ({ error: 'upstream error' }));
  return c.json(resBody as Record<string, unknown>, res.status as 200 | 201 | 400 | 401 | 403 | 404 | 500 | 503);
});

export default scheduleProxy;
