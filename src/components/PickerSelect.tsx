// Generic dropdown picker. Same UX as TopicSelect but with
// caller-supplied options + labels, so the same widget
// can serve Карточки / Язык / Тема on the Study page
// without the TopicSelect slug-only coupling.
import { useEffect, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { focusListboxSelection, moveListboxFocus } from '../lib/listboxKeys';
import styles from './TopicSelect.module.css';

export interface PickerOption {
  value: string;
  label: string;
  count?: number;
}

interface PickerSelectProps {
  /** Currently active value. The trigger shows the matching option's
   *  label (or `placeholder` if not found / value is empty). */
  value: string;
  options: PickerOption[];
  /** Optional "clear" entry shown at the top of the menu. When the
   *  user picks it, `onClear` is called instead of `onChange`. */
  onClear?: () => void;
  clearLabel?: string;
  clearCount?: number;
  onChange: (value: string) => void;
  /** Label shown in the trigger when the value doesn't match any
   *  option (e.g. "all" while options are real categories). */
  placeholder?: string;
  /** Highlight an option with a small dot. Used by the cards picker
   *  to mark the "current card's category" — same UX as TopicSelect. */
  currentMarker?: string;
  fullWidth?: boolean;
}

export function PickerSelect({
  value,
  options,
  onClear,
  clearLabel,
  clearCount,
  onChange,
  placeholder,
  currentMarker,
  fullWidth = false,
}: PickerSelectProps) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const listRef = useRef<HTMLUListElement | null>(null);

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

  // The listbox keyboard contract. Escape closes AND puts the focus back
  // on the trigger — closing a popup and stranding the focus on <body>
  // loses the user's place entirely, which on a filter row means
  // re-tabbing through the whole study page.
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
    // Land on the selected option, not wherever the caret happened to be.
    const raf = requestAnimationFrame(() => {
      if (listRef.current) focusListboxSelection(listRef.current, value);
    });
    return () => {
      document.removeEventListener('keydown', onKey);
      cancelAnimationFrame(raf);
    };
  }, [open, value]);

  const current = options.find((o) => o.value === value);
  const triggerLabel = current?.label ?? placeholder ?? value;

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
      >
        <span className={styles.triggerLabel}>{triggerLabel}</span>
        <ChevronDown size={11} className={styles.chev} aria-hidden="true" />
      </button>
      {open ? (
        <ul ref={listRef} className={styles.menu} role="listbox" aria-label={triggerLabel}>
          {onClear ? (
            <li>
              <button
                type="button"
                role="option"
                aria-selected={value === 'all'}
                data-value="all"
                // Roving tabindex: one option is in the tab order, the
                // rest are reached with the arrow keys. Without it a
                // listbox is announced as a row of N tab stops.
                tabIndex={value === 'all' ? 0 : -1}
                className={`${styles.item} ${
                  value === 'all' ? styles.itemActive : ''
                }`}
                onClick={(e) => {
                  e.stopPropagation();
                  onClear();
                  setOpen(false);
                  triggerRef.current?.focus();
                }}
              >
                <span className={styles.itemLabel}>{clearLabel}</span>
                {typeof clearCount === 'number' ? (
                  <span className={styles.itemCount}>{clearCount}</span>
                ) : null}
              </button>
            </li>
          ) : null}
          {options.map((opt) => (
            <li key={opt.value}>
              <button
                type="button"
                role="option"
                aria-selected={value === opt.value}
                data-value={opt.value}
                tabIndex={value === opt.value ? 0 : -1}
                className={`${styles.item} ${value === opt.value ? styles.itemActive : ''}`}
                onClick={(e) => {
                  e.stopPropagation();
                  onChange(opt.value);
                  setOpen(false);
                  triggerRef.current?.focus();
                }}
              >
                <span className={styles.itemLabel}>{opt.label}</span>
                {currentMarker === opt.value ? (
                  <span className={styles.itemDot} aria-hidden="true">●</span>
                ) : null}
                {typeof opt.count === 'number' ? (
                  <span className={styles.itemCount}>{opt.count}</span>
                ) : null}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
