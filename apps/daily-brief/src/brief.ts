import { createEmailClient } from '@latimer-woods-tech/email';
import type { Env } from './index';
import { fetchWeather } from './sections/weather';
import { fetchNewsSection } from './sections/news';
import { fetchGitHubActivity } from './sections/github';
import { fetchWorkerHealth } from './sections/health';
import { generateInsights } from './sections/insights';
import { fetchWisdomSection } from './sections/wisdom';
import { fetchStripeMrr } from './sections/stripe';
import { fetchPostHogSnapshot } from './sections/posthog';
import { fetchSentryErrors } from './sections/sentry';
import { synthesizeAndStore } from './render/tts';
import { buildEmailHtml } from './render/email';

/**
 * Races a promise against a timeout — rejects with a labeled error if `ms` elapses first.
 * Section fetches don't accept AbortController signals, so this is the safe cross-platform
 * alternative that keeps us compliant with the no-Node-built-ins constraint.
 */
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`[daily-brief] timeout after ${ms}ms: ${label}`)), ms),
    ),
  ]);
}

/**
 * Top-level orchestrator. Gathers all data sections, runs the LLM,
 * generates TTS audio, and fires the email to all recipients.
 */
export async function runDailyBrief(env: Env): Promise<void> {
  const now = new Date();
  const dateLabel = now.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'America/New_York',
  });

  // Gather all data sections in parallel — each capped at 8 s to prevent cron overruns
  const [weather, news, activity, health, wisdom, stripeMrr, postHog, sentry] = await Promise.allSettled([
    withTimeout(fetchWeather(), 8_000, 'weather'),
    withTimeout(fetchNewsSection(env.NEWS_API_KEY), 8_000, 'news'),
    withTimeout(fetchGitHubActivity(env.GITHUB_TOKEN, env.GITHUB_ORG), 8_000, 'github-activity'),
    withTimeout(fetchWorkerHealth(), 8_000, 'worker-health'),
    withTimeout(fetchWisdomSection(env), 8_000, 'wisdom'),
    env.STRIPE_SECRET_KEY
      ? withTimeout(fetchStripeMrr(env.STRIPE_SECRET_KEY), 8_000, 'stripe')
      : Promise.reject('Stripe not configured'),
    env.POSTHOG_API_KEY && env.POSTHOG_PROJECT_ID
      ? withTimeout(fetchPostHogSnapshot(env.POSTHOG_API_KEY, env.POSTHOG_PROJECT_ID), 8_000, 'posthog')
      : Promise.reject('PostHog not configured'),
    env.SENTRY_AUTH_TOKEN && env.SENTRY_ORG
      ? withTimeout(fetchSentryErrors(env.SENTRY_AUTH_TOKEN, env.SENTRY_ORG), 8_000, 'sentry')
      : Promise.reject('Sentry not configured'),
  ]);

  const safeWeather = weather.status === 'fulfilled' ? weather.value : null;
  const safeNews = news.status === 'fulfilled' ? news.value : null;
  const safeActivity = activity.status === 'fulfilled' ? activity.value : null;
  const safeHealth = health.status === 'fulfilled' ? health.value : null;
  const safeWisdom = wisdom.status === 'fulfilled' ? wisdom.value : null;
  const safeStripeMrr = stripeMrr.status === 'fulfilled' ? stripeMrr.value : null;
  const safePostHog = postHog.status === 'fulfilled' ? postHog.value : null;
  const safeSentry = sentry.status === 'fulfilled' ? sentry.value : null;

  // LLM insights depend on all gathered data
  const insights = await generateInsights({
    weather: safeWeather,
    news: safeNews,
    activity: safeActivity,
    health: safeHealth,
    env,
    dateLabel,
  });

  // Synthesize the PM narration to audio and store in R2 (25s timeout guard)
  const audioUrl = await Promise.race([
    synthesizeAndStore({
      text: insights.narration,
      dateLabel: now.toISOString().slice(0, 10),
      env,
    }).catch(() => null),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), 25_000)),
  ]);

  // Build HTML email
  const html = buildEmailHtml({
    dateLabel,
    weather: safeWeather,
    news: safeNews,
    activity: safeActivity,
    health: safeHealth,
    insights,
    audioUrl,
    wisdom: safeWisdom,
    stripeMrr: safeStripeMrr,
    postHog: safePostHog,
    sentry: safeSentry,
  });

  const recipients = env.RECIPIENTS.split(',')
    .map((r) => r.trim())
    .filter(Boolean);

  const emailClient = createEmailClient({
    resendApiKey: env.RESEND_API_KEY,
    fromAddress: 'brief@apunlimited.com',
    fromName: 'Daily Brief',
  });

  const emailResults = await Promise.allSettled(
    recipients.map((to) =>
      emailClient.sendTransactional({
        to,
        subject: `📋 Daily Brief — ${dateLabel}`,
        html,
        text: insights.textSummary,
      }),
    ),
  );

  for (let i = 0; i < emailResults.length; i++) {
    const result = emailResults[i];
    if (result?.status === 'rejected') {
      console.warn(`[daily-brief] Failed to send to ${recipients[i]}: ${String(result.reason)}`);
    }
  }
}
