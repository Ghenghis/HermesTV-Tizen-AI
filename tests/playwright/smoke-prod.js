// One-off smoke script for the live production URL.
// Bypasses the local-dev Playwright config (which uses localhost:5173)
// and hits https://tv.daveai.tech directly (canonical short URL).
// hermestv.daveai.tech remains a valid alias served by the same nginx
// server_name line, so swapping the canonical here does not break the
// historical URL — it is still reachable.

const { chromium } = require('C:/Users/Admin/AppData/Roaming/npm/node_modules/playwright/index.js');

const BASE = 'https://tv.daveai.tech';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });

  const errors = [];
  page.on('console', (msg) => { if (msg.type() === 'error') errors.push('[console] ' + msg.text()); });
  page.on('pageerror', (err) => errors.push('[pageerror] ' + err.message));
  page.on('requestfailed', (req) => errors.push('[reqfail] ' + req.url() + ' — ' + req.failure().errorText));

  console.log('=== 1. GET / — load profile picker ===');
  await page.goto(BASE + '/', { waitUntil: 'networkidle', timeout: 30000 });
  const profiles = await page.locator('button').filter({ hasText: /Sherri|Dave/i }).count();
  console.log('  profile buttons visible:', profiles);

  console.log('');
  console.log('=== 2. Pick Sherri (mom_mode profile) ===');
  await page.locator('button').filter({ hasText: /Sherri/i }).first().click();
  await page.waitForTimeout(2000);

  console.log('=== 3. Header shows DaveTV brand + View button ===');
  const brand = await page.locator('text=DaveTV').first().isVisible();
  const viewBtn = await page.locator('button').filter({ hasText: /View/i }).first().isVisible();
  console.log('  brand visible:', brand, '- View button:', viewBtn);

  console.log('');
  console.log('=== 4. Open layout switcher modal ===');
  await page.locator('button').filter({ hasText: /View/i }).first().click();
  await page.waitForTimeout(800);
  const modalTitle = await page.locator('text=Choose Your View').first().isVisible();
  console.log('  "Choose Your View" modal visible:', modalTitle);

  const layoutCount = await page.locator('button').filter({ hasText: /TiviMate|Netflix|Plex|Apple TV|Samsung|Mom Mode|Dave Power/i }).count();
  console.log('  layout buttons in modal:', layoutCount);

  console.log('');
  console.log('=== 5. Switch to Netflix layout ===');
  await page.locator('button', { hasText: 'Netflix' }).filter({ hasText: /Cinematic/i }).first().click();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: 'G:/Github/HermesTV-Tizen-AI/tests/playwright/prod-smoke-netflix.png', fullPage: false });
  console.log('  screenshot saved: prod-smoke-netflix.png');

  console.log('');
  console.log('=== 6. Switch to Mom Mode ===');
  await page.locator('button').filter({ hasText: /View/i }).first().click();
  await page.waitForTimeout(400);
  await page.locator('button', { hasText: 'Mom Mode' }).filter({ hasText: /Senior-friendly/i }).first().click();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: 'G:/Github/HermesTV-Tizen-AI/tests/playwright/prod-smoke-mom-mode.png', fullPage: false });
  console.log('  screenshot saved: prod-smoke-mom-mode.png');

  console.log('');
  console.log('=== Console errors collected during smoke ===');
  const filteredErrors = errors.filter((e) => !e.includes('favicon') && !e.includes('Failed to load resource'));
  if (filteredErrors.length === 0) console.log('  (none — clean)');
  else filteredErrors.forEach((e) => console.log('  ' + e));

  console.log('');
  console.log('SMOKE_DONE');
  await browser.close();
})();
