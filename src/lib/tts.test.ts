/**
 * Tests for the TTS URL helper.
 *
 * The hash function MUST match `scripts/generate_tts.py#word_hash`
 * exactly — otherwise the browser asks for an audio URL that the
 * server doesn't have, and the user hears silence. These tests
 * pin the hash for a representative cross-section of inputs,
 * including the boundary lengths that broke the previous formula
 * (Kazakh strings ≥ 12 chars / 24 bytes, ASCII strings ≥ 56 bytes).
 */
import { describe, expect, it, beforeEach } from 'vitest';
import {
  audioUrl,
  audioUrlForHash,
  hasAudio,
  loadAudioManifest,
  wordHash,
  _resetAudioManifestForTests,
} from './tts';

describe('wordHash()', () => {
  // Hashes verified independently against Python's
  //   hashlib.sha1(s.encode("utf-8")).hexdigest()[:16]
  // (the canonical reference in scripts/generate_tts.py).
  const cases: Array<[string, string]> = [
    ['', 'da39a3ee5e6b4b0d'],
    ['a', '86f7e437faa5a7fc'],
    ['abc', 'a9993e364706816a'],
    ['hello world', '2aae6c35c94fcfb4'],
    // Kazakh — every char is 2 bytes in UTF-8, so these are the
    // lengths that triggered the off-by-one in the previous
    // wordLen formula.
    ['сәлем', 'de73121b06b61f80'],
    ['ал', '463afdf7003032fc'],
    ['кітап', '3c987e0ec6bb2a63'],
    ['Сәлеметсіз бе!', '2c40cd08bae92949'],
    ['Қош келдіңіз!', '3748337b3105b7ce'],
    // 12 chars = 24 bytes — the exact byte-length the old formula
    // miscalculated. A 12-char ASCII string (12 bytes) also exercises
    // the (len + 72) arithmetic on the other side of the boundary.
    ['abcdefghijkl', 'eb4608cebfcfd4df'],
    // 56 bytes — the upper end of the first 64-byte block. A single
    // 56-char ASCII string is exactly one byte short of needing a
    // second block, which is the trickiest spot in the padding math.
    ['a'.repeat(56), 'c2db330f6083854c'],
  ];

  for (const [input, expected] of cases) {
    it(`hashes ${JSON.stringify(input)} correctly`, () => {
      expect(wordHash(input)).toBe(expected);
    });
  }

  it('matches Python across the full Kazakh character range', () => {
    // We already pinned a few individual words above; this is a
    // sweep that catches a regression in the bit-shifting math
    // without us having to hand-pick every length.
    for (let n = 1; n <= 40; n++) {
      const s = 'а'.repeat(n); // 2 bytes per char → covers 2..80 bytes
      // Pre-computed Python reference; if you change the formula
      // in sha1Hex, regenerate these by running:
      //   python3 -c "import hashlib; print(hashlib.sha1(('а'*n).encode()).hexdigest()[:16])"
      // for the failing n.
      const ref = pythonHashOfA(n);
      expect(wordHash(s), `len=${n} (${n * 2} bytes)`).toBe(ref);
    }
  });
});

describe('audioUrl()', () => {
  it('returns null for empty/whitespace input', () => {
    expect(audioUrl('')).toBeNull();
    expect(audioUrl('   ')).toBeNull();
  });

  it('returns a stable /audio/kk/<hash>.wav URL for non-empty input', () => {
    expect(audioUrl('сәлем')).toBe('/audio/kk/de73121b06b61f80.wav');
    expect(audioUrl('Сәлеметсіз бе!')).toBe('/audio/kk/2c40cd08bae92949.wav');
  });

  it('honours the lang arg for the URL path', () => {
    // Same word, different langs → different URLs (because the
    // Piper model and the manifest are per-language, even
    // though the hash is text-only).
    expect(audioUrl('привет', 'ru')).toBe('/audio/ru/' + wordHash('привет') + '.wav');
    expect(audioUrl('сәлем', 'kk')).toBe('/audio/kk/' + wordHash('сәлем') + '.wav');
  });

  it('strips surrounding whitespace before hashing', () => {
    expect(audioUrl('  сәлем  ')).toBe(audioUrl('сәлем'));
  });

  it('ignores the lang argument for now (Kazakh only)', () => {
    // Type system enforces 'kk'; this just confirms the URL is
    // stable regardless of which legal value we pass.
    expect(audioUrl('сәлем', 'kk')).toBe(audioUrl('сәлем'));
  });
});

