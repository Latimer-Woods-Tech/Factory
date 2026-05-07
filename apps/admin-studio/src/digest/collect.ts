/**
 * Factory Digest — data collectors.
 *
 * Each collector is independent and graceful: if the upstream is unreachable
 * or misconfigured the function returns an object with `available: false` so
 * the rest of the digest pipeline can continue.
 *
 * GitHub uses a GitHub App JWT + installation-access-token flow so we never
 * need a long-lived PAT bound to a personal account.
 *
 * Data sources:
 *   - GitHub:     PRs merged, issues opened/closed, supervisor run results
 *                 for Latimer-Woods-Tech/factory and Latimer-Woods-Tech/HumanDesign
 *   - Sentry:     new issues + error-rate delta for latwood-tech org
 *   - Stripe:     new subscriptions, cancellations, MRR delta (read-only)
 *   - Supervisor: last run summary from factory-supervisor /state endpoint
 */

import type { Env } from '../env.js';

// ── Timeouts ─────────────────────────────────────────────────────────────────

const FETCH_TIMEOUT_MS = 10_000;

// ── GitHub App auth ───────────────────────────────────────────────────────────

/**
 * Builds a GitHub App JWT valid for 60 s using the Web Crypto API.
 * No Node.js crypto; no jsonwebtoken.
 */
async function buildAppJwt(appId: string, privateKeyPem: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const payload = { iat: now - 30, exp: now + 300, iss: appId };

  const b64u = (obj: unknown) =>
    btoa(JSON.stringify(obj)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');

  const headerB64 = b64u(header);
  const payloadB64 = b64u(payload);
  const signingInput = `${headerB64}.${payloadB64}`;

  // Strip PEM headers and decode
  const pemBody = privateKeyPem
    .replace(/-----BEGIN [^-]+-----|-----END [^-]+-----|\s/g, '');
  const derBuffer = Uint8Array.from(atob(pemBody), (c) => c.charCodeAt(0));

  let key: CryptoKey;
  try {
    key = await crypto.subtle.importKey(
      'pkcs8',
      derBuffer,
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['sign'],
    );
  } catch {
    throw new Error('Failed to parse FACTORY_APP_PRIVATE_KEY: key must be a PKCS#8 PEM (RS256)');
  }

  const enc = new TextEncoder();
  const sig = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    key,
    enc.encode(signingInput),
  );

  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(sig)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');

  return `${signingInput}.${sigB64}`;
}

/**
 * Exchanges a GitHub App JWT for a short-lived installation access token.
 */
async function getInstallationToken(
  appId: string,
  privateKeyPem: string,
  installationId: string,
): Promise<string> {
  const jwt = await buildAppJwt(appId, privateKeyPem);
    const res = await fetch(
    `https://api.github.com/app/installations/${installationId}/access_tokens`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${jwt}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'factory-admin-studio-digest',
      },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    },
  );
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`GitHub App token exchange failed ${res.status}: ${body}`);
  }
  const json = await res.json() as { token: string };
  return json.token;
}

// ── GitHub data ───────────────────────────────────────────────────────────────

export interface GitHubPR {
  number: number;
  title: string;
  author: string;
  mergedAt: string;
  url: string;
  repo: string;
}

export interface GitHubIssue {
  number: number;
  title: string;
  state: 'open' | 'closed';
  author: string;
  createdAt: string;
  closedAt: string | null;
  url: string;
  repo: string;
}

export interface GitHubDigestData {
  available: true;
  mergedPRs: GitHubPR[];
  openedIssues: GitHubIssue[];
  closedIssues: GitHubIssue[];
  supervisorRun: string | null;
}

export interface GitHubDigestUnavailable {
  available: false;
  reason: string;
}

export type GitHubResult = GitHubDigestData | GitHubDigestUnavailable;

const GITHUB_REPOS = [
  { owner: 'Latimer-Woods-Tech', repo: 'factory' },
  { owner: 'Latimer-Woods-Tech', repo: 'HumanDesign' },
];

