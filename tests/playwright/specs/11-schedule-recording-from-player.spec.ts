import { test, expect } from '@playwright/test';
import { collectConsoleErrors } from '../helpers/console';

// J11: PlayerModal Record button → ScheduleRecordingModal.
//
// FIXME (2026-05-19): PR #117 (Record button inside PlayerModal) is NOT on
// main — grep on apps/hermes-web-tv/src/components/PlayerModal.jsx for
// "Record" finds only the watch-progress `recordTick` helper, no Record
// button or aria-label. Until the button ships, the in-player schedule
// flow is unreachable, so the case is fixme'd.

test.describe('PlayerModal → ScheduleRecordingModal', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    const tile = page.locator('button[aria-label*="profile"]').first();
    if (await tile.count()) await tile.click();
    await expect(page.getByText(/HermesTV/i).first()).toBeVisible({ timeout: 8000 });
  });

  test.fixme('Record in PlayerModal → modal pre-filled → POST /api/dvr/schedule',
    async ({ page }) => {
      const errors = collectConsoleErrors(page);

      // Pick the first live catalog tile — live channels are the only items
      // PR #117 ships the Record button for.
      const liveTile = page.locator('button[data-catalog-kind="live"]').first();
      await expect(liveTile).toBeVisible({ timeout: 6000 });
      await liveTile.click();

      const player = page.locator('div[role="dialog"][aria-label="Player"]');
      await expect(player).toBeVisible({ timeout: 6000 });

      const recordBtn = player.locator('button[aria-label="Record"]').first();
      await expect(recordBtn, 'PR #117 Record button').toBeVisible({ timeout: 4000 });
      await recordBtn.click();

      const modal = page.locator('div[role="dialog"][aria-label="Schedule recording"]');
      await expect(modal).toBeVisible({ timeout: 4000 });

      // Pre-fill: channel readout matches the playing channel, time inputs
      // populated (current → +30 min default).
      const start = modal.locator('input[aria-label*="Start"]');
      const end = modal.locator('input[aria-label*="End"]');
      await expect(start).not.toHaveValue('');
      await expect(end).not.toHaveValue('');

      const post = page.waitForResponse(
        (r) => r.url().includes('/api/dvr/schedule') && r.request().method() === 'POST',
        { timeout: 6000 },
      );
      await modal.locator('button', { hasText: /Confirm|Schedule|Record/ }).first().click();
      const res = await post;
      expect(res.status(), `POST /api/dvr/schedule: ${res.status()}`).toBeLessThan(400);

      await expect(modal).toBeHidden({ timeout: 4000 });
      expect(errors()).toEqual([]);
    });
});
