import decksData from './decks.json';

export type LevelId = 'a1' | 'a2' | 'b1' | 'b2' | 'c1';
export type LevelName = 'A1' | 'A2' | 'B1' | 'B2' | 'C1';

export interface Card {
  id: string;
  level: LevelName;
  category: string;
  kazakh: string;
  transliteration: string;
  /** English meaning (kept for compatibility and helpers). */
  translation: string;
  /** Russian meaning — the primary translation for the app. */
  translationRu: string;
  example: string;
  /**
   * Where the card came from. `cefr` = bundled with the app (the
   * curated starter set, attribution in `SOURCES.md`). `user` =
   * added by the current user via the "Add card" form. The two are
   * treated identically by the SM-2 scheduler and the UI — the
   * tag is only used by BrowsePage to surface the "Моя" badge and
   * the delete button.
   */
  deck: 'cefr' | 'user';
  /**
   * Short tag for the data source, e.g. `anki-qazaq-curated-v1` or
   * `wiktionary`. Full metadata (URL, license, attribution) lives in
   * `SOURCES.md` so the JSON stays small.
   *
   * Missing on a JSON-loaded card means the curated starter set —
   * `loadLevel` fills it in with a default.
   */
  source?: string;
  /** Optional direct URL to the article the card was lifted from. */
  sourceUrl?: string;
  /** SPDX license identifier. Defaults to CC-BY-SA-4.0 for the starter set. */
  license?: string;
  /** Human-readable attribution line, shown next to "источник" when present. */
  attribution?: string;
}

/** Direction the user is studying in. The app is bidirectional:
 *  "kk-ru" shows the Kazakh word and expects the Russian meaning;
 *  "ru-kk" shows the Russian meaning and expects the Kazakh word.
 *  Each direction has its own spaced-repetition schedule. */
export type Direction = 'kk-ru' | 'ru-kk';
export const DIRECTIONS: ReadonlyArray<Direction> = ['kk-ru', 'ru-kk'];

export type LevelTier =
  | 'beginner'
  | 'elementary'
  | 'intermediate'
  | 'upperIntermediate'
  | 'advanced';

export interface Level {
  id: LevelId;
  name: LevelName;
  /** Proficiency tier key — used to look up a localized label. */
  tier: LevelTier;
  /** Short list of topic areas covered (English — used as a hint). */
  topics: string;
  /**
   * Build-time expected card count, computed from the per-level JSON
   * by `scripts/unify-topics.mjs`. Used as the FIRST-RENDER value for
   * the home page preview, before `loadLevel` has populated the
   * runtime cache. The displayed count is always the actual cache
   * size once data is loaded — see `getCardCount` and `getTotalCards`.
   * Keeping this here avoids a flash of "0" on the landing page.
   */
  cardCount: number;
}

export const LEVELS: Level[] = (decksData as { levels: Level[] }).levels;

const ID_TO_NAME: Record<LevelId, LevelName> = {
  a1: 'A1', a2: 'A2', b1: 'B1', b2: 'B2', c1: 'C1',
};

const LEVEL_IDS = Object.keys(ID_TO_NAME) as LevelId[];

/** Per-level JSON shape:
 *  { level: 'A1', topicCount: 9, topics: { 'Greetings': [cards], ... } }
 */
interface LevelFile {
  level: LevelName;
  topicCount: number;
  topics: Record<string, Omit<Card, 'deck'>[]>;
}

const cardCache = new Map<LevelId, Card[]>();
const topicCache = new Map<LevelId, string[]>();
/** Resolved promise per level — so concurrent `loadLevel` calls share
 *  one in-flight request instead of racing the dynamic import. */
const inflight = new Map<LevelId, Promise<Card[]>>();

function isLevelId(id: string): id is LevelId {
  return (LEVEL_IDS as string[]).includes(id);
}

/**
 * Lazy-load a level's cards. The per-level JSON is structured as
 * `{ topics: { [name]: [cards] } }` so hand-editing is easy. We flatten it
 * to a single Card[] for the app.
 *
 * Multiple concurrent calls for the same level share one in-flight
 * request via the `inflight` map — this matters when the landing
 * page preloads all five levels in parallel, and then a navigation
 * to /study/a1 kicks off its own `loadLevel('a1')` immediately
 * after.
 */
export async function loadLevel(levelId: string): Promise<Card[]> {
  if (!isLevelId(levelId)) return [];
  const cached = cardCache.get(levelId);
  if (cached) return cached;
  const pending = inflight.get(levelId);
  if (pending) return pending;

  const promise = loadLevelInner(levelId);
  inflight.set(levelId, promise);
  try {
    return await promise;
  } finally {
    inflight.delete(levelId);
  }
}

