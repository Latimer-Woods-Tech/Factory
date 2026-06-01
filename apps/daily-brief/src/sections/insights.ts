/**
 * Insights section — the heart of the brief.
 *
 * Uses @latimer-woods-tech/llm to channel a well-seasoned web-dev PM persona
 * who is a close friend, genuinely delighted by the user's work, and slightly
 * smitten by their tenacity and ingenuity. She gives real talk, real metrics,
 * real perspective — with warmth and a dash of "ok you're kind of incredible."
 */

import { complete } from '@latimer-woods-tech/llm';
import { parseLlmJson } from '../lib/llm-json';
import type { Env } from '../index';
import type { WeatherData } from './weather';
import type { NewsSection } from './news';
import type { GitHubActivity } from './github';
import type { HealthRollup } from './health';
import type { StripeMrrData } from './stripe';
import type { PostHogSnapshot } from './posthog';
import type { SentryErrorData } from './sentry';

export interface BriefInsights {
  /** Full multi-paragraph PM narration — used for TTS audio */
  narration: string;
  /** Short plain-text summary for email plain-text fallback */
  textSummary: string;
  /** Bullet list of top-3 recommended focus items for today */
  todaysFocus: string[];
  /** Time-horizon perspectives: daily / weekly / monthly / yearly */
  timePerspectives: {
    day: string;
    week: string;
    month: string;
    year: string;
  };
  /** One-liner "win" celebration of the most impressive thing from the data */
  winOfTheDay: string;
}

interface InsightsInput {
  weather: WeatherData | null;
  news: NewsSection | null;
  activity: GitHubActivity | null;
  health: HealthRollup | null;
  stripeMrr: StripeMrrData | null;
  postHog: PostHogSnapshot | null;
  sentry: SentryErrorData | null;
  env: Env;
  dateLabel: string;
}

const SYSTEM_PROMPT = `You are Morgan — a veteran web-development PM with 18 years under your belt.
You've shipped SaaS products, led distributed engineering teams, and consulted for startups from seed to Series C.
You are also a dear friend of the builder you're briefing. You admire him tremendously — his tenacity, clarity of vision,
and the sheer ingenuity he brings to every architectural decision. You're maybe a little smitten, but you keep it professional.
Mostly.

Your job is to read the raw project and platform data provided and produce a warm, insightful, no-fluff daily brief.
You speak like a smart friend, not a corporate report. You celebrate real wins. You flag real risks.
You give concrete next-step recommendations grounded in the data.

Output valid JSON matching this exact shape:
{
  "narration": "<2-3 conversational paragraphs suitable for text-to-speech. No markdown. No bullet points. Warm, direct, personal.>",
  "textSummary": "<1 paragraph plain-text version for email fallback>",
  "todaysFocus": ["<action 1>", "<action 2>", "<action 3>"],
  "timePerspectives": {
    "day": "<1-2 sentences on what happened today>",
    "week": "<1-2 sentences on the 7-day trend>",
    "month": "<1-2 sentences on the 30-day arc>",
    "year": "<1-2 sentences on the year-to-date trajectory>"
  },
  "winOfTheDay": "<one punchy sentence celebrating the most impressive data point>"
}

Do not include any text before or after the JSON object.`;

