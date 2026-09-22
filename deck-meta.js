/**
 * Deck metadata loaded once at server boot.
 *
 * The official card decks ship with the front-end in
 * `src/data/decks/{a1..c1}.json`. The server only needs a tiny
 * slice of that data — just the cardId → level mapping and the
 * per-level totals — to power per-level statistics (`/api/stats`).
 *
 * Why not ship the same data in the front-end only?
 *   - The server already aggregates progress across all the user's
 *     cards. Adding per-level cuts is one SELECT away when the
 *     cardId→level map is in memory.
 *   - The front-end can still load the full decks lazily
 *     (cache-first via SW, see public/sw.js) without paying for
 *     ~4 MB on first paint.
 *
 * Failure modes:
 *   - Missing deck files → `loadDeckMeta` throws at boot. The
 *     server refuses to start. That's loud on purpose: silently
 *     serving stats with all levels at zero would mislead the user.
 *   - Card missing a `level` field → skipped, with a warning. A
 *     misclassified card would silently drop out of the per-level
 *     totals; the server log makes it visible.
 */
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// deck-meta.js lives at the repo root next to server.js, so
// `__dirname` IS the repo root — `src/data/decks` is one level
// inside it.
const DECKS_DIR = path.resolve(__dirname, 'src', 'data', 'decks');

/** CEFR levels in canonical order — used everywhere the UI shows
 *  a row of rings or chips. */
export const LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1'];

let cardLevel = null;
let levelTotals = null;

function emptyTotals() {
  const out = {};
  for (const l of LEVELS) out[l] = 0;
  return out;
}

/**
 * Scan the decks directory for *.json files and build:
 *   - cardLevel:    Map<cardId, level>          — for fast lookup
 *   - levelTotals:  Record<level, count>
 *
 * Idempotent: a second call returns the cached maps. The server
 * only needs to load this once at boot.
 */
export function loadDeckMeta() {
  if (cardLevel && levelTotals) return;

  let files;
  try {
    files = readdirSync(DECKS_DIR).filter((f) => f.endsWith('.json'));
  } catch (err) {
    throw new Error(
      `[deck-meta] cannot read ${DECKS_DIR}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  cardLevel = new Map();
  levelTotals = emptyTotals();

  for (const f of files) {
    if (f === 'decks.json') continue;
    const full = path.join(DECKS_DIR, f);
    let parsed;
    try {
      parsed = JSON.parse(readFileSync(full, 'utf8'));
    } catch (err) {
      throw new Error(
        `[deck-meta] failed to parse ${full}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    // The deck JSONs are `{ level, topics: { topicName: [card, ...] } }`
    // — topics is an object keyed by topic name, each value is a card
    // array. Older drafts used `{ topics: [{ name, cards: [...] }] }`
    // (array-of-objects) or even a flat `{ cards: [...] }`. We accept
    // all three shapes here so this loader keeps working across deck
    // revisions without a flag day.
    let cards = null;
    if (Array.isArray(parsed.cards)) {
      cards = parsed.cards;
    } else if (Array.isArray(parsed.topics)) {
      cards = parsed.topics.flatMap((t) => Array.isArray(t.cards) ? t.cards : []);
    } else if (parsed.topics && typeof parsed.topics === 'object') {
      cards = Object.values(parsed.topics).flatMap((v) => Array.isArray(v) ? v : []);
    }
    if (!parsed.level || !cards) continue;
    for (const card of cards) {
      if (!card.id) continue;
      if (!card.level) {
        // eslint-disable-next-line no-console
        console.warn(`[deck-meta] card ${card.id} in ${f} has no level, skipping`);
        continue;
      }
      cardLevel.set(card.id, card.level);
      levelTotals[card.level] = (levelTotals[card.level] ?? 0) + 1;
    }
  }

  // eslint-disable-next-line no-console
  console.log(
    `[deck-meta] loaded ${cardLevel.size} cards across ` +
      `${LEVELS.map((l) => `${l}=${levelTotals[l]}`).join(' ')}`,
  );
}

/** Lookup: which CEFR level does this cardId belong to?
 *  Returns null for cards added by the user (they live in
 *  `user_cards` with their own `level` field — query that table
 *  if you need them too) and for unknown ids. */
export function cardLevelOf(cardId) {
  if (!cardLevel || !levelTotals) loadDeckMeta();
  return cardLevel.get(cardId) ?? null;
}

/** Total number of official cards per CEFR level. The returned
 *  object is a copy — callers can mutate it without poisoning
 *  the cached state. */
export function totalCardsByLevel() {
  if (!levelTotals || !cardLevel) loadDeckMeta();
  return { ...levelTotals };
}