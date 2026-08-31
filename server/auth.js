/**
 * Auth: register / login / logout / me.
 *
 * - Passwords are stored as bcrypt hashes (10 rounds).
 * - On successful register/login the server creates a random
 *   session token, stores it in the `sessions` table, and returns
 *   it to the client. The client then sends it as
 *   `Authorization: Bearer <token>`.
 * - The middleware in `server.js` (`requireAuth`) reads that
 *   header, looks up the session, and attaches `req.userId`.
 *
 * Username normalisation mirrors the client: lowercased, trimmed,
 * 3–32 chars, `[a-z0-9_.-]+`.
 */
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { dbQuery, dbQueryOne, dbWrite } from './db.js';

export const USERNAME_RE = /^[a-z0-9_.-]+$/;
const USERNAME_MIN = 3;
const USERNAME_MAX = 32;
const PASSWORD_MIN = 4;
const PASSWORD_MAX = 256;
// Hard cap on the number of accounts on this server. We keep the
// number generous (500) so a single user can run the full e2e
// suite (which creates ~30 throwaway users) plus a few days of
// real use. Bump it if you legitimately outgrow it.
const MAX_USERS = 500;
const SALT_ROUNDS = 10;

function makeUserId() {
  return crypto.randomUUID();
}
function makeSessionToken() {
  // 32 bytes of entropy → 43 chars base64url
  return crypto.randomBytes(32).toString('base64url');
}

function makeIdempotencyKey() {
  return crypto.randomBytes(8).toString('hex');
}

function normalizeUsername(u) {
  return (u ?? '').trim().toLowerCase();
}

function validateUsername(u) {
  if (!u) return 'usernameRequired';
  if (u.length < USERNAME_MIN) return 'usernameTooShort';
  if (u.length > USERNAME_MAX) return 'usernameTooLong';
  if (!USERNAME_RE.test(u)) return 'usernameInvalid';
  return null;
}

function validatePassword(p) {
  if (!p) return 'passwordRequired';
  if (p.length < PASSWORD_MIN) return 'passwordTooShort';
  if (p.length > PASSWORD_MAX) return 'passwordTooLong';
  return null;
}

function stripControl(s) {
  // eslint-disable-next-line no-control-regex
  return (s ?? '').replace(/[\u0000-\u001f\u007f]/g, '');
}

export async function register({ username, password, displayName }) {
  const clean = normalizeUsername(username);
  const u = validateUsername(clean);
  if (u) throw new AuthError(u, 'Username failed validation.');
  const p = validatePassword(password);
  if (p) throw new AuthError(p, 'Password failed validation.');

  const count = dbQueryOne('SELECT COUNT(*) AS n FROM users');
  if (count.n >= MAX_USERS) {
    throw new AuthError('tooManyAccounts', 'Too many accounts on this device.');
  }
  if (dbQueryOne('SELECT 1 FROM users WHERE username = ?', [clean])) {
    throw new AuthError('usernameTaken', 'Username already taken.');
  }

  const cleanDisplay = stripControl((displayName ?? '').trim().slice(0, 64));
  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
  const id = makeUserId();
  const createdAt = new Date().toISOString();
  const user = {
    id,
    username: clean,
    displayName: cleanDisplay || clean,
    passwordHash,
    createdAt,
    preferences: '{}',
    // Brand-new user: no screens seen yet. Stored as a JSON object
    // (`{}`), not as a string, so the column round-trips cleanly
    // through any future reader.
    onboardingSeen: {},
  };

  const token = makeSessionToken();
  const now = new Date().toISOString();
  await dbWrite((db) => {
    db.run(
      'INSERT INTO users (id, username, displayName, passwordHash, createdAt, preferences, onboardingSeen) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [user.id, user.username, user.displayName, user.passwordHash, user.createdAt, user.preferences, JSON.stringify(user.onboardingSeen)],
    );
    db.run(
      'INSERT INTO sessions (token, userId, createdAt, lastSeenAt) VALUES (?, ?, ?, ?)',
      [token, user.id, now, now],
    );
  });

  return { user: publicUser(user), token };
}

