/**
 * Backup file format — the wire contract between "Скачать бэкап" and
 * "Загрузить бэкап" on the stats page.
 *
 * Goals:
 *  - Plain JSON so the user can open the file in a text editor if
 *    anything goes wrong.
 *  - Self-identifying: any random JSON file (e.g. someone picks
 *    `package.json`) is rejected with a clear error, not silently
 *    nuked into a corrupt state.
 *  - Versioned: when we extend the shape (add user cards, decks
 *    metadata, etc.) we bump the schema and the import path can
 *    migrate old files instead of refusing them.
 *  - Stable: a file written today must remain importable in the
 *    next minor release. We do NOT add new required fields without
 *    a schema bump.
 *
 * Wire shape (see `BackupFile` below):
 *
 *   {
 *     "format": "aq-export/v1",
 *     "schemaVersion": 2,
 *     "exportedAt": "2026-08-16T09:00:00.000Z",
 *     "username": "alex",
 *     "displayName": "Alex",
 *     "progress": {
 *       "a1-0001": { "phase": "review", ... }
 *     },
 *     "reviewLog": [
 *       { "ts": "2026-08-15T18:30:00.000Z", "cardId": "a1-0001",
 *         "direction": "kk-ru", "grade": "good" }
 *     ]
 *   }
 *
 * The `format` string doubles as a magic marker — clients refuse any
 * file that doesn't match, so the user gets a clear "this isn't a
 * Qazaq backup" message instead of having their progress replaced
 * with garbage.
 */
import type { CardSchedule, Grade, Phase } from './sm2';
import type { Direction } from '../data/decks';

/** Magic header. Bump the version segment if the shape ever changes
 *  in a backwards-incompatible way; the schemaVersion field is the
 *  authoritative source of truth but this string makes the file
 *  recognisable at a glance (e.g. in a file manager preview). */
export const BACKUP_FORMAT = 'aq-export/v1';

/** Numeric schema. Bump alongside (or independently of) the format
 *  string when fields are added/renamed/removed. `parseBackup` only
 *  accepts files whose `schemaVersion` is in `SUPPORTED_SCHEMA_VERSIONS`. */
export const BACKUP_SCHEMA_VERSION = 2;

/** Schema versions this client knows how to read. Older files can be
 *  imported; newer files (from a future build the user downgraded
 *  from) are rejected with a clear error. */
// v1: per-(card, direction) keys (`a1-0001::kk-ru`)
// v2: per-card keys (`a1-0001`) — unified schedule, kk-ru and
//     ru-kk faces of the same word share a single SM-2 state.
// We still accept v1 on import so users with old backups
// aren't stranded. The server's POST /api/import dedupes the
// per-direction rows into a single per-card row.
export const SUPPORTED_SCHEMA_VERSIONS: readonly number[] = [1, 2];

/** A single review event from the review log. Mirrors the server's
 *  `review_log` table exactly so we can re-insert without a mapping
 *  step. */
export interface BackupReviewEvent {
  ts: string;
  cardId: string;
  direction: Direction;
  grade: Grade;
}

/** The full file as it lives on disk / in `JSON.parse` output. */
export interface BackupFile {
  format: typeof BACKUP_FORMAT;
  schemaVersion: number;
  exportedAt: string;
  username: string;
  displayName: string;
  /** Keyed by `cardId`. One schedule per card — the kk-ru and
   *  ru-kk faces of the same word share a single SM-2 state.
   *  Values are persisted `CardSchedule` blobs verbatim — they
   *  may have extra fields added by a newer server, so we type
   *  as `unknown` at the outer level and let consumers narrow
   *  as needed. */
  progress: Record<string, CardSchedule>;
  reviewLog: BackupReviewEvent[];
}

/** Error codes the UI can translate. We never let a raw exception
 *  bubble up from `parseBackup` — the caller gets a `BackupError`
 *  with one of these codes plus a human message. */
