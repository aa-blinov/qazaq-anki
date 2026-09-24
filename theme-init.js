/*!
 * theme-init.js — set the theme AND font-size on <html> BEFORE the
 * first paint.
 *
 * Without this, the page renders once with the default light theme
 * (the CSS variables in :root are light) and then flickers to dark
 * once React mounts and ThemeContext applies the saved preference.
 * Same for the user's chosen interface text scale.
 *
 * This script runs synchronously in <head>, before the browser
 * styles the body, so the first paint is already in the right theme
 * at the right size.
 *
 * The storage shape mirrors `writeJSON` in src/lib/storage.ts:
 *   localStorage["aq:theme"]    = '"light"' | '"dark"'
 *   localStorage["aq:fontSize"]  = '"sm"' | '"md"' | '"lg"' | '"xl"'
 * (a JSON string with quotes, so we JSON.parse it back).
 *
 * If the user hasn't set an explicit value, we fall back to the
 * system preference for theme, and to the default (1.0×) for
 * font-size — same as `getInitial` in the React contexts.
 */
(function () {
  try {
    // Theme.
    var rawTheme = window.localStorage.getItem('aq:theme');
    var theme = null;
    if (rawTheme) {
      var parsedTheme = JSON.parse(rawTheme);
      if (parsedTheme === 'light' || parsedTheme === 'dark') theme = parsedTheme;
    }
    if (theme === null) {
      theme =
        window.matchMedia &&
        window.matchMedia('(prefers-color-scheme: dark)').matches
          ? 'dark'
          : 'light';
    }
    document.documentElement.dataset.theme = theme;

    // Font size. Mirrors the scale map in FontSizeContext.
    var rawSize = window.localStorage.getItem('aq:fontSize');
    var size = null;
    if (rawSize) {
      var parsedSize = JSON.parse(rawSize);
      if (parsedSize === 'sm' || parsedSize === 'md' || parsedSize === 'lg' || parsedSize === 'xl') {
        size = parsedSize;
      }
    }
    if (size !== null) {
      var scale = { sm: 0.875, md: 1, lg: 1.125, xl: 1.25 }[size];
      document.documentElement.style.setProperty('--font-scale', String(scale));
    }
  } catch (e) {
    // localStorage may be disabled (private mode, quota, etc.).
    // Fall back silently — React will pick up the same preferences
    // and the page will just render in the default light theme at
    // 1.0× font scale on first paint.
  }
})();
