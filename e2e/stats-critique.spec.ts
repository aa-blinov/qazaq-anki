import { test, expect } from '@playwright/test';
import { closeOnboardingIfOpen } from './helpers';

/**
 * Five fixes from the `impeccable critique` of `src/pages/StatsPage.tsx`
 * (run 2026-10-02, 19/40). Each test here pins one of them, and each
 * was checked against a reverted fix before being kept — a test that
 * passes with the bug still present is worse than no test, because it
 * buys confidence it has not earned.
 */

/**
 * Seed one real card as a leech by intercepting GET /progress.
 *
 * Leech state lives in the server's progress map and the threshold is
 * 8 lapses (SCHEDULER_DEFAULTS.leechThreshold in
 * src/lib/scheduler-config.ts). Producing eight real lapses through
 * the UI is not possible in a test: rating "Снова" pushes the card a
 * day out, so it never comes back around inside one session. The Stats
 * page reads `progress[cardId].lapses` directly (StatsPage.tsx:217),
 * so seeding the response is both sufficient and the honest seam.
 *
 * The cardId has to be one the page can resolve to a real card —
 * `.leechKk` renders the card's Kazakh front, and the decks are what
 * supply it. So the caller reviews one real card first, and this
 * bumps whatever cardId the server already knows about.
 */
async function seedLeech(page: import('@playwright/test').Page) {
  let seeded = false;
  await page.route('**/api/progress', async (route) => {
    const response = await route.fetch();
    const body = await response.json();
    const ids = body.progress ? Object.keys(body.progress) : [];
    if (ids.length === 0) {
      await route.fulfill({ response });
      return;
    }
    body.progress[ids[0]] = { ...body.progress[ids[0]], lapses: 9 };
    seeded = true;
    await route.fulfill({
      response,
      body: JSON.stringify(body),
      headers: { ...response.headers(), 'content-type': 'application/json' },
    });
  });
  return () => seeded;
}

async function registerAndOpenStats(
  page: import('@playwright/test').Page,
  prefix: string,
) {
  const username = `${prefix}${Math.random().toString(36).slice(2, 8)}`;
  await page.goto('/register');
  await page.fill('#username', username);
  await page.fill('#displayName', 'Тест');
  await page.fill('#password', 'testtest1234');
  await page.fill('#confirm', 'testtest1234');
  await page.click('button[type=submit]');
  await page.waitForURL((u) => u.pathname === '/', { timeout: 15000 });
  await closeOnboardingIfOpen(page);
  await page.goto('/stats');
  await page.waitForLoadState('networkidle');
  await closeOnboardingIfOpen(page);
}

