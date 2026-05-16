import { Hono } from 'hono';
import { createLogger, requestTracingMiddleware } from '@latimer-woods-tech/logger';
import { toErrorResponse } from '@latimer-woods-tech/errors';
import type { Env } from './env.js';

const app = new Hono<{ Bindings: Env }>();

app.use('*', requestTracingMiddleware());

app.get('/health', (c) => c.json({ status: 'ok', service: 'lead-gen' }));

/**
 * Trigger a lead generation run.
 * In Phase 3, this will:
 * 1. Scrape targets via ScrapeCreators.
 * 2. Qualify via @latimer-woods-tech/llm.
 * 3. Inject into Loops.
 */
app.post('/run', async (c) => {
  const logger = createLogger({ workerId: 'lead-gen' });
  logger.info('Starting lead-gen run');
  
  // TODO: Implement scraping + qualification logic
  
  return c.json({ ok: true, message: 'Lead-gen run initiated' });
});

app.onError((err, c) => {
  const res = toErrorResponse(err);
  return c.json(res, (res.error?.status as any) || 500);
});

export default app;