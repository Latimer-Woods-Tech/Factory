/**
 * GitHub API client for the admin-studio Worker.
 *
 * Wraps the four endpoints the Code tab needs:
 *   - GET /repos/:owner/:repo/git/trees/:sha?recursive=1
 *   - GET /repos/:owner/:repo/contents/:path?ref=:ref
 *   - GET /repos/:owner/:repo/branches
 *   - POST /repos/:owner/:repo/git/refs (create branch)
 *   - PUT  /repos/:owner/:repo/contents/:path (commit single file)
 *   - POST /repos/:owner/:repo/pulls (open PR)
 *
 * Token requirements: `repo` + `workflow` PAT (same one used for
 * workflow_dispatch). Read-only callers can use a fine-grained `contents:read`.
 *
 * All responses are constrained to the minimal fields exposed by
 * `@latimer-woods-tech/studio-core` types.
 */
import type { RepoBranch, RepoFileContent, RepoPullRequest, RepoTreeNode } from '@latimer-woods-tech/studio-core';

const FACTORY_OWNER = 'Latimer-Woods-Tech';
const FACTORY_REPO = 'Factory';
const API_BASE = 'https://api.github.com';

export class GitHubApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body: string,
  ) {
    super(message);
    this.name = 'GitHubApiError';
  }
}

/** Hard cap on bytes we return for any single file (Studio is for code). */
export const MAX_FILE_BYTES = 512 * 1024;

interface GhRequestInit {
  method?: string;
  body?: string;
  acceptRaw?: boolean;
}

export interface WorkflowDispatchArgs {
  workflowFile: string;
  ref: string;
  inputs?: Record<string, string>;
}

async function gh(token: string, path: string, init: GhRequestInit = {}): Promise<Response> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: init.method ?? 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: init.acceptRaw ? 'application/vnd.github.raw' : 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'factory-admin-studio',
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: init.body,
    signal: AbortSignal.timeout(10_000),
  });
  return res;
}

async function readJson<T>(res: Response): Promise<T> {
  const text = await res.text();
  if (!res.ok) {
    throw new GitHubApiError(`GitHub ${res.status}`, res.status, text);
  }
  return JSON.parse(text) as T;
}

interface GhTreeResponse {
  sha: string;
  tree: Array<{
    path: string;
    type: 'blob' | 'tree';
    sha: string;
    size?: number;
  }>;
  truncated: boolean;
}

/**
 * Fetch the full repo tree for `ref` (recursive). For Factory this is
 * around 1500–2000 entries — well under the GitHub 100k-entry cap, but we
 * forward the `truncated` flag in case it ever changes.
 *
 * @param owner - GitHub org/user (defaults to FACTORY_OWNER = 'Latimer-Woods-Tech')
 * @param repo  - Repository name (defaults to FACTORY_REPO = 'Factory')
 */
export async function fetchTree(
  token: string,
  ref: string,
  owner?: string,
  repo?: string,
): Promise<{ nodes: RepoTreeNode[]; truncated: boolean; treeSha: string }> {
  const o = owner ?? FACTORY_OWNER;
  const r = repo ?? FACTORY_REPO;
  const res = await gh(token, `/repos/${o}/${r}/git/trees/${encodeURIComponent(ref)}?recursive=1`);
  const data = await readJson<GhTreeResponse>(res);
  return {
    treeSha: data.sha,
    truncated: data.truncated,
    nodes: data.tree.map((t) => ({
      path: t.path,
      type: t.type,
      sha: t.sha,
      size: t.size ?? 0,
    })),
  };
}

interface GhContentResponse {
  type: 'file' | 'dir' | 'symlink' | 'submodule';
  encoding?: 'base64';
  size: number;
  name: string;
  path: string;
  sha: string;
  content?: string;
}

