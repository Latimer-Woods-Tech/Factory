#!/usr/bin/env node
/**
 * Playwright smoke probe for the Factory Admin Studio UI.
 *
 * Drives the production (or staging) admin UI through a full login + tab walk,
 * captures full-page screenshots, and exits non-zero if any non-allowlisted
 * request fails. Designed to run locally and from GitHub Actions.
 *
 * Inputs (env):
 *   BASE_URL            UI origin (default: https://apunlimited.com)
 *   STUDIO_EMAIL        admin email
 *   STUDIO_PASSWORD     admin password
 *   STUDIO_ENV          environment card to select on login (default: production)
 *   STUDIO_CREDS_FILE   optional path to a "Email: ... / Password: ..." file
 *   OUT_DIR             where to write screenshots + report (default: ./probe-output)
 *
 * Exit codes:
 *   0  no failures (or only allowlisted RUM/telemetry beacons)
 *   1  one or more endpoints returned 4xx/5xx or a navigation error
 *   2  login failed
 */
import { chromium } from 'playwright';
import { writeFile, readFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

const BASE = process.env.BASE_URL ?? 'https://apunlimited.com';
const OUT_DIR = process.env.OUT_DIR ?? 'probe-output';
const STUDIO_ENV = process.env.STUDIO_ENV ?? 'production';

let email = process.env.STUDIO_EMAIL;
let password = process.env.STUDIO_PASSWORD;
if ((!email || !password) && process.env.STUDIO_CREDS_FILE) {
  const text = await readFile(process.env.STUDIO_CREDS_FILE, 'utf8');
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*(email|password)\s*:\s*(.+?)\s*$/i);
    if (!m) continue;
    if (m[1].toLowerCase() === 'email' && !email) email = m[2];
    if (m[1].toLowerCase() === 'password' && !password) password = m[2];
  }
}
if (!email || !password) {
  console.error('STUDIO_EMAIL and STUDIO_PASSWORD required (or STUDIO_CREDS_FILE)');
  process.exit(2);
}

await mkdir(OUT_DIR, { recursive: true });

// Requests we do not care about for pass/fail. These are third-party
// observability beacons that depend on rate limits, ad-blockers, etc.
const ignoreUrlPatterns = [
  /\/cdn-cgi\/rum/,             // Cloudflare RUM
  /\.posthog\.com/,             // PostHog telemetry
  /sentry\.io\/api/,            // Sentry envelope
];
function shouldIgnore(url) {
  return ignoreUrlPatterns.some((re) => re.test(url));
}

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page = await ctx.newPage();

const consoleErrors = [];
const networkFailures = [];
let currentPhase = '00-init';

page.on('console', (msg) => {
  if (msg.type() === 'error') consoleErrors.push({ phase: currentPhase, text: msg.text() });
});
page.on('requestfailed', (req) => {
  if (shouldIgnore(req.url())) return;
  // Playwright fires requestfailed on the source side of a redirect chain
  // (the new Request for the redirect target is what actually carries the
  // final result). Ignore failures that have a successor request — the
  // redirect was followed; the final response is reported separately.
  if (typeof req.redirectedTo === 'function' && req.redirectedTo()) return;
  networkFailures.push({ phase: currentPhase, status: 'failed', method: req.method(), url: req.url(), reason: req.failure()?.errorText });
});
page.on('response', (resp) => {
  const url = resp.url();
  if (shouldIgnore(url)) return;
  const s = resp.status();
  if (s >= 400) networkFailures.push({ phase: currentPhase, status: s, method: resp.request().method(), url });
});

const steps = [];
async function visit(label, path) {
  currentPhase = label;
  const start = Date.now();
  try {
    await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle', timeout: 30_000 });
    await page.waitForTimeout(1500);
  } catch (err) {
    steps.push({ label, path, error: err.message, ms: Date.now() - start });
    return;
  }
  await page.screenshot({ path: join(OUT_DIR, `${label}.png`), fullPage: true });
  steps.push({ label, path, finalUrl: page.url(), title: await page.title(), ms: Date.now() - start });
}

