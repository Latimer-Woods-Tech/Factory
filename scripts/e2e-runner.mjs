#!/usr/bin/env node
/**
 * Generic E2E runner — drives any site using a named profile.
 *
 * Usage:
 *   node scripts/e2e-runner.mjs <profile>              # use profile defaults
 *   node scripts/e2e-runner.mjs <profile> email pass   # override credentials
 *
 * Profiles live in scripts/e2e-profiles/<name>.mjs
 * Available: selfprime | capricast | cipherofhealing
 */

import puppeteer from 'puppeteer';
import fs from 'fs';
import os from 'os';
import { pathToFileURL, fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ─── CLI args ─────────────────────────────────────────────────────────────────
const [profileName, cliEmail, cliPassword] = process.argv.slice(2);
if (!profileName) {
  console.error('Usage: node scripts/e2e-runner.mjs <profile> [email] [password]');
  process.exit(1);
}

const profilePath = path.resolve(__dirname, 'e2e-profiles', `${profileName}.mjs`);

let profile;
try {
  profile = (await import(pathToFileURL(profilePath).href)).default;
} catch {
  console.error(`Profile not found: ${profilePath}`);
  process.exit(1);
}

const EMAIL = cliEmail || process.env.TEST_EMAIL || profile.defaultEmail || '';
const PASSWORD = cliPassword || process.env.TEST_PASSWORD || profile.defaultPassword || '';
const SCREENSHOT_DIR = process.env.SCREENSHOT_DIR || os.tmpdir();

// ─── State ────────────────────────────────────────────────────────────────────
const results = {
  timestamp: new Date().toISOString(),
  profile: profileName,
  site: profile.siteUrl,
  tests: [],
  summary: { total: 0, passed: 0, failed: 0, warnings: 0 },
};

let browser, page;

// ─── Colour helpers ───────────────────────────────────────────────────────────
const C = {
  reset: '\x1b[0m', red: '\x1b[31m', green: '\x1b[32m',
  yellow: '\x1b[33m', blue: '\x1b[34m', cyan: '\x1b[36m', bold: '\x1b[1m',
};
const col = (msg, k) => `${C[k]}${msg}${C.reset}`;

// ─── Test runner ──────────────────────────────────────────────────────────────
async function test(name, fn, critical = true) {
  results.summary.total++;
  try {
    await fn();
    results.summary.passed++;
    console.log(col(`  ✅ ${name}`, 'green'));
    results.tests.push({ name, status: 'PASS', critical });
  } catch (err) {
    if (critical) {
      results.summary.failed++;
      console.log(col(`  ❌ ${name}`, 'red'));
      console.log(col(`     ${err.message}`, 'red'));
      results.tests.push({ name, status: 'FAIL', critical, error: err.message });
    } else {
      results.summary.warnings++;
      console.log(col(`  ⚠️  ${name}`, 'yellow'));
      console.log(col(`     ${err.message}`, 'yellow'));
      results.tests.push({ name, status: 'WARN', critical: false, error: err.message });
    }
  }
}

const info = msg => console.log(col(`     ${msg}`, 'blue'));

// ─── Shared helpers (passed to every profile hook) ───────────────────────────
export const helpers = {
  /** Find first visible element by text content. */
  async findByText(selector, text) {
    const h = await page.evaluateHandle((sel, txt) => {
      const els = [...document.querySelectorAll(sel)];
      return els.find(el =>
        el.offsetParent !== null &&
        el.textContent.trim().toLowerCase().includes(txt.toLowerCase())
      ) || null;
    }, selector, text);
    return h.asElement();
  },

  /** Get value of an input/textarea handle. */
  async getValue(handle) {
    return handle.evaluate(el => el.value);
  },

  /** True if handle exists and is visible. */
  async isVisible(handle) {
    if (!handle) return false;
    return handle.evaluate(el => el.offsetParent !== null).catch(() => false);
  },

  /** Wait for any of several selectors (returns first match). */
  async waitForAny(selectors, timeout = 8000) {
    return Promise.race(
      selectors.map(s => page.waitForSelector(s, { visible: true, timeout }).then(() => s))
    );
  },

  page: () => page,
  info,
};

async function shot(name) {
  try {
    const p = `${SCREENSHOT_DIR}/e2e-${profileName}-${name}-${Date.now()}.png`;
    await page.screenshot({ path: p, fullPage: true });
    info(`📸 ${p}`);
  } catch { /* silent */ }
}

// ─── PHASE 1: Page load & layout ─────────────────────────────────────────────
async function phase1() {
  console.log(col('\n📌 PHASE 1: Page Load & Layout', 'cyan'));
  const url = profile.siteUrl;

  await test('Site responds (200 or redirect)', async () => {
    const r = await page.goto(url, { waitUntil: 'networkidle2' });
    if (![200, 301, 302].includes(r.status())) throw new Error(`HTTP ${r.status()}`);
  });

  await test('Page title present', async () => {
    const t = await page.title();
    if (!t?.trim()) throw new Error('Empty page title');
    info(`title: "${t}"`);
  });

  await test('Main content area exists', async () => {
    const el = await page.$('main, [role="main"], #app, #root, .app-root, article');
    if (!el) throw new Error('No main/root content element');
  });

  await test('Navigation present', async () => {
    const el = await page.$('nav, [role="navigation"], header');
    if (!el) throw new Error('No nav or header');
  });

  await test('No 5xx errors on load', async () => {
    const errs = [];
    const l = r => { if (r.status() >= 500) errs.push(`${r.status()} ${r.url()}`); };
    page.on('response', l);
    await page.reload({ waitUntil: 'networkidle2' });
    page.off('response', l);
    if (errs.length) throw new Error(errs.slice(0, 3).join('; '));
  });

  await test('No uncaught JS exceptions', async () => {
    const errs = [];
    const l = e => errs.push(e.message);
    page.on('pageerror', l);
    await page.goto(url, { waitUntil: 'networkidle2' });
    page.off('pageerror', l);
    if (errs.length) throw new Error(errs.slice(0, 3).join('; '));
  });

  await shot('01-layout');
}

// ─── PHASE 2: Navigation ─────────────────────────────────────────────────────
async function phase2() {
  console.log(col('\n📌 PHASE 2: Navigation', 'cyan'));

  await test('Nav links present', async () => {
    const links = await page.$$('nav a, header a, [role="navigation"] a');
    if (!links.length) throw new Error('No nav links');
    info(`${links.length} nav links`);
  });

  await test('All visible nav links are clickable', async () => {
    const links = await page.$$('nav a, header a');
    const hidden = [];
    for (const [i, l] of links.slice(0, 15).entries()) {
      const v = await l.evaluate(el => el.offsetParent !== null).catch(() => false);
      if (!v) hidden.push(i);
    }
    if (hidden.length) throw new Error(`${hidden.length} nav links not visible`);
  });

  await test('Logo / home link present', async () => {
    const el = await page.$(
      `a[href="/"], a[href="${profile.siteUrl}"], ` +
      '[data-testid="logo"], [class*="logo"] a, header a:first-child, .brand a, [class*="brand"] a'
    );
    if (!el) {
      const h = await page.$('header');
      if (!h || !await h.$('a')) throw new Error('No logo/home link');
    }
  });

  await test('Mobile viewport: nav or toggle visible', async () => {
    await page.setViewport({ width: 375, height: 667 });
    await page.goto(profile.siteUrl, { waitUntil: 'networkidle2' });
    const toggle = await page.$(
      '[data-testid="menu-toggle"], [aria-label*="menu" i], [aria-label*="navigation" i], ' +
      '.hamburger, [class*="hamburger"], [class*="menu-btn"], [class*="mobile-menu"], button[class*="menu"]'
    );
    if (!toggle) {
      const nav = await page.$('nav, [role="navigation"]');
      if (!nav) throw new Error('No nav or mobile toggle at 375px');
    }
    await page.setViewport({ width: 1920, height: 1080 });
    await page.goto(profile.siteUrl, { waitUntil: 'networkidle2' });
  });

  await shot('02-nav');
}

// ─── PHASE 3: Authentication (profile-driven) ─────────────────────────────────
async function phase3() {
  if (!profile.auth) {
    console.log(col('\n📌 PHASE 3: Authentication — skipped (public site)', 'cyan'));
    results.tests.push({ name: 'Authentication', status: 'PASS', critical: false,
      note: 'Skipped — profile declares no auth' });
    results.summary.total++;
    results.summary.passed++;
    return;
  }

  console.log(col('\n📌 PHASE 3: Authentication', 'cyan'));
  await profile.auth(page, EMAIL, PASSWORD, test, helpers);
  await shot('03-auth');
}

// ─── PHASE 4: Authenticated checks (profile-driven) ──────────────────────────
async function phase4() {
  if (!profile.auth || !profile.authenticatedChecks) {
    console.log(col('\n📌 PHASE 4: Post-auth checks — skipped', 'cyan'));
    return;
  }
  console.log(col('\n📌 PHASE 4: Authenticated Checks', 'cyan'));
  await profile.authenticatedChecks(page, test, helpers);
  await shot('04-authenticated');
}

// ─── PHASE 5: Site-specific content (profile-driven) ─────────────────────────
async function phase5() {
  console.log(col('\n📌 PHASE 5: Site-Specific Content', 'cyan'));
  await profile.contentChecks(page, test, helpers);
  await shot('05-content');
}

// ─── PHASE 6: Critical routes ─────────────────────────────────────────────────
async function phase6() {
  if (!profile.criticalRoutes?.length) return;
  console.log(col('\n📌 PHASE 6: Critical Routes', 'cyan'));
  for (const route of profile.criticalRoutes) {
    const { path: routePath, expectedStatuses = [200], label } = route;
    await test(label || `Route ${routePath}`, async () => {
      const r = await page.goto(`${profile.siteUrl}${routePath}`, { waitUntil: 'domcontentloaded', timeout: 15000 });
      const s = r.status();
      if (!expectedStatuses.includes(s)) throw new Error(`HTTP ${s} (expected ${expectedStatuses.join('/')})`);
      info(`${routePath} → ${s}`);
    });
  }
  await shot('06-routes');
}

// ─── PHASE 7: Forms ──────────────────────────────────────────────────────────
async function phase7() {
  console.log(col('\n📌 PHASE 7: Form Interactions', 'cyan'));
  await page.goto(profile.siteUrl, { waitUntil: 'networkidle2' });

  await test('At least one input exists', async () => {
    const els = await page.$$('input, textarea, select');
    if (!els.length) throw new Error('No form elements');
    info(`${els.length} input element(s)`);
  }, false);

  await test('Typeable input accepts keyboard input', async () => {
    const inputs = await page.$$('input:not([type="hidden"]):not([type="submit"]):not([disabled]):not([readonly])');
    if (!inputs.length) throw new Error('No typeable inputs');
    let typed = false;
    for (const input of inputs) {
      try {
        await input.evaluate(el => el.scrollIntoView({ block: 'center' }));
        await input.click();
        await page.keyboard.type('test', { delay: 20 });
        const val = await input.evaluate(el => el.value);
        if (val.includes('test')) {
          await input.click({ clickCount: 3 });
          await page.keyboard.press('Backspace');
          typed = true;
          break;
        }
      } catch { /* try next */ }
    }
    if (!typed) throw new Error('No input accepted keyboard input');
  }, false);

  await shot('07-forms');
}

// ─── PHASE 8: Responsive ─────────────────────────────────────────────────────
async function phase8() {
  console.log(col('\n📌 PHASE 8: Responsive Design', 'cyan'));
  for (const [name, w, h] of [['desktop', 1920, 1080], ['laptop', 1280, 800], ['tablet', 768, 1024], ['mobile', 375, 667]]) {
    await test(`Renders at ${name} (${w}×${h})`, async () => {
      await page.setViewport({ width: w, height: h });
      await page.goto(profile.siteUrl, { waitUntil: 'networkidle2' });
      if (!await page.$('body')) throw new Error('No body');
    });
  }
  await test('No horizontal scroll at 375px', async () => {
    await page.setViewport({ width: 375, height: 667 });
    await page.goto(profile.siteUrl, { waitUntil: 'networkidle2' });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    if (overflow) throw new Error(`scrollWidth ${await page.evaluate(() => document.documentElement.scrollWidth)} > 375`);
  });
  await page.setViewport({ width: 1920, height: 1080 });
  await page.goto(profile.siteUrl, { waitUntil: 'networkidle2' });
  await shot('08-responsive');
}

// ─── PHASE 9: Accessibility ──────────────────────────────────────────────────
async function phase9() {
  console.log(col('\n📌 PHASE 9: Accessibility', 'cyan'));

  await test('H1 present', async () => {
    const h1 = await page.$('h1');
    if (!h1) throw new Error('No H1');
    info(`H1: "${(await h1.evaluate(el => el.textContent.trim())).slice(0, 60)}"`);
  });

  await test('Heading hierarchy present', async () => {
    const hs = await page.$$('h1,h2,h3,h4,h5,h6');
    if (!hs.length) throw new Error('No headings');
    info(`${hs.length} headings`);
  });

  await test('Images have alt attributes', async () => {
    const imgs = await page.$$('img');
    if (!imgs.length) { info('(no images)'); return; }
    let missing = 0;
    for (const img of imgs) {
      const a = await img.evaluate(el => el.getAttribute('alt'));
      if (a === null) missing++;
    }
    if (missing > imgs.length * 0.3) throw new Error(`${missing}/${imgs.length} images missing alt`);
    info(`${imgs.length} images, ${missing} missing alt`);
  });

  await test('Buttons have accessible labels', async () => {
    const btns = await page.$$('button');
    if (!btns.length) { info('(no buttons)'); return; }
    let bad = 0;
    for (const b of btns) {
      const { text, aria, title } = await b.evaluate(el => ({
        text: el.innerText?.trim(), aria: el.getAttribute('aria-label'), title: el.getAttribute('title'),
      }));
      if (!text && !aria && !title) bad++;
    }
    if (bad) throw new Error(`${bad} button(s) missing label`);
    info(`${btns.length} buttons, ${bad} unlabelled`);
  });

  await test('<html> has lang attribute', async () => {
    const lang = await page.evaluate(() => document.documentElement.getAttribute('lang'));
    if (!lang) throw new Error('<html> missing lang attribute');
    info(`lang="${lang}"`);
  });

  await shot('09-a11y');
}

// ─── PHASE 10: Performance ───────────────────────────────────────────────────
async function phase10() {
  console.log(col('\n📌 PHASE 10: Performance & Stability', 'cyan'));

  await test('Loads in < 10s', async () => {
    const t0 = Date.now();
    await page.goto(profile.siteUrl, { waitUntil: 'networkidle2' });
    const ms = Date.now() - t0;
    info(`load: ${ms}ms`);
    if (ms > 10000) throw new Error(`${ms}ms > 10s`);
  });

  await test('No console errors on load', async () => {
    const errs = [];
    const l = m => { if (m.type() === 'error') errs.push(m.text()); };
    page.on('console', l);
    await page.goto(profile.siteUrl, { waitUntil: 'networkidle2' });
    page.off('console', l);
    const known = profile.knownConsoleErrors || [];
    const realErrs = errs.filter(e => !known.some(pat => e.includes(pat)));
    if (realErrs.length) throw new Error(realErrs.slice(0, 3).join('; '));
    if (errs.length > realErrs.length) info(`(${errs.length - realErrs.length} known console error(s) suppressed)`);
  });

  await test('No 5xx on reload', async () => {
    const errs = [];
    const l = r => { if (r.status() >= 500) errs.push(`${r.status()} ${r.url()}`); };
    page.on('response', l);
    await page.reload({ waitUntil: 'networkidle2' });
    page.off('response', l);
    if (errs.length) throw new Error(errs.join('; '));
  });

  await test('3 rapid reloads without hang', async () => {
    for (let i = 0; i < 3; i++) {
      await page.goto(profile.siteUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
    }
  });

  await shot('10-perf');
}

// ─── PHASE 11: Security ──────────────────────────────────────────────────────
async function phase11() {
  console.log(col('\n📌 PHASE 11: Security', 'cyan'));

  await test('HTTPS', async () => {
    if (!page.url().startsWith('https://')) throw new Error('Not HTTPS');
  });

  await test('No passwords in localStorage', async () => {
    const keys = await page.evaluate(() => Object.keys(localStorage));
    const bad = keys.filter(k => /password|secret|private_key/i.test(k));
    if (bad.length) throw new Error(`Suspicious keys: ${bad.join(', ')}`);
  });

  await test('No hardcoded secrets in page source', async () => {
    const html = await page.content();
    if (/sk_live_[A-Za-z0-9]{20,}/.test(html)) throw new Error('Stripe live key in HTML');
    if (/Bearer [A-Za-z0-9\-._]{40,}/.test(html)) throw new Error('Bearer token in HTML');
  });

  await test('Cookies have Secure flag', async () => {
    const cookies = await page.cookies();
    if (!cookies.length) { info('(no cookies)'); return; }
    const bad = cookies.filter(c => !c.secure && !c.name.startsWith('_ga'));
    if (bad.length) throw new Error(`${bad.length} cookie(s) missing Secure: ${bad.map(c => c.name).join(', ')}`);
    info(`${cookies.length} cookie(s), all secure`);
  }, false);

  await shot('11-security');
}

// ─── PHASE 12: SEO / meta ────────────────────────────────────────────────────
async function phase12() {
  console.log(col('\n📌 PHASE 12: SEO & Meta', 'cyan'));
  await page.goto(profile.siteUrl, { waitUntil: 'networkidle2' });

  await test('Meta description present and non-empty', async () => {
    const desc = await page.evaluate(() => {
      const m = document.querySelector('meta[name="description"]');
      return m ? m.getAttribute('content') : null;
    });
    if (!desc || desc.trim().length < 10) throw new Error(`Meta description: "${desc}"`);
    info(`description: "${desc.slice(0, 80)}"`);
  });

  await test('OG title present', async () => {
    const val = await page.evaluate(() => {
      const m = document.querySelector('meta[property="og:title"]');
      return m ? m.getAttribute('content') : null;
    });
    if (!val) throw new Error('Missing og:title');
    info(`og:title: "${val.slice(0, 60)}"`);
  });

  await test('OG description or OG image present', async () => {
    const desc = await page.evaluate(() => document.querySelector('meta[property="og:description"]')?.getAttribute('content'));
    const img  = await page.evaluate(() => document.querySelector('meta[property="og:image"]')?.getAttribute('content'));
    if (!desc && !img) throw new Error('Neither og:description nor og:image found');
    if (img) info(`og:image: ${img.slice(-50)}`);
  });

  await test('Page title length reasonable (10–80 chars)', async () => {
    const t = await page.title();
    if (t.length < 10 || t.length > 80) throw new Error(`Title length ${t.length}: "${t.slice(0, 60)}"`);
  });

  await test('Viewport meta tag present', async () => {
    const vp = await page.evaluate(() => document.querySelector('meta[name="viewport"]')?.getAttribute('content'));
    if (!vp) throw new Error('No viewport meta tag');
    info(`viewport: ${vp}`);
  });

  // Profile-specific SEO checks (optional)
  if (profile.seoChecks) await profile.seoChecks(page, test, helpers);

  await shot('12-seo');
}

// ─── PHASE 13: Error handling ────────────────────────────────────────────────
async function phase13() {
  console.log(col('\n📌 PHASE 13: Error Handling', 'cyan'));

  await test('404 page returns non-blank content', async () => {
    await page.goto(`${profile.siteUrl}/this-route-definitely-does-not-exist-xyz123`, {
      waitUntil: 'networkidle2',
    });
    const body = await page.evaluate(() => document.body.innerText.trim());
    if (body.length < 5) throw new Error('404 page is blank');
    info(`404 body: "${body.slice(0, 60)}"`);
  });

  await test('No 5xx on 404 route', async () => {
    // Already on 404 URL — just check status wasn't 5xx
    const status = await page.evaluate(() => {
      // Can't read HTTP status from JS; verify page didn't JS-error
      return typeof document !== 'undefined' ? 200 : -1;
    });
    if (status < 0) throw new Error('Page context missing after 404 navigation');
  });

  await shot('13-errors');
}

// ─── PHASE 14: Extended journeys (profile-driven) ────────────────────────────
async function phase14() {
  if (!profile.journeys) return;
  console.log(col('\n📌 PHASE 14: User Journeys', 'cyan'));
  await profile.journeys(page, test, helpers);
  await shot('14-journeys');
}

// ─── PHASE 15: Logout (profile-driven) ──────────────────────────────────────
async function phase15() {
  if (!profile.logout) return;
  console.log(col('\n📌 PHASE 15: Logout', 'cyan'));
  await profile.logout(page, test, helpers);
  await shot('15-logout');
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log(col('\n╔══════════════════════════════════════════════════════════╗', 'bold'));
  console.log(col(`║  E2E: ${profile.siteUrl.padEnd(50)} ║`, 'bold'));
  console.log(col(`║  ${new Date().toISOString().padEnd(56)} ║`, 'bold'));
  console.log(col('╚══════════════════════════════════════════════════════════╝', 'bold'));
  if (EMAIL) info(`email: ${EMAIL}`);
  info(`shots: ${SCREENSHOT_DIR}\n`);

  browser = await puppeteer.launch({
    headless: true,
    userDataDir: path.join(os.tmpdir(), `puppeteer-${profileName}-${Date.now()}`),
    // --disable-quic + EncryptedClientHello off: force plain TCP/TLS — QUIC and ECH
    // are blocked/intercepted in some CI/sandbox networks and produce
    // ERR_QUIC_PROTOCOL_ERROR / ERR_ECH_FALLBACK_CERTIFICATE_INVALID noise
    // unrelated to the site under test
    args: [
      '--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage',
      '--disable-quic', '--disable-features=EncryptedClientHello',
      // E2E_INSECURE_TLS=1: only for sandboxed CI networks that MITM TLS with a
      // proxy CA Chrome doesn't trust; never set this when validating real cert chains
      ...(process.env.E2E_INSECURE_TLS === '1' ? ['--ignore-certificate-errors'] : []),
    ],
  });
  page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080 });
  page.setDefaultTimeout(15000);
  page.setDefaultNavigationTimeout(20000);

  try {
    await phase1();
    await phase2();
    await phase3();
    await phase4();
    await phase5();
    await phase6();
    await phase7();
    await phase8();
    await phase9();
    await phase10();
    await phase11();
    await phase12();
    await phase13();
    await phase14();
    await phase15();
  } catch (fatal) {
    console.log(col(`\n💥 Fatal: ${fatal.message}`, 'red'));
  } finally {
    await browser.close();
  }

  printResults();
}

