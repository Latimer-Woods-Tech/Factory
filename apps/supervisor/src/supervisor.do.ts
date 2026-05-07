import type { Env } from './index';
import { matchTemplate } from './planner/match';
import { parameterize } from './planner/parameterize';
import { loadTemplates } from './planner/load';
import { readMemory, writeMemory } from './memory/d1';
import { ToolRegistry } from './tools/registry';
import { GENERATED_CAPABILITIES } from './capabilities.generated';
import { getTemplateStats, recordRun } from './stats';

/**
 * Singleton Durable Object that coordinates the supervisor run loop.
 *
 * Phase 1 (SUP-3.4 scaffold): handles `GET /health`, `GET /state`,
 * `POST /scheduled` (noop log), and `POST /plan` (dry-run matchTemplate +
 * parameterize without execution). No actual tool invocation yet —
 * `POST /run` returns 501 until SUP-3.5 scaffolds the execution leg.
 */
export class SupervisorDO {
  private state: DurableObjectState;
  private env: Env;
  private tools: ToolRegistry;

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;
    this.tools = new ToolRegistry();
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    try {
      switch (`${request.method} ${url.pathname}`) {
        case 'GET /health':
          return this.handleHealth();
        case 'GET /state':
          return this.handleState();
        case 'GET /capabilities':
          return this.handleCapabilities();
        case 'POST /scheduled':
          return this.handleScheduled();
        case 'POST /plan':
          return this.handlePlan(request);
        case 'POST /run':
          return this.handleRun(request);
        default:
          return new Response('not found', { status: 404 });
      }
    } catch (e) {
      console.error('[supervisor.do] unhandled error:', e);
      return new Response(
        JSON.stringify({ error: 'internal error' }),
        { status: 500, headers: { 'content-type': 'application/json' } },
      );
    }
  }

  private handleHealth(): Response {
    return Response.json({
      ok: true,
      phase: 'SUP-3.5',
      tools_registered: this.tools.list().length,
      app_count: GENERATED_CAPABILITIES.length,
      capability_count: GENERATED_CAPABILITIES.reduce((n, a) => n + a.capabilities.length, 0),
    });
  }

  private async handleState(): Promise<Response> {
    const lastRun = await readMemory(this.env.MEMORY, 'last_run');
    return Response.json({
      lastRun,
      toolCount: this.tools.list().length,
      toolNames: this.tools.list().map((t) => t.name),
      capabilities: {
        appCount: GENERATED_CAPABILITIES.length,
        apps: GENERATED_CAPABILITIES.map((a) => ({
          app: a.app,
          tiers_allowed: a.tiers_allowed,
          capability_count: a.capabilities.length,
        })),
      },
    });
  }

  private handleCapabilities(): Response {
    return Response.json({ capabilities: GENERATED_CAPABILITIES });
  }

  private async handleScheduled(): Promise<Response> {
    // Phase 1: just log a heartbeat into memory so we can see cron is firing.
    await writeMemory(this.env.MEMORY, 'last_scheduled_tick', { at: Date.now() });
    return Response.json({ ok: true, phase: 'heartbeat only' });
  }

  private async handlePlan(request: Request): Promise<Response> {
    const body = (await request.json()) as { description?: string; source?: string };
    if (!body.description) {
      return Response.json({ error: 'description required' }, { status: 422 });
    }

    const templates = await loadTemplates();
    const match = matchTemplate(body.description, templates);
    if (!match) {
      return Response.json({
        matched: false,
        reason: 'no template matched',
        template_count: templates.length,
      });
    }

    const plan = parameterize(match, { description: body.description, source: body.source ?? 'human' });
    return Response.json({ matched: true, template: match.id, plan });
  }

  /** SUP-3.5: run a planned template. Records attempt and outcome in template_stats. */
  private async handleRun(request: Request): Promise<Response> {
    const body = (await request.json()) as {
      template_id?: string;
      version?: number;
      dry_run?: boolean;
    };

    if (!body.template_id) {
      return Response.json({ error: 'template_id required' }, { status: 422 });
    }

    const templateId = body.template_id;
    const version = body.version ?? 1;

    await recordRun(this.env.MEMORY, templateId, version, 'attempted');
    await writeMemory(this.env.MEMORY, 'last_run', { templateId, version, at: Date.now() });

    if (body.dry_run) {
      const stats = await getTemplateStats(this.env.MEMORY, templateId, version);
      return Response.json({
        dry_run: true,
        template_id: templateId,
        version,
        stats,
        note: 'Execution engine wired in SUP-4 — dry_run records the attempt counter only.',
      });
    }

    // Execution engine (tool dispatch) wired in SUP-4.
    return Response.json(
      {
        error: 'EXECUTION_NOT_IMPLEMENTED',
        template_id: templateId,
        version,
        note: 'Set dry_run: true to test stats wiring. Full execution ships with SUP-4.',
      },
      { status: 501 },
    );
  }
}
