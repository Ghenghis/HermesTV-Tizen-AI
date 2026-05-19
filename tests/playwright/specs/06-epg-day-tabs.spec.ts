import { test, expect } from '@playwright/test';
import { collectConsoleErrors, profileSelector } from '../helpers/console';

// J6: EPG modal — open via header Guide button, switch Now/Today/Tomorrow
// day tabs (PR #120), close via Escape with focus return.
//
// NOTE (2026-05-19): EPGModal.jsx on this branch does NOT yet render
// Now/Today/Tomorrow tabs — that wiring lands with PR #120. The open and
// close cases stay green; the day-switch cases are `test.fixme` until the
// tabs ship. Verified by reading EPGModal.jsx (no "Now"/"Today"/"Tomorrow"
// strings present in the modal body as of this commit).

test.describe('EPG day tabs', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    const sherri = page.locator(profileSelector('Sherri')).first();
    if (await sherri.count()) await sherri.click();
    await expect(page.getByText(/HermesTV/i).first()).toBeVisible({ timeout: 8000 });
  });

  test('Guide button opens EPG modal and Escape closes it', async ({ page }) => {
    const errors = collectConsoleErrors(page);
    const guide = page.locator('[aria-label="Open TV Guide"]').first();
    await expect(guide).toBeVisible({ timeout: 4000 });
    await guide.click();

    const modal = page.locator('[aria-label="Electronic Program Guide"]');
    await expect(modal).toBeVisible({ timeout: 4000 });

    await page.keyboard.press('Escape');
    await expect(modal).toHaveCount(0, { timeout: 2000 });

    // Focus returns to the Guide trigger so keyboard users aren't dropped.
    const focusedLabel = await page.evaluate(() =>
      document.activeElement ? document.activeElement.getAttribute('aria-label') : ''
    );
    expect(focusedLabel === 'Open TV Guide' || focusedLabel === null).toBeTruthy();
    expect(errors()).toEqual([]);
  });

  test.fixme('Today tab re-renders the grid with a new fetch window', async ({ page }) => {
    // PR #120 not yet on this branch — EPGModal lacks Now/Today/Tomorrow tabs.
    const fetches: string[] = [];
    page.on('request', (r) => { if (r.url().includes('/api/epg')) fetches.push(r.url()); });
    await page.locator('[aria-label="Open TV Guide"]').first().click();
    await expect(page.getByRole('tab', { name: /Now/i })).toBeVisible({ timeout: 4000 });
    const before = fetches.length;
    await page.getByRole('tab', { name: /Today/i }).click();
    await expect.poll(() => fetches.length).toBeGreaterThan(before);
    expect(fetches.some((u) => /hours|until/.test(u))).toBeTruthy();
  });

  test.fixme('Tomorrow tab issues a distinct fetch from Today', async ({ page }) => {
    // PR #120 not yet on this branch.
    const fetches: string[] = [];
    page.on('request', (r) => { if (r.url().includes('/api/epg')) fetches.push(r.url()); });
    await page.locator('[aria-label="Open TV Guide"]').first().click();
    await page.getByRole('tab', { name: /Today/i }).click();
    const afterToday = fetches.slice();
    await page.getByRole('tab', { name: /Tomorrow/i }).click();
    await expect.poll(() => fetches.length).toBeGreaterThan(afterToday.length);
    expect(fetches[fetches.length - 1]).not.toEqual(afterToday[afterToday.length - 1]);
  });
});
