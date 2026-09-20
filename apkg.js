/**
 * Anki `.apkg` import — parse a `.apkg` archive and return the
 * Kazakh+Russian note pairs that fit our card schema.
 *
 * An .apkg file is a ZIP archive containing:
 *   - `collection.anki21`  — modern SQLite (Anki 2.1+)
 *   - `collection.anki2`   — fallback for older exports
 *   - `media`              — JSON map of "0": "filename.mp3", …
 *   - `0`, `1`, `2`, …     — actual media files (referenced by index)
 *
 * The SQLite has a `col` table (1 row) whose `models` JSON lists
 * the note types in the deck. A `Basic` model has two fields
 * (Front, Back); a `Basic (and reversed card)` model has three
 * (Front, Back, Extra). We map fields by their NAME, not their
 * position, so a deck that swaps the order still parses.
 *
 * The notes table has each note's fields joined by `\x1f` (US,
 * ASCII 31). We split on that, then look up the Front and Back
 * by name in the matching model.
 */
import AdmZip from 'adm-zip';
import initSqlJs from 'sql.js';

let sqlJsPromise = null;
async function getSqlJs() {
  if (!sqlJsPromise) {
    sqlJsPromise = initSqlJs({
      // sql.js ships the WASM blob as a separate file in its
      // package; in production we need to point it at the right
      // path. The default location is the package's own `dist/`
      // which works because we import it via npm.
    });
  }
  return sqlJsPromise;
}

const FIELD_SEP = '\x1f';

/**
 * Open a .apkg buffer, parse the collection, and return
 * `{ deckName, cards: [{ kazakh, translationRu }] }`.
 *
 * Notes that don't have a parseable kk/ru pair are dropped (the
 * caller can surface the skipped count separately). The result
 * is capped at MAX_CARDS to prevent a single import from
 * dumping a million rows.
 */
const MAX_CARDS = 5000;

export async function parseApkg(buffer) {
  if (!buffer || buffer.length < 4) {
    throw new Error('empty or invalid .apkg buffer');
  }
  // .apkg is a ZIP. Magic bytes are 50 4B (PK..).
  if (buffer[0] !== 0x50 || buffer[1] !== 0x4b) {
    throw new Error('not a valid ZIP / .apkg file');
  }
  const zip = new AdmZip(buffer);
  // The collection file: prefer the modern name, fall back to the
  // legacy one. Some old exports only have the legacy file.
  let entry =
    zip.getEntry('collection.anki21') ||
    zip.getEntry('collection.anki2');
  if (!entry) {
    throw new Error('no collection.anki21 or collection.anki2 in archive');
  }
  const sqliteBytes = entry.getData();

  const SQL = await getSqlJs();
  const db = new SQL.Database(new Uint8Array(sqliteBytes));

  // 1. Read the single row of the `col` table — it holds the
  //    schema as a JSON blob (models, decks, etc.).
  const colRows = execSelectAll(
    db,
    'SELECT models, decks FROM col LIMIT 1',
  );
  if (colRows.length === 0) {
    db.close();
    throw new Error('empty Anki collection (no col row)');
  }
  let models = {};
  let deckName = '';
  try {
    const col = JSON.parse(colRows[0].models);
    models = col;
  } catch {
    db.close();
    throw new Error('malformed models JSON in col table');
  }
  try {
    const decks = JSON.parse(colRows[0].decks);
    // Pick the first non-default deck name. If there's only one
    // deck, use that; otherwise pick the largest by note count
    // (informational only — we don't use it for filtering).
    const ids = Object.keys(decks);
    if (ids.length === 1) {
      deckName = decks[ids[0]].name;
    } else {
      // Filter out the default "Default" deck and use the first
      // remaining.
      const real = ids
        .map((id) => decks[id])
        .filter((d) => d.name !== 'Default')
        .sort((a, b) => (b.id || 0) - (a.id || 0));
      deckName = real[0]?.name || decks[ids[0]].name;
    }
  } catch {
    deckName = '';
  }

  // 2. Build a (modelId → { kazakhIdx, ruIdx }) map so we can
  //    extract the right fields for each note.
  const modelMap = {};
  for (const [mid, model] of Object.entries(models)) {
    const idx = pickKkRuIndices(model);
    if (idx) modelMap[mid] = idx;
  }

  // 3. Read all notes. The fields column is the note's fields
  //    joined by ASCII 31. If a note's model isn't in the map
  //    (e.g. Cloze), we skip it.
  const noteRows = execSelectAll(
    db,
    'SELECT mid, flds FROM notes',
  );
  db.close();

  const cards = [];
  const skipped = { noKk: 0, noRu: 0, unknownModel: 0 };
  for (const row of noteRows) {
    if (cards.length >= MAX_CARDS) break;
    const idx = modelMap[row.mid];
    if (!idx) {
      skipped.unknownModel++;
      continue;
    }
    const fields = row.flds.split(FIELD_SEP);
    const kazakh = (fields[idx.kazakhIdx] || '').trim();
    const translationRu = (fields[idx.ruIdx] || '').trim();
    if (!kazakh) {
      skipped.noKk++;
      continue;
    }
    if (!translationRu) {
      skipped.noRu++;
      continue;
    }
    cards.push({ kazakh, translationRu });
  }

  return { deckName, cards, skipped };
}

/**
 * For a given model, pick the field indices that most likely
 * hold the Kazakh word and the Russian translation. We score
 * each field by its name (and the model's name).
 *
 * Scoring rules:
 *  - kazakh: any field whose name includes kk / kazakh /
 *    казах / word / front / term. First match wins.
 *  - russian: any field whose name includes ru / russian /
 *    рус / translation / meaning / back. First match wins.
 *
 * For a `Basic` model the natural Front/Back fields are the
 * expected answer in 95% of cases, so we fall back to that
 * if the heuristic misses.
 */
function pickKkRuIndices(model) {
  const fields = model.flds || [];
  if (fields.length === 0) return null;

  const kkRe = /(kk|kazakh|казах|word|term|front|передн)/i;
  const ruRe = /(ru|russian|рус|translation|meaning|back|задн)/i;
  // Word boundaries: "russian" should not match "russian" only.
  // We accept either match so the heuristic stays forgiving.

  let kazakhIdx = -1;
  let ruIdx = -1;
  for (let i = 0; i < fields.length; i++) {
    const name = fields[i].name || '';
    if (kazakhIdx === -1 && kkRe.test(name)) kazakhIdx = i;
    if (ruIdx === -1 && ruRe.test(name)) ruIdx = i;
  }
  // Fallback for the common "Basic" / "Basic (and reversed card)"
  // model: index 0 = Front, index 1 = Back.
  if (kazakhIdx === -1 && fields[0]) kazakhIdx = 0;
  if (ruIdx === -1 && fields[1]) ruIdx = 1;
  if (kazakhIdx === -1 || ruIdx === -1 || kazakhIdx === ruIdx) return null;
  return { kazakhIdx, ruIdx };
}

/** Tiny helper — sql.js doesn't have a synchronous .all() for
 *  prepared statements, so we wrap exec() and grab the first
 *  result set's rows. */
function execSelectAll(db, sql) {
  const results = db.exec(sql);
  if (results.length === 0) return [];
  const { columns, values } = results[0];
  return values.map((row) => {
    const obj = {};
    for (let i = 0; i < columns.length; i++) obj[columns[i]] = row[i];
    return obj;
  });
}
