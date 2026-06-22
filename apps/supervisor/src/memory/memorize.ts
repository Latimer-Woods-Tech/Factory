/**
 * RFC-008 Phase 1 — MEMORIZE
 *
 * Feeds the `factory-memory` Vectorize index with cross-repo signals so the
 * REFLECT step has a grounded, searchable substrate rather than point-in-time
 * snapshots from a single source.
 *
 * Sources embedded on each run:
 *   1. Merged PRs — recent (past 7 days), Factory repo
 *   2. Closed issues — recent (past 7 days), Factory repo (issues only, not PR rows)
 *   3. docs/STATE.md — latest snapshot (truncated to 4 000 chars; stable ID so upsert is idempotent)
 *
 * Embedding is idempotent: each piece uses a stable Vectorize ID so re-runs
 * just overwrite rather than creating duplicates.
 *
 * Called from the supervisor scheduled handler when REFLECTION_MODE ≠ 'off'.
 * Never throws — errors are swallowed and tallied.
 */

import type { Env } from '../index.js';
import { embedAndUpsert } from './vector.js';
import { getInstallationToken } from '../tools/github-auth.js';

const GITHUB_API = 'https://api.github.com';
const REPO = 'Latimer-Woods-Tech/Factory';
const LOOKBACK_DAYS = 7;
const MAX_ITEMS = 50;
const BODY_TRUNCATE = 500;
const STATE_MD_TRUNCATE = 4000;

interface MemorizeResult {
  embedded: number;
  skipped: number;
  errors: number;
}

/** Returns ISO date string LOOKBACK_DAYS ago. */
function sinceDate(): string {
  const d = new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
  return d.toISOString();
}

/** GET helper — returns null on any error. */
async function ghGet<T>(url: string, token: string): Promise<T | null> {
  try {
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'User-Agent': 'factory-supervisor/memorize',
      },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

/** Build embeddable text for a merged PR. */
function prText(pr: { number: number; title: string; body: string | null; user: { login: string } | null; merged_at: string | null }): string {
  return [
    `PR #${pr.number}: ${pr.title}`,
    pr.user ? `Author: ${pr.user.login}` : '',
    pr.merged_at ? `Merged: ${pr.merged_at}` : '',
    pr.body ? pr.body.slice(0, BODY_TRUNCATE) : '',
  ].filter(Boolean).join('\n');
}

/** Build embeddable text for a closed issue. */
function issueText(issue: { number: number; title: string; body: string | null; user: { login: string } | null; closed_at: string | null; labels: Array<{ name: string }> }): string {
  const labelStr = issue.labels.map((l) => l.name).join(', ');
  return [
    `Issue #${issue.number}: ${issue.title}`,
    issue.user ? `Author: ${issue.user.login}` : '',
    issue.closed_at ? `Closed: ${issue.closed_at}` : '',
    labelStr ? `Labels: ${labelStr}` : '',
    issue.body ? issue.body.slice(0, BODY_TRUNCATE) : '',
  ].filter(Boolean).join('\n');
}

/**
 * Feeds factory-memory with recent PRs, issues, and STATE.md.
 * Safe to call from the scheduled handler — never throws.
 */
export async function runMemorize(env: Env): Promise<MemorizeResult> {
  const result: MemorizeResult = { embedded: 0, skipped: 0, errors: 0 };

  if (!env.AI || !env.VECTORIZE_MEMORY) {
    // Bindings absent in local dev — nothing to do.
    return result;
  }

  // GitHub installation token.
  let token: string;
  try {
    token = await getInstallationToken(
      env.FACTORY_APP_ID,
      env.FACTORY_APP_PRIVATE_KEY,
      env.FACTORY_APP_INSTALLATION_ID,
    );
  } catch {
    result.errors += 1;
    return result;
  }

  const since = sinceDate();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- GitHub API response shape
  const index = env.VECTORIZE_MEMORY as any;

  // ─── 1. Merged PRs ───────────────────────────────────────────────────────────
  const prs = await ghGet<Array<{
    number: number;
    title: string;
    body: string | null;
    user: { login: string } | null;
    merged_at: string | null;
    pull_request?: unknown;
  }>>(
    `${GITHUB_API}/repos/${REPO}/pulls?state=closed&sort=updated&direction=desc&per_page=${MAX_ITEMS}`,
    token,
  );

  if (prs) {
    const merged = prs.filter((pr) => pr.merged_at && pr.merged_at >= since);
    for (const pr of merged) {
      const id = `pr-${pr.number}`;
      const ok = await embedAndUpsert(
        env.AI,
        index,
        id,
        prText(pr),
        {
          type: 'pr',
          source: `Factory#${pr.number}`,
          title: pr.title.slice(0, 100),
          occurred_at: pr.merged_at ? new Date(pr.merged_at).getTime() : 0,
        },
      );
      if (ok) result.embedded += 1; else result.errors += 1;
    }
  } else {
    result.errors += 1;
  }

  // ─── 2. Closed issues ────────────────────────────────────────────────────────
  const issues = await ghGet<Array<{
    number: number;
    title: string;
    body: string | null;
    user: { login: string } | null;
    closed_at: string | null;
    labels: Array<{ name: string }>;
    pull_request?: unknown; // present for PR rows returned by /issues
  }>>(
    `${GITHUB_API}/repos/${REPO}/issues?state=closed&sort=updated&direction=desc&per_page=${MAX_ITEMS}&since=${since}`,
    token,
  );

  if (issues) {
    // /issues returns both issues and PRs — exclude PR rows.
    const realIssues = issues.filter((i) => !i.pull_request && i.closed_at && i.closed_at >= since);
    for (const issue of realIssues) {
      const id = `issue-${issue.number}`;
      const ok = await embedAndUpsert(
        env.AI,
        index,
        id,
        issueText(issue),
        {
          type: 'issue',
          source: `Factory#${issue.number}`,
          title: issue.title.slice(0, 100),
          occurred_at: issue.closed_at ? new Date(issue.closed_at).getTime() : 0,
        },
      );
      if (ok) result.embedded += 1; else result.errors += 1;
    }
  } else {
    result.errors += 1;
  }

  // ─── 3. docs/STATE.md ────────────────────────────────────────────────────────
  const stateFile = await ghGet<{ content: string; encoding: string }>(
    `${GITHUB_API}/repos/${REPO}/contents/docs/STATE.md`,
    token,
  );

  if (stateFile && stateFile.encoding === 'base64' && stateFile.content) {
    try {
      // Content is base64 with newlines — strip them before decoding.
      const raw = atob(stateFile.content.replace(/\n/g, ''));
      const text = raw.slice(0, STATE_MD_TRUNCATE);
      // Stable ID — updated timestamp omitted so ID stays the same across runs
      // and upsert overwrites without creating duplicates.
      const ok = await embedAndUpsert(
        env.AI,
        index,
        'state-md-latest',
        `docs/STATE.md (current snapshot):\n${text}`,
        {
          type: 'state-md',
          source: 'docs/STATE.md',
          title: 'Factory STATE.md (current)',
          occurred_at: Date.now(),
        },
      );
      if (ok) result.embedded += 1; else result.errors += 1;
    } catch {
      result.errors += 1;
    }
  } else {
    result.errors += 1;
  }

  return result;
}
