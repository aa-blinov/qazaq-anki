import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { Plus, Search, Trash2, Upload, X, Pencil, ChevronLeft, ChevronRight, ArrowRight } from 'lucide-react';
import {
  LEVELS,
  getTotalCards,
  getCardCount,
  levelIdToName,
  loadLevel,
  getCategoriesByLevel,
  type Card,
} from '../data/decks';
import { useLang } from '../contexts/LanguageContext';
import { useUserCards } from '../contexts/UserCardsContext';
import { useProgress } from '../contexts/ProgressContext';
import { makeProgressKey, type ProgressMap } from '../lib/progress';
import { isDue } from '../lib/sm2';
import { api, type UserCard } from '../lib/api';
import { AddCardModal } from '../components/AddCardModal';
import styles from './BrowsePage.module.css';

type SourceFilter = 'all' | 'official' | 'mine';
type StatusFilter = 'all' | 'new' | 'inProgress' | 'mastered' | 'overdue';

// Recognised facet keys. Anything in the search box that looks
// like `key:value` where `key` is in this whitelist is treated as
// a facet and stripped from the free-text portion. Unknown keys
// fall through to the free-text search so the user can still
// search for `phase:new` literally if they want.
const FACET_KEYS = new Set(['level', 'topic']);

interface ParsedSearch {
  // Facet tokens the user typed in. Only the keys we recognise
  // (level, topic) end up here; everything else is ignored at
  // the facet layer and stays in `rest` as a free-text query.
  facets: { level?: string; topic?: string };
  // Free-text portion of the search box, with all `key:value`
  // tokens removed and adjacent whitespace collapsed.
  rest: string;
}

// Split the search-box string into "facet tokens" and "free text".
// Tokens are matched as `key:value` with no surrounding spaces,
// case-insensitive on the key. The value is taken verbatim up
// to the next whitespace. Tokens whose key isn't in FACET_KEYS
// stay in `rest` so the user can still substring-search for them.
function parseSearchFacets(raw: string): ParsedSearch {
  const facets: { level?: string; topic?: string } = {};
  const tokens: string[] = [];
  for (const tok of raw.split(/\s+/)) {
    const m = /^([A-Za-z_][\w-]*):(.+)$/.exec(tok);
    if (m && FACET_KEYS.has(m[1].toLowerCase())) {
      const key = m[1].toLowerCase();
      if (key === 'level' && facets.level === undefined) facets.level = m[2];
      else if (key === 'topic' && facets.topic === undefined) facets.topic = m[2];
      // Drop the token from the free-text portion either way.
    } else {
      tokens.push(tok);
    }
  }
  return { facets, rest: tokens.join(' ').trim() };
}

/**
 * Derive a single, mutually-exclusive progress status for a card by
 * looking at both directions. Priority (most important wins):
 *   overdue > mastered > inProgress > new
 *
 * `overdue` is "any direction is past its due date" — even if the
 * other direction is mastered, the card is still surfaced as
 * overdue. That's the whole point: the user is about to forget it.
 *
 * `new` means "no progress entry in either direction" — a brand
 * new card the user has never rated.
 */
function getCardStatus(
  card: Card,
  progress: ProgressMap,
  now: Date,
): StatusFilter {
  // Progress is unified per card, so there's one schedule to
  // read instead of two. The status filter keeps the same
  // vocabulary (new / inProgress / mastered / overdue) so the
  // Browse UI doesn't have to change.
  const s = progress[makeProgressKey(card.id)] ?? null;
  if (s === null) return 'new';
  if (isDue(s, now)) return 'overdue';
  if (s.phase === 'review') return 'mastered';
  return 'inProgress';
}

/** How many rows to render on first paint. The list grows in chunks
 *  of the same size when the user clicks "Показать ещё". Keep it
 *  small enough that an "All levels" load doesn't visibly stall. */
const PAGE_SIZE = 50;

