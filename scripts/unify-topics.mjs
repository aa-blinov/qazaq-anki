#!/usr/bin/env node
/**
 * Unify topics across all 5 CEFR levels and de-duplicate cards.
 *
 * Goals
 * -----
 * 1. Map every current topic name (English, mixed Cyrillic, etc.) to a
 *    canonical topic. Each canonical topic is a { ru, kz, slug } triple
 *    — the slug is stable and used as the on-disk key.
 * 2. Re-classify all 5,684 cards into the unified taxonomy. The output
 *    is grouped by topic slug, not by the old topic name.
 * 3. De-duplicate across levels by the (kazakh, translationRu) pair.
 *    When a word appears in multiple levels, we keep it in the LOWEST
 *    level it was found in (a basic word "танысу" belongs in A1, not
 *    A2). When a word appears in two topics inside the same level
 *    we keep the first one we encounter (stable order).
 * 4. Re-number IDs per level (4-digit zero-padded) so the IDs stay
 *    sequential after the re-shuffle.
 * 5. Write `src/data/decks/{a1..c1}.json` in the same shape as
 *    before, but with the unified topic names in the keys.
 * 6. Update `src/data/decks.json` (the level list) with the new
 *    card counts.
 * 7. Update `src/i18n/{ru,en}.ts` topics namespace so the UI can
 *    resolve a slug → { ru, kz } display pair.
 *
 * Idempotent: re-running the script with the same input produces
 * the same output. If 0 cards survive the dedup the script refuses
 * to write so we never silently nuke the data.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const DECKS = resolve(ROOT, 'src/data/decks');
const LEVELS = ['a1', 'a2', 'b1', 'b2', 'c1'];

/* -------------------------------------------------------------------------- */
/* Unified topic taxonomy                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Each entry is the canonical topic. `slug` is the on-disk key.
 * `ru` / `kz` are the display names. `aliases` are the current
 * topic names (case-insensitive) that map to this canonical topic.
 */
