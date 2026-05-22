import { test, expect } from '@playwright/test';
import { collectConsoleErrors } from '../helpers/console';

// J15: every shell mounts. Iterate the canonical 14 layout IDs from
// `apps/hermes-web-tv/src/engine/layoutRegistry.js` and verify each one
// mounts through `<ShellRenderer data-layout="...">`.
//
// NOTE on the "6 newer shells" gate:
// The prompt warned that App.jsx might still gate shell rendering on a
// hardcoded `validShells = [...]` array which would exclude nuvio,
// extreme-infinitv, stremio, live-tv, iptvnator, ynotv. Verified at write
// time (App.jsx line ~1303): the gate is `isValidLayout(resolvedLayout)`
// which delegates to the registry, so all 14 layouts are reachable and
// none need `test.fixme`. If this regresses, mark those 6 fixme with
// reason "App.jsx hardcoded validShells gate; needs PR to switch to
// isValidLayout()".

const LAYOUT_IDS = [
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
] as const;

test.describe('All layouts smoke — every shell mounts', () => {
  for (const layoutId of LAYOUT_IDS) {
    test(`layout "${layoutId}" mounts via ShellRenderer`, async ({ page }) => {
      const errors = collectConsoleErrors(page);

      await page.goto('/', { waitUntil: 'domcontentloaded' });
      // Get past the profile picker — first tile is fine.
      const tile = page.locator('button[aria-label*="profile"]').first();
      if (await tile.count()) await tile.click();
      await expect(page.getByText(/DaveTV/i).first()).toBeVisible({ timeout: 8000 });

      // Open LayoutSwitcher via the header "View" button.
      const viewBtn = page.locator('button', { hasText: /View/i }).first();
      await expect(viewBtn).toBeVisible();
      await viewBtn.click();

      // LayoutSwitcher mounts as role="dialog" with aria-labelledby="view-modal-title".
      const dialog = page.getByRole('dialog');
      await expect(dialog).toBeVisible({ timeout: 4000 });

      // Each layout card is a button inside the dialog. Match by data-layout-id
      // attribute when present, otherwise fall back to a name-based locator —
      // but the most reliable cross-shell pick is the card's role=button whose
      // accessible name contains the layout label. We try data-attr first.
      const byData = dialog.locator(`[data-layout-id="${layoutId}"]`).first();
      const card = (await byData.count())
        ? byData
        : dialog.locator(`button:has-text("${layoutId}")`).first();
      await expect(card).toBeVisible({ timeout: 4000 });
      await card.click();

      // Shell mounts: ShellRenderer.jsx wraps in <div data-layout="<id>">.
      const shell = page.locator(`[data-layout="${layoutId}"]`);
      await expect(shell).toBeVisible({ timeout: 6000 });

      // No real console errors during mount (helper filters favicon + stubs).
      expect(errors(), `console errors after mounting "${layoutId}"`).toEqual([]);

      // Press Escape — return to a stable state. Either the LayoutSwitcher is
      // already closed (most paths) or we cascade out of any incidental modal.
      // App should still show the DaveTV brand after.
      await page.keyboard.press('Escape');
      await expect(page.getByText(/DaveTV/i).first()).toBeVisible({ timeout: 4000 });
    });
  }
});
