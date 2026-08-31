#!/usr/bin/env node
/**
 * Парсер лексических минимумов A1/A2/B1/B2/C1 (qazcorpus.kz) в
 * `src/data/decks/<level>.json`.
 *
 * Стратегия:
 *  1. Парсим ToC (страница 3): {sectionName, startPage}.
 *  2. Для каждой страницы определяем секцию по startPage.
 *  3. Извлекаем табличные строки `kk | ru | en` через Y-группировку
 *     и X-мерж глифов.
 */
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const PDF_DIR = process.argv[2] || '/tmp/lexmin';
const OUT_DIR = resolve(ROOT, 'src/data/decks');

const LICENSE = {
  source: 'kazcorpus-lexmin-v1',
  sourceUrl: (level) =>
    `https://qazcorpus.kz/_oqu-ishorpus/Sauattik/pdf/Лексикалық_минимум_${level}.pdf`,
  license: 'CC-BY-4.0',
  attribution:
    'Ахмет Байтұрсынұлы атындағы Тіл білімі институты, Астана, 2017. ISBN.',
};

const TOPIC_MAP = {
  ТАНЫСУ: 'Greetings',
  ОТБАСЫ: 'Family',
  ЖАНУЯ: 'Family',
  МЕКЕНЖАЙ: 'Home',
  ҮЙ: 'Home',
  'ҮЙ. ПӘТЕР': 'Home',
  ЖҰМЫС: 'Work',
  'АЗЫҚ-ТҮЛІК': 'Food',
  ТАҒАМ: 'Food',
  'БОС УАҚЫТ': 'Leisure',
  ӘУЕСҚОЙЛЫҚ: 'Leisure',
  'АУА РАЙЫ': 'Weather',
  КИІМ: 'Clothes',
  ДЕНСАУЛЫҚ: 'Health',
  САЯХАТ: 'Travel',
  БІЛІМ: 'Education',
  ТАБИҒАТ: 'Nature',
  ҚАЛА: 'City',
  АУЫЛ: 'Village',
  МЕРЕКЕЛЕР: 'Holidays',
  ҰЛТТЫҚ: 'Culture',
  СПОРТ: 'Sport',
  ТЕХНОЛОГИЯ: 'Technology',
  КӨЛІК: 'Transport',
  АДАМ: 'People',
  УАҚЫТ: 'Time',
  САН: 'Numbers',
  'ІС-ҚАҒАЗДАР': 'Documents',
  ҒИМАРАТТАР: 'Buildings',
  'ЕСІМДЕР СЫРЫ': 'Names',
  'АДАМ КЕЛБЕТІ': 'Appearance',
  'МЕНІҢ ЕЛІМ': 'My Country',
  'ҚАРЫМ-ҚАТЫНАС': 'Communication',
  'БАСПАСӨЗ-МЕДИА': 'Media',
  'ӨМІР СҮРУ САЛТЫ': 'Lifestyle',
  ТҰЛҒАЛАР: 'Personalities',
  МАМАНДЫҚ: 'Profession',
  'ОТАНДЫҚ ТАУАР': 'Domestic Goods',
  'ӘЛЕМДЕ ТАЛАЙ ҚЫЗЫҚ БАР': 'World',
  'СӘН ӘЛЕМІ': 'Fashion',
  РЕСМИ: 'Official',
  'СҮЙІКТІ ІС ЖӘНЕ КӘСІП': 'Hobby & Profession',
  'ДЕНСАУЛЫҚ – ЗОР БАЙЛЫҚ': 'Health',
  ӨНЕР: 'Art',
  'ӨСІМДІКТЕР ӘЛЕМІ': 'Plants',
  'ҚЫЗМЕТ КӨРСЕТУ ОРЫНДАРЫ': 'Services',
  'ӨМІРБАЯН': 'Biography',
};

