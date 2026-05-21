import { test, expect } from '@playwright/test';
import { collectConsoleErrors } from '../helpers/console';

// J3: Open layout switcher → pick Netflix → confirm shell mounts.
// The switcher opens via the "View" button (Ctrl+L is intercepted by Chromium
// for address-bar focus, per the comment in layout-screenshots.spec.js).

test.describe('Layout switcher — pick Netflix', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    // Pick any profile to get past the picker. Use first visible tile.
    const tile = page.locator('button[aria-label*="profile"]').first();
    if (await tile.count()) await tile.click();
    await expect(page.getByText(/DaveTV/i).first()).toBeVisible({ timeout: 8000 });
  });

  test('View -> Netflix mounts the Netflix shell', async ({ page }) => {
    const errors = collectConsoleErrors(page);

    const viewBtn = page.locator('button', { hasText: /View/i }).first();
    await expect(viewBtn).toBeVisible();
    await viewBtn.click();

    // Modal heading "Choose Your View" comes from LayoutSwitcher.jsx.
    await expect(page.locator('text=Choose Your View').first()).toBeVisible({
      timeout: 3000,
    });

    // Click the Netflix card — has the cat label "Streaming Services".
    // Be defensive: pick the first Netflix-text button inside the modal.
    const netflix = page.getByRole('dialog').getByRole('button', { name: /Netflix/i }).first();
    await expect(netflix).toBeVisible();
    await netflix.click();

    // Modal closes, shell remounts — assert the brand still paints (no crash).
    await expect(page.getByText(/DaveTV/i).first()).toBeVisible({ timeout: 5000 });

    // Filter out the favicon + benign warnings; no real errors expected.
    expect(errors(), 'errors after Netflix shell mount').toEqual([]);
  });
});
