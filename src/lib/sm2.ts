/**
 * Anki-style spaced repetition scheduler.
 *
 * Card lifecycle:
 *
 *   ┌────┐  Good on last step   ┌────────┐
 *   │new │ ────────────────────▶ │review  │  Again  ┌────────────┐
 *   └────┘  Easy anywhere        └────────┘ ───────▶ │relearning  │
 *      ▲                              ▲              └────────────┘
 *      │ Again (restart learning)     │ Good on last step
 *      │                              │
 *   ┌────────┐
 *   │learning│ (steps: 1m → 10m)
 *   └────────┘
 *
 * Public API:
 *   createInitial(now)        – brand-new card, phase = "new"
 *   review(state, grade, id)  – apply a grade, return new schedule
 *   isDue(state, now)         – should the card be shown now?
 *   nextIntervalLabel(...)    – human label of the next interval (no fuzz)
 *   migrateOldState(old)      – upgrade from the previous SM-2-only format
 */

export type Phase = 'new' | 'learning' | 'review' | 'relearning';
export type Grade = 'again' | 'hard' | 'good' | 'easy';

export interface CardSchedule {
  phase: Phase;
  /** ease factor, ~2.5 default, clamped to [1.3, ∞) */
  ease: number;
  /** current interval in days — only meaningful in `review` */
  interval: number;
  /** ISO timestamp of next due date (absolute, used for time- and date-based scheduling) */
  due: string;
  /** ISO timestamp of last review */
  lastReview: string | null;
  /** total times reviewed */
  reviews: number;
  /** total times answered correctly (Good or Easy) */
  correct: number;
  /** total times the card has been lapsed (Again while in review) */
  lapses: number;
  /** index into the learning/relearning steps array */
  learningStep: number;
  /** successful review passes in `review` state — drives SM-2 progression */
  reps: number;
}

/**
 * Tunable knobs. Mirrors Anki's deck-options defaults; tweak in one place.
 */
export const SCHEDULE_CONFIG = {
  /** Learning steps in minutes for a brand-new card. */
  learningStepsMin: [1, 10] as const,
  /** Days between graduating from learning and first review (Good on last step). */
  graduatingIntervalDays: 1,
  /** Days if the user picks Easy on a new card. */
  easyIntervalDays: 4,
  /** Relearning steps in minutes after a lapse. */
  relearningStepsMin: [10] as const,
  /** Multiplier for the previous review interval when graduating from relearning.
   *  0 = start over from graduatingIntervalDays. Anki default is 0.0. */
  lapseNewIntervalMultiplier: 0,
  /** Multiplier applied to the next interval when user picks Easy in review. */
  easyBonus: 1.3,
  /** Multiplier applied to the next interval when user picks Hard in review. */
  hardIntervalMultiplier: 1.2,
  /** Ease delta when user picks Hard in review. */
  hardEaseDelta: -0.15,
  /** Ease delta when card is lapsed (Again in review). */
  lapseEaseDelta: -0.2,
  /** Ease delta when user picks Easy in review. */
  easyEaseDelta: 0.15,
  /** Minimum ease (Anki's hard floor). */
  minEase: 1.3,
  /** Minimum interval in days for review cards. */
  minIntervalDays: 1,
  /** Maximum interval in days (Anki default: 36500 ≈ 100 years). */
  maxIntervalDays: 36500,
  /** Random jitter on the resulting interval, in [1−fuzz, 1+fuzz]. */
  fuzz: 0.05,
  /** Starting ease for a brand-new card. */
  startingEase: 2.5,
} as const;

const MIN_MS = 60_000;
const DAY_MS = 86_400_000;

export function createInitial(now: Date = new Date()): CardSchedule {
  return {
    phase: 'new',
    ease: SCHEDULE_CONFIG.startingEase,
    interval: 0,
    due: now.toISOString(),
    lastReview: null,
    reviews: 0,
    correct: 0,
    lapses: 0,
    learningStep: 0,
    reps: 0,
  };
}

function addMinutes(d: Date, m: number): Date {
  return new Date(d.getTime() + m * MIN_MS);
}

function addDays(d: Date, days: number): Date {
  return new Date(d.getTime() + days * DAY_MS);
}

