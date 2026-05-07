/**
 * Email HTML renderer for the daily brief.
 * Produces a rich, dark-mode-friendly email with sections for weather,
 * news, GitHub activity, worker health, PM insights, and an audio player.
 */

import type { WeatherData } from '../sections/weather';
import type { NewsSection } from '../sections/news';
import type { GitHubActivity } from '../sections/github';
import type { HealthRollup } from '../sections/health';
import type { BriefInsights } from '../sections/insights';

interface EmailInput {
  dateLabel: string;
  weather: WeatherData | null;
  news: NewsSection | null;
  activity: GitHubActivity | null;
  health: HealthRollup | null;
  insights: BriefInsights;
  audioUrl: string | null;
}

const COLORS = {
  bg: '#0f0f13',
  card: '#1a1a24',
  border: '#2e2e44',
  accent: '#7c6af7',
  accentLight: '#a99ef8',
  text: '#e8e8f0',
  muted: '#8888aa',
  green: '#4ade80',
  yellow: '#facc15',
  red: '#f87171',
  blue: '#60a5fa',
};

function section(title: string, emoji: string, body: string): string {
  return `
    <div style="
      background:${COLORS.card};
      border:1px solid ${COLORS.border};
      border-radius:12px;
      padding:24px 28px;
      margin-bottom:20px;
    ">
      <h2 style="
        margin:0 0 16px 0;
        font-size:13px;
        font-weight:600;
        letter-spacing:0.12em;
        text-transform:uppercase;
        color:${COLORS.accentLight};
      ">${emoji}&nbsp;&nbsp;${title}</h2>
      ${body}
    </div>`;
}

function pill(text: string, color: string): string {
  return `<span style="
    display:inline-block;
    padding:2px 10px;
    border-radius:100px;
    font-size:11px;
    font-weight:600;
    background:${color}22;
    color:${color};
    border:1px solid ${color}44;
    margin-right:6px;
  ">${text}</span>`;
}

function row(label: string, value: string): string {
  return `<div style="
    display:flex;
    justify-content:space-between;
    padding:7px 0;
    border-bottom:1px solid ${COLORS.border};
    font-size:13px;
  ">
    <span style="color:${COLORS.muted}">${label}</span>
    <span style="color:${COLORS.text};font-weight:500">${value}</span>
  </div>`;
}

