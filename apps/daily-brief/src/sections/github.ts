/**
 * GitHub activity section — fetches commits, PRs, issues, and Renovate
 * dependency alerts across the org using the GitHub REST API.
 * Requires GITHUB_TOKEN secret.
 */

export interface CommitSummary {
  repo: string;
  sha: string;
  message: string;
  author: string;
  url: string;
  timestamp: string;
}

export interface PullRequest {
  repo: string;
  number: number;
  title: string;
  state: 'open' | 'closed' | 'merged';
  author: string;
  url: string;
  mergedAt: string | null;
  isRenovate: boolean;
}

export interface Issue {
  repo: string;
  number: number;
  title: string;
  state: 'open' | 'closed';
  url: string;
  closedAt: string | null;
}

export interface GitHubActivity {
  /** Commits pushed in the last 24 hours */
  recentCommits: CommitSummary[];
  /** PRs opened or merged in the last 24 hours */
  recentPRs: PullRequest[];
  /** Issues closed in the last 24 hours */
  closedIssues: Issue[];
  /** Open Renovate PRs waiting for merge */
  renovatePRs: PullRequest[];
  /** 7-day commit count per repo */
  weeklyCommitsByRepo: Record<string, number>;
  /** 30-day PR merge count per repo */
  monthlyMergedPRs: number;
  /** Total commits in the last year */
  yearlyCommitCount: number;
  /** Repos with recent activity */
  activeRepos: string[];
}

interface GHRepo {
  name: string;
  default_branch: string;
  pushed_at: string;
}

interface GHCommit {
  sha: string;
  commit: { message: string; author: { date: string; name: string } };
  html_url: string;
}

interface GHPullRequest {
  number: number;
  title: string;
  state: string;
  merged_at: string | null;
  html_url: string;
  user: { login: string };
  created_at: string;
}

interface GHIssue {
  number: number;
  title: string;
  state: string;
  html_url: string;
  closed_at: string | null;
  pull_request?: unknown;
  created_at: string;
}

const GH_BASE = 'https://api.github.com';

function ghHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'daily-brief/1.0',
  };
}

