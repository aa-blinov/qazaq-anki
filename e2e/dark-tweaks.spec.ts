import { test, expect } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { closeOnboardingIfOpen } from './helpers';

const OUT = '/tmp/visual-audit';
mkdirSync(OUT, { recursive: true });

// Relative paths, resolved against `baseURL` (the isolated test Vite on
// :5174). This file used to hardcode http://localhost:5173 — the *dev*
// port — so it silently passed only when the developer happened to have
// `npm run dev` running, and when it did, it was testing the dev server
// against the dev database, which is precisely what playwright.config.ts
// exists to prevent.
async function register(page: import('@playwright/test').Page, username: string) {
  await page.goto('/register');
  await page.getByLabel('Имя пользователя').fill(username);
  await page.getByLabel(/^Отображаемое имя/).fill('Tester');
  await page.getByLabel('Пароль', { exact: true }).fill('audit1234');
  await page.getByLabel('Подтвердите пароль').fill('audit1234');
  await page.getByRole('button', { name: /Создать аккаунт/i }).click();
  await expect(page).toHaveURL(/\/$/);
}

test('study header tweaks: title case + chip color + no checkmark', async ({ page }) => {
  // Dark theme to match the user's screenshot
  await page.addInitScript(() => {
    try {
      document.documentElement.dataset.theme = 'dark';
    } catch {
      /* noop */
    }
  });
  await register(page, 'audit_' + Date.now());

  await page.goto('/study/a1');
  await closeOnboardingIfOpen(page);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(300);
  await page.screenshot({ path: join(OUT, '21-dark-with-all.png'), fullPage: true });

  // Now the same page narrowed to one topic (Семья и родственники) and
  // screenshot. This used to click `getByRole('tab', { name: /^Семья/ })`,
  // but there is no such tab and never has been: the only `role="tablist"`
  // on the study page is the *level* switcher (A1/A2/B1…), whose children
  // are NavLinks. Topics live in the TopicSelect listbox. The deep link
  // `?topic=<slug>` is the path the app itself uses, and the one the
  // user-flows suite already exercises for the same topic.
  await page.goto('/study/a1?topic=family');
  await page.waitForLoadState('networkidle');
  await expect(page).toHaveURL(/topic=family/);
  await page.waitForTimeout(300);
  await page.screenshot({ path: join(OUT, '22-dark-with-family.png'), fullPage: true });
});