export function BrowsePage() {
  const { t, lang, tTopic } = useLang();
  const { cards: userCards, remove: removeUserCard, refresh: refreshUserCards } = useUserCards();
  const { progress } = useProgress();
  const [search, setSearch] = useState('');
  // Parse facets out of the search box. The user can type things
  // like `level:b1 topic:family` and have those tokens act as
  // shortcuts for the level + topic chips. Free text (anything
  // that's not a recognised facet) is still substring-searched
  // across the card fields. Facets are a one-way push — typing
  // a facet in the box updates the chip, but the chip stays
  // selected even after the user erases the facet from the
  // box (they can deselect it via the chip itself).
  const parsedSearch = useMemo(() => parseSearchFacets(search), [search]);
  const [activeLevel, setActiveLevel] = useState<string>('all');
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [allOfficial, setAllOfficial] = useState<Card[]>([]);
  const [levelOfficial, setLevelOfficial] = useState<Card[]>([]);
  const [loading, setLoading] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  // Edit card — when set, the AddCardModal opens in edit mode
  // for that user card. Cleared on modal close.
  const [editingCard, setEditingCard] = useState<UserCard | null>(null);
  // .apkg import state — the file input ref, an in-flight flag
  // for the button, and a result message shown under the header.
  const apkgInputRef = useRef<HTMLInputElement | null>(null);
  const [apkgImporting, setApkgImporting] = useState(false);
  const [apkgResult, setApkgResult] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  // Pagination — current page is mirrored to ?page=N so a deep link
  // lands on the right slice. Resets to 1 on any filter / search
  // change (see the effect below).
  const [searchParams, setSearchParams] = useSearchParams();
  const pageFromUrl = (() => {
    const n = parseInt(searchParams.get('page') ?? '1', 10);
    return Number.isFinite(n) && n > 0 ? n : 1;
  })();
  const [currentPage, setCurrentPage] = useState(pageFromUrl);

  // Ref to the card list — when the user clicks a page number we
  // smooth-scroll back to the top of the list so they're not stuck
  // looking at the bottom of a 80-page corpus.
  const listRef = useRef<HTMLDivElement | null>(null);

  // Apply facets parsed out of the search box. The parsed shape
  // is memoised off `search` so we only run the level-validation
  // + topic-fuzzy-match on actual search changes, not on every
  // keystroke that doesn't change the facet shape.
  //
  // We only PUSH state from the search box; the chips remain
  // authoritative. If the user erases `level:b1` from the box,
  // activeLevel stays at `b1` — the chip is the source of truth
  // for "what's selected", the search box is a shortcut.
  useEffect(() => {
    const f = parsedSearch.facets;
    if (f.level) {
      const valid = LEVELS.some((l) => l.id === f.level);
      if (valid && activeLevel !== f.level) setActiveLevel(f.level);
    }
    if (f.topic) {
      // Topic facet is fuzzy — match by category key OR by the
      // localised display name ("Семья", "family", "familie").
      // The categories list is computed below, so we look it up
      // from a snapshot of allOfficial + userCards here.
      const allCategories = new Set<string>();
      for (const c of allOfficial) allCategories.add(c.category);
      for (const c of userCards) allCategories.add(c.category);
      const lower = f.topic.toLowerCase();
      const match = [...allCategories].find(
        (cat) =>
          cat === lower ||
          cat.toLowerCase() === lower ||
          tTopic(cat).toLowerCase().includes(lower),
      );
      if (match && activeCategory !== match) setActiveCategory(match);
    }
  }, [parsedSearch, activeLevel, activeCategory, allOfficial, userCards, tTopic]);

  // Load every level once so the "All" tab can show the full corpus
  // without round-tripping per filter change.
  useEffect(() => {
    let cancelled = false;
    Promise.all(LEVELS.map((l) => loadLevel(l.id))).then((results) => {
      if (cancelled) return;
      setAllOfficial(results.flat());
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Reload per-level cards on filter change so categories refresh
  // alongside the table.
  useEffect(() => {
    if (activeLevel === 'all') {
      setLevelOfficial(allOfficial);
      return;
    }
    let cancelled = false;
    setLoading(true);
    loadLevel(activeLevel).then((cards) => {
      if (cancelled) return;
      setLevelOfficial(cards);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [activeLevel, allOfficial]);

  // Source filter: which pool are we drawing from right now?
  const pool: Card[] = useMemo(() => {
    if (sourceFilter === 'mine') return userCards;
    if (sourceFilter === 'official') {
      // For "official" inside a level, only show that level; for "all"
      // levels, show everything. The level chip already gates the
      // official subset, so we just respect the level switch.
      return activeLevel === 'all' ? allOfficial : levelOfficial;
    }
    // 'all' = both pools merged. User cards live in the same level
    // namespace, so the level switch applies to them too.
    return activeLevel === 'all' ? [...allOfficial, ...userCards] : [...levelOfficial, ...userCards];
  }, [sourceFilter, activeLevel, allOfficial, levelOfficial, userCards]);

  // Topic chip set: union of topics from whichever pool is active.
  // For user cards we let the user see their own category names.
  // Sorted alphabetically by the LOCALIZED name (not the slug) so the
  // order matches the dropdown on the Flashcard and the user's mental
  // model. `sensitivity: 'base'` so e.g. "Ё" sorts the same as "Е"
  // and case differences don't reorder.
  const categories = useMemo(() => {
    if (activeLevel === 'all') return [];
    const sortByName = (a: string, b: string) =>
      tTopic(a).localeCompare(tTopic(b), undefined, { sensitivity: 'base' });
    if (sourceFilter === 'mine') {
      const set = new Set<string>();
      for (const c of userCards) if (c.level === levelIdToName(activeLevel)) set.add(c.category);
      return Array.from(set).sort(sortByName);
    }
    if (sourceFilter === 'official') {
      return [...getCategoriesByLevel(activeLevel)].sort(sortByName);
    }
    // 'all' — union of both.
    const set = new Set<string>(getCategoriesByLevel(activeLevel));
    for (const c of userCards) if (c.level === levelIdToName(activeLevel)) set.add(c.category);
    return Array.from(set).sort(sortByName);
  }, [sourceFilter, activeLevel, userCards, tTopic]);

  const filtered = useMemo(() => {
    // Facets are already applied to activeLevel/activeCategory via
    // the effect above. Here we only run the free-text substring
    // search over the rest of the query — so `level:b1 family`
    // becomes (B1 filter) AND substring search for "family".
    const q = parsedSearch.rest.toLowerCase();
    const levelName = activeLevel === 'all' ? null : levelIdToName(activeLevel);
    // "now" is captured once per render — if the user clicks "Overdue"
    // while a review is happening, a card that just became due won't
    // slip out of the filter mid-render. Acceptable precision for a
    // human-paced UI.
    const now = new Date();
    return pool.filter((c) => {
      if (levelName && c.level !== levelName) return false;
      if (activeCategory !== 'all' && c.category !== activeCategory) return false;
      if (statusFilter !== 'all' && getCardStatus(c, progress, now) !== statusFilter) {
        return false;
      }
      if (!q) return true;
      // Search runs across every user-visible text field. The
      // example is included so a phrase the user remembers from
      // a curated sentence still surfaces the card. Matching is
      // case-insensitive substring — the user shouldn't have to
      // guess the exact casing.
      return (
        c.kazakh.toLowerCase().includes(q) ||
        c.transliteration.toLowerCase().includes(q) ||
        c.translation.toLowerCase().includes(q) ||
        c.translationRu.toLowerCase().includes(q) ||
        c.category.toLowerCase().includes(q) ||
        tTopic(c.category).toLowerCase().includes(q) ||
        c.example.toLowerCase().includes(q)
      );
    });
  }, [pool, activeLevel, activeCategory, statusFilter, parsedSearch, progress, tTopic]);

  // "Are any filters active?" — used to decide whether the empty
  // state is "no cards at all" (point to the Add card button) or
  // "your filters hid everything" (offer a reset button).
  const filtersActive =
    parsedSearch.facets.level !== undefined ||
    parsedSearch.facets.topic !== undefined ||
    parsedSearch.rest.length > 0 ||
    activeLevel !== 'all' ||
    activeCategory !== 'all' ||
    sourceFilter !== 'all' ||
    statusFilter !== 'all';

  function resetFilters() {
    setSearch('');
    setActiveLevel('all');
    setActiveCategory('all');
    setSourceFilter('all');
    setStatusFilter('all');
  }

  // Sort the filtered set by the Kazakh word — the user is learning
  // Kazakh, so finding a word by its native script matters more than
  // by the Russian translation. We use a Kazakh-locale collator
  // (`'kk'`) so the alphabet order is а ә б в г ғ д е ё ж з и й к
  // қ л м н ң о ө п р с т у ұ ү ф х һ ц ч ш щ ъ ы і ь э ю я, and
  // digits / Latin / punctuation sort before the first letter.
  //
  // `sensitivity: 'base'` makes the comparison case-insensitive and
  // strips diacritics, so e.g. 'Астана' and 'астана' compare equal —
  // Kazakh words are normally all lowercase so this only matters at
  // the boundary with the small set of Latin / digit-prefixed words.
  //
  // Done in a separate memo so the filter (which re-checks every
  // card on every search keystroke) doesn't have to also pay for
  // sorting.
  const sorted = useMemo(() => {
    const collator = new Intl.Collator('kk', { sensitivity: 'base', usage: 'sort' });
    return [...filtered].sort((a, b) => collator.compare(a.kazakh, b.kazakh));
  }, [filtered]);

  // Per-status counts, shown in the chip meta so the user can see
  // "what's in each bucket" before clicking.
  const statusCounts = useMemo(() => {
    const now = new Date();
    const counts: Record<StatusFilter, number> = {
      all: pool.length,
      new: 0,
      inProgress: 0,
      mastered: 0,
      overdue: 0,
    };
    for (const c of pool) {
      counts[getCardStatus(c, progress, now)] += 1;
    }
    return counts;
  }, [pool, progress]);

  // Reset pagination whenever the result set changes. Without this,
  // Any filter / search change resets to page 1 — otherwise the user
  // would land on a page index that doesn't exist for the new pool
  // (e.g. switching from "All" 80 pages down to "B1" with only 11
  // pages). Mirrored to the URL.
  //
  // Skip the first render: a deep link like /browse?page=15 should
  // land on page 15, not be wiped to 1 by the initial effect fire.
  // Some of the filter values (activeCategory, statusFilter) are
  // derived from the corpus or context and can settle a tick after
  // mount, so we use a ref rather than relying on a single "first
  // run" — once we've seen one effect fire, the next change is
  // user-driven and warrants the page reset.
  const initialFiltersRef = useRef({
    activeLevel,
    activeCategory,
    sourceFilter,
    statusFilter,
    search,
  });
  useEffect(() => {
    const init = initialFiltersRef.current;
    const changed =
      init.activeLevel !== activeLevel ||
      init.activeCategory !== activeCategory ||
      init.sourceFilter !== sourceFilter ||
      init.statusFilter !== statusFilter ||
      init.search !== search;
    if (!changed) return;
    if (currentPage !== 1) {
      setCurrentPage(1);
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.delete('page');
        return next;
      }, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeLevel, activeCategory, sourceFilter, statusFilter, search]);

  // Mirror the current page to the URL when the user clicks a page
  // number. `replace: true` so we don't pollute browser history with
  // every page click. Also scrolls the list back to the top so the
  // user sees the new slice from the beginning.
  useEffect(() => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (currentPage === 1) next.delete('page');
        else next.set('page', String(currentPage));
        return next;
      },
      { replace: true },
    );
    listRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPage]);

  // Clamp the URL page to the available range when the pool changes.
  // If the user has ?page=80 in the URL but the new filter only has
  // 3 pages, jump to the last available page.
  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  // Skip the first run — on mount the corpus may not have loaded
  // yet, so `totalPages` reports 1 and we'd clamp a deep-linked
  // ?page=15 down to 1 before any cards have arrived. Wait for
  // totalPages to settle before doing the clamp.
  const totalPagesSeen = useRef(false);
  useEffect(() => {
    if (!totalPagesSeen.current) {
      totalPagesSeen.current = true;
      return;
    }
    if (pageFromUrl > totalPages) {
      setCurrentPage(totalPages);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [totalPages]);

  // The slice the DOM actually renders. The underlying `sorted`
  // array is the full result; we just take one window of it.
  const visible = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return sorted.slice(start, start + PAGE_SIZE);
  }, [sorted, currentPage]);

  // Page-number list with smart ellipsis. With 80 pages, we don't
  // want to render 80 buttons — just first / prev-1, current-1 /
  // current / current+1 / ellipsis / last.
  const pageNumbers = useMemo(() => {
    if (totalPages <= 7) {
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    }
    const pages: Array<number | '…'> = [1];
    const left = Math.max(2, currentPage - 1);
    const right = Math.min(totalPages - 1, currentPage + 1);
    if (left > 2) pages.push('…');
    for (let i = left; i <= right; i++) pages.push(i);
    if (right < totalPages - 1) pages.push('…');
    pages.push(totalPages);
    return pages;
  }, [currentPage, totalPages]);

  const rangeStart = sorted.length === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1;
  const rangeEnd = Math.min(currentPage * PAGE_SIZE, sorted.length);

  // In Russian UI, show the Russian translation by default; otherwise English.
  const showRu = lang === 'ru';

  // Open the AddCardModal in edit mode for a user-owned card.
  // The Edit button only renders for `deck === 'user'`, so the
  // narrowing inside is sound — but TypeScript can't prove
  // that from a row callback, so we cast through `unknown`
  // only as a last resort. We do the type check first.
  const handleEdit = (card: Card) => {
    if (card.deck !== 'user') return;
    setEditingCard(card as UserCard);
  };

  const onDelete = async (id: string) => {
    if (confirmDeleteId !== id) {
      setConfirmDeleteId(id);
      window.setTimeout(() => {
        setConfirmDeleteId((cur) => (cur === id ? null : cur));
      }, 3500);
      return;
    }
    setConfirmDeleteId(null);
    try {
      await removeUserCard(id);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('[browse] delete failed:', err);
    }
  };

  return (
    <div className={styles.page}>
      <header className={styles.head}>
        <div>
          <h1>{t('browse.title')}</h1>
          <p className="muted">
            {t('browse.subtitle', { count: getTotalCards().toLocaleString() })}
          </p>
        </div>
        <div className={styles.headActions}>
          <button
            type="button"
            className="btn btn--lg"
            onClick={() => apkgInputRef.current?.click()}
            disabled={apkgImporting}
            title={t('browse.importApkg.tooltip')}
            aria-label={t('browse.importApkg.aria')}
          >
            <Upload size={16} />
            {apkgImporting ? t('browse.importApkg.inProgress') : t('browse.importApkg.label')}
          </button>
          <input
            ref={apkgInputRef}
            type="file"
            accept=".apkg,application/zip,application/octet-stream"
            className={styles.hiddenFileInput}
            onChange={async (e) => {
              const file = e.target.files?.[0];
              // Always reset the input so picking the same file
              // twice in a row fires another `change` event.
              e.target.value = '';
              if (!file) return;
              setApkgImporting(true);
              setApkgResult(null);
              try {
                // The level picker — we import into the currently
                // active level so the user has a sensible default
                // (they can switch levels and re-import for the
                // next one).
                const targetLevel: 'A1' | 'A2' | 'B1' | 'B2' | 'C1' =
                  activeLevel === 'all'
                    ? 'A1'
                    : (activeLevel.toUpperCase() as 'A1' | 'A2' | 'B1' | 'B2' | 'C1');
                const r = await api.cards.importApkg(file, targetLevel);
                const skipped = r.skipped.unknownModel + r.skipped.noKk + r.skipped.noRu;
                setApkgResult({
                  kind: 'ok',
                  text: t('browse.importApkg.success', {
                    imported: r.imported,
                    deck: r.deckName || t('browse.importApkg.ankiDeck'),
                    skipped,
                  }),
                });
                void refreshUserCards();
              } catch (err) {
                setApkgResult({
                  kind: 'err',
                  text:
                    err instanceof Error
                      ? err.message
                      : t('browse.importApkg.error'),
                });
              } finally {
                setApkgImporting(false);
              }
            }}
          />
          <button
            type="button"
            className={`btn btn--lg ${styles.addBtn}`}
            onClick={() => setShowAdd(true)}
          >
            <Plus size={16} />
            {t('browse.add')}
          </button>
        </div>
        {apkgResult ? (
          <p
            className={
              apkgResult.kind === 'ok'
                ? styles.importOk
                : styles.importErr
            }
            role={apkgResult.kind === 'ok' ? 'status' : 'alert'}
          >
            {apkgResult.text}
            <button
              type="button"
              className={styles.dismissBtn}
              aria-label={t('browse.importApkg.dismiss')}
              onClick={() => setApkgResult(null)}
            >
              <X size={14} />
            </button>
          </p>
        ) : null}
      </header>

      <div className={styles.controls}>
        <div className={styles.searchWrap}>
          <Search size={16} className={styles.searchIcon} aria-hidden="true" />
          <input
            className={`input ${styles.search}`}
            type="search"
            placeholder={t('browse.search.placeholder')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label={t('browse.search.placeholder')}
          />
        </div>
        <p className={styles.searchHint}>
          {t('browse.search.hint')}
        </p>

        <div>
          <div className={styles.filterLabel}>{t('browse.filter.level')}</div>
          <div className={styles.levelFilters} role="tablist" aria-label={t('browse.filter.levelAria')}>
            <Chip
              active={activeLevel === 'all'}
              onClick={() => {
                setActiveLevel('all');
                setActiveCategory('all');
              }}
            >
              {t('study.topic.all')}
            </Chip>
            {LEVELS.map((lvl) => (
              <Chip
                key={lvl.id}
                active={activeLevel === lvl.id}
                onClick={() => {
                  setActiveLevel(lvl.id);
                  setActiveCategory('all');
                }}
              >
                {lvl.name}
                <span className={styles.chipMeta}>{getCardCount(lvl.id).toLocaleString()}</span>
              </Chip>
            ))}
          </div>
        </div>

        <div>
          <div className={styles.filterLabel}>{t('browse.filter.source')}</div>
          <div className={styles.levelFilters} role="tablist" aria-label={t('browse.filter.source')}>
            <Chip active={sourceFilter === 'all'} onClick={() => setSourceFilter('all')}>
              {t('browse.source.all')}
            </Chip>
            <Chip active={sourceFilter === 'official'} onClick={() => setSourceFilter('official')}>
              {t('browse.source.official')}
            </Chip>
            <Chip active={sourceFilter === 'mine'} onClick={() => setSourceFilter('mine')}>
              {t('browse.source.mine')}
              <span className={styles.chipMeta}>{userCards.length.toLocaleString()}</span>
            </Chip>
          </div>
        </div>

        <div>
          <div className={styles.filterLabel}>{t('browse.filter.status')}</div>
          <div
            className={styles.levelFilters}
            role="tablist"
            aria-label={t('browse.filter.statusAria')}
          >
            <Chip active={statusFilter === 'all'} onClick={() => setStatusFilter('all')}>
              {t('browse.status.all')}
              <span className={styles.chipMeta}>{statusCounts.all.toLocaleString()}</span>
            </Chip>
            <Chip
              active={statusFilter === 'new'}
              onClick={() => setStatusFilter('new')}
            >
              {t('browse.status.new')}
              <span className={styles.chipMeta}>{statusCounts.new.toLocaleString()}</span>
            </Chip>
            <Chip
              active={statusFilter === 'inProgress'}
              onClick={() => setStatusFilter('inProgress')}
            >
              {t('browse.status.inProgress')}
              <span className={styles.chipMeta}>{statusCounts.inProgress.toLocaleString()}</span>
            </Chip>
            <Chip
              active={statusFilter === 'mastered'}
              onClick={() => setStatusFilter('mastered')}
            >
              {t('browse.status.mastered')}
              <span className={styles.chipMeta}>{statusCounts.mastered.toLocaleString()}</span>
            </Chip>
            <Chip
              active={statusFilter === 'overdue'}
              onClick={() => setStatusFilter('overdue')}
            >
              {t('browse.status.overdue')}
              <span className={styles.chipMeta}>{statusCounts.overdue.toLocaleString()}</span>
            </Chip>
          </div>
        </div>

        {categories.length > 0 ? (
          <div>
            <div className={styles.filterLabel}>
              {t('browse.filter.topic')}
              {activeCategory !== 'all' ? (
                <button
                  type="button"
                  className={styles.clearBtn}
                  onClick={() => setActiveCategory('all')}
                >
                  <X size={12} />
                  {t('browse.filter.clear')}
                </button>
              ) : null}
            </div>
            <div className={styles.categoryFilters} role="tablist" aria-label={t('browse.filter.topicAria')}>
              <Chip
                active={activeCategory === 'all'}
                onClick={() => setActiveCategory('all')}
              >
                {t('study.topic.all')}
              </Chip>
              {categories.map((cat) => {
                const n = pool.filter((c) => c.category === cat).length;
                return (
                  <Chip
                    key={cat}
                    active={activeCategory === cat}
                    onClick={() => setActiveCategory(cat)}
                  >
                    {tTopic(cat)}
                    <span className={styles.chipMeta}>{n}</span>
                  </Chip>
                );
              })}
            </div>
          </div>
        ) : null}

        {/* "Study this topic" shortcut. Renders only when the
            filters actually pin down a studyable subset:
              - a specific CEFR level is selected (activeLevel !== 'all')
              - a specific topic within that level is selected
                (activeCategory !== 'all')
            Free-text / status / source filters do NOT trigger it,
            because the StudyPage's queue doesn't currently mirror
            those (e.g. "В процессе" would need a phase filter).
            The button lands on /study/level/:lvl?topic=:t which is
            the same URL the StatsPage already uses for "open this
            topic in a study session" — one link shape, one
            destination. */}
        {activeLevel !== 'all' && activeCategory !== 'all' ? (
          <div className={styles.studyCta}>
            <Link
              to={`/study/level/${activeLevel}?topic=${encodeURIComponent(activeCategory)}`}
              className={styles.studyCtaLink}
            >
              <span className={styles.studyCtaLabel}>
                {t('browse.studyTopic.title', { count: filtered.length })}
              </span>
              <span className={styles.studyCtaHint}>
                {t('browse.studyTopic.hint')}
              </span>
              <ArrowRight size={16} aria-hidden="true" />
            </Link>
          </div>
        ) : null}
      </div>

      <div className={styles.table} ref={listRef}>
        {visible.map((c) => {
          const isMine = c.deck === 'user';
          const confirming = isMine && confirmDeleteId === c.id;
          return (
            <article key={c.id} className={styles.row}>
              <div className={styles.meta}>
                <span className={styles.levelTag}>{c.level}</span>
                <span className={styles.category}>{tTopic(c.category)}</span>
                {isMine ? <span className={styles.mineTag}>Моя</span> : null}
              </div>
              <div className={styles.kazakhBlock}>
                <div className={styles.kazakh}>{c.kazakh}</div>
                <div className={styles.trans}>{c.transliteration}</div>
              </div>
              <div className={styles.translation}>
                {showRu ? c.translationRu : c.translation}
              </div>
              {isMine ? (
                <>
                  <button
                    type="button"
                    className={styles.editBtn}
                    onClick={() => handleEdit(c)}
                    aria-label={t('browse.edit')}
                    title={t('browse.edit')}
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    type="button"
                    className={`${styles.deleteBtn} ${confirming ? styles.deleteBtnConfirm : ''}`}
                    onClick={() => onDelete(c.id)}
                    aria-label={t('browse.delete')}
                  >
                    <Trash2 size={14} />
                    {confirming ? '?' : ''}
                  </button>
                </>
              ) : null}
            </article>
          );
        })}

        {loading ? (
          <div className={styles.empty}>
            <p className="muted">…</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className={styles.empty}>
            {pool.length === 0 ? (
              // No cards at all — the corpus hasn't loaded yet, OR
              // the user is on an empty "Mine" tab.
              <p>
                {sourceFilter === 'mine'
                  ? t('browse.empty.mine')
                  : t('browse.empty.loading')}
              </p>
            ) : filtersActive ? (
              // Filters hid everything. Tell the user *what* and
              // offer a one-click reset.
              <div className={styles.emptyInner}>
                <p>{t('browse.empty.filtered')}</p>
                <button
                  type="button"
                  className="btn"
                  onClick={resetFilters}
                >
                  {t('browse.empty.reset')}
                </button>
              </div>
            ) : (
              <p>{t('browse.empty')}</p>
            )}
          </div>
        ) : (
          // Pagination. Rendered whenever there's at least one page
          // of results; if totalPages === 1 we still show the
          // summary line so the user knows they're seeing everything.
          <nav className={styles.pager} aria-label={t('browse.page.label', { current: currentPage, total: totalPages })}>
            <div className={styles.pagerSummary}>
              {t('browse.page.summary', {
                from: rangeStart.toLocaleString(),
                to: rangeEnd.toLocaleString(),
                total: sorted.length.toLocaleString(),
              })}
            </div>
            <div className={styles.pagerControls}>
              <button
                type="button"
                className={styles.pagerArrow}
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                aria-label={t('browse.page.prev')}
                title={t('browse.page.prev')}
              >
                <ChevronLeft size={16} />
              </button>
              {pageNumbers.map((n, i) =>
                n === '…' ? (
                  <span key={`ellipsis-${i}`} className={styles.pagerEllipsis} aria-hidden="true">…</span>
                ) : (
                  <button
                    key={n}
                    type="button"
                    className={`${styles.pagerPage} ${n === currentPage ? styles.pagerPageActive : ''}`}
                    onClick={() => setCurrentPage(n)}
                    aria-current={n === currentPage ? 'page' : undefined}
                    aria-label={t('browse.page.label', { current: n, total: totalPages })}
                  >
                    {n}
                  </button>
                ),
              )}
              <button
                type="button"
                className={styles.pagerArrow}
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                aria-label={t('browse.page.next')}
                title={t('browse.page.next')}
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </nav>
        )}
      </div>

      {showAdd ? (
        <AddCardModal onClose={() => setShowAdd(false)} />
      ) : null}
      {editingCard ? (
        <AddCardModal
          editing={editingCard}
          onClose={() => setEditingCard(null)}
        />
      ) : null}
    </div>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      className={`${styles.chip} ${active ? styles.chipActive : ''}`}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