const TOPICS = [
  { slug: 'greetings',     ru: 'Приветствия и этикет',     kz: 'Сәлемдесу және сыпайылық',
    aliases: ['greetings'] },
  { slug: 'family',        ru: 'Семья и родственники',     kz: 'Отбасы және туыстар',
    aliases: ['family'] },
  { slug: 'home',          ru: 'Дом и быт',                kz: 'Үй және тұрмыс',
    aliases: ['home', 'domestic goods', 'принадлежности appliances',
              'принадлежности'] },
  { slug: 'work',          ru: 'Работа и профессии',       kz: 'Жұмыс және мамандық',
    aliases: ['work', 'hobby & profession', 'hobby and profession', 'hobby & profession ',
              'мамандықтың бәрі жақсы', 'мамандыктын бэри жаксы',
              'мамандыктын бэры жаксы', 'мамандықтың бэры жаксы',
              'мамандықтың бәрі жақсы ', 'personalities'] },
  { slug: 'food',          ru: 'Еда и напитки',            kz: 'Тамақ және сусындар',
    aliases: ['food', 'тамақ еда', 'тамак еда', 'тамақ еда food',
              'тамақтану питание', 'тамактану питание', 'тамақтану питание eating'] },
  { slug: 'leisure',       ru: 'Досуг и хобби',            kz: 'Бос уақыт және хобби',
    aliases: ['leisure', 'art'] },
  { slug: 'weather',       ru: 'Погода и природа',         kz: 'Ауа-райы және табиғат',
    aliases: ['weather', 'маусым сезон', 'маусым сезон season'] },
  { slug: 'clothes',       ru: 'Одежда и мода',            kz: 'Киім және сән',
    aliases: ['clothes', 'fashion'] },
  { slug: 'health',        ru: 'Здоровье',                 kz: 'Денсаулық',
    aliases: ['health'] },
  { slug: 'holidays',      ru: 'Праздники и традиции',     kz: 'Мерекелер және дәстүрлер',
    aliases: ['holidays'] },
  { slug: 'appearance',    ru: 'Внешность',                kz: 'Сыртқы келбет',
    aliases: ['appearance'] },
  { slug: 'buildings',     ru: 'Здания и места',           kz: 'Ғимараттар және орындар',
    aliases: ['buildings'] },
  { slug: 'time',          ru: 'Время и календарь',        kz: 'Уақыт және күнтізбе',
    aliases: ['time'] },
  { slug: 'names',         ru: 'Имена и личные данные',    kz: 'Есімдер және жеке деректер',
    aliases: ['names', 'biography'] },
  { slug: 'country',       ru: 'Моя страна',               kz: 'Менің елім',
    aliases: ['my country', 'елдер страны', 'елдер страны countries'] },
  { slug: 'plants',        ru: 'Растения и животные',      kz: 'Өсімдіктер және жануарлар',
    aliases: ['plants', 'гүлдер цветы', 'гүлдер цветы flowers'] },
  { slug: 'services',      ru: 'Услуги и покупки',         kz: 'Қызметтер және сатып алу',
    aliases: ['services'] },
  { slug: 'documents',     ru: 'Документы',                kz: 'Құжаттар',
    aliases: ['documents', 'ресми іс-қағаздар', 'ресми ис-кагаздар'] },
  { slug: 'communication', ru: 'Общение и речь',           kz: 'Қарым-қатынас және сөйлеу',
    aliases: ['communication'] },
  { slug: 'media',         ru: 'СМИ и медиа',              kz: 'БАҚ және медиа',
    aliases: ['media'] },
  { slug: 'lifestyle',     ru: 'Образ жизни',              kz: 'Өмір салты',
    aliases: ['lifestyle'] },
  { slug: 'travel',        ru: 'Путешествия',              kz: 'Саяхат',
    aliases: ['travel'] },
  { slug: 'world',         ru: 'Мир и общество',           kz: 'Әлем және қоғам',
    aliases: ['world', 'групп groups'] },
  { slug: 'education',     ru: 'Образование',              kz: 'Білім',
    aliases: ['education'] },
  { slug: 'desire',        ru: 'Желание и намерение',      kz: 'Ықылас және ниет',
    aliases: ['ықылас ,ниет желание ,намерение desire,intention',
              'ықылас, ниет желание, намерение desire,intention',
              'ықылас,ниет желание,намерение desire,intention',
              'ниет намерение', 'ниет намерение intention'] },
  { slug: 'information',   ru: 'Информация и сообщение',   kz: 'Ақпарат және хабарлау',
    aliases: ['хабарлау сообщение information'] },
  { slug: 'negation',      ru: 'Отрицание',                kz: 'Жоққа шығару',
    aliases: ['жоққа шығару отрицание negation'] },
  { slug: 'continuation',  ru: 'Продолжение и связность',  kz: 'Жалғастыру',
    aliases: ['жалғастыру продолжение', 'жалғастыру продолжение continue'] },
  { slug: 'pronouns',      ru: 'Местоимения',              kz: 'Есімдіктер',
    aliases: ['местоимение pronoun'] },
  { slug: 'evaluation',    ru: 'Оценка',                   kz: 'Бағалау',
    aliases: ['оценка evaluation'] },
  { slug: 'crime',         ru: 'Преступление',             kz: 'Қылмыс',
    aliases: ['қылмыс преступление crime'] },
  { slug: 'waste',         ru: 'Отходы',                   kz: 'Қалдықтар',
    aliases: ['қалдықтар отходы waste products'] },
  { slug: 'antipathy',     ru: 'Антипатия и неприязнь',    kz: 'Жек көру',
    aliases: ['жек көру', 'жек кору'] },
  { slug: 'adjectives',    ru: 'Одинаковые прилагательные', kz: 'Бірдей сын есімдер',
    aliases: ['қолданылатын сын одинаково toconcrete ,',
              'қолданылатын сын одинаково toconcrete,'] },
];

