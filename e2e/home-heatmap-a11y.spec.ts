import { test, expect } from '@playwright/test';
import { closeOnboardingIfOpen } from './helpers';

/**
 * The Home page's activity heatmap.
 *
 * This component is a second implementation of the Stats page's heatmap
 * — the file header says so, and it duplicates the bucketing logic on
 * purpose so the two views look consistent. It also duplicated the
 * defects. Two of them, and the second one is the reason this file
 * exists separately from `stats-a11y.spec.ts`: fixing the Stats heatmap
 * and declaring the problem closed was wrong, because the same broken
 * markup was sitting on the first screen a learner ever sees.
 *
 * Each test was run against the reverted fix first.
 */

test.describe('Home heatmap — accessibility', () => {
  test.use({ serviceWorkers: 'block' });

  test('it is announced as one image, and in the interface language', async ({ page }) => {
    const username = `hh${Math.random().toString(36).slice(2, 8)}`;
    await page.goto('/register');
    await page.fill('#username', username);
    await page.fill('#displayName', 'Тест');
    await page.fill('#password', 'testtest1234');
    await page.fill('#confirm', 'testtest1234');
    await page.click('button[type=submit]');
    await page.waitForURL((u) => u.pathname === '/', { timeout: 15000 });
    await closeOnboardingIfOpen(page);

    // Study first: the Home page shows an empty state, and an account
    // with no reviews has no heatmap to assert anything about.
    await page.goto('/study/level/a1');
    await page.waitForLoadState('networkidle');
    await closeOnboardingIfOpen(page);
    const reveal = page.getByRole('button', { name: /Показать ответ/i });
    if (await reveal.isVisible().catch(() => false)) {
      await reveal.click();
      const good = page.locator('button[data-grade="good"]').first();
      await good.waitFor({ state: 'visible', timeout: 5000 });
      await good.click();
      await page.waitForTimeout(400);
    }

    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await closeOnboardingIfOpen(page);

    const heatmap = page.locator('[class*="heatmapGrid"]');
    await expect(heatmap, 'the home heatmap should render once there are reviews').toHaveCount(1, {
      timeout: 10000,
    });

    // 1. The grid role. Same four promises, none kept: no `role="row"`,
    //    no roving tabindex, no keydown handler, and a cell reachable
    //    only by hovering it.
    expect(await page.locator('[role="grid"]').count(), 'no role="grid" may remain').toBe(0);
    expect(
      await page.locator('[role="gridcell"]').count(),
      'no role="gridcell" may remain',
    ).toBe(0);
    expect(await heatmap.getAttribute('role')).toBe('img');

    // 2. The hard-coded Russian. This component interpolated its own
    //    label — "Активность за 7 недель: 128 повторений, 12 активных
    //    дней" — plus a "нет повторений" tooltip value, as string
    //    literals in the JSX. Switching the app to English changed the
    //    rest of the screen and left these Russian, which is the
    //    version of the bug the Stats charts had and the reason an
    //    aria-label sweep over Stats alone was not enough to find it.
    const label = (await heatmap.getAttribute('aria-label')) ?? '';
    expect(label.length, 'the image needs an accessible name').toBeGreaterThan(0);
    expect(label, 'the label should be in the interface language').toMatch(/[а-яА-ЯёЁ]/);
    // And it must be the dictionary's sentence, parameterised by the
    // window rather than a literal that can only ever say one number.
    expect(label, 'the label should name the 7-week window').toMatch(/7\s*недел/);
    expect(label, 'the label should carry the totals').toMatch(/повторен/);
    expect(label, 'the label should carry the active-day count').toMatch(/активн/);

    // The cells are decorative under role="img" — one announcement,
    // not 49.
    const exposed = await page.locator('[class*="heatmapCell"]').evaluateAll((els) =>
      els.filter((e) => e.getAttribute('aria-label') || e.getAttribute('role')).length,
    );
    expect(exposed, 'heatmap cells should carry no role or label').toBe(0);
  });
});
