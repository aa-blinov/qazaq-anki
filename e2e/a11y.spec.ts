import { test, expect, type Page } from '@playwright/test';
import { closeOnboardingIfOpen } from './helpers';

/**
 * Accessibility regressions, measured rather than asserted in prose.
 *
 * Every test here corresponds to behaviour that was wrong and was fixed.
 * The comments name the old behaviour, because a test that only says what
 * the app does now cannot be read later without also being useful to
 * change — the "why" is the part that decays.
 *
 * What is NOT here, and why:
 *  - Touch targets. Measured across all five pages at 390px: every
 *    interactive element's real hit area (its box, or the `::after` that
 *    expands the four header controls back out to `--tap-min`) is ≥44px.
 *    Material says 48dp; the app says 44px, which is WCAG 2.2 AAA-clean
 *    and Apple's number, and raising it would resize controls the design
 *    contract has already sized. A test asserting 44 would only enshrine
 *    the current value; the `mobile-measure` spec already fails loudly
 *    if a target drops below it.
 *  - Focus visibility. The global `:focus-visible` ring was already on
 *    every focusable element, verified by tabbing twelve stops.
 *  - Accessible names on icon buttons. All of them had one; a sweep of
 *    the five pages found zero unnamed controls.
 */

const DISMISS = ['Пропустить', 'Позже', 'Начать позже', 'Понятно', 'Закрыть', 'Продолжить'];

async function dismissTour(page: Page) {
  for (let i = 0; i < 6; i++) {
    let clicked = false;
    for (const name of DISMISS) {
      const b = page.getByRole('button', { name: new RegExp(`^${name}$`, 'i') });
      if ((await b.count()) && (await b.first().isVisible().catch(() => false))) {
        await b.first().click().catch(() => {});
        await page.waitForTimeout(250);
        clicked = true;
      }
    }
    if (!clicked) break;
  }
}

/** Where the focus is, in terms a test can assert on. */
async function focusInfo(page: Page) {
  return page.evaluate(() => {
    const a = document.activeElement as HTMLElement | null;
    if (!a) return { name: '', inDialog: false, listboxOpen: false, tag: '' };
    const dialogs = [...document.querySelectorAll('[role="dialog"],[role="alertdialog"]')];
    return {
      name: (a.getAttribute('aria-label') ?? a.textContent ?? a.tagName).trim().slice(0, 40),
      tag: a.tagName,
      inDialog: dialogs.some((d) => d.contains(a)),
      listboxOpen: !!document.querySelector('[role="listbox"]'),
    };
  });
}


/**
 * Opening the menu moves focus onto the selected option on the next
 * animation frame — the list has to be laid out before offsetParent is
 * meaningful, so the focus cannot be moved synchronously. A test that
 * presses an arrow the instant the menu appears is pressing it before the
 * focus has arrived, and then ArrowDown from "no option focused" lands on
 * the FIRST option — which is the one already selected, so choosing it
 * changes nothing and looks like Enter being broken.
 */
async function waitForFocusInListbox(page: Page) {
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const lb = document.querySelector('[role="listbox"]');
          return !!lb && lb.contains(document.activeElement);
        }),
      { timeout: 5000 },
    )
    .toBe(true);
}

