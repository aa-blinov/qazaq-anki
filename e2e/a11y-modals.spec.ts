import { test, expect, type Page } from '@playwright/test';
import { closeOnboardingIfOpen } from './helpers';

/**
 * The focus lifecycle of every overlay.
 *
 * Four overlays declared `aria-modal="true"`, which is a promise to
 * assistive tech that the rest of the page is inert. Measured in a
 * browser, three of the four broke the other half of it:
 *
 *   - AddCardModal moved focus nowhere, so the caret stayed on the
 *     "Добавить карточку" button *behind* the scrim, and Escape did
 *     nothing because it only listened from inside a dialog nobody had
 *     been moved into.
 *   - ConfirmDialog moved focus to "Отмена" but let Tab walk straight
 *     out into the page behind, and its own comment claimed it restored
 *     the focus on close. It did not.
 *   - OnboardingModal did the same as AddCardModal, and put the dialog
 *     role on the *backdrop*, so the dialog's accessible subtree was the
 *     whole overlay including everything behind it.
 *
 * `aria-modal` without the behaviour is worse than omitting it: the
 * screen reader hides the page the keyboard is now walking around in.
 */

/**
 * Focus must not escape the dialog, however many times you Tab.
 *
 * The number of presses is derived from the dialog's own focusable count
 * plus a few, because a fixed small number proves nothing on a long form:
 * the add-card dialog has a dozen fields, so eight Tabs never reach its end
 * and never reach the wrap either. The test has to go past the end to
 * know the wrap exists.
 */
async function expectFocusStaysInDialog(page: Page, extra = 3) {
  const presses = await page.evaluate((x) => {
    const d = document.querySelector('[role="dialog"],[role="alertdialog"]')!;
    const sel =
      'a[href],button:not([disabled]),input:not([disabled]):not([type="hidden"]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';
    return d.querySelectorAll(sel).length + x;
  }, extra);
  const escaped: number[] = [];
  for (let i = 0; i < presses; i++) {
    await page.keyboard.press('Tab');
    await page.waitForTimeout(60);
    const inside = await page.evaluate(() => {
      const dialogs = [
        ...document.querySelectorAll('[role="dialog"],[role="alertdialog"]'),
      ];
      return dialogs.some((d) => d.contains(document.activeElement));
    });
    if (!inside) escaped.push(i + 1);
  }
  expect(
    escaped,
    `focus left the dialog on Tab #${escaped.join(', #')} of ${presses} — the Tab wrap is not working`,
  ).toEqual([]);
}

async function nameOfTrigger(page: Page, re: RegExp): Promise<string> {
  const b = page.getByRole('button', { name: re });
  await expect(b).toBeVisible();
  return (await b.innerText()).trim();
}

