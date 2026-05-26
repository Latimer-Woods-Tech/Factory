declare module 'hono' {
  interface ContextVariableMap {
    requestId: string;
  }
}

export interface Env extends Record<string, unknown> {
  /** Stripe webhook signing secret — wrangler secret STRIPE_WEBHOOK_SECRET */
  STRIPE_WEBHOOK_SECRET: string;
  /** GitHub webhook HMAC secret (X-Hub-Signature-256) — wrangler secret GH_WEBHOOK_SECRET */
  GH_WEBHOOK_SECRET: string;
  /** factory-core-api base URL (branded custom domain) — wrangler vars FACTORY_CORE_API_URL */
  FACTORY_CORE_API_URL: string;
  /**
   * Service credential for factory-core-api POST /v1/gates — wrangler secret
   * FACTORY_CORE_API_INGEST_KEY. Matches that worker's WEBHOOK_FANOUT_INGEST_KEY.
   */
  FACTORY_CORE_API_INGEST_KEY: string;
  /** PostHog project API key — wrangler secret POSTHOG_KEY */
  POSTHOG_KEY: string;
  /** Resend API key — wrangler secret RESEND_API_KEY */
  RESEND_API_KEY: string;
  /** Resend sender address — set via wrangler vars */
  RESEND_FROM: string;
  /** Contact notification inbox for public landing-page intake */
  CONTACT_NOTIFY_EMAIL?: string;
  /** Optional Slack incoming-webhook URL for contact notifications */
  SLACK_WEBHOOK_URL?: string;
  /** First-party analytics event store */
  FACTORY_EVENTS_DB: D1Database;
  /** KV namespace for 7-day event idempotency */
  IDEMPOTENCY_KV: KVNamespace;
  ENVIRONMENT?: string;
  SENTRY_DSN?: string;
}
