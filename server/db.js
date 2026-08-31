/**
 * SQLite database for the Qazaq server.
 *
 * Uses `sql.js` (pure JavaScript SQLite via WebAssembly) so we don't
 * need a native build step — works on any host that runs Node.
 * The DB lives in `data/qazaq.sqlite`; on every write we serialise
 * the file to disk via an atomic rename so a crash mid-write
 * can't corrupt it.
 *
 * Schema mirrors the per-user data we had in `localStorage` on the
 * client, plus a `users` table and a `sessions` table for the
 * server-side session token. The per-card progress is a row per
 * (cardId, direction) with a JSON state column — old clients can
 * read this and new clients can add fields without a migration.
 */
import { promises as fs } from 'node:fs';
import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import initSqlJs from 'sql.js';

// DB_PATH is configurable so the e2e suite can point at an isolated
// test database (e.g. `data/test.sqlite`) instead of clobbering the
// dev DB. Defaults to the production-style path so the dev server
// keeps working with no env vars set.
//
// DATA_DIR is derived from DB_PATH (not hardcoded to ./data) so the
// production container with DB_PATH=/data/qazaq.sqlite actually
// writes to /data, not to a fallback /app/data folder inside the
// image that the non-root runtime user can't create.
const DB_PATH = process.env.DB_PATH
  ? path.resolve(process.env.DB_PATH)
  : path.join(process.cwd(), 'data', 'qazaq.sqlite');
const DATA_DIR = path.dirname(DB_PATH);

let SQL;
let db;
let writeQueue = Promise.resolve();

export async function openDb() {
  if (db) return db;
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
  SQL = await initSqlJs();
  if (existsSync(DB_PATH)) {
    const bytes = await fs.readFile(DB_PATH);
    db = new SQL.Database(bytes);
  } else {
    db = new SQL.Database();
  }
  ensureSchema(db);
  await persist();
  return db;
}

export function getDb() {
  if (!db) throw new Error('DB not initialised — call openDb() during boot.');
  return db;
}

/**
 * Bump this whenever the schema changes in a way that needs
 * a migration. `ensureSchema` runs migrations in order; each
 * step is responsible for bumping the version once it has
 * succeeded.
 */
const SCHEMA_VERSION = 4;

function getSchemaVersion(d) {
  const row = d.exec(`SELECT value FROM schema_meta WHERE key = 'version'`)[0];
  if (!row || !row.values.length) return 0;
  const n = Number(row.values[0][0]);
  return Number.isFinite(n) ? n : 0;
}

