/**
 * TTS audio URL helper.
 *
 * Audio is pre-generated at Docker build time by
 * `scripts/generate_tts.py` (Piper ONNX) and shipped as static
 * `.wav` files under `public/audio/kk/`. Each file is keyed by the
 * first 16 hex chars of the SHA-1 of the Kazakh text, so the URL is
 * stable, cacheable by the browser, and decoupled from the word's
 * display form (lowercase / uppercase / punctuation don't matter).
 *
 * The hash function MUST match `scripts/generate_tts.py#word_hash`.
 * If you change one, change the other.
 */

/** Audio language. We currently support two voices:
 *  - `kk` → kk_KZ-issai-high (Piper)
 *  - `ru` → ru_RU-denis-medium (Piper)
 *  The narrow string-literal type keeps the call sites honest —
 *  the server validates this against its own whitelist and
 *  rejects anything else with 400. */
export type AudioLang = 'kk' | 'ru';

/** Manifest: sorted array of all hashes that have a pre-generated
 *  WAV in /audio/<lang>/. The TTS generator writes one per
 *  language after a run; we fetch each on app load so the UI can
 *  hide the speak button for words without audio. */
const manifestByLang: Record<AudioLang, Set<string> | null> = { kk: null, ru: null };
const manifestPromises: Record<AudioLang, Promise<Set<string>> | null> = {
  kk: null,
  ru: null,
};

/** Audio is generated for both Kazakh (`kk`) and Russian
 *  (`ru`). The manifest is per-language; the URL is too. */
// Vite replaces `import.meta.env.BASE_URL` with the configured `base`
// at build time. In dev / tests it resolves to '/', so URLs still
// match the existing test expectations and the local dev server.
const AUDIO_BASE = `${import.meta.env.BASE_URL}audio`;

export function audioUrl(text: string, lang: AudioLang = 'kk'): string | null {
  if (!text || !text.trim()) return null;
  // Strip surrounding whitespace; the model already handles
  // punctuation via espeak. Anything non-empty is a candidate.
  return `${AUDIO_BASE}/${lang}/${wordHash(text.trim())}.wav`;
}

/** Synchronous URL with an explicit hash. Used by tests and by the
 *  manifest check; the URL is the same as `audioUrl().slice(...)`. */
export function audioUrlForHash(hash: string, lang: AudioLang = 'kk'): string {
  return `${AUDIO_BASE}/${lang}/${hash}.wav`;
}

/** Does pre-generated audio exist for this text? Returns:
 *    - null  while the manifest is still loading (transient state)
 *    - true  once the manifest confirms a WAV exists
 *    - false once the manifest is loaded and no WAV exists for this
 *           text (user-added cards, future words, etc.)
 *
 *  We use a synchronous lookup against an in-memory Set; the manifest
 *  itself is fetched exactly once per page load and shared across
 *  every component that calls this. */
export function hasAudio(text: string, lang: AudioLang = 'kk'): boolean | null {
  if (!text || !text.trim()) return false;
  const hash = wordHash(text.trim());
  // If the manifest is still loading we report null (unknown).
  // The caller (Flashcard) treats null the same as false: don't
  // show the button until we know.
  const m = manifestByLang[lang];
  if (m === null) return null;
  return m.has(hash);
}

/** Kick off the manifest fetch for a single language. Idempotent —
 *  subsequent calls return the same in-flight promise. Safe to
 *  call from a top-level useEffect; the first caller owns the
 *  network round trip. We expose this per-language so the two
 *  manifest files can load in parallel and the UI doesn't have
 *  to wait for both before showing the first card. */
export function loadAudioManifest(lang: AudioLang = 'kk'): Promise<Set<string>> {
  if (manifestPromises[lang]) return manifestPromises[lang]!;
  manifestPromises[lang] = (async () => {
    try {
      const res = await fetch(`${AUDIO_BASE}/${lang}/manifest.json`, {
        cache: 'force-cache', // immutable per build
      });
      if (!res.ok) {
        manifestByLang[lang] = new Set();
        return manifestByLang[lang]!;
      }
      const arr = (await res.json()) as string[];
      manifestByLang[lang] = new Set(arr);
      return manifestByLang[lang]!;
    } catch {
      manifestByLang[lang] = new Set();
      return manifestByLang[lang]!;
    }
  })();
  return manifestPromises[lang]!;
}

