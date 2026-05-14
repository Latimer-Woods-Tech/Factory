import type { Env } from './index';
import { matchTemplate } from './planner/match';
import { parameterize } from './planner/parameterize';
import { loadTemplates } from './planner/load';
import { readMemory, writeMemory } from './memory/d1';
import { ToolRegistry } from './tools/registry';
import { GENERATED_CAPABILITIES } from './capabilities.generated';
import { getTemplateStats, recordRun } from './stats';
// All GitHub API helpers (fetchApprovedIssues, postPlanComment, addLabel,
// getPlanApproval) use AbortSignal.timeout(10_000) — see tools/github.ts.
// sendDigest uses AbortSignal.timeout(5_000) — see tools/pushover.ts.
// getInstallationToken uses AbortSignal.timeout(10_000) — see tools/github-auth.ts.
import {
  fetchApprovedIssues,
  postPlanComment,
  addLabel,
  getPlanApproval,
  formatPlanComment,
} from './tools/github';
import { sendDigest } from './tools/pushover';
import { getInstallationToken } from './tools/github-auth';

/** Maximum issues processed in a single scheduled run. */
const PER_RUN_ISSUE_CAP = 5;

/**
 * Wall-clock deadline for a single handleScheduled execution (ms).
 * Durable Object alarm handlers in the Workers Paid plan are not subject to
 * the 30 s CPU limit that applies to regular Worker requests. The alarm
 * handler can run for up to 15 minutes. However, a per-run deadline is still
 * enforced here as a defensive bound: the loop checks elapsed time before
 * each issue and exits early if the deadline is approached, rather than
 * relying solely on PER_RUN_ISSUE_CAP or individual AbortSignal timeouts.
 */
const ALARM_SOFT_DEADLINE_MS = 25_000;

/** Lock key used to prevent concurrent supervisor runs. */
const LOCK_KEY = 'supervisor-run';

/** TTL for the run lock in milliseconds (10 minutes). */
const LOCK_TTL_MS = 600_000;

/** Phrase that marks an issue as ineligible for supervisor processing. */
const LOCKOUT_PHRASE = 'wordis-bond';

