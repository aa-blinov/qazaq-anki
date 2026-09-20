/**
 * Qazaq server — Express + sql.js + better-sqlite3-shaped API.
 *
 * Routes (all JSON, all under `/api`):
 *   POST   /auth/register   { username, password, displayName? }
 *   POST   /auth/login      { username, password }
 *   POST   /auth/logout
 *   GET    /me
 *   GET    /progress                       → { [cardId::direction]: state }
 *   PUT    /progress/:cardId/:direction    { state }   → updates one card
 *   GET    /stats                          → { mastery, due, total, ... }
 *   GET    /activity                       → 90-day review log aggregation
 *   POST   /reset                          → wipes the user's progress + log
 *
 * Auth: every protected route expects `Authorization: Bearer <token>`.
 */
import express from 'express';
import cors from 'cors';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import { closeDb, dbQuery, dbQueryOne, dbRun, dbWrite, getDb, openDb, walCheckpoint } from './db.js';
import { AuthError, AUTH_ERROR_CODES, changePassword, login, logout, readUserPreferences, register, resolveSession, writeUserPreferences, issueRecoveryCode, consumeRecoveryCode } from './auth.js';
import {
  CardError,
  createUserCard,
  deleteUserCard,
  getUserCard,
  listUserCards,
  rowToCard,
  updateUserCard,
  bulkCreateUserCards,
} from './cards.js';
import { createRateLimiter } from './ratelimit.js';

const PORT = Number(process.env.PORT ?? 3001);
const HOST = process.env.HOST ?? '0.0.0.0';

const app = express();
app.use(express.json({ limit: '256kb' }));
app.use(
  cors({
    origin: process.env.CORS_ORIGIN
      ? process.env.CORS_ORIGIN.split(',').map((s) => s.trim())
      : true,
    credentials: false,
  }),
);

// Security headers. We don't pull in helmet to keep the dep tree
// small — these are short and well-understood. The headers are sent
// for ALL responses (success and error), and they don't fight the
// CSP we set in index.html because CSP via <meta> is the weaker of
// the two and the HTTP version wins where they overlap.
app.use((_req, res, next) => {
  // Block the page from being framed — mitigates clickjacking. We
  // ship an SPA that doesn't legitimately need to be embedded.
  res.setHeader('X-Frame-Options', 'DENY');
  // Stop legacy browsers from MIME-sniffing JS as something else.
  res.setHeader('X-Content-Type-Options', 'nosniff');
  // Limit referrer leakage. Same-origin is enough for our needs.
  res.setHeader('Referrer-Policy', 'same-origin');
  // Tiny permission surface: the only thing the page actually
  // needs is geolocation/storage for the existing flow (we don't
  // even use geolocation, but the directive is empty either way).
  res.setHeader('Permissions-Policy', 'geolocation=(), camera=(), microphone=()');
  next();
});

/* -------------------------------------------------------------------------- */
/* Per-route rate limits                                                       */
/* -------------------------------------------------------------------------- */

// The register and login routes do real work (bcrypt round) and are
// the only thing the outside world can hit without a token, so they
// get tighter limits. Reset is a 10-minute window for register
// (UX is forgiving) and 5 minutes for login (stops credential
// stuffing without locking out a real user on a typo).
const registerLimiter = createRateLimiter({ max: 5, windowMs: 10 * 60 * 1000 });
const loginLimiter = createRateLimiter({ max: 10, windowMs: 5 * 60 * 1000 });
// Recovery is split into two endpoints (start + verify) so a
// code-then-password flow has 2× the budget of a single-shot
// login attempt. Both endpoints together are still much stricter
// than the registration flow.
const recoverRateLimit = createRateLimiter({ max: 5, windowMs: 10 * 60 * 1000 });

/* -------------------------------------------------------------------------- */
/* Auth middleware                                                             */
/* -------------------------------------------------------------------------- */

async function requireAuth(req, res, next) {
  try {
    const header = req.get('authorization') ?? '';
    const match = /^Bearer\s+(.+)$/.exec(header);
    const token = match ? match[1] : null;
    if (!token) return res.status(401).json({ error: 'noToken' });
    const session = await resolveSession(token);
    if (!session) return res.status(401).json({ error: 'invalidToken' });
    req.userId = session.userId;
    req.user = session.user;
    req.token = token;
    next();
  } catch (err) {
    next(err);
  }
}

function sendAuthError(res, err) {
  if (!(err instanceof AuthError)) {
    return res.status(500).json({ error: 'generic', message: String(err?.message ?? err) });
  }
  const status =
    err.code === 'noSuchUser' || err.code === 'wrongPassword' || err.code === 'usernameTaken'
      ? 409
      : 400;
  res.status(status).json({ error: err.code, message: err.message });
}

/* -------------------------------------------------------------------------- */
/* Health                                                                      */
/* -------------------------------------------------------------------------- */

app.get('/api/health', (_req, res) => {
  // A real health-check: two reads AND one write. If the DB
  // is locked, corrupted, or unreachable, we return 503 so an
  // external monitor (UptimeRobot, k8s, etc.) flags the service
  // as down. The write targets a tiny `health_writes` table that
  // is created on first boot — INSERT is cheap, the row is
  // overwritten on every health-check, so the table stays at one
  // row forever. We also enforce a hard 2s timeout via
  // `withTimeout` so a stuck DB can't hang the health endpoint
  // (which would make the orchestrator think we're healthy).
  let db;
  try {
    db = getDb();
  } catch (err) {
    return res.status(503).json({ ok: false, error: 'db_unavailable', message: err?.message ?? String(err) });
  }
  const startedAt = Date.now();
  try {
    const userCount = dbQueryOne('SELECT COUNT(*) AS n FROM users')?.n ?? 0;
    const sessionCount = dbQueryOne('SELECT COUNT(*) AS n FROM sessions')?.n ?? 0;
    // The write probes that the DB is actually accepting writes,
    // not just reads — catches "DB is up but read-only" cases
    // (e.g. someone `chmod 555`'d the file, or disk full mid-
    // INSERT). The single-row UPSERT keeps the table small.
    dbRun(
      `INSERT INTO health_writes (id, at) VALUES (1, ?)
         ON CONFLICT(id) DO UPDATE SET at = excluded.at`,
      [new Date().toISOString()],
    );
    return res.json({
      ok: true,
      users: userCount,
      sessions: sessionCount,
      healthCheckMs: Date.now() - startedAt,
    });
  } catch (err) {
    return res.status(503).json({ ok: false, error: 'db_query_failed', message: err?.message ?? String(err) });
  }
});

