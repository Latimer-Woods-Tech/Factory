/**
 * factory-events-archiver — Cloudflare Worker cron (P2.13c).
 *
 * Fires weekly (Sundays at 02:00 UTC). Archives derived/replayed
 * factory_events_ingest rows older than 90 days to R2, then deletes
 * them from Neon to control table growth.
 */
import type { Env } from './env.js';
import { createArchiverOps, runArchiveBatch } from './archiver.js';

export default {
  async scheduled(_event: ScheduledEvent, env: Env, _ctx: ExecutionContext): Promise<void> {
    console.log(
      JSON.stringify({
        level: 'info',
        msg: 'factory-events-archiver tick',
        ts: new Date().toISOString(),
        environment: env.ENVIRONMENT,
      }),
    );
    try {
      const ops = createArchiverOps(env.DB, env.ARCHIVE_BUCKET);
      const result = await runArchiveBatch(ops);
      console.log(
        JSON.stringify({
          level: 'info',
          msg: 'factory-events-archiver complete',
          ...result,
        }),
      );
    } catch (err) {
      console.error(
        JSON.stringify({
          level: 'error',
          msg: 'factory-events-archiver fatal',
          error: err instanceof Error ? err.message : String(err),
        }),
      );
      throw err;
    }
  },

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