async function fetchGitHubRepoPRs(
  token: string,
  owner: string,
  repo: string,
  since: string,
): Promise<GitHubPR[]> {
    const url = `https://api.github.com/repos/${owner}/${repo}/pulls?state=closed&sort=updated&direction=desc&per_page=30`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'factory-admin-studio-digest',
    },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) return [];
  const prs = await res.json() as Array<{
    number: number;
    title: string;
    user: { login: string };
    merged_at: string | null;
    html_url: string;
  }>;
  return prs
    .filter((pr) => pr.merged_at && pr.merged_at >= since)
    .map((pr) => ({
      number: pr.number,
      title: pr.title,
      author: pr.user.login,
      mergedAt: pr.merged_at!,
      url: pr.html_url,
      repo: `${owner}/${repo}`,
    }));
}

async function fetchGitHubRepoIssues(
  token: string,
  owner: string,
  repo: string,
  since: string,
): Promise<{ opened: GitHubIssue[]; closed: GitHubIssue[] }> {
    const url = `https://api.github.com/repos/${owner}/${repo}/issues?state=all&sort=updated&direction=desc&per_page=50&since=${encodeURIComponent(since)}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'factory-admin-studio-digest',
    },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) return { opened: [], closed: [] };
  const issues = await res.json() as Array<{
    number: number;
    title: string;
    state: string;
    user: { login: string };
    created_at: string;
    closed_at: string | null;
    html_url: string;
    pull_request?: unknown;
  }>;

  // GitHub issues API returns PRs too — filter them out
  const realIssues = issues.filter((i) => !i.pull_request);

  const opened = realIssues
    .filter((i) => i.created_at >= since)
    .map((i) => ({
      number: i.number,
      title: i.title,
      state: i.state as 'open' | 'closed',
      author: i.user.login,
      createdAt: i.created_at,
      closedAt: i.closed_at,
      url: i.html_url,
      repo: `${owner}/${repo}`,
    }));

  const closed = realIssues
    .filter((i) => i.state === 'closed' && i.closed_at && i.closed_at >= since)
    .map((i) => ({
      number: i.number,
      title: i.title,
      state: 'closed' as const,
      author: i.user.login,
      createdAt: i.created_at,
      closedAt: i.closed_at,
      url: i.html_url,
      repo: `${owner}/${repo}`,
    }));

  return { opened, closed };
}

/**
 * Collects GitHub activity in the past 12 hours across the monitored repos.
 */
export async function collectGitHub(env: Env): Promise<GitHubResult> {
  const { FACTORY_APP_ID, FACTORY_APP_PRIVATE_KEY, FACTORY_APP_INSTALLATION_ID } = env;
  if (!FACTORY_APP_ID || !FACTORY_APP_PRIVATE_KEY || !FACTORY_APP_INSTALLATION_ID) {
    return { available: false, reason: 'GitHub App credentials not configured' };
  }

  try {
    const token = await getInstallationToken(
      FACTORY_APP_ID,
      FACTORY_APP_PRIVATE_KEY,
      FACTORY_APP_INSTALLATION_ID,
    );

    const since = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString();

    const results = await Promise.allSettled(
      GITHUB_REPOS.map(async ({ owner, repo }) => {
        const [prs, issues] = await Promise.all([
          fetchGitHubRepoPRs(token, owner, repo, since),
          fetchGitHubRepoIssues(token, owner, repo, since),
        ]);
        return { prs, issues };
      }),
    );

    const mergedPRs: GitHubPR[] = [];
    const openedIssues: GitHubIssue[] = [];
    const closedIssues: GitHubIssue[] = [];

    for (const result of results) {
      if (result.status === 'fulfilled') {
        mergedPRs.push(...result.value.prs);
        openedIssues.push(...result.value.issues.opened);
        closedIssues.push(...result.value.issues.closed);
      }
    }

    // Fetch supervisor run summary if available
    let supervisorRun: string | null = null;
    if (env.SUPERVISOR_URL) {
      try {
                const supRes = await fetch(`${env.SUPERVISOR_URL}/state`, {
          headers: { 'User-Agent': 'factory-admin-studio-digest' },
          signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        });
        if (supRes.ok) {
          const state = await supRes.json() as Record<string, unknown>;
          supervisorRun = typeof state.lastRunSummary === 'string'
            ? state.lastRunSummary
            : JSON.stringify(state).slice(0, 300);
        }
      } catch {
        // best-effort
      }
    }

    return { available: true, mergedPRs, openedIssues, closedIssues, supervisorRun };
  } catch (err) {
    return { available: false, reason: (err as Error).message };
  }
}

// ── Sentry data ───────────────────────────────────────────────────────────────

export interface SentryIssueEntry {
  id: string;
  title: string;
  level: string;
  count: string;
  firstSeen: string;
  url: string;
}

export interface SentryDigestData {
  available: true;
  newIssues: SentryIssueEntry[];
  /** Total error event count in the last 12 h */
  totalEvents: number;
  /** Total error event count in the previous 12 h (for delta) */
  baselineEvents: number;
}

export interface SentryDigestUnavailable {
  available: false;
  reason: string;
}

export type SentryResult = SentryDigestData | SentryDigestUnavailable;

/**
 * Collects Sentry new issues and error-rate delta for the latwood-tech org.
 */
export async function collectSentry(env: Env): Promise<SentryResult> {
  const token = env.SENTRY_AUTH_TOKEN;
  const org = env.SENTRY_ORG ?? 'latwood-tech';
  if (!token) {
    return { available: false, reason: 'SENTRY_AUTH_TOKEN not configured' };
  }

  try {
    const since12h = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString();

        const issuesRes = await fetch(
      `https://sentry.io/api/0/organizations/${encodeURIComponent(org)}/issues/` +
      `?statsPeriod=12h&query=is:unresolved&limit=25&sort=date`,
      {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      },
    );

    if (!issuesRes.ok) {
      return { available: false, reason: `Sentry issues API returned ${issuesRes.status}` };
    }

    const rawIssues = await issuesRes.json() as Array<{
      id: string;
      title: string;
      level: string;
      count: string;
      firstSeen: string;
      permalink: string;
    }>;

    // Filter to issues first seen in the past 12h
    const newIssues: SentryIssueEntry[] = rawIssues
      .filter((i) => i.firstSeen >= since12h)
      .map((i) => ({
        id: i.id,
        title: i.title,
        level: i.level,
        count: i.count,
        firstSeen: i.firstSeen,
        url: i.permalink,
      }));

    // Fetch event counts for current and previous 12h windows
        const statsRes = await fetch(
      `https://sentry.io/api/0/organizations/${encodeURIComponent(org)}/stats_v2/` +
      `?groupBy=outcome&field=sum(quantity)&statsPeriod=24h&interval=12h&category=error`,
      {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      },
    );

    let totalEvents = 0;
    let baselineEvents = 0;

    if (statsRes.ok) {
      const stats = await statsRes.json() as {
        intervals: string[];
        groups: Array<{ totals: Record<string, number> }>;
      };
      // intervals: [T-24h, T-12h] — index 0 = baseline, index 1 = current
      const groups = stats.groups ?? [];
      const sumGroup = groups.find((g) => g.totals) ?? groups[0];
      if (sumGroup) {
        const vals = Object.values(sumGroup.totals);
        baselineEvents = vals[0] ?? 0;
        totalEvents = vals[1] ?? 0;
      }
    }

    return { available: true, newIssues, totalEvents, baselineEvents };
  } catch (err) {
    return { available: false, reason: (err as Error).message };
  }
}

