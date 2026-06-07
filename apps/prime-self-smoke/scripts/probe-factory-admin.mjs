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
 *   STUDIO_TOKEN        optional pre-minted Studio JWT
 *   STUDIO_EXPIRES_AT   optional epoch-ms expiry for STUDIO_TOKEN
 *   STUDIO_ENV          environment card to select on login (default: production)
 *   STUDIO_CREDS_FILE   optional path to a "Email: ... / Password: ..." file
 *   OUT_DIR             where to write screenshots + report (default: ./probe-output)
 *
 * Exit codes:
 *   0  no failures (or only allowlisted RUM/telemetry beacons)
 *   1  one or more endpoints returned 4xx/5xx or a navigation error
 *   2  auth bootstrap failed (UI/redirect/token-seed failure — investigate the product)
 *   3  login credentials rejected (auth POST returned 401/403 — rotate the
 *      FACTORY_USER / FACTORY_PW secrets; not a product regression)
 */
import { chromium } from 'playwright';
import { writeFile, readFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

const BASE = process.env.BASE_URL ?? 'https://apunlimited.com';
const OUT_DIR = process.env.OUT_DIR ?? 'probe-output';
const STUDIO_ENV = process.env.STUDIO_ENV ?? 'production';
const STUDIO_TOKEN = process.env.STUDIO_TOKEN ?? '';
const STUDIO_EXPIRES_AT = Number.parseInt(process.env.STUDIO_EXPIRES_AT ?? '', 10);

let email = process.env.STUDIO_EMAIL;
let password = process.env.STUDIO_PASSWORD;
if (!STUDIO_TOKEN && (!email || !password) && process.env.STUDIO_CREDS_FILE) {
  const text = await readFile(process.env.STUDIO_CREDS_FILE, 'utf8');
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*(email|password)\s*:\s*(.+?)\s*$/i);
    if (!m) continue;
    if (m[1].toLowerCase() === 'email' && !email) email = m[2];
    if (m[1].toLowerCase() === 'password' && !password) password = m[2];
  }
}
if (!STUDIO_TOKEN && (!email || !password)) {
  console.error('Provide STUDIO_TOKEN or STUDIO_EMAIL/STUDIO_PASSWORD (or STUDIO_CREDS_FILE)');
  process.exit(2);
}

await mkdir(OUT_DIR, { recursive: true });

