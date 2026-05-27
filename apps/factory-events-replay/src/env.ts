/** Cloudflare Worker bindings for the factory-events-replay Worker. */
export interface Env {
  /** Hyperdrive binding to Neon Postgres (factory read layer). */
  DB: { connectionString: string };
  /** Deployment environment tag. */
  ENVIRONMENT: string;
}
