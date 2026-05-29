/**
 * factory-stuck-watcher — Cloudflare Worker cron (P2.13b).
 *
 * Fires every 5 minutes. Detects supervisor runs that have been 'running'
 * past a gate's expected grace period without the expected gate type
 * appearing. Writes a gate_type='stuck-detection' row for each missing gate
 * so the Command Center surfaces the blockage.
 *
 * Config: docs/observability/expected-gates.yml (bundled as EXPECTED_GATE_CHECKS)
 */
import type { Env } from './env.js';
import { EXPECTED_GATE_CHECKS } from './config.js';
import { createWatcherDbOps, runWatchPass } from './watcher.js';

export default {
  async scheduled(_event: ScheduledEvent, env: Env, _ctx: ExecutionContext): Promise<void> {
    console.log(
      JSON.stringify({
        level: 'info',
        msg: 'factory-stuck-watcher tick',
        ts: new Date().toISOString(),
        environment: env.ENVIRONMENT,
      }),
    );
    try {
      const ops = createWatcherDbOps(env.DB);
      const result = await runWatchPass(EXPECTED_GATE_CHECKS, ops);
      console.log(
        JSON.stringify({
          level: 'info',
          msg: 'factory-stuck-watcher complete',
          ...result,
        }),
      );
    } catch (err) {
      console.error(
        JSON.stringify({
          level: 'error',
          msg: 'factory-stuck-watcher fatal',
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
