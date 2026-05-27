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
      GROK_API_KEY: c.env.GROK_API_KEY,
      VERTEX_ACCESS_TOKEN: c.env.VERTEX_ACCESS_TOKEN,
      VERTEX_PROJECT: c.env.VERTEX_PROJECT,
      VERTEX_LOCATION: c.env.VERTEX_LOCATION,
    },
    { tier: 'fast', maxTokens: 350, maxCostUsd: 0.05, project: 'lead-gen', actor: 'worker', workload: 'lead-qualification' }
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
        email: `${handle}@tiktok.placeholder`,
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

/**
 * POST /reddit-sniper — manually trigger the Reddit Sniper.
 */
app.post('/reddit-sniper', async (c) => {
  const logger = createLogger({ workerId: 'lead-gen-reddit-sniper' });
  await runRedditSniper(c.env, logger);
  return c.json({ ok: true });
});

app.onError((err, c) => {
  const res = toErrorResponse(err);
  return c.json(res, (res.error?.status as any) || 500);
});

// ── Reddit Sniper ─────────────────────────────────────────────────────────────

/**
 * Searches Reddit for the top 3 "Human Design" posts, drafts empathetic
 * non-salesy replies via the LLM, then fires Pushover notifications.
 */
async function runRedditSniper(env: Env, logger: ReturnType<typeof createLogger>) {
  logger.info('Reddit Sniper: starting run');

  // 1. Scrape Reddit ───────────────────────────────────────────────────────────
  const redditRes = await fetch(
    'https://api.scrapecreators.com/v1/reddit/search?query=Human+Design',
    { headers: { 'x-api-key': env.SCRAPE_CREATORS_API_KEY } }
  );

  if (!redditRes.ok) {
    logger.error('Reddit search failed', await redditRes.text());
    return;
  }

  const redditData = await redditRes.json() as any;
  const posts: any[] = (redditData.posts ?? redditData.data ?? []).slice(0, 3);

  if (posts.length === 0) {
    logger.info('Reddit Sniper: no posts found');
    return;
  }

  logger.info(`Reddit Sniper: drafting replies for ${posts.length} posts`);

  const llmEnv = {
    AI_GATEWAY_BASE_URL: env.AI_GATEWAY_BASE_URL,
    ANTHROPIC_API_KEY: env.ANTHROPIC_API_KEY,
    GROQ_API_KEY: env.GROQ_API_KEY,
    GROK_API_KEY: env.GROK_API_KEY,
    VERTEX_ACCESS_TOKEN: env.VERTEX_ACCESS_TOKEN,
    VERTEX_PROJECT: env.VERTEX_PROJECT,
    VERTEX_LOCATION: env.VERTEX_LOCATION,
  };

  const systemPrompt = [
    'You are a thoughtful community member deeply knowledgeable in Human Design mechanics.',
    'Given a Reddit post, write a concise, empathetic reply that:',
    '  • Acknowledges the poster's situation or question with genuine warmth',
    '  • Shares a relevant insight rooted in Human Design (e.g. Type, Authority, Centers, Gates)',
    '  • Never pitches products, services, or links — pure value only',
    '  • Reads naturally; does NOT sound like marketing copy',
    'Keep the reply under 150 words.',
  ].join('
');

  // 2. Draft replies in parallel ───────────────────────────────────────────────
  const drafts = await Promise.all(
    posts.map(async (post: any) => {
      const postUrl = post.permalink
        ? `https://www.reddit.com${post.permalink}`
        : (post.url ?? '');

      const userContent = [
        `Title: ${post.title ?? 'N/A'}`,
        `Body: ${post.selftext ?? post.body ?? '(no body)'}`,
        `Subreddit: r/${post.subreddit ?? 'unknown'}`,
      ].join('
');

      const result = await complete(
        [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userContent },
        ],
        llmEnv,
        { tier: 'fast', maxTokens: 220, maxCostUsd: 0.03, project: 'lead-gen', actor: 'worker', workload: 'reddit-reply' }
      );

      const reply = result.error
        ? `(LLM error: ${result.error})`
        : result.data.content;

      return { post, postUrl, reply };
    })
  );

  // 3. Send Pushover notifications ─────────────────────────────────────────────
  for (const { post, postUrl, reply } of drafts) {
    const message = [
      `📌 r/${post.subreddit ?? 'reddit'} — ${post.title ?? 'Post'}`,
      '',
      '💬 Suggested reply:',
      reply,
      '',
      `🔗 ${postUrl}`,
    ].join('
');

    const pushoverRes = await fetch('https://api.pushover.net/1/messages.json', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token: env.PUSHOVER_TOKEN,
        user: env.PUSHOVER_USER_KEY,
        title: '🎯 Reddit Sniper — Human Design',
        message: message.slice(0, 1024), // Pushover limit
        url: postUrl,
        url_title: 'Open Reddit post',
      }),
    });

    if (!pushoverRes.ok) {
      logger.error('Pushover notification failed', await pushoverRes.text());
    } else {
      logger.info('Pushover notification sent', { postUrl });
    }
  }

  logger.info('Reddit Sniper: run complete');
}

// ── Cloudflare Worker export ───────────────────────────────────────────────────
export default {
  fetch: app.fetch,
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    const logger = createLogger({ workerId: 'lead-gen-cron' });
    logger.info('Running scheduled lead discovery', { cron: event.cron });

    // Run Reddit Sniper alongside the existing TikTok discovery
    ctx.waitUntil(runRedditSniper(env, logger));

    // Keywords to cycle through
    const keywords = ['Human Design', 'Astrology', 'Gene Keys'];
    const keyword = keywords[new Date(event.scheduledTime).getDay() % keywords.length];

    try {
      const res = await fetch(`https://api.scrapecreators.com/v1/tiktok/search/users?query=${encodeURIComponent(keyword)}`, {
        headers: { 'x-api-key': env.SCRAPE_CREATORS_API_KEY }
      });

      if (!res.ok) {
        logger.error('Failed to search TikTok users', await res.text());
        return;
      }

      const data = await res.json() as any;
      const users = data.data || data.users || [];

      logger.info(`Found ${users.length} users for keyword: ${keyword}`);

      // Fan out to queue
      const messages = users.slice(0, 20).map((u: any) => ({
        body: { handle: u.unique_id || u.handle || u.username }
      })).filter((m: any) => m.body.handle);

      if (messages.length > 0) {
        await env.LEAD_GEN_QUEUE.sendBatch(messages);
        logger.info(`Queued ${messages.length} handles for qualification`);
      }
    } catch (err) {
      logger.error('Scheduled discovery failed', err instanceof Error ? err.message : String(err));
    }
  }
};
