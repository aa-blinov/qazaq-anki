#!/usr/bin/env python3
"""
Generate Kazakh TTS audio for every unique word in the official
decks using Piper (VITS via ONNX Runtime). One WAV per word,
keyed by the first 16 hex chars of the SHA-1 of the Kazakh text.

The Docker build invokes this once per image version. Re-runs are
idempotent: words whose WAV already exists are skipped, so an
incremental build (e.g. when one level's JSON changes) only pays
for the new words.

CLI:
    python scripts/generate_tts.py            # generate everything missing
    python scripts/generate_tts.py --word ...  # generate a single word (debug)
    python scripts/generate_tts.py --limit 50  # first 50 only (smoke test)
"""
import argparse
import hashlib
import json
import sys
import time
import wave
from pathlib import Path

try:
    from piper import PiperVoice
except ImportError:
    print("Piper not installed. Run: pip install piper-tts onnxruntime", file=sys.stderr)
    raise

# Project layout — script lives in scripts/, project root is one up.
SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = SCRIPT_DIR.parent
DECKS_DIR = PROJECT_ROOT / "src" / "data" / "decks"
AUDIO_ROOT = PROJECT_ROOT / "public" / "audio"
MODELS_DIR = PROJECT_ROOT / "models"

# Language → voice file + audio subdir. The "lang" key is the
# short tag the front-end uses in `audioUrl(text, 'kk')` /
# `audioUrl(text, 'ru')`; the subdir is the folder the WAVs
# land in (and that the browser fetches via /audio/<subdir>/).
# Each model is loaded once at startup and reused across all
# words in that language.
LANGUAGES = {
    "kk": {
        "model":  "/app/models/kk/kk_KZ-issai-high.onnx",
        "subdir": "kk",
    },
    "ru": {
        "model":  "/app/models/ru/ru_RU-denis-medium.onnx",
        "subdir": "ru",
    },
}


def word_hash(word: str) -> str:
    """Match src/lib/tts.ts#wordHash — first 16 hex chars of SHA-1."""
    return hashlib.sha1(word.encode("utf-8")).hexdigest()[:16]


def collect_words() -> list[tuple[str, str]]:
    """Unique words per language across every official deck.
    Returns a list of `(lang, word)` tuples — Kazakh is always
    emitted; Russian is added because the user may want to
    hear the translation as well. Both share the same hash
    function so a Russian word and a Kazakh word with the
    same SHA-1 would collide — vanishingly unlikely for normal
    prose, and the per-language subdir keeps the files apart
    on disk."""
    out: list[tuple[str, str]] = []
    seen: set[tuple[str, str]] = set()
    for deck_path in sorted(DECKS_DIR.glob("*.json")):
        with deck_path.open("r", encoding="utf-8") as f:
            data = json.load(f)
        for cards in data.get("topics", {}).values():
            for c in cards:
                kk = c.get("kazakh")
                if kk and kk.strip() and ("kk", kk) not in seen:
                    seen.add(("kk", kk))
                    out.append(("kk", kk))
                ru = c.get("translationRu") or c.get("translation")
                if ru and ru.strip() and ("ru", ru) not in seen:
                    seen.add(("ru", ru))
                    out.append(("ru", ru))
    return out


