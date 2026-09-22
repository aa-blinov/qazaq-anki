/**
 * One-shot UI screenshot capture for docs/screenshots/.
 *
 * Boots nothing — expects:
 *   - API on http://127.0.0.1:3099 (DB_PATH=data/capture.sqlite)
 *   - Vite preview on http://127.0.0.1:4173 (with /api/* proxied via the script)
 *
 * Captures all the screens a README needs:
 *   - Anonymous: landing, register, login, 404
 *   - Empty account: home dashboard (calls-to-action)
 *   - Seeded account: home, study front/back, browse, stats overview,
 *     stats topics tab, settings
 *   - Mobile (390×844): landing, home, study, stats
 *   - Dark mode: landing, home, study, stats
 *
 * Run: `node scripts/capture-ui.mjs` from the repo root.
 */
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

const WEB = 'http://127.0.0.1:4173';
const API = 'http://127.0.0.1:3099';
const BASE = path.join(process.cwd(), 'docs', 'screenshots');

const exe = `${process.env.HOME}/Library/Caches/ms-playwright/chromium-1243/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`;

const seedCards = (level, count) => {
  const out = [];
  for (let i = 1; i <= count; i++) out.push(`${level}-${String(i).padStart(4, '0')}`);
  return out;
};

async function seedAccount(token, dist) {
  // Spread reviews across the last 14 days so velocity > 1.
  const levels = { a1: 30, a2: 20, b1: 15, b2: 10, c1: 8 };
  const allCards = [];
  for (const [lvl, count] of Object.entries(levels)) {
    for (const id of seedCards(lvl, count)) allCards.push({ id, level: lvl });
  }
  const auth = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  for (let i = 0; i < allCards.length; i++) {
    const { id, level } = allCards[i];
    const dayOffset = (i % 14) * 86_400_000;
    const ts = new Date(Date.now() - dayOffset).toISOString();
    let grade, phase, interval, ease;
    if (i % 11 === 0) { grade = 'again'; phase = 'learning'; interval = 0; ease = 2.5; }
    else if (i % 7 === 0) { grade = 'hard'; phase = 'review'; interval = 1; ease = 1.8; }
    else if (i % 5 === 0) { grade = 'easy'; phase = 'review'; interval = 7; ease = 2.8; }
    else { grade = 'good'; phase = 'review'; interval = 4 + (i % 3); ease = 2.5; }

    await fetch(`${API}/api/review`, {
      method: 'POST', headers: auth,
      body: JSON.stringify({ cardId: id, direction: 'kk-ru', grade, ts }),
    });
    const due = new Date(Date.now() - dayOffset + interval * 86_400_000).toISOString();
    await fetch(`${API}/api/progress/${id}`, {
      method: 'PUT', headers: auth,
      body: JSON.stringify({
        state: {
          phase, ease, interval, due,
          lastReview: ts, reviews: 1,
          correct: grade === 'again' ? 0 : 1,
          lapses: grade === 'again' ? 1 : 0,
          learningStep: 0, reps: 1,
        },
      }),
    });
  }
}

async function emptyAccount(token) {
  // New account gets a clean DB. No reviews, no progress — exercises
  // the "empty state" copy (welcome card, "Начать учить A1", etc.)
  // No API calls needed beyond registration.
  void token;
}

async function snap(page, route, file, opts = {}) {
  await page.goto(`${WEB}${route}`, { waitUntil: 'networkidle' });
  // Dismiss any onboarding modal that pops up so the underlying UI
  // is what the screenshot captures.
  const ok = page.getByRole('button', { name: /^понятно$/i });
  if (await ok.count()) {
    await ok.first().click({ force: true });
    await page.waitForTimeout(300);
  }
  await page.waitForTimeout(opts.settle ?? 600);
  const out = path.join(BASE, opts.dir ?? 'desktop', file);
  await page.screenshot({ path: out, fullPage: true });
  console.log(`  → ${path.relative(process.cwd(), out)}`);
}