/**
 * Read a single file at `path` on `ref`. Returns `binary: true` and omits
 * the text payload when the blob looks non-textual or exceeds {@link MAX_FILE_BYTES}.
 *
 * @param owner - GitHub org/user (defaults to FACTORY_OWNER = 'Latimer-Woods-Tech')
 * @param repo  - Repository name (defaults to FACTORY_REPO = 'Factory')
 */
export async function fetchFile(
  token: string,
  path: string,
  ref: string,
  owner?: string,
  repo?: string,
): Promise<RepoFileContent> {
  const o = owner ?? FACTORY_OWNER;
  const r = repo ?? FACTORY_REPO;
  const url = `/repos/${o}/${r}/contents/${encodePath(path)}?ref=${encodeURIComponent(ref)}`;
  const res = await gh(token, url);
  const data = await readJson<GhContentResponse>(res);
  if (data.type !== 'file') {
    throw new GitHubApiError(`Not a file: ${path}`, 400, JSON.stringify({ type: data.type }));
  }
  if (data.size > MAX_FILE_BYTES) {
    return { path, ref, sha: data.sha, binary: true, size: data.size };
  }
  if (data.encoding !== 'base64' || !data.content) {
    return { path, ref, sha: data.sha, binary: true, size: data.size };
  }

  // GitHub adds whitespace to the base64 payload; remove it before decoding.
  const clean = data.content.replace(/\s+/g, '');
  const bytes = base64ToBytes(clean);
  if (looksBinary(bytes)) {
    return { path, ref, sha: data.sha, binary: true, size: data.size };
  }
  return {
    path,
    ref,
    sha: data.sha,
    binary: false,
    size: data.size,
    text: new TextDecoder('utf-8', { fatal: false }).decode(bytes),
  };
}

interface GhBranchListResponse {
  name: string;
  commit: { sha: string };
  protected: boolean;
}

/**
 * List branches. The repo's default branch is hard-coded to `main` per
 * the Factory standing orders.
 */
export async function fetchBranches(token: string): Promise<RepoBranch[]> {
  const res = await gh(token, `/repos/${FACTORY_OWNER}/${FACTORY_REPO}/branches?per_page=100`);
  const data = await readJson<GhBranchListResponse[]>(res);
  return data.map((b) => ({
    name: b.name,
    sha: b.commit.sha,
    isDefault: b.name === 'main',
    protected: Boolean(b.protected),
  }));
}

function encodePath(path: string): string {
  return path
    .split('/')
    .map((seg) => encodeURIComponent(seg))
    .join('/');
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out;
}

function bytesToBase64(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 1) bin += String.fromCharCode(bytes[i]!);
  return btoa(bin);
}

/**
 * Heuristic: any NUL byte in the first 8KB ⇒ binary. Reliable enough for
 * the "should we render this in the browser" decision.
 */
function looksBinary(bytes: Uint8Array): boolean {
  const sample = bytes.subarray(0, Math.min(8192, bytes.length));
  for (let i = 0; i < sample.length; i += 1) {
    if (sample[i] === 0) return true;
  }
  return false;
}

/**
 * Resolve a branch tip SHA. Used as the parent commit for new branches and
 * as the optimistic-concurrency anchor for commits.
 */
async function fetchBranchSha(token: string, branch: string): Promise<string> {
  const res = await gh(
    token,
    `/repos/${FACTORY_OWNER}/${FACTORY_REPO}/git/refs/heads/${encodeURIComponent(branch)}`,
  );
  const data = await readJson<{ object: { sha: string } }>(res);
  return data.object.sha;
}

/**
 * Create a new branch off `from` (defaults to `main`). Idempotent: if the
 * ref already exists, GitHub returns 422 and we surface a friendly error.
 */
