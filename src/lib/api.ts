/**
 * Typed HTTP client for the Qazaq server.
 *
 * The browser only stores a session token in localStorage; every
 * read/write of user data flows through this module. The base
 * URL is read from `import.meta.env.VITE_API_URL` at build time,
 * with a fallback for local dev so the front-end can be run on
 * its own without an env file.
 *
 * The server is documented in `server/server.js` and exports
 * these routes under `/api/*`:
 *
 *   POST   /auth/register   { username, password, displayName? }
 *   POST   /auth/login      { username, password }
 *   POST   /auth/logout
 *   GET    /me
 *   GET    /progress                       → { progress: { [cardId]: state } }
 *   PUT    /progress/:cardId               { state }
 *   POST   /review                         { cardId, direction, grade, ts? }
 *   GET    /activity                       → { events: [{ day, grade, n }] }
 *   GET    /stats                          → { learned, mastered, ... }
 *   POST   /reset
 *   GET    /health
 */
import {
  AuthError,
  isUserRecord,
  validateCredentials,
  type AuthErrorCode,
  type UserPreferences,
  type UserRecord,
} from './auth';
import type { CardSchedule } from './sm2';
import type { LevelName } from '../data/decks';

// -----------------------------------------------------------------------------
// Base URL
// -----------------------------------------------------------------------------

/**
 * Base URL of the API server.
 *
 * - In production: set `VITE_API_URL=https://anki-qazaq-api.onrender.com`
 *   (or wherever the backend is hosted) at build time.
 * - In development with the Vite proxy (see `vite.config.ts`):
 *   leave it empty so requests hit `/api/*` on the same origin and
 *   are forwarded to `http://localhost:3001`.
 * - In development without the proxy: set
 *   `VITE_API_URL=http://localhost:3001`.
 */
const RAW_BASE = (import.meta.env.VITE_API_URL ?? '').replace(/\/+$/, '');
const BASE = RAW_BASE;

/** All paths must start with a slash; we glue them onto the base. */
function url(path: string): string {
  if (!path.startsWith('/')) path = '/' + path;
  return `${BASE}/api${path}`;
}

// -----------------------------------------------------------------------------
// Session token (localStorage)
// -----------------------------------------------------------------------------

const TOKEN_KEY = 'aq:token';

export function getToken(): string | null {
  try {
    return window.localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string): void {
  try {
    window.localStorage.setItem(TOKEN_KEY, token);
  } catch {
    // private mode / quota — not fatal
  }
}

export function clearToken(): void {
  try {
    window.localStorage.removeItem(TOKEN_KEY);
  } catch {
    // ignore
  }
}

// -----------------------------------------------------------------------------
// Error parsing
// -----------------------------------------------------------------------------

const KNOWN_CODES: ReadonlySet<AuthErrorCode> = new Set<AuthErrorCode>([
  'usernameRequired',
  'usernameTooShort',
  'usernameTooLong',
  'usernameInvalid',
  'passwordRequired',
  'passwordTooShort',
  'passwordTooLong',
  'noSuchUser',
  'wrongPassword',
  'usernameTaken',
  'tooManyAccounts',
  'invalidUserRecord',
  'networkError',
  'serverError',
  'generic',
]);

/** Pull a usable AuthError from a fetch() failure or a non-2xx response. */
function toAuthError(err: unknown): AuthError {
  if (err instanceof AuthError) return err;
  if (err instanceof TypeError) {
    // fetch() throws TypeError on network failure / CORS
    return new AuthError('networkError', 'Сервер недоступен. Проверьте подключение.');
  }
  if (err instanceof Error) return new AuthError('generic', err.message);
  return new AuthError('generic', String(err));
}

/** Read a JSON error body and translate `{ error: 'noSuchUser' }` into
 *  an `AuthError`. Unknown codes collapse to a generic AuthError. */
async function raiseFromResponse(res: Response): Promise<never> {
  let code: string | undefined;
  let message: string | undefined;
  try {
    const body = (await res.json()) as { error?: string; message?: string };
    code = body?.error;
    message = body?.message;
  } catch {
    // body wasn't JSON; fall back to status
  }
  if (code && KNOWN_CODES.has(code as AuthErrorCode)) {
    throw new AuthError(code as AuthErrorCode, message ?? code);
  }
  if (res.status === 401) {
    throw new AuthError('invalidUserRecord', message ?? 'Сессия истекла, войдите снова.');
  }
  throw new AuthError(
    'serverError',
    message ?? `Сервер ответил ${res.status} ${res.statusText}`,
  );
}

// -----------------------------------------------------------------------------
// Core fetch
// -----------------------------------------------------------------------------

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  body?: unknown;
  auth?: boolean;
  signal?: AbortSignal;
}

