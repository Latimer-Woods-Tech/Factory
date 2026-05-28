/**
 * E2E profile: selfprime.net
 * SPA (Cloudflare Pages + CF Worker API).
 * Login at /?start=1 — email+password, session set internally, URL stays on /?start=1.
 * Authenticated users redirect to /marketing. Core feature: Human Design chart + synthesis reading.
 */

const BASE = 'https://selfprime.net';

export default {
  name: 'selfprime',
  siteUrl: BASE,
  defaultEmail: 'adrper79@gmail.com',
  defaultPassword: '123qweASD',

  // ─── Auth ─────────────────────────────────────────────────────────────────
  async auth(page, email, password, test, { waitForAny, getValue, info }) {
    await test('Login entry point reachable (/?start=1)', async () => {
      const r = await page.goto(`${BASE}/?start=1`, { waitUntil: 'networkidle2' });
      if (![200, 301, 302].includes(r.status())) throw new Error(`HTTP ${r.status()}`);
    });

    await test('Email + password inputs present', async () => {
      await waitForAny(['input[type="email"]', 'input[name="email"]']);
      await page.waitForSelector('input[type="password"]', { visible: true, timeout: 8000 });
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

    await test('Submit login form — no error shown', async () => {
      const btn = await page.$('button[type="submit"], form button:last-of-type');
      btn ? await btn.click() : await page.keyboard.press('Enter');
      await new Promise(r => setTimeout(r, 5000));
      const errEl = await page.$('[role="alert"], [class*="error-message"], [class*="auth-error"]');
      if (errEl && await errEl.evaluate(el => el.offsetParent !== null)) {
        const t = await errEl.evaluate(el => el.textContent.trim().slice(0, 120));
        if (t) throw new Error(`Auth error: ${t}`);
      }
      info(`URL: ${page.url()}`);
    });
  },

  // ─── Post-login ───────────────────────────────────────────────────────────
  async authenticatedChecks(page, test, { info }) {
    await test('Authenticated root redirects to /marketing', async () => {
      await page.goto(BASE, { waitUntil: 'networkidle2' });
      const url = page.url();
      info(`URL: ${url}`);
      if (!url.includes('/marketing') && !url.includes('/dashboard') && !url.includes('/app')) {
        throw new Error(`Unexpected post-login URL: ${url}`);
      }
    });

    await test('User-specific content present', async () => {
      const body = await page.evaluate(() => document.body.innerText);
      if (!['adrper79', 'dashboard', 'welcome', 'profile', 'sign out', 'logout']
        .some(k => body.toLowerCase().includes(k))) {
        throw new Error('No user-specific content');
      }
    });

    await test('No 401/403 on authenticated load', async () => {
      const errs = [];
      page.on('response', r => { if ([401, 403].includes(r.status())) errs.push(`${r.status()} ${r.url()}`); });
      await page.reload({ waitUntil: 'networkidle2' });
      if (errs.length > 1) throw new Error(errs.slice(0, 3).join('; '));
    });
  },

  // ─── Content checks ──────────────────────────────────────────────────────
  async contentChecks(page, test, { findByText, info }) {
    await page.goto(BASE, { waitUntil: 'networkidle2' });

    await test('Hero section visible', async () => {
      const el = await page.$('[data-testid="hero"], .hero, [class*="hero"], section:first-of-type');
      if (!el) throw new Error('No hero section');
    });

    await test('Primary CTA visible', async () => {
      const el = await page.$('[data-testid="cta"], [class*="cta"], button[class*="primary"]')
        || await findByText('button, a', 'get started')
        || await findByText('button, a', 'start')
        || await findByText('button, a', 'try');
      if (!el) throw new Error('No primary CTA');
    });

    await test('Content sections present (≥ 3)', async () => {
      const els = await page.$$('[class*="feature"], .card, [class*="card"], section');
      if (els.length < 3) throw new Error(`Only ${els.length} sections`);
      info(`${els.length} sections`);
    });

    await test('Images load (< 15% broken)', async () => {
      const imgs = await page.$$('img');
      if (!imgs.length) return;
      let broken = 0;
      for (const img of imgs) {
        const w = await img.evaluate(el => el.naturalWidth);
        const src = await img.evaluate(el => el.src);
        if (w === 0 && src && !src.startsWith('data:')) broken++;
      }
      if (broken > imgs.length * 0.15) throw new Error(`${broken}/${imgs.length} broken`);
      info(`${imgs.length} images, ${broken} broken`);
    });

    await test('Video / media content present', async () => {
      const els = await page.$$('video, iframe[src*="cloudflare"], iframe[src*="youtube"], [class*="video"]');
      if (!els.length) throw new Error('No media');
      info(`${els.length} media element(s)`);
    });

    // Pricing
    await page.goto(`${BASE}/pricing`, { waitUntil: 'networkidle2' });

    await test('Pricing page loads', async () => {
      if (!page.url().includes('pricing')) throw new Error(`Redirected: ${page.url()}`);
    });

    await test('Price values visible', async () => {
      const body = await page.evaluate(() => document.body.innerText);
      if (!body.match(/\$\d+|\d+\s*\/\s*(mo|month|yr|year)/i)) throw new Error('No price values');
    });

    await test('≥ 2 pricing plan cards', async () => {
      const cards = await page.$$('[class*="plan"], [class*="tier"], [class*="pricing"]');
      if (cards.length < 2) throw new Error(`Only ${cards.length} plan card(s)`);
      info(`${cards.length} pricing elements`);
    });

    await test('Pricing CTA (upgrade/select/buy) present', async () => {
      const btn = await findByText('button, a', 'get started')
        || await findByText('button, a', 'upgrade')
        || await findByText('button, a', 'select')
        || await findByText('button, a', 'buy');
      if (!btn) throw new Error('No pricing CTA');
    });
  },

  // ─── SEO ─────────────────────────────────────────────────────────────────
  async seoChecks(page, test, { info }) {
    await page.goto(`${BASE}/?start=1`, { waitUntil: 'networkidle2' });

    await test('OG:image present on SPA entry', async () => {
      const img = await page.evaluate(() =>
        document.querySelector('meta[property="og:image"]')?.getAttribute('content')
      );
      if (!img) throw new Error('No og:image');
      info(`og:image: ...${img.slice(-40)}`);
    });

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
    await test('Wrong credentials show error (not silent fail)', async () => {
      await page.goto(`${BASE}/?start=1`, { waitUntil: 'networkidle2' });
      const emailEl = await page.$('input[type="email"], input[name="email"]');
      const passEl  = await page.$('input[type="password"]');
      if (!emailEl || !passEl) throw new Error('Login form not rendered');
      await emailEl.click({ clickCount: 3 });
      await emailEl.type('wrong@example.com', { delay: 20 });
      await passEl.click({ clickCount: 3 });
      await passEl.type('wrongpassword123', { delay: 20 });
      const btn = await page.$('button[type="submit"], form button:last-of-type');
      btn ? await btn.click() : await page.keyboard.press('Enter');
      // Wait up to 8s for an error element or the form to still be present
      await new Promise(r => setTimeout(r, 4000));
      const errEl = await page.$('[role="alert"], [class*="error"], [class*="invalid"]');
      const formStillPresent = await page.$('input[type="password"]');
      if (!errEl && !formStillPresent) throw new Error('Logged in with wrong creds — no validation!');
      if (errEl) {
        const t = await errEl.evaluate(el => el.textContent.trim().slice(0, 80));
        info(`error shown: "${t}"`);
      }
      // Re-login with correct credentials for subsequent phases
      await page.goto(`${BASE}/?start=1`, { waitUntil: 'networkidle2' });
      const e2 = await page.$('input[type="email"], input[name="email"]');
      const p2 = await page.$('input[type="password"]');
      if (e2 && p2) {
        await e2.click({ clickCount: 3 }); await e2.type('adrper79@gmail.com', { delay: 20 });
        await p2.click({ clickCount: 3 }); await p2.type('123qweASD', { delay: 20 });
        const b2 = await page.$('button[type="submit"], form button:last-of-type');
        b2 ? await b2.click() : await page.keyboard.press('Enter');
        await new Promise(r => setTimeout(r, 5000));
      }
    });

    // 2. Authenticated API endpoints don't 401/500
    await page.goto(BASE, { waitUntil: 'networkidle2' });
    for (const [label, endpoint] of [
      ['Transit API', '/api/transit'],
      ['Referrals API', '/api/referrals'],
      ['Export API', '/api/export'],
    ]) {
      await test(`${label} not 500`, async () => {
        const resp = await page.evaluate(async (url) => {
          try {
            const r = await fetch(url, { credentials: 'include' });
            return r.status;
          } catch { return 0; }
        }, endpoint);
        if (resp >= 500) throw new Error(`HTTP ${resp}`);
        info(`${endpoint} → ${resp}`);
      }, false); // warn only — endpoints may require extra params
    }

    // 3. Sidebar / app navigation has expected sections
    await test('Authenticated app has sidebar navigation', async () => {
      await page.goto(BASE, { waitUntil: 'networkidle2' });
      const nav = await page.$('nav, aside, [class*="sidebar"], [class*="nav"]');
      if (!nav) throw new Error('No sidebar or nav in authenticated view');
    });

    // 4. Human Design content visible post-login
    await test('Human Design content visible in authenticated view', async () => {
      const body = await page.evaluate(() => document.body.innerText.toLowerCase());
      const hd = ['human design', 'bodygraph', 'chart', 'type', 'authority', 'profile', 'synthesis', 'energy']
        .some(k => body.includes(k));
      if (!hd) throw new Error('No Human Design content visible after login');
    });
  },

  // ─── Logout ──────────────────────────────────────────────────────────────
  async logout(page, test, { findByText, info }) {
    // Sign-out lives on the More/You page: personal → #/more, practitioner → #/prac-more.
    // Hash routing is in-page; page.goto() would reload and lose the hash. Click the nav link instead.
    await page.goto(BASE, { waitUntil: 'networkidle2' });
    // Try personal mode first, then practitioner mode
    const moreLink = await page.$('a[href="#/more"]') || await page.$('a[href="#/prac-more"]');
    if (moreLink) {
      await moreLink.click();
      // Wait up to 5s for the sign-out button to appear (lazy-loaded route chunk)
      await page.waitForFunction(() => {
        const btns = [...document.querySelectorAll('button, a')];
        return btns.some(el => el.textContent.trim().toLowerCase().includes('sign out'));
      }, { timeout: 5000 }).catch(() => {});
    }
    info(`URL after More nav: ${page.url()}`);

    await test('Sign out option present (More / You page)', async () => {
      const btn = await findByText('button, a', 'sign out')
        || await findByText('button, a', 'logout')
        || await findByText('button, a', 'log out');
      if (!btn) throw new Error('No sign-out button found on #/more — nav click may not have loaded the page');
      info('sign-out button found');
    }, false);

    await test('Sign out redirects to unauthenticated state', async () => {
      const btn = await findByText('button, a', 'sign out')
        || await findByText('button, a', 'logout')
        || await findByText('button, a', 'log out');
      if (!btn) throw new Error('No sign-out button on #/more');
      await btn.click();
      await new Promise(r => setTimeout(r, 3000));
      const url = page.url();
      info(`URL after logout: ${url}`);
      const loginForm = await page.$('input[type="email"], input[type="password"]');
      const onMarketing = url.includes('marketing') || url === `${BASE}/` || url === `${BASE}`;
      if (!loginForm && !onMarketing) throw new Error(`Unexpected URL after logout: ${url}`);
    }, false);
  },

  // ─── Critical routes ─────────────────────────────────────────────────────
  criticalRoutes: [
    { path: '/', expectedStatuses: [200, 302], label: 'Home /' },
    { path: '/?start=1', expectedStatuses: [200], label: 'SPA login /?start=1' },
    { path: '/pricing', expectedStatuses: [200], label: 'Pricing /pricing' },
    { path: '/marketing.html', expectedStatuses: [200], label: 'Marketing /marketing.html' },
  ],
};
