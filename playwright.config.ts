import { defineConfig, devices } from '@playwright/test';

/**
 * Root Playwright configuration for Factory monorepo E2E tests.
 *
 * Tiers:
 *   smoke  — critical path only, fast (<2 min). Run on every deploy.
 *   full   — comprehensive coverage. Run nightly.
 *
 * Per-app configs live in apps/{name}/playwright.config.ts.
 * This root config covers cross-app smoke tests in tests/e2e/.
 */
export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  retries: 1,
  workers: 2,

  reporter: [
    ['list'],
    ['html', { open: 'never', outputFolder: 'playwright-report' }],
  ],

  use: {
    baseURL: process.env.BASE_URL ?? 'https://admin.factory.dev',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    trace: 'retain-on-failure',
  },

  projects: [
    {
      // smoke tier: quick sanity checks on every deploy
      name: 'smoke',
      testMatch: '**/*.smoke.ts',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      // full tier: comprehensive E2E on nightly schedule
      name: 'full',
      testMatch: '**/*.spec.ts',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'mobile',
      testMatch: '**/*.smoke.ts',
      use: { ...devices['Pixel 5'] },
    },
  ],
});
