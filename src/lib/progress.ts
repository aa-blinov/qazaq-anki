import type { CardSchedule } from './sm2';

/**
 * Progress is stored per card, not per (card, direction). The
 * kk-ru and ru-kk faces of the same Kazakh word share a single
 * SM-2 schedule: studying either direction advances the same
 * `interval`, the same `due` timestamp, and the same leech
 * counter.
 *
 * The key is just the cardId. The `Direction` type is still
 * used elsewhere (TTS language, the review log, the
 * direction-bury logic) — just not as a key into the progress
 * map.
 */
export type ProgressMap = Record<string, CardSchedule>;

/**
 * One row per grading event. The `direction` here is the
 * direction the user was studying in when the grade was
 * recorded. It's used by the day-by-day activity feed and the
 * retention chart to break the history down by direction
 * without affecting the schedule.
 */
export interface ReviewEvent {
  ts: string;
  cardId: string;
  direction: 'kk-ru' | 'ru-kk';
  grade: 'again' | 'hard' | 'good' | 'easy';
}
export type ReviewLog = ReviewEvent[];

/** Progress key is just the cardId. Kept as a function so the
 *  call sites read naturally — `${makeProgressKey(id)}` vs
 *  `id` is a wash, but `makeProgressKey` future-proofs us if
 *  we ever namespace the map (e.g. by deck). */
export function makeProgressKey(cardId: string): string {
  return cardId;
}

/* ---------------------------------------------------------------------------
   Helpers
   ---------------------------------------------------------------------------
   The progress map keys by cardId, so the SR schedule and the
   user-facing counts (seen, mastered, due) agree one-to-one.
   These helpers keep the semantics in one place so every page
   agrees on what "learned" means.
   --------------------------------------------------------------------------- */

/** A card is "seen" if it has a non-`new` schedule. The map
 *  is keyed by cardId so this is just a single lookup. */
export function isCardSeen(cardId: string, progress: ProgressMap): boolean {
  const s = progress[cardId];
  return Boolean(s && s.phase !== 'new');
}

/** A card is "mastered" if its interval has crossed the
 *  mastering threshold. Anki default is 21 days; callers can
 *  pass a smaller value in tests. */
export function isCardMastered(
  cardId: string,
  progress: ProgressMap,
  masteringInterval = 21,
): boolean {
  const s = progress[cardId];
  return Boolean(s && s.phase === 'review' && s.interval >= masteringInterval);
}

/** A card is "due" if it has a non-`new` schedule and the due
 *  timestamp is in the past. Brand-new cards (no row at all,
 *  or `phase === 'new'`) are handled by the "new" tab, not
 *  this function. */
export function isCardDue(
  cardId: string,
  progress: ProgressMap,
  now: Date = new Date(),
): boolean {
  const s = progress[cardId];
  if (!s || s.phase === 'new') return false;
  return new Date(s.due).getTime() <= now.getTime();
}

/** Distinct cardIds the user has touched (any non-`new`
 *  phase). O(n) over the progress map — fine for the
 *  thousands of keys we have at most, and called rarely
 *  (stats page mount, not on every render). */
export function seenCardIds(progress: ProgressMap): Set<string> {
  const out = new Set<string>();
  for (const [id, s] of Object.entries(progress)) {
    if (s && s.phase !== 'new') out.add(id);
  }
  return out;
}

/** Count of cards the user has mastered. Uses the same
 *  `masteringInterval` as `isCardMastered`. */
export function masteredCardCount(
  progress: ProgressMap,
  masteringInterval = 21,
): number {
  const seen = seenCardIds(progress);
  let n = 0;
  for (const id of seen) {
    if (isCardMastered(id, progress, masteringInterval)) n++;
  }
  return n;
}

/** Format marker for the JSON backup file. Travels with the data
 *  so we can detect a stray / corrupted file before touching storage. */
export const EXPORT_MAGIC = 'aq-export/v1';

/* ---------------------------------------------------------------------------
   Leech helper
   ---------------------------------------------------------------------------
   A "leech" is a card the user has failed many times. Anki
   default threshold is 8 lapses; we let the caller pass a
   smaller value for unit tests.
   --------------------------------------------------------------------------- */

/** True if the schedule's lapse count is at or above the
 *  threshold. Single schedule per card → single counter → no
 *  per-direction union needed. */
export function isLeech(
  cardId: string,
  progress: ProgressMap,
  threshold: number,
): boolean {
  const s = progress[cardId];
  return Boolean(s && typeof s.lapses === 'number' && s.lapses >= threshold);
}

/* ---------------------------------------------------------------------------
   Direction helper
   ---------------------------------------------------------------------------
   `Direction` is still used in the review log and for the
   sibling-bury filter (Study page), so we keep the helper
   around. The progress layer doesn't use it any more.
   --------------------------------------------------------------------------- */

/** Reverse direction helper — given a direction, returns the
 *  other one. Used by the sibling-bury filter to skip the
 *  reverse of any card the user has already studied in this
 *  session. */
export function reverseDirection(dir: 'kk-ru' | 'ru-kk'): 'kk-ru' | 'ru-kk' {
  return dir === 'kk-ru' ? 'ru-kk' : 'kk-ru';
}
