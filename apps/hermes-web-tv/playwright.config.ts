import { defineConfig, devices } from '@playwright/test';

// HermesTV web-app Playwright config.
//
// This is the *per-app* config used by the journey specs in
// `tests/playwright/specs/`. The legacy `tests/playwright/playwright.config.js`
// stays in place for the existing visual smoke (`layout-screenshots.spec.js`)
// so we do not break that pipeline.
//
// baseURL is overridable via PLAYWRIGHT_BASE_URL — defaults to the Vite dev
// server on port 5173. Specs assume both the API (3001) and the dev server
// (5173) are running; see `tests/playwright/E2E_TEST_PLAN.md` §6.

const baseURL = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:5173';

export default defineConfig({
  testDir: '../../tests/playwright/specs',
  timeout: 45_000,
  expect: { timeout: 8_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [
    ['list'],
    ['html', { outputFolder: '../../tests/playwright/report', open: 'never' }],
  ],
  use: {
    baseURL,
    headless: true,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 8_000,
    navigationTimeout: 15_000,
  },
  projects: [
    {
      name: 'desktop-1280',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 720 } },
    },
    {
      name: 'tv-1920',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1920, height: 1080 } },
    },
  ],
});
