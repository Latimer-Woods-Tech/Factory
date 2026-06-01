import { runDailyBrief } from './brief';

/**
 * Cloudflare Worker bindings for the daily-brief service.
 *
 * Secrets (wrangler secret put):
 *   ANTHROPIC_API_KEY, GROQ_API_KEY, GROK_API_KEY, VERTEX_ACCESS_TOKEN,
 *   ELEVENLABS_API_KEY, ELEVENLABS_VOICE_ID, RESEND_API_KEY,
 *   GITHUB_TOKEN, TRIGGER_TOKEN
 *
 * Vars (wrangler.jsonc):
 *   GITHUB_ORG, ZIP_CODE, RECIPIENTS, PUBLIC_BASE_URL,
 *   RESEND_FROM_ADDRESS, RESEND_FROM_NAME,
 *   AI_GATEWAY_BASE_URL, VERTEX_PROJECT, VERTEX_LOCATION
 *
 * News no longer needs an API key — it uses Google News RSS (see sections/news.ts).
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
  /**
   * Public origin of this worker, used to build self-hosted audio + web-view
   * links inside the email (e.g. https://brief.latwoodtech.work). Falls back to
   * the workers.dev origin of the incoming request when unset.
   */
  PUBLIC_BASE_URL?: string;

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

    // Self-hosted narration audio — GET /audio/{YYYY-MM-DD}.mp3
    // Streams the MP3 straight from R2 so the email link never depends on a
    // public r2.dev bucket toggle (and stays on a branded origin).
    const audioMatch = url.pathname.match(/^\/audio\/(\d{4}-\d{2}-\d{2})\.mp3$/);
    if (audioMatch && request.method === 'GET') {
      const obj = await env.AUDIO_BUCKET.get(`briefs/${audioMatch[1]}-narration.mp3`);
      if (!obj) return new Response('Not found', { status: 404 });
      return new Response(obj.body, {
        headers: {
          'Content-Type': 'audio/mpeg',
          'Cache-Control': 'public, max-age=86400',
        },
      });
    }

    // Web view of a brief — GET /brief/latest or GET /brief/{YYYY-MM-DD}
    const briefMatch = url.pathname.match(/^\/brief\/(latest|\d{4}-\d{2}-\d{2})$/);
    if (briefMatch && request.method === 'GET') {
      const key = briefMatch[1] === 'latest' ? 'briefs/latest.html' : `briefs/${briefMatch[1]}.html`;
      const obj = await env.AUDIO_BUCKET.get(key);
      if (!obj) return new Response('Brief not found', { status: 404 });
      return new Response(obj.body, {
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'public, max-age=3600',
        },
      });
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