export type BackupErrorCode =
  | 'malformedJson' // file is not valid JSON at all
  | 'wrongFormat' // JSON parses but isn't a Qazaq backup
  | 'unsupportedVersion' // right format, newer schemaVersion
  | 'missingField' // required field is missing/null
  | 'wrongType'; // field present but wrong shape (string vs object)

export class BackupError extends Error {
  code: BackupErrorCode;
  constructor(code: BackupErrorCode, message: string) {
    super(message);
    this.name = 'BackupError';
    this.code = code;
  }
}

/** Runtime guards. Each returns a typed value on success or throws
 *  `BackupError` with a precise `code` on failure. The caller never
 *  has to deal with the raw "expected object, got string" type of
 *  message — they get a code they can `switch` on. */

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isDirection(v: unknown): v is Direction {
  return v === 'kk-ru' || v === 'ru-kk';
}

function isGrade(v: unknown): v is Grade {
  return v === 'again' || v === 'hard' || v === 'good' || v === 'easy';
}

function isPhase(v: unknown): v is Phase {
  return (
    v === 'new' ||
    v === 'learning' ||
    v === 'review' ||
    v === 'relearning'
  );
}

const REQUIRED_TOP_KEYS = [
  'format',
  'schemaVersion',
  'exportedAt',
  'username',
  'displayName',
  'progress',
  'reviewLog',
] as const;

/**
 * Parse a backup file from raw text.
 *
 * Throws `BackupError` with a specific `code` on any failure — the
 * caller should `catch` and translate the code to a user-facing
 * string, never the raw `message`.
 *
 * On success, returns a fully-typed `BackupFile`. The returned
 * `progress` values are NOT deep-validated against `CardSchedule`
 * because the server (and a future client) may add new fields and
 * we don't want to refuse a valid file because of an extra key.
 * Fields we DO know about are type-checked; unknown ones are kept.
 */