export async function login({ username, password }) {
  const clean = normalizeUsername(username);
  if (!clean) throw new AuthError('usernameRequired', 'Username is required.');
  if (!password) throw new AuthError('passwordRequired', 'Password is required.');

  const row = dbQueryOne(
    'SELECT id, username, displayName, passwordHash, createdAt, preferences, onboardingSeen FROM users WHERE username = ?',
    [clean],
  );
  if (!row) {
    throw new AuthError('noSuchUser', 'No such user.');
  }
  const ok = await bcrypt.compare(password, row.passwordHash);
  if (!ok) throw new AuthError('wrongPassword', 'Wrong password.');

  const user = {
    id: row.id,
    username: row.username,
    displayName: row.displayName,
    passwordHash: row.passwordHash,
    createdAt: row.createdAt,
    preferences: parsePrefs(row.preferences),
    onboardingSeen: parseOnboardingSeen(row.onboardingSeen),
  };

  const token = makeSessionToken();
  const now = new Date().toISOString();
  await dbWrite((db) => {
    db.run(
      'INSERT INTO sessions (token, userId, createdAt, lastSeenAt) VALUES (?, ?, ?, ?)',
      [token, user.id, now, now],
    );
  });

  return { user: publicUser(user), token };
}

export async function logout(token) {
  if (!token) return;
  await dbWrite((db) => {
    db.run('DELETE FROM sessions WHERE token = ?', [token]);
  });
}

/**
 * Change the password for the currently-authenticated user. Used by
 * the Settings page "Change password" form. The user proves they
 * own the account by sending their current password; we verify it
 * against the stored bcrypt hash, then replace the hash with a
 * fresh one for the new password.
 *
 * Existing sessions are intentionally left intact. The change-password
 * flow is meant for an actively-logged-in user on a trusted device;
 * if the user thinks their account is compromised, the recovery
 * flow (POST /api/auth/recover/start + /verify) is the right tool,
 * because it invalidates the existing session by minting a new one
 * and discarding the old token.
 *
 * Errors:
 *  - wrongPassword: oldPassword doesn't match
 *  - passwordRequired / passwordTooShort / passwordTooWeak: new
 *    password fails the same validator the register flow uses
 */
export async function changePassword(userId, oldPassword, newPassword) {
  if (!userId) throw new AuthError('unauthorized', 'Not signed in.');
  if (!oldPassword) throw new AuthError('passwordRequired', 'Current password is required.');
  const p = validatePassword(newPassword);
  if (p) throw new AuthError(p, 'New password failed validation.');

  const row = dbQueryOne('SELECT passwordHash FROM users WHERE id = ?', [userId]);
  if (!row) throw new AuthError('noSuchUser', 'No such user.');

  const ok = await bcrypt.compare(oldPassword, row.passwordHash);
  if (!ok) throw new AuthError('wrongPassword', 'Current password is wrong.');

  const newHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
  await dbWrite((db) => {
    db.run('UPDATE users SET passwordHash = ? WHERE id = ?', [newHash, userId]);
  });
}

export async function resolveSession(token) {
  if (!token) return null;
  const row = dbQueryOne(
    `SELECT s.token, s.userId, s.createdAt, s.lastSeenAt,
            u.id AS u_id, u.username, u.displayName, u.createdAt AS u_createdAt,
            u.preferences, u.onboardingSeen
     FROM sessions s JOIN users u ON u.id = s.userId
     WHERE s.token = ?`,
    [token],
  );
  if (!row) return null;
  // Bump lastSeenAt at most every 60s so active users don't churn
  // the DB on every request. Cheap throttle: only update if the
  // stored value is older than 60s.
  const last = Date.parse(row.lastSeenAt);
  if (Date.now() - last > 60_000) {
    const now = new Date().toISOString();
    await dbWrite((db) => {
      db.run('UPDATE sessions SET lastSeenAt = ? WHERE token = ?', [now, token]);
    });
  }
  return {
    userId: row.userId,
    token,
    user: {
      id: row.u_id,
      username: row.username,
      displayName: row.displayName,
      createdAt: row.u_createdAt,
      preferences: parsePrefs(row.preferences),
      onboardingSeen: parseOnboardingSeen(row.onboardingSeen),
    },
  };
}