export async function createBranch(
  token: string,
  name: string,
  from: string = 'main',
): Promise<{ name: string; sha: string }> {
  const sha = await fetchBranchSha(token, from);
  const res = await gh(token, `/repos/${FACTORY_OWNER}/${FACTORY_REPO}/git/refs`, {
    method: 'POST',
    body: JSON.stringify({ ref: `refs/heads/${name}`, sha }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new GitHubApiError(`createBranch ${res.status}`, res.status, text);
  }
  return { name, sha };
}

/**
 * Commit a single file via the contents API. `baseSha` is the blob SHA of
 * the existing file (omit for new files). Returns the new commit + blob SHAs.
 *
 * Caller is responsible for refusing to write to protected branches; this
 * function does not enforce that policy.
 */
export async function commitFile(
  token: string,
  args: {
    branch: string;
    path: string;
    content: string;
    baseSha?: string;
    message: string;
  },
): Promise<{ commitSha: string; blobSha: string }> {
  const url = `/repos/${FACTORY_OWNER}/${FACTORY_REPO}/contents/${encodePath(args.path)}`;
  const body: Record<string, unknown> = {
    message: args.message,
    content: bytesToBase64(new TextEncoder().encode(args.content)),
    branch: args.branch,
  };
  if (args.baseSha) body.sha = args.baseSha;
  const res = await gh(token, url, { method: 'PUT', body: JSON.stringify(body) });
  if (!res.ok) {
    const text = await res.text();
    throw new GitHubApiError(`commitFile ${res.status}`, res.status, text);
  }
  const data: { commit: { sha: string }; content: { sha: string } } = await res.json();
  return { commitSha: data.commit.sha, blobSha: data.content.sha };
}

interface GhPullResponse {
  number: number;
  html_url: string;
  state: 'open' | 'closed';
  merged?: boolean;
  head: { ref: string };
  base: { ref: string };
  title: string;
}

/**
 * Open a PR from `head` into `base` (default `main`).
 */
export async function openPullRequest(
  token: string,
  args: { head: string; base?: string; title: string; body?: string; draft?: boolean },
): Promise<RepoPullRequest> {
  const res = await gh(token, `/repos/${FACTORY_OWNER}/${FACTORY_REPO}/pulls`, {
    method: 'POST',
    body: JSON.stringify({
      head: args.head,
      base: args.base ?? 'main',
      title: args.title,
      body: args.body ?? '',
      draft: args.draft ?? false,
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new GitHubApiError(`openPullRequest ${res.status}`, res.status, text);
  }
  const data: GhPullResponse = await res.json();
  return {
    number: data.number,
    url: data.html_url,
    state: data.merged ? 'merged' : data.state,
    head: data.head.ref,
    base: data.base.ref,
    title: data.title,
  };
}

/**
 * Dispatch a GitHub Actions workflow by file name.
 *
 * Returns when GitHub accepts the dispatch request (HTTP 204).
 */
export async function dispatchWorkflow(token: string, args: WorkflowDispatchArgs): Promise<void> {
  const payload: Record<string, unknown> = {
    ref: args.ref,
  };
  if (args.inputs && Object.keys(args.inputs).length > 0) {
    payload.inputs = args.inputs;
  }

  const res = await gh(
    token,
    `/repos/${FACTORY_OWNER}/${FACTORY_REPO}/actions/workflows/${encodeURIComponent(args.workflowFile)}/dispatches`,
    {
      method: 'POST',
      body: JSON.stringify(payload),
    },
  );

  if (res.status !== 204) {
    const text = await res.text();
    throw new GitHubApiError(`dispatchWorkflow ${res.status}`, res.status, text);
  }
}

interface GhIssueResponse {
  number: number;
  title: string;
  state: 'open' | 'closed';
  labels: Array<{ name: string }>;
  html_url: string;
}

interface GhPullListResponse {
  number: number;
  title: string;
  state: 'open' | 'closed';
  html_url: string;
}

interface GhRunsResponse {
  workflow_runs: Array<{
    id: number;
    html_url: string;
    created_at: string;
    status: string;
  }>;
}

/**
 * List issues in the repo, optionally filtered by labels.
 *
 * @param owner - GitHub org/user (defaults to FACTORY_OWNER = 'Latimer-Woods-Tech')
 * @param repo  - Repository name (defaults to FACTORY_REPO = 'Factory')
 */
export async function listIssues(
  token: string,
  state: 'open' | 'closed' = 'open',
  labels: string = '',
  owner?: string,
  repo?: string,
): Promise<Array<{ number: number; title: string; state: string; labels: string[]; url: string }>> {
  const o = owner ?? FACTORY_OWNER;
  const r = repo ?? FACTORY_REPO;
  const labelQuery = labels ? `&labels=${encodeURIComponent(labels)}` : '';
  const res = await gh(token, `/repos/${o}/${r}/issues?state=${state}&per_page=30${labelQuery}`);
  const data = await readJson<GhIssueResponse[]>(res);
  return data.map((i) => ({
    number: i.number,
    title: i.title,
    state: i.state,
    labels: i.labels.map((l) => l.name),
    url: i.html_url,
  }));
}

/**
 * List pull requests in the repo.
 *
 * @param owner - GitHub org/user (defaults to FACTORY_OWNER = 'Latimer-Woods-Tech')
 * @param repo  - Repository name (defaults to FACTORY_REPO = 'Factory')
 */
export async function listPullRequests(
  token: string,
  state: 'open' | 'closed' | 'all' = 'open',
  owner?: string,
  repo?: string,
): Promise<Array<{ number: number; title: string; state: string; url: string }>> {
  const o = owner ?? FACTORY_OWNER;
  const r = repo ?? FACTORY_REPO;
  const res = await gh(token, `/repos/${o}/${r}/pulls?state=${state}&per_page=30`);
  const data = await readJson<GhPullListResponse[]>(res);
  return data.map((p) => ({
    number: p.number,
    title: p.title,
    state: p.state,
    url: p.html_url,
  }));
}

interface GhOrgRepo {
  name: string;
  full_name: string;
  description: string | null;
  html_url: string;
  pushed_at: string;
  private: boolean;
}

/**
 * List repositories for the Latimer-Woods-Tech org, sorted by last push.
 * Enables the AI to discover the full portfolio across Factory, HumanDesign,
 * capricast, coh, xico-city, and other repos.
 */
export async function listOrgRepos(
  token: string,
  org: string = FACTORY_OWNER,
  perPage = 30,
): Promise<Array<{ name: string; fullName: string; description: string | null; url: string; pushedAt: string; private: boolean }>> {
  const res = await gh(token, `/orgs/${encodeURIComponent(org)}/repos?sort=pushed&per_page=${perPage}`);
  const data = await readJson<GhOrgRepo[]>(res);
  return data.map((r) => ({
    name: r.name,
    fullName: r.full_name,
    description: r.description,
    url: r.html_url,
    pushedAt: r.pushed_at,
    private: r.private,
  }));
}

/**
 * Poll for the GitHub Actions run URL created immediately after a workflow_dispatch.
 *
 * GitHub queues the run asynchronously — it typically appears within 1–5 seconds.
 * We wait 3 s then try once; returns null if the run hasn't appeared yet rather
 * than blocking indefinitely.
 */
export async function fetchDispatchedRunUrl(
  token: string,
  workflowFile: string,
  dispatchedAt: Date,
): Promise<string | null> {
  await new Promise<void>((resolve) => setTimeout(resolve, 3000));

  const createdFilter = dispatchedAt.toISOString();
  const res = await gh(
    token,
    `/repos/${FACTORY_OWNER}/${FACTORY_REPO}/actions/runs?event=workflow_dispatch&workflow_id=${encodeURIComponent(workflowFile)}&created=>=${encodeURIComponent(createdFilter)}&per_page=5`,
  );
  if (!res.ok) return null;

  const data = await readJson<GhRunsResponse>(res);
  const run = data.workflow_runs.find((r) => new Date(r.created_at) >= dispatchedAt);
  return run?.html_url ?? null;
}
