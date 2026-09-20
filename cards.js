/**
 * Per-user card library.
 *
 * Official cards ship in `src/data/decks/*.json` and are read
 * directly by the front-end (lazy-loaded, no server round-trip).
 * Each user can also add their own — those live in the
 * `user_cards` table, scoped to that user, and never shared.
 *
 * Routes in `server.js` map HTTP verbs to these helpers. We keep
 * the shape validation here so the route handlers stay thin and
 * any future admin tooling can reuse the same predicates.
 */
import { randomUUID } from 'node:crypto';
import { dbQuery, dbQueryOne, dbWrite } from './db.js';

/** @type {const} */
const LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1'];

// Field length caps. These match the spirit of the username/password
// limits in `auth.js`: enough for any real-world card, tight enough
// that a hostile caller can't stuff megabytes into the DB.
const LIMITS = {
  category: 64,
  kazakh: 200,
  transliteration: 200,
  translation: 400,
  translationRu: 400,
  example: 600,
  source: 64,
  sourceUrl: 512,
  license: 32,
  attribution: 200,
};

/**
 * Throws a `CardError` on bad input. The route handler converts that
 * into a 4xx JSON response. We use a dedicated class so the caller
 * doesn't have to string-match on errors.
 */
export class CardError extends Error {
  constructor(code, message, status = 400) {
    super(message);
    this.name = 'CardError';
    this.code = code;
    this.status = status;
  }
}

function asString(v, field, opts = { max: 200 }) {
  if (v === undefined || v === null) {
    if (opts.required) throw new CardError('missingField', `${field} обязательно.`);
    return '';
  }
  if (typeof v !== 'string') {
    throw new CardError('badField', `${field} должно быть строкой.`);
  }
  const trimmed = v.trim();
  if (opts.required && trimmed.length === 0) {
    throw new CardError('missingField', `${field} не может быть пустым.`);
  }
  if (trimmed.length > opts.max) {
    throw new CardError('fieldTooLong', `${field} не должно превышать ${opts.max} символов.`);
  }
  return trimmed;
}

function asOptionalString(v, field, max) {
  if (v === undefined || v === null) return '';
  if (typeof v !== 'string') {
    throw new CardError('badField', `${field} должно быть строкой.`);
  }
  const trimmed = v.trim();
  if (trimmed.length > max) {
    throw new CardError('fieldTooLong', `${field} не должно превышать ${max} символов.`);
  }
  return trimmed;
}

function validateCardInput(body, partial = false) {
  if (typeof body !== 'object' || body === null) {
    throw new CardError('badBody', 'Тело запроса должно быть объектом.');
  }
  const b = body;
  const required = (cond) => !partial || cond;

  const level = asString(b.level, 'level', { max: 2, required: required(b.level !== undefined) });
  if (level && !LEVELS.includes(level)) {
    throw new CardError('badLevel', `Уровень должен быть одним из: ${LEVELS.join(', ')}.`);
  }
  const category = asString(b.category, 'category', { max: LIMITS.category, required: required(b.category !== undefined) });
  const kazakh = asString(b.kazakh, 'kazakh', { max: LIMITS.kazakh, required: required(b.kazakh !== undefined) });
  const transliteration = asString(b.transliteration, 'transliteration', { max: LIMITS.transliteration, required: false });
  const translation = asString(b.translation, 'translation', { max: LIMITS.translation, required: false });
  const translationRu = asString(b.translationRu, 'translationRu', { max: LIMITS.translationRu, required: required(b.translationRu !== undefined) });
  const example = asString(b.example, 'example', { max: LIMITS.example, required: false });
  const source = asOptionalString(b.source, 'source', LIMITS.source);
  const sourceUrl = asOptionalString(b.sourceUrl, 'sourceUrl', LIMITS.sourceUrl);
  const license = asOptionalString(b.license, 'license', LIMITS.license);
  const attribution = asOptionalString(b.attribution, 'attribution', LIMITS.attribution);

  // For the official `anki-qazaq-curated-v1` license is implicit, but
  // a user is free to choose their own. We don't enforce a particular
  // SPDX list — just don't allow anything that looks like a script.
  for (const [name, val] of [
    ['source', source],
    ['license', license],
  ]) {
    if (/[<>]/.test(val)) {
      throw new CardError('badField', `${name} содержит недопустимые символы.`);
    }
  }
  // sourceUrl is a URL — basic shape check, not a full RFC 3986 walk.
  if (sourceUrl) {
    try {
      // eslint-disable-next-line no-new
      new URL(sourceUrl);
    } catch {
      throw new CardError('badSourceUrl', 'sourceUrl должен быть валидным URL.');
    }
  }

  return {
    level,
    category,
    kazakh,
    transliteration,
    translation,
    translationRu,
    example,
    source: source || null,
    sourceUrl: sourceUrl || null,
    license: license || null,
    attribution: attribution || null,
  };
}

