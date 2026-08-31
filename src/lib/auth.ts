/**
 * Auth domain types + validation helpers.
 *
 * The actual register / login / logout flows now live on the
 * server (`server/server.js` → `server/auth.js`). This module
 * keeps the shape that the rest of the app sees:
 *
 *   - `UserRecord`       — what an authenticated user looks like
 *   - `AuthError`        — thrown by `api.ts` and surfaced via
 *                          `translateAuthError()` into i18n strings
 *   - `AuthErrorCode`    — 12 stable codes → `auth.errors.<code>`
 *   - `isUserRecord`     — runtime shape guard for any value
 *                          claimed to be a `UserRecord`
 *
 * The on-the-wire transport lives in `src/lib/api.ts`.
 */

export interface UserRecord {
  id: string;
  username: string;
  displayName: string;
  passwordHash?: string;
  createdAt: string;
  /** Server-side preferences blob. The auth layer returns the
   *  parsed JSON; the front-end mostly reads this through
   *  `api.preferences.get()` for a fresh copy. */
  preferences?: UserPreferences;
  /** ISO-timestamped map of `{ screen: 'seenAt' }` entries,
   *  populated from the `users.onboardingSeen` column on every
   *  `/api/me` call. The front-end never has to defend against
   *  `null` — the server always returns at least `{}`. */
  onboardingSeen?: Record<string, string>;
}

/** Per-user preferences. Mirrors the server's blob. The server is
 *  tolerant of unknown keys, so this list is not exhaustive — new
 *  flags can land here without a server deploy.
 *
 *  Note: the per-screen onboarding flag used to live here as
 *  `onboardingSeen`. It was promoted to a first-class DB column
 *  (`users.onboardingSeen`) for reliability — the JSON-blob
 *  version was too easy to lose. */
export interface UserPreferences {
  theme?: 'light' | 'dark' | 'auto';
  /** Max number of brand-new cards surfaced per day. Anki default = 20. */
  newCardsPerDay?: number;
  /** Daily target for the goal ring on the Study page. Reviews only, not new. */
  dailyGoalReviews?: number;
  /** Set true once the user has acknowledged the leech notice. */
  leechNoticeDismissed?: boolean;
}

/**
 * Stable error codes that the auth layer throws. The UI maps these to
 * i18n keys (`auth.errors.<code>`) so a single source of truth is used
 * for translation instead of fragile string matching.
 */
export type AuthErrorCode =
  | 'usernameRequired'
  | 'usernameTooShort'
  | 'usernameTooLong'
  | 'usernameInvalid'
  | 'passwordRequired'
  | 'passwordTooShort'
  | 'passwordTooLong'
  | 'noSuchUser'
  | 'wrongPassword'
  | 'usernameTaken'
  | 'tooManyAccounts'
  | 'invalidUserRecord'
  | 'networkError'
  | 'serverError'
  | 'generic';

export class AuthError extends Error {
  readonly code: AuthErrorCode;
  constructor(code: AuthErrorCode, message: string) {
    super(message);
    this.name = 'AuthError';
    this.code = code;
  }
}

const USERNAME_RE = /^[a-z0-9_.-]+$/;
const DISPLAY_NAME_MAX = 64;
const USERNAME_MAX = 32;
const PASSWORD_MAX = 256;
const PASSWORD_MIN = 4;
const USERNAME_MIN = 3;

/** Allow only the safe shape of a stored user. Reject anything else so a
 *  tampered localStorage / bad server response can't promote a non-user
 *  object to a session. */
export function isUserRecord(v: unknown): v is UserRecord {
  if (typeof v !== 'object' || v === null) return false;
  const r = v as Record<string, unknown>;
  const prefs = r.preferences;
  const prefsOk =
    prefs === undefined ||
    (typeof prefs === 'object' && prefs !== null && !Array.isArray(prefs));
  const seen = r.onboardingSeen;
  const seenOk =
    seen === undefined ||
    (typeof seen === 'object' && seen !== null && !Array.isArray(seen));
  return (
    typeof r.id === 'string' &&
    r.id.length > 0 &&
    r.id.length <= 64 &&
    typeof r.username === 'string' &&
    USERNAME_RE.test(r.username) &&
    r.username.length >= USERNAME_MIN &&
    r.username.length <= USERNAME_MAX &&
    typeof r.displayName === 'string' &&
    r.displayName.length > 0 &&
    r.displayName.length <= DISPLAY_NAME_MAX &&
    typeof r.createdAt === 'string' &&
    r.createdAt.length > 0 &&
    r.createdAt.length <= 64 &&
    (r.passwordHash === undefined ||
      (typeof r.passwordHash === 'string' && /^\$2[aby]\$\d{2}\$/.test(r.passwordHash))) &&
    prefsOk &&
    seenOk
  );
}

/** Client-side shape check for a register request, mirroring the
 *  server-side validator in `server/auth.js`. Throws `AuthError`
 *  with the same `AuthErrorCode` the server would. */
export function validateCredentials(username: unknown, password: unknown): {
  username: string;
  displayName: string;
} {
  if (typeof username !== 'string') {
    throw new AuthError('usernameRequired', 'Username is required.');
  }
  const clean = username.trim().toLowerCase();
  if (clean.length === 0) throw new AuthError('usernameRequired', 'Username is required.');
  if (clean.length < USERNAME_MIN)
    throw new AuthError('usernameTooShort', 'Username must be at least 3 characters.');
  if (clean.length > USERNAME_MAX)
    throw new AuthError('usernameTooLong', `Username must be at most ${USERNAME_MAX} characters.`);
  if (!USERNAME_RE.test(clean))
    throw new AuthError('usernameInvalid', 'Username can only contain a-z, 0-9, dot, dash, underscore.');

  if (typeof password !== 'string' || password.length === 0) {
    throw new AuthError('passwordRequired', 'Password is required.');
  }
  if (password.length < PASSWORD_MIN)
    throw new AuthError('passwordTooShort', `Password must be at least ${PASSWORD_MIN} characters.`);
  if (password.length > PASSWORD_MAX)
    throw new AuthError('passwordTooLong', `Password must be at most ${PASSWORD_MAX} characters.`);

  return { username: clean, displayName: clean };
}