// Build a lookup. Normalize aliases to lower-case + strip whitespace.
const ALIAS_TO_SLUG = new Map();
for (const topic of TOPICS) {
  for (const alias of topic.aliases) {
    const key = alias.toLowerCase().trim();
    if (ALIAS_TO_SLUG.has(key)) {
      // Duplicate alias — log so we notice.
      const prev = ALIAS_TO_SLUG.get(key);
      if (prev !== topic.slug) {
        console.warn(`! alias "${alias}" maps to both "${prev}" and "${topic.slug}"`);
      }
    }
    ALIAS_TO_SLUG.set(key, topic.slug);
  }
}

function topicSlug(rawName) {
  if (!rawName) return null;
  const key = rawName.toLowerCase().trim();
  if (ALIAS_TO_SLUG.has(key)) return ALIAS_TO_SLUG.get(key);
  // Fuzzy fallback: collapse internal whitespace and punctuation.
  const collapsed = key.replace(/[\s,\-]+/g, ' ').replace(/\s+/g, ' ').trim();
  for (const [alias, slug] of ALIAS_TO_SLUG) {
    const a = alias.replace(/[\s,\-]+/g, ' ').replace(/\s+/g, ' ').trim();
    if (a === collapsed) return slug;
  }
  // Already a canonical slug? The script can be re-run on data that
  // was already unified by a previous pass — those cards have
  // `category` equal to a slug. If the slug is known, return it.
  for (const t of TOPICS) {
    if (t.slug === key) return t.slug;
  }
  return null;
}

/* -------------------------------------------------------------------------- */
/* Load all levels                                                             */
/* -------------------------------------------------------------------------- */

const LEVEL_ORDER = { A1: 0, A2: 1, B1: 2, B2: 3, C1: 4 };
const levelCards = {}; // { a1: [card, card, ...], ... }

for (const lvl of LEVELS) {
  const path = resolve(DECKS, `${lvl}.json`);
  const data = JSON.parse(readFileSync(path, 'utf8'));
  const cards = [];
  for (const [topic, arr] of Object.entries(data.topics)) {
    for (const c of arr) {
      cards.push({ ...c, _oldTopic: topic });
    }
  }
  levelCards[lvl] = cards;
  console.log(`loaded ${lvl}: ${cards.length} cards, ${Object.keys(data.topics).length} topics`);
}

/* -------------------------------------------------------------------------- */
/* Classify + dedup                                                            */
/* -------------------------------------------------------------------------- */

const unseenSlugs = new Set();
const newLevelCards = { a1: [], a2: [], b1: [], b2: [], c1: [] };
const seen = new Set(); // dedup key = (kk|ru).toLowerCase()
let totalKept = 0;
let totalRemoved = 0;

for (const lvl of LEVELS) {
  const cards = levelCards[lvl];
  for (const c of cards) {
    const slug = topicSlug(c._oldTopic);
    if (!slug) {
      unseenSlugs.add(c._oldTopic);
      continue;
    }
    const kk = (c.kazakh ?? '').toLowerCase().trim();
    const ru = (c.translationRu ?? '').toLowerCase().trim();
    const dedupKey = `${kk}|${ru}`;
    if (seen.has(dedupKey)) {
      totalRemoved += 1;
      continue;
    }
    seen.add(dedupKey);
    newLevelCards[lvl].push({ ...c, category: slug });
    totalKept += 1;
  }
}

if (unseenSlugs.size > 0) {
  console.warn('\n!! Topics with no mapping (will be dropped):');
  for (const t of unseenSlugs) console.warn('  - ' + JSON.stringify(t));
}

if (totalKept === 0) {
  console.error('\n!! No cards survived. Aborting to preserve existing files.');
  process.exit(1);
}

console.log(`\nKept: ${totalKept}, Removed (cross-level dups): ${totalRemoved}`);

/* -------------------------------------------------------------------------- */
/* Group by topic + re-number IDs                                              */
/* -------------------------------------------------------------------------- */

