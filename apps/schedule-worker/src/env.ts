import type { Hyperdrive } from '@cloudflare/workers-types';

/**
 * Cloudflare Worker bindings for the schedule-worker.
 *
 * Secrets are injected via `wrangler secret put` — never put secrets in
 * wrangler.jsonc vars.
 */
export interface Env {
  /** Neon Postgres via Hyperdrive — set via wrangler.jsonc `hyperdrive` binding. */
  DB: Hyperdrive;
  /**
   * Bearer token that the render-video workflow (and cron Worker) must send
   * in the `Authorization: Bearer <token>` header when calling PATCH /jobs/:id.
   * Set via: `wrangler secret put WORKER_API_TOKEN`
   */
  WORKER_API_TOKEN: string;
  /**
   * Optional JSON object mapping app-scoped bearer tokens to app IDs.
   * Example: {"token-value":"selfprime"}. Set with `wrangler secret put APP_SERVICE_TOKENS`.
   */
  APP_SERVICE_TOKENS?: string;
  /** Worker environment label (development | staging | production). */
  ENVIRONMENT: string;
  /** KV namespace for reading monitor snapshots (written by synthetic-monitor). */
  MONITOR_KV?: KVNamespace;
  /** Flagship feature-flag binding. */
  FLAGS?: Fetcher;
  /** flag-meter D1 database for flag telemetry. */
  FLAG_TELEMETRY?: D1Database;
}
