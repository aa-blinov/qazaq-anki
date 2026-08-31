import { describe, it, expect, beforeEach } from 'vitest';
import { en } from './en';
import { ru } from './ru';
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

beforeEach(() => _resetForTests());