for (const lvl of LEVELS) {
  const cards = newLevelCards[lvl];
  // Group by slug, preserve order of first occurrence.
  const byTopic = new Map();
  for (const c of cards) {
    if (!byTopic.has(c.category)) byTopic.set(c.category, []);
    byTopic.get(c.category).push(c);
  }
  // Re-number IDs: a1-0001, a1-0002, …
  let i = 1;
  for (const arr of byTopic.values()) {
    for (const c of arr) {
      c.id = `${lvl}-${String(i).padStart(4, '0')}`;
      i += 1;
    }
  }
  // Sort topics in the canonical order so the output is stable.
  const sortedTopics = [...byTopic.entries()].sort((a, b) => {
    const ai = TOPICS.findIndex((t) => t.slug === a[0]);
    const bi = TOPICS.findIndex((t) => t.slug === b[0]);
    return ai - bi;
  });
  const topics = {};
  for (const [slug, arr] of sortedTopics) {
    topics[slug] = arr.map((c) => {
      const { _oldTopic, ...rest } = c;
      return rest;
    });
  }
  newLevelCards[lvl] = { topics, byTopic };
  console.log(`${lvl}: ${Object.keys(topics).length} topics, ${cards.length} cards`);
}

/* -------------------------------------------------------------------------- */
/* Write outputs                                                               */
/* -------------------------------------------------------------------------- */

const tier = {
  a1: 'beginner',
  a2: 'elementary',
  b1: 'intermediate',
  b2: 'upperIntermediate',
  c1: 'advanced',
};

for (const lvl of LEVELS) {
  const { topics } = newLevelCards[lvl];
  const totalCards = Object.values(topics).reduce((n, arr) => n + arr.length, 0);
  const out = {
    level: lvl.toUpperCase(),
    topicCount: Object.keys(topics).length,
    topics,
  };
  writeFileSync(resolve(DECKS, `${lvl}.json`), JSON.stringify(out, null, 2) + '\n');
  console.log(`wrote ${lvl}.json: ${totalCards} cards, ${Object.keys(topics).length} topics`);
}

// Update decks.json with the new card counts.
const decksPath = resolve(ROOT, 'src/data/decks.json');
const decksJson = JSON.parse(readFileSync(decksPath, 'utf8'));
const levelsArr = Array.isArray(decksJson) ? decksJson : decksJson.levels;
for (const lvl of LEVELS) {
  const { topics } = newLevelCards[lvl];
  const totalCards = Object.values(topics).reduce((n, arr) => n + arr.length, 0);
  const entry = levelsArr.find((d) => d.id === lvl);
  if (entry) {
    entry.cardCount = totalCards;
    entry.tier = tier[lvl];
    // Also update the `topics` listing — the UI uses this to render
    // the level description ("<N> тем на <M> уровнях"). Use the
    // canonical RU display names from the TOPICS table.
    const used = new Set();
    for (const slug of Object.keys(topics)) used.add(slug);
    const slugs = TOPICS.map((t) => t.slug).filter((s) => used.has(s));
    entry.topics = slugs.map((s) => TOPICS.find((t) => t.slug === s).ru).join(', ');
  }
}
writeFileSync(decksPath, JSON.stringify(decksJson, null, 2) + '\n');
console.log(`updated decks.json: cardCount = ${levelsArr.map((d) => `${d.id}=${d.cardCount}`).join(' ')}`);

/* -------------------------------------------------------------------------- */
/* Generate the topic taxonomy as `src/i18n/topics.ts`                         */
/* -------------------------------------------------------------------------- */

/**
 * The new shape of `topics.ts`:
 *   - `TOPIC_NAMES`: `slug -> { ru, kz }` (canonical display pair)
 *   - `TOPIC_ORDER`: array of slugs in canonical order
 *   - `translateTopic(slug, lang)`: returns "RU / KZ" for `ru` and
 *     "RU / KZ" for `en` (the app is Russian-only but the function
 *     is kept general so any future language keeps working).
 *
 * The old `topics.ts` had a flat EN/RU string map keyed on the old
 * English canonical names ("Greetings", "Family", …). Those old
 * names no longer appear in `decks/*.json` — the cards now have
 * slugs like "greetings" and "family" — so the old dictionary is
 * obsolete and we replace it wholesale.
 */