interface PlanRecord {
  commentId: number;
  templateId: string;
  postedAt: number;
}

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
      // Log-only: message is truncated and never sent to the client.
      // Response body is a generic sentinel — no internal details exposed.
      const logMsg = (e instanceof Error ? e.message : String(e)).slice(0, 200);
      console.error('[supervisor.do] unhandled error (logged, not returned):', logMsg);
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
    const runId = `run-${Date.now()}`;
    const errors: string[] = [];
    let matched = 0;
    let noTemplate = 0;
    let approved = 0;

    let ghToken: string;
    try {
      ghToken = await getInstallationToken(
        this.env.FACTORY_APP_ID,
        this.env.FACTORY_APP_PRIVATE_KEY,
        this.env.FACTORY_APP_INSTALLATION_ID,
      );
    } catch (err) {
      const msg = `getInstallationToken failed: ${String(err)}`;
      console.error('[supervisor]', msg);
      return Response.json({ ok: false, error: msg }, { status: 500 });
    }

    const lockAcquired = await this.acquireLock(runId);
    if (!lockAcquired) {
      console.log('[supervisor] lock not acquired — another run in flight, skipping');
      await writeMemory(this.env.MEMORY, 'last_scheduled_tick', {
        at: Date.now(),
        skipped: true,
        reason: 'lock-held',
      });
      return Response.json({ ok: true, skipped: true, reason: 'lock-held' });
    }

    try {
      const templates = await loadTemplates();
      await writeMemory(this.env.MEMORY, `receipt:${runId}:templates_loaded`, {
        count: templates.length,
        at: Date.now(),
      });

      let issues: Awaited<ReturnType<typeof fetchApprovedIssues>> = [];
      try {
        issues = await fetchApprovedIssues(ghToken);
        await writeMemory(this.env.MEMORY, `receipt:${runId}:issues_fetched`, {
          count: issues.length,
          at: Date.now(),
        });
      } catch (err) {
        // Explicitly surface AbortError (from AbortSignal.timeout) as a distinct
        // timeout log entry — prevents it from being silently swallowed as a
        // generic failure.
        if (err instanceof Error && err.name === 'AbortError') {
          console.warn('[supervisor] github_api_timeout', { op: 'fetchApprovedIssues', limit: 10_000 });
          errors.push('fetchApprovedIssues timed out after 10 000 ms');
        } else {
          const msg = `fetchApprovedIssues failed: ${(err as Error).message?.slice(0, 200) ?? String(err)}`;
          errors.push(msg);
          console.error('[supervisor]', msg);
        }
      }

      // Bound execution time: PER_RUN_ISSUE_CAP limits iterations; ALARM_SOFT_DEADLINE_MS
      // provides a wall-clock backstop checked before each issue. Each GitHub API call
      // carries its own AbortSignal.timeout(10_000) so no individual call can hang.
      const runStart = Date.now();
      const issuesToProcess = issues.slice(0, PER_RUN_ISSUE_CAP);

      for (const issue of issuesToProcess) {
        // Soft deadline check — exit before the next issue if the run is approaching
        // the time budget. This is defensive: slow API calls should already abort via
        // their individual AbortSignal.timeout(10_000), but the deadline prevents
        // accumulation if the clock is close to the cap.
        if (Date.now() - runStart > ALARM_SOFT_DEADLINE_MS) {
          console.warn('[supervisor] soft deadline reached — stopping issue processing early');
          errors.push(`run_soft_deadline: stopped after ${Date.now() - runStart} ms`);
          break;
        }
        const combined = `${issue.title} ${issue.body}`.toLowerCase();
        if (combined.includes(LOCKOUT_PHRASE)) {
          console.log(`[supervisor] issue #${issue.number} contains lockout phrase — skipping`);
          await writeMemory(this.env.MEMORY, `receipt:${runId}:skip:${issue.number}`, {
            reason: 'wordis-bond',
            at: Date.now(),
          });
          continue;
        }

        const searchText = `${issue.title} ${issue.body.slice(0, 500)}`;
        const issueLabels = ((issue as unknown as { labels?: Array<{ name: string }> }).labels ?? []).map((l) => l.name);
        const template = matchTemplate(searchText, templates, { labels: issueLabels });

        if (!template) {
          noTemplate++;
          try {
            await addLabel(ghToken, issue.number, 'supervisor:no-template');
          } catch (err) {
            // Explicitly surface AbortError (from AbortSignal.timeout) as a distinct
            // timeout log entry — prevents it from being silently swallowed as a
            // generic failure.
            if (err instanceof Error && err.name === 'AbortError') {
              console.warn('[supervisor] github_api_timeout', { op: 'addLabel', limit: 10_000 });
              errors.push(`addLabel(no-template) #${issue.number}: timed out after 10 000 ms`);
            } else {
              const msg = `addLabel(no-template) #${issue.number}: ${(err as Error).message?.slice(0, 200) ?? String(err)}`;
              errors.push(msg);
              console.error('[supervisor]', msg);
            }
          }
          await writeMemory(this.env.MEMORY, `receipt:${runId}:no-template:${issue.number}`, {
            issueNumber: issue.number,
            at: Date.now(),
          });
          continue;
        }

        matched++;

        const existingPlan = await readMemory<PlanRecord>(
          this.env.MEMORY,
          `plan:${issue.number}`,
        );

        if (!existingPlan) {
          const plan = parameterize(template, {
            description: issue.title,
            source: `github:issue:${issue.number}`,
          });

          const planMarkdown = formatPlanComment(
            template.id,
            template.description,
            template.tier,
            plan.steps,
          );

          try {
            const commentId = await postPlanComment(ghToken, issue.number, planMarkdown);
            const record: PlanRecord = {
              commentId,
              templateId: template.id,
              postedAt: Date.now(),
            };
            await writeMemory(this.env.MEMORY, `plan:${issue.number}`, record);
            await writeMemory(
              this.env.MEMORY,
              `receipt:${runId}:plan-posted:${issue.number}`,
              { ...record, at: Date.now() },
            );
          } catch (err) {
            // Explicitly surface AbortError (from AbortSignal.timeout) as a distinct
            // timeout log entry — prevents it from being silently swallowed as a
            // generic failure.
            if (err instanceof Error && err.name === 'AbortError') {
              console.warn('[supervisor] github_api_timeout', { op: 'postPlanComment', limit: 10_000 });
              errors.push(`postPlanComment #${issue.number}: timed out after 10 000 ms`);
            } else {
              const msg = `postPlanComment #${issue.number}: ${(err as Error).message?.slice(0, 200) ?? String(err)}`;
              errors.push(msg);
              console.error('[supervisor]', msg);
            }
          }
        } else {
          try {
            const isApproved = await getPlanApproval(
              ghToken,
              issue.number,
              existingPlan.commentId,
            );
            if (isApproved) {
              approved++;
              await writeMemory(this.env.MEMORY, `approved:${issue.number}`, {
                issueNumber: issue.number,
                templateId: existingPlan.templateId,
                approvedAt: Date.now(),
              });
              await writeMemory(
                this.env.MEMORY,
                `receipt:${runId}:approved:${issue.number}`,
                { at: Date.now() },
              );
              console.log(`[supervisor] issue #${issue.number} plan approved — queued for execution`);
            }
          } catch (err) {
            // Explicitly surface AbortError (from AbortSignal.timeout) as a distinct
            // timeout log entry — prevents it from being silently swallowed as a
            // generic failure.
            if (err instanceof Error && err.name === 'AbortError') {
              console.warn('[supervisor] github_api_timeout', { op: 'getPlanApproval', limit: 10_000 });
              errors.push(`getPlanApproval #${issue.number}: timed out after 10 000 ms`);
            } else {
              const msg = `getPlanApproval #${issue.number}: ${(err as Error).message?.slice(0, 200) ?? String(err)}`;
              errors.push(msg);
              console.error('[supervisor]', msg);
            }
          }
        }
      }

      const summary = {
        runId,
        at: Date.now(),
        matched,
        noTemplate,
        approved,
        issuesProcessed: issuesToProcess.length,
        errors,
      };
      await writeMemory(this.env.MEMORY, 'last_run', summary);

      return Response.json({ ok: true, ...summary });
    } finally {
      await this.releaseLock(runId);
      await sendDigest(this.env.PUSHOVER_TOKEN, this.env.PUSHOVER_USER_KEY, {
        matched,
        noTemplate,
        approved,
        errors,
      });
    }
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

  private async acquireLock(holder: string): Promise<boolean> {
    try {
      const lockId = this.env.LOCK.idFromName(LOCK_KEY);
      const lockStub = this.env.LOCK.get(lockId);
      const res = await lockStub.fetch(
        new Request('https://lock/acquire', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key: LOCK_KEY, holder, ttlMs: LOCK_TTL_MS }),
        }),
      );
      if (!res.ok) return false;
      const data = (await res.json()) as { acquired: boolean };
      return data.acquired === true;
    } catch (err) {
      console.error('[supervisor] acquireLock error:', err);
      return false;
    }
  }

  private async releaseLock(holder: string): Promise<void> {
    try {
      const lockId = this.env.LOCK.idFromName(LOCK_KEY);
      const lockStub = this.env.LOCK.get(lockId);
      await lockStub.fetch(
        new Request('https://lock/release', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key: LOCK_KEY, holder }),
        }),
      );
    } catch (err) {
      console.error('[supervisor] releaseLock error:', err);
    }
  }
}