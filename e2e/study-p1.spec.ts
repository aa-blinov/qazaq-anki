import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test, expect, type Page } from '@playwright/test';
import { closeOnboardingIfOpen } from './helpers';

/**
 * The four P1 findings from the `impeccable critique` of the study
 * screen (2026-10-04), all confirmed live on a running container
 * before the fix. Each test here was run against the reverted code
 * first and failed for the reason its comment names.
 *
 * These are the findings a scan cannot reach: a grid that resolves to
 * the wrong shape at one breakpoint, a string that exists only in an
 * aria-label, a font applied to the wrong script, and a celebration
 * that was never asked for.
 */

/** Register a throwaway account and land on a revealed card. */
async function openRevealedCard(page: Page, username: string) {
  await page.goto('/register');
  await page.fill('#username', username);
  await page.fill('#displayName', 'Тест');
  await page.fill('#password', 'testtest1234');
  await page.fill('#confirm', 'testtest1234');
  await page.click('button[type=submit]');
  await page.waitForURL((u) => u.pathname === '/', { timeout: 15000 });
  await closeOnboardingIfOpen(page);

  await page.goto('/study/level/a1');
  await page.waitForLoadState('networkidle');
  await closeOnboardingIfOpen(page);

  // A fresh account has nothing due, so the first-run fallback opens
  // the new-cards queue and there is always a card to reveal.
  const reveal = page.getByRole('button', { name: /Показать ответ/i });
  await expect(reveal, 'a fresh account must have something to study').toBeVisible();
  await reveal.click();
}