/** Reset state (for tests). */
export function _resetAudioManifestForTests(): void {
  manifestPromises.kk = null;
  manifestPromises.ru = null;
  manifestByLang.kk = null;
  manifestByLang.ru = null;
}

/** Mark a single hash as available. Called by the Flashcard after
 *  the user has triggered a lazy synthesis — the file is now on
 *  disk (the API endpoint wrote it), so we want `hasAudio()` to
 *  start returning `true` immediately, without re-fetching the
 *  whole manifest. The next page load will pick up the canonical
 *  state from the JSON file. */
export function markAudioAvailable(hash: string, lang: AudioLang = 'kk'): void {
  const m = manifestByLang[lang];
  if (!m) {
    // Manifest hasn't loaded yet — no-op is fine; when it does
    // arrive it'll have the right hash because the WAV is on
    // disk (the API wrote it before returning).
    return;
  }
  m.add(hash);
}

/** SHA-1, first 16 hex chars. Must match Python's
 *  `hashlib.sha1(word.encode("utf-8")).hexdigest()[:16]`. */
export function wordHash(text: string): string {
  return sha1Hex(text).slice(0, 16);
}

/** Self-rolled SHA-1. Returns the full 40-char hex digest. */
function sha1Hex(message: string): string {
  // Encode to UTF-8 bytes.
  const bytes = new TextEncoder().encode(message);
  const len = bytes.length;
  // Number of 32-bit words in the padded message:
  //   bytes = data + 0x80 + (zeros) + 8-byte length
  //   data  = len bytes
  //   so total = len + 9 (at minimum) → pad up to a multiple of 64
  //   bytes = ceil((len + 9) / 64) * 64
  //   words = ceil((len + 9) / 64) * 16
  //   The trick: ((len + 72) >> 6) is the block count (an integer
  //   division by 64 rounded up via the +72 nudge — anything ≤56
  //   bytes of data still fits in 1 block).
  const wordLen = ((len + 72) >> 6) << 4;
  const words = new Uint32Array(wordLen);
  for (let i = 0; i < len; i++) {
    words[i >> 2] |= bytes[i] << (24 - (i & 3) * 8);
  }
  words[len >> 2] |= 0x80 << (24 - (len & 3) * 8);
  words[wordLen - 1] = len * 8;

  let h0 = 0x67452301;
  let h1 = 0xefcdab89;
  let h2 = 0x98badcfe;
  let h3 = 0x10325476;
  let h4 = 0xc3d2e1f0;

  const rotl = (x: number, n: number) => ((x << n) | (x >>> (32 - n))) >>> 0;
  const w = new Uint32Array(80);
  for (let i = 0; i < wordLen; i += 16) {
    for (let j = 0; j < 16; j++) w[j] = words[i + j] ?? 0;
    for (let j = 16; j < 80; j++) {
      w[j] = rotl((w[j - 3] ^ w[j - 8] ^ w[j - 14] ^ w[j - 16]) >>> 0, 1);
    }

    let a = h0, b = h1, c = h2, d = h3, e = h4;
    for (let j = 0; j < 80; j++) {
      const f =
        j < 20 ? (b & c) | (~b & d) :
        j < 40 ? b ^ c ^ d :
        j < 60 ? (b & c) | (b & d) | (c & d) :
                  b ^ c ^ d;
      const k =
        j < 20 ? 0x5a827999 :
        j < 40 ? 0x6ed9eba1 :
        j < 60 ? 0x8f1bbcdc :
                  0xca62c1d6;
      const t = (rotl(a, 5) + f + e + k + (w[j] ?? 0)) >>> 0;
      e = d; d = c; c = rotl(b, 30); b = a; a = t;
    }

    h0 = (h0 + a) >>> 0;
    h1 = (h1 + b) >>> 0;
    h2 = (h2 + c) >>> 0;
    h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0;
  }

  const toHex = (n: number) => n.toString(16).padStart(8, '0');
  return toHex(h0) + toHex(h1) + toHex(h2) + toHex(h3) + toHex(h4);
}
