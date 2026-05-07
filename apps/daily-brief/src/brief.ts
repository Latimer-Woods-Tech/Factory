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
 * Top-level orchestrator. Gathers all data sections, runs the LLM,
 * generates TTS audio, and fires the email to all recipients.
 *
 * Each section fetch already guards itself with AbortSignal.timeout, so no
 * additional setTimeout wrapper is needed here. Promise.allSettled ensures a
 * single slow or failing section never blocks the rest of the brief.
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

  // Gather all data sections in parallel. Each section's internal fetch is
  // guarded by AbortSignal.timeout, so no outer setTimeout wrapper is required.
  const [weather, news, activity, health, wisdom, stripeMrr, postHog, sentry] = await Promise.allSettled([
    fetchWeather(),
    fetchNewsSection(env.NEWS_API_KEY),
    fetchGitHubActivity(env.GITHUB_TOKEN, env.GITHUB_ORG),
    fetchWorkerHealth(),
    fetchWisdomSection(env),
    env.STRIPE_SECRET_KEY
      ? fetchStripeMrr(env.STRIPE_SECRET_KEY)
      : Promise.reject('Stripe not configured'),
    env.POSTHOG_API_KEY && env.POSTHOG_PROJECT_ID
      ? fetchPostHogSnapshot(env.POSTHOG_API_KEY, env.POSTHOG_PROJECT_ID)
      : Promise.reject('PostHog not configured'),
    env.SENTRY_AUTH_TOKEN && env.SENTRY_ORG
      ? fetchSentryErrors(env.SENTRY_AUTH_TOKEN, env.SENTRY_ORG)
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

  // Synthesize the PM narration to audio and store in R2.
  // synthesizeAndStore passes AbortSignal.timeout(25_000) to the ElevenLabs
  // fetch, so the underlying request is actually cancelled on expiry rather
  // than leaving a dangling connection consuming Worker CPU budget.
  const audioUrl = await synthesizeAndStore({
    text: insights.narration,
    dateLabel: now.toISOString().slice(0, 10),
    env,
  }).catch(() => null);

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

  // Idempotency note: this is a once-per-day scheduled cron. A double-fire on the
  // same day is the only realistic idempotency risk — the Workers cron scheduler
  // guarantees at-most-once delivery per trigger, but a manual re-run or mis-fire
  // could cause a second send. Resend deduplication is not available without an
  // `Idempotency-Key` request header; adding that support to the email package is
  // tracked separately (DEBT-005). For now, operational idempotency is enforced at
  // the scheduling layer (cron fires once per day).

  /**
   * Send with a single retry on transient failure.
   * Permanent failures (4xx status in the error message) are not retried.
   */
  async function sendWithRetry(to: string): Promise<{ id: string }> {
    const sendOpts = {
      to,
      subject: `Daily Brief — ${dateLabel}`,
      html,
      text: insights.textSummary,
    };
    try {
      return await emailClient.sendTransactional(sendOpts);
    } catch (firstErr) {
      // Retry once for transient network/5xx failures. Skip retry for permanent
      // 4xx errors (invalid address, rate limit, etc.) — they won't self-resolve.
      const msg = firstErr instanceof Error ? firstErr.message : String(firstErr);
      if (/\b4\d\d\b/.test(msg)) throw firstErr;
      return await emailClient.sendTransactional(sendOpts);
    }
  }

  // Use allSettled so a single bad address never silences the rest of the batch
  const sendResults = await Promise.allSettled(recipients.map(sendWithRetry));

  for (const [i, result] of sendResults.entries()) {
    if (result.status === 'rejected') {
      // Redact recipient address — log only the domain to avoid PII in Worker logs.
      const addr = recipients[i] ?? '';
      const masked = addr.includes('@') ? `***@${addr.split('@')[1]}` : `recipient[${i + 1}]`;
      console.error(`[daily-brief] email send failed for ${masked} (${i + 1}/${recipients.length}):`, result.reason);
    }
  }
}
