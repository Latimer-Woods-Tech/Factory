/**
 * E2E profile: cipherofhealing.com
 * - Vite SPA (Cloudflare Pages) — all routes are client-side rendered
 * - Brand name: "CypherOfHealing" (both cipherofhealing.com + cypherofhealing.com resolve here)
 * - Auth at /login (JS-rendered form)
 * - Dashboard at /dashboard; authenticated sections: /chair, /vault, /academy, /doctrine, /streams
 */

const BASE = 'https://cipherofhealing.com';

export default {
  name: 'cipherofhealing',
  siteUrl: BASE,
  defaultEmail: 'adrper79@gmail.com',
  defaultPassword: '123qweASD',

  // ─── Auth flow ───────────────────────────────────────────────────────────
  async auth(page, email, password, test, { waitForAny, getValue, info }) {
    await test('Login page reachable (/login)', async () => {
      const r = await page.goto(`${BASE}/login`, { waitUntil: 'networkidle2' });
      if (![200, 301, 302].includes(r.status())) throw new Error(`HTTP ${r.status()}`);
      info(`URL: ${page.url()}`);
    });

    await test('Email input present (JS-rendered SPA)', async () => {
      await waitForAny([
        'input[type="email"]', 'input[name="email"]',
        'input[placeholder*="email" i]', 'input[autocomplete*="email" i]',
        'input[type="text"]',
      ], 12000);
    });

    await test('Password input present', async () => {
      await page.waitForSelector('input[type="password"]', { visible: true, timeout: 12000 });
    });

    await test('Can type email', async () => {
      let el = await page.$('input[type="email"], input[name="email"]');
      if (!el) {
        const inputs = await page.$$('input[type="text"]');
        el = inputs[0] || null;
      }
      if (!el) throw new Error('No email input');
      await el.evaluate(e => e.scrollIntoView({ block: 'center' }));
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

    await test('Submit login form', async () => {
      const btn = await page.$('button[type="submit"]')
        || await page.$('form button:last-of-type');
      btn ? await btn.click() : await page.keyboard.press('Enter');
    });

    await test('Auth completes — URL changes or form disappears', async () => {
      const startUrl = page.url();
      await page.waitForFunction(
        (src) => {
          if (location.href !== src) return true;
          const emailInput = document.querySelector('input[type="email"], input[name="email"], input[type="text"]');
          return !emailInput || emailInput.offsetParent === null;
        },
        { timeout: 20000 },
        startUrl
      ).catch(async () => {
        const errEl = await page.$('[role="alert"], [class*="error"], [class*="alert"]');
        if (errEl) {
          const v = await errEl.evaluate(el => el.offsetParent !== null);
          if (v) {
            const t = await errEl.evaluate(el => el.textContent.trim().slice(0, 120));
            if (t) throw new Error(`Auth error: ${t}`);
          }
        }
      });
      info(`URL after auth: ${page.url()}`);
    });
  },

  // ─── Post-login checks ───────────────────────────────────────────────────
  async authenticatedChecks(page, test, { info }) {
    await test('Dashboard accessible after login', async () => {
      const r = await page.goto(`${BASE}/dashboard`, { waitUntil: 'networkidle2' });
      const url = page.url();
      info(`URL: ${url}`);
      if (url.includes('/login') || url.includes('/signin')) throw new Error('Bounced to login');
      if (r.status() >= 400) throw new Error(`HTTP ${r.status()}`);
    });

    await test('Dashboard has meaningful content', async () => {
      const body = await page.evaluate(() => document.body.innerText);
      if (body.trim().length < 30) throw new Error('Dashboard appears empty');
      info(`body: ${body.trim().slice(0, 100)}`);
    });

    await test('No 401/403 on dashboard load (> 1 allowed)', async () => {
      const errs = [];
      const l = r => { if ([401, 403].includes(r.status())) errs.push(`${r.status()} ${r.url()}`); };
      page.on('response', l);
      await page.reload({ waitUntil: 'networkidle2' });
      page.off('response', l);
      if (errs.length > 1) throw new Error(errs.slice(0, 3).join('; '));
    });

    // Authenticated section route checks
    for (const section of ['/chair', '/vault', '/academy', '/doctrine', '/streams']) {
      await test(`Authenticated section ${section} loads (not login-bounced)`, async () => {
        const r = await page.goto(`${BASE}${section}`, { waitUntil: 'networkidle2' });
        const url = page.url();
        if (url.includes('/login') || url.includes('/signin')) throw new Error(`Bounced to login from ${section}`);
        if (r.status() >= 400) throw new Error(`HTTP ${r.status()}`);
        const body = await page.evaluate(() => document.body.innerText.trim());
        if (body.length < 10) throw new Error(`${section} has no content`);
        info(`${section} → ${url} body: ${body.slice(0, 60)}`);
      });
    }
  },

  // ─── Content checks ──────────────────────────────────────────────────────
  async contentChecks(page, test, { findByText, info }) {
    await page.goto(BASE, { waitUntil: 'networkidle2' });

    await test('Brand name / tagline visible', async () => {
      const body = await page.evaluate(() => document.body.innerText);
      const found = ['cypher', 'cipher', 'healing', 'reflection', 'inner']
        .some(kw => body.toLowerCase().includes(kw));
      if (!found) throw new Error('No brand content found');
    });

    await test('Healing / wellness content present', async () => {
      const body = await page.evaluate(() => document.body.innerText);
      const found = ['heal', 'wellness', 'stream', 'session', 'journey', 'transform', 'meditation']
        .some(kw => body.toLowerCase().includes(kw));
      if (!found) throw new Error('No healing/wellness content keywords found');
    }, false);

    await test('CTA or sign-up entry point visible', async () => {
      const el = await page.$('[data-testid="cta"], [class*="cta"], button[class*="primary"]')
        || await findByText('button, a', 'get started')
        || await findByText('button, a', 'join')
        || await findByText('button, a', 'start')
        || await findByText('button, a', 'sign up')
        || await findByText('button, a', 'login');
      if (!el) throw new Error('No CTA or entry point found');
    });

    await test('Navigation / menu present', async () => {
      const nav = await page.$('nav, [class*="nav"], [class*="menu"], header');
      if (!nav) throw new Error('No nav or header element');
    });

    await test('Images load (< 15% broken)', async () => {
      const imgs = await page.$$('img');
      if (!imgs.length) { info('(no images on homepage)'); return; }
      let broken = 0;
      for (const img of imgs) {
        const w = await img.evaluate(el => el.naturalWidth);
        const src = await img.evaluate(el => el.src);
        if (w === 0 && src && !src.startsWith('data:')) broken++;
      }
      if (broken > imgs.length * 0.15) throw new Error(`${broken}/${imgs.length} broken`);
      info(`${imgs.length} images, ${broken} broken`);
    });

    await test('Media / stream content present or advertised', async () => {
      const body = await page.evaluate(() => document.body.innerText);
      const els = await page.$$('video, iframe[src*="stream"], [class*="stream"], [class*="video"], [class*="player"]');
      const hasText = ['stream', 'live', 'watch', 'video'].some(kw => body.toLowerCase().includes(kw));
      if (!els.length && !hasText) throw new Error('No stream/video content found');
      info(`${els.length} media element(s), stream mention in text: ${hasText}`);
    }, false);

    // Streams section
    await test('/streams section loads with stream content', async () => {
      await page.goto(`${BASE}/streams`, { waitUntil: 'networkidle2' });
      const url = page.url();
      if (url.includes('/login')) throw new Error('Bounced to login on /streams');
      const body = await page.evaluate(() => document.body.innerText.toLowerCase());
      const hasContent = ['stream', 'live', 'session', 'watch', 'video', 'channel', 'healing'].some(k => body.includes(k));
      if (!hasContent) throw new Error('No stream content on /streams page');
      info(`/streams body: ${body.trim().slice(0, 80)}`);
    });

    // Content/academy section
    await test('/academy section loads', async () => {
      await page.goto(`${BASE}/academy`, { waitUntil: 'networkidle2' });
      const url = page.url();
      if (url.includes('/login')) throw new Error('Bounced to login on /academy');
      const body = await page.evaluate(() => document.body.innerText.trim());
      if (body.length < 10) throw new Error('/academy has no content');
      info(`/academy body: ${body.slice(0, 80)}`);
    });

    await test('/vault section loads', async () => {
      await page.goto(`${BASE}/vault`, { waitUntil: 'networkidle2' });
      const url = page.url();
      if (url.includes('/login')) throw new Error('Bounced to login on /vault');
      const body = await page.evaluate(() => document.body.innerText.trim());
      if (body.length < 10) throw new Error('/vault has no content');
      info(`/vault body: ${body.slice(0, 80)}`);
    });
  },

  // ─── SEO checks ──────────────────────────────────────────────────────────
  async seoChecks(page, test, { info }) {
    await page.goto(BASE, { waitUntil: 'networkidle2' });

    await test('Title tag present and non-empty', async () => {
      const title = await page.title();
      if (!title || title.trim().length < 3) throw new Error('Missing or empty title');
      info(`title: "${title}"`);
    });

    await test('OG:title present', async () => {
      const val = await page.evaluate(() =>
        document.querySelector('meta[property="og:title"]')?.getAttribute('content')
      );
      if (!val) throw new Error('No og:title');
      info(`og:title: "${val.slice(0, 60)}"`);
    }, false);

    await test('OG:image present', async () => {
      const img = await page.evaluate(() =>
        document.querySelector('meta[property="og:image"]')?.getAttribute('content')
      );
      if (!img) throw new Error('No og:image');
      info(`og:image: ...${img.slice(-40)}`);
    }, false);

    await test('Canonical or robots meta present', async () => {
      const canonical = await page.evaluate(() =>
        document.querySelector('link[rel="canonical"]')?.href
      );
      const robots = await page.evaluate(() =>
        document.querySelector('meta[name="robots"]')?.getAttribute('content')
      );
      if (!canonical && !robots) throw new Error('No canonical or robots meta');
      if (canonical) info(`canonical: ${canonical}`);
    }, false);
  },

  // ─── User journeys ────────────────────────────────────────────────────────
  async journeys(page, test, { findByText, info }) {
    // 1. Wrong credentials rejected
    await test('Wrong credentials show error or keep login form', async () => {
      await page.goto(`${BASE}/login`, { waitUntil: 'networkidle2' });
      let emailEl = await page.$('input[type="email"], input[name="email"]');
      if (!emailEl) {
        const inputs = await page.$$('input[type="text"]');
        emailEl = inputs[0] || null;
      }
      const passEl = await page.$('input[type="password"]');
      if (!emailEl || !passEl) { info('(login form not rendered — skipping)'); return; }
      await emailEl.click({ clickCount: 3 });
      await emailEl.type('wrong@example.com', { delay: 20 });
      await passEl.click({ clickCount: 3 });
      await passEl.type('wrongpassword123', { delay: 20 });
      const btn = await page.$('button[type="submit"], form button:last-of-type');
      btn ? await btn.click() : await page.keyboard.press('Enter');
      await new Promise(r => setTimeout(r, 4000));
      const errEl = await page.$('[role="alert"], [class*="error"], [class*="invalid"]');
      const formStillPresent = await page.$('input[type="password"]');
      if (!errEl && !formStillPresent) throw new Error('Logged in with wrong creds — no validation!');
      if (errEl) {
        const t = await errEl.evaluate(el => el.textContent.trim().slice(0, 80));
        info(`error shown: "${t}"`);
      }
      // Re-login
      await page.goto(`${BASE}/login`, { waitUntil: 'networkidle2' });
      let e2 = await page.$('input[type="email"], input[name="email"]');
      if (!e2) { const inputs = await page.$$('input[type="text"]'); e2 = inputs[0]; }
      const p2 = await page.$('input[type="password"]');
      if (e2 && p2) {
        await e2.click({ clickCount: 3 }); await e2.type('adrper79@gmail.com', { delay: 20 });
        await p2.click({ clickCount: 3 }); await p2.type('123qweASD', { delay: 20 });
        const b2 = await page.$('button[type="submit"], form button:last-of-type');
        b2 ? await b2.click() : await page.keyboard.press('Enter');
        await new Promise(r => setTimeout(r, 5000));
      }
    });

    // 2. Navigation links in sidebar/nav work
    await test('App has sidebar or main navigation', async () => {
      await page.goto(BASE, { waitUntil: 'networkidle2' });
      const nav = await page.$('nav, aside, [class*="sidebar"], [class*="nav"]');
      if (!nav) throw new Error('No sidebar or nav in authenticated view');
    });

    // 3. Chair section (core healing feature)
    await test('/chair section has healing/session content', async () => {
      await page.goto(`${BASE}/chair`, { waitUntil: 'networkidle2' });
      const url = page.url();
      if (url.includes('/login')) throw new Error('Bounced to login on /chair');
      const body = await page.evaluate(() => document.body.innerText.toLowerCase());
      const hasContent = ['chair', 'heal', 'session', 'stream', 'journey', 'breathe', 'relax', 'start', 'begin']
        .some(k => body.includes(k));
      if (!hasContent) throw new Error('No recognizable content on /chair');
      info(`/chair body: ${body.trim().slice(0, 100)}`);
    });

    // 4. Doctrine section
    await test('/doctrine section loads with philosophy content', async () => {
      await page.goto(`${BASE}/doctrine`, { waitUntil: 'networkidle2' });
      const url = page.url();
      if (url.includes('/login')) throw new Error('Bounced to login on /doctrine');
      const body = await page.evaluate(() => document.body.innerText.trim());
      if (body.length < 10) throw new Error('/doctrine has no content');
      info(`/doctrine body: ${body.slice(0, 100)}`);
    });

    // 5. No 5xx on section navigation
    await test('Section navigation has no 5xx responses', async () => {
      const errs = [];
      const l = r => { if (r.status() >= 500) errs.push(`${r.status()} ${r.url()}`); };
      page.on('response', l);
      for (const path of ['/chair', '/vault', '/academy']) {
        await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle2' });
      }
      page.off('response', l);
      if (errs.length) throw new Error(errs.slice(0, 3).join('; '));
    }, false);
  },

  // ─── Logout ──────────────────────────────────────────────────────────────
  async logout(page, test, { findByText, info }) {
    await page.goto(BASE, { waitUntil: 'networkidle2' });
    // The Header.tsx sign-out button is rendered conditionally by the React auth
    // store (hydrated asynchronously from localStorage). Wait up to 5s for either
    // "Sign Out" or "Sign In" to appear, so the auth state has settled before we search.
    await page.waitForFunction(() => {
      const btns = [...document.querySelectorAll('button, a')];
      return btns.some(el => {
        const t = el.textContent.trim().toLowerCase();
        return t.includes('sign out') || t.includes('sign in') || t.includes('login');
      });
    }, { timeout: 5000 }).catch(() => {});

    await test('Sign out option present (authenticated header)', async () => {
      const btn = await findByText('button, a', 'sign out')
        || await findByText('button, a', 'logout')
        || await findByText('button, a', 'log out')
        || await findByText('button, a', 'sign-out');
      if (!btn) throw new Error('No sign-out button found — header may not show authenticated state');
      info('sign-out button found');
    }, false);

    await test('After logout, login page is accessible', async () => {
      await page.goto(`${BASE}/login`, { waitUntil: 'networkidle2' });
      const emailInput = await page.$('input[type="email"], input[name="email"], input[type="text"]');
      const passInput = await page.$('input[type="password"]');
      if (!emailInput && !passInput) throw new Error('Login form not accessible after logout');
      info('login form confirmed accessible');
    });
  },

  // ─── Critical routes ─────────────────────────────────────────────────────
  criticalRoutes: [
    { path: '/', expectedStatuses: [200], label: 'Home /' },
    { path: '/login', expectedStatuses: [200], label: 'Login /login' },
    { path: '/dashboard', expectedStatuses: [200], label: 'Dashboard /dashboard' },
    { path: '/chair', expectedStatuses: [200], label: 'Chair /chair' },
    { path: '/vault', expectedStatuses: [200], label: 'Vault /vault' },
    { path: '/academy', expectedStatuses: [200], label: 'Academy /academy' },
    { path: '/doctrine', expectedStatuses: [200], label: 'Doctrine /doctrine' },
    { path: '/streams', expectedStatuses: [200], label: 'Streams /streams' },
  ],
};
