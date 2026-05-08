/**
 * Factory Digest — HTML email + plain-text renderers.
 *
 * Color coding:
 *   green  — everything healthy / no issues
 *   yellow — minor delta / worth watching
 *   red    — errors present / significant drop
 *
 * Plain-text summary is kept to ≤500 words for ElevenLabs TTS.
 */

import type {
  DigestData,
} from './collect.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

const COLORS = {
  green: '#16a34a',
  yellow: '#ca8a04',
  red: '#dc2626',
  bg: '#f8fafc',
  card: '#ffffff',
  border: '#e2e8f0',
  text: '#0f172a',
  muted: '#64748b',
  headerBg: '#0f172a',
  headerText: '#f1f5f9',
} as const;

function centsToUsd(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

type TrafficLight = 'green' | 'yellow' | 'red';

function dot(color: TrafficLight): string {
  const hex = COLORS[color];
  return `<span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${hex};margin-right:6px;vertical-align:middle;"></span>`;
}

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── Card primitives ───────────────────────────────────────────────────────────

function card(title: string, body: string): string {
  return `
<div style="background:${COLORS.card};border:1px solid ${COLORS.border};border-radius:8px;padding:20px;margin-bottom:16px;">
  <h2 style="margin:0 0 12px;font-size:16px;font-weight:600;color:${COLORS.text};">${title}</h2>
  ${body}
</div>`;
}

function unavailableCard(source: string, reason: string): string {
  return card(
    `${dot('yellow')}${source}`,
    `<p style="margin:0;font-size:13px;color:${COLORS.muted};">Data unavailable: ${esc(reason)}</p>`,
  );
}

// ── Section renderers ─────────────────────────────────────────────────────────

function renderGitHubSection(gh: DigestData['github']): { html: string; text: string } {
  if (!gh.available) {
    return {
      html: unavailableCard('GitHub', gh.reason),
      text: `GitHub: unavailable (${gh.reason}).`,
    };
  }

  const color: TrafficLight = 'green';
  const prRows = gh.mergedPRs.length > 0
    ? gh.mergedPRs
      .map((pr) =>
        `<tr>
          <td style="padding:4px 8px;color:${COLORS.muted};font-size:12px;">${esc(pr.repo)}</td>
          <td style="padding:4px 8px;"><a href="${esc(pr.url)}" style="color:${COLORS.green};text-decoration:none;">#${pr.number} ${esc(pr.title)}</a></td>
          <td style="padding:4px 8px;color:${COLORS.muted};font-size:12px;">${esc(pr.author)}</td>
        </tr>`)
      .join('')
    : `<tr><td colspan="3" style="padding:4px 8px;color:${COLORS.muted};font-size:12px;">No PRs merged in the last 12 h.</td></tr>`;

  const issueRows = [
    ...gh.openedIssues.map((i) =>
      `<tr>
        <td style="padding:4px 8px;color:${COLORS.yellow};font-size:12px;">opened</td>
        <td style="padding:4px 8px;"><a href="${esc(i.url)}" style="color:${COLORS.text};text-decoration:none;">#${i.number} ${esc(i.title)}</a></td>
        <td style="padding:4px 8px;color:${COLORS.muted};font-size:12px;">${esc(i.repo)}</td>
      </tr>`),
    ...gh.closedIssues.map((i) =>
      `<tr>
        <td style="padding:4px 8px;color:${COLORS.green};font-size:12px;">closed</td>
        <td style="padding:4px 8px;"><a href="${esc(i.url)}" style="color:${COLORS.text};text-decoration:none;">#${i.number} ${esc(i.title)}</a></td>
        <td style="padding:4px 8px;color:${COLORS.muted};font-size:12px;">${esc(i.repo)}</td>
      </tr>`),
  ].join('') || `<tr><td colspan="3" style="padding:4px 8px;color:${COLORS.muted};font-size:12px;">No issue activity in the last 12 h.</td></tr>`;

  const supRow = gh.supervisorRun
    ? `<tr><td colspan="3" style="padding:4px 8px;color:${COLORS.muted};font-size:12px;font-style:italic;">Supervisor: ${esc(gh.supervisorRun)}</td></tr>`
    : '';

  const html = card(
    `${dot(color)}GitHub`,
    `<p style="margin:0 0 8px;font-size:13px;color:${COLORS.muted};">Pull requests merged (12 h)</p>
     <table width="100%" style="border-collapse:collapse;">${prRows}</table>
     <p style="margin:12px 0 8px;font-size:13px;color:${COLORS.muted};">Issues</p>
     <table width="100%" style="border-collapse:collapse;">${issueRows}${supRow}</table>`,
  );

  const prText = gh.mergedPRs.length > 0
    ? gh.mergedPRs.map((pr) => `  - ${pr.repo} #${pr.number}: ${pr.title}`).join('\n')
    : '  - None.';
  const issueText = (gh.openedIssues.length + gh.closedIssues.length) > 0
    ? [
      ...gh.openedIssues.map((i) => `  - opened #${i.number}: ${i.title} (${i.repo})`),
      ...gh.closedIssues.map((i) => `  - closed #${i.number}: ${i.title} (${i.repo})`),
    ].join('\n')
    : '  - No issue activity.';

  const text = [
    `GitHub (${gh.mergedPRs.length} PRs merged, ${gh.openedIssues.length} issues opened, ${gh.closedIssues.length} closed):`,
    prText,
    'Issues:',
    issueText,
    gh.supervisorRun ? `Supervisor: ${gh.supervisorRun}` : '',
  ].filter(Boolean).join('\n');

  return { html, text };
}

function renderSentrySection(sentry: DigestData['sentry']): { html: string; text: string } {
  if (!sentry.available) {
    return {
      html: unavailableCard('Sentry', sentry.reason),
      text: `Sentry: unavailable (${sentry.reason}).`,
    };
  }

  const color: TrafficLight = sentry.newIssues.length === 0
    ? 'green'
    : sentry.newIssues.some((i) => i.level === 'fatal' || i.level === 'error')
      ? 'red'
      : 'yellow';

  const diff = sentry.totalEvents - sentry.baselineEvents;
  const errorDelta = diff === 0 ? '±0' : diff > 0 ? `+${diff}` : `${diff}`;
  const errorDeltaColor = sentry.totalEvents > sentry.baselineEvents ? COLORS.red : COLORS.green;

  const issueRows = sentry.newIssues.length > 0
    ? sentry.newIssues.map((i) =>
      `<tr>
        <td style="padding:4px 8px;color:${i.level === 'error' || i.level === 'fatal' ? COLORS.red : COLORS.yellow};font-size:12px;">${esc(i.level)}</td>
        <td style="padding:4px 8px;"><a href="${esc(i.url)}" style="color:${COLORS.text};text-decoration:none;">${esc(i.title)}</a></td>
        <td style="padding:4px 8px;color:${COLORS.muted};font-size:12px;">${esc(i.count)} events</td>
      </tr>`).join('')
    : `<tr><td colspan="3" style="padding:4px 8px;color:${COLORS.green};font-size:12px;">No new issues.</td></tr>`;

  const html = card(
    `${dot(color)}Sentry`,
    `<p style="margin:0 0 8px;font-size:13px;">
       Error rate: <strong>${sentry.totalEvents}</strong> events
       <span style="color:${errorDeltaColor};font-size:12px;">(${errorDelta} vs previous 12 h)</span>
     </p>
     <p style="margin:0 0 8px;font-size:13px;color:${COLORS.muted};">New issues (12 h)</p>
     <table width="100%" style="border-collapse:collapse;">${issueRows}</table>`,
  );

  const text = [
    `Sentry: ${sentry.totalEvents} error events (${errorDelta} vs previous 12 h).`,
    sentry.newIssues.length > 0
      ? `New issues:\n${sentry.newIssues.map((i) => `  - [${i.level}] ${i.title} (${i.count} events)`).join('\n')}`
      : '  No new issues.',
  ].join('\n');

  return { html, text };
}

function renderStripeSection(stripe: DigestData['stripe']): { html: string; text: string } {
  if (!stripe.available) {
    return {
      html: unavailableCard('Stripe', stripe.reason),
      text: `Stripe: unavailable (${stripe.reason}).`,
    };
  }

  const mrrDelta = stripe.currentMrr - stripe.previousMrr;
  const mrrColor: TrafficLight = mrrDelta > 0 ? 'green' : mrrDelta < 0 ? 'red' : 'yellow';

  const subRows = stripe.newSubscriptions.length > 0
    ? stripe.newSubscriptions.map((s) =>
      `<tr>
        <td style="padding:4px 8px;color:${COLORS.green};font-size:12px;">new</td>
        <td style="padding:4px 8px;font-size:13px;">${esc(s.plan)}</td>
        <td style="padding:4px 8px;color:${COLORS.muted};font-size:12px;">${centsToUsd(s.amount)}/mo</td>
      </tr>`).join('')
    : '';

  const cancelRows = stripe.cancellations.length > 0
    ? stripe.cancellations.map((s) =>
      `<tr>
        <td style="padding:4px 8px;color:${COLORS.red};font-size:12px;">cancelled</td>
        <td style="padding:4px 8px;font-size:13px;">${esc(s.plan)}</td>
        <td style="padding:4px 8px;color:${COLORS.muted};font-size:12px;">${centsToUsd(s.amount)}/mo</td>
      </tr>`).join('')
    : '';

  const allRows = subRows + cancelRows
    || `<tr><td colspan="3" style="padding:4px 8px;color:${COLORS.muted};font-size:12px;">No subscription changes.</td></tr>`;

  const html = card(
    `${dot(mrrColor)}Stripe`,
    `<p style="margin:0 0 8px;font-size:13px;">
       MRR: <strong>${centsToUsd(stripe.currentMrr)}</strong>
       <span style="color:${COLORS[mrrColor]};font-size:12px;">(${mrrDelta >= 0 ? '+' : ''}${centsToUsd(mrrDelta)} vs 12 h ago)</span>
     </p>
     <table width="100%" style="border-collapse:collapse;">${allRows}</table>`,
  );

  const text = [
    `Stripe: MRR ${centsToUsd(stripe.currentMrr)} (${mrrDelta >= 0 ? '+' : ''}${centsToUsd(mrrDelta)} vs 12 h ago).`,
    stripe.newSubscriptions.length > 0
      ? `New subscriptions:\n${stripe.newSubscriptions.map((s) => `  - ${s.plan} at ${centsToUsd(s.amount)}/mo`).join('\n')}`
      : '  No new subscriptions.',
    stripe.cancellations.length > 0
      ? `Cancellations:\n${stripe.cancellations.map((s) => `  - ${s.plan} at ${centsToUsd(s.amount)}/mo`).join('\n')}`
      : '  No cancellations.',
  ].join('\n');

  return { html, text };
}

// ── Public render functions ───────────────────────────────────────────────────

export interface RenderedDigest {
  subject: string;
  html: string;
  text: string;
}

/**
 * Renders the full digest into an HTML email and a ≤500-word plain-text summary.
 *
 * @param data - Collected digest data.
 * @param audioUrl - Optional URL to the R2-hosted MP3; included as a link if present.
 */
export function renderDigest(data: DigestData, audioUrl?: string): RenderedDigest {
  const now = new Date(data.collectedAt);
  const hour = now.getUTCHours();
  const period = hour < 12 ? 'AM' : 'PM';
  const dateStr = data.collectedAt.slice(0, 10);
  const subject = `Factory Digest — ${dateStr} ${period}`;

  const gh = renderGitHubSection(data.github);
  const sentry = renderSentrySection(data.sentry);
  const stripe = renderStripeSection(data.stripe);

  const audioBlock = audioUrl
    ? `<div style="background:#dbeafe;border:1px solid #93c5fd;border-radius:8px;padding:16px;margin-bottom:16px;text-align:center;">
         <a href="${esc(audioUrl)}" style="color:#1d4ed8;font-weight:600;text-decoration:none;font-size:14px;">
           &#9654; Listen to this digest (MP3)
         </a>
       </div>`
    : '';

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>${esc(subject)}</title>
</head>
<body style="margin:0;padding:0;background:${COLORS.bg};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:${COLORS.text};">
  <div style="max-width:640px;margin:32px auto;padding:0 16px;">

    <!-- Header -->
    <div style="background:${COLORS.headerBg};border-radius:8px 8px 0 0;padding:24px 28px;margin-bottom:16px;">
      <h1 style="margin:0;font-size:20px;color:${COLORS.headerText};font-weight:700;">Factory Digest</h1>
      <p style="margin:4px 0 0;font-size:13px;color:#94a3b8;">${esc(dateStr)} ${period} &middot; Last 12 hours</p>
    </div>

    ${audioBlock}
    ${gh.html}
    ${sentry.html}
    ${stripe.html}

    <!-- Footer -->
    <p style="text-align:center;font-size:11px;color:${COLORS.muted};margin-top:24px;">
      Generated by Factory Admin Studio &middot; ${esc(data.collectedAt)}
    </p>
  </div>
</body>
</html>`;

  const text = [
    subject,
    '='.repeat(subject.length),
    `Period: last ${data.windowHours} hours ending ${data.collectedAt}`,
    '',
    gh.text,
    '',
    sentry.text,
    '',
    stripe.text,
    '',
    audioUrl ? `Listen: ${audioUrl}` : '',
  ].filter((l) => l !== undefined).join('\n');

  return { subject, html, text };
}