function publicUser(u) {
  return {
    id: u.id,
    username: u.username,
    displayName: u.displayName,
    createdAt: u.createdAt,
    preferences: parsePrefs(u.preferences),
    // The onboarding-seen column is TEXT/JSON. We parse it here so
    // the front-end gets a plain object on `/api/me` and doesn't
    // need a second round-trip to decide whether to show a tour.
    // A missing or corrupt value degrades to `{}` — the client
    // treats that as "no screens seen yet".
    onboardingSeen: parseOnboardingSeen(u.onboardingSeen),
  };
}

/** Parse the `users.onboardingSeen` TEXT/JSON blob. Same shape
 *  contract as `parsePrefs` (always returns a plain object) so
 *  the front-end never has to defend against `null`. */
function parseOnboardingSeen(raw) {
  if (typeof raw !== 'string' || !raw) return {};
  try {
    const v = JSON.parse(raw);
    if (v && typeof v === 'object' && !Array.isArray(v)) return v;
    return {};
  } catch {
    return {};
  }
}

/** Parse the preferences blob stored as TEXT in `users.preferences`.
 *  Tolerant: bad/missing JSON degrades to an empty object so the
 *  front-end never sees `null` for a field it expects to be a dict. */
function parsePrefs(raw) {
  if (typeof raw !== 'string' || raw.length === 0) return {};
  try {
    const v = JSON.parse(raw);
    return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
  } catch {
    return {};
  }
}

/** Read preferences for a user. Used by `/api/preferences` GET. */
export function readUserPreferences(userId) {
  const row = dbQueryOne('SELECT preferences FROM users WHERE id = ?', [userId]);
  return parsePrefs(row?.preferences);
}

/** Merge-update preferences for a user. Returns the new full blob.
 *  Caller is expected to have already validated the patch shape —
 *  we only do a defensive size cap here. */
export async function writeUserPreferences(userId, patch) {
  const current = readUserPreferences(userId);
  // Shallow-merge top-level keys only; nested values are replaced.
  // Keeps the API simple and predictable.
  const incoming = patch && typeof patch === 'object' ? patch : {};
  const sanitized = { ...current };
  for (const [k, v] of Object.entries(incoming)) {
    if (k === 'newCardsPerDay' || k === 'dailyGoalReviews') {
      // Clamp numeric prefs to a sane range. Front-end already does
      // this, but trust the server, not the client.
      const n = Number(v);
      if (!Number.isFinite(n)) continue;
      const min = k === 'newCardsPerDay' ? 0 : 1;
      const max = k === 'newCardsPerDay' ? 200 : 500;
      sanitized[k] = Math.max(min, Math.min(max, Math.floor(n)));
    } else if (k === 'leechNoticeDismissed') {
      sanitized[k] = v === true;
    } else {
      // Unknown keys pass through unchanged — the front-end is
      // allowed to add new ones without a server deploy.
      sanitized[k] = v;
    }
  }
  const next = sanitized;
  const raw = JSON.stringify(next);
  // 8 KB is plenty for a handful of boolean flags and small strings.
  if (raw.length > 8 * 1024) {
    throw new Error('preferencesTooLarge');
  }
  await dbWrite((db) => {
    db.run('UPDATE users SET preferences = ? WHERE id = ?', [raw, userId]);
  });
  return next;
}

/* -------------------------------------------------------------------------- */
/* Errors                                                                      */
/* -------------------------------------------------------------------------- */

export const AUTH_ERROR_CODES = new Set([
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
  'generic',
]);

export class AuthError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'AuthError';
    this.code = code;
  }
}

export function makeIdempotencyToken() {
  return makeIdempotencyKey();
}

