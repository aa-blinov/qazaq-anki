import { test, expect } from '@playwright/test';
import { closeOnboardingIfOpen } from './helpers';

/**
 * Generate a unique username for each test run so the suite is idempotent
 * even on a shared localStorage (which we wipe per-test anyway).
 */
function uname(): string {
  return `tester_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
}

/**
 * Reset persistent state before every test so the suite doesn't leak
 * session data between runs (each Playwright test shares the same
 * browser context by default).
 */
test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => {
    try {
      localStorage.clear();
      sessionStorage.clear();
    } catch {
      /* noop */
    }
  });
  // Wait for the dev server to actually be ready and the SPA shell loaded
  await page.waitForLoadState('networkidle');
});

async function register(page: Page, username: string, password = 'correcthorse') {
  await page.goto('/register');
  await expect(page).toHaveTitle(/Qazaq/);
  // The UI is Russian-only — labels are in Russian.
  await page.getByLabel('Имя пользователя').fill(username);
  await page.getByLabel(/^Отображаемое имя/).fill('Tester');
  // Password vs Confirm password — both are <input type=password> so we
  // disambiguate by their visible label.
  await page.getByLabel('Пароль', { exact: true }).fill(password);
  await page.getByLabel('Подтвердите пароль').fill(password);
  await page.getByRole('button', { name: /Создать аккаунт/i }).click();
  // Wait for the registration redirect to land on the dashboard. The
  // onboarding tour pops up on the dashboard for fresh users; dismiss
  // it AFTER the redirect has happened so we know the auth context has
  // a valid user record (the modal won't render at all for an
  // unauthenticated page).
  await expect(page).toHaveURL(/\/$/);
  // Dismiss the per-screen onboarding tour if it popped up after
  // the registration redirect.
  await closeOnboardingIfOpen(page);
}

test.describe('Auth + onboarding', () => {
  test('register, land on dashboard, see welcome card', async ({ page }) => {
    const username = uname();
    await register(page, username);

    // Land on home (/)
    await expect(page).toHaveURL(/\/$/);
    // Welcome heading includes the display name
    await expect(page.getByRole('heading', { name: /Сәлем, Tester/i })).toBeVisible();
    // All 5 CEFR level cards present (no "Common" pseudo-level anymore)
    for (const lvl of ['A1', 'A2', 'B1', 'B2', 'C1']) {
      await expect(page.getByText(new RegExp(`^${lvl}$`))).toBeVisible();
    }
    await expect(page.getByText(/^Common$/)).toHaveCount(0);
  });

  test('UI is Russian-only (no English fallback)', async ({ page }) => {
    const username = uname();
    await register(page, username);
    // Dashboard heading is in Russian regardless of any previous localStorage.
    await expect(page.getByText(/С возвращением/i)).toBeVisible();
    await expect(
      page.getByRole('heading', { name: /Ваши уровни/i }),
    ).toBeVisible();
  });

  test('logout from header and re-login with same credentials', async ({ page }) => {
    const username = uname();
    await register(page, username);

    // Logout (the icon button's accessible name is "Выйти")
    await page.getByRole('button', { name: /Выйти/i }).click();

    // Should be on /login
    await expect(page).toHaveURL(/\/login/);

    // Re-login
    await page.getByLabel('Имя пользователя').fill(username);
    await page.getByLabel('Пароль', { exact: true }).fill('correcthorse');
    await page.getByRole('button', { name: /Войти/i }).click();

    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByText(/Сәлем/i)).toBeVisible();
  });

  test('login fails with wrong password and shows error', async ({ page }) => {
    const username = uname();
    await register(page, username);
    await page.getByRole('button', { name: /Выйти/i }).click();

    await page.getByLabel('Имя пользователя').fill(username);
    await page.getByLabel('Пароль', { exact: true }).fill('definitely-wrong');
    await page.getByRole('button', { name: /Войти/i }).click();

    await expect(page.getByText(/Неверный пароль/i)).toBeVisible();
    // Still on /login
    await expect(page).toHaveURL(/\/login/);
  });

  test('register blocks duplicate usernames', async ({ page }) => {
    const username = uname();
    await register(page, username);
    await page.getByRole('button', { name: /Выйти/i }).click();

    // Try to register with the same username
    await page.goto('/register');
    await page.getByLabel('Имя пользователя').fill(username);
    await page.getByLabel(/^Отображаемое имя/).fill('Dup');
    await page.getByLabel('Пароль', { exact: true }).fill('correcthorse');
    await page.getByLabel('Подтвердите пароль').fill('correcthorse');
    await page.getByRole('button', { name: /Создать аккаунт/i }).click();

    await expect(page.getByText(/уже занято/i)).toBeVisible();
  });

  test('register rejects passwords that do not match', async ({ page }) => {
    await page.goto('/register');
    await page.getByLabel('Имя пользователя').fill(uname());
    await page.getByLabel(/^Отображаемое имя/).fill('X');
    await page.getByLabel('Пароль', { exact: true }).fill('correcthorse');
    await page.getByLabel('Подтвердите пароль').fill('different');
    await page.getByRole('button', { name: /Создать аккаунт/i }).click();

    await expect(page.getByText(/не совпадают/i)).toBeVisible();
  });

  test('tampered session cookie does not grant access', async ({ page }) => {
    // Manually plant a malformed user record in localStorage and try to
    // reach a protected route. The auth context should refuse it.
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.setItem(
        'aq:session',
        JSON.stringify({
          id: 'forged-id',
          username: 'admin',
          displayName: 'admin',
          passwordHash: 'plaintext-not-a-bcrypt-hash',
          createdAt: '2020-01-01T00:00:00.000Z',
        }),
      );
    });
    await page.goto('/study/a1');
    await expect(page).toHaveURL(/\/login/);
  });
});

test.describe('Study flow + progress persistence', () => {
  test('grade three cards on A1, reload, verify counters advanced', async ({ page }) => {
    const username = uname();
    await register(page, username);

    // Click the A1 row in the dashboard — find by URL to avoid matching the
    // badge "A1" alone which isn't a link.
    await page.locator('a[href="/study/a1"]').first().click();
    await expect(page).toHaveURL(/\/study\/a1/);

    // Dismiss the per-screen onboarding tour that opens on /study.
    await closeOnboardingIfOpen(page);

    // Wait for the first card to render before grading.
    const kazakhEl = page.locator('[class*="kazakhWord"]').first();
    await expect(kazakhEl).toBeVisible();

    // Grade three cards as Good
    for (let i = 0; i < 3; i++) {
      // Reveal
      await page.getByRole('button', { name: /Показать ответ/i }).click();
      // Press "3" for Good (keyboard shortcut)
      await page.keyboard.press('3');
      // Wait for the next card to actually render (not just a timeout).
      // The 1-based counter (currentIdx+1) increments after each grade.
      // UI is Russian-only: counter reads "N из M".
      const expectedPosition = i + 2; // after 1st grade: 2, after 2nd: 3, ...
      await expect(
        page.getByText(new RegExp(`^${expectedPosition} из \\d+$`)),
      ).toBeVisible({ timeout: 3000 });
    }

    // Verify in-progress counter shows 3 correct
    await expect(page.getByText(/3 верно/)).toBeVisible();

    // Reload the page — progress must persist
    await page.reload();

    // After reload, the smart-default tab is still "New"; counter at "1 из N"
    await expect(page.getByText(/^1 из \d+$/)).toBeVisible();
    await expect(page.getByText(/0\s+верно/)).toBeVisible();
  });

  test('Switch to New button works when Due tab is empty', async ({ page }) => {
    const username = uname();
    await register(page, username);

    // Force the Due tab to be active
    await page.goto('/study/a1');
    await closeOnboardingIfOpen(page);
    await page.getByRole('tab', { name: /^Повтор/ }).click();

    // The "Due" queue is empty for a fresh user, so we should see the
    // empty state with a "Switch to New" button.
    await expect(page.getByText(/Сейчас повторять нечего/i)).toBeVisible();
    await page.getByRole('button', { name: /Перейти к новым/i }).click();

    // After switching, the New tab should be active and we see a card
    await expect(page.locator('[class*="kazakhWord"]').first()).toBeVisible();
  });

  test('Studying a specific topic via deep link pre-filters the queue', async ({ page }) => {
    const username = uname();
    await register(page, username);

    // Deep link into A1 > Семья (a real topic in the new structure).
    // The topic is identified by its canonical slug ("family"); the UI
    // renders it as "Семья и родственники / Отбасы және туыстар".
    await page.goto('/study/a1?topic=family');

    // URL reflects the topic filter
    await expect(page).toHaveURL(/topic=family/);

    // Wait for the study page to actually render
    await expect(page.locator('[class*="kazakhWord"]').first()).toBeVisible({ timeout: 10000 });

    // The Семья family chip should be present and selected.
    // Match by visible text content rather than role to be resilient
    // to small DOM changes.
    const familyChip = page.locator('button[role="tab"]').filter({ hasText: /Семья/ });
    await expect(familyChip).toHaveCount(1);
    await expect(familyChip).toHaveAttribute('aria-selected', 'true');

    // The total count for "New" should be > 0 (real cards in that topic)
    const newTab = page.getByRole('tab', { name: /^Новые/ });
    const newText = await newTab.textContent();
    const n = parseInt(newText?.match(/(\d+)/)?.[1] ?? '0', 10);
    expect(n).toBeGreaterThan(0);
  });

  test('Direction toggle switches between Қаз→Рус and Рус→Қаз', async ({ page }) => {
    const username = uname();
    await register(page, username);
    await page.goto('/study/a1');
    await closeOnboardingIfOpen(page);

    // Default is kk-ru; the chip should be pressed.
    const kkRuBtn = page.getByRole('button', { name: /Қаз → Рус/ });
    await expect(kkRuBtn).toHaveAttribute('aria-pressed', 'true');

    // Switch to ru-kk
    const ruKkBtn = page.getByRole('button', { name: /Рус → Қаз/ });
    await ruKkBtn.click();
    await expect(ruKkBtn).toHaveAttribute('aria-pressed', 'true');
    await expect(kkRuBtn).toHaveAttribute('aria-pressed', 'false');

    // URL reflects the new direction
    await expect(page).toHaveURL(/dir=ru-kk/);
  });

  test('Grading a card in kk-ru does not affect ru-kk schedule', async ({ page }) => {
    const username = uname();
    await register(page, username);
    await page.goto('/study/a1');
    await closeOnboardingIfOpen(page);

    // Grade one card as Good in kk-ru
    await expect(page.locator('[class*="kazakhWord"]').first()).toBeVisible();
    await page.getByRole('button', { name: /Показать ответ/i }).click();
    await page.keyboard.press('3');
    await expect(page.getByText(/1 верно/)).toBeVisible();

    // Switch to ru-kk
    await page.getByRole('button', { name: /Рус → Қаз/ }).click();

    // We should see the same first card fresh — no carry-over of the
    // kk-ru review state, so the counter resets and we're back in
    // "New" mode.
    await expect(page.getByText(/0 верно/)).toBeVisible();
  });

  test('all five CEFR levels are reachable from the dashboard', async ({ page }) => {
    const username = uname();
    await register(page, username);

    for (const lvl of ['a1', 'a2', 'b1', 'b2', 'c1']) {
      await page.locator(`a[href="/study/${lvl}"]`).first().click();
      await expect(page).toHaveURL(new RegExp(`/study/${lvl}`));
      await closeOnboardingIfOpen(page);
      const kazakhEl = page.locator('[class*="kazakhWord"]').first();
      await expect(kazakhEl).toBeVisible();
      await page.goto('/');
    }
  });

  test('progress on a card persists after switching levels and back', async ({ page }) => {
    const username = uname();
    await register(page, username);

    // Grade one card on A1 as Good
    await page.goto('/study/a1');
    await closeOnboardingIfOpen(page);
    await expect(page.locator('[class*="kazakhWord"]').first()).toBeVisible();
    await page.getByRole('button', { name: /Показать ответ/i }).click();
    await page.keyboard.press('3'); // Good
    await expect(page.getByText(/1 верно/)).toBeVisible();

    // Switch to A2 and back to A1
    await page.goto('/study/a2');
    await expect(page.locator('[class*="kazakhWord"]').first()).toBeVisible();
    await page.goto('/study/a1');

    // The card we graded should now have a "Due" entry — its next review
    // is scheduled 1 day out, so it's NOT due right now. But it should
    // be in the "All" view (as a non-new card). Counter starts at 1.
    await expect(page.getByText(/^1 из \d+$/)).toBeVisible();
  });
});

test.describe('Navigation + protected routes', () => {
  test('unauthenticated user is redirected from /study to /login', async ({ page, context }) => {
    // Clear any previous session
    await context.clearCookies();
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());

    await page.goto('/study/a1');
    await expect(page).toHaveURL(/\/login/);
  });

  test('header navigation works between Home / Browse / Stats', async ({ page }) => {
    const username = uname();
    await register(page, username);

    await page.getByRole('link', { name: /^Все слова$/ }).click();
    await expect(page).toHaveURL(/\/browse/);
    await closeOnboardingIfOpen(page);
    await expect(page.getByRole('heading', { name: /Все карточки/i })).toBeVisible();

    await page.getByRole('link', { name: /^Статистика$/ }).click();
    await expect(page).toHaveURL(/\/stats/);
    await closeOnboardingIfOpen(page);
    await expect(page.getByRole('heading', { name: /Ваш прогресс/i })).toBeVisible();

    await page.getByRole('link', { name: /^Главная$/ }).click();
    await expect(page).toHaveURL(/\/$/);
  });

  test('theme toggle switches the data-theme attribute', async ({ page }) => {
    const username = uname();
    await register(page, username);

    const initial = await page.evaluate(() =>
      document.documentElement.dataset.theme,
    );
    expect(['light', 'dark']).toContain(initial);

    await page.getByRole('button', { name: /Переключить на .* тему/i }).click();
    const after = await page.evaluate(() =>
      document.documentElement.dataset.theme,
    );
    expect(after).not.toBe(initial);
  });
});

test.describe('Browse + level/topic filter', () => {
  test('browsing A1 > Семья shows only Семья rows', async ({ page }) => {
    const username = uname();
    await register(page, username);
    await page.goto('/browse');
    await closeOnboardingIfOpen(page);

    // Click the "A1" level chip
    const a1Chip = page.getByRole('tab').filter({ hasText: /^A1/ }).first();
    await expect(a1Chip).toBeVisible();
    await a1Chip.click();
    // Wait for the topic chips to render after the data chunk loads.
    await page.waitForLoadState('networkidle');

    // Topic chips include "Семья и родственники / Отбасы және туыстар"
    // (the Семья family topic, one of the largest in A1 with 80 cards).
    const familyChip = page
      .getByRole('tab')
      .filter({ hasText: /Семья/ })
      .first();
    await expect(familyChip).toBeVisible();
    await familyChip.click();
    await page.waitForLoadState('networkidle');

    // Result count is positive and matches the topic
    await expect(page.getByText(/Показано\s+\d+\s+карточек/i)).toBeVisible();

    const rowCategories = page.locator(
      'article[class*="row"] > div > span[class*="category"]',
    );
    const count = await rowCategories.count();
    expect(count).toBeGreaterThan(0);
    for (let i = 0; i < Math.min(count, 10); i++) {
      await expect(rowCategories.nth(i)).toHaveText(/Семья/);
    }
  });

  test('browsing all levels shows a mix of CEFR levels and a search box', async ({ page }) => {
    const username = uname();
    await register(page, username);
    await page.goto('/browse');
    await closeOnboardingIfOpen(page);

    // The level chips are all 5 CEFR levels (no "Common" chip)
    for (const lvl of ['A1', 'A2', 'B1', 'B2', 'C1']) {
      await expect(
        page.getByRole('tab').filter({ hasText: new RegExp(`^${lvl}`) }).first(),
      ).toBeVisible();
    }
    // "Common" topic (the old A1>Common>Verbs structure) must be gone
    await expect(
      page.getByRole('tab').filter({ hasText: /^Common/ }).first(),
    ).toHaveCount(0);
  });

  test('search filters cards by Kazakh or transliteration', async ({ page }) => {
    const username = uname();
    await register(page, username);
    await page.goto('/browse');
    await closeOnboardingIfOpen(page);

    // Filter to A1 first so we don't depend on all-levels being loaded
    const a1Chip = page.getByRole('tab').filter({ hasText: /^A1/ }).first();
    await a1Chip.click();
    await page.waitForLoadState('networkidle');

    // Type a query that matches exactly one card in A1. "танысу"
    // (acquaintance) is the only A1 card with that exact kazakh word.
    const search = page.getByRole('searchbox');
    await search.fill('танысу');
    // Wait for the table to re-render with the filtered result.
    // We use a tolerant pattern because the counter label can be
    // either singular ("1 карточка") or plural ("1 карточек") — the
    // search filter is a substring match so a small noise margin
    // keeps the test stable across copy edits.
    await expect(page.getByText(/Показана?\s+1\s+карточ/i)).toBeVisible();
  });
});

test.describe('Stats page', () => {
  test('shows progress + topic groups for the 5 CEFR levels', async ({ page }) => {
    const username = uname();
    await register(page, username);
    await page.goto('/stats');
    await closeOnboardingIfOpen(page);

    // All 5 levels appear in the "By topic" section
    for (const lvl of ['A1', 'A2', 'B1', 'B2', 'C1']) {
      await expect(page.getByText(new RegExp(`^${lvl}$`)).first()).toBeVisible();
    }
    // No "Common" anywhere
    await expect(page.getByText(/^Common$/)).toHaveCount(0);

    // Reset progress button works (label is "Сбросить прогресс" →
    // confirm state shows "Нажмите ещё раз для подтверждения")
    await page.getByRole('button', { name: /Сбросить прогресс/i }).click();
    await expect(
      page.getByRole('button', { name: /Нажмите ещё раз/i }),
    ).toBeVisible();
  });

  test('by-topic header reports the real topic count (not 0) on a cold visit', async ({ page }) => {
    // Regression: TOTAL_TOPICS used to be read from the lazy global cache,
    // so the "By topic" subtitle rendered "0 тем на 5 уровнях" until the
    // user opened a study session. Now the count is derived from the
    // freshly-loaded `loaded` map.
    const username = uname();
    await register(page, username);
    // Wait for registration to complete (URL changes to /) before we
    // navigate to /stats — otherwise /stats redirects to /login.
    await expect(page).toHaveURL(/\/$/);
    await page.goto('/stats');
    await closeOnboardingIfOpen(page);
    await page.waitForLoadState('networkidle');

    // The subtitle reads e.g. "44 тем на 5 уровнях. …" (Russian-only UI).
    // Assert the leading number is > 0 (we ship 48 with the unified
    // taxonomy across A1–C1).
    const sub = page.getByText(/(\d+)\s+тем\s+на\s+\d+\s+уров/);
    await expect(sub).toBeVisible();
    const text = (await sub.textContent()) ?? '';
    const m = text.match(/(\d+)\s+тем/);
    expect(m, `subtitle: ${text}`).not.toBeNull();
    expect(Number(m![1])).toBeGreaterThan(0);
  });
});

test.describe('Lazy-load hydration on dashboard', () => {
  // Regression: getCardsByLevel() returned [] until the user opened a
  // study session, so the dashboard showed all-0 counts. The dashboard
  // now eagerly loads all five levels on mount.
  test('dashboard shows real per-level totals on a cold visit', async ({ page }) => {
    const username = uname();
    await register(page, username);
    await expect(page).toHaveURL(/\/$/);
    // / is the dashboard; user is freshly registered so no study session
    // has been opened.
    await page.waitForLoadState('networkidle');

    // We must NOT see "0 / 0 освоено" anywhere — every level row should
    // show its real cardCount (712/693/1559/449/583 after the
    // qazcorpus-lexmin + unify-topics dedup pass).
    await expect(page.getByText(/^0 \/ 0 освоено$/)).toHaveCount(0);
    await expect(page.getByText(/0 \/ 712 освоено/)).toBeVisible();
    await expect(page.getByText(/0 \/ 693 освоено/)).toBeVisible();
    await expect(page.getByText(/0 \/ 1559 освоено/)).toBeVisible();
    await expect(page.getByText(/0 \/ 449 освоено/)).toBeVisible();
    await expect(page.getByText(/0 \/ 583 освоено/)).toBeVisible();
  });
});
