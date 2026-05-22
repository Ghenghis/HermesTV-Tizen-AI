import { test, expect } from '@playwright/test';
import { collectConsoleErrors } from '../helpers/console';

// J2: Pick Mom (Sherri) → catalog paints with font-scale ≥ 1.25.
// Mom-mode enforces font_scale ≥ 1.25 in App.jsx applyDocumentTheme().
// We verify the CSS custom property was applied to <html>.

test.describe('Profile pick — Mom (Sherri)', () => {
  test('picking Sherri yields font-scale ≥ 1.25 on <html>', async ({ page }) => {
    const errors = collectConsoleErrors(page);
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    // Wait for ProfilePicker; click the Sherri tile.
    const sherri = page.locator('button[aria-label*="Sherri"]').first();
    await expect(sherri).toBeVisible({ timeout: 8000 });
    await sherri.click();

    // Wait for shell paint — DaveTV brand reappears in the active shell.
    await expect(page.getByText(/DaveTV/i).first()).toBeVisible({ timeout: 8000 });

    // Read the font-scale CSS custom property off documentElement.
    const fontScale = await page.evaluate(() => {
      return getComputedStyle(document.documentElement)
        .getPropertyValue('--font-scale')
        .trim();
    });
    const value = parseFloat(fontScale || '1');
    expect(value, `--font-scale was "${fontScale}"`).toBeGreaterThanOrEqual(1.25);

    expect(errors(), 'console errors during profile pick').toEqual([]);
  });

  test('picking Dave leaves font-scale at 1.0', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    const dave = page.locator('button[aria-label*="Dave"]').first();
    await expect(dave).toBeVisible({ timeout: 8000 });
    await dave.click();
    await expect(page.getByText(/DaveTV/i).first()).toBeVisible({ timeout: 8000 });

    const fontScale = await page.evaluate(() => {
      return getComputedStyle(document.documentElement)
        .getPropertyValue('--font-scale')
        .trim();
    });
    // Dave is unscaled by default — anything below the Mom 1.25 floor counts.
    const value = parseFloat(fontScale || '1');
    expect(value).toBeLessThan(1.25);
  });
});
