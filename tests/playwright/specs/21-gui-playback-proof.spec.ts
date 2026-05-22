import { test, expect, Page, TestInfo } from '@playwright/test';
import { collectConsoleErrors } from '../helpers/console';
import { openDaveProofApp, proofScreenshot } from '../helpers/proof';

const SETTINGS_TABS = [
  'Playlists', 'General', 'Providers', 'Appearance', 'Features', 'Network',
  'Playback', 'Parental', 'Backup', 'Hotkeys', 'Diagnostics', 'About', 'Voice',
];

const ALL_VIEW_IDS = [
  'tivimate',
  'netflix',
  'plex',
  'apple-tv',
  'samsung-tizen',
  'mom-mode',
  'dave-power',
  'zero',
  'nuvio',
  'extreme-infinitv',
  'stremio',
  'live-tv',
  'iptvnator',
  'ynotv',
];

async function snap(page: Page, testInfo: TestInfo, name: string, fullPage = false) {
  return proofScreenshot(page, `${testInfo.project.name}-${name}`, fullPage);
}

async function closeAnyDialog(page: Page) {
  await page.keyboard.press('Escape');
  await page.waitForTimeout(120);
}

async function openViewPicker(page: Page) {
  const view = page.locator('button[title^="Change View"]').first();
  await expect(view).toBeVisible({ timeout: 8000 });
  await view.click();
  const dialog = page.getByRole('dialog').filter({ hasText: 'Choose Your View' });
  await expect(dialog).toBeVisible({ timeout: 5000 });
  return dialog;
}

async function selectLayout(page: Page, layoutId: string) {
  const dialog = await openViewPicker(page);
  const card = dialog.locator(`[data-layout-id="${layoutId}"]`);
  await expect(card, `layout card ${layoutId}`).toBeVisible({ timeout: 5000 });
  await card.click();
  await expect(page.locator(`[data-layout="${layoutId}"]`), `mounted layout ${layoutId}`).toBeVisible({ timeout: 8000 });
}

async function assertHeaderDialog(page: Page, testInfo: TestInfo, buttonSelector: string, dialogSelector: string, screenshotName: string, closeSelector?: string) {
  const button = page.locator(buttonSelector).first();
  await expect(button, `open ${screenshotName}`).toBeVisible({ timeout: 8000 });
  await button.click();
  const dialog = page.locator(dialogSelector).first();
  await expect(dialog, `${screenshotName} dialog`).toBeVisible({ timeout: 8000 });
  await snap(page, testInfo, screenshotName);
  if (closeSelector) {
    const close = page.locator(closeSelector).first();
    if (await close.count()) {
      await close.click();
    } else {
      await closeAnyDialog(page);
    }
  } else {
    await closeAnyDialog(page);
  }
  await expect(dialog, `${screenshotName} closes`).toBeHidden({ timeout: 8000 });
}

