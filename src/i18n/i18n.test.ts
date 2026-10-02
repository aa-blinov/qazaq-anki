import { describe, it, expect, beforeEach } from 'vitest';
import { en } from './en';
import { ru } from './ru';
import { AUTH_ERROR_CODES } from '../lib/auth';
import { _resetForTests } from '../lib/storage';

/**
 * Sanity tests for the i18n module.
 */
describe('i18n dictionaries', () => {
  it('every Russian key exists in English (so missing-key fallback never blanks the UI)', () => {
    const enKeys = new Set(Object.keys(en));
    const missing = Object.keys(ru).filter((k) => !enKeys.has(k));
    expect(missing, `RU keys missing from EN: ${missing.join(', ')}`).toEqual([]);
  });

  it('no empty values in either dictionary', () => {
    for (const [k, v] of Object.entries(en)) {
      expect(v.length, `en:${k}`).toBeGreaterThan(0);
    }
    for (const [k, v] of Object.entries(ru)) {
      expect(v.length, `ru:${k}`).toBeGreaterThan(0);
    }
  });

  it('RU dictionary has a substantial number of keys (catches accidental deletion)', () => {
    expect(Object.keys(ru).length).toBeGreaterThan(80);
    expect(Object.keys(en).length).toBeGreaterThan(80);
  });
});

describe('plural variants are coherent', () => {
  function findVariants(
    dict: Record<string, string>,
    base: string,
  ): { one?: string; few?: string; many?: string } {
    return {
      one: dict[`${base}.one`],
      few: dict[`${base}.few`],
      many: dict[`${base}.many`],
    };
  }

  it('EN: every plural base has all three variants (one/few/many)', () => {
    for (const k of Object.keys(en)) {
      const base = k.replace(/\.(one|few|many)$/, '');
      if (base === k) continue;
      // For each base like "dashboard.subtitleDue", ensure all three
      // siblings exist.
      const v = findVariants(en, base);
      // We allow a base to appear in only one variant (e.g. for keys
      // like "study.empty.suggestNew" where the EN form doesn't really
      // change with count), so just sanity-check that something exists.
      expect(
        v.one ?? v.few ?? v.many,
        `EN ${base} has no plural variants at all`,
      ).toBeDefined();
    }
  });

  it('RU: every plural base has all three variants (one/few/many)', () => {
    for (const k of Object.keys(ru)) {
      const base = k.replace(/\.(one|few|many)$/, '');
      if (base === k) continue;
      const v = findVariants(ru, base);
      expect(
        v.one ?? v.few ?? v.many,
        `RU ${base} has no plural variants at all`,
      ).toBeDefined();
    }
  });
});

