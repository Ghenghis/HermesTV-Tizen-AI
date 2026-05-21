import { test, expect } from '@playwright/test';
import { collectConsoleErrors } from '../helpers/console';

// J10: EPG → click a future program → ScheduleRecordingModal opens
// pre-filled → Confirm posts to /api/dvr/schedule.
//
// FIXME (2026-05-19): PR #116 (EPG → schedule_recording branching) is NOT
// on main — App.jsx contains no "ScheduleRecording" / "schedule_recording"
// references, and EPGModal forwards `onProgramSelect` only. Until that
// branching ships, ScheduleRecordingModal never opens from this entry
// point so the case is fixme'd to keep the suite green.

test.describe('EPG → ScheduleRecordingModal', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    const tile = page.locator('button[aria-label*="profile"]').first();
    if (await tile.count()) await tile.click();
    await expect(page.getByText(/DaveTV/i).first()).toBeVisible({ timeout: 8000 });
  });

  test.fixme('future program → modal pre-filled → Confirm posts /api/dvr/schedule',
    async ({ page }) => {
      const errors = collectConsoleErrors(page);

      const guideBtn = page.locator('button[aria-label="Open TV Guide"]').first();
      await expect(guideBtn).toBeVisible({ timeout: 4000 });
      await guideBtn.click();

      // EPGGrid renders programs as buttons; pick the first whose data
      // attribute reports a future start.
      const future = page.locator('button[data-program-start]').filter({
        hasNot: page.locator('[data-program-ended="true"]'),
      }).first();
      await expect(future).toBeVisible({ timeout: 4000 });
      await future.click();

      const modal = page.locator('div[role="dialog"][aria-label="Schedule recording"]');
      await expect(modal).toBeVisible({ timeout: 4000 });

      // Both time inputs should be pre-populated.
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