async function ghFetch<T>(url: string, token: string): Promise<T | null> {
  try {
    const res = await fetch(url, { headers: ghHeaders(token), signal: AbortSignal.timeout(8_000) });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export async function fetchGitHubActivity(
  token: string,
  org: string,
): Promise<GitHubActivity> {
  const now = Date.now();
  const oneDayAgo = new Date(now - 86_400_000).toISOString();
  const oneWeekAgo = new Date(now - 7 * 86_400_000).toISOString();
  const oneMonthAgo = new Date(now - 30 * 86_400_000).toISOString();
  const oneYearAgo = new Date(now - 365 * 86_400_000).toISOString();

  // Fetch repos — limit to 30 most recently pushed
  const repos = await ghFetch<GHRepo[]>(
    `${GH_BASE}/orgs/${org}/repos?sort=pushed&per_page=30&type=all`,
    token,
  );
  if (!repos) {
    return {
      recentCommits: [],
      recentPRs: [],
      closedIssues: [],
      renovatePRs: [],
      weeklyCommitsByRepo: {},
      monthlyMergedPRs: 0,
      yearlyCommitCount: 0,
      activeRepos: [],
    };
  }

  // Only look at repos with activity in the past year
  const activeRepoList = repos.filter((r) => r.pushed_at > oneYearAgo);

  // Fetch commits, PRs, issues in parallel for all active repos
  const perRepoData = await Promise.allSettled(
    activeRepoList.map(async (repo) => {
      const [commits24h, prList, issueList, commitsWeek, commitsYear] = await Promise.allSettled([
        ghFetch<GHCommit[]>(
          `${GH_BASE}/repos/${org}/${repo.name}/commits?since=${oneDayAgo}&per_page=10`,
          token,
        ),
        ghFetch<GHPullRequest[]>(
          `${GH_BASE}/repos/${org}/${repo.name}/pulls?state=all&sort=updated&per_page=20`,
          token,
        ),
        ghFetch<GHIssue[]>(
          `${GH_BASE}/repos/${org}/${repo.name}/issues?state=closed&since=${oneDayAgo}&per_page=10`,
          token,
        ),
        ghFetch<GHCommit[]>(
          `${GH_BASE}/repos/${org}/${repo.name}/commits?since=${oneWeekAgo}&per_page=100`,
          token,
        ),
        ghFetch<GHCommit[]>(
          `${GH_BASE}/repos/${org}/${repo.name}/commits?since=${oneYearAgo}&per_page=100`,
          token,
        ),
      ]);

      return {
        repoName: repo.name,
        commits24h: commits24h.status === 'fulfilled' ? (commits24h.value ?? []) : [],
        prList: prList.status === 'fulfilled' ? (prList.value ?? []) : [],
        issueList: issueList.status === 'fulfilled' ? (issueList.value ?? []) : [],
        commitsWeek: commitsWeek.status === 'fulfilled' ? (commitsWeek.value ?? []) : [],
        commitsYear: commitsYear.status === 'fulfilled' ? (commitsYear.value ?? []) : [],
      };
    }),
  );

  const recentCommits: CommitSummary[] = [];
  const recentPRs: PullRequest[] = [];
  const closedIssues: Issue[] = [];
  const renovatePRs: PullRequest[] = [];
  const weeklyCommitsByRepo: Record<string, number> = {};
  let monthlyMergedPRs = 0;
  let yearlyCommitCount = 0;

  for (const settled of perRepoData) {
    if (settled.status !== 'fulfilled') continue;
    const { repoName, commits24h, prList, issueList, commitsWeek, commitsYear } = settled.value;

    // Recent commits (24h)
    for (const c of commits24h) {
      recentCommits.push({
        repo: repoName,
        sha: c.sha.slice(0, 7),
        message: c.commit.message.split('\n')[0] ?? '',
        author: c.commit.author.name,
        url: c.html_url,
        timestamp: c.commit.author.date,
      });
    }

    // PRs
    for (const pr of prList) {
      const isRecent = pr.created_at > oneDayAgo || (pr.merged_at !== null && pr.merged_at > oneDayAgo);
      const isRenovate = pr.user.login.toLowerCase().includes('renovate');

      if (isRenovate && pr.state === 'open') {
        renovatePRs.push({
          repo: repoName,
          number: pr.number,
          title: pr.title,
          state: 'open',
          author: pr.user.login,
          url: pr.html_url,
          mergedAt: null,
          isRenovate: true,
        });
      }

      if (isRecent) {
        const state: 'open' | 'closed' | 'merged' =
          pr.merged_at !== null ? 'merged' : pr.state === 'open' ? 'open' : 'closed';
        recentPRs.push({
          repo: repoName,
          number: pr.number,
          title: pr.title,
          state,
          author: pr.user.login,
          url: pr.html_url,
          mergedAt: pr.merged_at,
          isRenovate,
        });
      }

      if (pr.merged_at !== null && pr.merged_at > oneMonthAgo) {
        monthlyMergedPRs++;
      }
    }

    // Closed issues (exclude PRs)
    for (const issue of issueList) {
      if (issue.pull_request) continue;
      closedIssues.push({
        repo: repoName,
        number: issue.number,
        title: issue.title,
        state: 'closed',
        url: issue.html_url,
        closedAt: issue.closed_at,
      });
    }

    // Time-window aggregates
    weeklyCommitsByRepo[repoName] = commitsWeek.length;
    yearlyCommitCount += commitsYear.length;
  }

  const activeRepos = Object.entries(weeklyCommitsByRepo)
    .filter(([, count]) => count > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([repo]) => repo);

  return {
    recentCommits: recentCommits.slice(0, 15),
    recentPRs: recentPRs.slice(0, 10),
    closedIssues: closedIssues.slice(0, 8),
    renovatePRs: renovatePRs.slice(0, 5),
    weeklyCommitsByRepo,
    monthlyMergedPRs,
    yearlyCommitCount,
    activeRepos,
  };
}
