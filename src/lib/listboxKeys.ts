/**
 * Keyboard contract for the two filter pickers.
 *
 * `PickerSelect` and `TopicSelect` both open a `<ul role="listbox">` and
 * both were lying about it. A listbox is a contract: the options are
 * `role="option"`, the current one is `aria-selected`, only one option is
 * in the tab order, and Up/Down/Home/End move between them. This app
 * shipped a `role="listbox"` wrapping plain `<button>`s with no
 * `role="option"`, no `aria-selected`, no arrow keys, and no focus moved
 * into the menu when it opened — so a screen-reader user was told "list
 * box, 6 items" and then met six buttons with no indication of which was
 * selected, and a keyboard user had to Tab through the whole page to
 * reach the choices.
 *
 * Announcing the listbox and not implementing it is worse than not
 * announcing it, so this is the part that has to be right.
 */

const OPTION = '[role="option"]';

/** Options currently in the DOM, in visual order. */
export function listboxOptions(list: HTMLElement): HTMLElement[] {
  return Array.from(list.querySelectorAll<HTMLElement>(OPTION));
}

/**
 * Focus the selected option when a listbox opens, falling back to the
 * first one. A listbox the user cannot land in is a listbox they have to
 * hunt for with Tab.
 */
export function focusListboxSelection(list: HTMLElement, selectedValue: string | null): void {
  const options = listboxOptions(list);
  if (options.length === 0) return;
  const selected = options.find((o) => o.dataset.value === selectedValue);
  (selected ?? options[0]).focus();
}

/**
 * Move focus within an open listbox. Returns true when the key was
 * consumed, so the caller can skip its own handling.
 */
export function moveListboxFocus(
  e: KeyboardEvent,
  list: HTMLElement,
  close: () => void,
): boolean {
  if (e.key === 'Escape') {
    e.preventDefault();
    close();
    return true;
  }
  if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp' && e.key !== 'Home' && e.key !== 'End') {
    return false;
  }
  const options = listboxOptions(list);
  if (options.length === 0) return false;
  e.preventDefault();

  const active = document.activeElement as HTMLElement | null;
  const index = active ? options.indexOf(active) : -1;

  let next: number;
  if (e.key === 'Home') next = 0;
  else if (e.key === 'End') next = options.length - 1;
  else if (e.key === 'ArrowDown') next = index < 0 ? 0 : (index + 1) % options.length;
  else next = index < 0 ? options.length - 1 : (index - 1 + options.length) % options.length;

  options[next].focus();
  return true;
}
