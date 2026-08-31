/**
 * Defaults and constants for the spaced-repetition scheduler
 * that don't belong in `sm2.ts` (per-card state) or in the
 * `UserPreferences` blob (per-user overrides). Things that are
 * the same for every user and rarely change.
 */
export const SCHEDULER_DEFAULTS = {
  /** Anki default. 20 brand-new cards per day — enough to make
   *  progress, not enough to drown. Users can override via
   *  `UserPreferences.newCardsPerDay`. */
  newCardsPerDay: 20,

  /** Anki default. The goal ring on the Study page counts
   *  reviews (not new) and shows X / 50. */
  dailyGoalReviews: 50,

  /** Anki default. After this many lapses a card is flagged as
   *  a "leech" — a card that the user keeps forgetting. We
   *  surface a notice and a one-tap reset. */
  leechThreshold: 8,

  /** Same as Anki: 21 days = a card has made it into the long
   *  haul. Used by the "mastered" KPI. */
  masteringInterval: 21,
} as const;

/**
 * Resolve a user-preference value to a finite positive integer.
 * Falls back to the platform default if the user hasn't set one
 * or set a bogus value. We use this everywhere we read a per-user
 * limit so the failure mode is "use the default", not "throw".
 */
export function resolvePrefInt(
  userValue: number | undefined,
  defaultValue: number,
  min: number = 1,
  max: number = 1000,
): number {
  if (typeof userValue !== 'number' || !Number.isFinite(userValue)) return defaultValue;
  const n = Math.floor(userValue);
  if (n < min) return min;
  if (n > max) return max;
  return n;
}
