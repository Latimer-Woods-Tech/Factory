/**
 * factory-events-replay — Cloudflare Worker cron (P1.10).
 *
 * Fires every 15 minutes. Fetches `factory_events_ingest` rows with
 * `derivation_status='failed'` and re-derives them into `factory_gates` or
 * `factory_artifacts`. Provides the belt-and-suspenders retry layer on top
 * of the two-step ingest pattern in factory-core-api (ingest-db.ts).
 */
import type { Env } from './env.js';
import { replayFailedEvents } from './replay.js';

export default {
  /** Scheduled handler — fires every 15 minutes per wrangler.jsonc cron config. */
  async scheduled(_event: ScheduledEvent, env: Env, _ctx: ExecutionContext): Promise<void> {
    console.log(
      JSON.stringify({
        level: 'info',
        msg: 'factory-events-replay tick',
        ts: new Date().toISOString(),
        environment: env.ENVIRONMENT,
      }),
    );
    try {
      const result = await replayFailedEvents(env);
      console.log(
        JSON.stringify({
          level: 'info',
          msg: 'factory-events-replay complete',
          ...result,
        }),
      );
    } catch (err) {
      console.error(
        JSON.stringify({
          level: 'error',
          msg: 'factory-events-replay fatal',
          error: err instanceof Error ? err.message : String(err),
        }),
      );
      throw err;
    }
  },

  /** HTTP handler — exposes /health for the Verification Requirement curl checks. */
  fetch(request: Request, env: Env, _ctx: ExecutionContext): Response {
    const url = new URL(request.url);
    if (url.pathname === '/health') {
      return new Response(
        JSON.stringify({ ok: true, environment: env.ENVIRONMENT }),
        { headers: { 'Content-Type': 'application/json' } },
      );
    }
    return new Response('Not Found', { status: 404 });
  },
};
