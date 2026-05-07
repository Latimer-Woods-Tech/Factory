import { runDailyBrief } from './brief';

/**
 * Cloudflare Worker bindings for the daily-brief service.
 *
 * Secrets (wrangler secret put):
 *   ANTHROPIC_API_KEY, GROQ_API_KEY, GROK_API_KEY, VERTEX_ACCESS_TOKEN,
 *   ELEVENLABS_API_KEY, ELEVENLABS_VOICE_ID, RESEND_API_KEY,
 *   GITHUB_TOKEN, NEWS_API_KEY
 *
 * Vars (wrangler.jsonc):
 *   GITHUB_ORG, ZIP_CODE, RECIPIENTS, AUDIO_PUBLIC_BASE_URL,
 *   AI_GATEWAY_BASE_URL, VERTEX_PROJECT, VERTEX_LOCATION
 */
export interface Env {
  // R2 bucket for audio narration storage
  AUDIO_BUCKET: R2Bucket;

  // LLM chain — matches @latimer-woods-tech/llm LLMEnv
  AI_GATEWAY_BASE_URL: string;
  ANTHROPIC_API_KEY: string;
  GROQ_API_KEY: string;
  GROK_API_KEY?: string;
  VERTEX_ACCESS_TOKEN: string;
  VERTEX_PROJECT: string;
  VERTEX_LOCATION: string;

  // ElevenLabs TTS
  ELEVENLABS_API_KEY: string;
  ELEVENLABS_VOICE_ID: string;

  // Email (Resend)
  RESEND_API_KEY: string;

  // External data APIs
  GITHUB_TOKEN: string;
  NEWS_API_KEY: string;

  // Revenue
  STRIPE_SECRET_KEY?: string;

  // Product analytics
  POSTHOG_API_KEY?: string;
  POSTHOG_PROJECT_ID?: string;

  // Error monitoring
  SENTRY_AUTH_TOKEN?: string;
  SENTRY_ORG?: string;

  // Config
  GITHUB_ORG: string;
  ZIP_CODE: string;
  RECIPIENTS: string;
  AUDIO_PUBLIC_BASE_URL: string;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/health') {
      return Response.json({ status: 'ok', service: 'daily-brief', ts: Date.now() });
    }

    // Manual trigger for testing — POST /trigger
    if (url.pathname === '/trigger' && request.method === 'POST') {
      ctx.waitUntil(runDailyBrief(env));
      return Response.json({ status: 'triggered', message: 'Brief generation started' });
    }

    return new Response('daily-brief worker', { status: 200 });
  },

  async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(runDailyBrief(env));
  },
} satisfies ExportedHandler<Env>;
