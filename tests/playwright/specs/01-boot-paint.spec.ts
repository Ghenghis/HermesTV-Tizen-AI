import { test, expect } from '@playwright/test';
import { collectConsoleErrors } from '../helpers/console';
import { proofScreenshot } from '../helpers/proof';

// J1: Boot → first paint < 3 s.
// "First paint" = the login/profiles/main shell renders visible DaveTV UI.
// We measure from goto() return -> first visible DaveTV text.

test.describe('Boot & first paint', () => {
  test('paints DaveTV brand within 3s of navigation', async ({ page }) => {
    const errors = collectConsoleErrors(page);
    const t0 = Date.now();
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    // Wait for the brand to be visible — covers both ProfilePicker and
    // the shell header. Tight 3s budget per the boot-paint target.
    await expect(page.getByText(/DaveTV/i).first()).toBeVisible({
      timeout: 3000,
    });
    const proofPath = await proofScreenshot(page, '01-boot-davetv-first-paint');
    console.log('proof screenshot saved -> ' + proofPath);
    const elapsed = Date.now() - t0;

    expect(elapsed, `first paint took ${elapsed}ms (budget 3000ms)`).toBeLessThan(3000);
    expect(errors(), 'console errors during boot').toEqual([]);
  });

  test('no 5xx network failures during initial load', async ({ page }) => {
    const bad: string[] = [];
    page.on('response', (res) => {
      const s = res.status();
      const url = res.url();
      // Documented stubs that return 503 by design.
      if (url.includes('/api/play/') && url.endsWith('/stream')) return;
      if (url.endsWith('/api/tts')) return;
      if (s >= 500) bad.push(`${s} ${url}`);
    });
    await page.goto('/', { waitUntil: 'networkidle' });
    expect(bad, `5xx responses: ${bad.join(', ')}`).toEqual([]);
  });
});
