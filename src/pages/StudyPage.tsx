import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, NavLink, useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Sparkles, ArrowRight, Languages } from 'lucide-react';
import { Flashcard } from '../components/Flashcard';
import { TopicSelect } from '../components/TopicSelect';
import { PickerSelect, type PickerOption } from '../components/PickerSelect';
import {
  loadLevel,
  preloadAllLevels,
  LEVELS,
  type Card as CardData,
  type LevelName,
  type Direction,
} from '../data/decks';
import { useProgress } from '../contexts/ProgressContext';
import { useLang } from '../contexts/LanguageContext';
import { useUserCards } from '../contexts/UserCardsContext';
import {
  createInitial,
  isDue,
  nextIntervalLabel,
  type CardSchedule,
  type Grade,
} from '../lib/sm2';
import { makeProgressKey, reverseDirection } from '../lib/progress';
import { SCHEDULER_DEFAULTS, resolvePrefInt } from '../lib/scheduler-config';
import { api, type DailyCounter } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import styles from './StudyPage.module.css';

type Mode = 'due' | 'new' | 'all' | 'cram';

export function StudyPage() {
  // The current shape of the routes:
  //   /study                   → default cross-level "due" queue
  //                              (the "all" mode the old /study/all URL used to give us)
  //   /study/level/:levelId    → one specific level, where levelId is a1..c1
  //   /study/:levelId          → legacy URL, redirected by App.tsx
  // Both `levelId` and the user-card filter below treat a missing
  // or `all` levelId as "every level". Case is normalised here so
  // the rest of the page sees a single canonical shape; the static
  // `loadLevel` lookup is keyed on lowercase, while the user-card
  // `Level` field is uppercase.
  const { levelId: rawLevelId } = useParams<{ levelId?: string }>();
  const levelId = (rawLevelId ?? 'all').toLowerCase();
  const levelName = levelId === 'all' ? null : (levelId.toUpperCase() as LevelName);

  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { progress, grade, gradeUndo } = useProgress();
  const { t, lang } = useLang();
  const { user } = useAuth();
  // Effective per-user limits — fall back to Anki defaults if the
  // user hasn't customised them. We re-resolve on every render
  // because the preferences blob is mutable from the settings UI.
  const newCardsPerDay = resolvePrefInt(
    user?.preferences?.newCardsPerDay,
    SCHEDULER_DEFAULTS.newCardsPerDay,
    1,
    500,
  );
  const dailyGoal = resolvePrefInt(
    user?.preferences?.dailyGoalReviews,
    SCHEDULER_DEFAULTS.dailyGoalReviews,
    5,
    1000,
  );
  // Daily counter (today). Fetched once on mount and after every
  // grade. The server is the source of truth — we keep a local
  // mirror so the goal ring can render without a round trip.
  const [daily, setDaily] = useState<DailyCounter | null>(null);
  const refreshDaily = useCallback(async () => {
    if (!user) return;
    try {
      const d = await api.daily();
      setDaily(d);
    } catch {
      // Daily counter is a UI nicety; don't break the page on failure.
    }
  }, [user]);
  useEffect(() => {
    void refreshDaily();
  }, [refreshDaily]);
  // When the user changes direction mid-session, the buried
  // siblings of the OLD direction should remain in the buried
  // set (they belong to the previous direction's session, not
  // this one). We keep the per-direction history instead of one
  // global set so a switch doesn't pollute the new queue.
  const [studiedByDir, setStudiedByDir] = useState<Record<Direction, Set<string>>>({
    'kk-ru': new Set(),
    'ru-kk': new Set(),
  });
  // User-added cards live in their own context. We merge them
  // into the official `allCards` list so the same queue /
  // category / progress / TTS machinery handles both kinds
  // uniformly — a user-added "greetings" card just shows up in
  // the same /study/a1?topic=greetings queue.
  const { cards: userCards } = useUserCards();
  // Filter user cards to this level up front. Recomputing
  // depends on `userCards` so an add/edit/delete while the
  // study page is mounted flows through without a remount.
  // When the URL is the cross-level queue (`levelId = 'all'`),
  // include every user card regardless of its `Level` field —
  // a user-added "greetings" card should show up in /study too.
  const myCardsForLevel = useMemo(
    () =>
      (levelName
        ? userCards.filter((c) => c.level === levelName)
        : userCards) as unknown as CardData[],
    [userCards, levelName],
  );

  const initialTopic = searchParams.get('topic') ?? 'all';
  const initialDir = (searchParams.get('dir') as Direction) || 'kk-ru';
  // Phase filter is only meaningful in 'all' / 'cram' mode — in
  // 'due' / 'new' the tab itself already implies a phase. Persist
  // it in the URL so a refresh keeps the filter.
  type PhaseFilter = 'all' | 'new' | 'learning' | 'review' | 'mastered';
  const initialPhase: PhaseFilter = (() => {
    const raw = searchParams.get('phase');
    if (raw === 'new' || raw === 'learning' || raw === 'review' || raw === 'mastered') {
      return raw;
    }
    return 'all';
  })();
  const [phaseFilter, setPhaseFilter] = useState<PhaseFilter>(initialPhase);

  const [officialCards, setOfficialCards] = useState<CardData[]>([]);
  const [officialLoading, setOfficialLoading] = useState(true);
  const allCards = useMemo<CardData[]>(
    () => [...officialCards, ...myCardsForLevel],
    [officialCards, myCardsForLevel],
  );
  const loading = officialLoading && userCards.length === 0;
  // Derive the topic dropdown from the loaded card set itself,
  // not from `getCategoriesByLevel(levelId)`. The latter would
  // return [] for the cross-level queue (levelId = 'all') and
  // would also miss user-added categories. Pulling from allCards
  // covers both cases — the dropdown shows every topic that
  // actually has at least one card in the current pool.
  const allCategories = useMemo(
    () => {
      const set = new Set<string>();
      for (const c of allCards) set.add(c.category);
      return [...set].sort();
    },
    [allCards],
  );
  const [activeCategory, setActiveCategory] = useState<string>(initialTopic);
  const [direction, setDirection] = useState<Direction>(initialDir);

  // Load the official deck for this level on mount / levelId
  // change. The user cards come from the context (see above);
  // the merge is just a concat. For the cross-level queue
  // (levelId = 'all', the default URL) we need every level
  // since the user could be due on B1, C1, and A2 at once.
  useEffect(() => {
    let cancelled = false;
    setOfficialLoading(true);
    const load = async () => {
      const cards =
        levelId === 'all'
          ? Object.values(await preloadAllLevels()).flat()
          : await loadLevel(levelId);
      if (cancelled) return;
      setOfficialCards(cards);
      setOfficialLoading(false);
    };
    void load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [levelId]);

  // Re-apply the URL topic whenever the merged card set changes
  // — the topic may have been valid for the official deck but
  // stop being valid once user cards join, or vice versa.
  useEffect(() => {
    if (loading) return;
    const topicFromUrl = searchParams.get('topic');
    if (topicFromUrl && allCards.some((c) => c.category === topicFromUrl)) {
      if (activeCategory !== topicFromUrl) setActiveCategory(topicFromUrl);
    } else if (activeCategory !== 'all') {
      setActiveCategory('all');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allCards, loading]);

  // Keep the URL in sync with category + direction + phase filter
  // (so it's shareable and a refresh keeps the same view).
  useEffect(() => {
    if (loading) return;
    const currentTopic = searchParams.get('topic') ?? 'all';
    const currentDir = (searchParams.get('dir') as Direction) || 'kk-ru';
    const currentPhase = searchParams.get('phase') ?? 'all';
    if (
      currentTopic !== activeCategory ||
      currentDir !== direction ||
      currentPhase !== phaseFilter
    ) {
      const next = new URLSearchParams(searchParams);
      if (activeCategory === 'all') next.delete('topic');
      else next.set('topic', activeCategory);
      if (direction === 'kk-ru') next.delete('dir');
      else next.set('dir', direction);
      if (phaseFilter === 'all') next.delete('phase');
      else next.set('phase', phaseFilter);
      setSearchParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCategory, direction, phaseFilter, loading]);

  const [mode, setMode] = useState<Mode>('all');

  // Build a fresh queue.
  const buildQueue = useCallback(
    (m: Mode, dir: Direction, prog: typeof progress) => {
      const pool =
        activeCategory === 'all'
          ? allCards
          : allCards.filter((c) => c.category === activeCategory);

      // Sibling bury: drop any card whose reverse direction was
      // already studied in this session. Without this, toggling
      // directions mid-session would surface the same Kazakh
      // word in the opposite direction, which inflates the
      // "learned" count without any real learning.
      const reverseStudied = studiedByDir[reverseDirection(dir)];
      const bury = (c: CardData) => !reverseStudied.has(c.id);

      // Phase filter — only applied in 'all' / 'cram' where the
      // tab itself doesn't constrain the phase. In 'due' / 'new'
      // the tab already implies a phase so applying the chip on
      // top would either be a no-op or contradict the tab. Note
      // that "mastered" isn't an SM-2 phase — it's a derived state
      // based on the review interval crossing the mastering
      // threshold (see `SCHEDULER_DEFAULTS.masteringInterval`).
      const phaseOf = (c: CardData): PhaseFilter => {
        // Progress is unified per card — `dir` is not part of
        // the key. We still pass it in for the helper signature
        // (so other call sites stay uniform) but ignore it.
        const s = prog[makeProgressKey(c.id)];
        if (s == null) return 'new';
        if (s.interval >= SCHEDULER_DEFAULTS.masteringInterval) return 'mastered';
        return s.phase as PhaseFilter;
      };
      const phaseMatch = (c: CardData) =>
        phaseFilter === 'all' || phaseOf(c) === phaseFilter;

      let cards: CardData[];
      if (m === 'cram') {
        // Cram mode: every card in the pool, regardless of
        // progress. The schedule is not updated — the user is
        // just practicing. We do still respect the sibling
        // bury because the user is mid-session.
        cards = pool.filter(bury).filter(phaseMatch);
      } else if (m === 'new') {
        const newPool = pool.filter((c) => {
          const k = makeProgressKey(c.id);
          const s = prog[k];
          return !s || s.phase === 'new';
        });
        // Daily cap: at most `newCardsPerDay - newSeen` brand-new
        // cards. The remainder stays in the pool for tomorrow —
        // the cap is a soft limit on the queue length, not a
        // hard ban on the card.
        const seenToday = daily?.newSeen ?? 0;
        const remaining = Math.max(0, newCardsPerDay - seenToday);
        const shuffled = newPool.filter(bury);
        for (let i = shuffled.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        cards = shuffled.slice(0, remaining);
      } else if (m === 'due') {
        cards = pool.filter((c) => {
          const k = makeProgressKey(c.id);
          const s = prog[k];
          if (!s) return false;
          if (s.phase === 'new') return false;
          return isDue(s);
        }).filter(bury);
      } else {
        // mode === 'all' — the entire pool, optionally narrowed
        // by the phase chip filter.
        cards = pool.filter(bury).filter(phaseMatch);
      }
      for (let i = cards.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [cards[i], cards[j]] = [cards[j], cards[i]];
      }
      return cards;
    },
    // studiedByDir + daily + newCardsPerDay + phaseFilter all
    // factor into the queue, so they belong in the deps. (Otherwise
    // switching direction mid-session would re-use the old queue.)
    [allCards, activeCategory, studiedByDir, daily, newCardsPerDay, phaseFilter],
  );

  // ----- Queue lifecycle -----
  // Two effects instead of one with `[mode, ..., buildQueue]`.
  //
  // The previous single-effect design put `buildQueue` (a
  // useCallback) in the deps, and the result was broken:
  // `buildQueue` depends on `studiedByDir` and `daily`, both
  // of which mutate after every grade. So `buildQueue` got a
  // new reference on every grade, the effect re-fired, and
  // it called `setCurrentIdx(0) + setReviewed(0) +
  // setCorrect(0)` — wiping the per-session state that
  // handleGrade had just set. The user got stuck on the
  // first card (counter always showed "1 из 712 · 0%") while
  // the server-side daily counter advanced normally.
  //
  // Fix: split into two effects, neither of which lists
  // `buildQueue` in its deps. The callback is invoked with
  // fresh state, but the deps only re-fire on user-driven
  // changes.
  //
  // Effect A — session reset. Triggers when the user picks
  // a new mode / category / direction (or the level itself
  // changes shape). Resets the per-session state and
  // rebuilds the queue.
  useEffect(() => {
    const q = buildQueue(mode, direction, progress);
    setQueue(q);
    setCurrentIdx(0);
    setRevealed(false);
    setHasRevealed(false);
    setReviewed(0);
    setCorrect(0);
    setDone(q.length === 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, activeCategory, direction, allCards.length]);

  // Effect B — filter rebuild. Triggers when the user
  // changes a queue-shaping knob that doesn't justify
  // starting a new session — the phase chip ("В изучении"
  // / "На повторе" / "Освоенные" / "Всё") and the daily
  // new-cards cap. Queue is rebuilt, but currentIdx,
  // reviewed, and correct are preserved.
  useEffect(() => {
    setQueue(buildQueue(mode, direction, progress));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phaseFilter, newCardsPerDay]);

  // Cancel any pending undo timer when the page unmounts so we
  // don't try to `setUndo(null)` on a dead component, and so a
  // future visit doesn't think the toast is still alive.
  useEffect(() => {
    return () => {
      if (undoTimer.current) {
        clearTimeout(undoTimer.current);
        undoTimer.current = null;
      }
    };
  }, []);

  const [queue, setQueue] = useState<CardData[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [revealed, setRevealed] = useState(false);
  // Once the user has revealed the current card at least once, the
  // rating row stays visible even if they flip the card back to the
  // front. This way they can flip back to re-read the prompt and
  // still grade without having to re-flip forward first.
  const [hasRevealed, setHasRevealed] = useState(false);
  const [reviewed, setReviewed] = useState(0);
  const [correct, setCorrect] = useState(0);
  const [done, setDone] = useState(false);

  // "Undo last grade" toast. A misclick on Again is a 10-minute
  // cost the user didn't want; a 5s window to take it back is
  // enough to catch fat-finger errors without encouraging
  // grade-shopping. We capture enough state to fully restore the
  // card's position in the queue + the schedule on the server.
  //
  // `prevSchedule` is the `progress[key]` snapshot BEFORE the
  // grade fired — `null` means the card had no schedule (it was
  // brand-new). `prevStudied` is a copy of the per-direction
  // "studied in this session" set BEFORE the grade added this
  // card to it, so we can put the card back into the queue.
  type UndoSnapshot = {
    cardId: string;
    direction: Direction;
    grade: Grade;
    prevSchedule: CardSchedule | null;
    prevIdx: number;
    prevQueue: CardData[];
    prevStudied: Set<string>;
    prevReviewed: number;
    prevCorrect: number;
    // True if the grade branch took the "reinsert 3 cards later"
    // path (Again). Undo needs to put the card back at prevIdx
    // rather than at the now-advanced cursor position.
    wasReinsert: boolean;
  };
  const [undo, setUndo] = useState<UndoSnapshot | null>(null);
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const currentCard = queue[currentIdx];
  const currentState: CardSchedule = currentCard
    ? (progress[makeProgressKey(currentCard.id)] ?? createInitial())
    : createInitial();

  // Toggle the card's flip state. First call reveals and pins the
  // rating row visible (`hasRevealed`); subsequent calls just
  // toggle between front and back without ever hiding the rating
  // Ref onto the Flashcard so we can ask it to auto-play the
  // Kazakh TTS on the first reveal. The handleFlip handler
  // calls this directly inside the click event so the audio
  // is allowed by the browser's autoplay policy (a click is
  // a user gesture; a useEffect fired after the click is not).
  const flashcardRef = useRef<import('../components/Flashcard').FlashcardHandle | null>(null);

  // row again for the current card. This matches Anki's "click the
  // card to flip back" convention.
  //
  // Space / click flips the card but does NOT auto-play
  // audio — the user explicitly said audio should be opt-in
  // (click the speaker), not triggered by every reveal. The
  // speaker button on the card stays the single trigger for
  // playback.
  const handleFlip = useCallback(() => {
    if (!hasRevealed) {
      setRevealed(true);
      setHasRevealed(true);
    } else {
      setRevealed((r) => !r);
    }
  }, [hasRevealed]);

  // Pop the undo toast: cancel any in-flight timer and reset the
  // state. The toast fades out on its own when the timer expires.
  const clearUndo = useCallback(() => {
    if (undoTimer.current) {
      clearTimeout(undoTimer.current);
      undoTimer.current = null;
    }
    setUndo(null);
  }, []);

  const handleGrade = useCallback(
    (gradeKey: Grade) => {
      if (!currentCard) return;
      // Cram mode: log the grade but do NOT update the schedule.
      // The schedule is what the next regular session would build
      // its queue from, so leaving it alone keeps cram purely a
      // "practice" gesture.
      if (mode === 'cram') {
        // No schedule to undo, but the per-session counter
        // advances. We still surface a 5s Undo so the user can
        // take back a "Correct" misclick without inflating the
        // session totals.
        grade(currentCard.id, direction, gradeKey, { isCram: true });
        setRevealed(false);
        setHasRevealed(false);
        if (gradeKey === 'good' || gradeKey === 'easy') setCorrect((c) => c + 1);
        setCurrentIdx((i) => i + 1);
        setReviewed((r) => r + 1);
        setUndo({
          cardId: currentCard.id,
          direction,
          grade: gradeKey,
          prevSchedule: null,
          prevIdx: currentIdx,
          prevQueue: queue,
          prevStudied: new Set(studiedByDir[direction] ?? []),
          prevReviewed: reviewed,
          prevCorrect: correct,
          wasReinsert: false,
        });
        if (undoTimer.current) clearTimeout(undoTimer.current);
        undoTimer.current = setTimeout(() => setUndo(null), 5000);
        return;
      }
      // Snapshot the state BEFORE we touch anything, so the
      // Undo path can put the card back exactly where it was.
      const prevSchedule =
        progress[makeProgressKey(currentCard.id)] ?? null;
      const prevStudied = new Set(studiedByDir[direction] ?? []);
      const prevQueue = queue;
      const prevIdx = currentIdx;
      const prevReviewed = reviewed;
      const prevCorrect = correct;
      const wasReinsert = gradeKey === 'again';
      grade(currentCard.id, direction, gradeKey);
      // Bury the reverse of this card from the queue. We track
      // per direction so a switch in direction doesn't bleed.
      setStudiedByDir((prev) => ({
        ...prev,
        [direction]: new Set(prev[direction]).add(currentCard.id),
      }));
      setRevealed(false);
      setHasRevealed(false);
      if (gradeKey === 'good' || gradeKey === 'easy') setCorrect((c) => c + 1);

      if (wasReinsert) {
        setQueue((q) => {
          const next = [...q];
          const [card] = next.splice(currentIdx, 1);
          const reinsert = Math.min(next.length, currentIdx + 3);
          next.splice(reinsert, 0, card);
          return next;
        });
      } else {
        setCurrentIdx((i) => i + 1);
      }
      setReviewed((r) => r + 1);
      // Show the Undo toast. The 5s window is short enough to
      // discourage gaming (re-rolling a grade to "farm" again
      // cards) but long enough to catch a misclick.
      setUndo({
        cardId: currentCard.id,
        direction,
        grade: gradeKey,
        prevSchedule,
        prevIdx,
        prevQueue,
        prevStudied,
        prevReviewed,
        prevCorrect,
        wasReinsert,
      });
      if (undoTimer.current) clearTimeout(undoTimer.current);
      undoTimer.current = setTimeout(() => setUndo(null), 5000);
      // Refresh the daily counter so the goal ring stays
      // accurate. We don't await — the new cards' counter can
      // update on the same page load.
      void refreshDaily();
    },
    [
      correct,
      currentCard,
      currentIdx,
      direction,
      grade,
      mode,
      progress,
      queue,
      refreshDaily,
      reviewed,
      studiedByDir,
    ],
  );

  // Undo the most recent grade. The snapshot was taken in
  // handleGrade, so we already have everything we need: restore
  // the schedule, put the card back at its previous index, drop
  // the per-session counts, and remove the card from the
  // "studied" set so the queue rebuild (or the existing
  // prevQueue) shows it again.
  const handleUndo = useCallback(async () => {
    if (!undo) return;
    const snap = undo;
    clearUndo();
    // 1. Restore the card's schedule (server + progress context).
    //    Cram-mode undo has no schedule to roll back, so we
    //    only do this for non-cram grades.
    if (snap.prevSchedule !== null) {
      // Card had a schedule before. PUT the old state back.
      await gradeUndo(snap.cardId, snap.direction, snap.prevSchedule as never);
    } else if (!snap.wasReinsert) {
      // Card was brand-new (no schedule) AND the grade was a
      // forward advance (Good/Hard/Easy) — wipe the freshly
      // created schedule row on the server.
      await gradeUndo(snap.cardId, snap.direction, null);
    }
    // If the card was brand-new and graded Again, the schedule
    // row was just created and is still effectively initial; we
    // leave it alone because the user is going to see the card
    // again in 3 slots anyway. Removing it would only create
    // visual churn.
    // 2. Restore the queue: the "again" branch reordered the
    //    queue, the "non-again" branch advanced the cursor. We
    //    put the queue back to its previous shape (so any
    //    reinserted cards go back to their original spots) and
    //    rewind the cursor.
    setQueue(snap.prevQueue);
    setCurrentIdx(snap.prevIdx);
    // 3. Drop the card from the per-direction "studied" set so a
    //    future rebuild includes it again.
    setStudiedByDir((prev) => ({
      ...prev,
      [snap.direction]: new Set(
        [...(prev[snap.direction] ?? [])].filter((id) => id !== snap.cardId),
      ),
    }));
    // 4. Rewind the per-session counters so the user can re-grade
    //    the card fresh. The server's daily counter does NOT
    //    move back (we don't expose DELETE /review/:id) — that's
    //    fine, the daily goal is a soft target.
    setReviewed(snap.prevReviewed);
    setCorrect(snap.prevCorrect);
    setRevealed(false);
    setHasRevealed(false);
  }, [undo, clearUndo, gradeUndo]);

  useEffect(() => {
    if (queue.length > 0 && currentIdx >= queue.length) {
      setDone(true);
    }
  }, [queue.length, currentIdx]);

  // Keyboard shortcuts
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (done) return;
      // Space/Enter toggles the card flip (front ↔ back). The
      // first call reveals; subsequent calls flip back to the
      // prompt without losing the rating row. 1/2/3/4 always
      // grade, regardless of which side is currently visible.
      if (e.key === ' ' || e.key === 'Enter') {
        const tag = (e.target as HTMLElement | null)?.tagName;
        // Don't hijack space/enter from text inputs (search,
        // email fields, etc.) — they're rare on this page but
        // the guard is cheap.
        if (tag === 'INPUT' || tag === 'TEXTAREA') return;
        e.preventDefault();
        handleFlip();
        return;
      }
      if (hasRevealed) {
        if (e.key === '1') handleGrade('again');
        else if (e.key === '2') handleGrade('hard');
        else if (e.key === '3') handleGrade('good');
        else if (e.key === '4') handleGrade('easy');
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [hasRevealed, handleGrade, handleFlip, done]);

  // Per-category card count — shown next to each topic in the
  // dropdown so the user can see the size of each topic at a
  // glance. Computed once per level load (it doesn't depend on
  // progress or direction), so we don't need to put it in a
  // heavy useMemo.
  const categoryCounts = useMemo(() => {
    const m: Record<string, number> = {};
    for (const c of allCards) {
      m[c.category] = (m[c.category] ?? 0) + 1;
    }
    return m;
  }, [allCards]);

  // Counts for tabs (respect category filter + direction). The
  // phase split (`byPhase`) is what powers the phase filter chips
  // below the topic dropdown in `mode='all'` / `mode='cram'`.
  const counts = useMemo(() => {
    const pool =
      activeCategory === 'all'
        ? allCards
        : allCards.filter((c) => c.category === activeCategory);
    const total = pool.length;
    const newC = pool.filter((c) => {
      const s = progress[makeProgressKey(c.id)];
      return !s || s.phase === 'new';
    }).length;
    const dueC = pool.filter((c) => {
      const s = progress[makeProgressKey(c.id)];
      if (!s) return false;
      if (s.phase === 'new') return false;
      return isDue(s);
    }).length;
    const learningC = pool.filter((c) => {
      const s = progress[makeProgressKey(c.id)];
      return s?.phase === 'learning';
    }).length;
    const reviewC = pool.filter((c) => {
      const s = progress[makeProgressKey(c.id)];
      return s?.phase === 'review';
    }).length;
    const masteredC = pool.filter((c) => {
      const s = progress[makeProgressKey(c.id)];
      // A card is "mastered" once its review interval has grown past
      // the mastering threshold. Same definition the Stats page
      // uses for the "Освоено" KPI. Cards that have never been
      // reviewed are NOT mastered even if they're old.
      return s != null && s.interval >= SCHEDULER_DEFAULTS.masteringInterval;
    }).length;
    return {
      total,
      new: newC,
      due: dueC,
      learning: learningC,
      review: reviewC,
      mastered: masteredC,
    };
  }, [allCards, activeCategory, direction, progress]);

  // Leech count: cards with 8+ lapses in either direction,
  // deduplicated to one per card. Same definition the server
  // uses in /api/stats. We compute it client-side so the banner
  // can render without a round trip.
  const leechCount = useMemo(() => {
    const cardIds = new Set<string>();
    for (const [key, s] of Object.entries(progress)) {
      if (typeof s.lapses === 'number' && s.lapses >= SCHEDULER_DEFAULTS.leechThreshold) {
        const sep = key.lastIndexOf('::');
        if (sep > 0) cardIds.add(key.slice(0, sep));
      }
    }
    return cardIds.size;
  }, [progress]);

  const GRADE_INFO: Array<{
    key: Grade;
    label: string;
    shortcut: string;
  }> = useMemo(
    () => [
      { key: 'again', label: t('study.again'), shortcut: '1' },
      { key: 'hard', label: t('study.hard'), shortcut: '2' },
      { key: 'good', label: t('study.good'), shortcut: '3' },
      { key: 'easy', label: t('study.easy'), shortcut: '4' },
    ],
    [t],
  );

  // Next level with due cards — only computed when the done
  // screen actually renders, so the cost (5 dynamic imports on
  // a cold cache) is paid at most once per session. We return
  // `null` while the loads are still in flight so the done
  // screen can show a "looking for the next level…" state
  // rather than flashing in an empty answer.
  const [nextLevel, setNextLevel] = useState<{
    id: string;
    name: string;
    count: number;
  } | null>(null);
  const [nextLevelLoading, setNextLevelLoading] = useState(false);
  useEffect(() => {
    if (!done) {
      setNextLevel(null);
      return;
    }
    let cancelled = false;
    setNextLevelLoading(true);
    void (async () => {
      const map = await preloadAllLevels();
      if (cancelled) return;
      // Find the first level (in LEVELS order, so a1 → a2 → b1 …)
      // other than the current one that has at least one due
      // card. "Due" means the same thing as the due-mode queue
      // — scheduled, not in 'new' phase, due timestamp <= now.
      const now = Date.now();
      let best: { id: string; name: string; count: number } | null = null;
      for (const lvl of LEVELS) {
        if (lvl.id === levelId) continue;
        const cards = map[lvl.id] ?? [];
        let count = 0;
        for (const c of cards) {
          const s = progress[makeProgressKey(c.id)];
          if (!s || s.phase === 'new') continue;
          // `due` is stored as an ISO string; parse + compare.
          if (new Date(s.due).getTime() <= now) count++;
        }
        if (count > 0) {
          best = { id: lvl.id, name: lvl.name, count };
          break;
        }
      }
      if (cancelled) return;
      setNextLevel(best);
      setNextLevelLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [done, levelId, progress]);

  if (done) {
    const accuracy = reviewed > 0 ? Math.round((correct / reviewed) * 100) : 0;
    const suggestNew = reviewed === 0 && mode === 'due' && counts.new > 0;
    return (
      <div className={styles.doneWrap}>
        <div className={styles.doneCard}>
          <div className={styles.doneIcon}>
            <Sparkles size={36} strokeWidth={1.4} />
          </div>
          <h1 className={styles.doneTitle}>
            {reviewed === 0
              ? t('study.empty.title')
              : accuracy >= 80
                ? t('study.empty.titleDoneGreat')
                : t('study.empty.titleDone')}
          </h1>
          <p className={styles.doneSub}>
            {reviewed === 0
              ? counts.new > 0
                ? <>{t('study.empty.suggestNew', { count: counts.new, tab: t('study.tab.new') })}</>
                : t('study.empty.comeBack')
              : t('study.empty.summary', { count: reviewed, accuracy })}
          </p>
          <div className={styles.doneActions}>
            <Link to="/" className="btn btn--ghost">
              {t('study.empty.back')}
            </Link>
            {/* "All due" — only meaningful on a specific level.
                On the cross-level queue (/study) the user is
                already at the broadest scope, so the link would
                just refresh the same page. */}
            {levelId !== 'all' ? (
              <Link to="/study" className="btn btn--ghost">
                {t('study.empty.allDue')}
                <ArrowRight size={14} />
              </Link>
            ) : null}
            {/* "Next level" — only when some other level has
                at least one due card AND we've finished computing
                the per-level scan. Empty/null means the user has
                truly caught up across all levels (or we're still
                loading on a cold cache). */}
            {nextLevel ? (
              <Link
                to={`/study/level/${nextLevel.id}`}
                className="btn"
              >
                {t('study.empty.nextLevel', { level: nextLevel.name, count: nextLevel.count })}
                <ArrowRight size={14} />
              </Link>
            ) : null}
            {suggestNew ? (
              <button
                type="button"
                className="btn"
                onClick={() => setMode('new')}
              >
                {t('study.empty.switchNew')}
                <ArrowRight size={14} />
              </button>
            ) : (
              <button
                type="button"
                className="btn"
                onClick={() => {
                  setDone(false);
                  setCurrentIdx(0);
                  setReviewed(0);
                  setCorrect(0);
                  setQueue(buildQueue(mode, direction, progress));
                }}
              >
                {t('study.empty.studyAgain')}
                <ArrowRight size={14} />
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className={styles.empty}>
        <p className="muted">{t('error.loading')}</p>
      </div>
    );
  }

  if (!currentCard) {
    return (
      <div className={styles.empty}>
        <p>{t('error.noCards')}</p>
        <button className="btn" onClick={() => navigate('/')}>
          {t('error.back')}
        </button>
      </div>
    );
  }

  return (
    <div className={styles.study}>
      <div className={styles.studyColumn}>
        <header className={styles.studyHeader}>
          <div className={styles.studyHeaderLeft}>
            <Link to="/" className={styles.backLink}>
              <ArrowLeft size={14} />
              {t('study.back')}
            </Link>
            {/* Level switcher. The previous design had a static
                "A1" / "A2" heading here — the user could only
                change level by going home and picking a new card.
                A row of pills mirrors Anki's deck switcher:
                one tap moves between levels (and the cross-level
                "Все" queue) without leaving the page. The current
                level is filled in the accent colour, the others
                are bordered so they read as actionable. */}
            <div className={styles.levelSwitcher} role="tablist" aria-label={t('study.allLevels')}>
              <NavLink
                to="/study"
                end
                className={({ isActive }) =>
                  `${styles.levelPill} ${isActive ? styles.levelPillActive : ''}`
                }
                title={t('study.allLevels')}
              >
                {t('study.allLevels')}
              </NavLink>
              {LEVELS.map((lvl) => (
                <NavLink
                  key={lvl.id}
                  to={`/study/level/${lvl.id}`}
                  className={({ isActive }) =>
                    `${styles.levelPill} ${isActive ? styles.levelPillActive : ''}`
                  }
                  title={lvl.name}
                >
                  {lvl.name}
                </NavLink>
              ))}
            </div>
          </div>
          {/*
            One flat selection panel — a single row of mutually
            exclusive chips that covers BOTH the old mode tabs
            (Повтор / Новые / Все / Повторить всё) and the old
            phase filter (Все / Новые / В изучении / На повторе /
            Освоенные), deduped.

            The previous design had two stacked rows inside one
            card — that still read as two tiers, and the two rows
            shared "Все 712" and "Новые 659" labels that looked
            like the same widget twice. The new layout is a single
            tier: the user picks one option, and the queue adapts
            (mode + phase + cram are all driven from this one
            selection).

            Mapping (each chip's onClick):
              Повтор         → mode='due'
              Новые          → mode='new'  (with the daily cap)
              В изучении     → mode='all'  + phaseFilter='learning'
              На повторе     → mode='all'  + phaseFilter='review'
              Освоенные      → mode='all'  + phaseFilter='mastered'
              Всё            → mode='all'  + phaseFilter='all'
              Повторить всё  → mode='cram' (force all, no schedule)

            The "active" state for each chip is derived from the
            underlying (mode, phaseFilter) pair — see the
            `activeFor` mapping in the QueueChips block below.
          */}
        </header>

        {/*
          Three centered pickers stacked vertically: Карточки /
          Язык / Тема. Same controls, but laid out as three
          labelled rows instead of one bordered panel +
          free-floating pills. Easier to scan and matches
          the rest of the form-style controls in the app.
        */}
        <div className={styles.pickerStack}>
          <div className={styles.pickerRow}>
            <span className={styles.pickerLabel}>{t('study.picker.cards')}</span>
            <div className={styles.pickerControl}>
              {(() => {
                // Encode the (mode, phaseFilter) pair as a single
                // string so the PickerSelect can use one `value` +
                // one `onChange`. Same seven options the previous
                // chip row had, with per-option counts.
                const cardsValue = mode === 'cram' ? 'cram' : `${mode}/${phaseFilter}`;
                const cardsOptions: PickerOption[] = [
                  { value: 'due/all', label: t('study.tab.due'), count: counts.due },
                  { value: 'new/all', label: t('study.tab.new'), count: counts.new },
                  { value: 'all/learning', label: t('study.phase.learning'), count: counts.learning },
                  { value: 'all/review', label: t('study.phase.review'), count: counts.review },
                  { value: 'all/mastered', label: t('study.phase.mastered'), count: counts.mastered },
                  { value: 'all/all', label: t('study.tab.all'), count: counts.total },
                  { value: 'cram', label: t('study.tab.cram'), count: counts.total },
                ];
                return (
                  <PickerSelect
                    value={cardsValue}
                    options={cardsOptions}
                    fullWidth
                    onChange={(v) => {
                      if (v === 'cram') {
                        setMode('cram');
                        if (phaseFilter !== 'all') setPhaseFilter('all');
                        return;
                      }
                      const [m, p] = v.split('/') as ['due' | 'new' | 'all', 'all' | 'learning' | 'review' | 'mastered'];
                      setMode(m);
                      setPhaseFilter(p);
                    }}
                  />
                );
              })()}
            </div>
          </div>

          <div
            className={styles.pickerRow}
            role="group"
            aria-label={t('study.direction.label')}
          >
            <span className={styles.pickerLabel}>{t('study.picker.language')}</span>
            <div className={styles.pickerControl}>
              <PickerSelect
                value={direction}
                options={[
                  { value: 'kk-ru', label: t('study.direction.kkRu') },
                  { value: 'ru-kk', label: t('study.direction.ruKk') },
                ]}
                fullWidth
                onChange={(v) => setDirection(v as Direction)}
              />
            </div>
          </div>

          {allCategories.length > 0 ? (
            <div className={styles.pickerRow}>
              <span className={styles.pickerLabel}>{t('study.picker.topic')}</span>
              <div className={styles.pickerControl}>
                <TopicSelect
                  current={currentCard?.category ?? 'all'}
                  options={allCategories}
                  activeTopic={activeCategory}
                  onTopicChange={setActiveCategory}
                  onClear={() => setActiveCategory('all')}
                  counts={categoryCounts}
                  totalCount={allCards.length}
                  fullWidth
                />
              </div>
            </div>
          ) : null}
        </div>

        <div className={styles.progressBar}>
          <div
            className={styles.progressFill}
            style={{
              width: `${queue.length > 0 ? (currentIdx / queue.length) * 100 : 0}%`,
            }}
          />
        </div>

        {/* Leech notice (no daily goal ring — the user asked to
            drop it). The notice fires once when the user has at
            least one leech and they haven't dismissed it yet. */}
        <div className={styles.metaBar}>
          {user && !user.preferences?.leechNoticeDismissed && leechCount > 0 ? (
            <LeechNotice
              t={t}
              onDismiss={async () => {
                await api.preferences.set({ leechNoticeDismissed: true });
                // The auth context will re-fetch the user on the
                // next /me call; for instant UI feedback we just
                // rely on the next mount.
              }}
            />
          ) : null}
        </div>

        <div className={styles.cardWrap}>
          <Flashcard
            ref={flashcardRef}
            card={currentCard}
            revealed={revealed}
            hasRevealed={hasRevealed}
            phase={currentState.phase}
            direction={direction}
            onFlip={handleFlip}
          />
        </div>

        {!hasRevealed ? (
          <button
            type="button"
            className={`btn btn--lg ${styles.showAnswerBtn}`}
            onClick={handleFlip}
          >
            {t('study.showAnswer')}
            <span className={styles.shortcut}>{t('study.shortcut.space')}</span>
          </button>
        ) : (
          <div
            className={styles.ratingRow}
            role="group"
            aria-label={t('study.ratingAria')}
          >
            {GRADE_INFO.map(({ key, label, shortcut }) => (
              <button
                key={key}
                type="button"
                className={styles.ratingBtn}
                onClick={() => handleGrade(key)}
                aria-label={t('card.aria.interval', {
                  label,
                  interval: nextIntervalLabel(currentState, key, undefined, lang),
                })}
              >
                <span className={styles.ratingShortcut}>{shortcut}</span>
                <span className={styles.ratingLabel}>{label}</span>
              </button>
            ))}
          </div>
        )}

        <div className={styles.metaRow}>
          {/* Card-counter chip. The previous version showed a tiny
              "N из M" line in muted grey that the eye skipped over;
              the user had to count their own progress. Bumping it
              to a pill with a percentage gives an honest "where am
              I in the session" signal that tracks the progress bar
              above. */}
          <span
            className={styles.counterPill}
            data-testid="study-counter"
          >
            {t('study.counter', { pos: currentIdx + 1, total: queue.length })}
          </span>
        </div>
      </div>

      {/* Undo toast — pinned to the bottom of the study column so
          it doesn't fight the rating row for the user's attention.
          Shows for 5s after every grade; clicking the button rolls
          the grade back (schedule + queue position + session
          counters). Auto-dismisses when the timer fires. We only
          render when an undo is actually pending, so the toast
          isn't taking up layout space between grades. */}
      {undo ? (
        <div className={styles.undoToast} role="status" aria-live="polite">
          <span className={styles.undoLabel}>{t('study.undo.toast')}</span>
          <button
            type="button"
            className={styles.undoBtn}
            onClick={() => void handleUndo()}
            data-testid="undo-last-grade"
          >
            {t('study.undo.button')}
          </button>
        </div>
      ) : null}
    </div>
  );
}


/**
 * One chip in the unified queue-selector panel. All seven
 * options (Повтор / Новые / В изучении / На повторе /
 * Освоенные / Всё / Повторить всё) share this same shape and
 * the same active style — that's the point of flattening
 * the previous two-tier design into one row.
 */
function QueueChip({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      className={`${styles.queueChip} ${active ? styles.queueChipActive : ''}`}
      onClick={onClick}
    >
      {label}
      <span className={styles.queueChipCount}>{count}</span>
    </button>
  );
}


/**
 * Banner shown above the card when the user has at least one
 * leech. We don't block study — the user is in the middle of a
 * session. The "Сбросить" button does the leech-reset gesture
 * (wipe progress, the card comes back as 'new'). Dismiss
 * sets a one-time flag in preferences so the banner doesn't
 * return next time the user has a leech.
 */
function LeechNotice({
  t,
  onDismiss,
}: {
  t: (k: string, vars?: Record<string, string | number>) => string;
  onDismiss: () => void;
}) {
  return (
    <div className={styles.leechNotice} role="status">
      <span className={styles.leechText}>
        {t('study.leech.banner')}
      </span>
      <button
        type="button"
        className={styles.leechDismiss}
        onClick={onDismiss}
        aria-label={t('study.leech.dismiss')}
      >
        ×
      </button>
    </div>
  );
}
