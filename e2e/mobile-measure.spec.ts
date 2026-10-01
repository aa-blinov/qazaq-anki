import { test, expect } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Mobile measurement pass — read-only.
 *
 * Answers three questions with real layout numbers instead of estimates:
 *   1. Which interactive controls are under the 44px touch minimum?
 *   2. How tall is each band of the study column, and where does the
 *      "Показать ответ" button land relative to the fold?
 *   3. Does anything overflow horizontally at the narrowest widths?
 *
 * Writes a JSON blob to /tmp/mobile-shots/measure.json and screenshots
 * each viewport so the numbers can be checked against the pixels.
 */

const OUT = '/tmp/mobile-shots';
mkdirSync(OUT, { recursive: true });

test.use({ hasTouch: true, isMobile: true });

const VIEWPORTS = [
  { name: '320x568', w: 320, h: 568 },
  { name: '360x640', w: 360, h: 640 },
  { name: '390x844', w: 390, h: 844 },
  { name: '430x932', w: 430, h: 932 },
  { name: '844x390-landscape', w: 844, h: 390 },
];

const PAGES = [
  { name: 'home', path: '/' },
  { name: 'study', path: '/study' },
  { name: 'browse', path: '/browse' },
  { name: 'settings', path: '/settings' },
  { name: 'stats', path: '/stats' },
];

async function register(page: import('@playwright/test').Page, username: string) {
  await page.goto('/register');
  await page.getByLabel('Имя пользователя').fill(username);
  await page.getByLabel(/^Отображаемое имя/).fill('Tester');
  await page.getByLabel('Пароль', { exact: true }).fill('audit1234');
  await page.getByLabel('Подтвердите пароль').fill('audit1234');
  await page.getByRole('button', { name: /Создать аккаунт/i }).click();
  await expect(page).toHaveURL(/\/$/);
}

async function dismissDialogs(page: import('@playwright/test').Page) {
  for (let i = 0; i < 4; i++) {
    const ok = page.getByRole('button', { name: /^понятно$/i });
    if (!(await ok.count())) break;
    await ok.first().click({ force: true }).catch(() => {});
    await page.waitForTimeout(250);
  }
  await page.getByRole('button', { name: /закрыть/i }).first().click({ force: true }).catch(() => {});
  await page.waitForTimeout(200);
}

/** Every visible interactive control, with its EFFECTIVE tap box.
    A control may meet the 44px floor either by being that tall or by
    growing a positioned ::after hit area, so the audit has to union
    the two — measuring only getBoundingClientRect() would report
    every hit-expanded control as a failure. */
const TAP_AUDIT = () => {
  const sel = [
    'button', 'a[href]', 'input:not([type=hidden])', 'select', 'textarea',
    '[role="button"]', '[role="tab"]', '[role="option"]', '[role="switch"]',
    'label[for]', 'summary',
  ].join(',');
  const out: any[] = [];
  for (const el of Array.from(document.querySelectorAll(sel))) {
    const cs = getComputedStyle(el as Element);
    if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') continue;
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    if ((el as HTMLElement).tagName === 'INPUT' && (el as HTMLInputElement).type === 'file') continue;

    let top = r.top, bottom = r.bottom, left = r.left, right = r.right;
    let hitArea = false;
    // Union in a positioned ::after / ::before — that is the element
    // that actually receives the tap.
    for (const pseudo of ['::after', '::before'] as const) {
      const ps = getComputedStyle(el as Element, pseudo);
      if (ps.content === 'none' || ps.position === 'static') continue;
      const pw = parseFloat(ps.width);
      const ph = parseFloat(ps.height);
      if (!Number.isFinite(pw) || !Number.isFinite(ph)) continue;
      if (pw < 40 || ph < 40) continue;
      // The shared pattern is a 44px box centred on the control.
      const cy = r.top + r.height / 2;
      top = Math.min(top, cy - ph / 2);
      bottom = Math.max(bottom, cy + ph / 2);
      left = Math.min(left, r.left + r.width / 2 - pw / 2);
      right = Math.max(right, r.left + r.width / 2 + pw / 2);
      hitArea = true;
    }

    out.push({
      tag: el.tagName.toLowerCase(),
      cls: (el.getAttribute('class') || '').slice(0, 60),
      text: ((el as HTMLElement).innerText || el.getAttribute('aria-label') || '').trim().slice(0, 28),
      w: Math.round((right - left) * 10) / 10,
      h: Math.round((bottom - top) * 10) / 10,
      hitArea,
      // An <a> sitting inside running text is exempt from the target
      // size requirement (WCAG 2.5.8, "inline" exception).
      inline: (el.tagName === 'A' || el.tagName === 'LABEL') &&
        el.closest('p, li, td, .doneSub, .hint, figcaption') !== null,
    });
  }
  return out;
};

/** Vertical budget of the study column, band by band. */
const STUDY_BUDGET = () => {
  const col = document.querySelector('[class*="studyColumn"]') as HTMLElement | null;
  if (!col) return { error: 'no studyColumn' };
  const bands: any[] = [];
  let prevBottom = 0;
  for (const child of Array.from(col.children) as HTMLElement[]) {
    const r = child.getBoundingClientRect();
    bands.push({
      cls: (child.getAttribute('class') || '').slice(0, 44),
      top: Math.round(r.top),
      h: Math.round(r.height),
      bottom: Math.round(r.bottom),
      gapAbove: Math.round(r.top - prevBottom),
    });
    prevBottom = r.bottom;
  }
  // The card scene and the reveal CTA live inside .cardWrap.
  const scene = document.querySelector('[class*="scene"]') as HTMLElement | null;
  const cta = Array.from(document.querySelectorAll('button')).find((b) =>
    /показать ответ/i.test(b.textContent || ''),
  ) as HTMLElement | null;
  const vh = window.innerHeight;
  return {
    bands,
    colHeight: Math.round(col.getBoundingClientRect().height),
    viewportH: vh,
    scene: scene ? Math.round(scene.getBoundingClientRect().height) : null,
    cta: cta
      ? {
          top: Math.round(cta.getBoundingClientRect().top),
          bottom: Math.round(cta.getBoundingClientRect().bottom),
          h: Math.round(cta.getBoundingClientRect().height),
          aboveFold: cta.getBoundingClientRect().bottom <= vh,
          overflowPx: Math.round(cta.getBoundingClientRect().bottom - vh),
        }
      : null,
  };
};

