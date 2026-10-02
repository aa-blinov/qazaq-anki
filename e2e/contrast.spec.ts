import { test, expect } from '@playwright/test';
import { writeFileSync } from 'node:fs';

/**
 * Contrast guard — the app must clear WCAG AA text contrast on every page,
 * in BOTH themes, forever.
 *
 * This is the test the `colorize` pass earned its keep with. Before it,
 * `--text-subtle` failed 4.5:1 on every surface in the palette and 57
 * readings across 5 pages × 2 themes were below the floor. The token is
 * now retired rather than retuned (see DESIGN.md → Colors → Neutral), and
 * this file is what stops the same class of drift from coming back
 * silently: it asserts, so it fails, so CI notices.
 *
 * Two things it gets right that a naive version does not:
 *
 *  1. THEME. The app does not follow `prefers-color-scheme` at runtime.
 *     `theme-init.js` reads `localStorage['aq:theme']` and ThemeContext
 *     writes it to `<html data-theme>`. Calling `emulateMedia` alone would
 *     silently re-measure the light palette twice under two different
 *     headings. So the real key is seeded, and the applied theme is read
 *     back off `data-theme` before a reading is trusted.
 *
 *  2. GROUND. Contrast is a property of a pair, and a component nested in
 *     a table inherits the table's background, not the page's. So
 *     backdrops are composited down the ancestor chain — through
 *     translucent layers — until something opaque is reached. Measuring
 *     `color` against a token lookup would have passed the browse pager
 *     while it was really drawing on `--border` at 2.49:1.
 *
 * Thresholds are WCAG AA: 3:1 for large text (≥24px, or ≥18.66px bold),
 * 4.5:1 for everything else.
 */

const PROBE = () => {
  const srgb = (c) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  const lum = ([r, g, b]) => 0.2126 * srgb(r / 255) + 0.7152 * srgb(g / 255) + 0.0722 * srgb(b / 255);
  const parse = (s) => {
    const m = s.match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    const p = m[1].split(/[,\s/]+/).filter(Boolean).map(Number);
    return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
  };
  const over = (fg, bg) => ({
    r: fg.r * fg.a + bg.r * (1 - fg.a),
    g: fg.g * fg.a + bg.g * (1 - fg.a),
    b: fg.b * fg.a + bg.b * (1 - fg.a),
    a: 1,
  });
  const backdrop = (el) => {
    let acc = null;
    let node = el;
    while (node) {
      const c = parse(getComputedStyle(node).backgroundColor);
      if (c && c.a > 0) {
        acc = acc ? over(acc, c) : c;
        if (acc.a >= 0.999) return acc;
      }
      node = node.parentElement;
    }
    const base = { r: 255, g: 255, b: 255, a: 1 };
    return acc ? over(acc, base) : base;
  };
  const ratio = (a, b) => {
    const l1 = lum([a.r, a.g, a.b]);
    const l2 = lum([b.r, b.g, b.b]);
    return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
  };

  const findings = [];
  const seen = new Set();
  for (const el of document.querySelectorAll('body *')) {
    // Only elements that directly render text.
    const direct = Array.from(el.childNodes).some(
      (n) => n.nodeType === 3 && n.textContent.trim().length > 0,
    );
    if (!direct) continue;
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') continue;
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) continue;
    if (parseFloat(cs.opacity) < 0.6) continue;

    const fg = parse(cs.color);
    if (!fg) continue;
    const bg = backdrop(el);
    const eff = fg.a < 1 ? over(fg, bg) : fg;
    const cr = ratio(eff, bg);

    const px = parseFloat(cs.fontSize);
    const bold = parseInt(cs.fontWeight, 10) >= 700;
    const large = px >= 24 || (px >= 18.66 && bold);
    const need = large ? 3 : 4.5;
    if (cr < need) {
      const txt = (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 40);
      const key = cs.color + '|' + txt;
      if (seen.has(key)) continue;
      seen.add(key);
      findings.push({
        text: txt,
        tag: el.tagName.toLowerCase(),
        cls: (el.getAttribute('class') || '').slice(0, 40),
        color: cs.color,
        bg: `rgb(${Math.round(bg.r)}, ${Math.round(bg.g)}, ${Math.round(bg.b)})`,
        px: Math.round(px * 10) / 10,
        ratio: Math.round(cr * 100) / 100,
        need,
      });
    }
  }
  findings.sort((a, b) => a.ratio - b.ratio);
  return { url: location.pathname, theme: document.documentElement.dataset.theme, findings };
};

