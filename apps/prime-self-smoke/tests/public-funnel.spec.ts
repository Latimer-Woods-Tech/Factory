import { test, expect } from '@playwright/test';

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

  test('hero CTA "Get your free chart" is visible and routes to the auth overlay entry', async ({ page }) => {
    await page.goto('/');
    const cta = page.getByRole('link', { name: /get your free chart/i }).first();
    await expect(cta).toBeVisible();
    await cta.click();
    await expect(page).toHaveURL(/(start=1|pricing#free-chart)/);
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

  test('Worker health returns ok with env field', async ({ request }) => {
    const workerUrl = process.env.WORKER_URL ?? 'https://prime-self.adrper79.workers.dev';
    const response = await request.get(`${workerUrl}/health`);
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.status).toBe('ok');
    expect(body.env).toBe('production');
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