async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, auth = false, signal } = opts;
  const headers: Record<string, string> = {
    Accept: 'application/json',
  };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (auth) {
    const token = getToken();
    if (!token) {
      throw new AuthError('invalidUserRecord', 'Не авторизован.');
    }
    headers['Authorization'] = `Bearer ${token}`;
  }
  let res: Response;
  try {
    res = await fetch(url(path), {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    });
  } catch (err) {
    throw toAuthError(err);
  }
  if (!res.ok) await raiseFromResponse(res);
  // 204 No Content / empty body — caller handles the case where T is void.
  const text = await res.text();
  if (!text) return undefined as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    return undefined as T;
  }
}

// -----------------------------------------------------------------------------
// API surface
// -----------------------------------------------------------------------------

export interface AuthResponse {
  user: UserRecord;
  token: string;
}

export type Direction = 'kk-ru' | 'ru-kk';
export type Grade = 'again' | 'hard' | 'good' | 'easy';

/** Card schedule — the same shape we used to keep in localStorage
 *  and that the server stores as a JSON string in the `state` column. */
export type CardState = CardSchedule;

export interface ActivityBucket {
  day: string; // YYYY-MM-DD
  grade: Grade | string;
  n: number;
}

export interface ServerStats {
  learned: number;
  totalReviews: number;
  totalCorrect: number;
  totalLapses: number;
  mastered: number;
  due: number;
  /** Forecast — how many cards will be due in the next 7 days. */
  due7: number;
  /** Forecast — how many cards will be due in the next 30 days. */
  due30: number;
  /** Cards with `lapses >= 8` in either direction, deduplicated
   *  to one per card. Surface a "leech" notice when this is > 0. */
  leeches: number;
  /** Per-CEFR-level breakdown. Powers the level-rings chart and the
   *  ETA projection. `total` is the deck-wide count from the static
   *  deck metadata; `learned` is cards the user has touched at
   *  least once; `mastered` is cards in review with interval ≥ 21d;
   *  `due` is cards currently due. */
  levels: Record<LevelName, {
    total: number;
    learned: number;
    mastered: number;
    due: number;
  }>;
  /** Ease-factor histogram (5 ranges). The count of cards whose
   *  current SM-2 ease factor falls into each bucket. Cards that
   *  have never been reviewed are excluded. */
  ease: {
    'lt1.5': number;
    '1.5-2.0': number;
    '2.0-2.5': number;
    '2.5-3.0': number;
    'gt3.0': number;
  };
  /** Days-to-mastery projection per CEFR level, derived from a
   *  rolling 14-day velocity. `days` is null when the level is
   *  already done (0 remaining), the user hasn't started it, or
   *  we have < 3 active days to project from. */
  eta: Record<LevelName, {
    days: number | null;
    done: boolean;
  }>;
  /** Velocity that drives the ETA. `cardsPerDay` is rounded to 1
   *  decimal place; `activeDays` is the count of distinct days in
   *  the 14-day window that had at least one review. */
  velocity: {
    cardsPerDay: number;
    activeDays: number;
  };
}

