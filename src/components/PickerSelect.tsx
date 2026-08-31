// Generic dropdown picker. Same UX as TopicSelect but with
// caller-supplied options + labels, so the same widget
// can serve Карточки / Язык / Тема on the Study page
// without the TopicSelect slug-only coupling.
import { useEffect, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
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

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  const current = options.find((o) => o.value === value);
  const triggerLabel = current?.label ?? placeholder ?? value;

  return (
    <div className={`${styles.wrap} ${fullWidth ? styles.wrapFull : ''}`} ref={wrapRef}>
      <button
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
        <ul className={styles.menu} role="listbox">
          {onClear ? (
            <li>
              <button
                type="button"
                className={`${styles.item} ${
                  value === 'all' ? styles.itemActive : ''
                }`}
                onClick={(e) => {
                  e.stopPropagation();
                  onClear();
                  setOpen(false);
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
                className={`${styles.item} ${value === opt.value ? styles.itemActive : ''}`}
                onClick={(e) => {
                  e.stopPropagation();
                  onChange(opt.value);
                  setOpen(false);
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
