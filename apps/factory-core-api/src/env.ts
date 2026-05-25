/**
 * Worker environment bindings for factory-core-api.
 *
 * Secrets are provisioned via `wrangler secret put`; non-secret configuration
 * via `[vars]` in wrangler.jsonc (per CLAUDE.md — never `process.env`).
 */
declare module 'hono' {
  interface ContextVariableMap {
    requestId: string;
  }
}

export interface Env extends Record<string, unknown> {
  /** Root HS256 signing key used to mint scoped JWTs. wrangler secret JWT_SIGNING_KEY. */
  JWT_SIGNING_KEY: string;
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
}
