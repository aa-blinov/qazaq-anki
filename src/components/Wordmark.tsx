interface WordmarkProps {
  /** Render height in CSS pixels. Width derives from the letter
   *  width ratio of the chosen font (Fredoka) — at this size the
   *  glyph is roughly square-ish in cap-height; we set the box
   *  width so the lockup slots into the same horizontal space the
   *  old BrandLockup used. */
  size?: number;
}

/**
 * Plain-text wordmark — replaces the old BrandLockup (icon + "Qazaq"
 * wordmark) with a single typographic mark. The new product name
 * "Söz" (Kazakh for "word") reads as the brand on its own, so the
 * icon-tile + duplicated wordmark pair stopped making sense.
 *
 * Font choice:
 *  - Fredoka (already loaded globally as `--font-display`) — round,
 *    friendly, fits the warm palette, supports Kazakh diacritics.
 *  - `font-weight: 500` — same as h1 titles, so the wordmark reads
 *    as a continuation of the typographic system rather than a brand
 *    "logo" floating outside it.
 *  - Slight negative letter-spacing so the three glyphs feel like
 *    one word, not three loose letters.
 *
 * Use this everywhere the old BrandLockup was used (topbar,
 * auth panels). The PWA install icon (`favicon.png`) is a separate
 * concern and stays untouched — it's not the in-app brand mark,
 * it's the OS-level icon.
 */
export function Wordmark({ size = 30 }: WordmarkProps) {
  return (
    <span
      style={{
        display: 'inline-block',
        fontFamily: 'var(--font-display, system)',
        fontWeight: 500,
        fontSize: `${Math.round(size * 0.95)}px`,
        lineHeight: 1,
        letterSpacing: '-0.02em',
        color: 'var(--text-strong, inherit)',
        // Fredoka's cap-height is a touch shorter than the fontSize
        // suggests — `padding-top` of 0.05em lifts the visible glyph
        // into the baseline the rest of the topbar expects.
        paddingTop: '0.05em',
      }}
      // aria-label so screen-readers announce the name rather than
      // the literal letters "Söz" spelled out.
      aria-label="Söz"
    >
      Söz
    </span>
  );
}