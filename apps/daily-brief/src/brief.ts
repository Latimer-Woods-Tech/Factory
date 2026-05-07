import { createEmailClient } from '@latimer-woods-tech/email';
import type { Env } from './index';
import { fetchWeather } from './sections/weather';
import { fetchNewsSection } from './sections/news';
import { fetchGitHubActivity } from './sections/github';
import { fetchWorkerHealth } from './sections/health';
import { generateInsights } from './sections/insights';
import { synthesizeAndStore } from './render/tts';
import { buildEmailHtml } from './render/email';

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

  // Gather all data sections in parallel — none depend on each other
  const [weather, news, activity, health] = await Promise.allSettled([
    fetchWeather(),
    fetchNewsSection(env.NEWS_API_KEY),
    fetchGitHubActivity(env.GITHUB_TOKEN, env.GITHUB_ORG),
    fetchWorkerHealth(),
  ]);

  const safeWeather = weather.status === 'fulfilled' ? weather.value : null;
  const safeNews = news.status === 'fulfilled' ? news.value : null;
  const safeActivity = activity.status === 'fulfilled' ? activity.value : null;
  const safeHealth = health.status === 'fulfilled' ? health.value : null;

  // LLM insights depend on all gathered data
  const insights = await generateInsights({
    weather: safeWeather,
    news: safeNews,
    activity: safeActivity,
    health: safeHealth,
    env,
    dateLabel,
  });

  // Synthesize the PM narration to audio and store in R2
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
  });

  const recipients = env.RECIPIENTS.split(',')
    .map((r) => r.trim())
    .filter(Boolean);

  const emailClient = createEmailClient({
    resendApiKey: env.RESEND_API_KEY,
    fromAddress: 'brief@apunlimited.com',
    fromName: 'Daily Brief',
  });

  await Promise.all(
    recipients.map((to) =>
      emailClient.sendTransactional({
        to,
        subject: `📋 Daily Brief — ${dateLabel}`,
        html,
        text: insights.textSummary,
      }),
    ),
  );
}