/** Per-day counter — what the daily new-card cap and the goal
 *  ring render. Returned by `GET /api/daily`. */
export interface DailyCounter {
  day: string;
  newSeen: number;
  reviewsDone: number;
}

/** One bucket on the retention chart — aggregated per day from
 *  `review_log`. `accuracy` is null when there were no reviews. */
export interface RetentionBucket {
  day: string;
  n: number;
  correct: number;
  accuracy: number | null;
}

/** CEFR level identifier — used as a query/body param when filtering
 *  cards. Same string as the front-end's `LevelName`. */
export type Level = LevelName;

/** A user-owned card. Same shape as the static Card from
 *  `src/data/decks.ts` but with `deck: 'user'` so the front-end can
 *  tell them apart from the curated starter set. */
export interface UserCard {
  id: string;
  level: Level;
  category: string;
  kazakh: string;
  transliteration: string;
  translation: string;
  translationRu: string;
  example: string;
  source?: string;
  sourceUrl?: string;
  license?: string;
  attribution?: string;
  deck: 'user';
}

export interface NewCardInput {
  level: Level;
  category: string;
  kazakh: string;
  transliteration?: string;
  translation?: string;
  translationRu: string;
  example?: string;
  source?: string;
  sourceUrl?: string;
  license?: string;
  attribution?: string;
}