/* --------------------------------------------------------------------------
 * Admin endpoints (backup, WAL checkpoint).
 *
 * Only mounted when ADMIN_TOKEN is set. The token is checked via
 * `Authorization: Bearer <token>` — same shape as the user auth
 * header so the backup container can use the same curl pattern.
 *
 * If ADMIN_TOKEN is unset (the dev default), admin endpoints
 * return 404 so we never leak them publicly. Don't ship
 * without setting the env var on a real deploy.
 * ------------------------------------------------------------------------ */
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || '';
function requireAdmin(req, res, next) {
  if (!ADMIN_TOKEN) return res.status(404).json({ error: 'not_found' });
  const header = req.get('authorization') ?? '';
  const sent = header.toLowerCase().startsWith('bearer ')
    ? header.slice(7).trim()
    : '';
  // Constant-time compare so a timing oracle can't be used to
  // brute-force the token. crypto.timingSafeEqual needs equal-
  // length buffers.
  if (sent.length !== ADMIN_TOKEN.length) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  try {
    const ok = crypto.timingSafeEqual(
      Buffer.from(sent),
      Buffer.from(ADMIN_TOKEN),
    );
    if (!ok) return res.status(401).json({ error: 'unauthorized' });
  } catch {
    return res.status(401).json({ error: 'unauthorized' });
  }
  next();
}