/* -------------------------------------------------------------------------- */
/* Queries                                                                     */
/* -------------------------------------------------------------------------- */

/** Shape returned to the client — mirrors the static Card type so the
 *  front-end can treat official and user cards interchangeably. */
export function rowToCard(r) {
  return {
    id: r.id,
    level: r.level,
    category: r.category,
    kazakh: r.kazakh,
    transliteration: r.transliteration,
    translation: r.translation,
    translationRu: r.translationRu,
    example: r.example,
    source: r.source ?? undefined,
    sourceUrl: r.sourceUrl ?? undefined,
    license: r.license ?? undefined,
    attribution: r.attribution ?? undefined,
    deck: 'user',
  };
}

export async function listUserCards(ownerUserId, level) {
  let result;
  if (level && LEVELS.includes(level)) {
    result = dbQuery(
      `SELECT * FROM user_cards
       WHERE ownerUserId = ? AND level = ?
       ORDER BY createdAt DESC`,
      [ownerUserId, level],
    );
  } else {
    result = dbQuery(
      `SELECT * FROM user_cards
       WHERE ownerUserId = ?
       ORDER BY createdAt DESC`,
      [ownerUserId],
    );
  }
  return result.rows.map(rowToCard);
}

export async function getUserCard(id, ownerUserId) {
  return dbQueryOne(
    `SELECT * FROM user_cards WHERE id = ? AND ownerUserId = ?`,
    [id, ownerUserId],
  );
}

