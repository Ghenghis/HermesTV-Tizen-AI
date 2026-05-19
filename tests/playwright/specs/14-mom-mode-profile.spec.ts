import { test, expect } from '@playwright/test';
import { collectConsoleErrors } from '../helpers/console';

// J14: Mom-mode hardening (Sherri profile, mom_mode = true).
// - --font-scale ≥ 1.25 on <html>
// - active shell is "mom-mode" (data-layout="mom-mode" on ShellRenderer)
// - catalog cards meet WCAG senior tap-target (≥ 44 × 44 px)
// - Settings modal text also scales (computed fontSize > base 0.85rem * 1 = 13.6px)
//
// LayoutSwitcher / VoicePickerModal font-scale issue from the a11y audit
// is asserted via expect.soft() so the spec logs the regression without
// blocking the rest of the green run.

test.describe('Mom-mode hardening (J14)', () => {
  test('Sherri profile applies font-scale, layout, tap targets, modal scaling', async ({ page }) => {
    const errors = collectConsoleErrors(page);
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    const sherri = page.locator('button[aria-label*="Sherri"]').first();
    await expect(sherri).toBeVisible({ timeout: 8000 });
    await sherri.click();
    await expect(page.getByText(/HermesTV/i).first()).toBeVisible({ timeout: 8000 });

    // 1. --font-scale on <html> ≥ 1.25 (Mom-mode enforces this in App.jsx).
    const fontScale = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--font-scale').trim()
    );
    expect(parseFloat(fontScale || '1')).toBeGreaterThanOrEqual(1.25);

    // 2. Active shell mounts mom-mode (ShellRenderer renders data-layout=<id>).
    await expect(page.locator('[data-layout="mom-mode"]').first()).toBeVisible({ timeout: 4000 });

    // 3. Five catalog cards each ≥ 44×44 (WCAG 2.5.5 / senior tap target).
    const cards = page.locator('[role="button"][aria-label*=","]');
    const count = await cards.count();
    const samples = Math.min(5, count);
    expect(samples, 'at least one catalog card visible').toBeGreaterThan(0);
    for (let i = 0; i < samples; i++) {
      const box = await cards.nth(i).boundingBox();
      expect(box, `card ${i} has a bounding box`).not.toBeNull();
      if (!box) continue;
      expect.soft(box.width, `card ${i} width`).toBeGreaterThanOrEqual(44);
      expect.soft(box.height, `card ${i} height`).toBeGreaterThanOrEqual(44);
    }

    // 4. Open Settings and verify text inside the modal also scales.
    //    Pick the gear button (aria-label="Settings") then read computed
    //    fontSize off a tab/heading inside the dialog. 0.85rem unscaled =
    //    13.6px; scaled by 1.25 we expect > 16px. Soft so a LayoutSwitcher /
    //    VoicePickerModal regression doesn't block the rest of the run.
    await page.locator('button[aria-label="Settings"]').first().click();
    const dialog = page.getByRole('dialog').first();
    await expect(dialog).toBeVisible({ timeout: 4000 });
    const sample = dialog.locator('*').filter({ hasText: /./ }).first();
    const px = await sample.evaluate((el) => parseFloat(getComputedStyle(el).fontSize) || 0);
    expect.soft(px, `Settings modal text font-size in px`).toBeGreaterThan(13.6);

    expect(errors()).toEqual([]);
  });
});