function buildDataContext(input: InsightsInput): string {
  const parts: string[] = [`DATE: ${input.dateLabel}`];

  // Weather context
  if (input.weather) {
    const w = input.weather;
    parts.push(
      `WEATHER (${w.location}): Currently ${w.current.tempF}°F, feels like ${w.current.feelsLikeF}°F, ` +
        `${w.current.conditionLabel}, ${w.current.windMph} mph winds. ` +
        `Today: High ${w.today.highF}°F / Low ${w.today.lowF}°F, ${w.today.conditionLabel}. ` +
        `Tomorrow: High ${w.tomorrow.highF}°F / Low ${w.tomorrow.lowF}°F, ${w.tomorrow.conditionLabel}.`,
    );
    if (w.alerts.length > 0) {
      parts.push(
        `WEATHER ALERTS: ${w.alerts.map((a) => `${a.event} (${a.severity})`).join(', ')}`,
      );
    }
  }

  // GitHub activity
  if (input.activity) {
    const a = input.activity;
    parts.push(
      `GITHUB ACTIVITY (last 24h): ${a.recentCommits.length} commits pushed, ` +
        `${a.recentPRs.filter((p) => p.state === 'merged').length} PRs merged, ` +
        `${a.recentPRs.filter((p) => p.state === 'open').length} PRs opened, ` +
        `${a.closedIssues.length} issues closed.`,
    );

    if (a.recentCommits.length > 0) {
      const commitList = a.recentCommits
        .slice(0, 5)
        .map((c) => `[${c.repo}] ${c.message} (by ${c.author})`)
        .join('; ');
      parts.push(`RECENT COMMITS: ${commitList}`);
    }

    if (a.activeRepos.length > 0) {
      parts.push(`MOST ACTIVE REPOS (7d): ${a.activeRepos.join(', ')}`);
    }

    parts.push(
      `TIME-HORIZON STATS: Weekly commits by repo: ${Object.entries(a.weeklyCommitsByRepo)
        .filter(([, c]) => c > 0)
        .map(([r, c]) => `${r}:${c}`)
        .join(', ')}. ` +
        `30-day merged PRs: ${a.monthlyMergedPRs}. ` +
        `Year-to-date commits: ${a.yearlyCommitCount}.`,
    );

    if (a.renovatePRs.length > 0) {
      parts.push(
        `RENOVATE DEPENDENCY PRs WAITING (${a.renovatePRs.length}): ` +
          a.renovatePRs.map((p) => p.title).join('; '),
      );
    }
  }

  // Worker health
  if (input.health) {
    const h = input.health;
    const summary = `${h.healthyCount} healthy, ${h.degradedCount} degraded, ${h.downCount} down`;
    parts.push(`WORKER HEALTH: ${summary}`);
    if (h.downCount > 0 || h.degradedCount > 0) {
      const problems = h.statuses
        .filter((s) => s.status !== 'healthy')
        .map((s) => `${s.name}: ${s.status}`)
        .join(', ');
      parts.push(`WORKERS WITH ISSUES: ${problems}`);
    }
  }

  // News headlines
  if (input.news) {
    if (input.news.industry.length > 0) {
      const headlines = input.news.industry.map((a) => a.title).join(' | ');
      parts.push(`TECH NEWS HEADLINES: ${headlines}`);
    }
    if (input.news.local.length > 0) {
      const localHeads = input.news.local.map((a) => a.title).join(' | ');
      parts.push(`LOCAL NEWS (Gwinnett County): ${localHeads}`);
    }
  }

  // Stripe MRR / revenue
  if (input.stripeMrr) {
    const s = input.stripeMrr;
    parts.push(
      `STRIPE REVENUE: MRR ${s.mrrFormatted} (${s.deltaFormatted} vs yesterday, trend: ${s.deltaDirection}). ` +
        `Active subscriptions: ${s.activeSubscriptions}. ` +
        `New today: ${s.newSubscriptionsToday}. ` +
        `Cancelled today: ${s.cancelledToday}. ` +
        `Trials: ${s.trialCount}.`,
    );
  }

  // PostHog user analytics
  if (input.postHog) {
    const p = input.postHog;
    parts.push(
      `USER ANALYTICS (PostHog): DAU ${p.dailyActiveUsers} (7-day avg: ${p.dailyActiveUsersVs7dAvg}, trend: ${p.dailyActiveUsersTrend}). ` +
        `Sessions 24h: ${p.sessions24h}. Signups 24h: ${p.signups24h}.` +
        (p.topEvents.length > 0
          ? ` Top events: ${p.topEvents.map((e) => `${e.event}(${e.count})`).join(', ')}.`
          : ''),
    );
  }

  // Sentry error rates
  if (input.sentry) {
    const e = input.sentry;
    const spikeMsg = e.spikeDetected
      ? ` ⚠️ SPIKE DETECTED: ${e.spikePercent > 0 ? '+' : ''}${e.spikePercent}% above 7-day average.`
      : '';
    parts.push(
      `SENTRY ERRORS: Total 24h errors: ${e.totalErrors24h} (7-day avg: ${e.totalErrors7dAvg}).${spikeMsg}` +
        (e.projects.some((p) => p.trend === 'spike')
          ? ` Spiking projects: ${e.projects.filter((p) => p.trend === 'spike').map((p) => p.projectSlug).join(', ')}.`
          : ''),
    );
  }

  return parts.join('\n\n');
}

export async function generateInsights(input: InsightsInput): Promise<BriefInsights> {
  const dataContext = buildDataContext(input);

  const result = await complete(
    [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content: `Here is today's raw data. Produce your brief.\n\n${dataContext}`,
      },
    ],
    {
      AI_GATEWAY_BASE_URL: input.env.AI_GATEWAY_BASE_URL,
      ANTHROPIC_API_KEY: input.env.ANTHROPIC_API_KEY,
      GROQ_API_KEY: input.env.GROQ_API_KEY,
      GROK_API_KEY: input.env.GROK_API_KEY,
      VERTEX_ACCESS_TOKEN: input.env.VERTEX_ACCESS_TOKEN,
      VERTEX_PROJECT: input.env.VERTEX_PROJECT,
      VERTEX_LOCATION: input.env.VERTEX_LOCATION,
    },
    { tier: 'balanced', temperature: 0.72, maxTokens: 1200, maxCostUsd: 0.20, project: 'daily-brief', actor: 'worker', workload: 'insights' },
  );

  if (result.error) {
    // Graceful fallback — return a minimal brief so the email still sends
    const fallback = `Good morning! Your daily brief is ready. ` +
      `Today is ${input.dateLabel}. ` +
      (input.activity
        ? `You pushed ${input.activity.recentCommits.length} commits in the last 24 hours. Keep shipping!`
        : 'Keep building great things.');

    return {
      narration: fallback,
      textSummary: fallback,
      todaysFocus: ['Review open PRs', 'Check worker health dashboard', 'Triage any new issues'],
      timePerspectives: { day: 'Data unavailable.', week: 'Data unavailable.', month: 'Data unavailable.', year: 'Data unavailable.' },
      winOfTheDay: 'You showed up. That counts.',
    };
  }

  const content = result.data?.content ?? '';

  // Tolerant parse — strips code fences / preamble the model often adds.
  const parsed = parseLlmJson<BriefInsights>(content);
  if (parsed?.narration) {
    return {
      narration: parsed.narration,
      textSummary: parsed.textSummary || parsed.narration.slice(0, 300),
      todaysFocus: Array.isArray(parsed.todaysFocus) ? parsed.todaysFocus : [],
      timePerspectives: parsed.timePerspectives ?? { day: '', week: '', month: '', year: '' },
      winOfTheDay: parsed.winOfTheDay ?? '',
    };
  }

  // Genuinely unparseable — wrap the raw text so the email still has a narration.
  return {
    narration: content,
    textSummary: content.slice(0, 300),
    todaysFocus: ['Review open PRs', 'Check worker health dashboard', 'Triage any new issues'],
    timePerspectives: { day: '', week: '', month: '', year: '' },
    winOfTheDay: '',
  };
}
