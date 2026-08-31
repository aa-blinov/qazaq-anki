import { describe, it, expect } from 'vitest';
import { getCuratedExample } from './examples';

describe('getCuratedExample', () => {
  it('returns a sentence for an exact match', () => {
    const ex = getCuratedExample('ана');
    expect(ex).not.toBeNull();
    expect(ex?.kk).toContain('ана');
    expect(ex?.ru).toBeTruthy();
  });

  it('is case-insensitive (kazakh script has no case anyway, but the input may be capitalized)', () => {
    const lower = getCuratedExample('ана');
    const upper = getCuratedExample('Ана');
    expect(upper).toEqual(lower);
  });

  it('trims surrounding whitespace', () => {
    const trimmed = getCuratedExample('су');
    const padded = getCuratedExample('  су  ');
    expect(padded).toEqual(trimmed);
  });

  it('returns null for a word we have not curated', () => {
    expect(getCuratedExample('несуществующееслово')).toBeNull();
  });

  it('returns the same object for the same key (no extra copies in memory)', () => {
    const a = getCuratedExample('үй');
    const b = getCuratedExample('үй');
    expect(a).toBe(b);
  });
});
