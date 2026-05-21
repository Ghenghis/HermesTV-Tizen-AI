import { test, expect } from '@playwright/test';

test.describe('DaveTV API base override proof', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('window override redirects web clients to sidecar API base', async ({ page }) => {
    await page.addInitScript(() => {
      (window as any).__HERMES_API_BASE__ = 'http://127.0.0.1:3299/';
    });
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    const base = await page.evaluate(async () => {
      const mod = await import('/src/api/hermesApi.js');
      return mod.getApiBaseUrl();
    });
    expect(base).toBe('http://127.0.0.1:3299');
  });

  test('localStorage override redirects web clients when no window override exists', async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem('davetv_api_base', 'http://127.0.0.1:3399/');
    });
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    const base = await page.evaluate(async () => {
      const mod = await import('/src/api/hermesApi.js');
      return mod.getApiBaseUrl();
    });
    expect(base).toBe('http://127.0.0.1:3399');
  });
});
