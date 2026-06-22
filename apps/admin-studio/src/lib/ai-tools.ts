/**
 * AI agent tools — expose Factory/GitHub/Sentry/GCP APIs as LLM-callable tools.
 *
 * Tool execution is synchronous; LLM loop collects full responses before executing.
 * This keeps Worker CPU time bounded (no streaming during tool calls).
 */

import { fetchTree, fetchFile, listIssues, listPullRequests, listOrgRepos } from './github-api.js';
import { gcpGetSecret } from './gcp-secrets.js';

export interface ToolDefinition {
  name: string;
  description: string;
  input_schema: {
    type: 'object';
    properties: Record<string, unknown>;
    required: string[];
  };
}

export interface ToolUseBlock {
  type: 'tool_use';
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export type ToolResult = string | number | boolean | Record<string, unknown> | null;

// ────────────────────────────────────────────────────────────────────────────────
// Tool definitions (exposed to Claude)
// ────────────────────────────────────────────────────────────────────────────────

export const AGENT_TOOLS: ToolDefinition[] = [
  {
    name: 'github_read_file',
    description:
      'Read any file from a GitHub repo at a given path and ref. ' +
      'Repos available: Factory (default), HumanDesign (selfprime), capricast, coh (cypher-of-healing), xico-city. ' +
      'All repos are in the Latimer-Woods-Tech org.',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'File path, e.g. "src/index.ts" or "docs/STATE.md"' },
        ref: { type: 'string', description: 'Git ref (branch, tag, or commit SHA), default "main"' },
        owner: { type: 'string', description: 'GitHub org or user, default "Latimer-Woods-Tech"' },
        repo: { type: 'string', description: 'Repository name, default "Factory". Other options: "HumanDesign", "capricast", "coh", "xico-city"' },
      },
      required: ['path'],
    },
  },
  {
    name: 'github_list_tree',
    description:
      'List all files in a GitHub repo tree at a given ref. ' +
      'Repos available: Factory (default), HumanDesign (selfprime), capricast, coh, xico-city. ' +
      'All repos are in the Latimer-Woods-Tech org.',
    input_schema: {
      type: 'object',
      properties: {
        ref: { type: 'string', description: 'Git ref to list, default "main"' },
        owner: { type: 'string', description: 'GitHub org or user, default "Latimer-Woods-Tech"' },
        repo: { type: 'string', description: 'Repository name, default "Factory". Other options: "HumanDesign", "capricast", "coh", "xico-city"' },
      },
      required: [],
    },
  },
  {
    name: 'github_list_issues',
    description:
      'List issues in a GitHub repo, optionally filtered by label. ' +
      'Repos available: Factory (default), HumanDesign, capricast, coh, xico-city. ' +
      'All repos are in the Latimer-Woods-Tech org.',
    input_schema: {
      type: 'object',
      properties: {
        labels: { type: 'string', description: 'Comma-separated labels to filter by, e.g. "priority:P0,bug"' },
        state: { type: 'string', description: '"open" or "closed", default "open"' },
        owner: { type: 'string', description: 'GitHub org or user, default "Latimer-Woods-Tech"' },
        repo: { type: 'string', description: 'Repository name, default "Factory". Other options: "HumanDesign", "capricast", "coh", "xico-city"' },
      },
      required: [],
    },
  },
  {
    name: 'github_list_prs',
    description:
      'List pull requests in a GitHub repo, optionally filtered. ' +
      'Repos available: Factory (default), HumanDesign, capricast, coh, xico-city. ' +
      'All repos are in the Latimer-Woods-Tech org.',
    input_schema: {
      type: 'object',
      properties: {
        state: { type: 'string', description: '"open", "closed", or "all", default "open"' },
        owner: { type: 'string', description: 'GitHub org or user, default "Latimer-Woods-Tech"' },
        repo: { type: 'string', description: 'Repository name, default "Factory". Other options: "HumanDesign", "capricast", "coh", "xico-city"' },
      },
      required: [],
    },
  },
  {
    name: 'github_list_org_repos',
    description:
      'List all repositories in the Latimer-Woods-Tech GitHub org, sorted by last push date. ' +
      'Use this to discover the full portfolio (Factory, HumanDesign, capricast, coh, xico-city, and others) ' +
      'before deciding which repo to read files or issues from.',
    input_schema: {
      type: 'object',
      properties: {
        org: { type: 'string', description: 'GitHub org name, default "Latimer-Woods-Tech"' },
        per_page: { type: 'number', description: 'Number of repos to return (max 100), default 30' },
      },
      required: [],
    },
  },
  {
    name: 'gcp_get_secret',
    description: 'Fetch a secret from GCP Secret Manager by name (e.g. "NEON_FACTORY_DATABASE_URL")',
    input_schema: {
      type: 'object',
      properties: {
        secret_name: { type: 'string', description: 'Secret name in GCP Secret Manager' },
      },
      required: ['secret_name'],
    },
  },
];

// ────────────────────────────────────────────────────────────────────────────────
// Tool execution
// ────────────────────────────────────────────────────────────────────────────────