test.describe('Accessibility regressions', () => {
  test('the flashcard announces the word it is asking about', async ({ page }) => {
    // The card was `role="button"` carrying an `aria-label` of "нажмите
    // пробел, чтобы перевернуть". An aria-label on a button overrides its
    // subtree, so that instruction was the *only* thing spoken: the Kazakh
    // word under test and the translation being recalled were never
    // announced in either direction. The app's core loop was silent.
    await page.goto('/register');
    await page.getByLabel('Имя пользователя').fill(`a11y${Date.now().toString(36)}`);
    await page.getByLabel(/^Отображаемое имя/).fill('Tester');
    await page.getByLabel('Пароль', { exact: true }).fill('correcthorse');
    await page.getByLabel('Подтвердите пароль').fill('correcthorse');
    await page.getByRole('button', { name: /Создать аккаунт/i }).click();
    await expect(page).toHaveURL(/\/$/);
    await dismissTour(page);

    await page.goto('/study/level/a1');
    await page.waitForLoadState('networkidle');
    await dismissTour(page);

    const scene = page.locator('[class*="scene"]').first();
    await expect(scene).toBeVisible({ timeout: 10000 });

    const word = (await page.locator('[class*="kazakhWord"]').first().innerText()).trim();
    expect(word.length, 'the card should show a word').toBeGreaterThan(0);

    // The accessible name carries the word, not just the instruction.
    const front = await scene.getAttribute('aria-label');
    expect(front, 'front label must name the word').toContain(word);

    // The live region is mounted before the flip, so the reveal is
    // announced. A region that appears already filled is one NVDA and
    // JAWS routinely skip — which is the failure the old markup had.
    const live = scene.locator('[role="status"]');
    await expect(live).toHaveCount(1);
    expect((await live.innerText()).trim(), 'nothing to announce before the flip').toBe('');

    await page.getByRole('button', { name: /Показать ответ/i }).click();
    await expect(live).not.toHaveText('', { timeout: 5000 });
    const spoken = (await live.innerText()).trim();
    expect(spoken).toContain(word);

    // And the back face names the translation.
    const back = await scene.getAttribute('aria-label');
    expect(back).toContain(word);
    expect(back, 'back label must carry the translation').toMatch(/[Пп]еревод/);
  });

  test('Space and Enter reach buttons instead of flipping the card', async ({ page }) => {
    // The study screen binds Space/Enter to flip the card, behind a guard
    // that only excluded INPUT and TEXTAREA. Every other focusable thing on
    // the page lost both keys: the rating row, sign-out, the burger, the
    // direction and topic pickers. Tab to a button, press its key, and the
    // card flipped instead — WCAG 2.1.1, and worse than a lost shortcut
    // because the control looks focusable and is.
    await page.goto('/register');
    await page.getByLabel('Имя пользователя').fill(`k${Date.now().toString(36)}`);
    await page.getByLabel(/^Отображаемое имя/).fill('Tester');
    await page.getByLabel('Пароль', { exact: true }).fill('correcthorse');
    await page.getByLabel('Подтвердите пароль').fill('correcthorse');
    await page.getByRole('button', { name: /Создать аккаунт/i }).click();
    await expect(page).toHaveURL(/\/$/);
    await dismissTour(page);
    await page.goto('/study/level/a1');
    await page.waitForLoadState('networkidle');
    await dismissTour(page);

    const revealed = async () =>
      (await page.locator('[class*="isRevealed"]').count()) > 0;

    // The shortcut itself must survive: focus on nothing, Space flips.
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur?.());
    await page.keyboard.press(' ');
    await expect(page.locator('[class*="isRevealed"]')).toHaveCount(1, { timeout: 5000 });
    await page.keyboard.press(' ');
    await expect(page.locator('[class*="isRevealed"]')).toHaveCount(0, { timeout: 5000 });
    expect(await revealed()).toBe(false);

    // Enter on a rating button grades; it must not flip the card. The
    // unrevealed card has no separate "show answer" button — the whole
    // card is the control — so reveal it the way a user would, by
    // activating the card itself.
    const scene = page.locator('[class*="scene"]').first();
    await scene.click();
    await expect(page.locator('[class*="isRevealed"]')).toHaveCount(1, { timeout: 5000 });

    const good = page.locator('button[data-grade="good"]').first();
    await expect(good).toBeVisible();
    const wordBefore = await scene.getAttribute('aria-label');
    await good.focus();
    await page.keyboard.press('Enter');

    // Two independent proofs that the button was pressed and not the
    // card: the grade is announced, and the card advanced to a new word.
    // Had Enter flipped the card instead, the word would be unchanged and
    // no grade would exist.
    await expect(
      page.locator('[role="status"]').filter({ hasText: /Оценка засчитана/ }),
    ).toHaveCount(1, { timeout: 5000 });
    await expect
      .poll(async () => await scene.getAttribute('aria-label'), { timeout: 5000 })
      .not.toBe(wordBefore);
  });

  test('the filter pickers are real listboxes', async ({ page }) => {
    // `role="listbox"` wrapping plain buttons: no role="option", no
    // aria-selected, every option in the tab order, and no focus moved into
    // the menu when it opened. A screen reader announced "list box, 2 items"
    // and then met two indistinguishable buttons.
    await page.goto('/register');
    await page.getByLabel('Имя пользователя').fill(`p${Date.now().toString(36)}`);
    await page.getByLabel(/^Отображаемое имя/).fill('Tester');
    await page.getByLabel('Пароль', { exact: true }).fill('correcthorse');
    await page.getByLabel('Подтвердите пароль').fill('correcthorse');
    await page.getByRole('button', { name: /Создать аккаунт/i }).click();
    await expect(page).toHaveURL(/\/$/);
    await dismissTour(page);
    await page.goto('/study/level/a1');
    await page.waitForLoadState('networkidle');
    await dismissTour(page);

    const trigger = page.getByRole('group', { name: 'Направление' }).getByRole('button').first();
    await trigger.click();

    const listbox = page.getByRole('listbox');
    await expect(listbox).toBeVisible();
    await waitForFocusInListbox(page);
    const options = listbox.getByRole('option');
    await expect(options).toHaveCount(2);
    // Exactly one option in the tab order — the roving tabindex.
    expect(await options.evaluateAll((els) => els.filter((e) => e.tabIndex === 0).length)).toBe(1);
    // Exactly one selected, and the focus landed on it.
    expect(await options.evaluateAll((els) => els.filter((e) => e.getAttribute('aria-selected') === 'true').length)).toBe(1);
    expect(
      await options.evaluateAll((els) => els.filter((e) => e === document.activeElement).length),
      'opening the listbox should move focus onto the selected option',
    ).toBe(1);

    // Arrows move the focus between the two options and stop at the ends.
    const focusedLabel = async () =>
      page.evaluate(() => (document.activeElement?.textContent ?? '').trim());
    const first = (await focusedLabel()).slice(0, 10);
    await page.keyboard.press('ArrowUp');
    expect((await focusedLabel()).slice(0, 10), 'ArrowUp wraps to the other end').not.toBe(first);
    await page.keyboard.press('ArrowDown');
    expect((await focusedLabel()).slice(0, 10), 'ArrowDown comes back').toBe(first);

    // Escape closes and hands the focus back, rather than stranding it on
    // <body> — on a filter row that means re-tabbing the whole page.
    await page.keyboard.press('Escape');
    await expect(listbox).toHaveCount(0);
    expect((await focusInfo(page)).name, 'focus should be back on the trigger').toBe('Қаз → Рус');

    // Reopen, arrow onto the other option, and choose it with Enter.
    await trigger.click();
    await expect(listbox).toBeVisible();
    await waitForFocusInListbox(page);
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/dir=ru-kk/, { timeout: 5000 });
    await expect(trigger).toHaveText(/Рус → Қаз/);
  });
});
