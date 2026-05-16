import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:5173',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
  },
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 5173',
    url: 'http://127.0.0.1:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  projects: [
    {
      name: 'iphone-12',
      use: { ...devices['iPhone 12'] },
    },
    {
      name: 'iphone-se3',
      use: { ...devices['iPhone SE (3rd gen)'] },
    },
    {
      name: 'pixel-5',
      use: { ...devices['Pixel 5'] },
    },
    {
      name: 'ipad-mini',
      use: { ...devices['iPad Mini'] },
    },
  ],
});