export const api = {
  health: () => request<{ ok: boolean; users: number; sessions: number }>('/health'),

  auth: {
    /** Register a new account. Validates locally first so we
     *  don't even hit the server for obvious input errors. */
    register: async (
      username: string,
      password: string,
      displayName?: string,
    ): Promise<AuthResponse> => {
      const clean = validateCredentials(username, password);
      const payload: { username: string; password: string; displayName?: string } = {
        username: clean.username,
        password,
      };
      if (displayName && displayName.trim().length > 0) {
        payload.displayName = displayName.trim().slice(0, 64);
      } else {
        payload.displayName = clean.displayName;
      }
      const res = await request<AuthResponse>('/auth/register', { method: 'POST', body: payload });
      if (!isUserRecord(res.user) || typeof res.token !== 'string') {
        throw new AuthError('generic', 'Сервер вернул неожиданный ответ.');
      }
      setToken(res.token);
      return res;
    },

    login: async (username: string, password: string): Promise<AuthResponse> => {
      if (typeof username !== 'string' || typeof password !== 'string') {
        throw new AuthError('usernameRequired', 'Логин и пароль обязательны.');
      }
      const res = await request<AuthResponse>('/auth/login', {
        method: 'POST',
        body: { username: username.trim().toLowerCase(), password },
      });
      if (!isUserRecord(res.user) || typeof res.token !== 'string') {
        throw new AuthError('generic', 'Сервер вернул неожиданный ответ.');
      }
      setToken(res.token);
      return res;
    },

    logout: () =>
      request<{ ok: true }>('/auth/logout', { method: 'POST', auth: true }).finally(() => {
        clearToken();
      }),

    /**
     * Change the password for the currently-authenticated user.
     * Sends the current password for proof of ownership plus the
     * new password; server re-hashes and updates the row. The
     * session token is preserved (we're not signing the user out).
     */
    changePassword: (oldPassword: string, newPassword: string) =>
      request<{ ok: true }>('/auth/change-password', {
        method: 'POST',
        auth: true,
        body: { oldPassword, newPassword },
      }),

    me: () => request<{ user: UserRecord }>('/me', { auth: true }),

    /**
     * Start account recovery. Server returns `{ok:true}` even
     * when the username doesn't exist (intentional — we don't
     * want to leak which usernames are registered). The actual
     * code is logged to the API console.
     */
    recoverStart: (username: string) =>
      request<{ ok: true }>('/auth/recover/start', {
        method: 'POST',
        body: { username },
      }),

    /**
     * Finish account recovery. Returns `{ok:true}` on success;
     * throws `AuthError` with code `invalidCode` on bad/expired
     * code.
     */
    recoverVerify: (username: string, code: string, newPassword: string) =>
      request<{ ok: true }>('/auth/recover/verify', {
        method: 'POST',
        body: { username, code, newPassword },
      }),
  },

  /**
   * Per-user preferences blob. Used for things that need to
   * survive localStorage wipes and work across browsers/devices —
   * most importantly the "onboarding seen" flag.
   *
   * Shallow-merge: keys present in `patch` overwrite matching keys
   * in the stored blob; other keys are preserved.
   */
  preferences: {
    get: () => request<{ preferences: UserPreferences }>('/preferences', { auth: true }),
    set: (patch: Partial<UserPreferences>) =>
      request<{ preferences: UserPreferences }>('/preferences', {
        method: 'PUT',
        auth: true,
        body: patch,
      }),
  },

  progress: {
    /**
     * Pull every card the user has touched. The map is keyed by
     * plain `cardId` — kk-ru and ru-kk share a single schedule
     * per card. Old per-direction backups that used
     * `cardId::direction` keys are not interpreted by the
     * server; they get an empty progress map on import.
     */
    list: () => request<{ progress: Record<string, CardState> }>('/progress', { auth: true }),
    /**
     * Update one card's schedule. The `direction` argument is
     * kept in the signature for backward-compat with call sites
     * that pass it through (the Study page still knows which
     * direction the user is in), but the server ignores it —
     * the schedule is unified.
     */
    set: (cardId: string, _direction: Direction, state: CardState) =>
      request<{ ok: true }>(`/progress/${encodeURIComponent(cardId)}`, {
        method: 'PUT',
        auth: true,
        body: { state },
      }),
    /** Wipe the schedule for one card. The `direction` argument
     *  is ignored — there's a single schedule per card now. */
    reset: (cardId: string, _direction?: Direction) =>
      request<{ ok: true }>(`/progress/${encodeURIComponent(cardId)}`, {
        method: 'DELETE',
        auth: true,
      }),
    /**
     * Wipe every leech at once (lapses >= Anki default 8). Returns
     * the number of cards that were reset. Used by the "Reset all
     * leeches" button on the Stats page.
     */
    resetLeeches: () =>
      request<{ ok: true; wiped: number }>('/progress/reset-leeches', {
        method: 'POST',
        auth: true,
      }),
  },

  /**
   * Per-screen onboarding "seen" flag. The server is the source of
   * truth — the column lives on `users.onboardingSeen` and is
   * surfaced in `/api/me` so the front-end has it on the very
   * first render after login. We expose dedicated endpoints so
   * the flag doesn't have to round-trip through the generic
   * `/preferences` blob (which is for free-form key/value pairs).
   */
  onboarding: {
    get: () =>
      request<{ seen: Record<string, string> }>('/onboarding', { auth: true }),
    /** Idempotent: a repeated POST just bumps the timestamp. */
    markSeen: (screen: 'study' | 'browse' | 'stats') =>
      request<{ seen: Record<string, string> }>(`/onboarding/${screen}`, {
        method: 'POST',
        auth: true,
      }),
    /** Clear one screen's "seen" flag — powers the Settings
    // "Show tour again" button. Idempotent: deleting an already-absent
    // screen is a no-op. */
    reset: (screen: 'study' | 'browse' | 'stats') =>
      request<{ seen: Record<string, string> }>(`/onboarding/${screen}`, {
        method: 'DELETE',
        auth: true,
      }),
  },

  review: {
    log: (
      cardId: string,
      direction: Direction,
      grade: Grade,
      opts: { ts?: string; isCram?: boolean } = {},
    ) =>
      request<{ ok: true }>('/review', {
        method: 'POST',
        auth: true,
        body: {
          cardId,
          direction,
          grade,
          ...(opts.ts ? { ts: opts.ts } : {}),
          ...(opts.isCram ? { isCram: true } : {}),
        },
      }),
    list: () =>
      request<{ events: Array<{ ts: string; cardId: string; direction: Direction; grade: Grade }> }>(
        '/review-log',
        { auth: true },
      ),
  },

  /** Per-day review activity. Used by the day-by-day activity
   *  chart and the GitHub-style heatmap. The server defaults
   *  to 90 days; callers can ask for more or less. */
  activity: (days = 90) =>
    request<{ events: ActivityBucket[]; days: number }>(`/activity?days=${days}`, {
      auth: true,
    }),
  stats: () => request<ServerStats>('/stats', { auth: true }),
  /** Today's daily counter — used by the new-card cap and the
   *  goal ring. Optional `day` arg lets callers query history
   *  (currently only the chart uses this; the goal ring asks
   *  for today). */
  daily: (day?: string) => {
    const q = day ? `?day=${encodeURIComponent(day)}` : '';
    return request<DailyCounter>(`/daily${q}`, { auth: true });
  },
  /** Per-day accuracy buckets for the retention chart. */
  retention: (days: number = 30) =>
    request<{ days: number; buckets: RetentionBucket[] }>(`/retention?days=${days}`, {
      auth: true,
    }),
  reset: () => request<{ ok: true }>('/reset', { method: 'POST', auth: true }),

  cards: {
    list: (level?: Level) =>
      request<{ cards: UserCard[] }>(
        level ? `/cards?level=${encodeURIComponent(level)}` : '/cards',
        { auth: true },
      ),
    create: (input: NewCardInput) =>
      request<{ card: UserCard }>('/cards', { method: 'POST', auth: true, body: input }),
    update: (id: string, input: Partial<NewCardInput>) =>
      request<{ card: UserCard }>(`/cards/${encodeURIComponent(id)}`, {
        method: 'PUT',
        auth: true,
        body: input,
      }),
    delete: (id: string) =>
      request<{ ok: true }>(`/cards/${encodeURIComponent(id)}`, {
        method: 'DELETE',
        auth: true,
      }),
    /**
     * Upload an Anki `.apkg` archive and import every note that
     * has a parseable Kazakh + Russian field. Uses `fetch`
     * directly because the request body is a multipart/form-data
     * stream, not JSON.
     */
    importApkg: (file: File, level: Level): Promise<{
      ok: true;
      imported: number;
      deckName: string;
      skipped: { noKk: number; noRu: number; unknownModel: number };
    }> => {
      const token = getToken();
      const form = new FormData();
      form.append('file', file, file.name);
      return fetch(`${BASE}/api/cards/import-apkg?level=${encodeURIComponent(level)}`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: form,
      }).then(async (r) => {
        if (!r.ok) {
          const body = await r.json().catch(() => ({ error: 'networkError' }));
          throw new AuthError('generic', body.message || body.error || `HTTP ${r.status}`);
        }
        return r.json();
      });
    },
  },

  export: {
    get: () =>
      request<{
        format: string;
        schemaVersion: number;
        exportedAt: string;
        username: string;
        displayName: string;
        progress: Record<string, CardState>;
        reviewLog: Array<{ ts: string; cardId: string; direction: Direction; grade: Grade }>;
      }>('/export', { auth: true }),
    send: (payload: {
      progress: Record<string, CardState>;
      reviewLog: Array<{ ts: string; cardId: string; direction: Direction; grade: Grade }>;
    }) =>
      request<{ ok: true; cards: number; events: number }>('/import', {
        method: 'POST',
        auth: true,
        body: payload,
      }),
  },
};

/** True if the browser currently holds a session token. Does NOT
 *  verify it against the server — the first 401 from `me` will
 *  flip the auth context back to "logged out". */
export function hasSessionToken(): boolean {
  return getToken() !== null;
}

export { BASE as API_BASE };
