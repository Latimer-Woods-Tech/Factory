/**
 * Sentry error spike section — compares yesterday's error volume
 * against the 7-day rolling average and flags spikes.
 * Requires SENTRY_AUTH_TOKEN and SENTRY_ORG secrets.
 */

export interface SentryErrorData {
  org: string;
  projects: SentryProjectStats[];
  totalErrors24h: number;
  totalErrors7dAvg: number;
  spikeDetected: boolean;
  spikePercent: number;
}

export interface SentryProjectStats {
  projectSlug: string;
  errors24h: number;
  errors7dAvg: number;
  trend: 'spike' | 'normal' | 'quiet';
  topIssues: Array<{ title: string; count: number; url: string }>;
}

interface SentryStatsRow {
  totals: { 'sum(quantity)': number };
}

interface SentryIssue {
  title: string;
  count: string;
  permalink: string;
}

interface SentryProject {
  slug: string;
}

async function sentryFetch<T>(
  authToken: string,
  path: string,
): Promise<T | null> {
  try {
    const res = await fetch(`https://sentry.io/api/0${path}`, {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export async function fetchSentryErrors(
  authToken: string,
  org: string,
): Promise<SentryErrorData> {
  const now = new Date();
  const yesterday = new Date(now.getTime() - 86_400_000);
  const weekAgo = new Date(now.getTime() - 7 * 86_400_000);

  const yISO = yesterday.toISOString();
  const nowISO = now.toISOString();
  const weekAgoISO = weekAgo.toISOString();

  // Fetch list of projects
  const projects = await sentryFetch<SentryProject[]>(authToken, `/organizations/${org}/projects/`);
  if (!projects?.length) {
    return {
      org,
      projects: [],
      totalErrors24h: 0,
      totalErrors7dAvg: 0,
      spikeDetected: false,
      spikePercent: 0,
    };
  }

  const slugs = projects.slice(0, 6).map((p) => p.slug);

  const perProject = await Promise.allSettled(
    slugs.map(async (slug): Promise<SentryProjectStats> => {
      const [stats24h, stats7d, topIssues] = await Promise.allSettled([
        sentryFetch<{ stats: SentryStatsRow[] }>(
          authToken,
          `/organizations/${org}/stats_v2/?project=${slug}&category=error&field=sum(quantity)&interval=1h&start=${yISO}&end=${nowISO}&groupBy=project`,
        ),
        sentryFetch<{ stats: SentryStatsRow[] }>(
          authToken,
          `/organizations/${org}/stats_v2/?project=${slug}&category=error&field=sum(quantity)&interval=1d&start=${weekAgoISO}&end=${nowISO}&groupBy=project`,
        ),
        sentryFetch<SentryIssue[]>(
          authToken,
          `/projects/${org}/${slug}/issues/?query=is:unresolved&sort=date&limit=3`,
        ),
      ]);

      const errors24h =
        stats24h.status === 'fulfilled'
          ? (stats24h.value?.stats ?? []).reduce(
              (acc, r) => acc + (r.totals?.['sum(quantity)'] ?? 0),
              0,
            )
          : 0;

      const errors7dTotal =
        stats7d.status === 'fulfilled'
          ? (stats7d.value?.stats ?? []).reduce(
              (acc, r) => acc + (r.totals?.['sum(quantity)'] ?? 0),
              0,
            )
          : 0;
      const errors7dAvg = Math.round(errors7dTotal / 7);

      const trend: 'spike' | 'normal' | 'quiet' =
        errors7dAvg > 0 && errors24h > errors7dAvg * 1.5
          ? 'spike'
          : errors24h === 0
          ? 'quiet'
          : 'normal';

      const issues: Array<{ title: string; count: number; url: string }> = [];
      if (topIssues.status === 'fulfilled' && topIssues.value) {
        for (const iss of topIssues.value.slice(0, 3)) {
          issues.push({ title: iss.title, count: Number(iss.count), url: iss.permalink });
        }
      }

      return { projectSlug: slug, errors24h, errors7dAvg, trend, topIssues: issues };
    }),
  );

  const projectStats: SentryProjectStats[] = perProject
    .filter((r): r is PromiseFulfilledResult<SentryProjectStats> => r.status === 'fulfilled')
    .map((r) => r.value);

  const totalErrors24h = projectStats.reduce((acc, p) => acc + p.errors24h, 0);
  const totalErrors7dAvg = projectStats.reduce((acc, p) => acc + p.errors7dAvg, 0);
  const spikeDetected = totalErrors7dAvg > 0 && totalErrors24h > totalErrors7dAvg * 1.5;
  const spikePercent =
    totalErrors7dAvg > 0
      ? Math.round(((totalErrors24h - totalErrors7dAvg) / totalErrors7dAvg) * 100)
      : 0;

  return {
    org,
    projects: projectStats,
    totalErrors24h,
    totalErrors7dAvg,
    spikeDetected,
    spikePercent,
  };
}
