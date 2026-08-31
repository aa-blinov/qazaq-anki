import { describe, expect, it } from 'vitest';
import {
  isLeech,
  reverseDirection,
  seenCardIds,
  type ProgressMap,
} from './progress';
import { createInitial, review } from './sm2';

describe('isLeech()', () => {
  /**
   * SM-2 only increments `lapses` for a single Again press in
   * the review phase — once in relearning, subsequent Agains
   * don't count (the original lapse entry is what matters). To
   * accumulate N lapses we have to: graduate → again → graduate
   * from relearning (via Good on the last relearning step) →
   * again, and so on. We model that with a small loop.
   */
  function makeScheduleWithLapses(cardId: string, n: number): ReturnType<typeof createInitial> {
    let s = createInitial();
    // Graduate from learning.
    s = review(s, 'good', cardId);
    s = review(s, 'good', cardId);
    for (let i = 0; i < n; i++) {
      // 1. We're in review → press Again → enter relearning, +1 lapse.
      s = review(s, 'again', cardId);
      // 2. Press Good to graduate from relearning back to review.
      s = review(s, 'good', cardId);
    }
    return s;
  }

  it('flags a card with enough lapses in its single schedule', () => {
    const s = makeScheduleWithLapses('a1-test', 8);
    // Progress is now keyed by cardId only — no `::direction` suffix.
    const progress: ProgressMap = { 'a1-test': s };
    expect(s.lapses).toBe(8); // sanity: our helper accumulates correctly
    expect(isLeech('a1-test', progress, 8)).toBe(true);
  });

  it('uses the supplied threshold (callers pass Anki default 8)', () => {
    const s = makeScheduleWithLapses('a1-edge', 5);
    const progress: ProgressMap = { 'a1-edge': s };
    expect(isLeech('a1-edge', progress, 8)).toBe(false);
    expect(isLeech('a1-edge', progress, 4)).toBe(true);
  });

  it('is not a leech when the schedule is below threshold', () => {
    // With unified progress, "either direction" no longer
    // applies — there's a single counter. The new contract is
    // simply "this card's lapses >= threshold".
    const s = makeScheduleWithLapses('a1-fresh', 2);
    const progress: ProgressMap = { 'a1-fresh': s };
    expect(isLeech('a1-fresh', progress, 8)).toBe(false);
  });
});

describe('reverseDirection()', () => {
  it('swaps kk-ru and ru-kk', () => {
    expect(reverseDirection('kk-ru')).toBe('ru-kk');
    expect(reverseDirection('ru-kk')).toBe('kk-ru');
  });
});

describe('seenCardIds()', () => {
  it('returns empty for a fresh progress map', () => {
    expect(seenCardIds({}).size).toBe(0);
  });

  it('includes a cardId only after the schedule leaves "new"', () => {
    const initial = createInitial();
    // Progress is keyed by cardId only.
    const progress: ProgressMap = { 'a1-001': initial };
    // Initial schedule is phase 'new' — should not be "seen".
    expect(seenCardIds(progress).has('a1-001')).toBe(false);
    // Press Good to leave new.
    const after = review(initial, 'good', 'a1-001');
    progress['a1-001'] = after;
    expect(seenCardIds(progress).has('a1-001')).toBe(true);
  });

  it('reports the card as seen once (no per-direction dedupe needed)', () => {
    // With one schedule per card there's no longer a
    // double-count case to test for, but the count should
    // still be 1.
    const progress: ProgressMap = {
      'a1-001': review(createInitial(), 'good', 'a1-001'),
    };
    const seen = seenCardIds(progress);
    expect(seen.size).toBe(1);
    expect(seen.has('a1-001')).toBe(true);
  });
});
