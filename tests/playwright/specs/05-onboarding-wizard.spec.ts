import { test, expect } from '@playwright/test';
import { collectConsoleErrors } from '../helpers/console';

// J5: 5-step onboarding wizard end-to-end.
// Steps (from OnboardingWizard.jsx): welcome → tv_model → profile → provider → tour.
// The wizard renders when localStorage 'hermestv:onboarded' is not 'true'.

test.describe('Onboarding wizard — 5 steps', () => {
  test.beforeEach(async ({ context }) => {
    // Clear the onboarded flag for every run.
    await context.addInitScript(() => {
      try {
        window.localStorage.removeItem('hermestv:onboarded');
        window.localStorage.removeItem('hermestv:tv_model');
      } catch {}
    });
  });

  test('walks all 5 steps and sets the onboarded flag', async ({ page }) => {
    const errors = collectConsoleErrors(page);
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    // Step 1 — Welcome. CTA labelled "Get started".
    const getStarted = page.getByRole('button', { name: /Get started/i }).first();
    await expect(getStarted).toBeVisible({ timeout: 8000 });
    await getStarted.click();

    // Step 2 — TV model. Pick the QN85 row.
    const qn85 = page.getByRole('button', { name: /QN85/i }).first();
    await expect(qn85).toBeVisible({ timeout: 4000 });
    await qn85.click();
    await page.getByRole('button', { name: /^Next$/i }).first().click();

    // Step 3 — Profile. The embedded ProfilePicker. Pick Sherri.
    const sherri = page.locator('button[aria-label*="Sherri"]').first();
    await expect(sherri).toBeVisible({ timeout: 4000 });
    await sherri.click();

    // Step 4 — Provider. We always Skip to keep the spec fast + offline.
    const skipProvider = page.getByRole('button', { name: /Skip/i }).first();
    await expect(skipProvider).toBeVisible({ timeout: 4000 });
    await skipProvider.click();

    // Step 5 — Tour. The final CTA finishes the wizard.
    const startWatching = page.getByRole('button', { name: /Start watching/i }).first();
    await expect(startWatching).toBeVisible({ timeout: 4000 });
    await startWatching.click();

    // Assert the flag persisted.
    const flag = await page.evaluate(() => window.localStorage.getItem('hermestv:onboarded'));
    expect(flag).toBe('true');
    expect(errors()).toEqual([]);
  });
});