async function registerAndSeed(name, withProgress) {
  const reg = await fetch(`${API}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: name, password: 'capture-pass-1' }),
  });
  if (!reg.ok) throw new Error(`register ${name} failed ${reg.status}`);
  const { token } = await reg.json();
  if (withProgress) await seedAccount(token, 0);
  else await emptyAccount(token);
  return token;
}

async function withFreshAccount(browser, withProgress, run) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.route('**/api/**', async (route) => {
    const url = route.request().url().replace(WEB, API);
    const init = {
      method: route.request().method(),
      headers: route.request().headers(),
      data: route.request().postData(),
    };
    const res = await fetch(url, init);
    const body = await res.text();
    await route.fulfill({ status: res.status, headers: res.headers, body });
  });

  const name = `cap${Date.now().toString(36).slice(-5)}`;
  const token = await registerAndSeed(name, withProgress);
  await page.addInitScript((tok) => {
    window.localStorage.setItem('aq:token', tok);
  }, token);
  await run(page);
  await ctx.close();
}

async function main() {
  mkdirSync(path.join(BASE, 'desktop'), { recursive: true });
  mkdirSync(path.join(BASE, 'mobile'), { recursive: true });
  mkdirSync(path.join(BASE, 'dark'), { recursive: true });

  const browser = await chromium.launch({
    headless: true, executablePath: exe, args: ['--no-sandbox'],
  });

  // ---------------- Anonymous (light, desktop) ----------------
  console.log('[anon] desktop');
  {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await page.setViewportSize({ width: 1280, height: 800 });
    await snap(page, '/anki-qazaq/', '01-landing.png');
    await snap(page, '/anki-qazaq/register', '02-register.png');
    await snap(page, '/anki-qazaq/login', '03-login.png');
    await snap(page, '/anki-qazaq/this-does-not-exist', '04-not-found.png');
    await ctx.close();
  }

  // ---------------- Empty account (light, desktop) ----------------
  console.log('[empty] desktop');
  await withFreshAccount(browser, false, async (page) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await snap(page, '/anki-qazaq/', '05-home-empty.png');
  });

  // ---------------- Seeded account (light, desktop) ----------------
  console.log('[seeded] desktop');
  await withFreshAccount(browser, true, async (page) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await snap(page, '/anki-qazaq/', '06-home-dashboard.png');
    await snap(page, '/anki-qazaq/study/level/a1', '07-study-front.png');
    // Flip the card for the "back" view.
    await page.keyboard.press('Space').catch(() => {});
    await page.waitForTimeout(400);
    await page.screenshot({
      path: path.join(BASE, 'desktop', '08-study-back.png'),
      fullPage: true,
    });
    console.log('  → docs/screenshots/desktop/08-study-back.png');
    await snap(page, '/anki-qazaq/browse', '09-browse.png');
    await snap(page, '/anki-qazaq/stats', '10-stats-overview.png');
    // Click the Темы tab to capture topics view.
    await page.getByRole('tab', { name: /Темы/ }).click().catch(() => {});
    await page.waitForTimeout(400);
    await page.screenshot({
      path: path.join(BASE, 'desktop', '11-stats-topics.png'),
      fullPage: true,
    });
    console.log('  → docs/screenshots/desktop/11-stats-topics.png');
    await snap(page, '/anki-qazaq/settings', '12-settings.png');
  });

  // ---------------- Mobile (light) ----------------
  console.log('[seeded] mobile');
  await withFreshAccount(browser, true, async (page) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const opts = { dir: 'mobile' };
    await snap(page, '/anki-qazaq/', '01-landing.png', opts);
    await snap(page, '/anki-qazaq/study/level/a1', '02-study.png', opts);
    await snap(page, '/anki-qazaq/stats', '03-stats.png', opts);
    await snap(page, '/anki-qazaq/browse', '04-browse.png', opts);
    await snap(page, '/anki-qazaq/settings', '05-settings.png', opts);
  });

  // ---------------- Dark mode (seeded, desktop) ----------------
  console.log('[seeded] dark');
  await withFreshAccount(browser, true, async (page) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.addInitScript(() => {
      document.documentElement.setAttribute('data-theme', 'dark');
    });
    const opts = { dir: 'dark' };
    // Re-apply dark theme after each navigation — some routes
    // reset the data-theme attribute to default.
    const reapply = () => page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
    await snap(page, '/anki-qazaq/', '01-home-dark.png', opts);
    await reapply();
    await snap(page, '/anki-qazaq/study/level/a1', '02-study-dark.png', opts);
    await reapply();
    await snap(page, '/anki-qazaq/stats', '03-stats-dark.png', opts);
    await reapply();
    await snap(page, '/anki-qazaq/browse', '04-browse-dark.png', opts);
  });

  await browser.close();
  console.log('done');
}

main().catch((e) => { console.error(e); process.exit(1); });