test.describe('Study screen — P1 fixes', () => {
  test('the four grades stay on one row on a 375px phone', async ({ page }) => {
    // `.ratingRow` was `repeat(4, 1fr)` and the ≤600px block overrode it
    // to `1fr 1fr`. Measured on a 375px viewport before the fix: the
    // buttons occupied two rows, tops at 0 and 92px.
    //
    // The shape is wrong rather than merely untidy. The four SM-2
    // grades are an ordered scale and the row order is what carries
    // that, so a 2×2 wrap puts "Снова" above "Трудно" instead of
    // beside it. It also spent a whole row of height on the shortest
    // screens, which is where the card is tightest.
    await page.setViewportSize({ width: 375, height: 720 });
    await openRevealedCard(page, `row${Math.random().toString(36).slice(2, 8)}`);

    const boxes = await page
      .locator('.ratingBtn, [class*="ratingBtn"]')
      .evaluateAll((els) =>
        els.map((el) => {
          const r = el.getBoundingClientRect();
          return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
        }),
      );

    expect(boxes.length, 'there are four grades').toBe(4);
    const tops = boxes.map((b) => b.y);
    const lowestTop = Math.max(...tops);
    const highestTop = Math.min(...tops);
    expect(
      highestTop - lowestTop,
      `all four must share one row; got tops ${JSON.stringify(tops)}`,
    ).toBeLessThanOrEqual(2);
    expect(
      new Set(boxes.map((b) => b.x)).size,
      'the four must be four distinct columns, not stacked',
    ).toBe(4);

    // And they must fit: a 4-across row that overflows is not a fix,
    // it is a horizontal scrollbar.
    const viewport = page.viewportSize()!;
    const widest = Math.max(...boxes.map((b) => b.x + b.w));
    expect(widest, 'the row must not overflow the viewport').toBeLessThanOrEqual(viewport.width);
    for (const b of boxes) {
      expect(b.w, 'each grade must keep a usable touch target').toBeGreaterThanOrEqual(44);
    }

    // The shortcut chip is pinned to the top-left corner and the label
    // is centred, so on a 73px button the two collide — the first pass
    // of the interval line pushed the label down into the chip's band
    // and the digit sat on the "С" of "Снова". A row of correct
    // geometry can still be unreadable, so assert the boxes do not
    // intersect rather than trusting the padding to be enough.
    const collisions = await page.evaluate(() => {
      const out: string[] = [];
      for (const btn of document.querySelectorAll('button[data-grade]')) {
        const chip = btn.querySelector('[class*="ratingShortcut"]');
        const label = btn.querySelector('[class*="ratingLabel"]');
        const interval = btn.querySelector('[class*="ratingInterval"]');
        if (!chip || !label || !interval) continue;
        const a = chip.getBoundingClientRect();
        const b = label.getBoundingClientRect();
        const hit = a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
        if (hit) out.push(`${btn.getAttribute('data-grade')}: chip overlaps label`);
        const l = label.getBoundingClientRect();
        const i = interval.getBoundingClientRect();
        if (l.bottom > i.top + 0.5) out.push(`${btn.getAttribute('data-grade')}: label overlaps interval`);
      }
      return out;
    });
    expect(collisions, 'the shortcut chip must not sit on the label').toEqual([]);
  });

  test('every grade states when the card will come back', async ({ page }) => {
    // The interval was computed and then spent on `aria-label`, so it
    // existed only for screen-reader users. A sighted learner had no
    // way to see that "Снова" costs ten minutes and "Легко" costs four
    // months — which is the entire reason the four grades are ordered
    // the way they are.
    //
    // The assertion is deliberately relative rather than a literal:
    // it extracts the interval out of the aria-label the app already
    // produced and requires that exact string to be visible. If the two
    // ever diverge the test fails, which is the point — one number,
    // spoken and shown, not two.
    await openRevealedCard(page, `iv${Math.random().toString(36).slice(2, 8)}`);

    const buttons = page.locator('button[data-grade]');
    await expect(buttons).toHaveCount(4);

    const seen: string[] = [];
    for (let i = 0; i < 4; i++) {
      const btn = buttons.nth(i);
      const aria = (await btn.getAttribute('aria-label')) ?? '';
      // "Хорошо: 10 мин до следующего повторения"
      const interval = aria.replace(/^[^:]*:\s*/, '').replace(/\s*до следующего повторения$/, '').trim();
      expect(interval, 'the aria-label must carry an interval').not.toBe('');
      expect(
        (await btn.innerText()).replace(/\s+/g, ' '),
        `grade ${i} must show "${interval}" as visible text`,
      ).toContain(interval);
      seen.push(interval);
    }
    // The scale is only informative if the four differ.
    expect(new Set(seen).size, `four grades produced one interval: ${seen.join(' / ')}`).toBeGreaterThan(1);
  });

  test('the Russian face is set in the interface sans, the Kazakh face in the display face', async ({
    page,
  }) => {
    // `--font-display` is Source Serif 4 and belongs to the Kazakh
    // word. Both faces used `.kazakhWord*` unconditionally, so in the
    // default kk-ru direction the Russian *answer* came back in a
    // serif — the most-read text on the screen, in a font nothing else
    // in the Russian-only interface uses. The ru-kk prompt had the
    // same defect, which is why the rule is applied per face rather
    // than to the answer alone.
    await openRevealedCard(page, `font${Math.random().toString(36).slice(2, 8)}`);

    const back = page.locator('[class*="kazakhWordSmall"]').first();
    // Both exclusions are required. `.kazakhWord` is the word element,
    // but the substring also matches `.kazakhWordRow` (its wrapper) and
    // `.kazakhWordSmall` (the back), and a substring match alone picks
    // up whichever comes first in the DOM — the wrapper, which carries
    // no font of its own and inherits the body sans. That reads as a
    // serif failure on a card that is correctly set.
    const front = page
      .locator('[class*="kazakhWord"]:not([class*="kazakhWordSmall"]):not([class*="kazakhWordRow"])')
      .first();
    await expect(back).toBeAttached();
    await expect(front).toBeAttached();

    const fontOf = (loc: typeof back) =>
      loc.evaluate((el) => getComputedStyle(el).fontFamily);

    const backFont = await fontOf(back);
    const frontFont = await fontOf(front);

    // The answer on a fresh kk-ru card is the Russian translation.
    const backText = (await back.innerText()).trim();
    expect(backText, 'the back of a kk-ru card shows the Russian answer').not.toBe('');

    // Compare the FIRST family of the stack, not the whole string. The
    // full sans stack ends in the keyword `sans-serif`, so a substring
    // test for "serif" matches the very value that proves the fix.
    const SERIF_FACES = [
      'Source Serif 4',
      'Iowan Old Style',
      'Apple Garamond',
      'Georgia',
      'Times New Roman',
    ];
    const primaryFace = (fontFamily: string) =>
      fontFamily.split(',')[0].trim().replace(/^["']|["']$/g, '');

    const backFace = primaryFace(backFont);
    const frontFace = primaryFace(frontFont);

    expect(
      SERIF_FACES,
      `the Russian answer must not resolve to a display face (got "${backFace}")`,
    ).not.toContain(backFace);
    expect(backFace, 'the Russian answer must resolve to the UI sans').toBe('Inter');

    // The Kazakh prompt keeps the display face — the serif is not
    // being removed, it is being used for the script it was cut for.
    expect(
      SERIF_FACES,
      `the Kazakh prompt must keep the display face (got "${frontFace}")`,
    ).toContain(frontFace);
  });

  test('the finished session reports its result instead of congratulating', async ({ page }) => {
    // The done screen opened with a 36px Sparkles and switched its title
    // to "Отлично!" past 80% accuracy. The accuracy is not lost — it
    // is in the summary line, paired with the count it is a percentage
    // of. What went away is the adjective and the icon standing between
    // the learner and the number they came for.
    //
    // Reaching the state is the point: the daily new-card cap is set to
    // 1 so the queue is exactly one card, graded Good, which is the
    // reviewed>0 / accuracy≥80 branch that used to print "Отлично!".
    const username = `done${Math.random().toString(36).slice(2, 8)}`;
    await page.goto('/register');
    await page.fill('#username', username);
    await page.fill('#displayName', 'Тест');
    await page.fill('#password', 'testtest1234');
    await page.fill('#confirm', 'testtest1234');
    await page.click('button[type=submit]');
    await page.waitForURL((u) => u.pathname === '/', { timeout: 15000 });

    const capped = await page.evaluate(async () => {
      const res = await fetch('/api/preferences', {
        method: 'PUT',
        headers: {
          'content-type': 'application/json',
          Authorization: 'Bearer ' + localStorage.getItem('aq:token'),
        },
        body: JSON.stringify({ newCardsPerDay: 1 }),
      });
      return res.ok;
    });
    expect(capped, 'the daily cap must be settable for this test to mean anything').toBe(true);

    await page.goto('/study/level/a1');
    await page.waitForLoadState('networkidle');
    await closeOnboardingIfOpen(page);

    const reveal = page.getByRole('button', { name: /Показать ответ/i });
    await expect(reveal).toBeVisible();
    await reveal.click();
    await page.locator('button[data-grade="good"]').first().click();

    // The whole queue is one card, so this is the end state.
    const title = page.locator('h1');
    await expect(title, 'the session should end after its only card').toBeVisible({ timeout: 10000 });
    const titleText = (await title.innerText()).trim();
    expect(
      titleText,
      'a finished session states the fact; it does not congratulate',
    ).not.toMatch(/Отлично|Здорово|Mолодец/);
    expect(titleText).toBe('Сессия завершена.');

    // The accuracy survives as a number, next to the count it divides.
    await expect(page.locator('body')).toContainText('100%');

    // No celebratory glyph above the title. The Sparkles lived in a
    // 64px circle that was the card's first child; the buttons in
    // `.doneActions` legitimately carry their own arrows, so the check
    // is on what comes *before* the heading rather than on the icon
    // count for the whole card.
    const firstChildTag = await page
      .locator('[class*="doneCard"] > *')
      .first()
      .evaluate((el) => el.tagName.toLowerCase());
    expect(
      firstChildTag,
      'the title must be the first thing in the done card, with no icon above it',
    ).toBe('h1');

    // The string itself is gone, not merely unreachable: a dead key in
    // both dictionaries is how this comes back.
    for (const file of ['src/i18n/ru.ts', 'src/i18n/en.ts']) {
      const src = readFileSync(resolve(process.cwd(), file), 'utf8');
      expect(src, `${file} must not carry a congratulation key`).not.toContain('titleDoneGreat');
    }
  });
});
