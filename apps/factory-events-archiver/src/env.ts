/** Cloudflare Worker bindings for the factory-events-archiver Worker. */
export interface Env {
  /** Hyperdrive binding to THE_FACTORY Neon (source of archive candidates). */
  DB: { connectionString: string };
  /** R2 bucket where archived event batches are written. */
  ARCHIVE_BUCKET: R2Bucket;
  /** Deployment environment tag. */
  ENVIRONMENT: string;
}
