/**
 * GitHub workflow_dispatch client.
 *
 * Triggers `.github/workflows/studio-test-dispatch.yml` with the run id
 * and operator-selected suites/filter. Returns void on success; throws
 * a structured error otherwise so the caller can react.
 *
 * Secrets used:
 *   - A GitHub App installation token or PAT with workflow dispatch permission
 */

const FACTORY_OWNER = 'Latimer-Woods-Tech';
const FACTORY_REPO = 'Factory';
const DISPATCH_WORKFLOW = 'studio-test-dispatch.yml';
const DEFAULT_REF = 'main';

export interface DispatchInput {
  runId: string;
  suites: readonly string[];
  filter?: string;
  /** Studio public URL the action will POST webhooks back to. */
  callbackUrl: string;
  /** Branch / tag / sha to run against. Defaults to `main`. */
  ref?: string;
}

export class DispatchError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body: string,
  ) {
    super(message);
    this.name = 'DispatchError';
  }
}

export async function dispatchTestWorkflow(
  token: string,
  input: DispatchInput,
): Promise<void> {
  const url = `https://api.github.com/repos/${FACTORY_OWNER}/${FACTORY_REPO}/actions/workflows/${DISPATCH_WORKFLOW}/dispatches`;

  const inputs: Record<string, string> = {
    run_id: input.runId,
    suites: input.suites.join(','),
    callback_url: input.callbackUrl,
  };
  if (input.filter) inputs.filter = input.filter;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
      'User-Agent': 'factory-admin-studio',
    },
    body: JSON.stringify({
      ref: input.ref ?? DEFAULT_REF,
      inputs,
    }),
  });

  // Successful dispatch returns 204 No Content.
  if (res.status === 204) return;

  const body = await res.text();
  throw new DispatchError(
    `GitHub workflow_dispatch failed with ${res.status}`,
    res.status,
    body,
  );
}