async function loadLevelInner(levelId: LevelId): Promise<Card[]> {
  const importers: Record<LevelId, () => Promise<{ default: unknown }>> = {
    a1: () => import('./decks/a1.json'),
    a2: () => import('./decks/a2.json'),
    b1: () => import('./decks/b1.json'),
    b2: () => import('./decks/b2.json'),
    c1: () => import('./decks/c1.json'),
  };

  const mod = await importers[levelId]();
  const file = mod.default as LevelFile;

  const cards: Card[] = [];
  for (const topicCards of Object.values(file.topics)) {
    for (const c of topicCards) {
      // Cards loaded from JSON are the official starter set. Backfill
      // the source/license/attribution on the fly so the UI can show
      // a meaningful "источник" link. The on-disk JSON stays small;
      // full provenance is documented in `SOURCES.md`.
      const card: Card = {
        source: 'kazcorpus-lexmin-v1',
        license: 'CC-BY-4.0',
        attribution:
          'Ахмет Байтұрсынұлы атындағы Тіл білімі институты. ' +
          'Лексикалық минимумдер A1–C1. Астана, 2017–2018. ISBN 978-601-7311-32-2.',
        ...c,
        deck: 'cefr',
      };
      // The `sourceUrl` is per-card (anchors to the specific word on
      // the PDF). If the on-disk card doesn't have one, fall back to
      // the SOURCES.md landing page so the user can always click
      // through to the original.
      if (!card.sourceUrl) {
        card.sourceUrl =
          'https://github.com/aa-blinov/anki-qazaq/blob/main/src/data/SOURCES.md';
      }
      cards.push(card);
    }
  }
  cards.sort((a, b) => a.id.localeCompare(b.id));
  cardCache.set(levelId, cards);
  topicCache.set(levelId, Object.keys(file.topics).sort());
  return cards;
}

/**
 * Load every level in parallel and populate the cache. Returns a
 * map of level id → cards. Safe to call from multiple places (the
 * internal `inflight` map de-duplicates).
 *
 * Called eagerly from `main.tsx` so the home page has accurate
 * counts on first paint, and again from `HomePage` itself as a
 * belt-and-braces measure.
 */
export async function preloadAllLevels(): Promise<Record<LevelId, Card[]>> {
  const results = await Promise.all(LEVELS.map((l) => loadLevel(l.id)));
  const out: Partial<Record<LevelId, Card[]>> = {};
  LEVELS.forEach((l, i) => {
    out[l.id] = results[i];
  });
  return out as Record<LevelId, Card[]>;
}

/** Synchronous accessor used after loadLevel has resolved. */
export function getCardsByLevel(levelId: string): Card[] {
  if (!isLevelId(levelId)) return [];
  return cardCache.get(levelId) ?? [];
}

export function getLevelById(id: string): Level | undefined {
  return LEVELS.find((l) => l.id === id);
}

export function levelIdToName(id: string): LevelName | null {
  return isLevelId(id) ? ID_TO_NAME[id] : null;
}

/**
 * Per-level card count, derived from the live data.
 *
 *  - If the level has been `loadLevel`'d (or `preloadAllLevels` has
 *    run), the count is `cardCache.get(id).length` — the actual
 *    number of cards in `a1.json` … `c1.json` after dedup.
 *  - If not yet loaded (e.g. first render of the landing page, before
 *    the JSONs have been fetched), the count falls back to
 *    `LEVELS.cardCount` — the build-time hint that the unify script
 *    keeps in sync with the JSONs. This avoids a flash of "0".
 *
 * This is the SINGLE source of truth for any UI element that shows
 * a per-level number. Don't read `LEVELS[i].cardCount` directly.
 */
export function getCardCount(levelId: string): number {
  if (!isLevelId(levelId)) return 0;
  const cached = cardCache.get(levelId);
  if (cached) return cached.length;
  return LEVELS.find((l) => l.id === levelId)?.cardCount ?? 0;
}

/**
 * Total card count across all five levels. Same source-of-truth
 * policy as `getCardCount`: prefers actual loaded counts, falls back
 * to the sum of build-time hints.
 */
export function getTotalCards(): number {
  let sum = 0;
  for (const lvl of LEVELS) {
    const cached = cardCache.get(lvl.id);
    sum += cached ? cached.length : lvl.cardCount;
  }
  return sum;
}

/**
 * Whether every level has been loaded into the cache. Useful for
 * components that want to render a "loading" placeholder for
 * numbers until the data is ready.
 */
export function areAllLevelsLoaded(): boolean {
  return LEVELS.every((l) => cardCache.has(l.id));
}

/** All distinct topics within a level. Must be called after loadLevel(). */
export function getCategoriesByLevel(levelId: string): string[] {
  if (!isLevelId(levelId)) return [];
  return topicCache.get(levelId) ?? [];
}

/** Group cards by their topic — used for the LK "By topic" section. */
export function groupCardsByTopic(cards: Card[]): Record<string, Card[]> {
  const groups: Record<string, Card[]> = {};
  for (const c of cards) {
    (groups[c.category] ??= []).push(c);
  }
  return groups;
}

/**
 * Total topic count across all levels — for the LK header. Like
 * `getTotalCards`, prefers the live count if every level is loaded.
 */
export const TOTAL_TOPICS: number = LEVELS.reduce((acc, l) => {
  const topics = topicCache.get(l.id as LevelId);
  return acc + (topics?.length ?? 0);
}, 0);