export function parseBackup(text: string): BackupFile {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (err) {
    throw new BackupError(
      'malformedJson',
      `File is not valid JSON: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  if (!isObject(raw)) {
    throw new BackupError(
      'wrongFormat',
      'Expected a JSON object at the top level.',
    );
  }
  if (raw.format !== BACKUP_FORMAT) {
    throw new BackupError(
      'wrongFormat',
      `Unrecognised backup format: ${String(raw.format ?? '(missing)')}.`,
    );
  }
  for (const key of REQUIRED_TOP_KEYS) {
    if (!(key in raw) || raw[key] === null || raw[key] === undefined) {
      throw new BackupError('missingField', `Missing required field: ${key}.`);
    }
  }
  if (typeof raw.schemaVersion !== 'number') {
    throw new BackupError(
      'wrongType',
      'schemaVersion must be a number.',
    );
  }
  if (!SUPPORTED_SCHEMA_VERSIONS.includes(raw.schemaVersion)) {
    throw new BackupError(
      'unsupportedVersion',
      `Backup schemaVersion=${raw.schemaVersion} is not supported (this build supports ${SUPPORTED_SCHEMA_VERSIONS.join(', ')}).`,
    );
  }
  if (typeof raw.exportedAt !== 'string') {
    throw new BackupError('wrongType', 'exportedAt must be an ISO date string.');
  }
  if (typeof raw.username !== 'string' || typeof raw.displayName !== 'string') {
    throw new BackupError(
      'wrongType',
      'username and displayName must be strings.',
    );
  }
  if (!isObject(raw.progress)) {
    throw new BackupError('wrongType', 'progress must be an object.');
  }
  if (!Array.isArray(raw.reviewLog)) {
    throw new BackupError('wrongType', 'reviewLog must be an array.');
  }
  // Per-event shape check. We only validate the fields we know about;
  // extra fields on a future schema are kept untouched.
  const reviewLog: BackupReviewEvent[] = [];
  for (let i = 0; i < raw.reviewLog.length; i++) {
    const ev = raw.reviewLog[i];
    if (!isObject(ev)) {
      throw new BackupError(
        'wrongType',
        `reviewLog[${i}] must be an object.`,
      );
    }
    if (
      typeof ev.ts !== 'string' ||
      typeof ev.cardId !== 'string' ||
      !isDirection(ev.direction) ||
      !isGrade(ev.grade)
    ) {
      throw new BackupError(
        'wrongType',
        `reviewLog[${i}] has invalid field types.`,
      );
    }
    reviewLog.push({
      ts: ev.ts,
      cardId: ev.cardId,
      direction: ev.direction,
      grade: ev.grade,
    });
  }
  // Per-progress-entry shape check. We validate the fields we use
  // (phase is the discriminator) and let other fields pass through
  // so a future server that adds `lapsesToday` doesn't break old
  // round-trips.
  const progress: Record<string, CardSchedule> = {};
  for (const [k, v] of Object.entries(raw.progress)) {
    if (!isObject(v)) {
      throw new BackupError(
        'wrongType',
        `progress["${k}"] must be an object.`,
      );
    }
    if (v.phase !== undefined && !isPhase(v.phase)) {
      throw new BackupError(
        'wrongType',
        `progress["${k}"].phase is invalid: ${String(v.phase)}.`,
      );
    }
    progress[k] = v as unknown as CardSchedule;
  }
  // We deliberately don't reject "empty" backups (0 progress, 0
  // events). A fresh user might want to roundtrip their blank
  // state to a new device, and the server handles empty payloads
  // fine. The confirmation dialog will say "0 карточек · 0
  // событий" so the user has a chance to notice and cancel.
  return {
    format: BACKUP_FORMAT,
    schemaVersion: raw.schemaVersion,
    exportedAt: raw.exportedAt,
    username: raw.username,
    displayName: raw.displayName,
    progress,
    reviewLog,
  };
}

/** Canonical serialiser. Indented with 2 spaces so the file is
 *  diff-friendly in a text editor; matches the format the server
 *  produces so user-downloaded files and server-served files look
 *  identical. The output is byte-stable for a given input (modulo
 *  key insertion order, which we preserve by not reordering). */
export function serializeBackup(file: BackupFile): string {
  return JSON.stringify(file, null, 2);
}

/** Convenience: the filename the export button uses. Includes the
 *  username, the date, and the schema version so a user with
 *  multiple backups can tell them apart at a glance and the file
 *  tells a future tool which version wrote it. */
export function backupFilename(
  username: string,
  now: Date = new Date(),
): string {
  const day = now.toISOString().slice(0, 10);
  return `qazaq-backup-${username}-v${BACKUP_SCHEMA_VERSION}-${day}.json`;
}

/** Lightweight summary the confirmation dialog uses. Doesn't
 *  include the whole file — just the things the user actually
 *  needs to see before they overwrite their current progress. */
export interface BackupSummary {
  username: string;
  displayName: string;
  exportedAt: Date;
  cardsTracked: number;
  reviewEvents: number;
  /** `true` if the username on the file matches the currently
   *  logged-in user. The UI should warn more loudly if it doesn't. */
  sameUser: boolean;
}

export function summarizeBackup(
  file: BackupFile,
  currentUsername: string | null,
): BackupSummary {
  // Progress is keyed by cardId only (one schedule per card,
  // not per direction). We still tolerate the old
  // `cardId::direction` keys in case a user round-trips a
  // backup that was exported before the v7 schema change.
  const cardIds = new Set<string>();
  for (const k of Object.keys(file.progress)) {
    const sep = k.lastIndexOf('::');
    cardIds.add(sep > 0 ? k.slice(0, sep) : k);
  }
  return {
    username: file.username,
    displayName: file.displayName,
    exportedAt: new Date(file.exportedAt),
    cardsTracked: cardIds.size,
    reviewEvents: file.reviewLog.length,
    sameUser:
      currentUsername !== null &&
      file.username.toLowerCase() === currentUsername.toLowerCase(),
  };
}