function buildWeatherSection(w: WeatherData): string {
  const alertsHtml =
    w.alerts.length > 0
      ? `<div style="
          background:#f8717122;
          border:1px solid #f8717144;
          border-radius:8px;
          padding:12px 16px;
          margin-top:14px;
          font-size:13px;
          color:${COLORS.red};
        ">
          ⚠️ <strong>Active Alerts:</strong><br/>
          ${w.alerts.map((a) => `${a.event} (${a.severity})`).join('<br/>')}
        </div>`
      : '';

  const body = `
    <div style="display:flex;gap:20px;flex-wrap:wrap">
      <div style="flex:1;min-width:180px">
        <div style="font-size:42px;font-weight:700;color:${COLORS.text};line-height:1">${w.current.tempF}°F</div>
        <div style="font-size:14px;color:${COLORS.muted};margin-top:4px">${w.current.conditionLabel}</div>
        <div style="font-size:12px;color:${COLORS.muted};margin-top:2px">Feels like ${w.current.feelsLikeF}°F · ${w.current.windMph} mph · ${w.current.humidity}% humidity</div>
      </div>
      <div style="flex:1;min-width:180px">
        ${row('Today', `${w.today.highF}° / ${w.today.lowF}° — ${w.today.conditionLabel}`)}
        ${row('Tomorrow', `${w.tomorrow.highF}° / ${w.tomorrow.lowF}° — ${w.tomorrow.conditionLabel}`)}
        ${w.today.precipInches > 0 ? row('Precip today', `${w.today.precipInches}"`) : ''}
      </div>
    </div>
    ${alertsHtml}`;

  return section(`Weather — ${w.location}`, '🌤️', body);
}

function buildNewsSection(news: NewsSection): string {
  const industryHtml =
    news.industry.length > 0
      ? `<div style="margin-bottom:18px">
          <div style="font-size:11px;letter-spacing:0.1em;text-transform:uppercase;color:${COLORS.muted};margin-bottom:10px">Industry &amp; Tech</div>
          ${news.industry
            .map(
              (a) => `<div style="padding:10px 0;border-bottom:1px solid ${COLORS.border}">
                <a href="${a.url}" style="color:${COLORS.text};text-decoration:none;font-size:13px;font-weight:500;line-height:1.4">${a.title}</a>
                <div style="font-size:11px;color:${COLORS.muted};margin-top:3px">${a.source} · ${new Date(a.publishedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</div>
              </div>`,
            )
            .join('')}
        </div>`
      : '';

  const localHtml =
    news.local.length > 0
      ? `<div>
          <div style="font-size:11px;letter-spacing:0.1em;text-transform:uppercase;color:${COLORS.muted};margin-bottom:10px">Local — Gwinnett County</div>
          ${news.local
            .map(
              (a) => `<div style="padding:10px 0;border-bottom:1px solid ${COLORS.border}">
                <a href="${a.url}" style="color:${COLORS.text};text-decoration:none;font-size:13px;font-weight:500;line-height:1.4">${a.title}</a>
                <div style="font-size:11px;color:${COLORS.muted};margin-top:3px">${a.source} · ${new Date(a.publishedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</div>
              </div>`,
            )
            .join('')}
        </div>`
      : '<div style="color:' + COLORS.muted + ';font-size:13px">No local news found today.</div>';

  return section('News', '📰', industryHtml + localHtml);
}

function buildGithubSection(a: GitHubActivity): string {
  const statsRow = `<div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:18px">
    ${[
      { label: 'Commits (24h)', val: String(a.recentCommits.length), color: COLORS.green },
      { label: 'PRs merged (24h)', val: String(a.recentPRs.filter((p) => p.state === 'merged').length), color: COLORS.blue },
      { label: 'Issues closed (24h)', val: String(a.closedIssues.length), color: COLORS.accent },
      { label: 'PRs merged (30d)', val: String(a.monthlyMergedPRs), color: COLORS.accentLight },
      { label: 'Commits (YTD)', val: String(a.yearlyCommitCount), color: COLORS.yellow },
    ]
      .map(
        ({ label, val, color }) => `<div style="
          background:${color}15;
          border:1px solid ${color}33;
          border-radius:10px;
          padding:12px 16px;
          text-align:center;
          min-width:100px;
        ">
          <div style="font-size:22px;font-weight:700;color:${color}">${val}</div>
          <div style="font-size:11px;color:${COLORS.muted};margin-top:3px">${label}</div>
        </div>`,
      )
      .join('')}
  </div>`;

  const commitsHtml =
    a.recentCommits.length > 0
      ? `<div style="margin-bottom:14px">
          <div style="font-size:11px;letter-spacing:0.1em;text-transform:uppercase;color:${COLORS.muted};margin-bottom:8px">Recent Commits</div>
          ${a.recentCommits
            .slice(0, 6)
            .map(
              (c) => `<div style="padding:7px 0;border-bottom:1px solid ${COLORS.border};font-size:13px">
                <span style="font-family:monospace;font-size:11px;color:${COLORS.accent};margin-right:8px">${c.sha}</span>
                <a href="${c.url}" style="color:${COLORS.text};text-decoration:none">${c.message.slice(0, 80)}</a>
                <span style="color:${COLORS.muted};font-size:11px"> · ${c.repo}</span>
              </div>`,
            )
            .join('')}
        </div>`
      : '';

  const renovateHtml =
    a.renovatePRs.length > 0
      ? `<div style="
          background:#facc1510;
          border:1px solid #facc1533;
          border-radius:8px;
          padding:12px 16px;
          margin-top:12px;
        ">
          <div style="font-size:12px;color:${COLORS.yellow};font-weight:600;margin-bottom:6px">🔄 Renovate PRs Waiting for Review (${a.renovatePRs.length})</div>
          ${a.renovatePRs
            .map(
              (p) => `<div style="font-size:12px;color:${COLORS.muted};padding:3px 0">
                <a href="${p.url}" style="color:${COLORS.yellow};text-decoration:none">${p.title}</a>
                <span> · ${p.repo}</span>
              </div>`,
            )
            .join('')}
        </div>`
      : '';

  const activeReposHtml =
    a.activeRepos.length > 0
      ? `<div style="margin-top:14px">
          <div style="font-size:11px;letter-spacing:0.1em;text-transform:uppercase;color:${COLORS.muted};margin-bottom:8px">Most Active This Week</div>
          ${a.activeRepos
            .map((r) => pill(r, COLORS.accent) + `<span style="font-size:12px;color:${COLORS.muted}"> ${a.weeklyCommitsByRepo[r] ?? 0} commits</span>&nbsp;`)
            .join('')}
        </div>`
      : '';

  return section('GitHub Pulse', '💻', statsRow + commitsHtml + renovateHtml + activeReposHtml);
}

function buildHealthSection(h: HealthRollup): string {
  const overallColor =
    h.downCount > 0 ? COLORS.red : h.degradedCount > 0 ? COLORS.yellow : COLORS.green;
  const overallLabel = h.downCount > 0 ? 'Issues Detected' : h.degradedCount > 0 ? 'Degraded' : 'All Systems Healthy';

  const body = `
    <div style="margin-bottom:16px">
      ${pill(overallLabel, overallColor)}
      <span style="font-size:12px;color:${COLORS.muted};margin-left:8px">${h.healthyCount}/${h.statuses.length} workers healthy</span>
    </div>
    ${h.statuses
      .map(
        (s) => `<div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid ${COLORS.border};font-size:13px">
          <span style="color:${COLORS.text}">${s.name}</span>
          <span>
            ${pill(s.status, s.status === 'healthy' ? COLORS.green : s.status === 'degraded' ? COLORS.yellow : COLORS.red)}
            ${s.latencyMs !== null ? `<span style="font-size:11px;color:${COLORS.muted}">${s.latencyMs}ms</span>` : ''}
          </span>
        </div>`,
      )
      .join('')}`;

  return section('Worker Health', '🚦', body);
}

function buildInsightsSection(insights: BriefInsights, audioUrl: string | null): string {
  const audioHtml = audioUrl
    ? `<div style="
        background:${COLORS.accent}15;
        border:1px solid ${COLORS.accent}44;
        border-radius:10px;
        padding:16px 20px;
        margin-bottom:20px;
        text-align:center;
      ">
        <div style="font-size:12px;color:${COLORS.accentLight};margin-bottom:10px;letter-spacing:0.1em;text-transform:uppercase">🎧 Listen to Today's Brief</div>
        <a href="${audioUrl}" style="
          display:inline-block;
          background:${COLORS.accent};
          color:white;
          text-decoration:none;
          padding:10px 24px;
          border-radius:100px;
          font-size:13px;
          font-weight:600;
        ">▶ Play Narration</a>
      </div>`
    : '';

  const winHtml = insights.winOfTheDay
    ? `<div style="
        background:#4ade8015;
        border:1px solid #4ade8044;
        border-radius:10px;
        padding:14px 18px;
        margin-bottom:18px;
        font-size:14px;
        color:${COLORS.green};
        font-weight:500;
      ">🏆 ${insights.winOfTheDay}</div>`
    : '';

  const narrationHtml = `<div style="
    font-size:14px;
    line-height:1.75;
    color:${COLORS.text};
    white-space:pre-wrap;
    margin-bottom:20px;
  ">${insights.narration.replace(/\n/g, '<br/>')}</div>`;

  const horizonsHtml = `
    <div style="margin-bottom:20px">
      <div style="font-size:11px;letter-spacing:0.1em;text-transform:uppercase;color:${COLORS.muted};margin-bottom:12px">Time Horizons</div>
      ${[
        { label: '24 Hours', val: insights.timePerspectives.day, color: COLORS.blue },
        { label: 'This Week', val: insights.timePerspectives.week, color: COLORS.accent },
        { label: 'This Month', val: insights.timePerspectives.month, color: COLORS.accentLight },
        { label: 'This Year', val: insights.timePerspectives.year, color: COLORS.yellow },
      ]
        .filter((h) => h.val)
        .map(
          ({ label, val, color }) => `<div style="padding:10px 0;border-bottom:1px solid ${COLORS.border}">
            <span style="font-size:11px;font-weight:600;color:${color}">${label}</span>
            <div style="font-size:13px;color:${COLORS.text};margin-top:4px;line-height:1.5">${val}</div>
          </div>`,
        )
        .join('')}
    </div>`;

  const focusHtml =
    insights.todaysFocus.length > 0
      ? `<div>
          <div style="font-size:11px;letter-spacing:0.1em;text-transform:uppercase;color:${COLORS.muted};margin-bottom:10px">Today's Focus</div>
          ${insights.todaysFocus
            .map(
              (f, i) => `<div style="display:flex;align-items:flex-start;gap:12px;padding:10px 0;border-bottom:1px solid ${COLORS.border}">
                <span style="
                  display:inline-flex;align-items:center;justify-content:center;
                  width:22px;height:22px;border-radius:50%;
                  background:${COLORS.accent};color:white;
                  font-size:11px;font-weight:700;flex-shrink:0;
                ">${i + 1}</span>
                <span style="font-size:13px;color:${COLORS.text};line-height:1.5">${f}</span>
              </div>`,
            )
            .join('')}
        </div>`
      : '';

  return section(
    "Morgan's Take — PM Perspective",
    '🤓',
    audioHtml + winHtml + narrationHtml + horizonsHtml + focusHtml,
  );
}

