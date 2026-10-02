import { test, expect, type Page } from '@playwright/test';
import { closeOnboardingIfOpen } from './helpers';

/**
 * Pronunciation audio — format and loading.
 *
 * Two things are guarded here, and both were broken silently at least
 * once before this file existed.
 *
 * 1. THE CLIPS ARE FLAC. They used to ship as uncompressed WAV. The
 *    conversion is lossless, so a regression cannot be detected by
 *    listening for a quality drop — it has to be detected by asking
 *    the browser to decode the bytes and confirm real samples came
 *    back. A 200 with `Content-Type: audio/flac` is NOT that proof: a
 *    wrong extension or a truncated file also returns 200. So this
 *    decodes through an AudioContext and measures the signal.
 *
 * 2. THE MANIFEST IS LAZY. It used to be prefetched for both
 *    languages on every route, including routes that render no speak
 *    button at all. The loading is now owned by the individual
 *    TtsButton, which renders nothing until its own language's
 *    manifest has arrived. If the manifest fetch regresses, the
 *    button silently never appears — no error, no console message,
 *    just a card the learner cannot hear. That is the failure this
 *    file is for.
 */

function uname(): string {
  return `audio_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
}

async function register(page: Page, username: string, password = 'correcthorse') {
  await page.goto('/register');
  await page.getByLabel('Имя пользователя').fill(username);
  await page.getByLabel(/^Отображаемое имя/).fill('Audio Tester');
  await page.getByLabel('Пароль', { exact: true }).fill(password);
  await page.getByLabel('Подтвердите пароль').fill(password);
  await page.getByRole('button', { name: /Создать аккаунт/i }).click();
  await expect(page).toHaveURL(/\/$/);
  await closeOnboardingIfOpen(page);
}

/** A hash that is present in the shipped kk manifest. */
const KK_HASH = '001568b8cbb05553';

test.describe('Pronunciation audio', () => {
  test('the shipped clip decodes to real samples, not silence', async ({ page }) => {
    await page.goto('/');

    const result = await page.evaluate(async (hash) => {
      const url = `/audio/kk/${hash}.flac`;
      const res = await fetch(url);
      if (!res.ok) return { error: `HTTP ${res.status} for ${url}` };

      const contentType = res.headers.get('content-type') ?? '';
      const bytes = await res.arrayBuffer();

      // The container check. This one is NOT optional and NOT
      // redundant with the decode below: Chromium sniffs content, so a
      // WAV served as audio/flac from a .flac path decodes and plays
      // without a single complaint. A decode-only test passes happily
      // against the exact regression it was written to catch — it was
      // verified by injecting WAV bytes at a .flac path and watching
      // all four tests stay green. The magic number is what actually
      // distinguishes a FLAC from a WAV.
      const magic = new TextDecoder('latin1').decode(bytes.slice(0, 4));

      // Then the part that matters: does it carry real signal?
      let decoded;
      try {
        const ac = new OfflineAudioContext(1, 22050, 22050);
        decoded = await ac.decodeAudioData(bytes.slice(0));
      } catch (e) {
        return { error: `decodeAudioData failed: ${(e as Error).message}`, contentType, magic };
      }

      const ch = decoded.getChannelData(0);
      let peak = 0;
      let energy = 0;
      let nonZero = 0;
      for (let i = 0; i < ch.length; i++) {
        const a = Math.abs(ch[i]);
        if (a > peak) peak = a;
        if (a > 1e-4) nonZero++;
        energy += ch[i] * ch[i];
      }
      return {
        contentType,
        magic,
        bytes: bytes.byteLength,
        sampleRate: decoded.sampleRate,
        channels: decoded.numberOfChannels,
        duration: decoded.duration,
        peak,
        rms: Math.sqrt(energy / ch.length),
        nonZeroRatio: nonZero / ch.length,
      };
    }, KK_HASH);

    expect(result.error).toBeUndefined();
    expect(result.contentType).toBe('audio/flac');
    expect(result.magic).toBe('fLaC');

    // Piper emits 22.05 kHz mono. If the sample rate or channel count
    // moves, the conversion did something it should not have.
    expect(result.sampleRate).toBe(22050);
    expect(result.channels).toBe(1);
    expect(result.duration).toBeGreaterThan(0.2);

    // The signal checks. A file full of silence decodes without error
    // and would pass every assertion above this line.
    expect(result.peak).toBeGreaterThan(0.5);
    expect(result.rms).toBeGreaterThan(0.02);
    expect(result.nonZeroRatio).toBeGreaterThan(0.5);
  });

  test('an <audio> element loads the clip without error', async ({ page }) => {
    await page.goto('/');
    const outcome = await page.evaluate(
      (hash) =>
        new Promise<string>((resolve) => {
          const a = new Audio(`/audio/kk/${hash}.flac`);
          const timer = setTimeout(() => resolve('TIMEOUT'), 8000);
          a.addEventListener('canplaythrough', () => {
            clearTimeout(timer);
            a.currentTime = 0;
            a.play()
              .then(() => setTimeout(() => resolve(`PLAYING duration=${a.duration.toFixed(3)}`), 350))
              .catch((e) => resolve(`PLAY_REJECTED ${e.message}`));
          });
          a.addEventListener('error', () => {
            clearTimeout(timer);
            resolve(`ERROR ${a.error ? `${a.error.code}: ${a.error.message}` : 'unknown'}`);
          });
        }),
      KK_HASH,
    );
    expect(outcome).toMatch(/^PLAYING duration=/);
  });

  test('the home page fetches no audio manifest at all', async ({ page }) => {
    // The home page shows a static teaser card with no speak button, so
    // it has no use for either manifest. It used to fetch both anyway.
    const manifests: string[] = [];
    page.on('request', (r) => {
      if (/\/audio\/(kk|ru)\/manifest\.json/.test(r.url())) {
        manifests.push(r.url().split('/audio/')[1] ?? r.url());
      }
    });

    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1200);

    expect(manifests).toEqual([]);
  });

  test('the study screen shows a speak button once its manifest arrives', async ({ page }) => {
    await register(page, uname());

    const manifests: string[] = [];
    page.on('request', (r) => {
      if (/\/audio\/(kk|ru)\/manifest\.json/.test(r.url())) {
        manifests.push(r.url().split('/audio/')[1] ?? r.url());
      }
    });

    await page.goto('/study');
    // The button renders nothing until its own language's manifest
    // resolves, so this waits for the lazy fetch rather than assuming
    // it. A regression here shows up as a timeout, not a flake.
    const speakButton = page.locator('button[class*="speakBtn"]').first();
    await expect(speakButton).toBeVisible({ timeout: 15000 });

    // The study card carries both directions, so both languages load —
    // but they are loaded because this screen needs them, not because
    // something prefetched them on app start.
    expect(manifests.length).toBeGreaterThan(0);

    // And the button must be a real target, not a zero-size sliver.
    const box = await speakButton.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBeGreaterThan(0);
    expect(box!.height).toBeGreaterThan(0);
  });
});
