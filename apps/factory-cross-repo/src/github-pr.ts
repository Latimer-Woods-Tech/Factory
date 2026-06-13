/**
 * GitHub REST API helpers for branch creation and PR opening.
 * All fetch calls use AbortSignal.timeout to prevent indefinite hangs.
 */

const GITHUB_API = 'https://api.github.com';
const TIMEOUT_MS = 15_000;

function headers(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'Content-Type': 'application/json',
  };
}

async function ghFetch(url: string, token: string, init: RequestInit = {}): Promise<Response> {
  const res = await fetch(url, {
    ...init,
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: headers(token),
  });
  return res;
}

/** Returns the default branch name and latest commit SHA for a repo. */
async function getDefaultBranchSHA(
  owner: string,
  repo: string,
  token: string,
): Promise<{ branch: string; sha: string }> {
  const repoRes = await ghFetch(`${GITHUB_API}/repos/${owner}/${repo}`, token);
  if (!repoRes.ok) {
    throw new Error(`Failed to get repo ${owner}/${repo}: ${repoRes.status}`);
  }
  const repoData = (await repoRes.json()) as { default_branch: string };
  const branch = repoData.default_branch;

  const refRes = await ghFetch(
    `${GITHUB_API}/repos/${owner}/${repo}/git/ref/heads/${branch}`,
    token,
  );
  if (!refRes.ok) {
    throw new Error(`Failed to get ref for ${branch}: ${refRes.status}`);
  }
  const refData = (await refRes.json()) as { object: { sha: string } };
  return { branch, sha: refData.object.sha };
}

/** Creates a new branch from the given SHA. Returns false if branch already exists. */
async function createBranch(
  owner: string,
  repo: string,
  branchName: string,
  sha: string,
  token: string,
): Promise<void> {
  const res = await ghFetch(`${GITHUB_API}/repos/${owner}/${repo}/git/refs`, token, {
    method: 'POST',
    body: JSON.stringify({ ref: `refs/heads/${branchName}`, sha }),
  });
  if (!res.ok && res.status !== 422) {
    // 422 = branch already exists; treat as non-fatal
    const text = await res.text().catch(() => '(no body)');
    throw new Error(`Failed to create branch ${branchName}: ${res.status} ${text.slice(0, 200)}`);
  }
}

/** Creates or updates a file in the repo with the given content. */
async function upsertFile(
  owner: string,
  repo: string,
  path: string,
  content: string,
  message: string,
  branch: string,
  token: string,
): Promise<void> {
  // Check if file exists to get its SHA (required for updates)
  let existingSha: string | undefined;
  const checkRes = await ghFetch(
    `${GITHUB_API}/repos/${owner}/${repo}/contents/${path}?ref=${branch}`,
    token,
  );
  if (checkRes.ok) {
    const existing = (await checkRes.json()) as { sha: string };
    existingSha = existing.sha;
  }

  const body: Record<string, string> = {
    message,
    content: btoa(unescape(encodeURIComponent(content))),
    branch,
  };
  if (existingSha) body['sha'] = existingSha;

  const res = await ghFetch(`${GITHUB_API}/repos/${owner}/${repo}/contents/${path}`, token, {
    method: 'PUT',
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '(no body)');
    throw new Error(`Failed to upsert file ${path}: ${res.status} ${text.slice(0, 200)}`);
  }
}

/** Opens a PR from branchName → baseBranch. Returns the PR URL and number. */
async function createPullRequest(
  owner: string,
  repo: string,
  title: string,
  body: string,
  head: string,
  base: string,
  token: string,
): Promise<{ html_url: string; number: number }> {
  const res = await ghFetch(`${GITHUB_API}/repos/${owner}/${repo}/pulls`, token, {
    method: 'POST',
    body: JSON.stringify({ title, body, head, base }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '(no body)');
    throw new Error(`Failed to create PR in ${owner}/${repo}: ${res.status} ${text.slice(0, 200)}`);
  }
  const pr = (await res.json()) as { html_url: string; number: number };
  return pr;
}

export interface AffectedRepo {
  app_id: string;
  owner: string;
  repo: string;
}

export interface StepReceipt {
  step_id: string;
  tool_name: string;
  status: string;
  side_effects: string;
  [key: string]: unknown;
}

export interface CreatePRPayload {
  template_id: string;
  run_id: string;
  description: string;
  affected_repos: AffectedRepo[];
  receipts: StepReceipt[];
}

export interface CreatePRResult {
  ok: boolean;
  pr_url?: string;
  pr_number?: number;
  error?: string;
}

/**
 * Creates an audit branch + PR in each affected repo, returns the first PR created.
 */
export async function createAuditPRs(
  payload: CreatePRPayload,
  installationToken: string,
): Promise<CreatePRResult> {
  const { template_id, run_id, description, affected_repos, receipts } = payload;
  const branchName = `supervisor-audit/${run_id}`;

  const auditContent = JSON.stringify(
    {
      template_id,
      run_id,
      description,
      generated_at: new Date().toISOString(),
      receipts,
    },
    null,
    2,
  );

  const prBody = [
    `## Supervisor Audit — ${template_id}`,
    '',
    `**Run ID:** \`${run_id}\``,
    `**Description:** ${description}`,
    '',
    `**Affected repos:** ${affected_repos.map((r) => `${r.owner}/${r.repo}`).join(', ')}`,
    '',
    `**Steps executed:** ${receipts.length}`,
    `**Mutations:** ${receipts.filter((r) => r.side_effects !== 'none').length}`,
    '',
    `Full receipts: \`.supervisor/runs/${run_id}.json\``,
    '',
    '---',
    '_Auto-generated by Factory Supervisor_',
  ].join('\n');

  let firstPR: CreatePRResult | null = null;

  for (const { owner, repo } of affected_repos) {
    try {
      const { branch: baseBranch, sha } = await getDefaultBranchSHA(owner, repo, installationToken);
      await createBranch(owner, repo, branchName, sha, installationToken);
      await upsertFile(
        owner,
        repo,
        `.supervisor/runs/${run_id}.json`,
        auditContent,
        `chore(supervisor): audit trail for run ${run_id}`,
        branchName,
        installationToken,
      );
      const pr = await createPullRequest(
        owner,
        repo,
        `[Supervisor] ${template_id} audit`,
        prBody,
        branchName,
        baseBranch,
        installationToken,
      );
      if (!firstPR) {
        firstPR = { ok: true, pr_url: pr.html_url, pr_number: pr.number };
      }
      console.log(`[factory-cross-repo] PR opened: ${pr.html_url}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[factory-cross-repo] Failed to create PR in ${owner}/${repo}: ${msg}`);
      // Continue with remaining repos even if one fails
    }
  }

  return firstPR ?? { ok: false, error: 'No PRs created (all repos failed)' };
}
