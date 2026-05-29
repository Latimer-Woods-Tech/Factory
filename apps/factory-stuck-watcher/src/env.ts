/** Cloudflare Worker bindings for the factory-stuck-watcher Worker. */
export interface Env {
  /** Hyperdrive binding to THE_FACTORY Neon (read layer + gate writes). */
  DB: { connectionString: string };
  /** Deployment environment tag. */
  ENVIRONMENT: string;
}