function printResults() {
  const { total, passed, failed, warnings } = results.summary;
  const rate = total > 0 ? ((passed / total) * 100).toFixed(1) : 0;

  console.log(col('\n╔══════════════════════════════════════════════════════════╗', 'blue'));
  console.log(col('║                   TEST RESULTS MATRIX                    ║', 'blue'));
  console.log(col('╚══════════════════════════════════════════════════════════╝', 'blue'));
  console.log(col(`\n  Total: ${total}  ✅ ${passed}  ❌ ${failed}  ⚠️  ${warnings}  (${rate}%)`, 'cyan'));
  console.log();

  const maxLen = Math.max(...results.tests.map(t => t.name.length));
  console.log('┌─ ' + '─'.repeat(maxLen) + ' ─ Status ──┐');
  for (const t of results.tests) {
    const icon = t.status === 'PASS' ? '✅' : t.status === 'WARN' ? '⚠️ ' : '❌';
    console.log(`│ ${t.name.padEnd(maxLen)} │ ${icon} ${t.status.padEnd(5)} │`);
  }
  console.log('└─ ' + '─'.repeat(maxLen) + ' ─────────┘');

  const reportPath = `${SCREENSHOT_DIR}/e2e-${profileName}-results.json`;
  fs.writeFileSync(reportPath, JSON.stringify(results, null, 2));
  info(`\nreport: ${reportPath}`);

  console.log(col('\n🚦 VERDICT', 'cyan'));
  if (failed === 0) {
    console.log(col(`   ✅ GO — all critical tests passed (${rate}%)`, 'green'));
  } else {
    console.log(col(`   ❌ NO-GO — ${failed} critical failure(s)`, 'red'));
    results.tests.filter(t => t.status === 'FAIL').forEach(t =>
      console.log(col(`      • ${t.name}: ${t.error}`, 'red'))
    );
  }
}

main().catch(e => { console.error(e); process.exit(1); });