export async function createUserCard(ownerUserId, body) {
  const input = validateCardInput(body);
  const id = `u-${randomUUID()}`;
  const now = new Date().toISOString();
  await dbWrite((d) => {
    d.run(
      `INSERT INTO user_cards
        (id, ownerUserId, level, category, kazakh, transliteration, translation,
         translationRu, example, source, sourceUrl, license, attribution,
         createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        ownerUserId,
        input.level,
        input.category,
        input.kazakh,
        input.transliteration,
        input.translation,
        input.translationRu,
        input.example,
        input.source,
        input.sourceUrl,
        input.license,
        input.attribution,
        now,
        now,
      ],
    );
  });
  return rowToCard({
    id,
    ownerUserId,
    createdAt: now,
    updatedAt: now,
    ...input,
  });
}

/**
 * Bulk import. Used by the .apkg import endpoint.
 *
 * Each card gets its own `u-<uuid>` id; the `source` and
 * `attribution` come from the importer and apply to every card in
 * the batch so the user can later find and delete them together.
 * The whole batch is written in a single transaction so a partial
 * failure leaves no orphan rows.
 */
export async function bulkCreateUserCards(ownerUserId, opts) {
  const { level, cards, source, attribution } = opts;
  if (!Array.isArray(cards) || cards.length === 0) return [];
  if (!LEVELS.includes(level)) {
    throw new CardError('badLevel', `Уровень должен быть одним из: ${LEVELS.join(', ')}.`);
  }
  // Reject obviously hostile inputs. Per-card length checks live
  // in the validateCardInput() we run for each row below.
  if (typeof source !== 'string' || source.length > LIMITS.source) {
    throw new CardError('badField', 'source must be a short string.');
  }
  if (typeof attribution !== 'string' || attribution.length > LIMITS.attribution) {
    throw new CardError('badField', 'attribution must be a short string.');
  }
  const now = new Date().toISOString();
  const created = [];
  await dbWrite((d) => {
    const insert = d.prepare(
      `INSERT INTO user_cards
        (id, ownerUserId, level, category, kazakh, transliteration, translation,
         translationRu, example, source, sourceUrl, license, attribution,
         createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    try {
      d.exec('BEGIN');
      for (const c of cards) {
        // Per-card validation. A single bad card throws CardError
        // and the whole transaction rolls back — that's the
        // intended behaviour: "all or nothing" for an import.
        const validated = validateCardInput({
          level,
          category: c.category || 'Импорт',
          kazakh: c.kazakh,
          translationRu: c.translationRu,
          transliteration: c.transliteration,
          translation: c.translation,
          source,
          attribution,
        });
        const id = `u-${randomUUID()}`;
        insert.run([
          id,
          ownerUserId,
          validated.level,
          validated.category,
          validated.kazakh,
          validated.transliteration,
          validated.translation,
          validated.translationRu,
          validated.example,
          validated.source,
          validated.sourceUrl,
          validated.license,
          validated.attribution,
          now,
          now,
        ]);
        created.push({ id, ...validated, createdAt: now, updatedAt: now });
      }
      d.exec('COMMIT');
    } catch (err) {
      try { d.exec('ROLLBACK'); } catch { /* ignore */ }
      throw err;
    } finally {
      try { insert.free(); } catch { /* ignore */ }
    }
  });
  return created;
}

export async function updateUserCard(id, ownerUserId, body) {
  const existing = await getUserCard(id, ownerUserId);
  if (!existing) {
    throw new CardError('notFound', 'Карточка не найдена.', 404);
  }
  // partial=true — every field is optional on PUT.
  const input = validateCardInput(body, true);
  const merged = {
    level: input.level || existing.level,
    category: input.category || existing.category,
    kazakh: input.kazakh || existing.kazakh,
    transliteration: input.transliteration || existing.transliteration,
    translation: input.translation || existing.translation,
    translationRu: input.translationRu || existing.translationRu,
    example: input.example || existing.example,
    source: input.source !== null ? input.source : existing.source,
    sourceUrl: input.sourceUrl !== null ? input.sourceUrl : existing.sourceUrl,
    license: input.license !== null ? input.license : existing.license,
    attribution: input.attribution !== null ? input.attribution : existing.attribution,
  };
  const now = new Date().toISOString();
  await dbWrite((d) => {
    d.run(
      `UPDATE user_cards
       SET level = ?, category = ?, kazakh = ?, transliteration = ?,
           translation = ?, translationRu = ?, example = ?,
           source = ?, sourceUrl = ?, license = ?, attribution = ?,
           updatedAt = ?
       WHERE id = ? AND ownerUserId = ?`,
      [
        merged.level,
        merged.category,
        merged.kazakh,
        merged.transliteration,
        merged.translation,
        merged.translationRu,
        merged.example,
        merged.source,
        merged.sourceUrl,
        merged.license,
        merged.attribution,
        now,
        id,
        ownerUserId,
      ],
    );
  });
  return rowToCard({ ...existing, ...merged, updatedAt: now });
}

export async function deleteUserCard(id, ownerUserId) {
  const existing = await getUserCard(id, ownerUserId);
  if (!existing) {
    throw new CardError('notFound', 'Карточка не найдена.', 404);
  }
  await dbWrite((d) => {
    d.run('DELETE FROM user_cards WHERE id = ? AND ownerUserId = ?', [id, ownerUserId]);
    // Best-effort: drop progress for this card so the stats view
    // doesn't keep showing a ghost entry. The progress table has
    // no FK to user_cards (we keep orphan rows on purpose so the
    // user can re-add the card and pick up where they left off),
    // so we just no-op the cleanup if you ever flip that policy.
  });
}

export { LEVELS };
