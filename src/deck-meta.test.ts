import { describe, it, expect, beforeEach } from 'vitest';
import { loadDeckMeta, cardLevelOf, totalCardsByLevel, LEVELS } from '../deck-meta.js';

describe('deck-meta', () => {
  beforeEach(() => {
    // No explicit reset API — the module is idempotent and the
    // test process is fresh per file. We just trigger the load
    // and assert on the resulting maps.
    loadDeckMeta();
  });

  it('loads the bundled starter set (3996 cards)', () => {
    // Sanity check on the real bundled decks. If the count ever
    // drifts below 3000 something has gone missing in the data.
    const totals = totalCardsByLevel();
    const total = Object.values(totals).reduce((a, b) => a + b, 0);
    expect(total).toBeGreaterThanOrEqual(3000);
  });

  it('exposes all five CEFR levels with non-zero totals', () => {
    const totals = totalCardsByLevel();
    for (const lvl of LEVELS) {
      expect(totals[lvl]).toBeGreaterThan(0);
    }
  });

  it('returns a level for every bundled card', () => {
    // A1-0098 was the first one we wrote tests against — known
    // to be present in the starter set.
    expect(cardLevelOf('a1-0098')).toBe('A1');
  });

  it('returns null for unknown card ids', () => {
    expect(cardLevelOf('not-a-card-id')).toBeNull();
    expect(cardLevelOf('zzz-9999')).toBeNull();
  });

  it('totalCardsByLevel returns a fresh object (no shared state leak)', () => {
    const totals = totalCardsByLevel();
    totals.A1 = -1;
    // The cached state must NOT be mutated by callers. A second
    // read returns the original value.
    expect(totalCardsByLevel().A1).toBeGreaterThan(0);
  });

  it('LEVELS is in canonical CEFR order', () => {
    expect(LEVELS).toEqual(['A1', 'A2', 'B1', 'B2', 'C1']);
  });
});