import { test, expect } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { closeOnboardingIfOpen } from './helpers';

/**
 * Visual audit of the (now Russian-only) UI. Walks the main user flows
 * and saves a screenshot of every page so we can eyeball the result.
 *
 * The app is Russian-only since the last refactor — there's no
 * language switcher, no EN strings rendered. We do still pre-seed
 * `aq:lang = ru` for cleanliness in case any older localStorage lingers.
 */
const OUT = '/tmp/visual-audit';
mkdirSync(OUT, { recursive: true });

async function shot(page: import('@playwright/test').Page, name: string) {
  await page.screenshot({ path: join(OUT, `${name}.png`), fullPage: true });
  const text = await page.locator('body').innerText();
  writeFileSync(join(OUT, `${name}.txt`), text, 'utf8');
}

test('audit — landing + auth + dashboard + study + browse + stats', async ({ page }) => {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('aq:lang', 'ru');
      // The app is Russian-only, but localStorage may still hold a
      // different value from a previous session. Clear it for a clean
      // run.
      localStorage.removeItem('aq:lang');
    } catch {
      /* no-op */
    }
  });

  // 1) Landing (logged out)
  await page.goto('http://localhost:5173/');
  await page.waitForLoadState('networkidle');
  await expect(page.locator('h1').first()).toContainText('Учите казахский');
  await shot(page, '01-landing-ru');

  // 2) Register page
  await page.click('a[href="/register"]');
  await page.waitForURL('**/register');
  await expect(page.locator('h1').first()).toContainText('Создать аккаунт');
  await shot(page, '02-register-ru');

  // 3) Register a fresh user
  const username = 'audit_' + Math.random().toString(36).slice(2, 8);
  await page.fill('#username', username);
  await page.fill('#displayName', 'Аудит');
  await page.fill('#password', 'audit1234');
  await page.fill('#confirm', 'audit1234');
  await page.click('button[type=submit]');
  await page.waitForURL('http://localhost:5173/');

  // 4) Dashboard
  await page.waitForLoadState('networkidle');
  await expect(page.locator('h1').first()).toBeVisible();
  await closeOnboardingIfOpen(page);
  await shot(page, '03-dashboard-ru');

  // 5) Study page (A1) — first card
  await page.click('a[href="/study/a1"]');
  await page.waitForURL('**/study/a1');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(300);
  await closeOnboardingIfOpen(page);
  await shot(page, '05-study-a1-ru');

  // 6) Study page — reveal
  const showBtn = page.locator('button:has-text("Показать ответ")');
  if ((await showBtn.count()) > 0) {
    await showBtn.first().click();
  } else {
    await page.keyboard.press(' ');
  }
  await page.waitForTimeout(300);
  await shot(page, '06-study-a1-revealed-ru');

  // 8) Browse page
  await page.goto('http://localhost:5173/browse');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(300);
  await closeOnboardingIfOpen(page);
  await shot(page, '07-browse-ru');

  // 9) Stats page
  await page.goto('http://localhost:5173/stats');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(300);
  await closeOnboardingIfOpen(page);
  await shot(page, '08-stats-ru');

  // 10) 404
  await page.goto('http://localhost:5173/this-does-not-exist');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(300);
  await shot(page, '09-notfound-ru');
});
