/**
 * Onboarding "have I seen this tour yet?" state.
 *
 * Why a context (and not just a hook that fetches on demand):
 *  - The first paint of every page consults the seen flag, so we
 *    want the value in memory *before* the first navigation.
 *  - Auth boot already calls `/api/me`, and `/api/me` includes
 *    `onboardingSeen` — so the data is here for free, with no
 *    extra round-trip.
 *  - Marking a screen as seen is a server write that should
 *    optimistically update local state so the modal closes
 *    immediately. A hook scattered across components would force
 *    a refetch; a context gives us a single place to mutate.
 *
 * The state survives across mounts because it lives on the user
 * record itself (loaded by AuthContext on every boot). We also
 * keep a local mirror so we can update it without a round-trip
 * after a `markSeen` call.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useAuth } from './AuthContext';
import { api } from '../lib/api';

/** Same set as `OnboardingModal`'s `TourScreen` and the server's
 *  `ONBOARDING_SCREENS`. Keep the three in lock-step. */
export type TourScreen = 'study' | 'browse' | 'stats';

export const TOUR_SCREENS: readonly TourScreen[] = ['study', 'browse', 'stats'];

interface OnboardingContextValue {
  /** Per-screen seen timestamps (ISO strings). Empty until the
   *  auth boot has populated `user.onboardingSeen`. */
  seen: Record<string, string>;
  /** `true` once the seen map has been hydrated from the server
   *  (or from a never-logged-in state). The modal uses this to
   *  avoid flashing open for a returning user whose flag is
   *  still being fetched. */
  hydrated: boolean;
  /** Server-side check — has the user already seen the tour for
   *  this screen? `false` while `hydrated` is `false` (no
   *  decision yet) AND while the server says "no, show it". */
  isSeen: (screen: TourScreen) => boolean;
  /** Mark a screen as seen. Updates the local mirror immediately
   *  (so the modal closes without waiting for the network) and
   *  fires a server POST in the background. The promise resolves
   *  with the server's view; on failure the local mirror stays
   *  as-is so the UI is consistent, and we log the error. */
  markSeen: (screen: TourScreen) => Promise<void>;
  /** Force a fresh fetch from the server. Used by AuthContext on
   *  login/logout to keep this context in sync with the user
   *  record, and by the (i) button if it wants to be sure. */
  refresh: () => Promise<void>;
}

const OnboardingContext = createContext<OnboardingContextValue | null>(null);

export function OnboardingProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  // The seen map. Initial value comes from the user record
  // (loaded by AuthContext on boot via `/api/me`), so a returning
  // user sees the right answer on the very first render — no
  // "tour flashes open then closes" race.
  const [seen, setSeen] = useState<Record<string, string>>(
    () => (user?.onboardingSeen as Record<string, string> | undefined) ?? {},
  );
  // `hydrated` is `true` only once we've copied the user's
  // `onboardingSeen` into local state (or pulled it from the
  // dedicated `/onboarding` endpoint). Until then, `isSeen`
  // returns `true` so the modal never opens mid-load — this is
  // the fix for the "tour flashes open then closes" race that
  // the previous blob-based design suffered from. We start
  // `false` regardless of whether `user` is null because the
  // effect below is the one that decides we're done, and the
  // logged-out case is handled by `isSeen` short-circuiting on
  // `!user` anyway.
  const [hydrated, setHydrated] = useState<boolean>(false);
  // Tracks the last user id we synced from. Without this, a
  // logout → login would keep the old user's seen map (stale
  // memory) until the next navigation triggered a refresh.
  const lastSyncedUserId = useRef<string | null>(user?.id ?? null);

  // Whenever the auth identity changes (login / logout / account
  // switch), pull the seen map for the new identity. We pull from
  // the user record first (free) and fall back to a dedicated
  // `GET /onboarding` round-trip only if the record somehow
  // doesn't have the field (older server, test fixtures, etc.).
  useEffect(() => {
    const id = user?.id ?? null;
    if (id === lastSyncedUserId.current) return;
    lastSyncedUserId.current = id;
    if (!user) {
      setSeen({});
      setHydrated(true);
      return;
    }
    const fromRecord = (user.onboardingSeen as Record<string, string> | undefined) ?? null;
    if (fromRecord) {
      setSeen(fromRecord);
      setHydrated(true);
    } else {
      // Defensive: pull a fresh copy. The /onboarding endpoint
      // is cheap and idempotent.
      (async () => {
        try {
          const { seen: fresh } = await api.onboarding.get();
          setSeen(fresh);
        } catch {
          // Network down: assume nothing seen, let the modal show
          // (the worst case is the user sees the tour once more,
          // which is the safe default).
          setSeen({});
        } finally {
          setHydrated(true);
        }
      })();
    }
  }, [user]);

  // Pull-on-mount once, even if the user record already had a
  // value. This covers the "log in on a new device" case where
  // the local cache is empty but the server has the truth.
  const refresh = useCallback(async () => {
    if (!user) {
      setSeen({});
      setHydrated(true);
      return;
    }
    try {
      const { seen: fresh } = await api.onboarding.get();
      setSeen(fresh);
    } catch {
      // Leave `seen` as-is on failure — better to under-show the
      // tour than to make a returning user see it again.
    } finally {
      setHydrated(true);
    }
  }, [user]);

  const markSeen = useCallback(
    async (screen: TourScreen) => {
      if (!user) return;
      // Optimistic local update — the modal closes right away,
      // and a future navigation re-fetch will reconcile with the
      // server. We keep the ISO timestamp as the value (rather
      // than `true`) so the field is self-describing and we can
      // show "seen 3 days ago" later if we want to.
      const ts = new Date().toISOString();
      setSeen((prev) => ({ ...prev, [screen]: ts }));
      try {
        const { seen: server } = await api.onboarding.markSeen(screen);
        // Trust the server's view (it may have stripped unknown
        // screens, or rolled the timestamp format).
        setSeen(server);
      } catch {
        // Network down — our local write is still correct for
        // the current session. A later `refresh()` will
        // reconcile if the server has a different value.
      }
    },
    [user],
  );

  const isSeen = useCallback(
    (screen: TourScreen) => {
      // Three states, in priority order:
      //   1. Logged out → never show a tour (it'd be a broken UX
      //      anyway since the user is on the login screen).
      //   2. Logged in but NOT hydrated → treat as "seen", i.e.
      //      DO NOT show the tour yet. Showing it before the
      //      server tells us the user has already seen it would
      //      cause the "flash open then close" race.
      //   3. Logged in AND hydrated → trust the local map.
      if (!user) return true;
      if (!hydrated) return true;
      return typeof seen[screen] === 'string';
    },
    [user, hydrated, seen],
  );

  const value = useMemo<OnboardingContextValue>(
    () => ({ seen, hydrated, isSeen, markSeen, refresh }),
    [seen, hydrated, isSeen, markSeen, refresh],
  );

  return (
    <OnboardingContext.Provider value={value}>
      {children}
    </OnboardingContext.Provider>
  );
}

export function useOnboarding(): OnboardingContextValue {
  const ctx = useContext(OnboardingContext);
  if (!ctx) {
    throw new Error(
      'useOnboarding must be used inside <OnboardingProvider>. ' +
        'Wrap the app root in the provider (see App.tsx).',
    );
  }
  return ctx;
}
