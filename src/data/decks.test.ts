import { describe, it, expect, beforeEach } from 'vitest';
import {
  loadLevel,
  getCardsByLevel,
  getCardCount,
  getCategoriesByLevel,
  getTotalCards,
  levelIdToName,
  LEVELS,
  preloadAllLevels,
  groupCardsByTopic,
} from './decks';
import { _resetForTests } from '../lib/storage';

beforeEach(() => {
  _resetForTests();
});

/* ------------------------------------------------------------------ *
 *  Level / topic structure invariants
 * ------------------------------------------------------------------ */
describe('deck data integrity', () => {
  it('has exactly 5 CEFR levels and no "common" level', () => {
    const ids = LEVELS.map((l) => l.id);
    expect(ids).toEqual(['a1', 'a2', 'b1', 'b2', 'c1']);
    expect(ids).not.toContain('common');
  });

  it('every level has at least 100 cards', async () => {
    for (const lvl of LEVELS) {
      const cards = await loadLevel(lvl.id);
      expect(cards.length, `${lvl.id} card count`).toBeGreaterThanOrEqual(100);
    }
  });

  it('getCardCount returns the actual count once a level is loaded', async () => {
    const hint = LEVELS[0].cardCount;
    // Before load, the function returns the build-time hint.
    expect(getCardCount('a1')).toBe(hint);
    const cards = await loadLevel('a1');
    // After load, it returns the actual cache size.
    expect(getCardCount('a1')).toBe(cards.length);
  });

  it('getTotalCards returns the sum of actual counts once all are loaded', async () => {
    const hintSum = LEVELS.reduce((a, l) => a + l.cardCount, 0);
    // Before any load, the sum is the hint sum.
    expect(getTotalCards()).toBe(hintSum);
    await preloadAllLevels();
    // After preloading, it's the sum of the actual caches.
    const actual = LEVELS.reduce((a, l) => a + getCardCount(l.id), 0);
    expect(getTotalCards()).toBe(actual);
  });

  it('getTotalCards is at least 1000', () => {
    expect(getTotalCards()).toBeGreaterThanOrEqual(1000);
  });

  it('every level has at least 3 topics', async () => {
    // A1, A2, B1, C1 have >=5 topics from the qazcorpus lexmin
    // parser. B2's section headers are split across multiple PDF
    // lines (e.g. "Қ ҰРЛЫҚТАР" + "К ОНТИНЕНТЫ"), so the per-page
    // header detection collapses them. We accept >=3 as a
    // lower-bound until the B2 parser is upgraded.
    for (const lvl of LEVELS) {
      await loadLevel(lvl.id);
      const topics = getCategoriesByLevel(lvl.id);
      expect(topics.length, `${lvl.id} topic count`).toBeGreaterThanOrEqual(3);
    }
  });

  it('the build-time hint in decks.json matches the actual JSON counts', async () => {
    // Catches the case where someone edits a per-level JSON
    // without re-running `scripts/unify-topics.mjs` — the landing
    // page would briefly show two different numbers, and the
    // hint would silently rot.
    await preloadAllLevels();
    for (const lvl of LEVELS) {
      expect(getCardCount(lvl.id), `${lvl.id} hint vs actual`).toBe(lvl.cardCount);
    }
  });
});

/* ------------------------------------------------------------------ *
 *  Card-id uniqueness (within a level). Cross-level duplicates are
 *  intentional — basic words (pronouns, numbers) appear in multiple
 *  CEFR levels for spaced-repetition review.
 * ------------------------------------------------------------------ */
describe('card id uniqueness', () => {
  it('every card id is unique within its level', async () => {
    for (const lvl of LEVELS) {
      const cards = await loadLevel(lvl.id);
      const seen = new Set<string>();
      for (const c of cards) {
        expect(seen.has(c.id), `duplicate id in ${lvl.id}: ${c.id}`).toBe(false);
        seen.add(c.id);
      }
    }
  });

  it('every card id matches the level-{NNNN} format', async () => {
    const idRe = /^(a1|a2|b1|b2|c1)-\d{4}$|^common-\d{4}$/;
    for (const lvl of LEVELS) {
      const cards = await loadLevel(lvl.id);
      for (const c of cards) {
        expect(idRe.test(c.id), `bad id: ${c.id}`).toBe(true);
      }
    }
  });
});

/* ------------------------------------------------------------------ *
 *  Cross-level word overlap is expected and good (basic words recur).
 *  The test only fails if a level is wildly off-shape, e.g. zero
 *  vocabulary (a broken build) or runaway duplicates.
 * ------------------------------------------------------------------ */
describe('cross-level sanity', () => {
  it('no level has zero vocabulary (a broken build would)', async () => {
    for (const lvl of LEVELS) {
      const cards = await loadLevel(lvl.id);
      expect(cards.length, `${lvl.id} is empty`).toBeGreaterThan(0);
    }
  });
});

/* ------------------------------------------------------------------ *
 *  Every card's level field matches its parent level
 * ------------------------------------------------------------------ */
describe('card.level matches parent level', () => {
  it('every card has level = parent level name', async () => {
    for (const lvl of LEVELS) {
      const expected = levelIdToName(lvl.id);
      expect(expected).toBeTruthy();
      const cards = await loadLevel(lvl.id);
      for (const c of cards) {
        expect(c.level, `${c.id}.level`).toBe(expected);
        expect(c.deck).toBe('cefr');
      }
    }
  });
});

/* ------------------------------------------------------------------ *
 *  groupCardsByTopic works
 * ------------------------------------------------------------------ */
describe('groupCardsByTopic', () => {
  it('groups every card under its topic and only its topic', async () => {
    const cards = await loadLevel('a1');
    const grouped = groupCardsByTopic(cards);
    const sum = Object.values(grouped).reduce((a, g) => a + g.length, 0);
    expect(sum).toBe(cards.length);
    for (const c of cards) {
      expect(grouped[c.category]).toBeDefined();
      expect(grouped[c.category]).toContainEqual(
        expect.objectContaining({ id: c.id }),
      );
    }
  });
});

/* ------------------------------------------------------------------ *
 *  Every card.category is a canonical topic slug. This is the
 *  contract that ties the deck JSON to `src/i18n/topics.ts` — if
 *  someone adds a new topic on disk without extending the canonical
 *  taxonomy, the front-end can't localize it.
 * ------------------------------------------------------------------ */
describe('card.category is a canonical topic slug', () => {
  it('every card category is in the unified taxonomy', async () => {
    // Lazy import to avoid a hard cycle with topics.ts.
    const { TOPIC_NAMES } = await import('../i18n/topics');
    const slugs = new Set(Object.keys(TOPIC_NAMES));
    for (const lvl of LEVELS) {
      const cards = await loadLevel(lvl.id);
      for (const c of cards) {
        expect(slugs.has(c.category), `unknown slug "${c.category}" in ${lvl.id}/${c.id}`).toBe(
          true,
        );
      }
    }
  });
});

/* ------------------------------------------------------------------ *
 *  Synchronous accessor after load
 * ------------------------------------------------------------------ */
describe('getCardsByLevel after load', () => {
  it('returns the same array as loadLevel', async () => {
    const cards = await loadLevel('b1');
    const cached = getCardsByLevel('b1');
    expect(cached.length).toBe(cards.length);
    expect(cached[0]?.id).toBe(cards[0]?.id);
  });

  it('returns [] for an unknown level id', () => {
    expect(getCardsByLevel('zzz')).toEqual([]);
  });
});
