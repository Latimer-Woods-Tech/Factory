/**
 * supervisor-mirror — Cloudflare Worker cron (P1.8).
 *
 * Fires every 5 minutes. Reads `supervisor_runs` from D1 and upserts
 * into `factory_runs_mirror` in Neon so the admin read layer can run
 * cross-table queries alongside `factory_gates` and `factory_artifacts`.
 */
import type { Env } from './env.js';
import { mirrorSupervisorRuns } from './mirror.js';

export default {
  /**
   * Scheduled handler — fires every 5 minutes per wrangler.jsonc cron config.
   * Reads recent supervisor_runs from D1 and upserts into Neon.
   */
  async scheduled(_event: ScheduledEvent, env: Env, _ctx: ExecutionContext): Promise<void> {
    console.log(
      JSON.stringify({
        level: 'info',
        msg: 'supervisor-mirror tick',
        ts: new Date().toISOString(),
        environment: env.ENVIRONMENT,
      }),
    );
    try {
      const result = await mirrorSupervisorRuns(env);
      console.log(
        JSON.stringify({
          level: 'info',
          msg: 'supervisor-mirror complete',
          ...result,
        }),
      );
    } catch (err) {
      console.error(
        JSON.stringify({
          level: 'error',
          msg: 'supervisor-mirror fatal',
          error: err instanceof Error ? err.message : String(err),
        }),
      );
      throw err;
    }
  },

  /**
   * HTTP handler — exposes /health for Verification Requirement curl checks.
   * Returns synchronously; the Worker runtime wraps it in a Promise automatically.
   */
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
