import { test, expect } from '@playwright/test';
import { collectConsoleErrors } from '../helpers/console';

// J3: Open layout switcher → pick Netflix → confirm shell mounts.
// The switcher opens via the "Look" button (Ctrl+L is intercepted by Chromium
// for address-bar focus, per the comment in layout-screenshots.spec.js).

test.describe('Layout switcher — pick Netflix', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    // Pick any profile to get past the picker. Use first visible tile.
    const tile = page.locator('button[aria-label*="profile"]').first();
    if (await tile.count()) await tile.click();
    await expect(page.getByText(/HermesTV/i).first()).toBeVisible({ timeout: 8000 });
  });

  test('Look → Netflix mounts the Netflix shell', async ({ page }) => {
    const errors = collectConsoleErrors(page);

    const lookBtn = page.locator('button', { hasText: /Look/i }).first();
    await expect(lookBtn).toBeVisible();
    await lookBtn.click();

    // Modal heading "Choose Your Look" comes from LayoutSwitcher.jsx.
    await expect(page.locator('text=Choose Your Look').first()).toBeVisible({
      timeout: 3000,
    });

    // Click the Netflix card — has the cat label "Streaming Services".
    // Be defensive: pick the first Netflix-text button inside the modal.
    const netflix = page.getByRole('dialog').getByRole('button', { name: /Netflix/i }).first();
    await expect(netflix).toBeVisible();
    await netflix.click();

    // Modal closes, shell remounts — assert the brand still paints (no crash).
    await expect(page.getByText(/HermesTV/i).first()).toBeVisible({ timeout: 5000 });

    // Filter out the favicon + benign warnings; no real errors expected.
    expect(errors(), 'errors after Netflix shell mount').toEqual([]);
  });
});