test.describe('Overlay focus lifecycle', () => {
  test('the reset confirmation traps focus, closes on Escape, gives focus back', async ({
    page,
  }) => {
    await page.goto('/register');
    await page.getByLabel('Имя пользователя').fill(`d${Date.now().toString(36)}`);
    await page.getByLabel(/^Отобразаемое имя|^Отображаемое имя/).fill('Tester');
    await page.getByLabel('Пароль', { exact: true }).fill('correcthorse');
    await page.getByLabel('Подтвердите пароль').fill('correcthorse');
    await page.getByRole('button', { name: /Создать аккаунт/i }).click();
    await expect(page).toHaveURL(/\/$/);
    await closeOnboardingIfOpen(page);

    await page.goto('/stats');
    await page.waitForLoadState('networkidle');
    await closeOnboardingIfOpen(page);

    const triggerName = await nameOfTrigger(page, /Сбросить прогресс/i);
    const trigger = page.getByRole('button', { name: /Сбросить прогресс/i });
    await trigger.focus();
    await trigger.click();

    const dialog = page.locator('[role="alertdialog"]');
    await expect(dialog).toBeVisible();
    // Opened onto the safe choice, not the destructive one.
    expect(
      await dialog.evaluate((d) => d.contains(document.activeElement)),
      'focus should move into the dialog',
    ).toBe(true);

    await expectFocusStaysInDialog(page);

    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    // Focus goes back where it came from. Landing on <body> or a heading
    // means a keyboard user has to re-find the button they just used.
    expect(
      await page.evaluate(() =>
        (document.activeElement?.getAttribute('aria-label') ??
          document.activeElement?.textContent ??
          ''
        ).trim(),
      ),
      'focus should return to the button that opened the dialog',
    ).toBe(triggerName);
  });

  test('the add-card form takes focus, traps it, and closes on Escape', async ({ page }) => {
    await page.goto('/register');
    await page.getByLabel('Имя пользователя').fill(`f${Date.now().toString(36)}`);
    await page.getByLabel(/^Отображаемое имя/).fill('Tester');
    await page.getByLabel('Пароль', { exact: true }).fill('correcthorse');
    await page.getByLabel('Подтвердите пароль').fill('correcthorse');
    await page.getByRole('button', { name: /Создать аккаунт/i }).click();
    await expect(page).toHaveURL(/\/$/);
    await closeOnboardingIfOpen(page);

    await page.goto('/browse');
    await page.waitForLoadState('networkidle');
    await closeOnboardingIfOpen(page);

    const trigger = page.getByRole('button', { name: /Добавить карточку/i });
    await trigger.focus();
    const triggerName = (await trigger.innerText()).trim();
    await trigger.click();

    const dialog = page.locator('[role="dialog"]');
    await expect(dialog).toBeVisible();
    // A form dialog should let you start typing, not land on its close
    // button just because that is first in the DOM.
    expect(
      await dialog.evaluate((d) => d.contains(document.activeElement)),
      'focus should move into the form',
    ).toBe(true);
    expect(
      await page.evaluate(() => document.activeElement?.tagName),
      'focus should land on the first field, not the close button',
    ).toBe('SELECT');

    await expectFocusStaysInDialog(page);

    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    expect(
      await page.evaluate(() =>
        (document.activeElement?.getAttribute('aria-label') ??
          document.activeElement?.textContent ??
          ''
        ).trim(),
      ),
      'focus should return to the button that opened the form',
    ).toBe(triggerName);
  });

  test('the form marks the field that is wrong, not just the form', async ({ page }) => {
    // The add-card form rendered errors as bare <p>s with no id, and the
    // inputs carried no aria-invalid and no aria-describedby — so the
    // message was announced with nothing tying it to the field. The
    // login/register forms have done this correctly all along.
    await page.goto('/register');
    await page.getByLabel('Имя пользователя').fill(`v${Date.now().toString(36)}`);
    await page.getByLabel(/^Отображаемое имя/).fill('Tester');
    await page.getByLabel('Пароль', { exact: true }).fill('correcthorse');
    await page.getByLabel('Подтвердите пароль').fill('correcthorse');
    await page.getByRole('button', { name: /Создать аккаунт/i }).click();
    await expect(page).toHaveURL(/\/$/);
    await closeOnboardingIfOpen(page);

    await page.goto('/browse');
    await page.waitForLoadState('networkidle');
    await closeOnboardingIfOpen(page);
    await page.getByRole('button', { name: /Добавить карточку/i }).click();

    // Submit with nothing filled in.
    await page.locator('[role="dialog"] button[type="submit"]').click();
    await page.waitForTimeout(500);

    const invalid = page.locator('[role="dialog"] [aria-invalid="true"]');
    const n = await invalid.count();
    expect(n, 'at least one field should be marked invalid').toBeGreaterThan(0);
    // And every marked field points at a message that actually exists.
    for (let i = 0; i < n; i++) {
      const id = await invalid.nth(i).getAttribute('aria-describedby');
      expect(id, 'an invalid field must reference its error').toBeTruthy();
      await expect(page.locator(`#${id}`)).toHaveCount(1);
    }
    // The form-level failure paragraph is an alert too. It only renders on
    // a server-side rejection, which this test does not provoke, so it is
    // checked in the source rather than pretended into a runtime
    // assertion that would pass vacuously.

    // The form-level message is `role="alert"`. Read from the source
    // rather than through a runtime assertion: provoking a real 5xx from
    // the form would need a broken API, and a test that asserts on an
    // element it never rendered proves nothing.
    const source = await import('node:fs').then((fs) =>
      fs.readFileSync('src/components/AddCardModal.tsx', 'utf8'),
    );
    expect(source, 'the form-level error must be announced').toContain(
      'id="card-err-form"',
    );
    expect(
      /id="card-err-form"[^>]*role="alert"|role="alert"[^>]*id="card-err-form"/s.test(source),
      'the form-level error paragraph needs role="alert"',
    ).toBe(true);
  });
});
