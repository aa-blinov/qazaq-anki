import { useEffect, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { focusListboxSelection, moveListboxFocus } from '../lib/listboxKeys';
import { useLang } from '../contexts/LanguageContext';
import styles from './TopicSelect.module.css';

interface TopicSelectProps {
  /** The current card's category slug — drives the "current" highlight
   *  and the trigger label. */
  current: string;
  /** All available category slugs in the active level. The dropdown
   *  lists these sorted alphabetically by their localized name. */
  options: string[];
  /** The slug that the page-level filter is currently set to. Often
   *  equal to `current` (you're studying the topic of the current
   *  card), but can also be "all" when no topic filter is active. */
  activeTopic: string;
  /** Click handler — page wires this to its topic-filter setter. */
  onTopicChange: (slug: string) => void;
  /** Called when the user picks "All topics" to clear the filter.
   *  If omitted, the "All" entry is hidden. */
  onClear?: () => void;
  /** Optional per-slug counts shown after each topic name in the
   *  menu. Used by the Study page so the user can see how many
   *  cards each topic contains without leaving the filter. The
   *  Flashcard usage leaves this off to keep the menu minimal. */
  counts?: Record<string, number>;
  /** Label for the "All" entry's count, when both `onClear` and
   *  `counts` are provided. Typically the total card count of the
   *  current pool. */
  totalCount?: number;
  /** When `true`, the trigger stretches to fill the parent width
   *  (used on the Study page, where the topic picker is a first-
   *  class control). The default `false` keeps the trigger compact
   *  so it fits next to other meta on the Flashcard. */
  fullWidth?: boolean;
}

/**
 * Compact topic dropdown for the Flashcard meta. Replaces what used
 * to be an inline `(Тема)` text with an interactive control: the
 * trigger shows the current topic, click opens a menu of every
 * available topic in the active level, sorted alphabetically by
 * the localized name. Selecting one switches the study session's
 * topic filter; the card itself doesn't change.
 *
 * Why a dropdown (not a chip row) — the Flashcard has very limited
 * room in the top-right corner. A chip row of every topic would
 * overflow on A1 (10+ topics). The dropdown keeps the trigger at
 * one line and lets the user reach the rest on demand.
 *
 * The trigger stops event propagation so clicking it doesn't reveal
 * the card (the whole card is a tap target for that).
 */
export function TopicSelect({
  current,
  options,
  activeTopic,
  onTopicChange,
  onClear,
  counts,
  totalCount,
  fullWidth = false,
}: TopicSelectProps) {
  const { t, tTopic } = useLang();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const listRef = useRef<HTMLUListElement | null>(null);

  // Close on outside click. Listening on the document is fine here —
  // the dropdown is the only "menu" in the meta corner, no
  // z-index/nesting concerns.
  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (!wrapRef.current) return;
      if (!wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  // Close on Escape — keyboard users still get out.
  // Same listbox contract as PickerSelect, from the same helper: Escape
  // closes and returns the focus, arrows and Home/End move between the
  // options, and opening lands on the active topic.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      const list = listRef.current;
      if (!list) return;
      if (
        moveListboxFocus(e, list, () => {
          setOpen(false);
          triggerRef.current?.focus();
        })
      ) {
        return;
      }
    }
    document.addEventListener('keydown', onKey);
    const raf = requestAnimationFrame(() => {
      if (listRef.current) focusListboxSelection(listRef.current, activeTopic);
    });
    return () => {
      document.removeEventListener('keydown', onKey);
      cancelAnimationFrame(raf);
    };
  }, [open, activeTopic]);

  // Sort the options by their localized name (so the menu reads in
  // the user's language, not the slug order). Use a stable sort
  // because Array.prototype.sort is stable in modern JS.
  const sortedOptions = [...options].sort((a, b) =>
    tTopic(a).localeCompare(tTopic(b), undefined, { sensitivity: 'base' }),
  );

  const isCurrent = (slug: string) => slug === current;
  const isActive = (slug: string) => slug === activeTopic;

  return (
    <div className={`${styles.wrap} ${fullWidth ? styles.wrapFull : ''}`} ref={wrapRef}>
      <button
        ref={triggerRef}
        type="button"
        className={styles.trigger}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
        aria-haspopup="listbox"
        aria-expanded={open}
        title={t('study.topic.label', { topic: tTopic(current) })}
      >
        <span className={styles.triggerLabel}>{tTopic(current)}</span>
        <ChevronDown size={11} className={styles.chev} aria-hidden="true" />
      </button>
      {open ? (
        <ul
          ref={listRef}
          className={styles.menu}
          role="listbox"
          aria-label={t('study.topic.label', { topic: tTopic(current) })}
        >
          {onClear ? (
            <li>
              <button
                type="button"
                role="option"
                aria-selected={activeTopic === 'all'}
                data-value="all"
                tabIndex={activeTopic === 'all' ? 0 : -1}
                className={`${styles.item} ${
                  activeTopic === 'all' ? styles.itemActive : ''
                }`}
                onClick={(e) => {
                  e.stopPropagation();
                  onClear();
                  setOpen(false);
                  triggerRef.current?.focus();
                }}
              >
                <span className={styles.itemLabel}>{t('study.topic.all')}</span>
                {typeof totalCount === 'number' ? (
                  <span className={styles.itemCount}>{totalCount}</span>
                ) : null}
              </button>
            </li>
          ) : null}
          {sortedOptions.map((slug) => (
            <li key={slug}>
              <button
                type="button"
                role="option"
                aria-selected={isActive(slug)}
                data-value={slug}
                tabIndex={isActive(slug) ? 0 : -1}
                className={`${styles.item} ${isActive(slug) ? styles.itemActive : ''}`}
                onClick={(e) => {
                  e.stopPropagation();
                  onTopicChange(slug);
                  setOpen(false);
                  triggerRef.current?.focus();
                }}
                title={isCurrent(slug) ? t('study.topic.current') : undefined}
              >
                <span className={styles.itemLabel}>{tTopic(slug)}</span>
                {isCurrent(slug) ? (
                  <span className={styles.itemDot} aria-hidden="true">●</span>
                ) : null}
                {counts && typeof counts[slug] === 'number' ? (
                  <span className={styles.itemCount}>{counts[slug]}</span>
                ) : null}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
