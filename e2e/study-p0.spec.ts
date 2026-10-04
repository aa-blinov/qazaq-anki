import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test, expect } from '@playwright/test';
import { closeOnboardingIfOpen } from './helpers';

/**
 * The two P0 findings from the `impeccable critique` of the study screen
 * (2026-10-04, 26/40). Both were verified live on a running container
 * before the fix, and each test here was run against the reverted code
 * first.
 *
 * The detector found nothing on either file. These are the findings a
 * scan cannot reach: one is a header the scanner never fetches, the
 * other is a default value that no rule in the book objects to.
 */

test.describe('Study screen — P0 regressions', () => {
  // Deliberately NOT `serviceWorkers: 'block'`, unlike most specs in this
  // suite. That option is there to stop a service-worker fetch from
  // bypassing `page.route()`, and this file uses no route mocking — but
  // it would also suppress the very registration the first test asserts,
  // making that test pass for the wrong reason all over again.

  test('the page registers its own service worker, and ships no inline script', async ({ page }) => {
    // The registration was an inline <script> in index.html. The
    // deployed stack serves `script-src 'self'` from nginx, so the
    // inline block was blocked and the offline shell never existed —
    // measured on a live container: 0 registrations, 1 CSP violation.
    //
    // It stayed invisible because the old test called `register()`
    // itself, so it passed whether or not the shipped page did
    // anything.
    //
    // Two assertions, because neither alone is falsifiable here. The
    // behavioural one cannot catch it in this suite: Playwright serves
    // the app from Vite, where the policy comes from the <meta> tag,
    // which still allows 'unsafe-inline' for HMR. So the structural one
    // carries the weight — and it is the real invariant anyway: the
    // deployed header permits only same-origin files, so a page that
    // contains an inline script is a page that breaks on deploy no
    // matter what it does in development.
    // Read the source file rather than fetching '/': the Vite dev
    // server injects its own inline HMR client, and this suite runs
    // against Vite, not the built bundle. The deployable artifact is
    // what carries the strict header, and the source file is what that
    // artifact is generated from.
    // Comments are stripped first, and not as a nicety: this file's own
    // CSP comment contains the literal text `<script>` while explaining
    // that the build has none, and an unstripped scan happily reports
    // the comment as the offender.
    const html = readFileSync(resolve(process.cwd(), 'index.html'), 'utf8')
      .replace(/<!--[\s\S]*?-->/g, '');
    const inlineScripts = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)]
      .map((m) => m[1].trim())
      .filter((body) => body.length > 0);
    expect(
      inlineScripts,
      'index.html must contain no inline <script>: the deployed CSP is script-src \'self\'',
    ).toEqual([]);

    const cspErrors: string[] = [];
    page.on('console', (m) => {
      if (m.type() === 'error' && /Content Security Policy/.test(m.text())) {
        cspErrors.push(m.text());
      }
    });

    await page.goto('/login', { waitUntil: 'load' });
    await page.waitForTimeout(2500);

    const regs = await page.evaluate(async () => {
      const list = await navigator.serviceWorker.getRegistrations();
      return { count: list.length, scopes: list.map((r) => r.scope) };
    });

    expect(regs.count, 'the page must register the worker itself').toBeGreaterThan(0);
    expect(regs.scopes.join(','), 'the worker must cover the app root').toContain('/');
    expect(
      cspErrors,
      `an inline script was blocked by CSP: ${cspErrors.join(' | ')}`,
    ).toEqual([]);
  });

  test('a session opens on the due queue, not the whole deck', async ({ page }) => {
    // `mode` initialised to 'all', so a session was the entire pool
    // across every level: 3,996 cards, with the learner's real due
    // reviews shuffled among ~3,974 unseen words, behind a
    // "1 из 3996" counter and a 0% bar. The product documents the
    // ritual as open → review queue → close.
    const username = `due${Math.random().toString(36).slice(2, 8)}`;
    await page.goto('/register');
    await page.fill('#username', username);
    await page.fill('#displayName', 'Тест');
    await page.fill('#password', 'testtest1234');
    await page.fill('#confirm', 'testtest1234');
    await page.click('button[type=submit]');
    await page.waitForURL((u) => u.pathname === '/', { timeout: 15000 });
    await closeOnboardingIfOpen(page);

    // This account needs a genuinely DUE card before the assertion means
    // anything. Grading a new card does not produce one: SM-2 puts it in
    // `learning` with the next step in minutes, so `isDue` is false and
    // the fallback correctly hands a first session to 'new' instead. The
    // first attempt at this test asserted on two graded cards and failed
    // on the fallback firing — the fallback was right and the setup was
    // wrong.
    //
    // So: grade one card for real, take its real id out of the PUT the
    // page makes, then move that card's due date into the past. No
    // hard-coded deck ids, and the state goes through the same endpoint
    // the app itself uses.
    await page.goto('/study/level/a1');
    await page.waitForLoadState('networkidle');
    await closeOnboardingIfOpen(page);

    const graded = page.waitForResponse(
      (r) => r.url().includes('/api/progress/') && r.request().method() === 'PUT',
      { timeout: 15000 },
    );
    const reveal = page.getByRole('button', { name: /Показать ответ/i });
    await expect(reveal, 'a fresh account must have something to study').toBeVisible();
    await reveal.click();
    await page.locator('button[data-grade="good"]').first().click();
    const gradedResponse = await graded;
    const cardId = decodeURIComponent(
      gradedResponse.url().split('/api/progress/')[1].split('?')[0],
    );

    const seeded = await page.evaluate(async (id) => {
      const token = localStorage.getItem('aq:token');
      const past = new Date(Date.now() - 86400000).toISOString();
      const res = await fetch('/api/progress/' + encodeURIComponent(id), {
        method: 'PUT',
        headers: { 'content-type': 'application/json', Authorization: 'Bearer ' + token },
        body: JSON.stringify({
          state: {
            phase: 'review',
            ease: 2.5,
            interval: 3,
            due: past,
            lastReview: past,
            reviews: 2,
            correct: 2,
            lapses: 0,
            learningStep: 0,
            reps: 1,
          },
        }),
      });
      return { ok: res.ok, status: res.status };
    }, cardId);
    expect(seeded.ok, `seeding a due card failed (${seeded.status})`).toBe(true);

    // Come back through the level route a returning learner would use.
    await page.goto('/study/level/a1');
    await page.waitForLoadState('networkidle');
    await closeOnboardingIfOpen(page);

    // The queue scope is a collapsed listbox, so the selected option is
    // only in the DOM while the menu is open. Open it and read what is
    // actually selected — that is the mode, not a proxy for it.
    //
    // The label is `study.tab.due` = "Повтор", and the option carries the
    // queue length beside it. Asserting on the pair pins down both the
    // mode and its scope in one string: the account has exactly one due
    // card (the one seeded above), so "Повтор 1" is the only correct
    // reading. Matching the bare word "Повтор" would not be enough — the
    // cram tab is "Повторить всё" and contains it.
    const cardsTrigger = page.locator('button[aria-haspopup="listbox"]').first();
    await cardsTrigger.click();
    const selected = page.locator('[role="option"][aria-selected="true"]');
    await expect(selected, 'the cards picker should have a selection').toHaveCount(1);
    expect(
      (await selected.innerText()).replace(/\s+/g, ' ').trim(),
      'the session must open on the due queue, scoped to the due cards',
    ).toBe('Повтор 1');
    await page.keyboard.press('Escape');

    // And the session counter must reflect the due queue, not the deck.
    // One seeded due card means "1 из 1" exactly — the old default
    // rendered "1 из 712" here, with a 0% bar.
    const counter = page.locator('[data-testid="study-counter"]');
    await expect(counter, 'the session counter should be visible').toBeVisible();
    expect(
      (await counter.innerText()).replace(/\s+/g, ' ').trim(),
      'the counter must count the due queue, not the whole deck',
    ).toBe('1 из 1');
  });

  test('a brand-new account is not met by an empty screen', async ({ page }) => {
    // The other half of the same fix. Defaulting to 'due' alone would
    // have greeted a learner who registered yesterday with zero
    // schedules and therefore zero due cards — trading one broken
    // first session for another. The fallback has to open 'new', which
    // honours the daily cap.
    const username = `new${Math.random().toString(36).slice(2, 8)}`;
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

    // A card is on screen — not the "nothing to study" end state.
    const card = page.locator('[class*="kazakhWord"]').first();
    await expect(card, 'a first session must show a card').toBeVisible({ timeout: 10000 });

    await page.locator('button[aria-haspopup="listbox"]').first().click();
    const selected = page.locator('[role="option"][aria-selected="true"]');
    await expect(selected, 'the cards picker should have a selection').toHaveCount(1);
    // "Новые 20" — the tab label plus the daily cap, which is the whole
    // point of the fallback: new cards stay capped, the session is just
    // not empty.
    expect(
      (await selected.innerText()).replace(/\s+/g, ' ').trim(),
      'with nothing due, the session should open on new cards',
    ).toMatch(/^Новые \d+$/);
  });
});