const PAGES = [
  ['home', '/'],
  ['study', '/study'],
  ['browse', '/browse'],
  ['settings', '/settings'],
  ['stats', '/stats'],
] as const;

async function register(page: import('@playwright/test').Page, u: string) {
  await page.goto('/register');
  await page.getByLabel('Имя пользователя').fill(u);
  await page.getByLabel(/^Отображаемое имя/).fill('Tester');
  await page.getByLabel('Пароль', { exact: true }).fill('contrast1234');
  await page.getByLabel('Подтвердите пароль').fill('contrast1234');
  await page.getByRole('button', { name: /Создать аккаунт/i }).click();
  await page.waitForTimeout(2000);
}

/**
 * Only /study is allowed to render no <h1> — the study screen has none and
 * that gap is recorded, not silently blessed here (DESIGN.md → "What this
 * file does not cover yet"). This guard deliberately asserts nothing about
 * headings: contrast is the invariant it owns, and mixing a known-failing
 * assertion in would only teach everyone to ignore red.
 */
test('contrast: every page clears WCAG AA text contrast, both themes', async ({ page }) => {
  test.setTimeout(280_000);
  await page.setViewportSize({ width: 1280, height: 1000 });
  await register(page, 'contrast_' + Date.now());

  const all: { page: string; theme: string; url: string; findings: any[] }[] = [];

  for (const scheme of ['light', 'dark'] as const) {
    await page.goto('/');
    await page.evaluate((s) => window.localStorage.setItem('aq:theme', JSON.stringify(s)), scheme);

    for (const [name, route] of PAGES) {
      await page.goto(route, { waitUntil: 'networkidle' });
      await page.waitForTimeout(700);
      // The onboarding tour is per-screen and modal; it would cover the
      // very elements under test.
      for (let i = 0; i < 4; i++) {
        const ok = page.getByRole('button', { name: /^понятно$/i });
        if (!(await ok.count())) break;
        await ok.first().click({ force: true }).catch(() => {});
        await page.waitForTimeout(250);
      }
      await page.waitForTimeout(500);

      const applied = await page.evaluate(() => document.documentElement.dataset.theme);
      // Never report a reading taken under the wrong palette.
      expect(applied, `${name}: theme did not apply`).toBe(scheme);

      all.push({ page: name, theme: scheme, ...(await page.evaluate(PROBE)) });
    }
  }

  const failing = all.filter((d) => d.findings.length > 0);

  if (failing.length > 0) {
    // Full detail to a file: the assert message below is a summary, and a
    // contributor chasing a 2.49:1 needs the selector and both colours.
    writeFileSync('/tmp/contrast-failures.json', JSON.stringify(failing, null, 1));
    const detail = failing
      .map(
        (d) =>
          `  ${d.theme}/${d.page}:\n` +
          d.findings
            .map(
              (f) =>
                `    ${f.ratio}:1 (needs ${f.need}) ${f.px}px ${f.tag}.${f.cls} "${f.text}" — ${f.color} on ${f.bg}`,
            )
            .join('\n'),
      )
      .join('\n');
    throw new Error(
      `${failing.length} of ${all.length} page×theme readings fail WCAG AA text contrast.\n${detail}\n` +
        `Full report: /tmp/contrast-failures.json`,
    );
  }

  console.log(
    `contrast: ${all.length} page×theme readings clean (${all.map((d) => `${d.theme}/${d.page}`).join(', ')})`,
  );
});
