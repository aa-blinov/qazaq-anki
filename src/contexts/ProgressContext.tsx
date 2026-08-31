import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { api, type CardState, type Direction, type Grade } from '../lib/api';
import { makeProgressKey, type ProgressMap, type ReviewEvent, type ReviewLog } from '../lib/progress';
import { createInitial, review, type CardSchedule } from '../lib/sm2';
import { useAuth } from './AuthContext';

interface ProgressContextValue {
  progress: ProgressMap;
  totalReviews: number;
  totalCorrect: number;
  totalLapses: number;
  reviewLog: ReviewLog;
  loading: boolean;
  grade: (cardId: string, direction: Direction, g: Grade, opts?: { isCram?: boolean }) => void;
  /**
   * Undo a single grade: rewind the card's schedule to `prevState`
   * (or wipe it entirely if `prevState` is `null`) and drop the last
   * matching entry from the in-memory review log. Server-side, the
   * `progress` row is PUT back to `prevState` (or DELETEd if it
   * didn't exist before) — the `review` event log itself is NOT
   * touched on the server, so the server-side counter and history
   * stay intact even if the user re-grades. The UI just pretends
   * the undo happened; the next full refresh will re-merge the
   * difference.
   */
  gradeUndo: (
    cardId: string,
    direction: Direction,
    prevState: CardState | null,
  ) => Promise<void>;
  reset: () => Promise<void>;
}

const ProgressContext = createContext<ProgressContextValue | null>(null);

export function ProgressProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [progress, setProgressState] = useState<ProgressMap>({});
  const [reviewLog, setReviewLog] = useState<ReviewLog>([]);
  const [loading, setLoading] = useState(false);

  // On user change: pull progress + log from the server. The server
  // is the source of truth now — there's no localStorage mirror to
  // keep in sync.
  useEffect(() => {
    let cancelled = false;
    if (!user) {
      setProgressState({});
      setReviewLog([]);
      setLoading(false);
      return () => {
        cancelled = true;
      };
    }
    setLoading(true);
    (async () => {
      try {
        const [{ progress: serverProgress }, { events }] = await Promise.all([
          api.progress.list(),
          api.review.list(),
        ]);
        if (cancelled) return;
        setProgressState(serverProgress ?? {});
        setReviewLog(events ?? []);
      } catch (err) {
        // If the token is gone / 401, AuthContext will flip the
        // user back to null on its next render and this effect
        // re-runs with an empty state. Nothing to do here.
        // eslint-disable-next-line no-console
        console.warn('[progress] load failed:', err);
        if (!cancelled) {
          setProgressState({});
          setReviewLog([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  const grade = useCallback(
    (cardId: string, direction: Direction, g: Grade, opts: { isCram?: boolean } = {}) => {
      if (!user) return;
      const ts = new Date().toISOString();
      if (opts.isCram) {
        // Cram mode: log the event so it shows up in retention
        // charts and the activity feed, but do NOT touch the
        // schedule (this is a "practice" review, not a graded
        // one). The server also skips its daily-counter bump when
        // it sees isCram.
        const event: ReviewEvent = { ts, cardId, direction, grade: g };
        setReviewLog((log) => [...log, event]);
        void api.review.log(cardId, direction, g, { ts, isCram: true }).catch((err) => {
          // eslint-disable-next-line no-console
          console.warn('[progress] POST /review (cram) failed:', err);
        });
        return;
      }
      // Progress is unified per card. The `direction` argument is
      // preserved for the review log + activity feed, but the
      // schedule lives under just `cardId`. Grading in kk-ru
      // advances the same interval as grading in ru-kk.
      const key = makeProgressKey(cardId);
      const current: CardSchedule = progress[key] ?? createInitial();
      const next: CardSchedule = review(current, g, cardId);
      // Optimistic update — UI flips immediately, the server is
      // told in the background. If the network call fails we
      // surface a console warning; the next mount will pull the
      // canonical state back from the server anyway.
      setProgressState((p) => ({ ...p, [key]: next }));
      const lastReview = next.lastReview ?? ts;
      const event: ReviewEvent = { ts: lastReview, cardId, direction, grade: g };
      setReviewLog((log) => [...log, event]);
      void api.progress.set(cardId, direction, next as CardState).catch((err) => {
        // eslint-disable-next-line no-console
        console.warn('[progress] PUT failed:', err);
      });
      void api.review.log(cardId, direction, g, { ts: lastReview }).catch((err) => {
        // eslint-disable-next-line no-console
        console.warn('[progress] POST /review failed:', err);
      });
    },
    [user, progress],
  );

  const reset = useCallback(async () => {
    if (!user) return;
    try {
      await api.reset();
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('[progress] reset failed:', err);
      return;
    }
    setProgressState({});
    setReviewLog([]);
  }, [user]);

  // Rewind the schedule for a single card and drop the matching
  // event from the in-memory log. Used by the "Undo" toast on the
  // Study page so a misclick on Again / Hard doesn't lock the
  // user into a longer interval than they wanted.
  //
  // Server side, we PUT the previous state (or DELETE if the
  // card had no schedule before). The `review` event log on the
  // server is intentionally NOT trimmed — the server counts
  // should stay honest even if the UI rolls a grade back. The
  // client-side mirror (`reviewLog`) does drop the last event so
  // the session counter agrees with the schedule until the next
  // full refresh.
  const gradeUndo = useCallback(
    async (cardId: string, direction: Direction, prevState: CardState | null) => {
      if (!user) return;
      const key = makeProgressKey(cardId);
      setProgressState((p) => {
        if (prevState === null) {
          if (!(key in p)) return p;
          const next = { ...p };
          delete next[key];
          return next;
        }
        return { ...p, [key]: prevState };
      });
      // Drop the most recent matching event from the in-memory log.
      // We match by `cardId` + `grade direction` rather than ts
      // because the in-memory ts is what we wrote, while the
      // server may have back-dated slightly.
      setReviewLog((log) => {
        for (let i = log.length - 1; i >= 0; i--) {
          if (log[i].cardId === cardId && log[i].direction === direction) {
            const next = log.slice();
            next.splice(i, 1);
            return next;
          }
        }
        return log;
      });
      try {
        if (prevState === null) {
          await api.progress.reset(cardId, direction);
        } else {
          await api.progress.set(cardId, direction, prevState);
        }
      } catch (err) {
        // The optimistic local state is already correct; the next
        // mount will reconcile from the server.
        // eslint-disable-next-line no-console
        console.warn('[progress] gradeUndo server sync failed:', err);
      }
    },
    [user],
  );

  const value = useMemo<ProgressContextValue>(() => {
    const totalReviews = Object.values(progress).reduce(
      (acc, s) => acc + (s.reviews ?? 0),
      0,
    );
    const totalCorrect = Object.values(progress).reduce(
      (acc, s) => acc + (s.correct ?? 0),
      0,
    );
    const totalLapses = Object.values(progress).reduce(
      (acc, s) => acc + (s.lapses ?? 0),
      0,
    );
    return {
      progress,
      totalReviews,
      totalCorrect,
      totalLapses,
      reviewLog,
      loading,
      grade,
      gradeUndo,
      reset,
    };
  }, [progress, grade, gradeUndo, reset, reviewLog, loading]);

  return <ProgressContext.Provider value={value}>{children}</ProgressContext.Provider>;
}

export function useProgress(): ProgressContextValue {
  const ctx = useContext(ProgressContext);
  if (!ctx) throw new Error('useProgress must be used inside <ProgressProvider>');
  return ctx;
}
