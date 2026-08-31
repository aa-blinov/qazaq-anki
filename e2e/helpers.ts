import type { Page } from '@playwright/test';

/**
 * Close the onboarding tour if it's open on the current page.
 *
 * The tour shows a single "Понятно" button; clicking it marks the
 * current screen as seen. Idempotent — safe to call before every
 * test even when no tour is present.
 *
 * The OnboardingModal mounts in a useEffect, so the dialog can
 * appear several hundred ms after a navigation. We wait for the
 * dialog to be visible (or for a short window to pass with no
 * dialog) and then click the dismiss button. After the click we
 * wait for the dialog to actually unmount so the next test step
 * doesn't get blocked by a still-mounted modal.
 */
export async function closeOnboardingIfOpen(page: Page): Promise<void> {
  // First, give the modal time to render if it's going to.
  const dlg = page.getByRole('dialog');
  let attempts = 0;
  while (attempts < 10) {
    if (await dlg.count()) break;
    await page.waitForTimeout(200);
    attempts += 1;
  }
  // Now click "Понятно" until the dialog is gone, or give up after
  // a few attempts. The button label is Russian "Понятно" = "Got it".
  for (let i = 0; i < 5; i++) {
    const ok = page.getByRole('button', { name: /^понятно$/i });
    if (!(await ok.count())) break;
    await ok.first().click({ timeout: 5_000, force: true });
    // Wait for the dialog to actually leave the DOM.
    await page
      .getByRole('dialog')
      .waitFor({ state: 'detached', timeout: 3_000 })
      .catch(() => {/* may already be gone */});
    await page.waitForTimeout(200);
  }
}


