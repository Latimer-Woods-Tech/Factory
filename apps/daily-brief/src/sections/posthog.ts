/**
 * PostHog funnel section — key product event counts and conversion snapshot.
 * Uses the PostHog Query API (HogQL).
 * Requires POSTHOG_API_KEY and POSTHOG_PROJECT_ID secrets.
 */

export interface PostHogSnapshot {
  dailyActiveUsers: number;
  dailyActiveUsersVs7dAvg: number;
  dailyActiveUsersTrend: 'up' | 'down' | 'flat';
  pageviews24h: number;
  signups24h: number;
  sessions24h: number;
  topEvents: Array<{ event: string; count: number }>;
}

interface HogQLResult {
  results: Array<[string, number]>;
  error?: string;
}

async function hogqlQuery(
  apiKey: string,
  projectId: string,
  query: string,
): Promise<HogQLResult | null> {
  try {
    const res = await fetch(
      `https://us.posthog.com/api/projects/${projectId}/query/`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query: { kind: 'HogQLQuery', query } }),
      },
    );
    if (!res.ok) return null;
    return (await res.json()) as HogQLResult;
  } catch {
    return null;
  }
}

export async function fetchPostHogSnapshot(
  apiKey: string,
  projectId: string,
): Promise<PostHogSnapshot> {
  const now = new Date();
  const yesterday = new Date(now.getTime() - 86_400_000);
  const yStr = yesterday.toISOString().slice(0, 10);
  const todayStr = now.toISOString().slice(0, 10);
  const weekAgo = new Date(now.getTime() - 7 * 86_400_000).toISOString().slice(0, 10);

  const [dauRes, dau7dRes, signupsRes, sessionsRes, topEventsRes] = await Promise.allSettled([
    // DAU yesterday
    hogqlQuery(
      apiKey,
      projectId,
      `SELECT count(distinct person_id) FROM events WHERE event = '$pageview' AND timestamp >= '${yStr}' AND timestamp < '${todayStr}'`,
    ),
    // 7-day avg DAU
    hogqlQuery(
      apiKey,
      projectId,
      `SELECT count(distinct person_id) FROM events WHERE event = '$pageview' AND timestamp >= '${weekAgo}' AND timestamp < '${todayStr}'`,
    ),
    // Signups
    hogqlQuery(
      apiKey,
      projectId,
      `SELECT count() FROM events WHERE event IN ('user_signed_up', 'signed_up', 'Account Created') AND timestamp >= '${yStr}'`,
    ),
    // Sessions
    hogqlQuery(
      apiKey,
      projectId,
      `SELECT count(distinct session_id) FROM events WHERE timestamp >= '${yStr}' AND timestamp < '${todayStr}'`,
    ),
    // Top 5 events
    hogqlQuery(
      apiKey,
      projectId,
      `SELECT event, count() as c FROM events WHERE timestamp >= '${yStr}' AND event NOT LIKE '$%' GROUP BY event ORDER BY c DESC LIMIT 5`,
    ),
  ]);

  const dau = dauRes.status === 'fulfilled' ? (dauRes.value?.results?.[0]?.[1] ?? 0) : 0;
  const dau7d = dau7dRes.status === 'fulfilled' ? (dau7dRes.value?.results?.[0]?.[1] ?? 0) : 0;
  const dau7dAvg = Math.round(dau7d / 7);
  const dauDelta = dau - dau7dAvg;
  const dauTrend: 'up' | 'down' | 'flat' =
    dauDelta > 2 ? 'up' : dauDelta < -2 ? 'down' : 'flat';

  const signups = signupsRes.status === 'fulfilled' ? (signupsRes.value?.results?.[0]?.[1] ?? 0) : 0;
  const sessions = sessionsRes.status === 'fulfilled' ? (sessionsRes.value?.results?.[0]?.[1] ?? 0) : 0;

  const topEvents: Array<{ event: string; count: number }> = [];
  if (topEventsRes.status === 'fulfilled' && topEventsRes.value?.results) {
    for (const row of topEventsRes.value.results) {
      if (row[0] && row[1]) topEvents.push({ event: String(row[0]), count: Number(row[1]) });
    }
  }

  return {
    dailyActiveUsers: dau,
    dailyActiveUsersVs7dAvg: dau7dAvg,
    dailyActiveUsersTrend: dauTrend,
    pageviews24h: dau,
    signups24h: signups,
    sessions24h: sessions,
    topEvents: topEvents.slice(0, 5),
  };
}