// Requests we do not care about for pass/fail. These are third-party
// observability beacons that depend on rate limits, ad-blockers, etc.
const ignoreUrlPatterns = [
  /\/cdn-cgi\/rum/,             // Cloudflare RUM
  /\.posthog\.com/,             // PostHog telemetry
  /sentry\.io\/api/,            // Sentry envelope
  /accounts\.google\.com\/gsi/, // Google Identity Services button iframe —
                                // net::ERR_ABORTED when the page navigates away
                                // on a successful email/password login. Third-
                                // party widget; not an admin-studio health signal.
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
// Capture the result of the auth POST so a credential rejection can be
// reported explicitly instead of surfacing only as an opaque waitForURL
// timeout. /auth/login returns 401 ("Invalid credentials") when the
// STUDIO_EMAIL/STUDIO_PASSWORD (FACTORY_USER/FACTORY_PW secrets) do not match
// the worker's bootstrap credentials — that is a secret-rotation problem, not
// a product regression, and the probe should say so.
let authResponse = null;
page.on('response', (resp) => {
  const url = resp.url();
  if (/\/auth\/(login|google)$/.test(new URL(url).pathname)) {
    authResponse = { status: resp.status(), method: resp.request().method(), url };
  }
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

async function exerciseAiChat() {
  currentPhase = '06-ai-chat';
  const start = Date.now();
  const prompt = 'Reply with exactly SMOKE_OK and nothing else.';
  try {
    const composer = page.getByTestId('ai-composer');
    await composer.fill(prompt);
    const responsePromise = page.waitForResponse((resp) => {
      const url = new URL(resp.url());
      return url.pathname === '/ai/chat' && resp.request().method() === 'POST';
    }, { timeout: 30_000 });
    await page.getByRole('button', { name: 'Send' }).click();
    const response = await responsePromise;
    const status = response.status();
    if (status !== 200) {
      steps.push({ label: '06-ai-chat', error: `chat returned HTTP ${status}`, finalUrl: page.url(), ms: Date.now() - start });
      return;
    }

    const assistant = page.locator('[data-chat-role="assistant"]').last();
    await assistant.waitFor({ state: 'visible', timeout: 30_000 });
    await page.waitForFunction(() => {
      const send = document.querySelector('[data-testid="ai-send"]');
      return send instanceof HTMLButtonElement && !send.disabled;
    }, null, { timeout: 30_000 });
    const assistantText = await assistant.textContent();
    const logText = await page.getByTestId('ai-chat-log').textContent();
    if (
      !assistantText?.includes('SMOKE_OK')
      || !logText
      || /stream failed|llm configuration incomplete|not configured/i.test(logText)
    ) {
      steps.push({
        label: '06-ai-chat',
        error: 'chat response did not complete cleanly',
        finalUrl: page.url(),
        assistantText,
        logText,
        ms: Date.now() - start,
      });
      return;
    }

    steps.push({ label: '06-ai-chat', finalUrl: page.url(), status, ms: Date.now() - start });
  } catch (err) {
    steps.push({ label: '06-ai-chat', error: err.message, finalUrl: page.url(), ms: Date.now() - start });
  }
}

// 01: unauthenticated landing
await visit('01-landing', '/');

// 02: login
currentPhase = '02-login';
const loginStart = Date.now();
try {
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  if (STUDIO_TOKEN) {
    const expiresAt = Number.isFinite(STUDIO_EXPIRES_AT) ? STUDIO_EXPIRES_AT : decodeExpiry(STUDIO_TOKEN);
    const user = decodeUser(STUDIO_TOKEN);
    if (!expiresAt || !user) {
      throw new Error('STUDIO_TOKEN missing a usable expiry or user payload');
    }
    await page.evaluate(({ token, env, user, expiresAt: seededExpiry }) => {
      sessionStorage.setItem('studio.session', JSON.stringify({
        token,
        env,
        user,
        expiresAt: seededExpiry,
      }));
    }, { token: STUDIO_TOKEN, env: STUDIO_ENV, user, expiresAt });
    await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
    await page.waitForURL((u) => !u.toString().includes('/login'), { timeout: 15_000 });
  } else {
    await page.getByRole('button', { name: new RegExp(STUDIO_ENV, 'i') }).first().click();
    await page.fill('input[type="email"]', email);
    await page.fill('input[type="password"]', password);
    await page.getByRole('button', { name: /sign in/i }).click();
    await page.waitForURL((u) => !u.toString().includes('/login'), { timeout: 15_000 });
  }
  await page.waitForTimeout(2000);
  await page.screenshot({ path: join(OUT_DIR, '02-post-login.png'), fullPage: true });
  steps.push({ label: '02-post-login', finalUrl: page.url(), title: await page.title(), ms: Date.now() - loginStart });
} catch (err) {
  // Distinguish a credential rejection (the auth POST returned 401/403) from a
  // genuine UI/redirect failure. The former means the FACTORY_USER/FACTORY_PW
  // secrets are stale relative to the worker's bootstrap credentials — the
  // worker, UI, and probe selectors are all healthy. Surfacing this explicitly
  // turns an opaque "waitForURL Timeout 15000ms exceeded" into an actionable
  // signal so triage doesn't have to download artifacts to find the 401.
  const credsRejected = authResponse && (authResponse.status === 401 || authResponse.status === 403);
  steps.push({
    label: '02-post-login',
    error: err.message,
    authResponse,
    credsRejected: Boolean(credsRejected),
    ms: Date.now() - loginStart,
  });
  await page.screenshot({ path: join(OUT_DIR, '02-post-login-error.png'), fullPage: true });
  const report = { base: BASE, steps, consoleErrors, networkFailures, loginFailed: true, authResponse, credsRejected: Boolean(credsRejected) };
  await writeFile(join(OUT_DIR, 'report.json'), JSON.stringify(report, null, 2));
  if (credsRejected) {
    console.error(
      `Login failed: ${BASE} ${authResponse.method} /auth/login returned ${authResponse.status}. ` +
      'The probe credentials were rejected by the worker — this is a SECRET problem, not a product regression. ' +
      'Rotate FACTORY_USER / FACTORY_PW (GitHub Actions secrets) so they match the production worker ' +
      'STUDIO_ADMIN_EMAIL / STUDIO_ADMIN_PASSWORD_SHA256. ' +
      `(underlying error: ${err.message})`,
    );
    await browser.close();
    process.exit(3);
  }
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
  if (label === '06-ai') {
    await exerciseAiChat();
  }
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

function decodeExpiry(token) {
  const payload = decodePayload(token);
  return typeof payload?.exp === 'number' ? payload.exp * 1000 : null;
}

function decodeUser(token) {
  const payload = decodePayload(token);
  if (!payload) return null;
  if (typeof payload.userId !== 'string' || typeof payload.userEmail !== 'string' || typeof payload.role !== 'string') {
    return null;
  }
  return {
    id: payload.userId,
    email: payload.userEmail,
    role: payload.role,
  };
}

function decodePayload(token) {
  try {
    const [, payloadB64] = token.split('.');
    if (!payloadB64) return null;
    const padded = payloadB64.replace(/-/g, '+').replace(/_/g, '/');
    const json = Buffer.from(padded, 'base64').toString('utf8');
    return JSON.parse(json);
  } catch {
    return null;
  }
}
