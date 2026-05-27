import { complete } from '@latimer-woods-tech/llm';

/**
 * linkedin-publisher worker
 *
 * Cron: Tue/Thu at 14:00 UTC  (0 14 * * 2,4)
 *
 * On each trigger:
 *  1. Calls @latimer-woods-tech/llm (balanced tier) to draft a sharp,
 *     zero-fluff LinkedIn post translating Human Design mechanics into
 *     operational leverage for founders.
 *  2. Pushes the draft to Pushover for 1-click review and posting.
 *
 * Secrets (wrangler secret put):
 *   ANTHROPIC_API_KEY, GROQ_API_KEY, VERTEX_ACCESS_TOKEN,
 *   PUSHOVER_TOKEN, PUSHOVER_USER_KEY
 *
 * Vars (wrangler.jsonc):
 *   AI_GATEWAY_BASE_URL, VERTEX_PROJECT, VERTEX_LOCATION, ENVIRONMENT
 */
export interface Env {
  // LLM — matches @latimer-woods-tech/llm LLMEnv
  AI_GATEWAY_BASE_URL: string;
  ANTHROPIC_API_KEY: string;
  GROQ_API_KEY: string;
  VERTEX_ACCESS_TOKEN: string;
  VERTEX_PROJECT: string;
  VERTEX_LOCATION: string;

  // Pushover delivery
  PUSHOVER_TOKEN: string;
  PUSHOVER_USER_KEY: string;

  ENVIRONMENT: string;
  TRIGGER_TOKEN?: string;
}

// ---------------------------------------------------------------------------
// LinkedIn post generation
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = [
  'You are a sharp content strategist for founders who work with Human Design.',
  'Write ONE tight LinkedIn post (220-280 words) that maps a specific Human Design mechanic',
  'into a concrete operational lever founders can apply this week.',
  '',
  'Rules:',
  '- Lead with the lever, not the concept. Open with the payoff.',
  '- Zero fluff, zero spiritual jargon, zero filler phrases.',
  '- Speak peer-to-peer — founder to founder, not coach to client.',
  '- Name exactly one mechanic (e.g. Sacral authority, Splenic center, Projector Strategy,',
  '  Emotional wave, Gate 21) and map it to a real scenario: hiring, prioritisation,',
  '  deal-making, team dynamics, pricing, or decisions under pressure.',
  '- End with one crisp, grounded question that earns a comment.',
  '- No hashtag spam. One or two hashtags max, inline if they fit naturally.',
  '- Plain text only — no markdown, no bullets, no em-dash clusters.',
].join('\n');

async function draftLinkedInPost(env: Env): Promise<string> {
  const result = await complete(
    [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content: [
          'Draft the LinkedIn post for today.',
          'Pick the Human Design mechanic that will resonate most with early-stage founders right now',
          'and write the complete post.',
        ].join(' '),
      },
    ],
    {
      AI_GATEWAY_BASE_URL: env.AI_GATEWAY_BASE_URL,
      ANTHROPIC_API_KEY: env.ANTHROPIC_API_KEY,
      GROQ_API_KEY: env.GROQ_API_KEY,
      VERTEX_ACCESS_TOKEN: env.VERTEX_ACCESS_TOKEN,
      VERTEX_PROJECT: env.VERTEX_PROJECT,
      VERTEX_LOCATION: env.VERTEX_LOCATION,
    },
    { tier: 'fast', temperature: 0.82, maxTokens: 450, maxCostUsd: 0.08, project: 'linkedin-publisher', actor: 'worker', workload: 'draft' },
  );

  if (result.error) {
    const msg = result.error.message ?? 'unknown error';
    throw new Error('LLM draft failed: ' + msg);
  }

  return result.data?.content?.trim() ?? '';
}

// ---------------------------------------------------------------------------
// Pushover delivery
// ---------------------------------------------------------------------------

const LINKEDIN_COMPOSE_URL = 'https://www.linkedin.com/feed/';
/** Pushover message cap — truncate gracefully rather than hard-fail. */
const MAX_PUSHOVER_CHARS = 1000;

async function sendToPushover(env: Env, draft: string): Promise<void> {
  const message =
    draft.length <= MAX_PUSHOVER_CHARS ? draft : draft.slice(0, MAX_PUSHOVER_CHARS - 1) + '\u2026';

  const body = new URLSearchParams({
    token: env.PUSHOVER_TOKEN,
    user: env.PUSHOVER_USER_KEY,
    title: 'LinkedIn draft ready',
    message,
    url: LINKEDIN_COMPOSE_URL,
    url_title: 'Open LinkedIn to post',
    priority: '0',
  });

  const res = await fetch('https://api.pushover.net/1/messages.json', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '(unreadable)');
    throw new Error('Pushover delivery failed (' + String(res.status) + '): ' + text);
  }
}

// ---------------------------------------------------------------------------
// Main orchestrator
// ---------------------------------------------------------------------------

async function run(env: Env): Promise<void> {
  console.log('[linkedin-publisher] generating draft via LLM');
  const draft = await draftLinkedInPost(env);
  if (!draft) throw new Error('[linkedin-publisher] LLM returned an empty draft');
  console.log('[linkedin-publisher] draft ready (' + String(draft.length) + ' chars)');
  await sendToPushover(env, draft);
  console.log('[linkedin-publisher] Pushover notification delivered');
}

// ---------------------------------------------------------------------------
// Worker export
// ---------------------------------------------------------------------------

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const { pathname } = new URL(request.url);

    if (pathname === '/health') {
      return Response.json({
        status: 'ok',
        service: 'linkedin-publisher',
        env: env.ENVIRONMENT,
        ts: new Date().toISOString(),
      });
    }

    if (pathname === '/trigger' && request.method === 'POST') {
      if (env.TRIGGER_TOKEN) {
        const expected = 'Bearer ' + env.TRIGGER_TOKEN;
        if (request.headers.get('authorization') !== expected) {
          return Response.json({ status: 'unauthorized' }, { status: 401 });
        }
      }
      ctx.waitUntil(run(env));
      return Response.json({ status: 'triggered', message: 'Draft generation started' });
    }

    return new Response('linkedin-publisher', { status: 200 });
  },

  async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(run(env));
  },
} satisfies ExportedHandler<Env>;
