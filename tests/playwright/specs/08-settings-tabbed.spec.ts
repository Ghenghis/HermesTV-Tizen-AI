import { test, expect } from '@playwright/test';
import { collectConsoleErrors } from '../helpers/console';

// J8: SettingsPanelTabbed — gear opens the panel, each of the 11 tabs from
// TABS[] in SettingsPanelTabbed.jsx renders content, Esc closes the modal.

const TABS = [
  'Playlists', 'General', 'Appearance', 'Features', 'Network',
  'Playback', 'Parental', 'Backup', 'Hotkeys', 'Diagnostics', 'About',
];

test.describe('Settings tabbed panel', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    const tile = page.locator('button[aria-label*="profile"]').first();
    if (await tile.count()) await tile.click();
    await expect(page.getByText(/DaveTV/i).first()).toBeVisible({ timeout: 8000 });
  });

  test('gear opens panel, every tab renders, Esc closes', async ({ page }) => {
    const errors = collectConsoleErrors(page);

    const gear = page.locator('button[aria-label="Settings"]').first();
    await expect(gear).toBeVisible({ timeout: 6000 });
    await gear.click();

    const dialog = page.locator('div[role="dialog"][aria-label="Settings"]');
    await expect(dialog).toBeVisible({ timeout: 4000 });

    const tabpanel = dialog.locator('div[role="tabpanel"]');

    for (const label of TABS) {
      const tab = dialog.locator(`button[role="tab"]`, { hasText: new RegExp(`^${label}$`) }).first();
      await expect(tab, `tab "${label}" should exist`).toBeVisible();
      await tab.click();
      await expect(tab).toHaveAttribute('aria-selected', 'true');

      // The body must render real content — not just a sustained "Loading…"
      // spinner. We give lazy chunks up to 4s to settle, then assert there's
      // visible text other than the suspense fallback.
      await expect(tabpanel).toBeVisible();
      await page.waitForTimeout(150);
      const txt = (await tabpanel.innerText()).trim();
      expect(txt.length, `tab "${label}" body empty`).toBeGreaterThan(0);
      // If it's only the suspense fallback, wait for the chunk to land.
      if (/^Loading…?$/i.test(txt)) {
        await expect.poll(async () => (await tabpanel.innerText()).trim(),
          { timeout: 4000 }).not.toMatch(/^Loading…?$/i);
      }
    }

    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden({ timeout: 2000 });
    expect(errors()).toEqual([]);
  });
});
