/** Cloudflare Worker bindings for the supervisor-mirror Worker. */
export interface Env {
  /** Hyperdrive binding to Neon Postgres (factory read layer). */
  DB: { connectionString: string };
  /** D1 binding to the supervisor's memory database (source of truth for runs). */
  SUPERVISOR_D1: D1Database;
  /** Deployment environment tag. */
  ENVIRONMENT: string;
}
