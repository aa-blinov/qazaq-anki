/**
 * Is this key event aimed at something the user can activate?
 *
 * The study screen binds Space and Enter globally to flip the flashcard,
 * which is a real ergonomic win — you can hold a session without touching
 * the mouse. The guard in front of it, though, only excluded `INPUT` and
 * `TEXTAREA`, so every other focusable thing on the page lost those two
 * keys: the rating buttons, the header's sign-out, the burger, the
 * direction and topic pickers, the level pills. Tab to "Сбросить прогресс"
 * on the stats page is fine; tab to any button on the *study* page and
 * press Enter and the card flips instead of the button doing its job.
 *
 * That is WCAG 2.1.1 (Keyboard), and it is worse than a lost shortcut —
 * the control looks focusable and is, and pressing its key does something
 * else entirely.
 *
 * So: bail out for anything interactive, and let the shortcut fire only
 * when the focus is on the card, the page, or nothing at all — which is
 * exactly the case the shortcut was written for.
 */
const INTERACTIVE = [
  'a[href]',
  'button',
  'input',
  'select',
  'textarea',
  'summary',
  'label',
  '[contenteditable]:not([contenteditable="false"])',
  '[role="button"]',
  '[role="option"]',
  '[role="tab"]',
  '[role="menuitem"]',
  '[role="switch"]',
  '[role="checkbox"]',
  '[role="radio"]',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

export function isInteractiveTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  // `closest` rather than a tag check: the real offenders are nested —
  // an <svg> or a <span> inside a <button> is what the event actually
  // targets, and a tagName check on it says "not a button".
  return target.closest(INTERACTIVE) !== null;
}