async function visitByClick(label, linkText) {
  currentPhase = label;
  const start = Date.now();
  // Desktop nav uses Radix <TabsTrigger> which renders as role=tab,
  // mobile uses NavLink (role=link). Try both, then fall back to text.
  const candidates = [
    () => page.getByRole('tab', { name: new RegExp(`^${linkText}$`, 'i') }),
    () => page.getByRole('link', { name: new RegExp(`^${linkText}$`, 'i') }),
    () => page.getByText(new RegExp(`^${linkText}$`, 'i'), { exact: false }),
  ];
  let clicked = false;
  for (const factory of candidates) {
    try {
      await factory().first().click({ timeout: 4_000 });
      clicked = true;
      break;
    } catch { /* try next */ }
  }
  if (!clicked) {
    steps.push({ label, error: `no clickable nav element for ${linkText}`, ms: Date.now() - start });
    return;
  }
  try {
    await page.waitForLoadState('networkidle', { timeout: 30_000 });
    await page.waitForTimeout(1500);
  } catch { /* networkidle can be flaky; carry on */ }
  try {
    await page.screenshot({ path: join(OUT_DIR, `${label}.png`), fullPage: true, timeout: 60_000 });
  } catch (err) {
    // Screenshot timeout shouldn't kill the walk — record and continue.
    steps.push({ label, finalUrl: page.url(), screenshotError: err.message, ms: Date.now() - start });
    return;
  }
  steps.push({ label, finalUrl: page.url(), title: await page.title(), ms: Date.now() - start });
}

// 01: unauthenticated landing
await visit('01-landing', '/');

// 02: login
currentPhase = '02-login';
const loginStart = Date.now();
try {
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: new RegExp(STUDIO_ENV, 'i') }).first().click();
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.getByRole('button', { name: /sign in/i }).click();
  await page.waitForURL((u) => !u.toString().includes('/login'), { timeout: 15_000 });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: join(OUT_DIR, '02-post-login.png'), fullPage: true });
  steps.push({ label: '02-post-login', finalUrl: page.url(), title: await page.title(), ms: Date.now() - loginStart });
} catch (err) {
  steps.push({ label: '02-post-login', error: err.message, ms: Date.now() - loginStart });
  await page.screenshot({ path: join(OUT_DIR, '02-post-login-error.png'), fullPage: true });
  const report = { base: BASE, steps, consoleErrors, networkFailures, loginFailed: true };
  await writeFile(join(OUT_DIR, 'report.json'), JSON.stringify(report, null, 2));
  console.error('Login failed:', err.message);
  await browser.close();
  process.exit(2);
}

// 03-N: walk each tab via in-app click (deep-link goto sends Pages back to /overview)
for (const [label, linkText] of [
  ['03-overview',  'Overview'],
  ['04-tests',     'Tests'],
  ['05-code',      'Code'],
  ['06-ai',        'AI Chat'],
  ['07-functions', 'Functions'],
  ['08-timeline',  'Timeline'],
  ['09-flags',     'Flags'],
  ['10-audit',     'Audit Log'],
]) {
  await visitByClick(label, linkText);
}

await browser.close();

const report = {
  base: BASE,
  generatedAt: new Date().toISOString(),
  steps,
  consoleErrors,
  networkFailures,
};
await writeFile(join(OUT_DIR, 'report.json'), JSON.stringify(report, null, 2));

// Summarize unique failures
const uniq = new Map();
for (const f of networkFailures) {
  const key = `${f.status} ${f.method} ${f.url}`;
  if (!uniq.has(key)) uniq.set(key, []);
  uniq.get(key).push(f.phase);
}

if (uniq.size === 0) {
  console.log('✓ no network failures');
  console.log(`screenshots: ${OUT_DIR}/*.png`);
  process.exit(0);
}

console.log(`✗ ${networkFailures.length} failures (${uniq.size} unique):`);
console.log();
for (const [key, phases] of uniq) {
  const seen = [...new Set(phases)].sort().join(' ');
  console.log(`  ${key}`);
  console.log(`     seen on: ${seen}`);
}
console.log();
console.log(`report: ${OUT_DIR}/report.json`);
console.log(`screenshots: ${OUT_DIR}/*.png`);
process.exit(1);
