import { test, expect, Page } from '@playwright/test';
import { collectConsoleErrors } from '../helpers/console';

// J13: VOD card → MediaDetailPanel → Download → DownloadModal.
// Downloads are release-gated until a real server-side worker exists. The
// proof must see an honest blocked panel, not a fake exact-size/queued flow.

async function bootAsDave(page: Page) {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  const dave = page.locator('button[aria-label*="Dave"]').first();
  if (await dave.count()) await dave.click();
  await expect(page.getByText(/DaveTV/i).first()).toBeVisible({ timeout: 8000 });
}

async function openVod(page: Page) {
  // CatalogCard aria-label = "<title>, Movie" / ", Series".
  const vod = page.locator('[role="button"][aria-label$=", Movie"], [role="button"][aria-label$=", Series"]').first();
  await expect(vod).toBeVisible({ timeout: 8000 });
  await vod.click();
  await expect(page.getByRole('dialog').first()).toBeVisible({ timeout: 4000 });
}

test.describe('Download flow (J13)', () => {
  test('renders the disabled-pipeline contract, not a fake queue', async ({ page }) => {
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
    await expect(page.getByText(/Download blocked/i).first()).toBeVisible({ timeout: 6000 });
    await expect(page.getByText(/Downloads aren't live yet/i).first()).toBeVisible();
    await expect(page.getByText(/Exact download size/i).first()).toHaveCount(0);
    await expect(page.getByText(/Download queued/i).first()).toHaveCount(0);
    await expect(page.getByText(/Job ID:/i).first()).toHaveCount(0);
    await page.getByRole('button', { name: /^Close$/ }).click();
    expect(posts.length).toBeGreaterThanOrEqual(1);
    expect(posts[0].item_id).toBeTruthy();
    expect(posts[0].profile_id).toBe('dave_tv');
    expect(errors()).toEqual([]);
  });

  test('disabled gate wins over any accidental fake success envelope', async ({ page }) => {
    await bootAsDave(page);
    await page.route('**/api/download', (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        job_id: 'fake-job',
        status: 'queued',
        exact_size_human: '999 MB',
      }),
    }));
    await openVod(page);
    await page.locator('button[aria-label^="Download "]').first().click();
    await expect(page.getByText(/Download blocked/i).first()).toBeVisible({ timeout: 6000 });
    await expect(page.getByText(/fake-job/).first()).toHaveCount(0);
    await expect(page.getByText(/Download queued/i).first()).toHaveCount(0);
  });
});