// ── Stripe data ───────────────────────────────────────────────────────────────

export interface StripeEvent {
  id: string;
  type: 'new_subscription' | 'cancellation';
  customer: string;
  plan: string;
  amount: number;
  currency: string;
  createdAt: string;
}

export interface StripeDigestData {
  available: true;
  newSubscriptions: StripeEvent[];
  cancellations: StripeEvent[];
  /** MRR in cents at end of window */
  currentMrr: number;
  /** MRR in cents at start of window (12 h ago) */
  previousMrr: number;
}

export interface StripeDigestUnavailable {
  available: false;
  reason: string;
}

export type StripeResult = StripeDigestData | StripeDigestUnavailable;

/**
 * Fetches new subscriptions, cancellations, and MRR delta via the Stripe API.
 * Read-only mode: all requests are HTTP GET — no charges, mutations, or writes.
 *
 * Idempotency: Stripe does not support (and rejects) Idempotency-Key headers on
 * GET requests per their API contract and RFC 7231 §4.3.1. Future webhook
 * deduplication belongs in a dedicated webhook handler — not in this collector.
 * No POST/PUT/DELETE calls are ever issued from this function.
 */
export async function collectStripe(env: Env): Promise<StripeResult> {
  const key = env.STRIPE_SECRET_KEY;
  if (!key) {
    return { available: false, reason: 'STRIPE_SECRET_KEY not configured' };
  }

  const since12h = Math.floor((Date.now() - 12 * 60 * 60 * 1000) / 1000);

  function stripeGet(path: string): Promise<Response> {
    // Read-only GET: Stripe's API contract (RFC 7231 §4.3.1) makes GET requests
    // inherently idempotent — Idempotency-Key is not applicable or accepted.
    // This helper exclusively performs reads; no mutations ever reach here.
    return fetch(`https://api.stripe.com/v1/${path}`, {
      headers: {
        Authorization: `Bearer ${key}`,
        'User-Agent': 'factory-admin-studio-digest',
      },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
  }

  try {
    // Fetch subscription events (created + deleted) in the past 12h
    const [createdRes, cancelledRes, subsRes] = await Promise.all([
      stripeGet(`events?type=customer.subscription.created&created[gte]=${since12h}&limit=25`),
      stripeGet(`events?type=customer.subscription.deleted&created[gte]=${since12h}&limit=25`),
      stripeGet('subscriptions?status=active&limit=100'),
    ]);

    if (!createdRes.ok || !cancelledRes.ok) {
      return { available: false, reason: `Stripe API error: ${createdRes.status}/${cancelledRes.status}` };
    }

    type StripeEventsResponse = {
      data: Array<{
        id: string;
        type: string;
        created: number;
        data: {
          object: {
            customer: string;
            items: { data: Array<{ plan: { nickname: string | null; id: string; amount: number; currency: string } }> };
          };
        };
      }>;
    };

    const createdEvents = await createdRes.json() as StripeEventsResponse;
    const cancelledEvents = await cancelledRes.json() as StripeEventsResponse;

    function mapEvent(e: StripeEventsResponse['data'][number], type: 'new_subscription' | 'cancellation'): StripeEvent {
      const plan = e.data.object.items.data[0]?.plan;
      return {
        id: e.id,
        type,
        customer: e.data.object.customer,
        plan: plan?.nickname ?? plan?.id ?? 'unknown',
        amount: plan?.amount ?? 0,
        currency: plan?.currency ?? 'usd',
        createdAt: new Date(e.created * 1000).toISOString(),
      };
    }

    const newSubscriptions = createdEvents.data.map((e) => mapEvent(e, 'new_subscription'));
    const cancellations = cancelledEvents.data.map((e) => mapEvent(e, 'cancellation'));

    // Compute current MRR from active subscriptions
    let currentMrr = 0;
    if (subsRes.ok) {
      const subs = await subsRes.json() as {
        data: Array<{ items: { data: Array<{ plan: { amount: number; interval: string } }> } }>;
      };
      for (const sub of subs.data) {
        for (const item of sub.items.data) {
          const { amount, interval } = item.plan;
          // Normalise to monthly
          currentMrr += interval === 'year' ? Math.round(amount / 12) : amount;
        }
      }
    }

    // Approximate previous MRR: subtract new, add back cancelled
    const addedMrr = newSubscriptions.reduce((s, e) => s + e.amount, 0);
    const removedMrr = cancellations.reduce((s, e) => s + e.amount, 0);
    const previousMrr = currentMrr - addedMrr + removedMrr;

    return { available: true, newSubscriptions, cancellations, currentMrr, previousMrr };
  } catch (err) {
    return { available: false, reason: (err as Error).message };
  }
}

// ── Aggregate ─────────────────────────────────────────────────────────────────

export interface DigestData {
  collectedAt: string;
  windowHours: 12;
  github: GitHubResult;
  sentry: SentryResult;
  stripe: StripeResult;
}

/**
 * Runs all collectors concurrently and returns the full digest payload.
 * Never throws — each collector is independently guarded.
 */
export async function collectAll(env: Env): Promise<DigestData> {
  const [github, sentry, stripe] = await Promise.all([
    collectGitHub(env).catch((err): GitHubDigestUnavailable => ({
      available: false,
      reason: (err as Error).message,
    })),
    collectSentry(env).catch((err): SentryDigestUnavailable => ({
      available: false,
      reason: (err as Error).message,
    })),
    collectStripe(env).catch((err): StripeDigestUnavailable => ({
      available: false,
      reason: (err as Error).message,
    })),
  ]);

  return {
    collectedAt: new Date().toISOString(),
    windowHours: 12,
    github,
    sentry,
    stripe,
  };
}
