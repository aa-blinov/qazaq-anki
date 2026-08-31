/**
 * Minimal i18n. Two languages: English (default) and Russian.
 *
 * Strings live in `en.ts` and `ru.ts` as flat key/value objects. The
 * `useT()` hook returns a translation function that takes a key (with
 * optional `{var}` interpolation) and returns the localized string.
 *
 * The active language is stored in localStorage so it survives reloads.
 * Translations are loaded synchronously at module init so the hook
 * is safe to call in any component without Suspense.
 */

export type Lang = 'en' | 'ru';

export const SUPPORTED_LANGS: ReadonlyArray<Lang> = ['en', 'ru'];

export const LANG_LABELS: Record<Lang, string> = {
  en: 'EN',
  ru: 'RU',
};

export type Translations = Record<string, string>;
