#!/usr/bin/env node
// =============================================================================
// canary-watch.mjs — single-run 5-minute post-deploy watcher.
//
// Triggered by .github/workflows/_canary-watch.yml after every prod Worker
// deploy. Runs as one workflow job (NOT 5 cron jobs) to keep cost low and
// state coherent.
//
// Decision flow:
//   1. Establish Sentry baseline = events/min over the hour BEFORE deploy
//      (excluding the new release tag, so deploy errors don't pollute it).
//   2. Loop every POLL_INTERVAL_SECONDS until WATCH_SECONDS elapsed:
//        a. Probe BASE_URL+SMOKE_PATH (synthetic smoke). 1 fail allowed.
//        b. Query Sentry stats for the new release: events/min in window.
//        c. If smoke fails twice OR events/min > baseline * MULTIPLIER:
//             - Cross-check sibling Sentry projects for same top-fingerprint.
//             - If >=2 siblings hot on the same fingerprint → declare
//               UPSTREAM, skip rollback, open advisory issue, exit 0.
//             - Else → break the loop and trigger ROLLBACK path.
//   3. Rollback path:
//        a. If HAS_MIGRATIONS=true → DO NOT roll back. Page human (P0),
//           open incident issue tagged `needs-human-rollback`, exit 1.
//        b. Else → `wrangler versions deploy $PREVIOUS_VERSION_ID@100%`.
//             - Success → open incident issue, page Pushover priority=1.
//             - Failure → page Pushover priority=2 (emergency), open issue
//               tagged `rollback-failed`, exit 1.
//
// All external IO via fetch + child_process; no SDKs (CI hermeticity).
// =============================================================================

import { spawnSync } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const env = (k, dflt) => {
  const v = process.env[k];
  if (v === undefined || v === '') {
    if (dflt !== undefined) return dflt;
    throw new Error(`Missing required env: ${k}`);
  }
  return v;
};

const APP_NAME              = env('APP_NAME');
const WORKER_NAME           = env('WORKER_NAME');
const SENTRY_PROJECT        = env('SENTRY_PROJECT');
const SENTRY_ORG            = env('SENTRY_ORG', 'latimer-woods-tech');
const BASE_URL              = env('BASE_URL').replace(/\/$/, '');
const SMOKE_PATH            = env('SMOKE_PATH', '/healthz');
const PREVIOUS_VERSION_ID   = env('PREVIOUS_VERSION_ID');
const NEW_VERSION_ID        = env('NEW_VERSION_ID');
const COMMIT_SHA            = env('COMMIT_SHA');
const HAS_MIGRATIONS        = env('HAS_MIGRATIONS', 'false') === 'true';
const WATCH_SECONDS         = Number(env('WATCH_SECONDS', '300'));
const POLL_INTERVAL_SECONDS = Number(env('POLL_INTERVAL_SECONDS', '30'));
const ERROR_RATE_MULTIPLIER = Number(env('ERROR_RATE_MULTIPLIER', '5'));
const SIBLINGS              = env('SIBLING_SENTRY_PROJECTS', '')
  .split(',').map(s => s.trim()).filter(s => s && s !== SENTRY_PROJECT);

const SENTRY_TOKEN          = env('SENTRY_AUTH_TOKEN');
const CF_TOKEN              = env('CLOUDFLARE_API_TOKEN');
const CF_ACCOUNT            = env('CLOUDFLARE_ACCOUNT_ID');
const PUSHOVER_USER         = env('PUSHOVER_USER_KEY', '');
const PUSHOVER_APP          = env('PUSHOVER_APP_TOKEN', '');
const GH_TOKEN              = env('GH_TOKEN');
const REPO                  = env('GITHUB_REPOSITORY');
const RUN_URL               = `${env('GITHUB_SERVER_URL')}/${REPO}/actions/runs/${env('GITHUB_RUN_ID')}`;
const COMMIT_URL            = `https://github.com/${REPO}/commit/${COMMIT_SHA}`;

// ---- Sentry helpers ---------------------------------------------------------

