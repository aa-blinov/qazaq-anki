import { test, expect } from '@playwright/test';

/**
 * The mobile pass gated almost everything behind
 * `(max-width: 768px), (pointer: coarse)`. This is the other half of
 * that contract: on a pointer-fine desktop nothing may have changed.
 *
 * The product's density — 27px chips, 32px icon buttons, a fixed
 * 320px card, three visible filter rows — is a deliberate decision.
 * If any of it leaked into the desktop layout, this fails.
 */

test.use({ hasTouch: false, isMobile: false });

const VIEWPORT = { width: 1280, height: 900 };

async function register(page: import('@playwright/test').Page, username: string) {
  await page.goto('/register');
  await page.getByLabel('Имя пользователя').fill(username);
  await page.getByLabel(/^Отображаемое имя/).fill('Tester');
  await page.getByLabel('Пароль', { exact: true }).fill('audit1234');
  await page.getByLabel('Подтвердите пароль').fill('audit1234');
  await page.getByRole('button', { name: /Создать аккаунт/i }).click();
  await expect(page).toHaveURL(/\/$/);
}

test('desktop: compact study layout does not leak onto a pointer-fine screen', async ({ page }) => {
  await page.setViewportSize(VIEWPORT);
  await register(page, 'desk_' + Date.now());

  const mq = await page.evaluate(() => ({
    coarse: window.matchMedia('(pointer: coarse)').matches,
    compact: window.matchMedia('(max-width: 768px), (pointer: coarse)').matches,
  }));
  expect(mq.coarse, 'desktop run must be pointer:fine').toBe(false);
  expect(mq.compact, 'desktop run must not match the compact query').toBe(false);

  await page.goto('/study');
  await page.waitForLoadState('networkidle');
  for (let i = 0; i < 4; i++) {
    const ok = page.getByRole('button', { name: /^понятно$/i });
    if (!(await ok.count())) break;
    await ok.first().click({ force: true }).catch(() => {});
    await page.waitForTimeout(250);
  }
  await page.waitForTimeout(500);

  // The three filter rows stay visible and expanded...
  const rows = page.locator('[class*="pickerRow"]');
  await expect(rows, 'desktop keeps all three filter rows').toHaveCount(3);

  // ...and there is no collapsed toggle to reach for.
  await expect(
    page.locator('[class*="pickerToggle"]'),
    'the collapsed filter control is compact-only',
  ).toHaveCount(0);

  // The card keeps its full 320px: a card that resized with the
  // window would read as broken, not responsive.
  const scene = await page.evaluate(() => {
    const el = document.querySelector('[class*="scene"]') as HTMLElement | null;
    return el ? Math.round(el.getBoundingClientRect().height) : null;
  });
  expect(scene, 'desktop card stays 320px').toBe(320);

  // The answer button clears the fold on a desktop window.
  const cta = await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('button')).find((b) =>
      /показать ответ/i.test(b.textContent || ''),
    ) as HTMLElement | null;
    if (!btn) return null;
    return { bottom: Math.round(btn.getBoundingClientRect().bottom), vh: window.innerHeight };
  });
  expect(cta, 'answer button is present').not.toBeNull();
  expect(cta!.bottom).toBeLessThanOrEqual(cta!.vh);
});

test('desktop: the touch floor stays off pointer-fine screens', async ({ page }) => {
  await page.setViewportSize(VIEWPORT);
  await register(page, 'desk2_' + Date.now());

  await page.goto('/browse');
  await page.waitForLoadState('networkidle');
  for (let i = 0; i < 4; i++) {
    const ok = page.getByRole('button', { name: /^понятно$/i });
    if (!(await ok.count())) break;
    await ok.first().click({ force: true }).catch(() => {});
    await page.waitForTimeout(250);
  }
  await page.waitForTimeout(500);

  const chip = await page.evaluate(() => {
    const el = document.querySelector('[class*="chip"]') as HTMLElement | null;
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { h: Math.round(r.height), w: Math.round(r.width) };
  });
  // The whole point of the gate: 27px on a mouse, 44px on a thumb.
  expect(chip, 'browse has filter chips').not.toBeNull();
  expect(chip!.h).toBeLessThan(44);
});
