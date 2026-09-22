import { test } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const OUT = '/tmp/ui-review';
mkdirSync(OUT, { recursive: true });
const BASE = 'http://localhost:8080';

/**
 * UI review against the live docker-compose stack on :8080
 * (qazaq-api + qazaq-web via nginx). Captures one screen per
 * main route at desktop + mobile. Pure documentation — no
 * assertions. Tests can run before/after a fix and the diff is
 * the review.
 */
test.describe.configure({ mode: 'serial' });

test('UI review — every key screen at desktop + mobile', async ({ page }) => {
  test.setTimeout(120_000);

  const screens: Array<{
    name: string;
    url: string;
    mobile?: boolean;
    /** Pre-screenshot mutations (theme, localStorage). */
    prep?: (p: typeof page) => Promise<void>;
  }> = [
    { name: '01-landing-desktop', url: '/' },
    {
      name: '02-landing-dark',
      url: '/',
      prep: async (p) => {
        await p.evaluate(() => {
          document.documentElement.setAttribute('data-theme', 'dark');
        });
      },
    },
    { name: '03-landing-mobile', url: '/', mobile: true },
    { name: '04-register', url: '/register' },
    { name: '05-register-mobile', url: '/register', mobile: true },
    { name: '06-login-mobile', url: '/login', mobile: true },
    { name: '07-notfound', url: '/this-route-does-not-exist' },
  ];

  for (const s of screens) {
    await page.setViewportSize(
      s.mobile ? { width: 390, height: 844 } : { width: 1280, height: 800 },
    );
    await page.goto(`${BASE}${s.url}`, { waitUntil: 'networkidle' });
    if (s.prep) await s.prep(page);
    await page.waitForTimeout(700);
    await page.screenshot({
      path: `${OUT}/${s.name}.png`,
      fullPage: true,
    });
  }

  // Register a real user for the authed screens.
  const username = `ui${Date.now().toString(36)}`;
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(`${BASE}/register`, { waitUntil: 'networkidle' });
  await page.getByLabel('Имя пользователя').fill(username);
  await page.getByLabel('Пароль', { exact: true }).fill('ui-review-1234');
  await page.getByLabel('Подтвердите пароль').fill('ui-review-1234');
  await page.getByRole('button', { name: /Создать аккаунт/i }).click();
  await page.waitForURL(/\/$/, { timeout: 10_000 });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: `${OUT}/08-home-dashboard.png`, fullPage: true });

  const authedScreens: Array<{ name: string; url: string; mobile?: boolean }> = [
    { name: '09-home-mobile', url: '/', mobile: true },
    { name: '10-study-a1', url: '/study/level/a1' },
    { name: '11-study-card-flipped', url: '/study/level/a1' },
    { name: '12-browse', url: '/browse' },
    { name: '13-stats', url: '/stats' },
    { name: '14-settings', url: '/settings' },
  ];

  for (const s of authedScreens) {
    await page.setViewportSize(
      s.mobile ? { width: 390, height: 844 } : { width: 1280, height: 800 },
    );
    await page.goto(`${BASE}${s.url}`, { waitUntil: 'networkidle' });
    if (s.name === '11-study-card-flipped') {
      // Dismiss the onboarding tour before clicking the card — it
      // overlays the page on first study visit.
      const ok = page.getByRole('button', { name: /^понятно$/i });
      if (await ok.count()) {
        await ok.first().click({ force: true });
        await page.waitForTimeout(300);
      }
      await page.locator('[class*="scene"]').first().click();
      await page.waitForTimeout(500);
    }
    await page.waitForTimeout(700);
    await page.screenshot({
      path: `${OUT}/${s.name}.png`,
      fullPage: true,
    });
  }
});