const OVERFLOW = () => {
  const de = document.documentElement;
  const wide: any[] = [];
  const vw = de.clientWidth;
  for (const el of Array.from(document.body.querySelectorAll('*')) as HTMLElement[]) {
    const r = el.getBoundingClientRect();
    if (r.width === 0) continue;
    if (r.right > vw + 1 || r.left < -1) {
      wide.push({
        cls: (el.getAttribute('class') || el.tagName).slice(0, 50),
        left: Math.round(r.left),
        right: Math.round(r.right),
      });
    }
  }
  return { scrollW: de.scrollWidth, clientW: de.clientWidth, offenders: wide.slice(0, 8) };
};

test('mobile: touch targets, study vertical budget, overflow', async ({ page }) => {
  // 25 viewport×page combinations, each a cold route load.
  test.setTimeout(300_000);

  // Touch emulation, not just a narrow window: the --tap-min rules and
  // the compact study layout are both behind `(pointer: coarse)`, so a
  // mouse-driven run would report the desktop layout and "pass" by
  // measuring the wrong thing.
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  const report: any = { when: new Date().toISOString(), results: [] };

  await page.setViewportSize({ width: 390, height: 844 });
  await register(page, 'mob_' + Date.now());

  // Prove the media query actually fires before trusting any number.
  const mq = await page.evaluate(() => ({
    coarse: window.matchMedia('(pointer: coarse)').matches,
    fine: window.matchMedia('(pointer: fine)').matches,
    compact: window.matchMedia('(max-width: 768px), (pointer: coarse)').matches,
  }));
  console.log('MEDIA QUERY CHECK: ' + JSON.stringify(mq));
  if (!mq.coarse) {
    console.log('WARNING: pointer:coarse did NOT match — touch rules are not under test');
  }

  for (const vp of VIEWPORTS) {
    for (const p of PAGES) {
      await page.setViewportSize({ width: vp.w, height: vp.h });
      await page.goto(p.path);
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(500);
      await dismissDialogs(page);
      await page.waitForTimeout(400);

      const taps = await page.evaluate(TAP_AUDIT);
      const small = taps
        .filter((t) => (t.h < 44 || t.w < 44) && !t.inline)
        .sort((a, b) => a.h - b.h);
      const exempt = taps.filter((t) => (t.h < 44 || t.w < 44) && t.inline);
      const entry: any = {
        viewport: vp.name,
        page: p.name,
        url: page.url(),
        small,
        exempt,
        overflow: await page.evaluate(OVERFLOW),
        budget: p.name === 'study' ? await page.evaluate(STUDY_BUDGET) : null,
      };
      report.results.push(entry);

      await page.screenshot({
        path: join(OUT, `${p.name}-${vp.name}.png`),
        fullPage: false,
      });
    }
  }

  writeFileSync(join(OUT, 'measure.json'), JSON.stringify(report, null, 2));

  // Console digest so the numbers are visible without opening the file.
  const lines: string[] = [];
  for (const r of report.results) {
    const bad = r.small.length;
    const ovf = r.overflow.scrollW > r.overflow.clientW;
    lines.push(
      `${r.viewport.padEnd(17)} ${r.page.padEnd(9)} small=${String(bad).padStart(2)} overflow=${ovf ? 'YES ' + r.overflow.scrollW + '>' + r.overflow.clientW : 'no'}`,
    );
  }
  console.log('\n=== MOBILE MEASURE ===\n' + lines.join('\n'));
  console.log('\n=== SMALL TARGETS (excluding WCAG 2.5.8 inline exception) ===');
  const seen = new Set<string>();
  for (const r of report.results) {
    for (const s of r.small) {
      const key = `${s.cls}|${s.h}`;
      if (seen.has(key)) continue;
      seen.add(key);
      console.log(`  ${s.h}px h / ${s.w}px w  ${s.tag}.${s.cls}  "${s.text}"`);
    }
  }
  console.log('\n=== EXEMPT (inline in text) ===');
  const seenEx = new Set<string>();
  for (const r of report.results) {
    for (const s of r.exempt) {
      const key = `${s.cls}|${s.h}`;
      if (seenEx.has(key)) continue;
      seenEx.add(key);
      console.log(`  ${s.h}px  ${s.tag}.${s.cls}  "${s.text}"`);
    }
  }
  console.log('\n=== STUDY BUDGET ===');
  for (const r of report.results) {
    if (!r.budget || r.budget.error) continue;
    const b = r.budget;
    console.log(`\n-- ${r.viewport} (viewport ${b.viewportH}px, col ${b.colHeight}px) --`);
    for (const band of b.bands) {
      console.log(`   gap ${String(band.gapAbove).padStart(4)} | h ${String(band.h).padStart(4)} | ${band.cls}`);
    }
    if (b.cta) {
      console.log(
        `   CTA: top ${b.cta.top} bottom ${b.cta.bottom} h ${b.cta.h} → ${b.cta.aboveFold ? 'ABOVE FOLD' : 'BELOW FOLD by ' + b.cta.overflowPx + 'px'}`,
      );
    }
  }
});