test.describe('DaveTV GUI and playback proof', () => {
  test('header controls, settings tabs, view picker, and side rails are actionable', async ({ page }, testInfo) => {
    const errors = collectConsoleErrors(page);
    await openDaveProofApp(page);
    await snap(page, testInfo, '01-home-main-interface');

    await assertHeaderDialog(
      page,
      testInfo,
      'button[aria-label="Open search"]',
      '[role="dialog"][aria-labelledby="hermes-search-title"]',
      '02-search-modal',
      'button[aria-label="Close search"]',
    );

    await assertHeaderDialog(
      page,
      testInfo,
      'button[aria-label="Open TV Guide"]',
      '[role="dialog"][aria-label="Electronic Program Guide"]',
      '03-tv-guide',
      'button[aria-label="Close TV Guide"]',
    );

    await assertHeaderDialog(
      page,
      testInfo,
      'button[aria-label="Open Multiview"]',
      '[role="dialog"][aria-label="Multiview player"]',
      '04-multiview',
      'button[aria-label="Close Multiview"]',
    );

    await assertHeaderDialog(
      page,
      testInfo,
      'button[aria-label="Open sleep timer"]',
      '[role="dialog"][aria-label="Sleep timer"]',
      '05-sleep-timer',
      'button[aria-label="Close sleep timer"]',
    );

    const settingsButton = page.locator('button[aria-label="Settings"]').first();
    await expect(settingsButton).toBeVisible({ timeout: 8000 });
    await settingsButton.click();
    const settingsDialog = page.locator('div[role="dialog"][aria-label="Settings"]');
    await expect(settingsDialog).toBeVisible({ timeout: 5000 });
    await snap(page, testInfo, '06-settings-general');
    const tabpanel = settingsDialog.locator('div[role="tabpanel"]');
    for (const label of SETTINGS_TABS) {
      const tab = settingsDialog.getByRole('tab', { name: label, exact: true });
      await expect(tab, `settings tab ${label}`).toBeVisible({ timeout: 5000 });
      await tab.click();
      await expect(tab).toHaveAttribute('aria-selected', 'true');
      await expect(tabpanel, `settings tab body ${label}`).toBeVisible();
      await expect.poll(async () => (await tabpanel.innerText()).trim(), { timeout: 6000 }).not.toMatch(/^Loading…?$/i);
      if (label === 'Providers' || label === 'Voice') {
        await snap(page, testInfo, `07-settings-${label.toLowerCase()}`);
      }
    }
    await page.locator('button[aria-label="Close settings"]').first().click();
    await expect(settingsDialog).toBeHidden({ timeout: 5000 });

    const viewDialog = await openViewPicker(page);
    await snap(page, testInfo, '08-layout-picker-viewport-gallery');
    await snap(page, testInfo, '08-layout-picker-wide-gallery', true);
    await expect(viewDialog.locator('[data-layout-id="plex"]')).toBeVisible();
    await expect(viewDialog.locator('[data-layout-id="zero"]')).toBeVisible();
    await closeAnyDialog(page);

    await selectLayout(page, 'plex');
    const plexSeries = page.locator('[data-layout="plex"] [data-plex-nav-index="3"]');
    await expect(plexSeries).toBeVisible({ timeout: 5000 });
    await plexSeries.click();
    await expect(page.locator('[data-layout="plex"] h2').first()).toContainText('Series');
    await plexSeries.focus();
    await plexSeries.press('ArrowUp');
    await expect(page.locator('[data-layout="plex"] [data-plex-nav-index="2"]')).toBeFocused();
    await snap(page, testInfo, '09-plex-sidebar-series');

    await selectLayout(page, 'zero');
    const zeroLive = page.locator('[data-layout="zero"] [data-zero-sidebar-index="2"]');
    await expect(zeroLive).toBeVisible({ timeout: 5000 });
    await zeroLive.click();
    await expect(zeroLive).toHaveAttribute('aria-current', 'page');
    await zeroLive.focus();
    await zeroLive.press('ArrowUp');
    await expect(page.locator('[data-layout="zero"] [data-zero-sidebar-index="1"]')).toBeFocused();
    await snap(page, testInfo, '10-zero-sidebar-live');

    await selectLayout(page, 'tivimate');
    const tiviMovies = page.locator('[data-layout="tivimate"] [data-tivimate-nav-index="1"]');
    await expect(tiviMovies).toBeVisible({ timeout: 5000 });
    await tiviMovies.click();
    await expect(tiviMovies).toHaveAttribute('aria-current', 'page');
    const tiviSearch = page.locator('[data-layout="tivimate"] [data-tivimate-nav-index="3"]');
    await tiviSearch.click();
    await expect(page.locator('[role="dialog"][aria-labelledby="hermes-search-title"]')).toBeVisible({ timeout: 5000 });
    await closeAnyDialog(page);
    await snap(page, testInfo, '11-tivimate-bottom-nav');

    await selectLayout(page, 'iptvnator');
    const iptvEpg = page.locator('[data-layout="iptvnator"] [data-iptvnator-rail-index="3"]');
    await expect(iptvEpg).toBeVisible({ timeout: 5000 });
    await iptvEpg.click();
    await expect(page.locator('[role="dialog"][aria-label="Electronic Program Guide"]')).toBeVisible({ timeout: 5000 });
    await closeAnyDialog(page);
    const iptvSettings = page.locator('[data-layout="iptvnator"] [data-iptvnator-rail-index="4"]');
    await iptvSettings.click();
    await expect(page.locator('div[role="dialog"][aria-label="Settings"]')).toBeVisible({ timeout: 5000 });
    await closeAnyDialog(page);
    await snap(page, testInfo, '12-iptvnator-rail-overlays');

    await selectLayout(page, 'dave-power');
    const powerMovies = page.locator('[data-layout="dave-power"] [data-power-nav-index="1"]');
    await expect(powerMovies).toBeVisible({ timeout: 5000 });
    await powerMovies.click();
    await expect(powerMovies).toHaveAttribute('aria-current', 'page');
    await powerMovies.focus();
    await powerMovies.press('ArrowDown');
    await expect(page.locator('[data-layout="dave-power"] [data-power-nav-index="2"]')).toBeFocused();
    await snap(page, testInfo, '13-dave-power-nav');

    await selectLayout(page, 'extreme-infinitv');
    const extremeTab = page.locator('[data-layout="extreme-infinitv"] [data-extreme-tab-index="1"]');
    await expect(extremeTab).toBeVisible({ timeout: 5000 });
    await extremeTab.click();
    await expect(extremeTab).toHaveAttribute('aria-pressed', 'true');
    const extremeGroup = page.locator('[data-layout="extreme-infinitv"] [data-extreme-group-index="0"]');
    await expect(extremeGroup).toBeVisible({ timeout: 5000 });
    await extremeGroup.focus();
    await extremeGroup.press('ArrowDown');
    const nextExtremeGroup = page.locator('[data-layout="extreme-infinitv"] [data-extreme-group-index="1"]');
    if (await nextExtremeGroup.count()) {
      await expect(nextExtremeGroup).toBeFocused();
    } else {
      await expect(extremeGroup).toBeFocused();
    }
    await snap(page, testInfo, '14-extreme-tabs-groups');

    await selectLayout(page, 'ynotv');
    const ynotvRail = page.locator('[data-layout="ynotv"] [data-ynotv-rail-index="0"]');
    await expect(ynotvRail).toBeVisible({ timeout: 5000 });
    await ynotvRail.focus();
    await ynotvRail.press('ArrowDown');
    await expect(page.locator('[data-layout="ynotv"] [data-ynotv-rail-index="1"]')).toBeFocused();

    await selectLayout(page, 'mom-mode');
    const momTab = page.locator('[data-layout="mom-mode"] [data-mom-tab-index="0"]');
    await expect(momTab).toBeVisible({ timeout: 5000 });
    await momTab.focus();
    await momTab.press('ArrowRight');
    await expect(page.locator('[data-layout="mom-mode"] [data-mom-tab-index="1"]')).toBeFocused();
    await snap(page, testInfo, '15-mom-mode-tabs');

    expect(errors(), 'console/page errors during GUI proof').toEqual([]);
  });

  test('playback click opens quickly and settles into playing or recovery state', async ({ page }, testInfo) => {
    const errors = collectConsoleErrors(page);
    await openDaveProofApp(page);
    await selectLayout(page, 'dave-power');

    const playable = page.locator('[data-layout="dave-power"] [role="button"]', { hasText: /LIVE/ }).first();
    await expect(playable).toBeVisible({ timeout: 10000 });
    const start = Date.now();
    await playable.click();

    const player = page.locator('[role="dialog"]').filter({ hasText: /LIVE|Streamed|Connecting|offline|Playback/i }).first();
    await expect(player).toBeVisible({ timeout: 6500 });
    const openedMs = Date.now() - start;
    expect(openedMs, 'player should open without popup detour').toBeLessThan(6500);

    await expect.poll(async () => page.evaluate(() => {
      const video = document.querySelector('video') as HTMLVideoElement | null;
      const dialog = document.querySelector('[role="dialog"]') as HTMLElement | null;
      const text = dialog ? dialog.innerText : '';
      return {
        currentTime: video ? video.currentTime : 0,
        readyState: video ? video.readyState : 0,
        paused: video ? video.paused : true,
        text,
        settled: !!video && !video.paused && video.readyState >= 2 && video.currentTime > 0.2
          || /Skipping to the next playable channel|No playable video yet|Try another source|offline|unreachable|Playback failed/i.test(text),
      };
    }), { timeout: 12000 }).toMatchObject({ settled: true });

    await snap(page, testInfo, '16-player-playing-or-recovery');
    expect(errors(), 'console/page errors during playback proof').toEqual([]);
  });

  test('every registered view mounts with real interactive controls', async ({ page }, testInfo) => {
    const errors = collectConsoleErrors(page);
    await openDaveProofApp(page);

    for (const layoutId of ALL_VIEW_IDS) {
      await selectLayout(page, layoutId);
      const shell = page.locator(`[data-layout="${layoutId}"]`);
      await expect(shell, `view ${layoutId} mounted`).toBeVisible({ timeout: 8000 });
      await expect(shell.locator('[role="status"]'), `view ${layoutId} finished lazy loading`).toHaveCount(0);
      await expect.poll(async () => shell.locator('button, [role="button"], [data-focusable="true"], [tabindex="0"]').count(), {
        message: `view ${layoutId} exposes interactive controls`,
        timeout: 5000,
      }).toBeGreaterThan(0);
    }

    await snap(page, testInfo, '17-all-views-mounted-final');
    expect(errors(), 'console/page errors during all-view mount proof').toEqual([]);
  });
});
