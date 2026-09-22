/**
 * Russian plural rule: one / few / many.
 *
 *   one   — ends in 1, except 11              (1, 21, 31 … 81, 101)
 *   few   — ends in 2, 3, 4, except 12-14    (2, 3, 4, 22, 23 … 122, 123)
 *   many  — everything else                   (0, 5-20, 25-30, 35-40 …)
 *
 * Inline references:
 *   https://www.unicode.org/cldr/charts/latest/supplemental/language_plural_rules.html#ru
 *   https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/PluralRules
 *
 * Intl.PluralRules is the platform's answer — same categories
 * (one/few/many), locale-aware (we pin 'ru' so the script works
 * server-side too). We use it instead of hand-rolling the modulo
 * because the platform already gets it right (and updates for
 * any future CLDR revisions automatically).
 */

export type RuPluralForm = 'one' | 'few' | 'many';

const PR = new Intl.PluralRules('ru');

export function pluralRuForm(n: number): RuPluralForm {
  // Intl.PluralRules returns 'one' | 'few' | 'many' | 'other' for
  // 'ru'. We collapse 'other' to 'many' (Russian has no fourth
  // form, so this only happens for n=0 / negatives where we
  // still want the "many" grammatical form).
  const r = PR.select(Math.abs(n));
  return r === 'other' ? 'many' : (r as RuPluralForm);
}

/**
 * Pick the right Russian form for a count and concatenate it
 * with the number. Usage:
 *
 *   pluralRu(1, 'карточка', 'карточки', 'карточек')
 *     // → "1 карточка"
 *   pluralRu(5, 'карточка', 'карточки', 'карточек')
 *     // → "5 карточек"
 *
 * Numbers ≥ 1000 get a thousands separator — "1 234" reads
 * better than "1234" in the confirmation dialog.
 */
export function pluralRu(
  n: number,
  one: string,
  few: string,
  many: string,
): string {
  const form = pluralRuForm(n);
  const word = form === 'one' ? one : form === 'few' ? few : many;
  return `${n.toLocaleString('ru-RU')} ${word}`;
}
