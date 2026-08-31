import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  type ReactNode,
} from 'react';
import { en } from '../i18n/en';
import { ru } from '../i18n/ru';
import { translateTopic } from '../i18n/topics';
import type { Lang, Translations } from '../i18n/types';

const DICTS: Record<Lang, Translations> = { en, ru };
// The app is Russian-only. The `lang` state is kept in the context for
// future use and for backward-compat with any subscribers, but there's
// no UI to change it. New code should just call `t()`.
const DEFAULT_LANG: Lang = 'ru';

interface LanguageContextValue {
  lang: Lang;
  /**
   * @deprecated No UI exposes this; the app is Russian-only. Kept for
   * backward compat with code that still wires the language switcher.
   */
  setLang: (lang: Lang) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
  /** Localize a canonical topic slug to the active language.
   *  Returns the "RU / KZ" display pair. */
  tTopic: (slug: string) => string;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

function format(template: string, vars?: Record<string, string | number>): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (_, name) => {
    const v = vars[name];
    return v === undefined ? `{${name}}` : String(v);
  });
}

/**
 * Russian plural category (Cyrillic plural rule, also known as "Slavic
 * plurals"). Given a count, returns 'one' / 'few' / 'many':
 *
 *   1, 21, 31, ...          → 'one'  (карточка)
 *   2-4, 22-24, ...         → 'few'  (карточки)
 *   0, 5-20, 25-30, ...     → 'many' (карточек)
 */
function pluralCategory(n: number): 'one' | 'few' | 'many' {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return 'one';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'few';
  return 'many';
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const lang = DEFAULT_LANG;

  const setLang = useCallback((_next: Lang) => {
    /* no-op: the app is Russian-only. */
  }, []);

  const t = useCallback(
    (key: string, vars?: Record<string, string | number>) => {
      const dict = DICTS[lang];
      let template = dict[key];
      if (template === undefined) {
        // Fall back to English so a missing key never blanks the UI.
        template = DICTS.en[key] ?? key;
      }
      const rawCount = vars?.count;
      let numCount: number;
      if (typeof rawCount === 'number') {
        numCount = rawCount;
      } else if (typeof rawCount === 'string' && rawCount !== '') {
        const parsed = Number(rawCount.replace(/[^\d.-]/g, ''));
        numCount = Number.isFinite(parsed) ? parsed : NaN;
      } else {
        numCount = NaN;
      }
      if (Number.isFinite(numCount)) {
        const cat = pluralCategory(numCount);
        const variantKey = `${key}.${cat}`;
        const variant = dict[variantKey];
        if (typeof variant === 'string') {
          template = variant;
        }
      }
      return format(template, vars);
    },
    [lang],
  );

  const value = useMemo<LanguageContextValue>(
    () => ({
      lang,
      setLang,
      t,
      tTopic: (slug: string) => translateTopic(slug, lang),
    }),
    [lang, setLang, t],
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLang(): LanguageContextValue {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error('useLang must be used inside <LanguageProvider>');
  return ctx;
}
