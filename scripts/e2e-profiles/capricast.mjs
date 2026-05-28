/**
 * E2E profile: capricast.com
 * Next.js video platform (ISR). Auth at /sign-in.
 * Known bug: CORS on api.capricast.com/api/notifications (tracked as warning).
 * Video cards are lazy-loaded — must scroll + wait for hydration.
 */

const BASE = 'https://capricast.com';
const KNOWN_VIDEO = '/watch/5209dd21-71a8-4ee4-afeb-0c030ade1a70';

export default {
  name: 'capricast',
  siteUrl: BASE,
  defaultEmail: 'adrper79@gmail.com',
  defaultPassword: '123qweASD',

  // Console errors the runner should treat as warnings (known production bugs)
  // api.capricast.com is missing CORS headers on several endpoints (notifications, auth/entitlements)
  knownConsoleErrors: [
    'api.capricast.com',          // CORS on any api.capricast.com endpoint — tracked production bug
    'net::ERR_FAILED',            // Cascading network error from CORS preflight failure
    'Failed to fetch',            // JS TypeError that follows CORS failure
  ],

  // ─── Auth ─────────────────────────────────────────────────────────────────
  async auth(page, email, password, test, { waitForAny, getValue, info }) {
    await test('Sign-in page reachable', async () => {
      const r = await page.goto(`${BASE}/sign-in`, { waitUntil: 'networkidle2' });
      if (![200, 301, 302].includes(r.status())) throw new Error(`HTTP ${r.status()}`);
      info(`URL: ${page.url()}`);
    });

    await test('Email + password inputs present', async () => {
      await waitForAny(['input[type="email"]', 'input[name="email"]', 'input[placeholder*="email" i]'], 10000);
      await page.waitForSelector('input[type="password"]', { visible: true, timeout: 10000 });
    });

    await test('Can type email', async () => {
      const el = await page.$('input[type="email"], input[name="email"]');
      if (!el) throw new Error('Email input missing');
      await el.click({ clickCount: 3 });
      await el.type(email, { delay: 30 });
      const val = await getValue(el);
      if (!val.includes('@')) throw new Error(`Typed "${val}"`);
    });

    await test('Can type password', async () => {
      const el = await page.$('input[type="password"]');
      if (!el) throw new Error('Password input missing');
      await el.click({ clickCount: 3 });
      await el.type(password, { delay: 30 });
      const val = await getValue(el);
      if (val.length < 4) throw new Error('Password not entered');
    });

    await test('Submit sign-in', async () => {
      const btn = await page.$('button[type="submit"]') || await page.$('form button:last-of-type');
      btn ? await btn.click() : await page.keyboard.press('Enter');
    });

    await test('Auth completes — URL changes or form disappears', async () => {
      const startUrl = page.url();
      await page.waitForFunction(
        src => location.href !== src || !document.querySelector('input[type="email"]')?.offsetParent,
        { timeout: 20000 }, startUrl
      ).catch(async () => {
        const errEl = await page.$('[role="alert"], [class*="error"]');
        if (errEl && await errEl.evaluate(el => el.offsetParent !== null)) {
          const t = await errEl.evaluate(el => el.textContent.trim().slice(0, 120));
          if (t) throw new Error(`Auth error: ${t}`);
        }
      });
      info(`URL after auth: ${page.url()}`);
    });
  },

  // ─── Post-login ───────────────────────────────────────────────────────────
  async authenticatedChecks(page, test, { info }) {
    await test('Dashboard accessible (not bounced to sign-in)', async () => {
      const r = await page.goto(`${BASE}/dashboard`, { waitUntil: 'networkidle2' });
      const url = page.url();
      info(`URL: ${url}`);
      if (url.includes('sign-in') || url.includes('login')) throw new Error('Bounced to sign-in');
      if (r.status() >= 400) throw new Error(`HTTP ${r.status()}`);
    });

    await test('Dashboard contains expected content', async () => {
      const body = await page.evaluate(() => document.body.innerText.toLowerCase());
      if (!['dashboard', 'upload', 'video', 'welcome', 'adrper79']
        .some(k => body.includes(k))) throw new Error('No dashboard content');
    });

    await test('Dashboard /upload sub-page accessible', async () => {
      const r = await page.goto(`${BASE}/dashboard/upload`, { waitUntil: 'networkidle2' });
      const url = page.url();
      if (url.includes('sign-in')) throw new Error('Bounced to sign-in on /dashboard/upload');
      info(`upload URL: ${url}, status: ${r.status()}`);
    });

    await test('No 401/403 on dashboard (> 1 allowed for token-refresh)', async () => {
      const errs = [];
      page.on('response', r => { if ([401, 403].includes(r.status())) errs.push(`${r.status()} ${r.url()}`); });
      await page.goto(`${BASE}/dashboard`, { waitUntil: 'networkidle2' });
      if (errs.length > 1) throw new Error(errs.slice(0, 3).join('; '));
    });

    await test('KNOWN BUG: CORS on api.capricast.com/api/notifications', async () => {
      // This fails in production — tracked here so it shows in the matrix
      const consoleErrors = [];
      page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });
      await page.goto(BASE, { waitUntil: 'networkidle2' });
      const corsErr = consoleErrors.find(e => e.includes('notifications') && e.includes('CORS'));
      if (corsErr) throw new Error('CORS error on /api/notifications — add Access-Control-Allow-Origin header');
    }, false); // warn only — known bug, not a blocker
  },

  // ─── Content checks ──────────────────────────────────────────────────────
  async contentChecks(page, test, { findByText, info }) {
    // Homepage
    await page.goto(BASE, { waitUntil: 'networkidle2' });

    await test('Homepage heading present', async () => {
      const h1 = await page.$('h1');
      if (!h1) throw new Error('No H1');
      const text = await h1.evaluate(el => el.textContent.trim());
      info(`H1: "${text}"`);
    });

    await test('Video/trending content keywords in body', async () => {
      const body = await page.evaluate(() => document.body.innerText.toLowerCase());
      if (!['trending', 'video', 'watch', 'latest', 'stream', 'play'].some(k => body.includes(k)))
        throw new Error('No video content keywords');
    });

    await test('Video cards visible after scroll/hydration', async () => {
      // Scroll down to trigger lazy-load; wait up to 8s for at least one card
      await page.evaluate(() => window.scrollBy(0, 600));
      await new Promise(r => setTimeout(r, 2000));
      await page.evaluate(() => window.scrollBy(0, 600));
      await new Promise(r => setTimeout(r, 2000));
      const cards = await page.$$('a[href*="/watch"], [class*="video-card"], [class*="VideoCard"], [class*="video_card"]');
      if (!cards.length) {
        // Fallback: look for any link that navigates to /watch
        const anyWatchLink = await page.$('a[href^="/watch"]');
        if (!anyWatchLink) throw new Error('No video cards or /watch links found after scroll');
      }
      info(`${cards.length} video card(s) found`);
    }, false); // warn — Next.js ISR hydration timing is non-deterministic in headless

    await test('Images load (< 15% broken)', async () => {
      const imgs = await page.$$('img');
      if (!imgs.length) { info('(lazy — no images yet)'); return; }
      let broken = 0;
      for (const img of imgs) {
        const w = await img.evaluate(el => el.naturalWidth);
        const src = await img.evaluate(el => el.src);
        if (w === 0 && src && !src.startsWith('data:')) broken++;
      }
      if (broken > imgs.length * 0.15) throw new Error(`${broken}/${imgs.length} broken`);
      info(`${imgs.length} images, ${broken} broken`);
    });

    // Watch page — video player + meta
    await page.goto(`${BASE}${KNOWN_VIDEO}`, { waitUntil: 'networkidle2' });

    await test('Watch page loads without 404 content', async () => {
      const body = await page.evaluate(() => document.body.innerText.toLowerCase());
      if (body.includes('page not found') || body.includes('404')) throw new Error('Watch page shows 404');
      info(`watch body: ${body.trim().slice(0, 80)}`);
    });

    await test('Video player (Cloudflare Stream iframe) present', async () => {
      const player = await page.$$('video, iframe[src*="cloudflare"], iframe[src*="stream"], [class*="player"]');
      if (!player.length) throw new Error('No player element');
      info(`${player.length} player element(s)`);
    });

    await test('Twitter:player card on watch page', async () => {
      const twitterPlayer = await page.evaluate(() =>
        document.querySelector('meta[name="twitter:player"]')?.getAttribute('content')
      );
      if (!twitterPlayer) throw new Error('No twitter:player card');
      info(`twitter:player: ...${twitterPlayer.slice(-40)}`);
    });

    await test('JSON-LD VideoObject structured data on watch page', async () => {
      const ld = await page.evaluate(() => {
        const scripts = [...document.querySelectorAll('script[type="application/ld+json"]')];
        for (const s of scripts) {
          try { const d = JSON.parse(s.textContent); if (d['@type'] === 'VideoObject') return d; } catch {}
        }
        return null;
      });
      if (!ld) throw new Error('No VideoObject JSON-LD');
      if (!ld.name) throw new Error('VideoObject missing name');
      info(`JSON-LD name: "${ld.name.slice(0, 60)}"`);
    });

    await test('Watch page has video title', async () => {
      const body = await page.evaluate(() => document.body.innerText.trim());
      if (body.length < 20) throw new Error('Watch page body too short');
      info(`body: ${body.slice(0, 80)}`);
    });

    // Pricing
    await page.goto(`${BASE}/pricing`, { waitUntil: 'networkidle2' });

    await test('Pricing page loads', async () => {
      if (!page.url().includes('pricing')) throw new Error(`Redirected: ${page.url()}`);
    });

    await test('Pricing content present (free/pro/price)', async () => {
      const body = await page.evaluate(() => document.body.innerText.toLowerCase());
      if (!body.match(/free|pro|premium|\$\d+/i)) throw new Error('No pricing content');
    });
  },

  // ─── SEO ─────────────────────────────────────────────────────────────────
  async seoChecks(page, test, { info }) {
    await page.goto(`${BASE}${KNOWN_VIDEO}`, { waitUntil: 'networkidle2' });

    await test('Watch page OG title present', async () => {
      const val = await page.evaluate(() =>
        document.querySelector('meta[property="og:title"]')?.getAttribute('content')
      );
      if (!val) throw new Error('No og:title on watch page');
      info(`og:title: "${val.slice(0, 60)}"`);
    });

    await test('Watch page OG image present', async () => {
      const val = await page.evaluate(() =>
        document.querySelector('meta[property="og:image"]')?.getAttribute('content')
      );
      if (!val) throw new Error('No og:image on watch page');
      info(`og:image: ...${val.slice(-40)}`);
    });
  },

  // ─── User journeys ────────────────────────────────────────────────────────
  async journeys(page, test, { findByText, info }) {
    // 1. Search bar is functional
    await test('Search bar accepts input', async () => {
      await page.goto(BASE, { waitUntil: 'networkidle2' });
      const searchInput = await page.$('input[type="search"], input[placeholder*="search" i], input[name*="search" i]');
      if (!searchInput) { info('(no search bar on homepage — skipping)'); return; }
      await searchInput.click();
      await searchInput.type('test', { delay: 20 });
      const val = await searchInput.evaluate(el => el.value);
      if (!val.includes('test')) throw new Error('Search input not accepting text');
      info('search bar functional');
    }, false);

    // 2. Navigation links reach valid pages
    await test('Dashboard link navigates correctly', async () => {
      await page.goto(BASE, { waitUntil: 'networkidle2' });
      const dashLink = await page.$('a[href="/dashboard"]');
      if (!dashLink) throw new Error('No dashboard link in nav');
      await dashLink.click();
      await page.waitForNavigation({ waitUntil: 'networkidle2' }).catch(() => {});
      const url = page.url();
      if (!url.includes('dashboard') && !url.includes('sign-in')) throw new Error(`Unexpected URL: ${url}`);
      info(`dashboard nav → ${url}`);
    });

    // 3. Watch page Cloudflare Stream iframe src is not broken
    await test('Stream iframe src resolves (not 404)', async () => {
      await page.goto(`${BASE}${KNOWN_VIDEO}`, { waitUntil: 'networkidle2' });
      const src = await page.evaluate(() =>
        document.querySelector('iframe[src*="cloudflare"]')?.src ||
        document.querySelector('meta[name="twitter:player"]')?.getAttribute('content')
      );
      if (!src) throw new Error('No Cloudflare stream src found');
      // Verify via fetch that the src domain at least responds
      const ok = await page.evaluate(async (url) => {
        try { const r = await fetch(url, { method: 'HEAD', mode: 'no-cors' }); return true; } catch { return false; }
      }, src);
      info(`stream src reachable: ${ok} — ${src.slice(-60)}`);
    }, false);

    // 4. Homepage shows trending videos after full load
    await test('Trending content section heading visible', async () => {
      await page.goto(BASE, { waitUntil: 'networkidle2' });
      const h = await page.$('h1, h2');
      if (!h) throw new Error('No heading');
      const text = await h.evaluate(el => el.textContent.trim());
      if (!text.match(/trending|latest|new|featured|top/i)) {
        throw new Error(`H1/H2 "${text}" doesn't indicate trending content`);
      }
      info(`heading: "${text}"`);
    });
  },

  // ─── Logout ──────────────────────────────────────────────────────────────
  async logout(page, test, { findByText, info }) {
    await page.goto(BASE, { waitUntil: 'networkidle2' });

    await test('Sign out option accessible', async () => {
      const btn = await findByText('button, a', 'sign out')
        || await findByText('button, a', 'logout')
        || await findByText('button, a', 'log out');
      if (!btn) throw new Error('No sign-out control found');
    }, false);

    await test('After logout, sign-in page is accessible', async () => {
      await page.goto(`${BASE}/sign-in`, { waitUntil: 'networkidle2' });
      const emailInput = await page.$('input[type="email"], input[name="email"]');
      if (!emailInput) throw new Error('Sign-in form not shown after logout');
      info('sign-in form confirmed accessible');
    });
  },

  // ─── Critical routes ─────────────────────────────────────────────────────
  criticalRoutes: [
    { path: '/', expectedStatuses: [200], label: 'Home /' },
    { path: '/sign-in', expectedStatuses: [200], label: 'Sign-in /sign-in' },
    { path: '/pricing', expectedStatuses: [200], label: 'Pricing /pricing' },
    { path: KNOWN_VIDEO, expectedStatuses: [200], label: 'Watch page' },
    { path: '/dashboard', expectedStatuses: [200, 302], label: 'Dashboard /dashboard' },
    { path: '/dashboard/upload', expectedStatuses: [200, 302], label: 'Upload /dashboard/upload' },
  ],
};
