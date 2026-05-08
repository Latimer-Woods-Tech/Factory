import type { Hyperdrive } from '@cloudflare/workers-types';

/**
 * Cloudflare Worker bindings for video-cron.
 * All secrets are injected via `wrangler secret put` — never hardcoded.
 */
export interface Env {
  /** Neon Postgres via Hyperdrive. */
  DB: Hyperdrive;
  /**
   * Bearer token used when calling the schedule-worker API.
   * `wrangler secret put WORKER_API_TOKEN`
   */
  WORKER_API_TOKEN: string;
  /**
   * GitHub personal access token with `repo` + `actions` scope.
   * Used to dispatch `render-video.yml` workflow.
   * `wrangler secret put GITHUB_TOKEN`
   */
  GITHUB_TOKEN: string;
  /**
   * GitHub owner/repo in the form `Latimer-Woods-Tech/factory`.
   * Safe to put in vars (not secret).
   */
  GITHUB_REPO: string;
  /** Base URL of the schedule-worker, e.g. https://schedule.adrper79.workers.dev */
  SCHEDULE_WORKER_URL: string;
  /** Service binding for private Worker-to-Worker schedule calls. */
  SCHEDULE_WORKER?: Fetcher;
  /** App ID whose pending render jobs this cron dispatches. */
  APP_ID: string;
  /** Remotion composition ID to use for automatic marketing videos. */
  DEFAULT_COMPOSITION_ID: string;
  /** Worker environment label (development | staging | production). */
  ENVIRONMENT: string;
  /** Flagship feature-flag binding. */
  FLAGS?: Fetcher;
  /** flag-meter D1 database for flag telemetry. */
  FLAG_TELEMETRY?: D1Database;
}
