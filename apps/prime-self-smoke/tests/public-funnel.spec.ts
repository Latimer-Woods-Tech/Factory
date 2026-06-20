import { test, expect, type Page } from '@playwright/test';

// process.env is correct here: this is a Playwright test running in Node.js on
// GitHub Actions, not a Cloudflare Worker. Factory's "no process.env" constraint
// applies to Worker source files only, not to Playwright test infrastructure.
const BASE = process.env.BASE_URL ?? 'https://selfprime.net';
const API_BASE = process.env.API_BASE_URL ?? 'https://api.selfprime.net';
const smokeUserEmail = process.env.SMOKE_USER_EMAIL ?? '';
const smokeUserPassword = process.env.SMOKE_USER_PASSWORD ?? '';
const visibleEmailInput = 'input[name="email"]:visible, input[type="email"]:visible';
const visiblePasswordInput = '#auth-password:visible, input[name="password"]:visible, input[type="password"]:visible';

async function ensureAuthFormOpen(page: import('@playwright/test').Page) {
  if ((await page.locator(visibleEmailInput).count()) > 0) return;

  const signInButton = page.getByRole('button', { name: /sign in/i }).first();
  const signInLink = page.getByRole('link', { name: /sign in/i }).first();

  if (await signInButton.isVisible().catch(() => false)) {
    await signInButton.click();
  } else if (await signInLink.isVisible().catch(() => false)) {
    await signInLink.click();
  } else {
    await page.goto('/?start=1');
  }

  if ((await page.locator(visibleEmailInput).count()) === 0) {
    await page.goto('/?start=1');
  }

  await expect(page.locator(visibleEmailInput).first()).toBeVisible({ timeout: 15_000 });
  await expect(page.locator(visiblePasswordInput).first()).toBeVisible({ timeout: 15_000 });
}

async function submitAuthForm(page: import('@playwright/test').Page) {
  const emailInput = page.locator(visibleEmailInput).first();
  await expect(emailInput).toBeVisible({ timeout: 15_000 });

  // Prefer the submit control in the same form as the active email field.
  const formSubmit = emailInput
    .locator('xpath=ancestor::form[1]')
    .locator('button[type="submit"], input[type="submit"], button:has-text("Sign in"), button:has-text("Continue")')
    .first();

  if (await formSubmit.isVisible().catch(() => false)) {
    await formSubmit.click();
    return;
  }

  // Fallback for flows that render auth controls outside of a formal <form>.
  const fallbackSubmit = page
    .locator('button[type="submit"], input[type="submit"], button:has-text("Sign in"), button:has-text("Continue")')
    .first();
  await expect(fallbackSubmit).toBeVisible({ timeout: 15_000 });
  await fallbackSubmit.click();
}

// ---------------------------------------------------------------------------
// Public funnel — no credentials required
// ---------------------------------------------------------------------------

test.describe('Homepage', () => {
  test('loads with correct title and hero copy', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/Prime Self/);
    await expect(page.locator('body')).toContainText('Prime Self');
  });

  test('hero CTA "Get your free chart" is visible and scrolls to the in-page chart calculator', async ({ page }) => {
    // Production homepage moved the free-chart entry point from the auth
    // overlay (/?start=1 or /pricing#free-chart) to an in-page anonymous
    // calculator anchored at #landing-chart-calc. The hero CTA is now a
    // same-page anchor link — no auth required to compute a chart.
    // Triage 2026-05-23: smoke regression RC-4 / Test A.
    await page.goto('/');
    const cta = page.getByRole('link', { name: /get your free chart/i }).first();
    await expect(cta).toBeVisible();
    await cta.click();
    await expect(page).toHaveURL(/#landing-chart-calc$/);
    await expect(page.locator('#landing-chart-calc')).toBeVisible();
  });

  test('auth entry renders the sign-in overlay contract at /?start=1', async ({ page }) => {
    await page.goto('/?start=1');
    await ensureAuthFormOpen(page);
    await expect(page.locator('body')).toContainText(/sign in|log in|continue/i);
  });
});

// ---------------------------------------------------------------------------
// Route redirects — Phase 1 fix verification
// ---------------------------------------------------------------------------

test.describe('Route redirects', () => {
  test('canonical auth entry URL is healthy', async ({ page }) => {
    const response = await page.goto('/?start=1');
    expect(response?.status()).toBeLessThan(400);
    await ensureAuthFormOpen(page);
    await expect(page).toHaveURL(/(start=1|auth=required|modal=login)/);
  });
});

// ---------------------------------------------------------------------------
// Marketing pages
// ---------------------------------------------------------------------------

test.describe('Marketing pages', () => {
  test('pricing page loads with plan copy', async ({ page }) => {
    await page.goto('/pricing');
    expect(page.url()).toContain('/pricing');
    await expect(page).toHaveTitle(/Prime Self/i);
  });

  test('practitioners page loads', async ({ page }) => {
    await page.goto('/practitioners');
    await expect(page).toHaveTitle(/Practitioner/i);
  });

  test('privacy policy loads', async ({ page }) => {
    await page.goto('/privacy.html');
    await expect(page.locator('body')).toContainText('Privacy');
  });

  test('terms loads', async ({ page }) => {
    await page.goto('/terms.html');
    await expect(page.locator('body')).toContainText('Term');
  });
});

// ---------------------------------------------------------------------------
// Chart input flow — public, no auth
// ---------------------------------------------------------------------------

test.describe('Chart flow entry', () => {
  test('/?start=1 renders the auth or chart-entry surface', async ({ page }) => {
    await page.goto('/?start=1');
    await expect(page).toHaveTitle(/Prime Self/);
    const body = page.locator('body');
    await expect(body).toContainText(/sign in|birth|chart|blueprint|date/i);
  });
});

