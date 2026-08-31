import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { readJSON, writeJSON } from '../lib/storage';

/**
 * User-controlled interface text scale. Multiplies the body's base
 * font-size (set in global.css as 15px) so that every `rem`-sized
 * element on the page — typography, buttons, cards, chip labels —
 * scales uniformly.
 *
 * Persistence: same `aq:*` localStorage namespace as the theme
 * (the inline `public/theme-init.js` reads the same key on first
 * paint to avoid a flash when the user has picked a non-default
 * size).
 *
 * 4 steps feels right: the middle one ('md', 1.0×) is the default;
 * 'sm' (0.875×) packs more text on small screens or for users who
 * prefer denser UI; 'lg' (1.125×) and 'xl' (1.25×) help with
 * accessibility / readability at the cost of fitting less per screen.
 */
export type FontSize = 'sm' | 'md' | 'lg' | 'xl';

interface FontSizeContextValue {
  fontSize: FontSize;
  /** Click the topbar "A" button to advance. Wraps back to 'sm' after 'xl'. */
  cycle: () => void;
  /** Set an explicit size. */
  set: (s: FontSize) => void;
}

const FontSizeContext = createContext<FontSizeContextValue | null>(null);

const KEY = 'aq:fontSize';
const ORDER: FontSize[] = ['sm', 'md', 'lg', 'xl'];

function isFontSize(s: unknown): s is FontSize {
  return s === 'sm' || s === 'md' || s === 'lg' || s === 'xl';
}

function getInitial(): FontSize {
  if (typeof window === 'undefined') return 'md';
  const stored = readJSON<FontSize | null>(KEY, null);
  return isFontSize(stored) ? stored : 'md';
}

export function FontSizeProvider({ children }: { children: ReactNode }) {
  const [fontSize, setFontSize] = useState<FontSize>(getInitial);

  useEffect(() => {
    // Map the enum to a CSS multiplier. The inline theme-init.js
    // sets the same variable from the same key on first paint, so
    // there's no FOUC between this useEffect and the page render.
    const scale = { sm: 0.875, md: 1, lg: 1.125, xl: 1.25 }[fontSize];
    document.documentElement.style.setProperty('--font-scale', String(scale));
    writeJSON(KEY, fontSize);
  }, [fontSize]);

  const cycle = useCallback(() => {
    setFontSize((cur) => ORDER[(ORDER.indexOf(cur) + 1) % ORDER.length]);
  }, []);

  const set = useCallback((s: FontSize) => setFontSize(s), []);

  const value = useMemo<FontSizeContextValue>(
    () => ({ fontSize, cycle, set }),
    [fontSize, cycle, set],
  );

  return (
    <FontSizeContext.Provider value={value}>
      {children}
    </FontSizeContext.Provider>
  );
}

export function useFontSize(): FontSizeContextValue {
  const ctx = useContext(FontSizeContext);
  if (!ctx) throw new Error('useFontSize must be used inside <FontSizeProvider>');
  return ctx;
}
