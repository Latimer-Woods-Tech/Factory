/**
 * AI agent tools — expose Factory/GitHub/Sentry/GCP APIs as LLM-callable tools.
 *
 * Tool execution is synchronous; LLM loop collects full responses before executing.
 * This keeps Worker CPU time bounded (no streaming during tool calls).
 */

import type { Env } from '../env.js';
import { fetchTree, fetchFile, listIssues, listPullRequests } from './github-api.js';
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
    description: 'Read any file from the Factory repo at a given path and ref',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'File path, e.g. "src/index.ts" or "docs/STATE.md"' },
        ref: { type: 'string', description: 'Git ref (branch, tag, or commit SHA), default "main"' },
      },
      required: ['path'],
    },
  },
  {
    name: 'github_list_tree',
    description: 'List all files in the Factory repo tree at a given ref',
    input_schema: {
      type: 'object',
      properties: {
        ref: { type: 'string', description: 'Git ref to list, default "main"' },
      },
      required: [],
    },
  },
  {
    name: 'github_list_issues',
    description: 'List open issues in Factory, optionally filtered by label',
    input_schema: {
      type: 'object',
      properties: {
        labels: { type: 'string', description: 'Comma-separated labels to filter by, e.g. "priority:P0,bug"' },
        state: { type: 'string', description: '"open" or "closed", default "open"' },
      },
      required: [],
    },
  },
  {
    name: 'github_list_prs',
    description: 'List open PRs in Factory, optionally filtered',
    input_schema: {
      type: 'object',
      properties: {
        state: { type: 'string', description: '"open", "closed", or "all", default "open"' },
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
      if (!path) return { error: 'path is required' };
      try {
        const file = await fetchFile(githubToken, path, ref);
        return {
          path,
          ref,
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
      try {
        const tree = await fetchTree(githubToken, ref);
        return {
          ref,
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
      try {
        const issues = await listIssues(githubToken, state === 'closed' ? 'closed' : 'open', labels);
        return {
          state,
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
      try {
        const prs = await listPullRequests(githubToken, state);
        return {
          state,
          count: prs.length,
          prs: prs.slice(0, 20).map((p) => ({ number: p.number, title: p.title, state: p.state })),
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
