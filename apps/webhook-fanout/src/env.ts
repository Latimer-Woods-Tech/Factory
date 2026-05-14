export interface Env {
  /** Stripe webhook signing secret — wrangler secret STRIPE_WEBHOOK_SECRET */
  STRIPE_WEBHOOK_SECRET: string;
  /** ChartMogul API key — wrangler secret CHARTMOGUL_API_KEY */
  CHARTMOGUL_API_KEY: string;
  /** Loops API key — wrangler secret LOOPS_API_KEY (injected directly; proxy has known issues) */
  LOOPS_API_KEY: string;
  /** ChartMogul data source UUID — set via wrangler vars */
  CHARTMOGUL_DATA_SOURCE_UUID: string;
  /** KV namespace for 7-day event idempotency */
  IDEMPOTENCY_KV: KVNamespace;
  ENVIRONMENT?: string;
  SENTRY_DSN?: string;
}
