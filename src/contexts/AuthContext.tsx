import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useNavigate } from 'react-router-dom';
import { api, hasSessionToken } from '../lib/api';
import type { UserRecord } from '../lib/auth';

interface AuthContextValue {
  user: UserRecord | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<void>;
  register: (username: string, password: string, displayName?: string) => Promise<void>;
  logout: () => Promise<void>;
  /**
   * Re-fetch `/api/me` and update the in-memory `user`. Used after a
   * mutation that may have changed server-stored fields the rest of
   * the app reads (e.g. `preferences`).
   */
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  // On boot: if we have a session token in localStorage, try to
  // resolve it against the server. If the token is gone / wrong,
  // `me` returns 401 and we drop back to "logged out".
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!hasSessionToken()) {
        if (!cancelled) {
          setUser(null);
          setLoading(false);
        }
        return;
      }
      try {
        const { user: u } = await api.auth.me();
        if (!cancelled) setUser(u);
      } catch {
        if (!cancelled) {
          setUser(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    const { user: u } = await api.auth.login(username, password);
    setUser(u);
  }, []);

  const register = useCallback(
    async (username: string, password: string, displayName?: string) => {
      const { user: u } = await api.auth.register(username, password, displayName);
      setUser(u);
    },
    [],
  );

  const logout = useCallback(async () => {
    try {
      await api.auth.logout();
    } catch {
      // Token may already be invalid server-side. Continue with
      // the local logout either way.
    }
    setUser(null);
    navigate('/login', { replace: true });
  }, [navigate]);

  const refresh = useCallback(async () => {
    if (!hasSessionToken()) return;
    try {
      const { user: u } = await api.auth.me();
      setUser(u);
    } catch {
      // If `/me` fails we keep the existing user. The next page
      // load will try again; if the token is really gone the
      // boot effect will drop the session.
    }
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ user, loading, login, register, logout, refresh }),
    [user, loading, login, register, logout, refresh],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
