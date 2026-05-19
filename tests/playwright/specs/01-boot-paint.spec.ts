import { test, expect } from '@playwright/test';
import { collectConsoleErrors } from '../helpers/console';

// J1: Boot → first paint < 3 s.
// "First paint" = the ProfilePicker or main shell renders text "HermesTV".
// We measure from goto() return → first visible HermesTV text.

test.describe('Boot & first paint', () => {
  test('paints HermesTV brand within 3s of navigation', async ({ page }) => {
    const errors = collectConsoleErrors(page);
    const t0 = Date.now();
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    // Wait for the brand to be visible — covers both ProfilePicker and
    // the shell header. Tight 3s budget per the boot-paint target.
    await expect(page.getByText(/HermesTV/i).first()).toBeVisible({
      timeout: 3000,
    });
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
