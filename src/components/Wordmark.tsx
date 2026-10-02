import styles from './Wordmark.module.css';

interface WordmarkProps {
  /** Size *role*, not pixels. Pass a name from the type ramp; the size is
   *  then a rem value that tracks the reader's text-size setting, which
   *  a px number here could never do. */
  size?: 'sm' | 'md';
}

/**
 * Plain-text wordmark — replaces the old BrandLockup (icon + "Qazaq"
 * wordmark) with a single typographic mark. The new product name
 * "Söz" (Kazakh for "word") reads as the brand on its own, so the
 * icon-tile + duplicated wordmark pair stopped making sense.
 *
 * Type:
 *  - `var(--font-display)` — Source Serif 4. (This comment used to name
 *    Fredoka and describe it as round and friendly; Fredoka is not in
 *    this project and never was, and the `padding-top` below was tuned
 *    to *its* cap-height rather than to the face actually rendering.
 *    Both are corrected here.)
 *  - `font-weight: 500` — the same weight the card word and every
 *    section heading uses, so the wordmark reads as part of the
 *    typographic system rather than a brand "logo" floating outside it.
 *  - Optical sizing is on globally (`font-optical-sizing: auto` in
 *    global.css), so this renders at the display cut of the face rather
 *    than its text cut.
 *
 * Use this everywhere the old BrandLockup was used (topbar, auth
 * panels). The PWA install icon (`favicon.png`) is a separate concern and
 * stays untouched — it's not the in-app brand mark, it's the OS-level
 * icon.
 */
export function Wordmark({ size = 'md' }: WordmarkProps) {
  return (
    <span
      className={size === 'sm' ? styles.sm : styles.md}
      // aria-label so screen-readers announce the name rather than
      // the literal letters "Söz" spelled out.
      aria-label="Söz"
    >
      Söz
    </span>
  );
}