test.describe('Stats page — fixes from the critique', () => {
  // Load-bearing, not hygiene. The app registers public/sw.js, and a
  // service-worker fetch bypasses page.route() entirely. Without this,
  // the /api/stats abort in the failure test below never fires, the
  // request succeeds, and the test passes against the unfixed page —
  // which is exactly what happened on the first attempt.
  test.use({ serviceWorkers: 'block' });

  test('forecast row lays out as a three-up grid, not three stacked bands', async ({
    page,
  }) => {
    // `styles.kpiRow` was referenced by the section and defined in no
    // stylesheet, so CSS Modules resolved it to `undefined`, React
    // omitted the className, and the <section> had no `display: grid`.
    // The three tiles stacked full-width: 994px tall where ~110px was
    // meant. The detector cannot catch a class that exists on only one
    // side, and the markup scan has no JSX rules at all.
    await registerAndOpenStats(page, 'kpi');

    const row = page.locator('[class*="kpiRow"]');
    await expect(row).toHaveCount(1, { timeout: 10000 });

    const layout = await row.evaluate((el) => {
      const kids = [...el.children];
      return {
        display: getComputedStyle(el).display,
        rows: new Set(kids.map((k) => Math.round(k.getBoundingClientRect().top))).size,
        count: kids.length,
        widths: kids.map((k) => Math.round(k.getBoundingClientRect().width)),
        height: Math.round(el.getBoundingClientRect().height),
      };
    });

    expect(layout.display, 'the forecast row must be a grid').toBe('grid');
    expect(layout.count, 'three forecast tiles').toBe(3);
    expect(layout.rows, 'all three on one row, not three bands').toBe(1);
    // Stacked bands were the full content width each; side by side
    // they are roughly a third of it.
    expect(layout.widths[0]).toBeLessThan(400);
    expect(layout.height, 'the stacked version measured 994px').toBeLessThan(200);
  });

  test('Темы tab opens at the topic grid, not under 900px of activity charts', async ({
    page,
  }) => {
    // The deep-dive branch was gated on `activeTab === 'overview' ?
    // null : (…)`, which is every tab except overview — so the Темы tab
    // rendered the activity card, the 13-week heatmap and the SM-2
    // <details> before the grid. The grid started ~54% down a
    // 3,566px document. The tab bar's own comment says it splits the
    // page into three focused views; the views were not split.
    await registerAndOpenStats(page, 'top');

    const tab = page.getByRole('tab', { name: /Темы/i });
    await expect(tab).toHaveCount(1);
    await tab.click({ force: true });

    const head = page.getByRole('heading', { name: /По темам/i });
    await expect(head).toBeVisible({ timeout: 10000 });

    const gap = await page.evaluate(() => {
      const bar = document.querySelector('[role="tablist"]');
      const h = [...document.querySelectorAll('h2')].find((el) =>
        (el.textContent || '').includes('По темам'),
      );
      if (!bar || !h) return null;
      return (
        h.getBoundingClientRect().top +
        window.scrollY -
        (bar.getBoundingClientRect().bottom + window.scrollY)
      );
    });

    expect(gap, 'the topic heading must be the first thing under the tab bar').toBeLessThan(
      120,
    );
    // The activity card and the heatmap belong to the Активность tab.
    await expect(
      page.locator('[class*="activityCard"]'),
      'no activity card on the Темы tab',
    ).toHaveCount(0);
    await expect(
      page.locator('[class*="heatmapGrid"]'),
      'no heatmap on the Темы tab',
    ).toHaveCount(0);
  });

  test('no streak counter and no personal best on the activity block', async ({
    page,
  }) => {
    // "Серия" (streak) and "Лучший день" (personal best) are the two
    // gamification primitives PRODUCT.md principle 4 forbids by name:
    // "no ceremony, no gamification, no streak shaming. Returning
    // after a week off is a normal event, not a failure state."
    //
    // Read on the Активность tab, not Сводка: the overview branch
    // gates its copy of this card on `totalReviews > 0`, so a fresh
    // account shows the empty state there and the test would pass
    // against markup that no longer exists.
    await registerAndOpenStats(page, 'gm');

    const activity = page.getByRole('tab', { name: /Активность/i });
    await expect(activity).toHaveCount(1);
    await activity.click({ force: true });

    const card = page.locator('[class*="activityCard"]').first();
    await expect(card).toBeVisible({ timeout: 10000 });

    // Case-insensitive on purpose. `.kpiLabel` sets
    // `text-transform: uppercase`, so the rendered text of a restored
    // "Серия" reads back as "СЕРИЯ". The first version of this test
    // used a case-sensitive `not.toContain('Серия')` and passed with
    // the streak fully restored — a test that cannot fail.
    const body = (await card.innerText()).toLocaleLowerCase('ru-RU');
    expect(body, 'no streak counter').not.toContain('серия');
    expect(body, 'no streak sublabel').not.toContain('подряд с повторениями');
    expect(body, 'no personal best').not.toContain('лучший день');

    // The replacement is a fact, not a score.
    await expect(card).toContainText(/В среднем за день/i);

    // And the rhythm-shaming copy is gone from the whole page.
    const all = (await page.locator('body').innerText()).toLocaleLowerCase('ru-RU');
    expect(all).not.toContain('выпали из ритма');
    expect(all).not.toContain('держите ритм');
  });

  test('a failed /api/stats says so instead of spinning a skeleton forever', async ({
    page,
  }) => {
    // The catch only console.warn'd, so `serverStats` stayed null, the
    // forecast row never rendered, and LevelMasteryRingsSkeleton held
    // at aria-busy="true" for the life of the page. A dead server was
    // visually identical to a page that had not finished loading.
    //
    // `serviceWorkers: 'block'` is load-bearing, not hygiene: the app
    // registers public/sw.js, and a service-worker fetch bypasses
    // page.route() entirely. The first version of this test registered
    // an unregister-on-init script, the abort never fired, the request
    // succeeded — and the test "proved" a bug that was still there.
    // `serviceWorkers: 'block'` on the describe is load-bearing here:
    // with the app's public/sw.js active, a service-worker fetch
    // bypasses page.route() entirely, the abort never fires, the
    // request succeeds — and the test passes against the unfixed page.
    await page.route('**/api/stats*', (route) => route.abort('failed'));
    await registerAndOpenStats(page, 'err');

    const retry = page.getByTestId('stats-retry-forecast');
    await expect(retry, 'the failure must be visible').toBeVisible({ timeout: 10000 });
    // `closest` is a DOM method, not a Locator one — the notice is the
    // button's parent, so select it as a CSS locator instead.
    const notice = page.locator('[role="status"]', { has: retry });
    await expect(notice).toContainText('сервере');
    await expect(notice).toContainText('на устройстве');

    // The skeleton must not outlive the request that failed.
    await expect(
      page.locator('[aria-busy="true"]'),
      'no skeleton still claiming to be busy after the failure',
    ).toHaveCount(0);

    // Local-first: the four client-computed KPIs are still true.
    await expect(page.locator('body')).toContainText(/Изучено карточек/i);

    // The retry is a real affordance, not a decorative button.
    await expect(retry).toHaveText(/Повторить/);
  });

  test('the display serif is reserved for Kazakh, not spent on Russian numerals', async ({
    page,
  }) => {
    // Source Serif 4 is the design system's promise that the learner
    // meets the new language. It was on every Russian label and every
    // KPI numeral, while .leechKk — the one Kazakh string on the page —
    // set no font-family at all and inherited Inter. The mechanism ran
    // exactly backwards.
    await registerAndOpenStats(page, 'ser');

    // Review one real card so the server's progress map has a cardId
    // the page can resolve against a deck. Without a real review the
    // seed has nothing to bump and there is no leech row to measure.
    await page.goto('/study/level/a1');
    await page.waitForLoadState('networkidle');
    await closeOnboardingIfOpen(page);
    const reveal = page.getByRole('button', { name: /Показать ответ/i });
    await reveal.first().click({ force: true });
    await page.waitForTimeout(400);
    await page.getByRole('button', { name: /Хорошо/i }).first().click({ force: true });
    await page.waitForTimeout(600);

    const didSeed = await seedLeech(page);
    await page.goto('/stats?tab=activity');
    await page.waitForLoadState('networkidle');
    await closeOnboardingIfOpen(page);
    await page.waitForTimeout(800);

    const kk = page.locator('[class*="leechKk"]');
    await expect(
      kk.first(),
      `the leech seed produced no card (seeded=${await didSeed()})`,
    ).toBeVisible({ timeout: 10000 });

    const kazakhFont = await kk
      .first()
      .evaluate((el) => getComputedStyle(el).fontFamily);
    expect(
      kazakhFont,
      'the Kazakh word must be set in the display serif',
    ).toMatch(/Source Serif 4|Iowan Old Style|Georgia/);

    // And the Russian scaffolding numerals come off the serif.
    const value = page.locator('[class*="kpiValue"]').first();
    await expect(value).toBeVisible();
    const numFont = await value.evaluate((el) => getComputedStyle(el).fontFamily);
    expect(numFont, 'KPI numerals are Russian scaffolding, not Kazakh').not.toMatch(
      /Source Serif 4/,
    );
    expect(numFont).toMatch(/Inter/);

    // Truncation on the one string the product exists to show is the
    // wrong failure mode — Kazakh compounds run long.
    const wrap = await kk.first().evaluate((el) => ({
      whiteSpace: getComputedStyle(el).whiteSpace,
      overflow: getComputedStyle(el).textOverflow,
    }));
    expect(wrap.whiteSpace).not.toBe('nowrap');
    expect(wrap.overflow).not.toBe('ellipsis');
  });
});