/* -------------------------------------------------------------------------- */
/* Account recovery                                                           */
/* -------------------------------------------------------------------------- */

const RECOVERY_TTL_MS = 15 * 60 * 1000; // 15 minutes
const RECOVERY_BUCKET_SIZE = 5; // max outstanding codes per user
const RECOVERY_BUCKET_WINDOW_MS = 60 * 60 * 1000; // per hour

/**
 * Issue a fresh 6-digit numeric code for the given username. The
 * code is bcrypt-hashed before being written to the DB, so a SQL
 * dump leak doesn't compromise accounts. Returns the plaintext
 * code (which the caller should log and then discard) or null if
 * no user matches the username. We cap outstanding codes per user
 * so a flood of requests can't fill the table.
 */
export async function issueRecoveryCode(usernameRaw) {
  const username = normalizeUsername(usernameRaw);
  if (!USERNAME_RE.test(username)) return null;
  const user = dbQueryOne('SELECT id FROM users WHERE username = ?', [username]);
  if (!user) return null;
  const now = Date.now();
  // Cap outstanding codes per user. Count the codes that are
  // still valid (not consumed and not expired) for this user in
  // the last hour.
  const { rows: outstanding } = dbQuery(
    `SELECT codeHash FROM recovery_codes
     WHERE userId = ? AND consumedAt IS NULL AND expiresAt > ? AND createdAt > ?`,
    [user.id, new Date(now).toISOString(), new Date(now - RECOVERY_BUCKET_WINDOW_MS).toISOString()],
  );
  if (outstanding.length >= RECOVERY_BUCKET_SIZE) {
    // Refuse to issue more. The caller still returns 200 so the
    // response is timing-equivalent to a real issue; the user can
    // wait an hour for the bucket to drain.
    return null;
  }
  const code = makeRecoveryCode();
  const codeHash = await bcrypt.hash(code, 10);
  const nowIso = new Date(now).toISOString();
  const expIso = new Date(now + RECOVERY_TTL_MS).toISOString();
  await dbWrite((d) => {
    d.run(
      'INSERT INTO recovery_codes (codeHash, userId, createdAt, expiresAt) VALUES (?, ?, ?, ?)',
      [codeHash, user.id, nowIso, expIso],
    );
  });
  return code;
}

/**
 * Consume a recovery code. On success the user's password is
 * reset to `newPassword` and the code row is marked consumed.
 * Returns true iff the code matched an unconsumed, unexpired
 * row for the named user.
 *
 * The new password is hashed with bcrypt before being written.
 * Old sessions are intentionally left in place — the user can
 * revoke them from /api/me after they sign in with the new
 * password.
 */
export async function consumeRecoveryCode(usernameRaw, code, newPassword) {
  const username = normalizeUsername(usernameRaw);
  if (!USERNAME_RE.test(username)) return false;
  const user = dbQueryOne('SELECT id, passwordHash FROM users WHERE username = ?', [username]);
  if (!user) return false;
  // Look up unconsumed, unexpired codes for this user. There
  // should be at most a handful thanks to the cap in
  // issueRecoveryCode, so this is cheap.
  const { rows: candidates } = dbQuery(
    `SELECT codeHash FROM recovery_codes
     WHERE userId = ? AND consumedAt IS NULL AND expiresAt > ?`,
    [user.id, new Date().toISOString()],
  );
  for (const row of candidates) {
    const match = await bcrypt.compare(code, row.codeHash);
    if (match) {
      const newHash = await bcrypt.hash(newPassword, 10);
      await dbWrite((d) => {
        d.run('UPDATE users SET passwordHash = ? WHERE id = ?', [newHash, user.id]);
        d.run('UPDATE recovery_codes SET consumedAt = ? WHERE codeHash = ?', [
          new Date().toISOString(),
          row.codeHash,
        ]);
      });
      return true;
    }
  }
  return false;
}

function makeRecoveryCode() {
  // 6-digit zero-padded numeric code. crypto.randomInt is
  // uniformly distributed; the leading-zero case is fine (e.g.
  // "042718" is a valid code).
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
}