const sentryFetch = async (path, params = {}) => {
  const url = new URL(`https://sentry.io/api/0${path}`);
  for (const [k, v] of Object.entries(params)) {
    if (Array.isArray(v)) v.forEach(x => url.searchParams.append(k, x));
    else url.searchParams.set(k, v);
  }
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${SENTRY_TOKEN}` },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Sentry ${res.status} ${url.pathname}: ${body.slice(0, 300)}`);
  }
  return res.json();
};

// Events per minute for `project` over [start, end), optionally filtered by release.
const eventsPerMinute = async (project, startIso, endIso, release) => {
  const query = release ? `release:${release}` : '';
  const data = await sentryFetch(`/organizations/${SENTRY_ORG}/events-stats/`, {
    project,
    start: startIso,
    end: endIso,
    interval: '1m',
    yAxis: 'count()',
    query,
    environment: 'production',
  });
  // events-stats returns { data: [[ts, [{count: n}]], ...] }
  const series = data?.data ?? [];
  const total = series.reduce((s, [, [{ count = 0 } = {}] = [{}]]) => s + count, 0);
  const minutes = Math.max(1, series.length);
  return total / minutes;
};

const topFingerprint = async (project, startIso, endIso, release) => {
  const data = await sentryFetch(`/organizations/${SENTRY_ORG}/issues/`, {
    project,
    statsPeriod: '',
    start: startIso,
    end: endIso,
    query: `release:${release} is:unresolved`,
    sort: 'freq',
    limit: 1,
    environment: 'production',
  }).catch(() => []);
  return Array.isArray(data) && data[0]?.id ? { id: data[0].id, title: data[0].title } : null;
};

// ---- Synthetic smoke --------------------------------------------------------

const smokeProbe = async () => {
  const url = `${BASE_URL}${SMOKE_PATH}`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    return { ok: res.ok, status: res.status };
  } catch (err) {
    return { ok: false, status: 0, error: String(err) };
  }
};

// ---- Pushover ---------------------------------------------------------------

const pushover = async ({ title, message, priority = 1 }) => {
  if (!PUSHOVER_USER || !PUSHOVER_APP) {
    console.warn('Pushover not configured; skipping notification.');
    return;
  }

  const body = new URLSearchParams({
    token: PUSHOVER_APP,
    user: PUSHOVER_USER,
    title,
    message,
    priority: String(priority),
    url: RUN_URL,
    url_title: 'Open workflow run',
  });
  // priority=2 (emergency) requires retry+expire
  if (priority === 2) {
    body.set('retry', '60');
    body.set('expire', '3600');
  }
  const res = await fetch('https://api.pushover.net/1/messages.json', {
    method: 'POST', body,
  });
  if (!res.ok) console.error('Pushover failed:', res.status, await res.text());
};

// ---- GitHub issue -----------------------------------------------------------

const ghCreateIssue = async ({ title, body, labels }) => {
  const r = spawnSync('gh', [
    'api', `repos/Latimer-Woods-Tech/factory/issues`,
    '-f', `title=${title}`,
    '-f', `body=${body}`,
    ...labels.flatMap(l => ['-f', `labels[]=${l}`]),
  ], { env: { ...process.env, GH_TOKEN }, encoding: 'utf8' });
  if (r.status !== 0) {
    console.error('gh api failed:', r.stderr);
    return null;
  }
  try { return JSON.parse(r.stdout); } catch { return null; }
};

// ---- Wrangler rollback ------------------------------------------------------

const rollback = () => {
  console.log(`Rolling back ${WORKER_NAME} to ${PREVIOUS_VERSION_ID}…`);
  const r = spawnSync('npx', [
    '-y', 'wrangler@latest', 'versions', 'deploy',
    `${PREVIOUS_VERSION_ID}@100%`,
    '--name', WORKER_NAME,
    '--message', `canary rollback to ${PREVIOUS_VERSION_ID}`,
    '--yes',
  ], {
    env: {
      ...process.env,
      CLOUDFLARE_API_TOKEN: CF_TOKEN,
      CLOUDFLARE_ACCOUNT_ID: CF_ACCOUNT,
    },
    stdio: 'inherit',
  });
  return r.status === 0;
};

// ---- Main loop --------------------------------------------------------------

const nowIso = () => new Date().toISOString();
const minutesAgoIso = (m) => new Date(Date.now() - m * 60_000).toISOString();