// ---------------------------------------------------------------------------
// API health
// ---------------------------------------------------------------------------

test.describe('API health', () => {
  test('api.selfprime.net/api/health returns ok', async ({ request }) => {
    const response = await request.get(`${API_BASE}/api/health`);
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.status).toBe('ok');
  });

  test('Worker health returns ok with service field', async ({ request }) => {
    const workerUrl = process.env.WORKER_URL ?? 'https://api.selfprime.net';
    const response = await request.get(`${workerUrl}/health`);
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.status).toBe('ok');
    expect(body.service).toBe('selfprime-api');
  });
});

// ---------------------------------------------------------------------------
// CSP / SRI / static-asset integrity
// ---------------------------------------------------------------------------

/**
 * Patterns that indicate a browser-blocked CSP or SRI violation in the
 * console.  Matches Chrome/Firefox/Safari wording.
 */
const CSP_VIOLATION_RE =
  /refused to (load|execute|apply|connect)|content security policy|violates the following|sri.*integrity|integrity.*sha|blocked by.*csp/i;

/** First-party JS files that must exist on the pricing page. */
const REQUIRED_PRICING_JS = ['/js/pricing-schema.js', '/js/trust-proof-content.js'];

/** Normalised origin of BASE (e.g. "https://selfprime.net") for exact-origin comparison. */
const BASE_ORIGIN = new URL(BASE).origin;

function attachCspListener(page: Page): () => string[] {
  const blockedMessages: string[] = [];
  page.on('console', (msg) => {
    const text = msg.text();
    if (CSP_VIOLATION_RE.test(text)) {
      blockedMessages.push(`[${msg.type()}] ${text}`);
    }
  });
  // SecurityError thrown when a blocked script body is evaluated
  page.on('pageerror', (err) => {
    if (CSP_VIOLATION_RE.test(err.message)) {
      blockedMessages.push(`[pageerror] ${err.message}`);
    }
  });
  return () => blockedMessages;
}

function assertNoViolations(violations: string[], label: string): void {
  expect(violations, `${label}:\n  ${violations.join('\n  ')}`).toHaveLength(0);
}

test.describe('CSP and static-asset integrity', () => {
  test('/ — no CSP/SRI blocked-script console errors', async ({ page }) => {
    const getBlocked = attachCspListener(page);
    await page.goto('/');
    // networkidle may never fire on pages with long-poll/SSE — domcontentloaded
    // guarantees all synchronously-loaded scripts have been evaluated.
    await page.waitForLoadState('domcontentloaded');
    assertNoViolations(getBlocked(), 'CSP/SRI violation(s) on /');
  });

  test('/pricing — no CSP/SRI blocked-script console errors', async ({ page }) => {
    const getBlocked = attachCspListener(page);
    await page.goto('/pricing');
    await page.waitForLoadState('domcontentloaded');
    assertNoViolations(getBlocked(), 'CSP/SRI violation(s) on /pricing');
  });

  test('pricing page — required first-party JS assets return 200 (no 404)', async ({ page }) => {
    const notFound: string[] = [];

    page.on('response', (response) => {
      // Guard against subdomain-bypass: compare origin strictly, not startsWith on the raw URL.
      const parsed = new URL(response.url());
      if (parsed.origin === BASE_ORIGIN && response.status() === 404) {
        if (REQUIRED_PRICING_JS.includes(parsed.pathname)) {
          notFound.push(`${parsed.pathname} → 404`);
        }
      }
    });

    await page.goto('/pricing');
    await page.waitForLoadState('domcontentloaded');

    // Explicitly probe each required asset so the test fails even when the
    // <script> tag referencing it has already been removed from the page.
    for (const asset of REQUIRED_PRICING_JS) {
      const response = await page.request.get(`${BASE_ORIGIN}${asset}`);
      if (response.status() === 404) {
        notFound.push(`${asset} → 404 (direct probe)`);
      }
    }

    assertNoViolations(notFound, 'First-party JS 404s on /pricing');
  });
});

// ---------------------------------------------------------------------------
// Authenticated flow — skipped unless SMOKE_USER_EMAIL + SMOKE_USER_PASSWORD are set
// ---------------------------------------------------------------------------

test.describe('Authenticated flow', () => {
  test.beforeEach(() => {
    test.skip(
      !smokeUserEmail || !smokeUserPassword,
      'SMOKE_USER_EMAIL / SMOKE_USER_PASSWORD not configured — skipping authenticated tests',
    );
  });

  test('logs in with test credentials and sees chart screen', async ({ page }) => {
    await page.goto('/?start=1');
    await ensureAuthFormOpen(page);
    await page.locator(visibleEmailInput).first().fill(smokeUserEmail);
    await page.locator(visiblePasswordInput).first().fill(smokeUserPassword);
    await submitAuthForm(page);
    await expect(page.locator('body')).toContainText(/blueprint|chart|reading|today|relationships|more/i, { timeout: 20_000 });
  });

  test('invalid credentials show error message', async ({ page }) => {
    await page.goto('/?start=1');
    await ensureAuthFormOpen(page);
    await page.locator(visibleEmailInput).first().fill('invalid@example.com');
    await page.locator(visiblePasswordInput).first().fill('wrongpassword123');
    await submitAuthForm(page);

    // Different clients can reject here via browser validation, client-side form rules,
    // or server auth errors. The smoke contract is that sign-in must be rejected.
    await expect(page).toHaveURL(/(start=1|auth=required|modal=login)/, { timeout: 12_000 });
    await expect(page.locator('body')).toContainText(
      /invalid|incorrect|unauthorized|error|try again|please enter a valid email address|please wait/i,
      { timeout: 12_000 },
    );
  });
});
