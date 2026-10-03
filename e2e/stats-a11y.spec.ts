import { test, expect, type Page } from '@playwright/test';
import { closeOnboardingIfOpen } from './helpers';

/**
 * Three accessibility defects on the Stats page, each pinned by a test
 * that was run against the reverted fix first. A test that passes with
 * the bug still present is worse than no test, because it buys
 * confidence it has not earned.
 */

/**
 * Register, then actually study.
 *
 * The Stats page renders an empty state instead of the charts while
 * `totalReviews === 0` (StatsPage.tsx:670), so a fresh account shows
 * none of the markup under test — five mastery rings and nothing else.
 * The reviews are therefore real ones through the study screen, not a
 * stubbed response: they are what puts real numbers in the activity
 * array the heatmap and the 30-day bar are built from.
 */
async function registerAndStudy(page: Page, prefix: string, cards = 3) {
  const username = `${prefix}${Math.random().toString(36).slice(2, 8)}`;
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

  for (let i = 0; i < cards; i++) {
    const reveal = page.getByRole('button', { name: /Показать ответ/i });
    if (!(await reveal.isVisible().catch(() => false))) break;
    await reveal.click();
    const good = page.locator('button[data-grade="good"]').first();
    await good.waitFor({ state: 'visible', timeout: 5000 });
    await good.click();
    // Let the grade land server-side before the next card.
    await page.waitForTimeout(350);
  }
}

/**
 * The retention chart stays hidden until the user has at least 10
 * reviews (StatsPage.tsx:861) — a flat 100% line over three reviews
 * looks like a broken chart rather than a good day. Ten reviews through
 * the UI would mean ten study cycles, so the buckets are seeded at the
 * seam the page reads them from. The shape is `RetentionBucket` from
 * src/lib/api.ts.
 */
async function seedRetention(page: Page) {
  await page.route('**/api/retention**', async (route) => {
    const today = new Date().toISOString().slice(0, 10);
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        days: 30,
        buckets: [{ day: today, n: 12, correct: 10, accuracy: 0.833 }],
      }),
    });
  });
}

/** Only the two charts live in a `chartWrap`; the five mastery rings
 *  are `role="img"` too, so counting every SVG on the page would be
 *  counting the wrong thing. */
function charts(page: Page) {
  return page.locator('[class*="chartWrap"] svg[role="img"]');
}

