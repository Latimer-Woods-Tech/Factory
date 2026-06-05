import type { ToolRegistry, Tool } from '@latimer-woods-tech/agent';
import type { Env } from '../index';
import { GENERATED_CAPABILITIES } from '../capabilities.generated';
import { loadTemplates } from '../planner/load';
import { readMemory } from '../memory/d1';
import { fetchApprovedIssues } from './github';
import { getInstallationToken } from './github-auth';

function readonlyTool(name: string, description: string, invoke: Tool['invoke'], parameters?: Record<string, unknown>): Tool {
  return {
    name,
    description,
    side_effects: 'none',
    required_scope: 'supervisor.readonly',
    invoke,
    parameters,
    exposeToLLM: false,
  };
}

function readExternalTool(name: string, description: string, invoke: Tool['invoke'], parameters?: Record<string, unknown>): Tool {
  return {
    name,
    description,
    side_effects: 'read-external',
    required_scope: 'supervisor.readonly',
    invoke,
    parameters,
    exposeToLLM: false,
  };
}

async function installationToken(env: Env): Promise<string> {
  return getInstallationToken(
    env.FACTORY_APP_ID,
    env.FACTORY_APP_PRIVATE_KEY,
    env.FACTORY_APP_INSTALLATION_ID,
  );
}

export function registerCoreSupervisorTools(registry: ToolRegistry, env: Env): void {
  registry.register(readonlyTool(
    'supervisor.health.snapshot',
    'Return a local supervisor health snapshot without external side effects.',
    async () => ({
      ok: true,
      result: {
        phase: 'SUP-4',
        app_count: GENERATED_CAPABILITIES.length,
        capability_count: GENERATED_CAPABILITIES.reduce((total, app) => total + app.capabilities.length, 0),
      },
    }),
  ));

  registry.register(readonlyTool(
    'registry.capabilities.list',
    'List generated app capability counts from the local supervisor bundle.',
    async () => ({
      ok: true,
      result: GENERATED_CAPABILITIES.map((app) => ({
        app: app.app,
        tiers_allowed: app.tiers_allowed,
        capability_count: app.capabilities.length,
      })),
    }),
  ));

  registry.register(readonlyTool(
    'template.list',
    'Load supervisor templates and return their ids, tiers, and step counts.',
    async () => {
      const templates = await loadTemplates();
      return {
        ok: true,
        result: templates.map((template) => ({
          id: template.id,
          tier: template.tier,
          step_count: template.steps?.length ?? 0,
        })),
      };
    },
  ));

  registry.register(readonlyTool(
    'state.lastRun.read',
    'Read the last supervisor run record from D1 memory.',
    async () => ({ ok: true, result: await readMemory(env.MEMORY, 'last_run') }),
  ));

  registry.register(readExternalTool(
    'github.issue.searchApproved',
    'Fetch open GitHub issues labeled supervisor:approved-source from the Factory repo.',
    async () => {
      const token = await installationToken(env);
      const issues = await fetchApprovedIssues(token);
      return {
        ok: true,
        result: issues.map((issue) => ({
          number: issue.number,
          title: issue.title,
          labels: issue.labels.map((label) => label.name),
        })),
      };
    },
  ));
}
