/**
 * Worker environment bindings for factory-core-api.
 *
 * Secrets are provisioned via `wrangler secret put`; non-secret configuration
 * via `[vars]` in wrangler.jsonc (per CLAUDE.md — never the Node process env).
 */
declare module 'hono' {
  interface ContextVariableMap {
    requestId: string;
    networkAppId: string;
  }
}

export interface Env extends Record<string, unknown> {
  /** Hyperdrive binding for THE_FACTORY Neon project (CI/CD data). wrangler.jsonc [[hyperdrive]]. */
  DB: { readonly connectionString: string };
  /** Hyperdrive binding for the factory-network Neon project (cross-app identity graph). wrangler.jsonc [[hyperdrive]]. */
  NETWORK_DB: { readonly connectionString: string };
  /** Root HS256 signing key used to mint scoped JWTs. wrangler secret JWT_SIGNING_KEY. */
  JWT_SIGNING_KEY: string;
  /**
   * Dedicated service credential for the webhook-fanout worker's gate ingestion.
   * Honoured ONLY on `POST /v1/gates`, so it is implicitly scoped to gate
   * ingestion and cannot mint or reach any other topic. wrangler secret
   * WEBHOOK_FANOUT_INGEST_KEY. Unset disables the service-key path.
   */
  WEBHOOK_FANOUT_INGEST_KEY?: string;
  /**
   * Dedicated service credential for the supervisor Worker's push-on-write run
   * mirroring. Honoured ONLY on `POST /v1/runs/mirror`. wrangler secret
   * SUPERVISOR_PUSH_KEY. Unset disables the push path (cron mirror still works).
   */
  SUPERVISOR_PUSH_KEY?: string;
  /** Expected OIDC issuer. Defaults to GitHub Actions' issuer when unset. */
  OIDC_ISSUER?: string;
  /** Expected `aud` claim on the inbound GitHub OIDC token. */
  OIDC_AUDIENCE?: string;
  /** Only OIDC tokens from this `repository_owner` may exchange for scoped JWTs. */
  GITHUB_OWNER?: string;
  /** Deploy commit SHA, injected by the deploy workflow; surfaced by `/version`. */
  BUILD_SHA?: string;
  /** Runtime environment label (`development` | `staging` | `production`). */
  ENVIRONMENT?: string;
  /** Sentry DSN for error reporting. wrangler secret SENTRY_DSN. */
  SENTRY_DSN?: string;
  /**
   * Dedicated service credential for compliance auditLog() middleware.
   * Honoured ONLY on `POST /v1/audit`. wrangler secret AUDIT_INGEST_KEY.
   * Unset causes the route to return 401.
   */
  AUDIT_INGEST_KEY?: string;
  /**
   * Per-app bearer token for factory network layer M2M auth.
   * Apps include this in `Authorization: Bearer <token>` when posting links/events.
   * The SHA-256 hex hash is stored in factory_app_keys; plaintext never persisted.
   * Not used by factory-core-api itself — injected into consumer apps (selfprime, capricast).
   * Declared here for completeness; only NETWORK_DB and this comment document the M2M contract.
   */
  FACTORY_NETWORK_TOKEN?: string;
  /**
   * Shared outbound signal delivery key. Sent as `X-Factory-Signal-Key` when calling
   * target app /api/internal/signal endpoints. Must match FACTORY_SIGNAL_KEY on
   * each registered target app. wrangler secret FACTORY_OUTBOUND_SIGNAL_KEY.
   */
  FACTORY_OUTBOUND_SIGNAL_KEY?: string;
}