def synth_one(voice: PiperVoice, word: str, out_path: Path) -> None:
    """Synthesize one word, write 22kHz mono 16-bit PCM WAV."""
    chunks = list(voice.synthesize(word))
    if not chunks:
        raise RuntimeError("piper returned no audio chunks")
    with wave.open(str(out_path), "wb") as f:
        f.setnchannels(1)
        f.setsampwidth(2)  # 16-bit
        f.setframerate(voice.config.sample_rate)
        for chunk in chunks:
            f.writeframes(chunk.audio_int16_bytes)


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument(
        "--lang",
        choices=list(LANGUAGES),
        help="Restrict generation to one language. Default = all.",
    )
    p.add_argument(
        "--audio-root",
        default=str(AUDIO_ROOT),
        help="Audio root directory; per-language subdirs are appended.",
    )
    p.add_argument("--word", help="Generate just this single word (debug; pairs with --lang)")
    p.add_argument("--limit", type=int, help="Cap on number of words generated")
    p.add_argument("--force", action="store_true", help="Regenerate even if WAV exists")
    args = p.parse_args()

    # Filter the languages we'll iterate over. When `--lang` is set
    # we only generate that one. When `--word` is set we expect
    # the caller to know what they're doing — they specify the
    # lang explicitly OR we default to the first one (Kazakh).
    langs = [args.lang] if args.lang else list(LANGUAGES)
    if args.word and not args.lang:
        # Default to Kazakh for a one-shot debug run — that's
        # the most common case the user is testing.
        langs = ["kk"]

    overall_failed = 0
    for lang in langs:
        spec = LANGUAGES[lang]
        model_path = Path(spec["model"])
        config_path = model_path.with_suffix(".onnx.json")
        audio_dir = Path(args.audio_root) / spec["subdir"]
        audio_dir.mkdir(parents=True, exist_ok=True)

        if not model_path.exists():
            print(f"ERROR: model not found at {model_path}", file=sys.stderr)
            overall_failed += 1
            continue
        if not config_path.exists():
            print(f"ERROR: config not found at {config_path}", file=sys.stderr)
            overall_failed += 1
            continue

        print(f"[tts] loading model {model_path.name} ({model_path.stat().st_size // 1024 // 1024} MB)")
        t0 = time.time()
        voice = PiperVoice.load(str(model_path), str(config_path))
        print(f"[tts] loaded in {time.time() - t0:.1f}s, sample rate = {voice.config.sample_rate} Hz")

        if args.word:
            # Debug mode: just the one word in this language.
            words: list[str] = [args.word]
        else:
            words_all = collect_words()
            words = [w for (l, w) in words_all if l == lang]
            if args.limit:
                words = words[: args.limit]
            print(f"[tts] {len(words)} unique {lang} words across all decks")

        generated = 0
        skipped = 0
        failed = 0
        t0 = time.time()
        for i, word in enumerate(words, 1):
            h = word_hash(word)
            out = audio_dir / f"{h}.wav"
            if out.exists() and out.stat().st_size >= 10_000 and not args.force:
                skipped += 1
                continue
            try:
                synth_one(voice, word, out)
                generated += 1
            except Exception as e:
                failed += 1
                print(f"[tts]   [{lang}] {i:4}/{len(words)} FAIL {word!r}: {e}")
                continue
            if i % 50 == 0 or i == len(words):
                elapsed = time.time() - t0
                rate = (generated + failed) / max(elapsed, 0.001)
                print(
                    f"[tts]   [{lang}] {i:4}/{len(words)} "
                    f"({generated} new, {skipped} cached, {failed} fail) — {rate:.1f}/s"
                )

        elapsed = time.time() - t0
        print(
            f"[tts] [{lang}] done in {elapsed:.1f}s — "
            f"generated={generated} skipped={skipped} failed={failed}"
        )
        if failed > 0:
            overall_failed += 1

        # Write the manifest for this language. The browser
        # fetches /audio/<lang>/manifest.json on load.
        if not args.word:
            write_manifest(audio_dir, lang)
    return 0 if overall_failed == 0 else 2


def write_manifest(audio_dir: Path, lang: str) -> None:
    """Scan audio_dir for *.wav and write a sorted JSON array of
    their stem (the hash) to manifest.json. The manifest lives
    next to the WAVs so the file is cacheable alongside them."""
    if not audio_dir.exists():
        return
    hashes = sorted(p.stem for p in audio_dir.glob("*.wav"))
    manifest = audio_dir / "manifest.json"
    manifest.write_text(json.dumps(hashes, ensure_ascii=False), encoding="utf-8")
    print(f"[tts] wrote manifest with {len(hashes)} hashes to {manifest}")


if __name__ == "__main__":
    raise SystemExit(main())
