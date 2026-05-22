import fs from 'fs';
import path from 'path';
import { expect, type Page } from '@playwright/test';

export const PROOF_ROOT = path.resolve(__dirname, '../../../docs/proof/web-e2e');

export function ensureProofDir() {
  fs.mkdirSync(PROOF_ROOT, { recursive: true });
}

export async function proofScreenshot(page: Page, name: string, fullPage = false): Promise<string> {
  ensureProofDir();
  const safeName = name.replace(/[^a-z0-9._-]+/gi, '-').toLowerCase();
  const filePath = path.join(PROOF_ROOT, `${safeName}.png`);
  await page.screenshot({ path: filePath, fullPage });
  return filePath;
}

export async function seedDaveProofState(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const daveProfile = {
      id: 'dave_tv',
      display_name: 'Dave',
      nickname: 'Dave',
      avatar_emoji: 'D',
      active_theme: 'night-blue',
      font_scale: 1,
      reduced_motion: false,
      mom_mode: false,
      tier_override: 'auto',
      agent_name: 'DaveTV',
      audio_feedback: false,
      preferred_voice_id: '',
      tv_model: 'UN55CU8000BXZA',
    };
    const sherriProfile = {
      id: 'mom_tv',
      display_name: 'Sherri',
      nickname: 'Mom',
      avatar_emoji: 'S',
      active_theme: 'mom-calm',
      font_scale: 1.35,
      reduced_motion: true,
      mom_mode: true,
      tier_override: 'auto',
      agent_name: 'DaveTV',
      audio_feedback: true,
      preferred_voice_id: '',
      tv_model: 'QN85Q7FAAFXZA',
    };
    let profiles = [daveProfile, sherriProfile];
    try {
      const raw = window.localStorage.getItem('hermestv:profiles');
      const parsed = raw ? JSON.parse(raw) : null;
      if (Array.isArray(parsed) && parsed.length > 0) {
        const byId = new Map(parsed.map((p) => [p && p.id, p]));
        byId.set('dave_tv', Object.assign({}, daveProfile, byId.get('dave_tv') || {}));
        byId.set('mom_tv', Object.assign({}, sherriProfile, byId.get('mom_tv') || {}));
        profiles = Array.from(byId.values());
      }
    } catch (_err) {
      profiles = [daveProfile, sherriProfile];
    }
    window.localStorage.setItem('hermestv:onboarded', 'true');
    window.localStorage.setItem('hermestv_profile_id', 'dave_tv');
    window.localStorage.setItem('hermestv:profiles', JSON.stringify(profiles));
  });
}

export async function openDaveProofApp(page: Page): Promise<void> {
  await seedDaveProofState(page);
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('button[aria-label="Settings"]')).toBeVisible({ timeout: 12000 });
  await expect(page.getByText(/Welcome to DaveTV/i)).toHaveCount(0);
  await expect(page.getByText(/Family login/i)).toHaveCount(0);
}
