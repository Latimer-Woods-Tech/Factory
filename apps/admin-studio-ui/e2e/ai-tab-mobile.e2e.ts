import { expect, test } from '@playwright/test';

const STORAGE_KEY = 'studio.session';
const TOKEN = `e2e.eyJ1c2VySWQiOiJlMmUiLCJ1c2VyRW1haWwiOiJlMmVAZXhhbXBsZS5jb20iLCJyb2xlIjoiYWRtaW4ifQ.sig`;
const VIEWPORT_TOLERANCE_PX = 1;

test('mobile composer stays usable and assistant response scrolls into view', async ({ page }) => {
  await page.addInitScript((args: { storageKey: string; token: string }) => {
    sessionStorage.setItem(
      args.storageKey,
      JSON.stringify({
        token: args.token,
        env: 'local',
        user: { id: 'e2e', email: 'e2e@example.com', role: 'admin' },
        expiresAt: Date.now() + 60 * 60 * 1000,
      }),
    );
  }, { storageKey: STORAGE_KEY, token: TOKEN });

  await page.route('**/api/ai/chat', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'text/event-stream',
      body: `data: {"type":"token","delta":"Mock assistant reply"}\n\ndata: {"type":"done"}\n\n`,
    });
  });
  await page.route('**/api/me', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ user: { id: 'e2e', email: 'e2e@example.com', role: 'admin' }, env: 'local' }),
    });
  });

  await page.goto('/');
  await page.getByRole('link', { name: 'AI Chat' }).click();

  const composer = page.getByTestId('ai-composer');
  await expect(composer).toBeVisible();
  await composer.fill('Help me refactor this code');
  await page.getByTestId('ai-send').click();

  await expect(page.getByText('Mock assistant reply')).toBeVisible();

  await expect.poll(async () =>
    page.getByTestId('ai-chat-log-end').evaluate((end, tolerance) => {
      const parent = end.parentElement;
      if (!parent) return false;
      const endRect = end.getBoundingClientRect();
      const parentRect = parent.getBoundingClientRect();
      return (
        endRect.top >= parentRect.top - tolerance &&
        endRect.bottom <= parentRect.bottom + tolerance
      );
    }, VIEWPORT_TOLERANCE_PX),
  ).toBe(true);
});