test.describe('Stats page — accessibility', () => {
  // Load-bearing. The app registers a service worker, and a SW fetch
  // bypasses page.route(), so the retention seed would silently not
  // apply and the chart under test would never render.
  test.use({ serviceWorkers: 'block' });

  test('the heatmap is announced as one image, not a 91-cell grid', async ({ page }) => {
    // The heatmap was `role="grid"` wrapping 91 `role="gridcell"` divs.
    // That role is a promise: a screen reader announces "grid" and then
    // expects rows, arrow-key navigation between cells, and cells the
    // user can actually reach. None of it was true. There was no
    // `role="row"`, no roving tabindex, no keydown handler — the only
    // way to reach a cell was to hover it, and hover is not an input
    // device. So the honest description of the thing was wrong in the
    // specific way that makes a screen reader user give up: the page
    // claimed an interactive control surface and delivered 91 dead
    // nodes.
    //
    // DESIGN.md recorded both possible repairs — roving tabindex over
    // 91 cells, or dropping the role and summarising the grid as an
    // image — and this is the second one.
    await registerAndStudy(page, 'hm');
    await page.goto('/stats');
    await page.waitForLoadState('networkidle');
    await closeOnboardingIfOpen(page);

    const heatmap = page.locator('[class*="heatmapGrid"]');
    await expect(heatmap, 'the heatmap should render once there are reviews').toHaveCount(1, {
      timeout: 10000,
    });

    // The old role is gone, from the container and from every cell.
    expect(await page.locator('[role="grid"]').count(), 'no role="grid" may remain').toBe(0);
    expect(
      await page.locator('[role="gridcell"]').count(),
      'no role="gridcell" may remain',
    ).toBe(0);

    // It is an image now, and it says what it is.
    expect(await heatmap.getAttribute('role')).toBe('img');
    const label = (await heatmap.getAttribute('aria-label')) ?? '';
    expect(label.length, 'the image needs an accessible name').toBeGreaterThan(0);

    // The name is self-describing rather than a bare caption: it carries
    // the two figures a non-mouse reader cannot get any other way, since
    // `role="img"` makes the whole subtree presentational.
    expect(label, 'the label should name the window').toMatch(/13 недел/);
    expect(label, 'the label should carry the review total').toMatch(/повторен/);
    expect(label, 'the label should carry the active-day count').toMatch(/активн/);

    // The header above states the same two totals in visible text, so
    // nothing that was readable before became readable-only-by-hover.
    const header = (await page.locator('[class*="heatmapHeader"]').innerText()).trim();
    expect(header, 'the header should state the totals').toMatch(/\d/);

    // And the cells are decorative as far as the accessibility tree is
    // concerned, so a reader gets one announcement instead of 91.
    const exposed = await page.locator('[class*="heatmapCell"]').evaluateAll((els) =>
      els.filter((e) => e.getAttribute('aria-label') || e.getAttribute('role')).length,
    );
    expect(exposed, 'heatmap cells should carry no role or label').toBe(0);
  });

  test('both chart SVGs are named in the interface language', async ({ page }) => {
    // Two SVGs carried hard-coded English accessible names on a page
    // whose entire interface is Russian:
    //
    //   aria-label="Daily reviews, last 30 days"
    //   aria-label="Daily retention, last 30 days"
    //
    // A Russian screen reader announced an English description of a
    // Russian chart. The strings were literals in the JSX, so no amount
    // of switching the language fixed them — the only way to hear the
    // chart described in the language you were reading was not to hear
    // it described at all.
    await registerAndStudy(page, 'chart');
    await seedRetention(page);
    await page.goto('/stats');
    await page.waitForLoadState('networkidle');
    await closeOnboardingIfOpen(page);

    // Both charts have to be on the page for this to mean anything. The
    // retention chart is not on the default "Сводка" tab — it belongs to
    // the deep-dive view on "Активность" (StatsPage.tsx:761-869), and it
    // additionally only clears its visibility threshold on the seeded 12
    // reviews. Counting on the overview tab finds one chart and stops.
    await page.getByRole('tab', { name: /^Активность/ }).click();
    await expect(charts(page), 'both chart SVGs should be present').toHaveCount(2, {
      timeout: 10000,
    });

    const labels = await charts(page).evaluateAll((els) =>
      els.map((e) => e.getAttribute('aria-label') ?? ''),
    );
    for (const label of labels) {
      expect(label.length, 'every chart needs an accessible name').toBeGreaterThan(0);
      // Cyrillic is the real assertion: the old English literal fails
      // here, and so would an empty or missing label.
      expect(label, `label "${label}" is not in Russian`).toMatch(/[а-яА-ЯёЁ]/);
    }
    expect(labels[0], 'the 30-day bar names itself').toMatch(/Повторения по дням/);
    expect(labels[1], 'the retention chart names itself').toMatch(/Точность по дням/);
  });

  test('no aria-label anywhere on the Stats page is hard-coded English', async ({ page }) => {
    // The two literals above were found by reading the JSX. This is the
    // sweep that would have found them, written down so the next one
    // does not have to be: an accessible name with no Cyrillic in it
    // and more than one word is a literal that never went through the
    // dictionary.
    //
    // Not a blanket ban on Latin — a Kazakh word, a filename or the
    // "SM-2" in a title may legitimately be Latin, and a single token
    // is allowed through. The rule is about multi-word phrases.
    await registerAndStudy(page, 'lit');
    await page.goto('/stats');
    await page.waitForLoadState('networkidle');
    await closeOnboardingIfOpen(page);

    const offenders = await page.evaluate(() => {
      const out: Array<{ tag: string; label: string }> = [];
      for (const el of document.querySelectorAll('[aria-label]')) {
        const label = (el.getAttribute('aria-label') ?? '').trim();
        if (!label) continue;
        if (/[а-яА-ЯёЁ]/.test(label)) continue; // properly localised
        if (label.split(/\s+/).length < 2) continue; // a single token is fine
        out.push({ tag: el.tagName.toLowerCase(), label });
      }
      return out;
    });

    expect(
      offenders,
      `untranslated aria-labels: ${offenders.map((o) => `${o.tag}="${o.label}"`).join(', ')}`,
    ).toEqual([]);
  });
});
