export { SupervisorDO } from './supervisor.do';
export { LockDO } from './lock.do';

export interface Env {
  SUPERVISOR: DurableObjectNamespace;
  LOCK: DurableObjectNamespace;
  MEMORY: D1Database;
  LLM_LEDGER: D1Database;
  AI_GATEWAY_BASE_URL: string;
  ANTHROPIC_API_KEY: string;
  GROQ_API_KEY: string;
  GROK_API_KEY?: string;
  VERTEX_ACCESS_TOKEN: string;
  VERTEX_PROJECT: string;
  VERTEX_LOCATION: string;
  PER_RUN_CAP_CENTS?: string;
  JWT_SECRET: string;
}

/**
 * Factory Supervisor — entrypoint.
 *
 * Routes every request to the singleton SupervisorDO. The DO is the single
 * source of truth for run state; this worker is a thin HTTP/cron/queue
 * fan-in that forwards to the DO.
 *
 * Phase 1 (SUP-3.4): scaffold only — DO stubs, tool registry stub, memory
 * stub, planner stubs. Phase 2 (SUP-3.5): scheduled Sauna runs wired through.
 */
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const id = env.SUPERVISOR.idFromName('singleton');
    const stub = env.SUPERVISOR.get(id);
    return stub.fetch(request);
  },

  async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    const id = env.SUPERVISOR.idFromName('singleton');
    const stub = env.SUPERVISOR.get(id);
    ctx.waitUntil(
      stub.fetch(new Request('https://supervisor/scheduled', { method: 'POST' })).then(() => undefined),
    );
  },
} satisfies ExportedHandler<Env>;
