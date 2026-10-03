import { test, expect, type Page } from '@playwright/test';
import { closeOnboardingIfOpen } from './helpers';

/**
 * Press feedback.
 *
 * Roughly 76 selectors across 14 stylesheets carried a `:hover` style
 * and no `:active` style. On a touch screen a control therefore gave no
 * signal that it had been pressed: nothing changed, and the app only
 * responded once the navigation landed. That is the whole of the
 * defect — it is about feedback latency, not about colour.
 *
 * The house idiom was already set by two rules that existed before this
 * pass, and the fix follows it exactly rather than inventing a new one:
 *
 *   src/styles/global.css:647   .btn:active      { transform: translateY(1px) }
 *   src/pages/StudyPage.module.css:323
 *                               .ratingBtn:active { transform: translateY(1px) }
 *
 * So the test holds the mouse down and reads the computed transform
 * while the element is genuinely in the `:active` state. It measures
 * the real press rather than grepping the stylesheet, which means a
 * rule that exists but is overridden, or is placed in a media query
 * that does not apply, fails the test.
 */

async function registerAndStudy(page: Page, prefix: string, cards = 2) {
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
    await page.waitForTimeout(300);
  }
}

/**
 * Press `locator` and return the computed transform while it is down.
 * `page.mouse.down()` is what puts the element into `:active` — there
 * is no way to read a pseudo-class's computed style without actually
 * triggering it.
 */
async function transformWhilePressed(page: Page, locator: import('@playwright/test').Locator) {
  await locator.scrollIntoViewIfNeeded();
  const box = await locator.boundingBox();
  if (!box) throw new Error('element has no box');
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  try {
    return await locator.evaluate((el) => getComputedStyle(el).transform);
  } finally {
    await page.mouse.up();
  }
}

/** A 1px downward press is `matrix(1, 0, 0, 1, 0, 1)`. */
const PRESSED_1PX = 'matrix(1, 0, 0, 1, 0, 1)';

test.describe('Press feedback', () => {
  test.use({ serviceWorkers: 'block' });

  test('a level pill moves down 1px while it is held', async ({ page }) => {
    // `.levelPill` had `.levelPill:hover` (colour, border, and
    // `text-decoration: none` to beat global.css) and nothing for
    // `:active`, so a tap on the pill produced no press feedback at
    // all. Pinned on the study screen because that is where the pills
    // are, and where a learner touches them most.
    await registerAndStudy(page, 'press');
    await page.goto('/study/level/a1');
    await page.waitForLoadState('networkidle');
    await closeOnboardingIfOpen(page);

    const pill = page.locator('[class*="levelPill"]').first();
    await expect(pill).toBeVisible();

    expect(await transformWhilePressed(page, pill)).toBe(PRESSED_1PX);

    // And it must come back up — a press state that latched would be a
    // worse bug than the one being fixed.
    await page.waitForTimeout(150);
    const after = await pill.evaluate((el) => getComputedStyle(el).transform);
    expect(after, 'the press must not latch').not.toBe(PRESSED_1PX);
  });

  test('a search chip on Browse moves down 1px while it is held', async ({ page }) => {
    // A different file, a different component, the same rule. If this
    // one passes and the pill does not, the fix is a local patch rather
    // than a sweep — which is exactly the claim that needs checking.
    await registerAndStudy(page, 'press2');
    await page.goto('/browse');
    await page.waitForLoadState('networkidle');
    await closeOnboardingIfOpen(page);

    const chip = page.locator('[class*="chip"]').first();
    await expect(chip, 'the browse filter chips should render').toBeVisible();

    expect(await transformWhilePressed(page, chip)).toBe(PRESSED_1PX);
  });

  test('a KPI tile on Stats moves down 1px while it is held', async ({ page }) => {
    // The Stats page is where the new `:active` rules are densest, and
    // `.kpiLink` is the one that sits directly under a comment block
    // explaining why it suppresses the global `a:hover` underline —
    // easy to place a rule in the wrong spot and hard to notice.
    await registerAndStudy(page, 'press3');
    await page.goto('/stats');
    await page.waitForLoadState('networkidle');
    await closeOnboardingIfOpen(page);

    const kpi = page.locator('[class*="kpiLink"]').first();
    await expect(kpi, 'the KPI tiles should render once there are reviews').toBeVisible();

    expect(await transformWhilePressed(page, kpi)).toBe(PRESSED_1PX);
  });
});