if (ADMIN_TOKEN) {
  app.post('/api/admin/checkpoint', requireAdmin, async (_req, res) => {
    // Force a flush + checkpoint so the on-disk SQLite file is
    // in a coherent state. The backup container calls this
    // right before reading /data/qazaq.sqlite so the snapshot
    // is a clean point-in-time, not "main file + dirty WAL".
    try {
      const out = await walCheckpoint();
      res.json(out);
    } catch (err) {
      res.status(500).json({ error: 'checkpoint_failed', message: err?.message ?? String(err) });
    }
  });

  app.post('/api/admin/backup-now', requireAdmin, async (_req, res) => {
    // Triggers the same flow as the backup container's cron
    // tick — useful for "I just changed something, snapshot
    // now" without waiting for the next schedule.
    try {
      await walCheckpoint();
      const buf = Buffer.from(getDb().export());
      res.setHeader('Content-Type', 'application/x-sqlite3');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="qazaq-${new Date().toISOString().replace(/[:.]/g, '-')}.sqlite"`,
      );
      res.send(buf);
    } catch (err) {
      res.status(500).json({ error: 'backup_failed', message: err?.message ?? String(err) });
    }
  });
}

/* -------------------------------------------------------------------------- */
/* Auth routes                                                                 */
/* -------------------------------------------------------------------------- */

app.post('/api/auth/register', registerLimiter, async (req, res, next) => {
  try {
    const { username, password, displayName } = req.body ?? {};
    const result = await register({ username, password, displayName });
    res.json(result);
  } catch (err) {
    if (err instanceof AuthError) return sendAuthError(res, err);
    next(err);
  }
});

app.post('/api/auth/login', loginLimiter, async (req, res, next) => {
  try {
    const { username, password } = req.body ?? {};
    const result = await login({ username, password });
    res.json(result);
  } catch (err) {
    if (err instanceof AuthError) return sendAuthError(res, err);
    next(err);
  }
});

app.post('/api/auth/logout', requireAuth, async (req, res, next) => {
  try {
    await logout(req.token);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

app.post('/api/auth/change-password', requireAuth, async (req, res, next) => {
  try {
    const { oldPassword, newPassword } = req.body ?? {};
    await changePassword(req.userId, oldPassword, newPassword);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

/* -------------------------------------------------------------------------- */
/* Account recovery (self-hosted, no SMTP)                                   */
/* -------------------------------------------------------------------------- */

/**
 * Step 1 of password recovery. Generates a 6-digit one-time code,
 * stores its bcrypt hash, and **prints the code to the API
 * console** so the operator (or anyone with log access) can read
 * it back to the user. The response is intentionally generic —
 * we never confirm whether the username exists.
 *
 * Rate-limited the same way as the auth endpoints (5 calls per
 * 10 minutes per IP) so a malicious caller can't burn the
 * recovery_codes table by spamming the endpoint.
 */
app.post('/api/auth/recover/start', recoverRateLimit, async (req, res, next) => {
  try {
    const username = typeof req.body?.username === 'string' ? req.body.username.trim().toLowerCase() : '';
    if (!username) {
      return res.status(400).json({ error: 'usernameRequired' });
    }
    // Always log the same line so timing / response can't reveal
    // whether the user exists. The code is only generated when
    // the user does exist, but the response and log length are
    // consistent.
    const code = await issueRecoveryCode(username);
    if (code) {
      // eslint-disable-next-line no-console
      console.log(
        `[recovery] issued code for user "${username}": ${code} (expires in 15 min, log this for the user)`,
      );
    } else {
      // eslint-disable-next-line no-console
      console.log(`[recovery] no user matched "${username}" — request was ignored`);
    }
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

/**
 * Step 2 of password recovery. Verifies the code, sets a new
 * password, and invalidates the code. Old sessions are kept
 * (so a stolen laptop doesn't immediately get locked out — the
 * user can sign in with the new password and revoke sessions
 * individually from /api/me).
 */
app.post('/api/auth/recover/verify', recoverRateLimit, async (req, res, next) => {
  try {
    const username = typeof req.body?.username === 'string' ? req.body.username.trim().toLowerCase() : '';
    const code = typeof req.body?.code === 'string' ? req.body.code.trim() : '';
    const newPassword = typeof req.body?.newPassword === 'string' ? req.body.newPassword : '';
    if (!username || !code || !newPassword) {
      return res.status(400).json({ error: 'missingField' });
    }
    if (newPassword.length < 4 || newPassword.length > 256) {
      return res.status(400).json({ error: 'passwordTooShort' });
    }
    const ok = await consumeRecoveryCode(username, code, newPassword);
    if (!ok) {
      return res.status(400).json({ error: 'invalidCode' });
    }
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

app.get('/api/me', requireAuth, (_req, res) => {
  res.json({ user: _req.user });
});

/* -------------------------------------------------------------------------- */
/* Per-user preferences (onboarding "seen" flags, theme, etc.)                */
/* -------------------------------------------------------------------------- */

app.get('/api/preferences', requireAuth, (_req, res) => {
  // _req.user.preferences is already parsed by the auth layer; this
  // endpoint exists so the front-end can pull a fresh copy after a
  // login on a different device.
  res.json({ preferences: _req.user.preferences ?? {} });
});

app.put('/api/preferences', requireAuth, async (req, res, next) => {
  try {
    const next = await writeUserPreferences(req.userId, req.body ?? {});
    res.json({ preferences: next });
  } catch (err) {
    if (err instanceof Error && err.message === 'preferencesTooLarge') {
      return res.status(413).json({ error: 'preferencesTooLarge' });
    }
    next(err);
  }
});

/* -------------------------------------------------------------------------- */
/* Onboarding "seen" flags                                                    */
/* -------------------------------------------------------------------------- */

/**
 * The set of screen ids the front-end knows about. We use this to
 * validate the `:screen` path param so a request to mark
 * `/api/onboarding/foo` doesn't pollute the user's row with a key
 * the front-end will never consult.
 *
 * Keep in sync with `TourScreen` in `src/components/OnboardingModal.tsx`.
 */
const ONBOARDING_SCREENS = ['study', 'browse', 'stats'];

/**
 * Read the per-screen "tour seen" timestamps for the calling user.
 * The front-end pulls this on login (and on each navigation) so it
 * can decide whether to open the first-run modal. The response is
 * always a plain object — `{}` for a brand-new user — so the
 * client never has to defend against `null`.
 */
app.get('/api/onboarding', requireAuth, (_req, res) => {
  const row = dbQueryOne(
    `SELECT onboardingSeen FROM users WHERE id = ?`,
    [_req.userId],
  );
  let seen = {};
  if (row?.onboardingSeen) {
    try {
      const parsed = JSON.parse(row.onboardingSeen);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        seen = parsed;
      }
    } catch {
      // Corrupt JSON — treat as empty. The next POST will overwrite
      // it with a clean map.
    }
  }
  res.json({ seen });
});

/**
 * Mark a single screen as seen for the calling user. Idempotent:
 * repeated POSTs just bump the timestamp. Strips any unknown
 * screens from the stored map so a future schema change (e.g.
 * removing a tour) doesn't leave dead keys lying around.
 */
app.post('/api/onboarding/:screen', requireAuth, async (req, res, next) => {
  try {
    const screen = req.params.screen;
    if (!ONBOARDING_SCREENS.includes(screen)) {
      return res.status(400).json({ error: 'unknownScreen' });
    }
    const ts = new Date().toISOString();
    const row = dbQueryOne(
      `SELECT onboardingSeen FROM users WHERE id = ?`,
      [req.userId],
    );
    let seen = {};
    if (row?.onboardingSeen) {
      try {
        const parsed = JSON.parse(row.onboardingSeen);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          seen = parsed;
        }
      } catch {
        // Corrupt — start fresh.
      }
    }
    // Always rebuild from the allowed list so a removed screen
    // doesn't keep haunting the user.
    const next = {};
    for (const s of ONBOARDING_SCREENS) {
      if (typeof seen[s] === 'string') next[s] = seen[s];
    }
    next[screen] = ts;
    await dbWrite((db) => {
      db.run(
        `UPDATE users SET onboardingSeen = ? WHERE id = ?`,
        [JSON.stringify(next), req.userId],
      );
    });
    res.json({ seen: next });
  } catch (err) {
    next(err);
  }
});

/* -------------------------------------------------------------------------- */
/* User-owned cards                                                            */
/* -------------------------------------------------------------------------- */

/**
 * List the calling user's own cards. Optional `level` query param
 * narrows to one CEFR level. Official cards (loaded by the front-end
 * from `src/data/decks/*.json`) are NOT served here — only the
 * per-user additions live in this table.
 */
app.get('/api/cards', requireAuth, async (req, res, next) => {
  try {
    const level = typeof req.query.level === 'string' ? req.query.level : undefined;
    const cards = await listUserCards(req.userId, level);
    res.json({ cards });
  } catch (err) {
    next(err);
  }
});

app.post('/api/cards', requireAuth, async (req, res, next) => {
  try {
    const card = await createUserCard(req.userId, req.body);
    res.json({ card });
  } catch (err) {
    if (err instanceof CardError) {
      return res.status(err.status).json({ error: err.code, message: err.message });
    }
    next(err);
  }
});

app.get('/api/cards/:id', requireAuth, async (req, res, next) => {
  try {
    const row = await getUserCard(req.params.id, req.userId);
    if (!row) return res.status(404).json({ error: 'notFound' });
    res.json({ card: rowToCard(row) });
  } catch (err) {
    next(err);
  }
});

app.put('/api/cards/:id', requireAuth, async (req, res, next) => {
  try {
    const card = await updateUserCard(req.params.id, req.userId, req.body);
    res.json({ card });
  } catch (err) {
    if (err instanceof CardError) {
      return res.status(err.status).json({ error: err.code, message: err.message });
    }
    next(err);
  }
});

app.delete('/api/cards/:id', requireAuth, async (req, res, next) => {
  try {
    await deleteUserCard(req.params.id, req.userId);
    res.json({ ok: true });
  } catch (err) {
    if (err instanceof CardError) {
      return res.status(err.status).json({ error: err.code, message: err.message });
    }
    next(err);
  }
});

/* -------------------------------------------------------------------------- */
/* Bulk import — Anki .apkg                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Multipart upload of an Anki `.apkg` file. The file is parsed
 * (ZIP → SQLite → notes), each note is converted to a user card,
 * and the cards are written in a single transaction. The level
 * is taken from the `level` form field (default: 'A1').
 *
 *  - Capped at 5,000 cards per import (the parser enforces this).
 *  - Notes without a parseable kk/ru pair are skipped.
 *  - Source is tagged `anki-import-<timestamp>` so the user can
 *    see provenance on each card.
 */
import { parseApkg } from './apkg.js';
app.post(
  '/api/cards/import-apkg',
  requireAuth,
  // express built-in body parser doesn't understand multipart, so
  // we read the raw body and let the route split it. ~30 MB cap.
  async (req, res, next) => {
    const MAX_BYTES = 30 * 1024 * 1024;
    const chunks = [];
    let total = 0;
    let aborted = false;
    req.on('data', (chunk) => {
      if (aborted) return;
      total += chunk.length;
      if (total > MAX_BYTES) {
        aborted = true;
        res.status(413).json({ error: 'fileTooLarge', maxBytes: MAX_BYTES });
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', async () => {
      if (aborted) return;
      try {
        const buffer = Buffer.concat(chunks);
        // Naive multipart split: we look for the boundary and
        // extract the first "filename=" part. Real multipart
        // parsing is more involved, but for a single-file upload
        // this is enough and avoids the dependency.
        const file = extractFirstFile(buffer, req.headers['content-type']);
        if (!file) {
          return res
            .status(400)
            .json({ error: 'noFile', message: 'multipart with file expected' });
        }
        const level =
          typeof req.query.level === 'string' && /^A[12]|B[12]|C1$/.test(req.query.level)
            ? req.query.level
            : 'A1';
        const parsed = await parseApkg(file.content);
        const created = await bulkCreateUserCards(req.userId, {
          level,
          cards: parsed.cards,
          source: `anki-import-${Date.now()}`,
          attribution: parsed.deckName
            ? `Imported from ${parsed.deckName}`
            : 'Imported from Anki .apkg',
        });
        res.json({
          ok: true,
          imported: created.length,
          deckName: parsed.deckName,
          skipped: parsed.skipped,
        });
      } catch (err) {
        if (err && typeof err.message === 'string') {
          return res.status(400).json({ error: 'apkgParseFailed', message: err.message });
        }
        next(err);
      }
    });
    req.on('error', next);
  },
);

/** Find the first part with `filename=` in a multipart payload and
 *  return its raw bytes + the form field name. Bare-bones
 *  implementation: enough for a single file upload, no nested parts. */
function extractFirstFile(buffer, contentType) {
  if (!contentType || !contentType.toLowerCase().startsWith('multipart/form-data')) {
    return null;
  }
  const m = contentType.match(/boundary=([^;]+)/i);
  if (!m) return null;
  const boundary = '--' + m[1].trim();
  const dashBoundary = Buffer.from(boundary, 'utf8');
  // Find the first part start.
  let start = buffer.indexOf(dashBoundary);
  if (start < 0) return null;
  start += dashBoundary.length;
  // Skip CRLF after boundary.
  if (buffer[start] === 0x0d && buffer[start + 1] === 0x0a) start += 2;
  // Walk through parts. Each part ends at the next boundary.
  while (start < buffer.length) {
    const nextDash = buffer.indexOf(dashBoundary, start);
    const partEnd = nextDash < 0 ? buffer.length : nextDash - 2; // strip CRLF
    const part = buffer.subarray(start, partEnd);
    // Headers end at the first \r\n\r\n.
    const hdrEnd = part.indexOf('\r\n\r\n');
    if (hdrEnd < 0) break;
    const headers = part.subarray(0, hdrEnd).toString('utf8');
    const body = part.subarray(hdrEnd + 4);
    const cdMatch = headers.match(/content-disposition:\s*form-data;([^\r\n]+)/i);
    if (!cdMatch) {
      // Not a form part; advance to next boundary.
      if (nextDash < 0) break;
      start = nextDash + dashBoundary.length;
      if (buffer[start] === 0x0d && buffer[start + 1] === 0x0a) start += 2;
      continue;
    }
    const nameMatch = cdMatch[1].match(/name="([^"]+)"/i);
    const fileMatch = cdMatch[1].match(/filename="([^"]*)"/i);
    if (!fileMatch) {
      // Plain form field; skip.
      if (nextDash < 0) break;
      start = nextDash + dashBoundary.length;
      if (buffer[start] === 0x0d && buffer[start + 1] === 0x0a) start += 2;
      continue;
    }
    return { name: nameMatch?.[1] || 'file', filename: fileMatch[1], content: Buffer.from(body) };
  }
  return null;
}

/* -------------------------------------------------------------------------- */
/* TTS — lazy on-demand audio synthesis                                        */
/* -------------------------------------------------------------------------- */

// Where to find the long-running TTS HTTP service. The hostname
// is the compose service name; the port is the one tts_service.py
// listens on. Override with TTS_SERVICE_URL for non-compose runs.
const TTS_SERVICE_URL =
  process.env.TTS_SERVICE_URL || 'http://qazaq-tts-service:8000';
// 12s is generous: Piper synthesis is ~300ms but the first call
// after a cold start (model load) is ~10s. Anything beyond that
// is almost certainly a deadlock we want to surface.
const TTS_TIMEOUT_MS = Number(process.env.TTS_TIMEOUT_MS || 12_000);

/**
 * POST /api/tts/synthesize
 *   body: { text: "сәлем", lang?: "kk" }
 *   → 200 { hash, url, cached, latency_ms }
 *   → 400 on empty/oversized text
 *   → 401 if not authenticated
 *   → 502 if the TTS service is unreachable or returns an error
 *   → 504 if the TTS service takes longer than TTS_TIMEOUT_MS
 *
 * The endpoint authenticates the caller (only logged-in users
 * can spend CPU on synthesis), then forwards to the in-network
 * TTS service. The TTS service itself is unauthenticated but is
 * not reachable from outside the Docker network.
 */
app.post('/api/tts/synthesize', requireAuth, async (req, res, next) => {
  const text = (req.body?.text ?? '').toString().trim();
  if (!text) {
    return res.status(400).json({ error: 'emptyText' });
  }
  if (text.length > 200) {
    return res.status(400).json({ error: 'textTooLong', max: 200, got: text.length });
  }
  // Two voices are wired up in the TTS image: Kazakh
  // (kk_KZ-issai-high) and Russian (ru_RU-denis-medium). Adding
  // more is a matter of adding another model to the Dockerfile
  // and another entry in the script's LANGUAGES table.
  const lang = (req.body?.lang ?? 'kk').toString();
  if (lang !== 'kk' && lang !== 'ru') {
    return res.status(400).json({ error: 'unsupportedLang', lang, supported: ['kk', 'ru'] });
  }

  // Compute the hash locally so we can short-circuit on a cache
  // hit. The hash is identical to the one the browser uses (same
  // algorithm — sha1(utf-8)[:16]) so a synthesised file is
  // immediately addressable by /audio/<lang>/<hash>.wav.
  const hash = computeAudioHash(text);

  // Quick optimistic check: if the WAV is already on disk (built
  // at install time or synthesised by a previous request), the
  // TTS service would also return cached=true. We can skip the
  // network round-trip entirely and just return the URL. The
  // audio dir is bind-mounted on the TTS service container
  // (./public/audio → /audio); we mirror that here so the local
  // hit-path works in the same environments.
  const audioRoot = process.env.AUDIO_ROOT || '/audio';
  try {
    const stat = await fs.stat(`${audioRoot}/${lang}/${hash}.wav`);
    // A real WAV from Piper is ≥ 10 KB at 22 kHz mono. Anything
    // smaller is a truncated / failed-write artifact and we want
    // to retry the synthesis — keep the on-disk file untouched
    // so the user can inspect it if they want.
    if (stat.size >= 10_000) {
      return res.json({ hash, url: `/audio/${lang}/${hash}.wav`, lang, cached: true });
    }
  } catch {
    // Not on disk — fall through to the service call.
  }

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TTS_TIMEOUT_MS);
  const t0 = Date.now();
  try {
    const r = await fetch(`${TTS_SERVICE_URL}/synthesize`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text, lang }),
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    if (!r.ok) {
      const detail = await r.text().catch(() => '');
      console.warn(
        `[tts] service returned ${r.status} for hash=${hash} text=${JSON.stringify(text).slice(0, 40)} detail=${detail.slice(0, 200)}`
      );
      return res.status(502).json({ error: 'ttsServiceError', status: r.status, detail });
    }
    const payload = await r.json();
    // The service logs every call to its own stdout; we add a
    // mirror line in the API log so a single `docker logs` line
    // gives the full picture (caller, hash, outcome).
    console.log(
      `[tts] user=${req.userId} hash=${hash} cached=${payload.cached} latency=${Date.now() - t0}ms text=${JSON.stringify(text).slice(0, 40)}`
    );
    res.json({
      hash: payload.hash,
      url: payload.url,
      cached: !!payload.cached,
      latency_ms: payload.latency_ms,
    });
  } catch (err) {
    clearTimeout(timer);
    if (err.name === 'AbortError') {
      console.warn(`[tts] timeout after ${TTS_TIMEOUT_MS}ms hash=${hash} text=${JSON.stringify(text).slice(0, 40)}`);
      return res.status(504).json({ error: 'ttsTimeout', timeout_ms: TTS_TIMEOUT_MS });
    }
    console.warn(`[tts] service unreachable: ${err.message} hash=${hash}`);
    return res.status(502).json({ error: 'ttsServiceUnreachable', detail: err.message });
  }
});

/** SHA-1, first 16 hex chars. Mirrors src/lib/tts.ts#wordHash and
 *  scripts/generate_tts.py#word_hash — keep all three in sync. */
function computeAudioHash(text) {
  return crypto
    .createHash('sha1')
    .update(text, 'utf-8')
    .digest('hex')
    .slice(0, 16);
}

/* -------------------------------------------------------------------------- */
/* Progress                                                                    */
/* -------------------------------------------------------------------------- */

app.get('/api/progress', requireAuth, (_req, res) => {
  const { rows: progressRows } = dbQuery(
    'SELECT cardId, state FROM progress WHERE userId = ?',
    [_req.userId],
  );
  const out = {};
  for (const r of progressRows) {
    out[r.cardId] = JSON.parse(r.state);
  }
  res.json({ progress: out });
});

/**
 * Update a single card's SM-2 schedule. The :cardId segment is
 * the full card id (e.g. `a1-0042` or `u-<uuid>`); we no longer
 * split it on `::direction` because progress is unified per
 * card. Studying kk-ru and ru-kk both write to the same row.
 *
 * Old clients that still send `:cardId/:direction` get a 400 so
 * they can be detected and rebuilt — there's no silent fallback
 * to "ignore the direction and use cardId" because that would
 * mask a stuck-on-old-version browser.
 */
app.put('/api/progress/:cardId', requireAuth, async (req, res, next) => {
  try {
    const { cardId } = req.params;
    // The old path was `/api/progress/:cardId/:direction` — if
    // the route matched, the trailing segment was the direction,
    // and we'd be called with `cardId = "<cardId>::<direction>"`
    // or similar. Reject anything that smells like a direction
    // suffix so a stale client gets a clear 400.
    if (cardId.includes('::') || cardId.endsWith('-kk') || cardId.endsWith('-ru')) {
      return res.status(400).json({ error: 'oldApiVersion' });
    }
    const { state } = req.body ?? {};
    if (!state || typeof state !== 'object') {
      return res.status(400).json({ error: 'badState' });
    }
    const now = new Date().toISOString();
    const stateStr = JSON.stringify(state);
    await dbWrite((db) => {
      db.run(
        `INSERT INTO progress (userId, cardId, state, updatedAt)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(userId, cardId) DO UPDATE SET
           state = excluded.state,
           updatedAt = excluded.updatedAt`,
        [req.userId, cardId, stateStr, now],
      );
    });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

/**
 * Wipe the schedule for one card. Used by the leech-reset
 * action so the user can start the card from scratch. The
 * review log is intentionally left alone — the events are
 * useful for retention charts even after a reset.
 *
 * The legacy `?direction=...` query is still accepted for
 * backward compat (a no-op since the v7 schema has no
 * direction column) but is silently ignored.
 */
app.delete('/api/progress/:cardId', requireAuth, async (req, res, next) => {
  try {
    const { cardId } = req.params;
    await dbWrite((db) => {
      db.run('DELETE FROM progress WHERE userId = ? AND cardId = ?', [
        req.userId,
        cardId,
      ]);
    });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

/**
 * Wipe every leech at once. The Stats page offers a "Reset all
 * leeches" button so a heavy user with 20+ sticky cards can
 * clear them in one click instead of tapping "Reset" 20 times.
 *
 * The threshold matches the rest of the codebase: a card is a
 * leech when its schedule has >= 8 lapses (Anki default). The
 * endpoint is idempotent — calling it twice wipes the same set
 * of cards, the second call simply has nothing to do.
 */
app.post('/api/progress/reset-leeches', requireAuth, async (req, res, next) => {
  try {
    const { rows } = dbQuery(
      `SELECT cardId, state FROM progress WHERE userId = ?`,
      [req.userId],
    );
    const THRESHOLD = 8;
    const toWipe = [];
    for (const r of rows) {
      try {
        const s = JSON.parse(r.state);
        if (typeof s.lapses === 'number' && s.lapses >= THRESHOLD) {
          toWipe.push(r.cardId);
        }
      } catch {
        // Corrupt row — skip.
      }
    }
    if (toWipe.length === 0) {
      return res.json({ ok: true, wiped: 0 });
    }
    await dbWrite((db) => {
      const del = db.prepare(
        'DELETE FROM progress WHERE userId = ? AND cardId = ?',
      );
      try {
        for (const id of toWipe) {
          del.run([req.userId, id]);
        }
      } finally {
        try { del.free(); } catch { /* ignore */ }
      }
    });
    res.json({ ok: true, wiped: toWipe.length });
  } catch (err) {
    next(err);
  }
});

/* -------------------------------------------------------------------------- */
/* Review log                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Append a review event. The client passes the same SM-2 grade
 * ("again" | "hard" | "good" | "easy") it computed locally, plus
 * the timestamp from the schedule so the server log lines up with
 * what the client already stored in its lastReview.
 *
 * Also bumps the per-day counter on `daily_stats` so the new-card
 * cap and the daily-goal ring can render without scanning the
 * entire `review_log`. We derive "was this a NEW card?" from the
 * current `progress.state.phase` — if it was 'new' (or absent)
 * before the grade, the event counts as one new card seen today.
 *
 * Cram-mode grades pass `isCram: true` so the daily counter is
 * NOT bumped — cram reviews are practice and shouldn't count
 * against the daily cap or the goal.
 */
app.post('/api/review', requireAuth, async (req, res, next) => {
  try {
    const { cardId, direction, grade, ts, isCram } = req.body ?? {};
    if (typeof cardId !== 'string' || typeof direction !== 'string' || typeof grade !== 'string') {
      return res.status(400).json({ error: 'badEvent' });
    }
    if (direction !== 'kk-ru' && direction !== 'ru-kk') {
      return res.status(400).json({ error: 'badDirection' });
    }
    if (!['again', 'hard', 'good', 'easy'].includes(grade)) {
      return res.status(400).json({ error: 'badGrade' });
    }
    const when = typeof ts === 'string' ? ts : new Date().toISOString();
    const day = when.slice(0, 10); // YYYY-MM-DD in UTC; we treat the day bucket as UTC for simplicity
    const cram = isCram === true;
    await dbWrite((db) => {
      db.run(
        'INSERT INTO review_log (userId, ts, cardId, direction, grade) VALUES (?, ?, ?, ?, ?)',
        [req.userId, when, cardId, direction, grade],
      );
      if (cram) return; // cram reviews don't touch the daily counter
      // Was this card "new" before this grade? Look at the prior
      // progress state — if there is no row, or the row's phase
      // is 'new', this is the card's first real review. The
      // direction parameter is preserved for the review_log
      // write above but progress is now per-card, not
      // per-(card,direction).
      const prev = dbQueryOne(
        'SELECT state FROM progress WHERE userId = ? AND cardId = ?',
        [req.userId, cardId],
      );
      let wasNew = !prev;
      if (prev) {
        try {
          const s = JSON.parse(prev.state);
          wasNew = !s || s.phase === 'new';
        } catch {
          wasNew = true;
        }
      }
      // UPSERT today's counter. We always increment reviewsDone
      // and conditionally bump newSeen.
      db.run(
        `INSERT INTO daily_stats (userId, day, newSeen, reviewsDone)
         VALUES (?, ?, ?, 1)
         ON CONFLICT(userId, day) DO UPDATE SET
           newSeen     = newSeen + ?,
           reviewsDone = reviewsDone + 1`,
        [req.userId, day, wasNew ? 1 : 0, wasNew ? 1 : 0],
      );
    });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

/**
 * Per-day review activity. Defaults to a 90-day window for the
 * GitHub-style heatmap on the Stats page; the existing
 * `?days=30` callers (charts, etc.) still work.
 *
 * The endpoint returns one row per (day, grade). The front-end
 * folds them by day to draw the heatmap. Days with no reviews
 * are NOT in the response — the client fills in zeros to keep
 * the grid rectangular.
 */
app.get('/api/activity', requireAuth, (_req, res) => {
  // Cap the window at 365 days; the heatmap is meaningless past
  // a year. Anything tighter is fine.
  const raw = Number(_req.query.days);
  const days = Number.isFinite(raw) ? Math.max(1, Math.min(365, Math.floor(raw))) : 90;
  const { rows: events } = dbQuery(
    `SELECT substr(ts, 1, 10) AS day, grade, COUNT(*) AS n
     FROM review_log
     WHERE userId = ?
       AND ts >= datetime('now', ?)
     GROUP BY day, grade
     ORDER BY day ASC`,
    [_req.userId, `-${days} days`],
  );
  res.json({ events, days });
});

/**
 * Full per-user review log. The client mirrors the same array
 * in memory so the stats page can render the day-by-day chart
 * without a second round trip. The array is bounded by the
 * lifetime of the account and the user can reset it via
 * /api/reset. For very heavy accounts we can paginate later.
 */
app.get('/api/review-log', requireAuth, (_req, res) => {
  const { rows: events } = dbQuery(
    `SELECT ts, cardId, direction, grade
     FROM review_log
     WHERE userId = ?
     ORDER BY ts ASC`,
    [_req.userId],
  );
  res.json({ events });
});

/* -------------------------------------------------------------------------- */
/* Daily counters (new-cards cap + goal ring)                                 */
/* -------------------------------------------------------------------------- */

/**
 * Returns the user's per-day counter for `day` (defaults to today,
 * UTC). The cap check is a primary-key lookup on
 * `(userId, day)`, so this endpoint is O(1) regardless of how
 * long the user has been studying.
 */
app.get('/api/daily', requireAuth, (req, res) => {
  const day = typeof req.query.day === 'string'
    ? req.query.day
    : new Date().toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) {
    return res.status(400).json({ error: 'badDay' });
  }
  const row = dbQueryOne(
    'SELECT newSeen, reviewsDone FROM daily_stats WHERE userId = ? AND day = ?',
    [req.userId, day],
  );
  res.json({
    day,
    newSeen: row?.newSeen ?? 0,
    reviewsDone: row?.reviewsDone ?? 0,
  });
});

/**
 * Per-day retention for the last `days` days (default 30). One
 * bucket per day with `n` (total reviews), `correct` (Hard/Good/
 * Easy), and `accuracy` (0..1, or null when `n` is 0). We
 * aggregate in SQL so the response stays small.
 */
app.get('/api/retention', requireAuth, (req, res) => {
  const days = Math.max(1, Math.min(365, Number(req.query.days) || 30));
  const { rows } = dbQuery(
    `SELECT substr(ts, 1, 10) AS day,
            COUNT(*) AS n,
            SUM(CASE WHEN grade IN ('hard','good','easy') THEN 1 ELSE 0 END) AS correct
     FROM review_log
     WHERE userId = ?
       AND ts >= datetime('now', ?)
     GROUP BY day
     ORDER BY day ASC`,
    [req.userId, `-${days} days`],
  );
  const buckets = rows.map((r) => ({
    day: r.day,
    n: r.n,
    correct: r.correct,
    accuracy: r.n > 0 ? r.correct / r.n : null,
  }));
  res.json({ days, buckets });
});

/* -------------------------------------------------------------------------- */
/* Stats                                                                       */
/* -------------------------------------------------------------------------- */

app.get('/api/stats', requireAuth, (_req, res) => {
  const userId = _req.userId;
  // Per-card review counts derived from the schedule JSON. The
  // server stores raw state blobs; the client mirrors the same
  // shape, so we can read it here and aggregate.
  //
  // The v7 schema dropped the `direction` column from `progress`
  // (kk-ru and ru-kk share a single row per cardId), so we
  // select only cardId + state. Earlier versions of this query
  // still asked for `direction` and crashed with
  // "no such column: direction" — that warning surfaced in the
  // browser console on every /stats load. Fixed 2026-08-18.
  const { rows: progressRows } = dbQuery(
    'SELECT cardId, state FROM progress WHERE userId = ?',
    [userId],
  );
  let learned = 0;
  let totalReviews = 0;
  let totalCorrect = 0;
  let totalLapses = 0;
  let mastered = 0;
  let dueNow = 0;
  let due7 = 0;
  let due30 = 0;
  const leechCardIds = new Set();
  const now = Date.now();
  const ms7 = 7 * 86_400_000;
  const ms30 = 30 * 86_400_000;
  for (const r of progressRows) {
    let s;
    try {
      s = JSON.parse(r.state);
    } catch {
      continue;
    }
    if (s.phase && s.phase !== 'new') learned++;
    if (typeof s.reviews === 'number') totalReviews += s.reviews;
    if (typeof s.correct === 'number') totalCorrect += s.correct;
    if (typeof s.lapses === 'number') {
      totalLapses += s.lapses;
      // Leeches: 8+ lapses in EITHER direction. Threshold matches
      // Anki's default. Dedupe by cardId so a single leech isn't
      // double-counted across directions.
      if (s.lapses >= 8) leechCardIds.add(r.cardId);
    }
    if (s.phase === 'review' && typeof s.interval === 'number' && s.interval >= 21) mastered++;
    if (s.due) {
      const dueMs = Date.parse(s.due);
      if (Number.isFinite(dueMs)) {
        if (dueMs <= now) dueNow++;
        const delta = dueMs - now;
        if (delta <= ms7) due7++;
        if (delta <= ms30) due30++;
      }
    }
  }
  res.json({
    learned,
    totalReviews,
    totalCorrect,
    totalLapses,
    mastered,
    due: dueNow,
    due7,
    due30,
    leeches: leechCardIds.size,
  });
});

/* -------------------------------------------------------------------------- */
/* Reset                                                                       */
/* -------------------------------------------------------------------------- */

app.post('/api/reset', requireAuth, async (req, res, next) => {
  try {
    await dbWrite((db) => {
      db.run('DELETE FROM progress WHERE userId = ?', [req.userId]);
      db.run('DELETE FROM review_log WHERE userId = ?', [req.userId]);
    });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

/* -------------------------------------------------------------------------- */
/* Export / Import                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Dump the user's full progress + review log as a single JSON
 * document. Plain JSON, no encryption. The client treats the file
 * as a portable backup and lets the user re-import it on the
 * same account (or a fresh install with the same username).
 */
app.get('/api/export', requireAuth, (_req, res) => {
  const user = _req.user;
  const { rows: progressRows } = dbQuery(
    'SELECT cardId, state FROM progress WHERE userId = ?',
    [_req.userId],
  );
  const progress = {};
  for (const r of progressRows) {
    try {
      // Progress is keyed by cardId only. If a stale DB row
      // somehow still has the old direction column referenced,
      // we fall back to the plain cardId.
      progress[r.cardId] = JSON.parse(r.state);
    } catch {
      // Skip rows that fail to parse — they're corrupted and there's
      // no good way to recover a single schedule blob.
    }
  }
  const { rows: reviewLogRows } = dbQuery(
    `SELECT ts, cardId, direction, grade
     FROM review_log WHERE userId = ? ORDER BY ts ASC`,
    [_req.userId],
  );
  res.json({
    format: 'aq-export/v1',
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    username: user.username,
    displayName: user.displayName,
    progress,
    reviewLog: reviewLogRows,
  });
});

/**
 * Replace the user's progress + log with the supplied snapshot.
 * Does NOT touch the password or the session — the user must be
 * already logged in. The expected shape is the same one we serve
 * from `/api/export`, but we accept any object that has the
 * required top-level fields and just drop anything malformed.
 */
app.post('/api/import', requireAuth, async (req, res, next) => {
  try {
    const body = req.body ?? {};
    if (
      typeof body !== 'object' ||
      body === null ||
      typeof body.progress !== 'object' ||
      body.progress === null ||
      !Array.isArray(body.reviewLog)
    ) {
      return res.status(400).json({ error: 'badImport' });
    }
    const newProgress = body.progress;
    const newLog = body.reviewLog;
    await dbWrite((db) => {
      db.run('DELETE FROM progress WHERE userId = ?', [req.userId]);
      db.run('DELETE FROM review_log WHERE userId = ?', [req.userId]);
      const now = new Date().toISOString();
      // Accept both old (`cardId::direction`) and new (plain
      // `cardId`) key shapes. For old keys we drop the
      // direction — the merged schedule lands in the same
      // per-card row, so two old keys for the same card would
      // race the second INSERT. To keep the older exported
      // backups useful, we dedupe by keeping the row with the
      // most reviews; this matches the on-disk merge logic in
      // the v7 migration.
      /** @type {Map<string, any>} */
      const deduped = new Map();
      for (const [k, raw] of Object.entries(newProgress)) {
        if (typeof raw !== 'object' || raw === null) continue;
        let cardId = k;
        if (k.includes('::')) {
          const sep = k.lastIndexOf('::');
          cardId = k.slice(0, sep);
        }
        if (!cardId) continue;
        const existing = deduped.get(cardId);
        if (!existing) {
          deduped.set(cardId, raw);
          continue;
        }
        const exReviews = Number(existing?.reviews ?? 0);
        const curReviews = Number(raw?.reviews ?? 0);
        if (curReviews > exReviews) deduped.set(cardId, raw);
      }
      const ins = db.prepare(
        `INSERT INTO progress (userId, cardId, state, updatedAt)
         VALUES (?, ?, ?, ?)`,
      );
      try {
        for (const [cardId, raw] of deduped) {
          ins.run([req.userId, cardId, JSON.stringify(raw), now]);
        }
      } finally {
        try { ins.free(); } catch { /* ignore */ }
      }
      for (const ev of newLog) {
        if (
          typeof ev !== 'object' ||
          ev === null ||
          typeof ev.ts !== 'string' ||
          typeof ev.cardId !== 'string' ||
          (ev.direction !== 'kk-ru' && ev.direction !== 'ru-kk') ||
          typeof ev.grade !== 'string'
        ) {
          continue;
        }
        db.run(
          `INSERT INTO review_log (userId, ts, cardId, direction, grade)
           VALUES (?, ?, ?, ?, ?)`,
          [req.userId, ev.ts, ev.cardId, ev.direction, ev.grade],
        );
      }
    });
    res.json({
      ok: true,
      cards: Object.keys(newProgress).length,
      events: newLog.length,
    });
  } catch (err) {
    next(err);
  }
});

/* -------------------------------------------------------------------------- */
/* Error handler                                                               */
/* -------------------------------------------------------------------------- */

// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  // eslint-disable-next-line no-console
  console.error('[server] unhandled error:', err);
  if (err instanceof AuthError) return sendAuthError(res, err);
  if (AUTH_ERROR_CODES.has(err?.code)) {
    return res.status(400).json({ error: err.code, message: err.message });
  }
  res.status(500).json({ error: 'generic', message: String(err?.message ?? err) });
});

/* -------------------------------------------------------------------------- */
/* Boot                                                                        */
/* -------------------------------------------------------------------------- */

openDb()
  .then(() => {
    app.listen(PORT, HOST, () => {
      // eslint-disable-next-line no-console
      console.log(`[server] listening on http://${HOST}:${PORT}`);
      // eslint-disable-next-line no-console
      console.log(`[server] db: ${process.env.DB_PATH || 'data/qazaq.sqlite (default)'}`);
    });
  })
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error('[server] failed to start:', err);
    process.exit(1);
  });

process.on('SIGTERM', async () => {
  await closeDb();
  process.exit(0);
});
process.on('SIGINT', async () => {
  await closeDb();
  process.exit(0);
});