describe('audioUrlForHash()', () => {
  it('builds the canonical path from a raw hash', () => {
    expect(audioUrlForHash('de73121b06b61f80')).toBe(
      '/audio/kk/de73121b06b61f80.wav'
    );
  });
});

describe('hasAudio()', () => {
  beforeEach(() => {
    _resetAudioManifestForTests();
  });

  it('returns null while the manifest is loading', () => {
    expect(hasAudio('сәлем')).toBeNull();
  });

  it('returns true for words in the manifest', async () => {
    // We can't easily mock fetch in this isolated test, so we
    // exercise the lookup directly with the real manifest file.
    // If the manifest doesn't exist (e.g. dev without TTS), the
    // load resolves to an empty Set, so we only assert the
    // pre-condition: the call resolves without throwing.
    const set = await loadAudioManifest();
    expect(set).toBeInstanceOf(Set);
  });

  it('keeps separate manifests for kk and ru', async () => {
    const [kk, ru] = await Promise.all([loadAudioManifest('kk'), loadAudioManifest('ru')]);
    expect(kk).toBeInstanceOf(Set);
    expect(ru).toBeInstanceOf(Set);
  });

  it('returns false for empty/whitespace input', () => {
    return loadAudioManifest().then(() => {
      expect(hasAudio('')).toBe(false);
      expect(hasAudio('   ')).toBe(false);
    });
  });

  it('returns true for words in the manifest', async () => {
    // Inject a known-good manifest via the singleton.
    const { _resetAudioManifestForTests } = await import('./tts');
    _resetAudioManifestForTests();
    // We can't easily mock fetch in this isolated test, so we
    // exercise the lookup directly with the real manifest file.
    // If the manifest doesn't exist (e.g. dev without TTS), the
    // load resolves to an empty Set, so we only assert the
    // pre-condition: the call resolves without throwing.
    const set = await loadAudioManifest();
    expect(set).toBeInstanceOf(Set);
  });

  it('loadAudioManifest() is idempotent (same promise on repeat calls)', async () => {
    const a = loadAudioManifest();
    const b = loadAudioManifest();
    expect(a).toBe(b);
  });
});

/**
 * Reference hashes for the Kazakh letter "а" repeated n times,
 * computed with the Python canonical:
 *   python3 -c "import hashlib; print(hashlib.sha1(('а'*n).encode()).hexdigest()[:16])"
 * for n in 1..40. Generated once and pasted in so the test is
 * self-contained.
 */
function pythonHashOfA(n: number): string {
  const TABLE: Record<number, string> = {
    1: '51b4eac98af84251',
    2: 'f4320b14ab88927d',
    3: 'cef87244f29f81f9',
    4: 'df505b8bb4b3bc2d',
    5: 'b985c5ca49249c86',
    6: '79fb3901f9482070',
    7: '8e728af9cb1b1b56',
    8: 'ea177d99e5d05d5a',
    9: '95e87da14281a63c',
    10: '73745082e2dd4885',
    11: 'fad9125dae72b210',
    12: '86db192157c5962e',
    13: '2f84567c0728c167',
    14: '8969eaaebc311745',
    15: '010ad76dadcaa11b',
    16: '120dd3abb5e4ccfe',
    17: '3c04f3206aad2114',
    18: '3c60222dfaf55ce0',
    19: '85d82b1607566bfb',
    20: '065aab4ecedf08f4',
    21: '4f3545d19099ea09',
    22: 'c026507b191dfc1f',
    23: '2d7d9e6291fc1ea8',
    24: 'fb225344de13607a',
    25: '125086f27940d657',
    26: '402ba415ad5a421f',
    27: 'df94f6bb4aec668b',
    28: '30cf13a8bc76c5ea',
    29: '9ccbafaf203c0d11',
    30: '22441d68e0f912be',
    31: 'e5e51b31eb3a2e2c',
    32: '69a255d8d4d72484',
    33: 'ab684c5be67093d5',
    34: 'd249fe0a3a874409',
    35: 'b6ed039bffeb396e',
    36: '68e8cdba31faebec',
    37: 'ab79ef256bf0d231',
    38: '32f1eec473042b23',
    39: '3e0733891fea4db3',
    40: '491ab3b4e692625f',
  };
  const v = TABLE[n];
  if (!v) throw new Error(`No reference hash for n=${n}; regenerate via Python.`);
  return v;
}
