import { Hono } from 'hono';
import { createLogger, requestTracingMiddleware } from '@latimer-woods-tech/logger';
import { toErrorResponse } from '@latimer-woods-tech/errors';
import { complete } from '@latimer-woods-tech/llm';
import type { Env } from './env.js';

const app = new Hono<{ Bindings: Env }>();

app.use('*', requestTracingMiddleware());

app.get('/health', (c) => c.json({ status: 'ok', service: 'lead-gen' }));

/**
 * Trigger a lead generation run.
 */
app.post('/run', async (c) => {
  const logger = createLogger({ workerId: 'lead-gen' });
  const { handle } = await c.req.json<{ handle: string }>();
  
  if (!handle) return c.json({ error: 'Missing handle' }, 400);

  logger.info('Starting lead-gen run', { handle });

  // 1. Scrape via ScrapeCreators
  const scrapeRes = await fetch(`https://api.scrapecreators.com/v1/tiktok/profile?handle=${handle}`, {
    headers: { 'x-api-key': c.env.SCRAPE_CREATORS_API_KEY }
  });
  
  if (!scrapeRes.ok) {
    logger.error('Scrape failed', await scrapeRes.text());
    return c.json({ error: 'Scrape failed' }, 500);
  }
  
  const profile = await scrapeRes.json();

  // 2. Qualify via LLM
  const qualification = await complete(
    [
      { role: 'system', content: 'You are a lead qualification agent. Analyze the profile and determine if they are a good fit for Latimer & Woods Tech products.' },
      { role: 'user', content: JSON.stringify(profile) }
    ],
    {
      AI_GATEWAY_BASE_URL: c.env.AI_GATEWAY_BASE_URL,
      ANTHROPIC_API_KEY: c.env.ANTHROPIC_API_KEY,
      GROQ_API_KEY: c.env.GROQ_API_KEY,
      VERTEX_ACCESS_TOKEN: c.env.VERTEX_ACCESS_TOKEN,
      VERTEX_PROJECT: c.env.VERTEX_PROJECT,
      VERTEX_LOCATION: c.env.VERTEX_LOCATION,
    },
    { tier: 'balanced' }
  );

  if (qualification.error) {
    logger.error('Qualification failed', qualification.error);
    return c.json({ error: 'Qualification failed' }, 500);
  }

  // 3. Inject into Loops (if qualified)
  if (qualification.data.content.includes('QUALIFIED')) {
    logger.info('Lead qualified, injecting into Loops', { handle });
    
    const loopsRes = await fetch('https://app.loops.so/api/v1/contacts/create', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${c.env.LOOPS_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        email: `${handle}@tiktok.placeholder`, // Placeholder until real email found
        firstName: handle,
        source: 'lead-gen-engine',
        userGroup: 'Lead',
        metadata: {
          qualification: qualification.data.content,
          profileData: JSON.stringify(profile)
        }
      })
    });

    if (!loopsRes.ok) {
      logger.error('Loops injection failed', await loopsRes.text());
    }
  }

  return c.json({ ok: true, qualified: qualification.data.content.includes('QUALIFIED') });
});

app.onError((err, c) => {
  const res = toErrorResponse(err);
  return c.json(res, (res.error?.status as any) || 500);
});

export default app;