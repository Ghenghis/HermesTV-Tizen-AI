import { test, expect, Page } from '@playwright/test';
import { collectConsoleErrors } from '../helpers/console';

// J16: Tizen Back cascade (App.jsx 431-495). installTizenKeyHandler in
// utils/tizenKeyMap.js listens for keyCode 10009 (Back) / 10182 (Exit) —
// the browser Escape (27) is NOT routed there. Dispatch a synthetic
// keydown to drive the shared cascade.

async function tizenBack(page: Page) {
  await page.evaluate(() => document.dispatchEvent(new KeyboardEvent('keydown',
    { key: 'Backspace', keyCode: 10009, which: 10009, bubbles: true, cancelable: true })));
}
async function boot(page: Page) {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  const t = page.locator('button[aria-label*="profile"]').first();
  if (await t.count()) await t.click();
  await expect(page.getByText(/HermesTV/i).first()).toBeVisible({ timeout: 8000 });
}
const cardLoc = (page: Page) =>
  page.locator('[role="button"][aria-label*="Details for"], button[aria-label*="Details for"]').first();

test.describe('Tizen Back cascade — keyCode 10009 closes top-most modal', () => {
  test('PlayerModal: open via card → Play → Back closes it', async ({ page }) => {
    const errors = collectConsoleErrors(page);
    await boot(page);
    const card = cardLoc(page);
    test.skip(!(await card.count()), 'No content card with "Details for" name in this env');
    await card.click();
    await expect(page.locator('[role="dialog"][aria-label^="Details for"]')).toBeVisible({ timeout: 4000 });
    const playBtn = page.locator('button', { hasText: /^(Play|Watch)/i }).first();
    test.skip(!(await playBtn.count()), 'No Play/Watch button surfaced for this card');
    await playBtn.click();
    const player = page.locator('[aria-label="Close player"]');
    await expect(player).toBeVisible({ timeout: 4000 });
    await tizenBack(page);
    await expect(player).toHaveCount(0, { timeout: 3000 });
    expect(errors()).toEqual([]);
  });

  const layers: Array<[string, string, string]> = [
    ['MultiviewModal', '[aria-label="Open Multiview"]', '[aria-label="Multiview player"]'],
    ['EPGModal', '[aria-label="Open TV Guide"]', '[aria-label="Electronic Program Guide"]'],
    ['SettingsPanelTabbed', '[aria-label="Settings"]', '[role="dialog"][aria-label="Settings"]'],
  ];
  for (const [name, trigger, modal] of layers) {
    test(`${name}: Tizen Back closes it`, async ({ page }) => {
      await boot(page);
      await page.locator(trigger).first().click();
      const m = page.locator(modal);
      await expect(m).toBeVisible({ timeout: 4000 });
      await tizenBack(page);
      await expect(m).toHaveCount(0, { timeout: 3000 });
    });
  }

  test('MediaDetailPanel: Tizen Back clears selectedItem', async ({ page }) => {
    await boot(page);
    const card = cardLoc(page);
    test.skip(!(await card.count()), 'No content card available');
    await card.click();
    const d = page.locator('[role="dialog"][aria-label^="Details for"]');
    await expect(d).toBeVisible({ timeout: 4000 });
    await tizenBack(page);
    await expect(d).toHaveCount(0, { timeout: 3000 });
  });

  test('no modal: Back is a no-op, app stays mounted', async ({ page }) => {
    const errors = collectConsoleErrors(page);
    await boot(page);
    await tizenBack(page);
    await expect(page.getByText(/HermesTV/i).first()).toBeVisible({ timeout: 2000 });
    expect(errors()).toEqual([]);
  });

  test('PlaylistImport over Settings → Back closes import AND re-opens Settings (App.jsx 467-472)', async ({ page }) => {
    await boot(page);
    await page.locator('[aria-label="Settings"]').first().click();
    await expect(page.locator('[role="dialog"][aria-label="Settings"]')).toBeVisible({ timeout: 4000 });
    await page.locator('button', { hasText: /Import playlist/i }).first().click();
    const imp = page.locator('[role="dialog"][aria-label="Import playlist"]');
    await expect(imp).toBeVisible({ timeout: 4000 });
    await tizenBack(page);
    await expect(imp).toHaveCount(0, { timeout: 3000 });
    await expect(page.locator('[role="dialog"][aria-label="Settings"]')).toBeVisible({ timeout: 3000 });
  });
});
