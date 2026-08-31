import { test, expect } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

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

test('study: per-screen onboarding + transliteration only for kazakh + i-icon in topbar', async ({
  page,
}) => {
  await register(page, 'audit_' + Date.now());

  // Onboarding modal appears on first study visit (per-screen seen key).
  // Clear any stale onboarding flag from a previous test that may have
  // been cached for this user.
  await page.evaluate(() => {
    const keys = Object.keys(localStorage);
    for (const k of keys) {
      if (k.startsWith('aq:onboarding:')) localStorage.removeItem(k);
    }
  });
  await page.goto('http://localhost:5173/study/a1');
  await page.waitForLoadState('networkidle');
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByText(/Добро пожаловать на страницу учёбы/i)).toBeVisible();
  await page.screenshot({ path: join(OUT, '12-onboarding.png'), fullPage: true });

  // Dismiss
  await page.getByRole('button', { name: /Понятно/i }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);

  // Direction picker still visible
  await expect(page.getByRole('button', { name: /Қаз → Рус/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /Рус → Қаз/i })).toBeVisible();
  await page.screenshot({ path: join(OUT, '13-study-kk-ru.png'), fullPage: true });

  // Switch to ru-kk — front shows Russian only, no transliteration
  await page.getByRole('button', { name: /Рус → Қаз/i }).click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: join(OUT, '14-study-ru-kk.png'), fullPage: true });

  // Reveal — back should show the Kazakh word WITH transliteration
  // (it's a Kazakh text — the rule is "transliteration under Kazakh only")
  await page.locator('button', { hasText: /Показать ответ/i }).first().click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: join(OUT, '15-study-ru-kk-revealed.png'), fullPage: true });

  // (i) icon in the top bar re-opens the tour
  await page.getByRole('button', { name: /Показать тур для этой страницы/i }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.screenshot({ path: join(OUT, '16-onboarding-reopen.png'), fullPage: true });
});

test('browse: its own onboarding content (no "How a card flips" — that is study-only)', async ({
  page,
}) => {
  await register(page, 'audit_' + Date.now());
  await page.goto('http://localhost:5173/browse');
  await page.waitForLoadState('networkidle');
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByText(/Просмотр всех карточек/i)).toBeVisible();
  // The study-only copy must NOT appear on the browse tour
  await expect(page.getByText(/Два направления/i)).toHaveCount(0);
  await page.screenshot({ path: join(OUT, '17-onboarding-browse.png'), fullPage: true });
});

test('stats: its own onboarding content (about KPIs, not directions)', async ({
  page,
}) => {
  await register(page, 'audit_' + Date.now());
  await page.goto('http://localhost:5173/stats');
  await page.waitForLoadState('networkidle');
  await expect(page.getByRole('dialog')).toBeVisible();
  // The page heading and the modal title both contain "Ваш прогресс",
  // so target the dialog explicitly.
  await expect(
    page.getByRole('dialog').getByText(/Четыре метрики/i),
  ).toBeVisible();
  await page.screenshot({ path: join(OUT, '18-onboarding-stats.png'), fullPage: true });
});

test('mobile: study page fits 375px viewport and direction picker stacks vertically', async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 720 });
  await register(page, 'audit_' + Date.now());
  await page.goto('http://localhost:5173/study/a1');
  await page.waitForLoadState('networkidle');
  // Dismiss onboarding
  await page.getByRole('button', { name: /Понятно/i }).click();
  await page.waitForTimeout(200);
  await page.screenshot({ path: join(OUT, '19-mobile-study.png'), fullPage: true });

  // Reveal on mobile — rating buttons should be 2x2
  await page.locator('button', { hasText: /Показать ответ/i }).first().click();
  await page.waitForTimeout(200);
  await page.screenshot({ path: join(OUT, '20-mobile-study-revealed.png'), fullPage: true });
});
