import { test, expect } from '@playwright/test';
import { collectConsoleErrors } from '../helpers/console';

// J9: Parental gate.
//
// FIXME (2026-05-19): PR #113 (gate at App.jsx level) is NOT on main yet —
// grep on apps/hermes-web-tv/src/App.jsx for "parental"/"useParentalGate"
// finds zero matches. The play-time gating cases are therefore fixme'd; the
// PIN-set + verify HTTP cases stay live because routes/parental.js (POST
// /api/parental/pin, POST /api/parental/verify) ARE shipped and exercise
// the SECURITY contract end-to-end.

const API = process.env.HERMES_TV_API || 'http://localhost:3001';

test.describe('Parental controls', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    const sherri = page.locator('button[aria-label*="Sherri"]').first();
    if (await sherri.count()) await sherri.click();
    await expect(page.getByText(/DaveTV/i).first()).toBeVisible({ timeout: 8000 });
  });

  test('API: set PIN then verify (right PIN ok, wrong PIN fails)', async ({ request }) => {
    const set = await request.post(`${API}/api/parental/pin`, {
      data: { profile_id: 'mom_tv', pin: '4242' },
    });
    expect(set.ok(), `set PIN: ${set.status()}`).toBeTruthy();

    const bad = await request.post(`${API}/api/parental/verify`, {
      data: { profile_id: 'mom_tv', pin: '0000' },
    });
    const badJson = await bad.json();
    expect(badJson.ok).toBeFalsy();

    const good = await request.post(`${API}/api/parental/verify`, {
      data: { profile_id: 'mom_tv', pin: '4242' },
    });
    const goodJson = await good.json();
    expect(goodJson.ok).toBeTruthy();
  });

  test.fixme('locked catalog item: Play → ParentalLockOverlay → wrong PIN → right PIN → PlayerModal',
    async ({ page }) => {
      // Depends on PR #113: App.jsx must mount useParentalGate around the
      // play action so a parental_locked / TV-MA item routes through
      // ParentalLockOverlay BEFORE PlayerModal opens.
      const errors = collectConsoleErrors(page);
      const locked = page.locator('[data-parental-locked="true"]').first();
      await expect(locked).toBeVisible({ timeout: 4000 });
      await locked.click();
      const overlay = page.locator('div[role="dialog"][aria-label="Parental lock"]');
      await expect(overlay).toBeVisible({ timeout: 4000 });

      const digits = overlay.locator('input[aria-label^="PIN digit"]');
      for (const d of '0000') await digits.nth(Number(d) % 4).fill(d);
      await overlay.locator('button', { hasText: /Unlock/ }).click();
      await expect(overlay.locator('[role="alert"]')).toBeVisible();

      for (let i = 0; i < 4; i++) await digits.nth(i).fill('4'[0]);
      await digits.nth(0).press('Enter');
      await expect(page.locator('[aria-label="Player"]')).toBeVisible({ timeout: 4000 });
      expect(errors()).toEqual([]);
    });
});