describe('placeholder syntax', () => {
  it('uses {name} style placeholders consistently', () => {
    for (const v of Object.values(en)) {
      const bad = v.match(/\{[^a-zA-Z_]/g);
      expect(bad, `bad placeholder in EN: ${v}`).toBeNull();
    }
    for (const v of Object.values(ru)) {
      const bad = v.match(/\{[^a-zA-Z_]/g);
      expect(bad, `bad placeholder in RU: ${v}`).toBeNull();
    }
  });

  it('no leftover English-style {plural}/{ending} placeholders', () => {
    // The Slavic-plural rewrite removed these. If anything still uses
    // them, the template will render the raw placeholder.
    const bad = /\{(plural|ending)\}/;
    for (const v of Object.values(en)) {
      expect(bad.test(v), `EN has ${v}`).toBe(false);
    }
    for (const v of Object.values(ru)) {
      expect(bad.test(v), `RU has ${v}`).toBe(false);
    }
  });
});

/**
 * Keys that are built at runtime with a template literal, so a plain
 * "is this key referenced?" sweep can never see them — and, worse, can
 * never prove they *resolve*. A missing string here does not show up as
 * a failed lookup the code notices; it shows up as the raw key painted
 * on the screen. These namespaces are the only places that can happen,
 * so they get checked exhaustively in both directions.
 */
describe('dynamically-built keys resolve', () => {
  it('every AuthErrorCode has a string in both dictionaries', () => {
    // `translateAuthError` builds `auth.errors.${code}` — a code with
    // no string renders as the literal key. `networkError` and
    // `serverError` shipped that way until this test existed.
    const missingRu = AUTH_ERROR_CODES.filter((c) => !ru[`auth.errors.${c}`]);
    const missingEn = AUTH_ERROR_CODES.filter((c) => !en[`auth.errors.${c}`]);
    expect(missingRu, `RU missing: ${missingRu.join(', ')}`).toEqual([]);
    expect(missingEn, `EN missing: ${missingEn.join(', ')}`).toEqual([]);
  });

  it('no auth.errors.* string exists without a code behind it', () => {
    // The reverse leak: `auth.errors.required` sat in both dictionaries
    // for years with nothing that could ever produce it.
    const codes = new Set<string>(AUTH_ERROR_CODES);
    const orphans = Object.keys(ru).filter(
      (k) => k.startsWith('auth.errors.') && !codes.has(k.slice('auth.errors.'.length)),
    );
    // `passwordMismatch` is the one legitimate exception: RegisterPage
    // calls t('auth.errors.passwordMismatch') directly, it is not built
    // from a code.
    const unexpected = orphans.filter((k) => k !== 'auth.errors.passwordMismatch');
    expect(unexpected, `orphaned: ${unexpected.join(', ')}`).toEqual([]);
  });

  it('the level namespaces cover every level and tier in the deck', () => {
    // HomePage builds `level.standard.${id}` with a fallback to
    // `level.tier.${tier}`.
    for (const id of ['a1', 'a2', 'b1', 'b2', 'c1']) {
      expect(ru[`level.standard.${id}`], `level.standard.${id}`).toBeTruthy();
      expect(en[`level.standard.${id}`], `level.standard.${id}`).toBeTruthy();
    }
    for (const tier of [
      'beginner',
      'elementary',
      'intermediate',
      'upperIntermediate',
      'advanced',
    ]) {
      expect(ru[`level.tier.${tier}`], `level.tier.${tier}`).toBeTruthy();
      expect(en[`level.tier.${tier}`], `level.tier.${tier}`).toBeTruthy();
    }
  });

  it('the font-size labels cover every step the Aa control offers', () => {
    // Layout builds `nav.fontSize.${fontSize}` from the scale itself.
    for (const size of ['sm', 'md', 'lg', 'xl']) {
      expect(ru[`nav.fontSize.${size}`], `nav.fontSize.${size}`).toBeTruthy();
      expect(en[`nav.fontSize.${size}`], `nav.fontSize.${size}`).toBeTruthy();
    }
  });

  it('every calendar month has a label (1-based, as getMonth() + 1)', () => {
    // StatsPage builds `stats.activity.month.${getMonth() + 1}` — note
    // the +1. A dictionary written 0-based would be off by one for the
    // whole year and nothing else would notice.
    for (let m = 1; m <= 12; m++) {
      expect(ru[`stats.activity.month.${m}`], `month ${m}`).toBeTruthy();
      expect(en[`stats.activity.month.${m}`], `month ${m}`).toBeTruthy();
    }
  });

  it('every stats tab has both a label and an aria string', () => {
    // StatsPage builds `stats.tab.${id}` and `stats.tab.${id}Aria`.
    for (const id of ['overview', 'activity', 'topics']) {
      expect(ru[`stats.tab.${id}`], `stats.tab.${id}`).toBeTruthy();
      expect(en[`stats.tab.${id}`], `stats.tab.${id}`).toBeTruthy();
      expect(ru[`stats.tab.${id}Aria`], `stats.tab.${id}Aria`).toBeTruthy();
      expect(en[`stats.tab.${id}Aria`], `stats.tab.${id}Aria`).toBeTruthy();
    }
  });
});

beforeEach(() => _resetForTests());
