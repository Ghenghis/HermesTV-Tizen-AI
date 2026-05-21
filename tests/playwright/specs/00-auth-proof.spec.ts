import { test, expect } from '@playwright/test';
import { collectConsoleErrors } from '../helpers/console';
import { openDaveProofApp, proofScreenshot } from '../helpers/proof';

test.describe('Auth proof', () => {
  test('authenticated browser state opens DaveTV without manual link copying', async ({ page }) => {
    const errors = collectConsoleErrors(page);
    const badResponses: string[] = [];
    page.on('response', (res) => {
      const status = res.status();
      if (status >= 500) badResponses.push(`${status} ${res.url()}`);
    });

    await openDaveProofApp(page);
    await proofScreenshot(page, '00-authenticated-davetv-entry');

    const bodyText = await page.locator('body').innerText();
    expect(bodyText).not.toMatch(/Family login/i);
    expect(bodyText).not.toMatch(/Reset link is invalid/i);
    expect(bodyText).not.toMatch(/SMTP is not configured/i);
    expect(badResponses).toEqual([]);
    expect(errors()).toEqual([]);
  });
});