export async function executeTool(
  toolName: string,
  toolInput: Record<string, unknown>,
  githubToken: string,
  env?: { GCP_SA_KEY?: string },
): Promise<ToolResult> {
  switch (toolName) {
    case 'github_read_file': {
      const path = String(toolInput.path ?? '');
      const ref = String(toolInput.ref ?? 'main');
      const owner = toolInput.owner ? String(toolInput.owner) : undefined;
      const repo = toolInput.repo ? String(toolInput.repo) : undefined;
      if (!path) return { error: 'path is required' };
      try {
        const file = await fetchFile(githubToken, path, ref, owner, repo);
        return {
          path,
          ref,
          owner: owner ?? 'Latimer-Woods-Tech',
          repo: repo ?? 'Factory',
          sha: file.sha,
          size: file.text?.length ?? 0,
          text: file.text?.slice(0, 8000), // Cap at 8KB for LLM
        };
      } catch (err) {
        return { error: (err as Error).message };
      }
    }

    case 'github_list_tree': {
      const ref = String(toolInput.ref ?? 'main');
      const owner = toolInput.owner ? String(toolInput.owner) : undefined;
      const repo = toolInput.repo ? String(toolInput.repo) : undefined;
      try {
        const tree = await fetchTree(githubToken, ref, owner, repo);
        return {
          ref,
          owner: owner ?? 'Latimer-Woods-Tech',
          repo: repo ?? 'Factory',
          count: tree.nodes.length,
          truncated: tree.truncated,
          entries: tree.nodes.slice(0, 100), // Return first 100 entries
        };
      } catch (err) {
        return { error: (err as Error).message };
      }
    }

    case 'github_list_issues': {
      const labels = String(toolInput.labels ?? '');
      const state = String(toolInput.state ?? 'open');
      const owner = toolInput.owner ? String(toolInput.owner) : undefined;
      const repo = toolInput.repo ? String(toolInput.repo) : undefined;
      try {
        const issues = await listIssues(githubToken, state === 'closed' ? 'closed' : 'open', labels, owner, repo);
        return {
          state,
          owner: owner ?? 'Latimer-Woods-Tech',
          repo: repo ?? 'Factory',
          labels: labels || '(none)',
          count: issues.length,
          issues: issues.slice(0, 20).map((i) => ({ number: i.number, title: i.title, labels: i.labels })),
        };
      } catch (err) {
        return { error: (err as Error).message };
      }
    }

    case 'github_list_prs': {
      const rawState = String(toolInput.state ?? 'open');
      const state = (rawState === 'closed' || rawState === 'all') ? rawState : 'open' as const;
      const owner = toolInput.owner ? String(toolInput.owner) : undefined;
      const repo = toolInput.repo ? String(toolInput.repo) : undefined;
      try {
        const prs = await listPullRequests(githubToken, state, owner, repo);
        return {
          state,
          owner: owner ?? 'Latimer-Woods-Tech',
          repo: repo ?? 'Factory',
          count: prs.length,
          prs: prs.slice(0, 20).map((p) => ({ number: p.number, title: p.title, state: p.state })),
        };
      } catch (err) {
        return { error: (err as Error).message };
      }
    }

    case 'github_list_org_repos': {
      const org = toolInput.org ? String(toolInput.org) : undefined;
      const perPage = typeof toolInput.per_page === 'number' ? Math.min(toolInput.per_page, 100) : 30;
      try {
        const repos = await listOrgRepos(githubToken, org, perPage);
        return {
          org: org ?? 'Latimer-Woods-Tech',
          count: repos.length,
          repos: repos.map((r) => ({
            name: r.name,
            fullName: r.fullName,
            description: r.description,
            url: r.url,
            pushedAt: r.pushedAt,
            private: r.private,
          })),
        };
      } catch (err) {
        return { error: (err as Error).message };
      }
    }

    case 'gcp_get_secret': {
      const secretName = String(toolInput.secret_name ?? '');
      if (!secretName) return { error: 'secret_name is required' };
      if (!env?.GCP_SA_KEY) return { error: 'GCP_SA_KEY environment variable not set' };
      try {
        // env.GCP_SA_KEY is truthy here (checked above); assert non-optional for type narrowing.
        const secret = await gcpGetSecret(secretName, { GCP_SA_KEY: env.GCP_SA_KEY });
        return {
          secret_name: secretName,
          value: secret.slice(0, 100) + (secret.length > 100 ? '...' : ''),
        };
      } catch (err) {
        return { error: (err as Error).message };
      }
    }

    default:
      return { error: `unknown tool: ${toolName}` };
  }
}

/**
 * Anthropic message content can be:
 * - { type: 'text', text: '...' }
 * - { type: 'tool_use', id: '...', name: '...', input: {...} }
 * - { type: 'tool_result', tool_use_id: '...', content: '...' }
 */
export function extractToolUse(content: unknown[]): ToolUseBlock | null {
  if (!Array.isArray(content)) return null;
  for (const block of content) {
    if (
      block &&
      typeof block === 'object' &&
      (block as Record<string, unknown>).type === 'tool_use'
    ) {
      return block as ToolUseBlock;
    }
  }
  return null;
}