function setSchemaVersion(d, v) {
  d.run(
    `INSERT INTO schema_meta (key, value) VALUES ('version', ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    [String(v)],
  );
}

function ensureSchema(d) {
  // Idempotent: safe to call on every boot.
  d.exec(`
    CREATE TABLE IF NOT EXISTS schema_meta (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS users (
      id            TEXT PRIMARY KEY,
      username      TEXT NOT NULL UNIQUE,
      displayName   TEXT NOT NULL,
      passwordHash  TEXT NOT NULL,
      createdAt     TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token      TEXT PRIMARY KEY,
      userId     TEXT NOT NULL,
      createdAt  TEXT NOT NULL,
      lastSeenAt TEXT NOT NULL,
      FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(userId);
  `);

  // --- v0 → v1: rebuild progress with userId in the PK ---------------
  // Earlier drafts of this file created `progress` as
  //   PRIMARY KEY (cardId, direction)
  // which would have made the table effectively global and let
  // users overwrite each other's SM-2 state. We detect the
  // broken shape (PK without userId) and rebuild it. No
  // production data was ever written under the old shape.
  const current = getSchemaVersion(d);
  if (current < 1) {
    const info = d.exec(`PRAGMA table_info(progress)`)[0];
    const hasUserId = info?.values?.some((row) => row[1] === 'userId');
    if (info && info.values.length > 0 && !hasUserId) {
      d.exec(`DROP TABLE progress;`);
    }
    d.exec(`
      CREATE TABLE IF NOT EXISTS progress (
        userId    TEXT NOT NULL,
        cardId    TEXT NOT NULL,
        direction TEXT NOT NULL CHECK (direction IN ('kk-ru','ru-kk')),
        state     TEXT NOT NULL,
        updatedAt TEXT NOT NULL,
        PRIMARY KEY (userId, cardId, direction),
        FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
      );
    `);
    d.exec(`
      CREATE TABLE IF NOT EXISTS review_log (
        id        INTEGER PRIMARY KEY AUTOINCREMENT,
        userId    TEXT NOT NULL,
        ts        TEXT NOT NULL,
        cardId    TEXT NOT NULL,
        direction TEXT NOT NULL,
        grade     TEXT NOT NULL,
        FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_review_log_user_ts ON review_log(userId, ts);
      CREATE INDEX IF NOT EXISTS idx_progress_user ON progress(userId);
    `);
    setSchemaVersion(d, 1);
  }

  // --- v1 → v2: per-user card library -------------------------------
  // Official cards live in `src/data/decks/a1.json`...`c1.json` and
  // are bundled with the front-end. Each user can also add their
  // own cards — those are stored here, scoped to the user, never
  // shared. The progress table has no FK to user_cards because
  // progress should survive a card deletion (so the user can re-add
  // it later with the same id and pick up where they left off);
  // the DELETE handler does a best-effort cleanup of orphaned
  // progress rows.
  if (current < 2) {
    d.exec(`
      CREATE TABLE IF NOT EXISTS user_cards (
        id             TEXT PRIMARY KEY,
        ownerUserId    TEXT NOT NULL,
        level          TEXT NOT NULL CHECK (level IN ('A1','A2','B1','B2','C1')),
        category       TEXT NOT NULL,
        kazakh         TEXT NOT NULL,
        transliteration TEXT NOT NULL DEFAULT '',
        translation    TEXT NOT NULL DEFAULT '',
        translationRu  TEXT NOT NULL,
        example        TEXT NOT NULL DEFAULT '',
        source         TEXT,
        sourceUrl      TEXT,
        license        TEXT,
        attribution    TEXT,
        createdAt      TEXT NOT NULL,
        updatedAt      TEXT NOT NULL,
        FOREIGN KEY (ownerUserId) REFERENCES users(id) ON DELETE CASCADE
      );
    `);
    d.exec(`
      CREATE INDEX IF NOT EXISTS idx_user_cards_owner_level
        ON user_cards(ownerUserId, level);
    `);
    setSchemaVersion(d, 2);
  }

  // --- v2 → v3: per-user preferences blob ---------------------------
  // Free-form JSON for things the front-end wants to remember
  // across browsers/devices — onboarding "seen" flags, theme, etc.
  // We keep the blob on the `users` row (not a side table) because
  // preferences are 1:1 with the user and always read together.
  if (current < 3) {
    const info = d.exec(`PRAGMA table_info(users)`)[0];
    const hasPrefs = info?.values?.some((row) => row[1] === 'preferences');
    if (info && info.values.length > 0 && !hasPrefs) {
      d.exec(`ALTER TABLE users ADD COLUMN preferences TEXT NOT NULL DEFAULT '{}';`);
    }
    setSchemaVersion(d, 3);
  }

  // --- v3 → v4: dedicated onboarding-seen column -------------------
  // The onboarding "I've seen the tour for screen X" flag used to
  // live inside the free-form `preferences` JSON blob as
  // `preferences.onboardingSeen`. That worked, but the blob is a
  // generic dump and was making the flag's state fragile: a
  // malformed `preferences` parse would wipe every screen's
  // "seen" state in one stroke, and a stale key in `preferences`
  // for a deleted screen would silently keep re-opening the tour.
  //
  // We promote the flag to a first-class column. The shape is the
  // same — a JSON `{ screen: 'isoTimestamp' }` map — but reading
  // and writing it no longer round-trips through the preferences
  // parser. We also seed the new column from any leftover
  // `onboardingSeen` data in `preferences` so existing users keep
  // their history through the migration.
  if (current < 4) {
    const info = d.exec(`PRAGMA table_info(users)`)[0];
    const hasSeen = info?.values?.some((row) => row[1] === 'onboardingSeen');
    if (info && info.values.length > 0 && !hasSeen) {
      d.exec(`ALTER TABLE users ADD COLUMN onboardingSeen TEXT NOT NULL DEFAULT '{}';`);
      // Best-effort backfill from the old `preferences` blob. The
      // `preferences.onboardingSeen` keys were `${userId}:${screen}:vN`
      // — we extract the screen portion so the new column has
      // the simpler `{ screen: ts }` shape.
      const backfillStmt = d.prepare(
        `SELECT id, preferences FROM users WHERE preferences LIKE '%onboardingSeen%'`,
      );
      const updates = [];
      try {
        while (backfillStmt.step()) {
          const row = backfillStmt.getAsObject();
          let prefs;
          try {
            prefs = JSON.parse(row.preferences);
          } catch {
            continue;
          }
          if (!prefs || typeof prefs !== 'object') continue;
          const old = prefs.onboardingSeen;
          if (!old || typeof old !== 'object') continue;
          const next = {};
          for (const [k, v] of Object.entries(old)) {
            // New keys are bare screen names; old keys were
            // `${userId}:${screen}:vN`. Take the middle part.
            const parts = k.split(':');
            const screen = parts.length >= 2 ? parts[1] : k;
            if (typeof v === 'string' && screen) {
              // Keep the most recent timestamp for each screen.
              if (!next[screen] || v > next[screen]) next[screen] = v;
            }
          }
          if (Object.keys(next).length > 0) {
            updates.push([JSON.stringify(next), row.id]);
          }
        }
      } finally {
        backfillStmt.free();
      }
      for (const [blob, id] of updates) {
        d.run(`UPDATE users SET onboardingSeen = ? WHERE id = ?`, [blob, id]);
      }
    }
    setSchemaVersion(d, 4);
  }

  // --- v4 → v5: per-day counters for the daily cap / goal ring ----
  // The server used to compute "new cards seen today" by scanning
  // review_log on every queue build, which is O(n) per page load
  // and gets worse as the log grows. A dedicated (userId, day)
  // table lets us UPSERT a single row per review, so the cap check
  // becomes a primary-key lookup. Reviews are 1:1 with progress
  // updates, so we maintain both in the same transaction.
  if (current < 5) {
    d.exec(`
      CREATE TABLE IF NOT EXISTS daily_stats (
        userId       TEXT NOT NULL,
        day          TEXT NOT NULL,
        newSeen      INTEGER NOT NULL DEFAULT 0,
        reviewsDone  INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (userId, day),
        FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
      );
    `);
    d.exec(`
      CREATE INDEX IF NOT EXISTS idx_daily_stats_user ON daily_stats(userId);
    `);
    setSchemaVersion(d, 5);
  }

  // --- v5 → v6: account recovery codes -------------------------------
  // Self-hosted apps without SMTP need a password-recovery path
  // that doesn't depend on email. We add a `recovery_codes` table
  // holding short-lived one-time codes (a 6-digit numeric code is
  // generated on demand, hashed with bcrypt, and invalidated after
  // use or expiry). The unhashed code is logged to the API
  // console — the operator can read it back to the user.
  if (current < 6) {
    d.exec(`
      CREATE TABLE IF NOT EXISTS recovery_codes (
        codeHash     TEXT PRIMARY KEY,
        userId       TEXT NOT NULL,
        createdAt    TEXT NOT NULL,
        expiresAt    TEXT NOT NULL,
        consumedAt   TEXT,
        FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
      );
    `);
    d.exec(`
      CREATE INDEX IF NOT EXISTS idx_recovery_user ON recovery_codes(userId);
    `);
    setSchemaVersion(d, 6);
  }

  // --- v6 → v7: unified per-card progress ----------------------------
  // Earlier versions stored one SM-2 schedule per (user, card,
  // direction). That treated the kk-ru and ru-kk faces of the
  // same word as two different cards. The user asked for a single
  // schedule per card: studying kk-ru and studying ru-kk should
  // advance the same interval, the same `due` timestamp, the
  // same "this card is a leech" flag.
  //
  // Migration steps:
  //   1. CREATE TABLE progress_new with PK (userId, cardId) — no
  //      `direction` column.
  //   2. For each (user, card), merge the per-direction rows into
  //      one: pick the row with the most `reviews` (most learning
  //      signal). Ties → pick the kk-ru row so behaviour is
  //      deterministic. Sum `lapses` so leech detection keeps
  //      working. Take the more conservative (later) `due` so the
  //      user isn't suddenly re-surfaced with a card they'd just
  //      re-scheduled.
  //   3. Drop the old table, rename.
  //   4. Rebuild the index.
  if (current < 7) {
    d.exec(`
      CREATE TABLE IF NOT EXISTS progress_new (
        userId    TEXT NOT NULL,
        cardId    TEXT NOT NULL,
        state     TEXT NOT NULL,
        updatedAt TEXT NOT NULL,
        PRIMARY KEY (userId, cardId),
        FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
      );
    `);
    // Pull every existing row, merge in JS (sql.js is in-memory
    // anyway — a single pass keeps the logic readable).
    const { rows: allOld } = dbQuery(
      `SELECT userId, cardId, direction, state, updatedAt
       FROM progress`,
    );
    /** @type {Map<string, { userId: string, cardId: string, state: string, updatedAt: string }>} */
    const merged = new Map();
    for (const r of allOld) {
      let parsed = null;
      try { parsed = JSON.parse(r.state); } catch { parsed = null; }
      // Bail on malformed rows — the merge can't reason about them.
      if (!parsed) continue;
      const key = `${r.userId}::${r.cardId}`;
      const existing = merged.get(key);
      if (!existing) {
        merged.set(key, {
          userId: r.userId,
          cardId: r.cardId,
          state: r.state,
          updatedAt: r.updatedAt,
        });
        continue;
      }
      // Compare: more reviews wins, kk-ru wins ties, conservative
      // due wins otherwise.
      const ex = JSON.parse(existing.state);
      const cur = parsed;
      const exReviews = Number(ex?.reviews ?? 0);
      const curReviews = Number(cur?.reviews ?? 0);
      let keep = existing;
      if (curReviews > exReviews) keep = { ...r };
      else if (curReviews === exReviews && r.direction === 'kk-ru' && existing.direction !== 'kk-ru') {
        keep = { ...r };
      } else if (curReviews === exReviews && r.direction === existing.direction) {
        // Same direction shouldn't happen (PK) but be defensive.
      }
      // Merge lapses: a leech is a leech. If either side has
      // accumulated lapses, keep the count.
      const mergedLapses = Math.max(
        Number(ex?.lapses ?? 0),
        Number(cur?.lapses ?? 0),
      );
      if (mergedLapses !== Number(keep.state ? JSON.parse(keep.state).lapses : 0)) {
        const parsedKeep = JSON.parse(keep.state);
        parsedKeep.lapses = mergedLapses;
        keep = { ...keep, state: JSON.stringify(parsedKeep) };
      }
      // Conservative due: take the later of the two.
      const exDue = ex?.due ? new Date(ex.due).getTime() : 0;
      const curDue = cur?.due ? new Date(cur.due).getTime() : 0;
      const keepParsed = JSON.parse(keep.state);
      if (curDue > exDue && curReviews >= exReviews) {
        keepParsed.due = cur.due;
        keep = { ...keep, state: JSON.stringify(keepParsed) };
      } else if (exDue > curDue && exReviews > curReviews) {
        keepParsed.due = ex.due;
        keep = { ...keep, state: JSON.stringify(keepParsed) };
      }
      merged.set(key, keep);
    }
    const ins = d.prepare(
      `INSERT INTO progress_new (userId, cardId, state, updatedAt)
       VALUES (?, ?, ?, ?)`,
    );
    try {
      d.exec('BEGIN');
      for (const row of merged.values()) {
        ins.run([row.userId, row.cardId, row.state, row.updatedAt]);
      }
      d.exec('COMMIT');
    } catch (err) {
      try { d.exec('ROLLBACK'); } catch { /* ignore */ }
      throw err;
    } finally {
      try { ins.free(); } catch { /* ignore */ }
    }
    d.exec(`DROP TABLE progress;`);
    d.exec(`ALTER TABLE progress_new RENAME TO progress;`);
    d.exec(`CREATE INDEX IF NOT EXISTS idx_progress_user ON progress(userId);`);
    setSchemaVersion(d, 7);
  }
}

/**
 * Atomic write: serialise to a temp file, fsync, then rename over
 * the live DB. This is the same pattern `git`, `sqlite3`, and
 * most server tools use to avoid leaving the DB half-written if
 * the process dies mid-flush.
 */
async function persist() {
  if (!db) return;
  const bytes = Buffer.from(db.export());
  const tmp = `${DB_PATH}.tmp.${process.pid}.${Date.now()}`;
  const fh = await fs.open(tmp, 'w');
  try {
    await fh.writeFile(bytes);
    await fh.sync();
  } finally {
    await fh.close();
  }
  await fs.rename(tmp, DB_PATH);
}

/**
 * Queue writes so two concurrent POSTs can't race on the file
 * rename. Each `dbWrite` call appends to the chain.
 */
export function dbWrite(fn) {
  const result = writeQueue.then(async () => {
    const out = fn(getDb());
    await persist();
    return out;
  });
  writeQueue = result.catch(() => {/* swallow for chain */});
  return result;
}

export function dbQuery(sql, params = []) {
  const stmt = getDb().prepare(sql);
  try {
    stmt.bind(params);
    const rows = [];
    while (stmt.step()) rows.push(stmt.getAsObject());
    return { rows, columns: stmt.getColumnNames() };
  } finally {
    stmt.free();
  }
}

export function dbQueryOne(sql, params = []) {
  const { rows } = dbQuery(sql, params);
  return rows[0] ?? null;
}

export async function closeDb() {
  if (!db) return;
  await persist();
  db.close();
  db = null;
}
