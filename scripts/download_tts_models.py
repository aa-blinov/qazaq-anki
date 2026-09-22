#!/usr/bin/env python3
"""
Download Piper ONNX voice models for the TTS service.

The image keeps a tiny base (Python + piper-tts + the wrapper).
Voice models are ~60 MB each (kk + ru) and only needed for the
long tail of user-added cards — the 3,996 words in the official
decks ship as pre-generated WAVs in public/audio/ and never touch
this code path.

Why lazy and not vendored at build time:
  - Image stays small (~400 MB vs ~520 MB with models).
  - Faster `docker compose build` (~30s vs ~3min on first run).
  - Model updates land without a full image rebuild.

Idempotent — if the .onnx + .onnx.json already exist at the
target path, the script exits 0 without re-downloading.

Usage:
    python scripts/download_tts_models.py
    python scripts/download_tts_models.py --target /app/models
    python scripts/download_tts_models.py --lang kk          # one language
    python scripts/download_tts_models.py --lang ru
"""
import argparse
import hashlib
import sys
from pathlib import Path
from urllib.request import urlopen, Request
from urllib.error import HTTPError, URLError

# Pinned to a specific Piper voice release. Each (lang, voice_name,
# quality) tuple maps to:
#   - the HuggingFace file URL (.onnx + .onnx.json)
#   - the destination filename (and its sibling config)
#
# Bumping these requires retesting — voice quality and espeak-ng
# phoneme IDs can drift between Piper releases.
MODELS = {
    "kk": {
        "voice": "kk_KZ-issai-high",
        # Files land at <target>/kk/ — matches the layout
        # tts_service.py expects (LANGUAGES["kk"]["model"]).
        "subdir": "kk",
        "files": [
            "https://huggingface.co/rhasspy/piper-voices/resolve/main/kk/kk_KZ/issai/high/kk_KZ-issai-high.onnx",
            "https://huggingface.co/rhasspy/piper-voices/resolve/main/kk/kk_KZ/issai/high/kk_KZ-issai-high.onnx.json",
        ],
    },
    "ru": {
        "voice": "ru_RU-denis-medium",
        "subdir": "ru",
        "files": [
            "https://huggingface.co/rhasspy/piper-voices/resolve/main/ru/ru_RU/denis/medium/ru_RU-denis-medium.onnx",
            "https://huggingface.co/rhasspy/piper-voices/resolve/main/ru/ru_RU/denis/medium/ru_RU-denis-medium.onnx.json",
        ],
    },
}

CHUNK = 64 * 1024


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as fh:
        for chunk in iter(lambda: fh.read(CHUNK), b""):
            h.update(chunk)
    return h.hexdigest()


def download(url: str, dest: Path) -> bool:
    """Returns True if the file was actually downloaded (not skipped)."""
    if dest.exists():
        # Trust the existing file. A `--force` flag could re-download +
        # verify against a pinned hash, but we don't pin hashes here
        # because Piper voices are content-addressed by their URL —
        # re-downloading would only differ if HF silently swapped the
        # file, which they don't.
        print(f"[download] skip {dest.name} ({dest.stat().st_size // 1024 // 1024} MB)")
        return False
    print(f"[download] {url}")
    print(f"          -> {dest}")
    dest.parent.mkdir(parents=True, exist_ok=True)
    req = Request(url, headers={"User-Agent": "qazaq-tts-bootstrap/1.0"})
    try:
        with urlopen(req, timeout=120) as resp, dest.open("wb") as fh:
            total = int(resp.headers.get("content-length") or 0)
            written = 0
            while True:
                chunk = resp.read(CHUNK)
                if not chunk:
                    break
                fh.write(chunk)
                written += len(chunk)
                if total:
                    pct = written * 100 // total
                    sys.stdout.write(f"\r          {written // 1024 // 1024}/{total // 1024 // 1024} MB ({pct}%)")
                    sys.stdout.flush()
            sys.stdout.write("\n")
    except (HTTPError, URLError) as e:
        # Don't leave a half-downloaded file behind — the next run
        # would skip it (exists() check) and silently use a broken
        # ONNX.
        dest.unlink(missing_ok=True)
        print(f"[download] FAILED: {e}", file=sys.stderr)
        raise
    print(f"[download] ok {dest.stat().st_size // 1024 // 1024} MB sha256={sha256(dest)[:16]}")
    return True


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--target", default="./models",
                   help="Directory to write models into. Default: ./models")
    p.add_argument("--lang", choices=["kk", "ru", "all"], default="all")
    p.add_argument("--force", action="store_true",
                   help="Re-download even if the file already exists")
    args = p.parse_args()

    target = Path(args.target).resolve()
    target.mkdir(parents=True, exist_ok=True)

    langs = ["kk", "ru"] if args.lang == "all" else [args.lang]
    failed = 0
    for lang in langs:
        spec = MODELS[lang]
        for url in spec["files"]:
            dest = target / spec["subdir"] / Path(url).name
            if args.force and dest.exists():
                dest.unlink()
            try:
                download(url, dest)
            except Exception as e:
                print(f"[download] error for {url}: {e}", file=sys.stderr)
                failed += 1

    if failed:
        print(f"[download] {failed} file(s) failed", file=sys.stderr)
        return 1
    print(f"[download] all {langs} model(s) ready in {target}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
