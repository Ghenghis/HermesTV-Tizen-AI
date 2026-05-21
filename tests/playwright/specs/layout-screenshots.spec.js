const { test, expect } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const LAYOUTS = [
  { id: 'tivimate',      label: 'TiviMate' },
  { id: 'netflix',       label: 'Netflix' },
  { id: 'plex',          label: 'Plex' },
  { id: 'apple-tv',      label: 'Apple TV' },
  { id: 'samsung-tizen', label: 'Samsung Tizen' },
  { id: 'mom-mode',      label: 'Mom Mode' },
  { id: 'dave-power',    label: 'Dave Power' },
];

const SCREENSHOT_DIR = path.resolve(__dirname, '../../../docs/proof/layout-screenshots');

test.beforeAll(() => {
  if (!fs.existsSync(SCREENSHOT_DIR)) {
    fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
  }
});

test.describe('DaveTV Layout Visual Verification', () => {

  test.beforeEach(async ({ page }) => {
    const consoleErrors = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    page.on('pageerror', (err) => {
      consoleErrors.push(`pageerror: ${err.message}`);
    });
    page.__hermesErrors = consoleErrors;

    await page.goto('/', { waitUntil: 'networkidle' });

    const profileButtons = page.locator('button').filter({ hasText: /Sherri|Mom|Dave/i });
    const profileCount = await profileButtons.count();
    if (profileCount > 0) {
      await profileButtons.first().click();
    }

    await page.waitForSelector('text=DaveTV', { timeout: 10000 });
  });

  for (const layout of LAYOUTS) {
    test(`renders ${layout.label} layout without console errors`, async ({ page }) => {
      const viewButton = page.locator('button').filter({ hasText: /View/i }).first();
      await viewButton.click();
      await page.waitForTimeout(400);

      const modal = page.locator('text=Choose Your View').first();
      await expect(modal).toBeVisible({ timeout: 5000 });

      const layoutButton = page.locator('button', { hasText: layout.label }).filter({ hasText: /(EPG|Cinematic|Library|Minimal|Samsung Smart TV|Senior|Dense)/i }).first();
      await expect(layoutButton).toBeVisible({ timeout: 5000 });
      await layoutButton.click();

      await page.waitForTimeout(1200);

      const errors = page.__hermesErrors.filter((e) => !e.includes('favicon') && !e.includes('Failed to load resource'));
      const screenshotPath = path.join(SCREENSHOT_DIR, `${layout.id}.png`);
      await page.screenshot({ path: screenshotPath, fullPage: false });

      console.log(`[${layout.id}] screenshot saved → ${screenshotPath}`);
      console.log(`[${layout.id}] console errors: ${errors.length}`);

      expect(errors, `Layout ${layout.label} produced console errors:\n${errors.join('\n')}`).toHaveLength(0);
    });
  }

  test('layout switcher opens via "View" button', async ({ page }) => {
    // Note: Ctrl+L is the documented shortcut but Chromium intercepts it for
    // address-bar focus before the page sees it (even headless). The Look
    // button is the visible UI affordance and exercises the same handler.
    await page.locator('button').filter({ hasText: /View/i }).first().click();
    const modal = page.locator('text=Choose Your View').first();
    await expect(modal).toBeVisible({ timeout: 3000 });
  });

  test('chatbot "show movies" command runs without errors', async ({ page }) => {
    const chatbotToggle = page.locator('button').filter({ hasText: /DaveTV|Chat/i }).first();
    if (await chatbotToggle.count() > 0) {
      await chatbotToggle.click();
      await page.waitForTimeout(300);

      const input = page.locator('input[type="text"], textarea').first();
      if (await input.count() > 0) {
        await input.fill('show movies');
        await page.keyboard.press('Enter');
        await page.waitForTimeout(800);
      }
    }

    const errors = page.__hermesErrors.filter((e) => !e.includes('favicon') && !e.includes('Failed to load resource'));
    expect(errors, 'Chat command "show movies" produced errors').toHaveLength(0);
  });

});