/** Deterministic fuzz in [1−fuzz, 1+fuzz], seeded by card id so the same
 *  card always gets the same jitter — Anki-style stable preview numbers. */
function fuzzFactor(cardId: string): number {
  let h = 2166136261;
  for (let i = 0; i < cardId.length; i++) {
    h ^= cardId.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const r = ((h >>> 0) / 0xffffffff) * 2 - 1; // [-1, 1]
  return 1 + SCHEDULE_CONFIG.fuzz * r;
}

function clampDays(days: number): number {
  return Math.max(
    SCHEDULE_CONFIG.minIntervalDays,
    Math.min(SCHEDULE_CONFIG.maxIntervalDays, Math.round(days)),
  );
}

export function review(
  state: CardSchedule,
  grade: Grade,
  cardId: string,
  now: Date = new Date(),
): CardSchedule {
  return reviewWithFuzz(state, grade, fuzzFactor(cardId), now);
}

/**
 * Same as `review` but with an explicit fuzz factor. The public
 * `review` derives the fuzz from the card id so the schedule is
 * stable per card (you always get the same jitter for the same
 * card — Anki's behaviour). The preview label, however, has to
 * show a number that doesn't depend on the card — otherwise the
 * "Good" / "Easy" hints would be different for every card and the
 * user couldn't learn them. The preview path uses fuzz=1.0.
 */
function reviewWithFuzz(
  state: CardSchedule,
  grade: Grade,
  fuzz: number,
  now: Date,
): CardSchedule {
  const next: CardSchedule = { ...state, reviews: state.reviews + 1 };

  /* ----------------------------- NEW / LEARNING ----------------------------- */
  if (state.phase === 'new' || state.phase === 'learning') {
    if (grade === 'again') {
      next.phase = 'learning';
      next.learningStep = 0;
      next.due = addMinutes(now, SCHEDULE_CONFIG.learningStepsMin[0]).toISOString();
    } else if (grade === 'hard') {
      // Repeat the current step
      next.phase = 'learning';
      const stepMin = SCHEDULE_CONFIG.learningStepsMin[state.learningStep];
      next.due = addMinutes(now, stepMin).toISOString();
    } else if (grade === 'good') {
      const nextStep = state.learningStep + 1;
      if (nextStep < SCHEDULE_CONFIG.learningStepsMin.length) {
        // Advance to next learning step
        next.phase = 'learning';
        next.learningStep = nextStep;
        next.due = addMinutes(now, SCHEDULE_CONFIG.learningStepsMin[nextStep]).toISOString();
      } else {
        // Graduate to review
        graduate(next, clampDays(SCHEDULE_CONFIG.graduatingIntervalDays * fuzz), now);
        next.correct = state.correct + 1;
      }
    } else {
      // Easy: graduate immediately with the easy interval
      graduate(next, clampDays(SCHEDULE_CONFIG.easyIntervalDays * fuzz), now);
      next.correct = state.correct + 1;
    }
  }

  /* ------------------------------- RELEARNING ------------------------------- */
  else if (state.phase === 'relearning') {
    if (grade === 'again') {
      next.learningStep = 0;
      next.due = addMinutes(now, SCHEDULE_CONFIG.relearningStepsMin[0]).toISOString();
    } else {
      // Graduate from relearning back to review.
      // Note: lapses was already incremented when this card entered
      // relearning (see review-phase "Again" branch above), so we don't
      // bump it again here. Ease, however, is decremented once on lapse
      // (Anki's behavior) — also done on entry, so we keep it stable here.
      const baseDays = Math.max(
        SCHEDULE_CONFIG.minIntervalDays,
        state.interval * SCHEDULE_CONFIG.lapseNewIntervalMultiplier,
      );
      graduate(next, clampDays(baseDays * fuzz), now);
      // No ease change here — the lapse penalty was already applied on entry.
      if (grade === 'good' || grade === 'easy') {
        next.correct = state.correct + 1;
      }
    }
  }

  /* --------------------------------- REVIEW --------------------------------- */
  else {
    if (grade === 'again') {
      // Lapse: drop to relearning
      next.phase = 'relearning';
      next.learningStep = 0;
      next.lapses = state.lapses + 1;
      next.ease = clampEase(state.ease + SCHEDULE_CONFIG.lapseEaseDelta);
      next.due = addMinutes(now, SCHEDULE_CONFIG.relearningStepsMin[0]).toISOString();
    } else {
      let mult: number;
      let easeDelta = 0;
      if (grade === 'hard') {
        mult = SCHEDULE_CONFIG.hardIntervalMultiplier;
        easeDelta = SCHEDULE_CONFIG.hardEaseDelta;
      } else if (grade === 'good') {
        mult = state.ease;
      } else {
        mult = state.ease * SCHEDULE_CONFIG.easyBonus;
        easeDelta = SCHEDULE_CONFIG.easyEaseDelta;
      }
      const baseDays = Math.max(
        SCHEDULE_CONFIG.minIntervalDays,
        Math.round(state.interval * mult),
      );
      next.phase = 'review';
      next.interval = clampDays(baseDays * fuzz);
      next.due = addDays(now, next.interval).toISOString();
      next.ease = clampEase(state.ease + easeDelta);
      next.reps = state.reps + 1;
      next.correct = state.correct + 1;
    }
  }

  next.lastReview = now.toISOString();
  return next;
}

function graduate(next: CardSchedule, intervalDays: number, now: Date): void {
  next.phase = 'review';
  next.learningStep = 0;
  next.reps = next.reps + 1;
  next.interval = intervalDays;
  // Use the `now` argument, not `new Date()` — the caller passes
  // a specific timestamp (often a fixed NOW in tests), and using
  // the wall clock here would silently produce a different
  // interval on every call. A previous version captured
  // `new Date()` at this line, which made CI flake by a few days
  // when the test runner's clock drifted past the pinned NOW.
  next.due = addDays(now, intervalDays).toISOString();
}

function clampEase(e: number): number {
  return Math.max(SCHEDULE_CONFIG.minEase, e);
}

export function isDue(state: CardSchedule, now: Date = new Date()): boolean {
  return new Date(state.due).getTime() <= now.getTime();
}

export function isDueInPhase(
  state: CardSchedule,
  phase: Phase,
  now: Date = new Date(),
): boolean {
  if (phase === 'new') return state.phase === 'new';
  return state.phase === phase && isDue(state, now);
}

export function countDueByPhase(
  states: Iterable<CardSchedule>,
  now: Date = new Date(),
): Record<Phase, number> {
  const out: Record<Phase, number> = { new: 0, learning: 0, review: 0, relearning: 0 };
  for (const s of states) {
    for (const p of ['new', 'learning', 'review', 'relearning'] as Phase[]) {
      if (isDueInPhase(s, p, now)) out[p]++;
    }
  }
  return out;
}

/** Compute the next interval label for a hypothetical grade — without applying
 *  fuzz so the displayed numbers are stable across renders.
 *
 *  Format is the standard Anki-style duration (`10m`, `5d`, `2mo`,
 *  `1.5y`). The label is shown under the rating button as a quick
 *  "how long until this card comes back" hint. A previous iteration
 *  rendered the same duration as a card count (`"5 карточек"`),
 *  but in practice three of the four options collapse to the same
 *  number for a brand-new card (all four learning steps are < 1
 *  day) — that made the user think the buttons did the same thing.
 *  Time reads cleaner because the units are honest: minutes and
 *  days mean what they say.
 */
export function nextIntervalLabel(
  state: CardSchedule,
  grade: Grade,
  now: Date = new Date(),
  lang: 'en' | 'ru' = 'en',
): string {
  // Build a "preview" schedule with fuzz factor 1.0 (neutral)
  const preview = previewSchedule(state, grade, now);
  return formatDuration(new Date(preview.due).getTime() - now.getTime(), lang);
}

/** Russian pluralization for "карточка/карточки/карточек".
 *  Standard rule: mod10==1 (and mod100!=11) → singular,
 *  mod10 in {2,3,4} (and mod100 not in {12,13,14}) → few,
 *  otherwise → many. */
function pluralizeCards(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return `${n} карточка`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) {
    return `${n} карточки`;
  }
  return `${n} карточек`;
}

