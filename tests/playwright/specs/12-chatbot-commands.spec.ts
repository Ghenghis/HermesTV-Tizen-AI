import { test, expect, Page, Locator } from '@playwright/test';
import { collectConsoleErrors } from '../helpers/console';

// J12: FloatingChatbot text → POST /api/ui-command/validate → App state.
// We send exact patterns from uiCommand.js COMMAND_TABLE; friendlier
// phrasings (e.g. "use plex layout") aren't in the table and 200 with
// valid:false.

async function openChatbot(page: Page): Promise<Locator> {
  await page.locator('button[aria-label*="Open"][aria-label*="chatbot"]').first().click();
  const input = page.locator('input[placeholder^="Message"]').first();
  await expect(input).toBeVisible({ timeout: 3000 });
  return input;
}
async function send(page: Page, input: Locator, text: string) {
  const wait = page.waitForResponse((r) => r.url().includes('/api/ui-command/validate'));
  await input.fill(text);
  await page.getByRole('button', { name: /^Send$/ }).click();
  const resp = await wait;
  expect(resp.status()).toBe(200);
  return resp.json();
}

const providerSel = 'select:has(option[value="apollo_group"])';
const qualitySel = 'select:has(option[value="4K"])';

test.describe('Chatbot commands (J12)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    const dave = page.locator('button[aria-label*="Dave"]').first();
    if (await dave.count()) await dave.click();
    await expect(page.getByText(/HermesTV/i).first()).toBeVisible({ timeout: 8000 });
  });

  test('"show apollo group" → filter_provider', async ({ page }) => {
    const errors = collectConsoleErrors(page);
    const input = await openChatbot(page);
    const body = await send(page, input, 'show apollo group');
    expect(body.action).toBe('filter_provider');
    expect(body.params.provider_id).toBe('apollo_group');
    await expect(page.locator(providerSel).first()).toHaveValue('apollo_group');
    expect(errors()).toEqual([]);
  });

  test('"dave mode" → switch_profile', async ({ page }) => {
    const input = await openChatbot(page);
    const body = await send(page, input, 'dave mode');
    expect(body.action).toBe('switch_profile');
    expect(body.params.profile_id).toBe('dave_tv');
    await expect(page.getByText(/Dave/).first()).toBeVisible();
  });

  test('"bigger tiles" → update_layout', async ({ page }) => {
    const input = await openChatbot(page);
    const body = await send(page, input, 'bigger tiles');
    expect(body.action).toBe('update_layout');
    expect(body.params.layout).toBe('mom_jumbo_rail');
  });

  test('"4k only" → filter_quality', async ({ page }) => {
    const input = await openChatbot(page);
    const body = await send(page, input, '4k only');
    expect(body.action).toBe('filter_quality');
    expect(body.params.quality).toBe('4K');
    await expect(page.locator(qualitySel).first()).toHaveValue('4K');
  });

  test('"reset filters" → reset_filters', async ({ page }) => {
    const input = await openChatbot(page);
    await send(page, input, 'show apollo group');
    const body = await send(page, input, 'reset filters');
    expect(body.action).toBe('reset_filters');
    await expect(page.locator(providerSel).first()).toHaveValue('all');
  });

  // Not in COMMAND_TABLE yet (PRs #118/#119).
  test.fixme('play_this / open_search / schedule_recording', async () => {});
});