const CYR_TO_LAT = {
  а: 'a', ә: 'a', б: 'b', в: 'v', г: 'g', ғ: 'g', д: 'd', е: 'e', ё: 'yo',
  ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', қ: 'q', л: 'l', м: 'm', н: 'n',
  ң: 'n', о: 'o', ө: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ұ: 'u',
  ү: 'u', ф: 'f', х: 'h', һ: 'h', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'shch',
  ъ: '', ы: 'y', і: 'i', ь: '', э: 'e', ю: 'yu', я: 'ya',
};
function cyr2lat(s) {
  return s
    .toLowerCase()
    .split('')
    .map((c) => CYR_TO_LAT[c] ?? c)
    .join('')
    .replace(/[^a-z'-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function slug(s) {
  return s
    .toLowerCase()
    .replace(/[^a-zа-яё0-9]+/giu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

async function loadPdf(path) {
  const data = new Uint8Array(await readFile(path));
  const doc = await getDocument({ data }).promise;
  const pages = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const txt = await page.getTextContent();
    pages.push(
      txt.items
        .filter((it) => it.str && it.str.trim().length > 0)
        .map((it) => ({ str: it.str.trim(), x: it.transform[4], y: it.transform[5] })),
    );
  }
  return { numPages: doc.numPages, pages };
}

function groupByRow(items, yTolerance = 3) {
  if (items.length === 0) return [];
  const sorted = [...items].sort((a, b) => b.y - a.y || a.x - b.x);
  const rows = [];
  let currentY = sorted[0].y;
  let currentRow = [sorted[0]];
  for (let i = 1; i < sorted.length; i++) {
    const it = sorted[i];
    if (Math.abs(it.y - currentY) <= yTolerance) {
      currentRow.push(it);
    } else {
      rows.push(currentRow);
      currentRow = [it];
      currentY = it.y;
    }
  }
  if (currentRow.length > 0) rows.push(currentRow);
  return rows.map((r) => r.sort((a, b) => a.x - b.x));
}

function mergeRow(row, xGap = 6) {
  if (row.length === 0) return [];
  const words = [];
  let current = row[0].str;
  let lastX = row[0].x + (row[0].str?.length ?? 0) * 5;
  for (let i = 1; i < row.length; i++) {
    const it = row[i];
    if (it.x - lastX < xGap) {
      current += it.str;
    } else {
      words.push(current);
      current = it.str;
    }
    lastX = it.x + (it.str?.length ?? 0) * 5;
  }
  if (current) words.push(current);
  return words;
}

function splitByColumns(row) {
  if (row.length < 3) return null;
  const clusters = [];
  let current = [row[0]];
  for (let i = 1; i < row.length; i++) {
    const gap = row[i].x - (row[i - 1].x + (row[i - 1].str?.length ?? 0) * 5);
    if (gap > 25) {
      clusters.push(current);
      current = [row[i]];
    } else {
      current.push(row[i]);
    }
  }
  clusters.push(current);
  if (clusters.length < 2) return null;
  const kk = clusters[0].map((it) => it.str).join('').trim();
  const en = clusters[clusters.length - 1].map((it) => it.str).join('').trim();
  const ruItems = clusters.slice(1, -1).flat();
  const ru = ruItems.map((it) => it.str).join('').trim();
  return { kk, ru, en };
}

/**
 * Parse the ToC from page 3. Returns sorted list of
 * {roman, name, startPage}.
 */
function parseToc(items) {
  // The ToC is one big string of items. We need to extract
  // section boundaries. Three patterns we know:
  //  (a) "I БӨЛІМ. ТАНЫСУ ... 10" (A1/A2 — Roman numerals)
  //  (b) "БІРІНШІ БӨЛІМ. ҚАРЫМ-ҚАТЫНАС ... 10" (B1 — Kazakh numerals)
  //  (c) For B2/C1 the ToC is missing; sections are header rows on
  //      content pages like "ПРИРОДА, NATURE".
  const text = items.map((it) => it.str).join(' ');
  // Match (a) and (b)
  const re =
    /(?:([IVX]+)|(БІРІНШІ|ЕКІНШІ|ҮШІНШІ|ТӨРТІНШІ|БЕСІНШІ|АЛТЫНШЫ|ЖЕТІНШІ|СЕГІЗІНШІ|ТОҒЫЗЫНШЫ|ОНЫНШЫ))\s*БӨЛІМ\.?\s+([^.\d]+?)(?:\.+|\s)+(\d+)/g;
  const out = [];
  let m;
  while ((m = re.exec(text)) !== null) {
    out.push({
      marker: m[1] || m[2],
      name: m[3].trim(),
      startPage: parseInt(m[4], 10),
    });
  }
  return out;
}

/**
 * For B2/C1, sections are detected per-page: a "header row" is a
 * row where the kazakh and english parts are both ALL-CAPS.
 * E.g. "ПРИРОДА", "NATURE" or "АУА РАЙЫ", "ПОГОДА".
 */
function isHeaderRow(row) {
  if (row.length < 2) return false;
  const text = mergeRow(row).join(' ').trim();
  if (text.length < 3 || text.length > 80) return false;
  // Must contain only letters and spaces (plus some joining marks
  // like commas, hyphens, parens)
  if (!/^[А-ЯӨҮҢҚҒҺІA-Z\s,\-()]+$/.test(text)) return false;
  // First chunk must be uppercase Kazakh
  const kz = row[0]?.str ?? '';
  if (!/^[А-ЯӨҮҢҚҒҺІ]/.test(kz)) return false;
  return true;
}

/**
 * Build a page → section lookup from the ToC.
 */
function buildPageMap(toc) {
  // Page 1-2: cover/title; page 3: ToC; page 4+: content.
  // Each ToC entry's startPage is where the section begins.
  const pageMap = new Map();
  for (let i = 0; i < toc.length; i++) {
    const cur = toc[i];
    const next = toc[i + 1];
    const end = next ? next.startPage - 1 : 999;
    for (let p = cur.startPage; p <= end; p++) {
      pageMap.set(p, cur.name);
    }
  }
  return pageMap;
}

function extractRowsFromPage(items) {
  const rows = groupByRow(items);
  const out = [];
  for (const row of rows) {
    const merged = mergeRow(row);
    const text = merged.join(' ');
    if (/^[IVX]+\s*БӨЛІМ/.test(text)) continue;
    // Also skip Kazakh-numeral headers like "БІРІНШІ БӨЛІМ"
    if (/^[А-Я]+\s*БӨЛІМ/.test(text)) continue;
    if (text.length < 3) continue;
    const col = splitByColumns(row);
    if (!col) continue;
    if (!col.kk || !col.ru || !col.en) continue;
    if (!/[а-яёәіңүұқғөһ]/.test(col.kk)) continue;
    if (!/[а-яё]/.test(col.ru)) continue;
    if (!/[a-z]/.test(col.en)) continue;
    // For B1+ the same tables also contain dialogues and example
    // phrases (multiple words in kk). Filter those out so we keep
    // only word-list rows.
    if (col.kk.trim().split(/\s+/).length > 3) continue;
    // Also reject rows where the en column has commas (typical of
    // example sentences rather than single-word definitions).
    if (col.en.includes(',') || col.en.includes('(') || col.en.includes(';')) continue;
    out.push({ kk: col.kk, ru: col.ru, en: col.en });
  }
  return out;
}

async function buildLevel(level) {
  const file = `${PDF_DIR}/lexmin_${level}.pdf`;
  if (!existsSync(file)) {
    console.warn(`[skip] ${file} не найден`);
    return null;
  }
  console.log(`\n[${level}] читаю ${file}`);
  const { numPages, pages } = await loadPdf(file);
  console.log(`  страниц: ${numPages}`);

  // ToC: page 3 (always, per the format we observed)
  const tocItems = pages[2] || [];
  const toc = parseToc(tocItems);
  console.log(`  ToC секций: ${toc.length}`);
  for (const t of toc) console.log(`    [${t.marker}] ${t.name} → стр ${t.startPage}`);
  const pageMap = buildPageMap(toc);

  // For B2/C1 the ToC is empty — fall back to per-page header
  // detection. As soon as we see a header row, all subsequent
  // rows on that page belong to that section.
  const byTopic = {};
  let fallbackSection = null;
  for (let i = 0; i < pages.length; i++) {
    const pageNum = i + 1;
    const rows = groupByRow(pages[i]);

    // Detect the section for this page.
    let sectionName = pageMap.get(pageNum) || null;
    if (!sectionName) {
      // Look for a header row at the top of the page.
      const topRows = rows.slice(0, Math.min(3, rows.length));
      for (const r of topRows) {
        if (isHeaderRow(r)) {
          // Use the merged text of the header row as the section name.
          const text = mergeRow(r).join(' ').trim();
          // Strip the english part (after the comma or last english word)
          const m = text.match(/^([^,]+?)(?:,|$)\s*([A-Z][A-Z\s]+)$/);
          sectionName = m ? m[1].trim() : text;
          break;
        }
      }
    }
    if (!sectionName) {
      // Continue using the previous section if we have one
      if (fallbackSection) sectionName = fallbackSection;
      else continue;
    }
    fallbackSection = sectionName;

    // Extract table rows (skipping header rows)
    const tableRows = [];
    let seenHeader = false;
    for (const row of rows) {
      if (isHeaderRow(row)) {
        seenHeader = true;
        continue;
      }
      // Skip sub-section labels like "А С ПАН Н ЕБО S K y"
      // which are header continuations (we already took the section
      // name from the first header row).
      if (seenHeader) tableRows.push(row);
    }
    // If we never saw a header on this page, treat all rows as
    // table rows (handles pages 1-2 of A1/A2 where ToC = page 3).
    if (!seenHeader && toc.length === 0) {
      // Same as above: all rows.
    } else if (!seenHeader) {
      // Standard page after the header was on a previous page; just
      // take everything that isn't another header.
      for (const row of rows) {
        if (!isHeaderRow(row)) tableRows.push(row);
      }
    }

    const entries = [];
    for (const row of tableRows) {
      const col = splitByColumns(row);
      if (!col) continue;
      if (!col.kk || !col.ru || !col.en) continue;
      if (!/[а-яёәіңүұқғөһ]/.test(col.kk)) continue;
      if (!/[а-яё]/.test(col.ru)) continue;
      if (!/[a-z]/.test(col.en)) continue;
      if (col.kk.trim().split(/\s+/).length > 3) continue;
      if (col.en.includes(',') || col.en.includes('(') || col.en.includes(';')) continue;
      // Skip sub-section labels that the header detection missed
      if (isHeaderRow(row)) continue;
      entries.push({ kk: col.kk, ru: col.ru, en: col.en });
    }
    if (entries.length === 0) continue;
    const topic = TOPIC_MAP[sectionName] || sectionName;
    if (!byTopic[topic]) byTopic[topic] = [];
    byTopic[topic].push(...entries);
  }
  let total = 0;
  for (const [t, es] of Object.entries(byTopic)) {
    total += es.length;
    console.log(`  ${t}: ${es.length} слов`);
  }
  console.log(`  итого: ${total} слов`);
  return { level, total, byTopic };
}

function makeCards(byTopic, level) {
  const topics = {};
  // Dedupe across the whole level by (kk+ru) — the same Kazakh word
  // with the same Russian meaning should only appear once. Keeps the
  // kk-wikitionary:танысу дубль из двух соседних секций.
  const seen = new Set();
  let seq = 0;
  for (const [topic, entries] of Object.entries(byTopic)) {
    if (!topics[topic]) topics[topic] = [];
    for (let i = 0; i < entries.length; i++) {
      const e = entries[i];
      const key = `${e.kk.toLowerCase().trim()}|${e.ru.toLowerCase().trim()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      seq += 1;
      const id = `${level.toLowerCase()}-${seq.toString().padStart(4, '0')}`;
      topics[topic].push({
        id,
        level,
        category: topic,
        kazakh: e.kk,
        transliteration: cyr2lat(e.kk),
        translation: e.en,
        translationRu: e.ru,
        example: '',
        source: LICENSE.source,
        sourceUrl: `${LICENSE.sourceUrl(level)}#${slug(e.kk)}`,
        license: LICENSE.license,
        attribution: LICENSE.attribution,
      });
    }
  }
  return topics;
}

async function main() {
  if (!existsSync(OUT_DIR)) await mkdir(OUT_DIR, { recursive: true });
  const levels = ['A1', 'A2', 'B1', 'B2', 'C1'];
  for (const level of levels) {
    const result = await buildLevel(level);
    if (!result) continue;
    if (result.total === 0) {
      console.log(`  [skip] ${level} — 0 слов, оставляю существующий файл`);
      continue;
    }
    const topics = makeCards(result.byTopic, level);
    const levelFile = {
      level,
      topicCount: Object.keys(topics).length,
      topics,
    };
    const out = resolve(OUT_DIR, `${level.toLowerCase()}.json`);
    await writeFile(out, JSON.stringify(levelFile, null, 2));
    console.log(`  → ${out}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
