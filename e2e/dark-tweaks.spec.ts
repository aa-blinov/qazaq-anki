import { test, expect } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { closeOnboardingIfOpen } from './helpers';

const OUT = '/tmp/visual-audit';
mkdirSync(OUT, { recursive: true });

async function register(page: import('@playwright/test').Page, username: string) {
  await page.goto('http://localhost:5173/register');
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

  await page.goto('http://localhost:5173/study/a1');
  await closeOnboardingIfOpen(page);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(300);
  await page.screenshot({ path: join(OUT, '21-dark-with-all.png'), fullPage: true });

  // Now click a specific topic (Семья) and screenshot
  await page.getByRole('tab', { name: /^Семья/ }).click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: join(OUT, '22-dark-with-family.png'), fullPage: true });
});
