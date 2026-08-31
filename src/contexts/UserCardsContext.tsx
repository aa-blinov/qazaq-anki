import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { api, type Level, type NewCardInput, type UserCard } from '../lib/api';
import { useAuth } from './AuthContext';

interface UserCardsContextValue {
  /** All cards the current user has created. Empty for anonymous visitors. */
  cards: UserCard[];
  loading: boolean;
  /** Add a new card. Throws on validation error from the server. */
  create: (input: NewCardInput) => Promise<UserCard>;
  /** Edit one of the user's cards. */
  update: (id: string, input: Partial<NewCardInput>) => Promise<UserCard>;
  /** Delete one of the user's cards. */
  remove: (id: string) => Promise<void>;
  /** Subset of `cards` matching a level. Used by StudyPage to merge
   *  the user's additions with the official level JSON. */
  byLevel: (level: Level) => UserCard[];
  /** Re-fetch the user's library from the server. Used after a
   *  bulk operation (e.g. an `.apkg` import) so the in-memory
   *  state matches what's now in the DB. */
  refresh: () => Promise<void>;
}

const UserCardsContext = createContext<UserCardsContextValue | null>(null);

export function UserCardsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [cards, setCards] = useState<UserCard[]>([]);
  const [loading, setLoading] = useState(false);

  // On user change: pull the user's library from the server. There
  // is no local mirror — the server is the source of truth, so we
  // always start with an empty array and let `useEffect` populate.
  useEffect(() => {
    let cancelled = false;
    if (!user) {
      setCards([]);
      setLoading(false);
      return () => {
        cancelled = true;
      };
    }
    setLoading(true);
    (async () => {
      try {
        const { cards: serverCards } = await api.cards.list();
        if (cancelled) return;
        setCards(serverCards ?? []);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn('[userCards] load failed:', err);
        if (!cancelled) setCards([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  const create = useCallback(
    async (input: NewCardInput): Promise<UserCard> => {
      const { card } = await api.cards.create(input);
      setCards((prev) => [card, ...prev]);
      return card;
    },
    [],
  );

  const update = useCallback(
    async (id: string, input: Partial<NewCardInput>): Promise<UserCard> => {
      const { card } = await api.cards.update(id, input);
      setCards((prev) => prev.map((c) => (c.id === id ? card : c)));
      return card;
    },
    [],
  );

  const remove = useCallback(async (id: string): Promise<void> => {
    await api.cards.delete(id);
    setCards((prev) => prev.filter((c) => c.id !== id));
  }, []);

  const byLevel = useCallback(
    (level: Level) => cards.filter((c) => c.level === level),
    [cards],
  );

  const refresh = useCallback(async (): Promise<void> => {
    if (!user) return;
    try {
      const { cards: serverCards } = await api.cards.list();
      setCards(serverCards ?? []);
    } catch {
      // Best-effort: if the fetch fails the next user action will
      // surface the error. Don't blow away the in-memory list.
    }
  }, [user]);

  const value = useMemo<UserCardsContextValue>(
    () => ({ cards, loading, create, update, remove, byLevel, refresh }),
    [cards, loading, create, update, remove, byLevel, refresh],
  );

  return <UserCardsContext.Provider value={value}>{children}</UserCardsContext.Provider>;
}

export function useUserCards(): UserCardsContextValue {
  const ctx = useContext(UserCardsContext);
  if (!ctx) throw new Error('useUserCards must be used inside <UserCardsProvider>');
  return ctx;
}