/** Format a duration as a card count. Sub-day intervals collapse
 *  to "1 карточка" — the card comes back in the same session, so
 *  showing the count of one card is more honest than "10m" (which
 *  sits in a different unit than "5d" on the right side of the
 *  same row). For multi-day intervals the count equals the day
 *  count, treating 1 day ≈ 1 card review. */
export function formatIntervalAsCardCount(ms: number): string {
  if (ms <= 0) return '1 карточка';
  const minutes = Math.round(ms / MIN_MS);
  if (minutes < 24 * 60) return '1 карточка';
  const days = Math.round(minutes / (24 * 60));
  return pluralizeCards(days);
}

function previewSchedule(
  state: CardSchedule,
  grade: Grade,
  now: Date,
): CardSchedule {
  // The rating button label is a *preview* of what the next
  // interval would be — it must not depend on the card id
  // (otherwise the "Good" / "Easy" labels would be different
  // for every card and the user couldn't learn them). We use
  // a neutral fuzz of 1.0 via the internal `reviewWithFuzz`,
  // which is the same code path as `review` but with the fuzz
  // factor pinned. This used to round through `review()` with
  // a hand-picked card id; that approach was a bug because
  // no printable string hashes to 0 in FNV-1a and the actual
  // fuzz drifted with the date (CI flaked: "4d vs 7d").
  return reviewWithFuzz(state, grade, 1.0, now);
}