function genTopicsModule() {
  const lines = [];
  lines.push(`/**`);
  lines.push(` * Unified topic taxonomy.`);
  lines.push(` *`);
  lines.push(` * Generated by \`scripts/unify-topics.mjs\` from the canonical`);
  lines.push(` * topic list at the top of that file. Do not edit by hand —`);
  lines.push(` * re-run the script to refresh.`);
  lines.push(` *`);
  lines.push(` * Each entry pairs a Russian display name with a Kazakh one so`);
  lines.push(` * the UI can render "<Название на русском> / <Название на казахском>"`);
  lines.push(` * (per project requirement) without going through i18n tables.`);
  lines.push(` */`);
  lines.push(``);
  lines.push(`/** A canonical topic: { ru, kz } display names. */`);
  lines.push(`export interface TopicName {`);
  lines.push(`  /** Russian display name (used in the UI as the primary label). */`);
  lines.push(`  ru: string;`);
  lines.push(`  /** Kazakh display name (used in the UI as the secondary label). */`);
  lines.push(`  kz: string;`);
  lines.push(`}`);
  lines.push(``);
  lines.push(`/**`);
  lines.push(` * Slug → { ru, kz }. Stable, in canonical order. The slugs are the`);
  lines.push(` * exact strings stored in \`Card.category\` in`);
  lines.push(` * \`src/data/decks/*.json\`.`);
  lines.push(` */`);
  lines.push(`export const TOPIC_NAMES: Readonly<Record<string, TopicName>> = Object.freeze({`);
  for (const t of TOPICS) {
    lines.push(`  ${t.slug}: { ru: ${JSON.stringify(t.ru)}, kz: ${JSON.stringify(t.kz)} },`);
  }
  lines.push(`});`);
  lines.push(``);
  lines.push(`/** Slugs in canonical order (matches \`TOPICS\` in the generator). */`);
  lines.push(`export const TOPIC_ORDER: ReadonlyArray<string> = Object.freeze([`);
  for (const t of TOPICS) {
    lines.push(`  ${JSON.stringify(t.slug)},`);
  }
  lines.push(`]);`);
  lines.push(``);
  lines.push(`/** Number of canonical topics. */`);
  lines.push(`export const TOPIC_COUNT: number = ${TOPICS.length};`);
  lines.push(``);
  lines.push(`/**`);
  lines.push(` * Resolve a slug to a display label. Returns "RU / KZ" by default.`);
  lines.push(` * Unknown slugs fall back to the slug itself so the UI never blanks.`);
  lines.push(` *`);
  lines.push(` * The \`lang\` parameter is preserved for forward-compat — the app`);
  lines.push(` * is Russian-only today but the same shape works for any future`);
  lines.push(` * locale.`);
  lines.push(` */`);
  lines.push(`export function translateTopic(slug: string, _lang: 'ru' | 'en' = 'ru'): string {`);
  lines.push(`  if (!slug) return '';`);
  lines.push(`  const t = TOPIC_NAMES[slug];`);
  lines.push(`  if (!t) return slug;`);
  lines.push(`  return t.ru + ' / ' + t.kz;`);
  lines.push(`}`);
  lines.push(``);
  lines.push(`/** All canonical slugs in order. Useful for tests / iteration. */`);
  lines.push(`export const ALL_TOPIC_SLUGS: ReadonlyArray<string> = TOPIC_ORDER;`);
  lines.push(``);
  return lines.join('\n');
}

const topicsPath = resolve(ROOT, 'src/i18n/topics.ts');
writeFileSync(topicsPath, genTopicsModule());
console.log(`wrote topics.ts: ${TOPICS.length} topics`);

console.log('\nDone.');