export function buildEmailHtml(input: EmailInput): string {
  const weatherHtml = input.weather ? buildWeatherSection(input.weather) : '';
  const newsHtml = input.news ? buildNewsSection(input.news) : '';
  const githubHtml = input.activity ? buildGithubSection(input.activity) : '';
  const healthHtml = input.health ? buildHealthSection(input.health) : '';
  const insightsHtml = buildInsightsSection(input.insights, input.audioUrl);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <meta name="color-scheme" content="dark"/>
  <title>Daily Brief — ${input.dateLabel}</title>
</head>
<body style="
  margin:0;padding:0;
  background:${COLORS.bg};
  font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,Arial,sans-serif;
  color:${COLORS.text};
  -webkit-font-smoothing:antialiased;
">
  <div style="max-width:680px;margin:0 auto;padding:32px 16px 48px">

    <!-- Header -->
    <div style="text-align:center;margin-bottom:32px">
      <div style="font-size:11px;letter-spacing:0.2em;text-transform:uppercase;color:${COLORS.muted};margin-bottom:8px">Daily Brief</div>
      <h1 style="margin:0;font-size:24px;font-weight:700;color:${COLORS.text}">${input.dateLabel}</h1>
      <div style="width:40px;height:2px;background:${COLORS.accent};margin:12px auto 0"></div>
    </div>

    ${weatherHtml}
    ${insightsHtml}
    ${githubHtml}
    ${healthHtml}
    ${newsHtml}

    <!-- Footer -->
    <div style="text-align:center;margin-top:32px;font-size:11px;color:${COLORS.muted}">
      <div>Sent by Factory Daily Brief · Cloudflare Workers</div>
      <div style="margin-top:4px">Built by the one and only you.</div>
    </div>
  </div>
</body>
</html>`;
}
