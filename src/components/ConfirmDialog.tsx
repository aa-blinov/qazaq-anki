import { useRef, type ReactNode } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { useLang } from '../contexts/LanguageContext';
import { useModalFocus } from '../lib/useModalFocus';
import styles from './ConfirmDialog.module.css';

interface ConfirmDialogProps {
  open: boolean;
  /** Headline — short, e.g. "Сбросить прогресс?". */
  title: string;
  /** Body — paragraph(s) explaining what will happen. */
  description?: ReactNode;
  /** Optional bullet/list of consequences. Rendered as <ul>. */
  consequences?: Array<{ label: string; value: string }>;
  /** Label for the destructive confirm button. */
  confirmLabel: string;
  /** Label for the cancel button. */
  cancelLabel: string;
  /** Variant — danger styles the confirm button red. */
  variant?: 'danger' | 'primary';
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
  /** Disable the confirm button while an action is in flight. */
  busy?: boolean;
}

/**
 * Centered confirmation dialog with a soft scrim.
 *
 * Used by the Stats page for "Сбросить прогресс" — replaces
 * the previous two-tap pattern (which only swapped the button
 * label and gave the user no idea of the scope).
 *
 * Accessibility:
 *   - role="alertdialog" + aria-labelledby + aria-describedby
 *     so screen readers announce the dialog contents on open.
 *   - Focus is moved to the cancel button (the safer default
 *     — Enter then dismisses the dialog rather than triggering
 *     the destructive action).
 *   - Escape key closes the dialog (= cancel).
 *   - Body scroll is locked while the dialog is open.
 */
export function ConfirmDialog({
  open,
  title,
  description,
  consequences,
  confirmLabel,
  cancelLabel,
  variant = 'danger',
  onConfirm,
  onCancel,
  busy,
}: ConfirmDialogProps) {
  const { t } = useLang();
  const cancelRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  // Focus in on the cancel button, Tab stays inside, Escape cancels, and
  // the trigger gets the focus back on close. The previous hand-rolled
  // version did the first and the last (claimed) but not the middle two:
  // Tab walked straight out into the page behind a dialog that
  // aria-modal had already told the screen reader was inert.
  useModalFocus({
    open,
    containerRef: dialogRef,
    initialFocusRef: cancelRef,
    onClose: onCancel,
  });

  if (!open) return null;

  const titleId = 'confirm-dialog-title';
  const descId = 'confirm-dialog-desc';
  return (
    <div
      className={styles.scrim}
      onClick={(e) => {
        // Click on the scrim (= outside the dialog) cancels.
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div
        ref={dialogRef}
        className={styles.dialog}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
      >
        <button
          type="button"
          className={styles.close}
          onClick={onCancel}
          aria-label={t('confirmDialog.closeAria')}
        >
          <X size={16} aria-hidden="true" />
        </button>
        <div className={styles.icon} aria-hidden="true">
          <AlertTriangle size={22} strokeWidth={1.6} />
        </div>
        <h2 id={titleId} className={styles.title}>
          {title}
        </h2>
        {description ? (
          <div id={descId} className={styles.desc}>
            {description}
          </div>
        ) : null}
        {consequences && consequences.length > 0 ? (
          <ul className={styles.list}>
            {consequences.map((c, i) => (
              <li key={i} className={styles.listRow}>
                <span className={styles.listLabel}>{c.label}</span>
                <span className={styles.listValue}>{c.value}</span>
              </li>
            ))}
          </ul>
        ) : null}
        <div className={styles.actions}>
          <button
            ref={cancelRef}
            type="button"
            className="btn btn--ghost"
            onClick={onCancel}
            disabled={busy}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            className={`btn ${variant === 'danger' ? 'btn--danger' : ''}`}
            onClick={() => void onConfirm()}
            disabled={busy}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
