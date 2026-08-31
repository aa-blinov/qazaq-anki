/**
 * Tiny storage wrapper. Uses localStorage in the browser; falls back to an
 * in-memory map (process-global) when localStorage is unavailable — SSR,
 * private mode, or test environments that don't provide one.
 *
 * The fallback is reset by tests via `_resetForTests()` in setup.ts.
 *
 * All read/write paths are wrapped in try/catch so a tampered localStorage
 * (e.g. a hostile browser extension) can't crash the app — we degrade to
 * the fallback value / in-memory map.
 */

const mem = new Map<string, string>();

/** Hard cap on the size of any single value we accept. localStorage is
 *  typically 5 MB; if we somehow get a multi-megabyte string we ignore it
 *  rather than let the app hang. */
const MAX_VALUE_BYTES = 4 * 1024 * 1024;

function getBackend(): Storage | null {
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      // Probe — if setItem throws (quota / disabled), fall back to mem.
      const k = '__aq_probe__';
      window.localStorage.setItem(k, '1');
      window.localStorage.removeItem(k);
      return window.localStorage;
    } catch {
      return null;
    }
  }
  return null;
}

export function readJSON<T>(key: string, fallback: T): T {
  let raw: string | null = null;
  const ls = getBackend();
  if (ls) {
    try {
      raw = ls.getItem(key);
    } catch {
      raw = null;
    }
  }
  if (raw == null) raw = mem.get(key) ?? null;
  if (!raw) return fallback;
  if (raw.length > MAX_VALUE_BYTES) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function writeJSON<T>(key: string, value: T): void {
  let raw: string;
  try {
    raw = JSON.stringify(value);
  } catch {
    // Circular refs, BigInts, etc. — refuse to write garbage.
    return;
  }
  if (raw.length > MAX_VALUE_BYTES) return;
  const ls = getBackend();
  if (ls) {
    try {
      ls.setItem(key, raw);
      return;
    } catch {
      /* fall through to mem */
    }
  }
  mem.set(key, raw);
}

export function removeKey(key: string): void {
  const ls = getBackend();
  if (ls) {
    try {
      ls.removeItem(key);
    } catch {
      /* noop */
    }
  }
  mem.delete(key);
}

/** Test helper. */
export function _resetForTests(): void {
  mem.clear();
  const ls = getBackend();
  if (ls) {
    try {
      ls.clear();
    } catch {
      /* noop */
    }
  }
}

