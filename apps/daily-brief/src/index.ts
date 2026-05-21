import { runDailyBrief } from './brief';

/**
 * Cloudflare Worker bindings for the daily-brief service.
 *
 * Secrets (wrangler secret put):
 *   ANTHROPIC_API_KEY, GROQ_API_KEY, GROK_API_KEY, VERTEX_ACCESS_TOKEN,
 *   ELEVENLABS_API_KEY, ELEVENLABS_VOICE_ID, RESEND_API_KEY,
 *   GITHUB_TOKEN, NEWS_API_KEY, TRIGGER_TOKEN
 *
 * Vars (wrangler.jsonc):
 *   GITHUB_ORG, ZIP_CODE, RECIPIENTS, AUDIO_PUBLIC_BASE_URL,
 *   RESEND_FROM_ADDRESS, RESEND_FROM_NAME,
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
  RESEND_FROM_ADDRESS: string;
  RESEND_FROM_NAME: string;
  TRIGGER_TOKEN?: string;

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

  // Flagship feature flags
  /** Flagship feature-flag binding. */
  FLAGS?: Fetcher;
  /** flag-meter D1 database for flag telemetry. */
  FLAG_TELEMETRY?: D1Database;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/health') {
      return Response.json({ status: 'ok', service: 'daily-brief', ts: Date.now() });
    }

    // Manual trigger for testing — POST /trigger
    if (url.pathname === '/trigger' && request.method === 'POST') {
      if (env.TRIGGER_TOKEN) {
        const expected = `Bearer ${env.TRIGGER_TOKEN}`;
        if (request.headers.get('authorization') !== expected) {
          return Response.json({ status: 'unauthorized' }, { status: 401 });
        }
      }

      ctx.waitUntil(runDailyBrief(env));
      return Response.json({ status: 'triggered', message: 'Brief generation started' });
    }

    return new Response('daily-brief worker', { status: 200 });
  },

  async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(runDailyBrief(env));
  },
} satisfies ExportedHandler<Env>;
