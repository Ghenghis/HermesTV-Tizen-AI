import { test, expect, Page } from '@playwright/test';
import { collectConsoleErrors } from '../helpers/console';

// J13: VOD card → MediaDetailPanel → ⤓ Download → DownloadModal.
// Modal shows "Exact download size" + size value + Cancel/Proceed.
// Proceed flips to "queued" view (DownloadModal.jsx: confirmed && envelope
// .status === 'queued'). Close — verify POST /api/download carried
// item_id + profile_id.

async function bootAsDave(page: Page) {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  const dave = page.locator('button[aria-label*="Dave"]').first();
  if (await dave.count()) await dave.click();
  await expect(page.getByText(/HermesTV/i).first()).toBeVisible({ timeout: 8000 });
}

async function openVod(page: Page) {
  // CatalogCard aria-label = "<title>, Movie" / ", Series".
  const vod = page.locator('[role="button"][aria-label$=", Movie"], [role="button"][aria-label$=", Series"]').first();
  await expect(vod).toBeVisible({ timeout: 8000 });
  await vod.click();
  await expect(page.getByRole('dialog').first()).toBeVisible({ timeout: 4000 });
}

test.describe('Download flow (J13)', () => {
  test('proceeds through exact-size disclosure to queued', async ({ page }) => {
    const errors = collectConsoleErrors(page);
    const posts: any[] = [];
    page.on('request', (req) => {
      if (req.url().endsWith('/api/download') && req.method() === 'POST') {
        try { posts.push(JSON.parse(req.postData() || 'null')); } catch {}
      }
    });

    await bootAsDave(page);
    await openVod(page);

    await page.locator('button[aria-label^="Download "]').first().click();
    await expect(page.getByText(/Exact download size/i).first()).toBeVisible({ timeout: 6000 });
    await expect(page.getByRole('button', { name: /^Cancel$/ })).toBeVisible();
    const proceed = page.getByRole('button', { name: /^Proceed$/ });
    await expect(proceed).toBeEnabled({ timeout: 6000 });

    await proceed.click();
    await expect(page.getByText(/Download queued/i).first()).toBeVisible({ timeout: 4000 });
    await expect(page.getByText(/Job ID:/i).first()).toBeVisible();

    await page.getByRole('button', { name: /^Close$/ }).click();
    expect(posts.length).toBeGreaterThanOrEqual(1);
    expect(posts[0].item_id).toBeTruthy();
    expect(posts[0].profile_id).toBe('dave_tv');
    expect(errors()).toEqual([]);
  });

  test('bad item_id renders the error envelope', async ({ page }) => {
    await bootAsDave(page);
    await page.route('**/api/download', (route) => route.fulfill({
      status: 400,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'invalid_item', message: 'unknown item_id' }),
    }));
    await openVod(page);
    await page.locator('button[aria-label^="Download "]').first().click();
    await expect(page.getByText(/Download blocked/i).first()).toBeVisible({ timeout: 6000 });
    await expect(page.getByText(/invalid_item/).first()).toBeVisible();
  });
});
