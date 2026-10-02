import { useEffect, useRef, type RefObject } from 'react';

/**
 * The focus lifecycle every overlay in this app owes the person using it.
 *
 * Four overlays declare `aria-modal="true"` — ConfirmDialog, AddCardModal,
 * OnboardingModal and the import confirmation in StatsPage. Declaring that
 * attribute is a promise: assistive tech is told to treat the rest of the
 * page as inert. Measured in a real browser, three of the four were
 * breaking the other half of that promise:
 *
 *   - AddCardModal moved focus nowhere. Opening it left the caret on the
 *     "Добавить карточку" button behind the scrim, and Escape did nothing,
 *     because it only ever listened from inside a dialog the user had
 *     never been moved into.
 *   - ConfirmDialog moved focus to "Отмена" correctly but let Tab walk
 *     straight out into the page behind it, and never gave the focus back
 *     on close — its own comment claimed it did.
 *   - OnboardingModal did the same as AddCardModal.
 *
 * `aria-modal` without the behaviour is worse than not declaring it: the
 * screen reader hides the page the keyboard is now walking around in.
 *
 * This hook is the whole fix, once, instead of four half-implementations:
 *
 *   - moves focus into the dialog on open (`initialFocus` ref, or the
 *     first focusable thing inside it)
 *   - wraps Tab and Shift+Tab at the ends, so focus cannot leave
 *   - closes on Escape
 *   - restores focus to whatever had it before, on close
 *   - locks body scroll while open, so the page behind does not bounce
 *     on iOS
 *
 * The drawer in Layout.tsx is deliberately NOT using this. It is a
 * disclosure, not a modal: it stays in the document flow beside real
 * content, it closes on Escape and on an outside click, and the page
 * behind it is meant to stay reachable. It has its own handler.
 */

/** Selector for the things that can hold focus, in DOM order. */
const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

export interface ModalFocusOptions {
  /** Whether the dialog is currently on screen. */
  open: boolean;
  /**
   * Ref to the element that wraps the dialog's contents. Focus is moved
   * into it and the Tab wrap is computed from it.
   */
  containerRef: RefObject<HTMLElement | null>;
  /**
   * Ref to the control that should receive focus on open. Omit it and
   * the first focusable descendant is used instead.
   */
  initialFocusRef?: RefObject<HTMLElement | null>;
  /** Called on Escape. Defaults to doing nothing. */
  onClose?: () => void;
  /**
   * Set false for an overlay whose content should stay scrollable — a
   * tall form, say. The default is right for a confirmation.
   */
  lockBodyScroll?: boolean;
}

export function useModalFocus({
  open,
  containerRef,
  initialFocusRef,
  onClose,
  lockBodyScroll = true,
}: ModalFocusOptions): void {
  // The element that had focus before the dialog opened, so the same
  // hook can be mounted by several overlays without them clobbering each
  // other's restore target.
  const restoreRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const container = containerRef.current;
    if (!container) return;

    // Capture the trigger *before* moving focus, or the thing we should
    // return to is whatever we just focused.
    restoreRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;

    const focusables = (): HTMLElement[] =>
      Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.offsetParent !== null || el === document.activeElement,
      );

    // Defer to the next frame: on open the dialog has just been mounted
    // and the browser has not laid it out yet, so offsetParent is still
    // null for everything inside it.
    const raf = requestAnimationFrame(() => {
      const target = initialFocusRef?.current ?? focusables()[0] ?? container;
      target.focus();
    });

    let prevOverflow = '';
    if (lockBodyScroll) {
      prevOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
    }

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose?.();
        return;
      }
      if (e.key !== 'Tab') return;

      const items = focusables();
      if (items.length === 0) {
        // Nothing to move to — keep focus on the dialog itself rather
        // than letting it escape to the page behind.
        e.preventDefault();
        container?.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;

      if (e.shiftKey && (active === first || !container?.contains(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (active === last || !container?.contains(active))) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', onKeyDown);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener('keydown', onKeyDown);
      if (lockBodyScroll) document.body.style.overflow = prevOverflow;
      // Give the focus back. Deferred a frame so the dialog has actually
      // unmounted — focusing a node inside a dialog that is on its way
      // out silently does nothing.
      const restore = restoreRef.current;
      if (restore && document.contains(restore)) {
        requestAnimationFrame(() => restore.focus());
      }
    };
  }, [open, containerRef, initialFocusRef, onClose, lockBodyScroll]);
}