const main = async () => {
  console.log(`canary-watch: app=${APP_NAME} version=${NEW_VERSION_ID} watch=${WATCH_SECONDS}s`);

  // 1. Baseline from the hour preceding this run.
  const baselineEnd   = nowIso();
  const baselineStart = minutesAgoIso(60);
  let baseline = 0;
  try {
    baseline = await eventsPerMinute(SENTRY_PROJECT, baselineStart, baselineEnd, undefined);
    console.log(`Baseline events/min (last 60m, project=${SENTRY_PROJECT}): ${baseline.toFixed(3)}`);
  } catch (err) {
    console.error('Baseline query failed; defaulting to 0.1:', err.message);
    baseline = 0.1;
  }
  // Floor the threshold so a project with ~0 baseline still requires real volume.
  const threshold = Math.max(baseline * ERROR_RATE_MULTIPLIER, 1.0);
  console.log(`Trigger threshold: > ${threshold.toFixed(3)} events/min`);

  const deadline = Date.now() + WATCH_SECONDS * 1000;
  let smokeFailures = 0;
  let trigger = null; // { reason, detail, sinceIso }
  const watchStart = nowIso();

  while (Date.now() < deadline) {
    const cycleStart = Date.now();

    // (a) smoke
    const smoke = await smokeProbe();
    if (!smoke.ok) {
      smokeFailures += 1;
      console.log(`smoke FAIL (${smokeFailures}): status=${smoke.status} ${smoke.error ?? ''}`);
      if (smokeFailures >= 2) {
        trigger = { reason: 'smoke', detail: `Synthetic smoke ${SMOKE_PATH} failed ${smokeFailures}x (last status=${smoke.status})`, sinceIso: watchStart };
        break;
      }
    } else {
      smokeFailures = 0;
    }

    // (b) Sentry rate for new release
    try {
      const rate = await eventsPerMinute(SENTRY_PROJECT, watchStart, nowIso(), NEW_VERSION_ID);
      console.log(`sentry rate (release=${NEW_VERSION_ID}): ${rate.toFixed(3)}/min (threshold ${threshold.toFixed(3)})`);
      if (rate > threshold) {
        trigger = { reason: 'sentry', detail: `Error rate ${rate.toFixed(2)}/min > baseline*${ERROR_RATE_MULTIPLIER} (${threshold.toFixed(2)})`, sinceIso: watchStart };
        break;
      }
    } catch (err) {
      console.error('Sentry poll failed (continuing):', err.message);
    }

    const elapsed = Date.now() - cycleStart;
    const wait = Math.max(0, POLL_INTERVAL_SECONDS * 1000 - elapsed);
    if (Date.now() + wait >= deadline) break;
    await sleep(wait);
  }

  if (!trigger) {
    console.log('✓ Canary clean. No rollback needed.');
    return;
  }

  console.log(`⚠ Trigger: ${trigger.reason} — ${trigger.detail}`);

  // 2. Upstream check — same top fingerprint hot on >=2 sibling prod projects?
  let upstreamHit = 0;
  let upstreamFp = null;
  try {
    const fp = await topFingerprint(SENTRY_PROJECT, trigger.sinceIso, nowIso(), NEW_VERSION_ID);
    if (fp) {
      upstreamFp = fp;
      for (const sib of SIBLINGS) {
        const sibTop = await topFingerprint(sib, trigger.sinceIso, nowIso(), undefined);
        if (sibTop && sibTop.title === fp.title) {
          upstreamHit += 1;
          console.log(`upstream signal: ${sib} also showing "${fp.title}"`);
        }
      }
    }
  } catch (err) {
    console.error('Upstream check failed (continuing to rollback):', err.message);
  }

  if (upstreamHit >= 2) {
    const title = `[${APP_NAME}] Skipping auto-rollback — likely upstream incident`;
    const body = [
      `**App:** \`${APP_NAME}\` (worker \`${WORKER_NAME}\`)`,
      `**Trigger:** ${trigger.detail}`,
      `**Top error:** ${upstreamFp?.title ?? 'unknown'}`,
      `**Sibling projects affected:** ${upstreamHit + 1} (incl. self) — treating as upstream.`,
      `**Bad commit:** ${COMMIT_URL}`,
      `**Run:** ${RUN_URL}`,
      ``,
      `Rollback was **skipped**. Investigate Stripe / Neon / Cloudflare status pages.`,
    ].join('\n');
    await ghCreateIssue({ title, body, labels: ['priority:P1', 'status:incident', 'upstream-suspected', `app:${APP_NAME}`] });
    await pushover({
      title: `⚠ ${APP_NAME}: canary tripped, rollback skipped (upstream?)`,
      message: trigger.detail,
      priority: 1,
    });
    return;
  }

  // 3. Migration safety — never auto-rollback a deploy that ran migrations.
  if (HAS_MIGRATIONS) {
    const title = `[${APP_NAME}] P0: canary tripped, deploy included migrations — HUMAN ROLLBACK REQUIRED`;
    const body = [
      `**App:** \`${APP_NAME}\` (worker \`${WORKER_NAME}\`)`,
      `**Trigger:** ${trigger.detail}`,
      `**Bad commit:** ${COMMIT_URL}`,
      `**Previous worker version:** \`${PREVIOUS_VERSION_ID}\``,
      `**Run:** ${RUN_URL}`,
      ``,
      `Auto-rollback was **skipped** because this deploy included database migrations.`,
      `See \`docs/runbooks/DEPLOY_ROLLBACK.md\` § "Deploy with migrations".`,
    ].join('\n');
    await ghCreateIssue({ title, body, labels: ['priority:P0', 'status:incident', 'needs-human-rollback', `app:${APP_NAME}`] });
    await pushover({
      title: `🚨 ${APP_NAME}: canary tripped + migrations — human rollback`,
      message: trigger.detail,
      priority: 2,
    });
    process.exit(1);
  }

  // 4. Auto-rollback.
  const ok = rollback();
  if (ok) {
    const title = `[${APP_NAME}] P0 incident: auto-rolled back to ${PREVIOUS_VERSION_ID}`;
    const body = [
      `**App:** \`${APP_NAME}\` (worker \`${WORKER_NAME}\`)`,
      `**Trigger:** ${trigger.detail}`,
      `**Bad commit:** ${COMMIT_URL}`,
      `**Rolled back to:** \`${PREVIOUS_VERSION_ID}\``,
      `**Run:** ${RUN_URL}`,
      ``,
      `Production traffic should now be served by the prior version. Investigate, fix forward, then close.`,
    ].join('\n');
    await ghCreateIssue({ title, body, labels: ['priority:P0', 'status:incident', 'auto-rolled-back', `app:${APP_NAME}`] });
    await pushover({
      title: `🚨 ${APP_NAME}: rolled back to ${PREVIOUS_VERSION_ID}`,
      message: trigger.detail,
      priority: 1,
    });
    process.exit(1);
  }

  // 5. Rollback failed → emergency page.
  const title = `[${APP_NAME}] P0: AUTO-ROLLBACK FAILED — manual intervention required`;
  const body = [
    `**App:** \`${APP_NAME}\` (worker \`${WORKER_NAME}\`)`,
    `**Trigger:** ${trigger.detail}`,
    `**Bad commit:** ${COMMIT_URL}`,
    `**Attempted rollback to:** \`${PREVIOUS_VERSION_ID}\` — FAILED.`,
    `**Run:** ${RUN_URL}`,
    ``,
    `Run \`wrangler versions list --name ${WORKER_NAME}\` and roll back manually.`,
    `See \`docs/runbooks/DEPLOY_ROLLBACK.md\` § "Manual rollback".`,
  ].join('\n');
  await ghCreateIssue({ title, body, labels: ['priority:P0', 'status:incident', 'rollback-failed', `app:${APP_NAME}`] });
  await pushover({
    title: `🚨🚨 ${APP_NAME}: ROLLBACK FAILED — page on-call`,
    message: trigger.detail,
    priority: 2,
  });
  process.exit(1);
};

main().catch(async (err) => {
  console.error('canary-watch fatal:', err);
  await pushover({
    title: `⚠ ${APP_NAME}: canary-watch crashed`,
    message: String(err).slice(0, 500),
    priority: 1,
  }).catch(() => {});
  process.exit(1);
});