export function formatDuration(ms: number, lang: 'en' | 'ru' = 'en'): string {
  // Two short unit systems: Anki's English shorthand (`1m`, `5d`,
  // `2mo`, `1.5y`) and a Russian shorthand that maps the same
  // units to Cyrillic glyphs. The Russian form uses a thin space
  // between the number and the unit (`1 мин`, `4 дн`) so the
  // glyphs read as units, not as suffixes glued to the digit. A
  // bare `1д` reads like "first grader" — `1 дн` is unambiguously
  // "one day".
  const sep = lang === 'ru' ? ' ' : '';
  const units = lang === 'ru'
    ? { now: 'сейчас', ltMin: '<1 мин', min: 'мин', hour: 'ч', day: 'дн', month: 'мес', year: 'г' }
    : { now: 'now', ltMin: '<1m', min: 'm', hour: 'h', day: 'd', month: 'mo', year: 'y' };
  if (ms <= 0) return units.now;
  const minutes = Math.round(ms / MIN_MS);
  if (minutes < 1) return units.ltMin;
  if (minutes < 60) return `${minutes}${sep}${units.min}`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}${sep}${units.hour}`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}${sep}${units.day}`;
  const months = Math.round(days / 30);
  if (months < 12) return `${months}${sep}${units.month}`;
  const years = days / 365;
  if (years < 10) return `${years.toFixed(1)}${sep}${units.year}`;
  return `${Math.round(years)}${sep}${units.year}`;
}

/** Human-readable description of the card's current phase. */
export function phaseLabel(phase: Phase): string {
  switch (phase) {
    case 'new': return 'New';
    case 'learning': return 'Learning';
    case 'review': return 'Review';
    case 'relearning': return 'Relearning';
  }
}

/** ---------------------------------------------------------------------------
 * Migration: convert the old SM-2-only shape to the new schedule.
 *  Old: { repetitions, ease, interval, due, lastReview, reviews, correct }
 * ------------------------------------------------------------------------- */
export interface LegacyCardState {
  repetitions: number;
  ease: number;
  interval: number;
  due: string;
  lastReview: string | null;
  reviews: number;
  correct: number;
}

export function migrateOldState(
  old: LegacyCardState,
  now: Date = new Date(),
): CardSchedule {
  const base: CardSchedule = createInitial(now);
  // If the user already had a positive interval and reps, they were in review.
  if (old.repetitions >= 1 && old.interval >= 1) {
    return {
      ...base,
      phase: 'review',
      ease: old.ease || SCHEDULE_CONFIG.startingEase,
      interval: old.interval,
      due: old.due,
      lastReview: old.lastReview,
      reviews: old.reviews,
      correct: old.correct,
      reps: old.repetitions,
    };
  }
  // Otherwise treat as still-new.
  return {
    ...base,
    ease: old.ease || SCHEDULE_CONFIG.startingEase,
    lastReview: old.lastReview,
    reviews: old.reviews,
    correct: old.correct,
  };
}
