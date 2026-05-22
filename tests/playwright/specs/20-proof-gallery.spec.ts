import { test, expect } from '@playwright/test';
import { collectConsoleErrors } from '../helpers/console';
import { openDaveProofApp, proofScreenshot } from '../helpers/proof';

async function enterApp(page) {
  await openDaveProofApp(page);
}

test.describe('DaveTV proof screenshot gallery', () => {
  test('captures main surfaces for GitHub-visible truth proof', async ({ page }) => {
    const errors = collectConsoleErrors(page);
    await enterApp(page);
    await proofScreenshot(page, 'home-main-interface');

    const settings = page.locator('button[aria-label="Settings"]').first();
    await expect(settings).toBeVisible({ timeout: 6000 });
    await settings.click();
    const settingsDialog = page.locator('div[role="dialog"][aria-label="Settings"]');
    await expect(settingsDialog).toBeVisible({ timeout: 4000 });
    await proofScreenshot(page, 'settings-general');

    const playlistsTab = settingsDialog.locator('button', { hasText: /Playlists/ }).first();
    if (await playlistsTab.count()) {
      await playlistsTab.click();
      await page.waitForTimeout(300);
      await proofScreenshot(page, 'settings-playlists');
    }

    const providersTab = settingsDialog.locator('button', { hasText: /Providers/ }).first();
    if (await providersTab.count()) {
      await providersTab.click();
      await page.waitForTimeout(300);
      await proofScreenshot(page, 'settings-providers');
    }

    const voiceTab = settingsDialog.locator('button', { hasText: /Voice/ }).first();
    if (await voiceTab.count()) {
      await voiceTab.click();
      await page.waitForTimeout(300);
      await proofScreenshot(page, 'settings-voice');

      const changeVoice = page.getByRole('button', { name: /Change voice/i }).first();
      if (await changeVoice.count()) {
        await changeVoice.click();
        await expect(page.getByRole('dialog').filter({ hasText: /voice/i }).first()).toBeVisible({ timeout: 5000 });
        await proofScreenshot(page, 'voice-picker-audition-list');
        await page.keyboard.press('Escape');
      }
    }

    const closeSettings = settingsDialog.locator('button[aria-label="Close settings"]').first();
    if (await closeSettings.count()) {
      await closeSettings.click();
    } else {
      await page.keyboard.press('Escape');
    }
    await expect(settingsDialog).toBeHidden({ timeout: 5000 });

    const view = page.locator('button', { hasText: /View/i }).first();
    await expect(view).toBeVisible({ timeout: 6000 });
    await view.click();
    await expect(page.getByRole('dialog').filter({ hasText: /Choose Your View/i }).first()).toBeVisible({ timeout: 5000 });
    await proofScreenshot(page, 'layout-picker-views', true);

    expect(errors()).toEqual([]);
  });
});
