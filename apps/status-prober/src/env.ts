/**
 * Cloudflare Worker bindings for the status-prober Worker.
 *
 * All values are non-secret. There are no required Worker secrets — probing the
 * four brand surfaces is unauthenticated by design.
 */
export interface Env {
  /** KV namespace that stores the latest probe envelope under key `current`. */
  STATUS_KV: KVNamespace;
  /** Runtime environment label. */
  ENVIRONMENT: string;
  /**
   * Optional Cloudflare rate-limiter binding for the public read endpoints. The
   * binding is declared in wrangler.jsonc; tests do not exercise it.
   */
  STATUS_RATE_LIMITER?: {
    limit: (input: { key: string }) => Promise<{ success: boolean }>;
  };
}
