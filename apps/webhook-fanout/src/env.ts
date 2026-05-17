export interface Env extends Record<string, unknown> {
  /** Stripe webhook signing secret — wrangler secret STRIPE_WEBHOOK_SECRET */
  STRIPE_WEBHOOK_SECRET: string;
  /** PostHog project API key — wrangler secret POSTHOG_API_KEY */
  POSTHOG_API_KEY: string;
  /** Resend API key — wrangler secret RESEND_API_KEY */
  RESEND_API_KEY: string;
  /** Resend sender address — set via wrangler vars */
  RESEND_FROM: string;
  /** First-party analytics event store */
  FACTORY_EVENTS_DB: D1Database;
  /** KV namespace for 7-day event idempotency */
  IDEMPOTENCY_KV: KVNamespace;
  ENVIRONMENT?: string;
  SENTRY_DSN?: string;
}
