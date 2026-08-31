#!/usr/bin/env python3
"""
Long-running TTS HTTP service.

Used by the qazaq-tts-service Docker container. Exposes a single
endpoint:

    POST /synthesize   body: {"text": "сәлем"}
    → 200 {"hash": "de73...", "url": "/audio/kk/de73....wav",
           "cached": true, "latency_ms": 12}
    → 400 on empty/oversized text
    → 422 on Piper synthesis failure
    → 500 on anything else

    GET /healthz
    → 200 {"status": "ok", "model": "kk_KZ-issai-high",
           "cache_hits": 42, "cache_misses": 7}

The service is bound to 0.0.0.0:8000 and is reachable only via the
compose `qazaq` network (no host port mapping). Authentication is
the Node API's job — the TTS container itself is unauthenticated,
relying on Docker network isolation.

Logging: every request is logged to stdout in a fixed, parseable
format. The Node API also logs each call so you can correlate.

Cache: a single word costs ~0.3s of CPU on first synthesis; a
cache hit is just `pathlib.exists()` and a stat. The audio dir
is bind-mounted from the host (./public/audio/kk/), so files
written here are immediately visible to the web container.
"""
import argparse
import hashlib
import json
import logging
import os
import sys
import time
import wave
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

try:
    from piper import PiperVoice
except ImportError:
    print("Piper not installed. Run: pip install piper-tts onnxruntime", file=sys.stderr)
    raise

# Same layout as generate_tts.py — the audio dir is bind-mounted
# from the host, so writes here land in ./public/audio/<lang>/ on
# the host (and are served by the web container's nginx). Each
# language has its own Piper voice model loaded once at startup.
LANGUAGES = {
    "kk": {"model": "/app/models/kk/kk_KZ-issai-high.onnx",      "subdir": "kk"},
    "ru": {"model": "/app/models/ru/ru_RU-denis-medium.onnx",   "subdir": "ru"},
}
MAX_TEXT_LEN = 200  # guardrail: an honest study card won't exceed this

# Per-language file-level cache stats. Surfaced by /healthz.
_stats: dict[str, dict[str, int]] = {
    lang: {"hits": 0, "misses": 0, "failures": 0} for lang in LANGUAGES
}


def word_hash(word: str) -> str:
    """Match src/lib/tts.ts#wordHash — first 16 hex chars of SHA-1."""
    return hashlib.sha1(word.encode("utf-8")).hexdigest()[:16]


def synth_one(voice: PiperVoice, text: str, out: Path) -> None:
    """Synthesize a single utterance to a 22 kHz mono 16-bit WAV.

    Mirrors scripts/generate_tts.py#synth_one so a service-generated
    WAV is byte-identical to a build-time one.
    """
    out.parent.mkdir(parents=True, exist_ok=True)
    # PiperVoice.synthesize is a generator of AudioChunk objects
    # (not a context manager). Materialize the list so we can
    # surface an empty-result failure with a clear error.
    chunks = list(voice.synthesize(text))
    if not chunks:
        raise RuntimeError("piper returned no audio chunks")
    with wave.open(str(out), "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(voice.config.sample_rate)
        for chunk in chunks:
            wf.writeframes(chunk.audio_int16_bytes)


class TTSHandler(BaseHTTPRequestHandler):
    voices: dict[str, PiperVoice]    # injected by main(): lang → voice
    audio_dirs: dict[str, Path]      # injected by main(): lang → dir

    def log_message(self, fmt: str, *args) -> None:
        # Override the default access log format — we emit our own
        # structured line per request from do_POST.
        pass

    def do_GET(self) -> None:
        if self.path == "/healthz":
            self._send_json(200, {
                "status": "ok",
                "models": [Path(spec["model"]).name for spec in LANGUAGES.values()],
                "stats": _stats,
            })
            return
        self._send_json(404, {"error": "not_found"})

    def do_POST(self) -> None:
        t0 = time.time()
        if self.path != "/synthesize":
            self._send_json(404, {"error": "not_found"})
            return
        try:
            length = int(self.headers.get("Content-Length", "0") or "0")
        except ValueError:
            self._send_json(400, {"error": "bad_content_length"})
            return
        if length <= 0 or length > 64 * 1024:
            self._send_json(400, {"error": "bad_body_size", "bytes": length})
            return
        try:
            body = json.loads(self.rfile.read(length).decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError) as e:
            self._send_json(400, {"error": "bad_json", "detail": str(e)})
            return

        text = (body.get("text") or "").strip()
        if not text:
            self._send_json(400, {"error": "empty_text"})
            return
        if len(text) > MAX_TEXT_LEN:
            self._send_json(400, {
                "error": "text_too_long",
                "max": MAX_TEXT_LEN,
                "got": len(text),
            })
            return
        lang = (body.get("lang") or "kk").lower()
        if lang not in self.voices:
            self._send_json(400, {
                "error": "unsupported_lang",
                "lang": lang,
                "supported": list(self.voices.keys()),
            })
            return

        voice = self.voices[lang]
        audio_dir = self.audio_dirs[lang]
        h = word_hash(text)
        out = audio_dir / f"{h}.wav"

        stats = _stats[lang]
        # A real WAV from Piper is ≥ 10 KB at 22 kHz mono. Anything
        # smaller is a truncated artifact from a previous failed run
        # — overwrite it instead of returning a broken file as a
        # cache hit.
        cached = out.exists() and out.stat().st_size >= 10_000
        if cached:
            stats["hits"] += 1
        else:
            stats["misses"] += 1
            try:
                synth_one(voice, text, out)
            except Exception as e:
                stats["failures"] += 1
                latency_ms = int((time.time() - t0) * 1000)
                self._log("FAIL", lang, h, text, cached, latency_ms, str(e))
                self._send_json(422, {
                    "error": "synth_failed",
                    "detail": str(e),
                })
                return

        latency_ms = int((time.time() - t0) * 1000)
        self._log("OK", lang, h, text, cached, latency_ms)
        self._send_json(200, {
            "hash": h,
            "url": f"/audio/{lang}/{h}.wav",
            "lang": lang,
            "cached": cached,
            "latency_ms": latency_ms,
        })

    def _send_json(self, code: int, payload: dict) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _log(self, status: str, lang: str, h: str, text: str, cached: bool,
             latency_ms: int, detail: str = "") -> None:
        # Fixed format for grep-ability:
        #   [tts-service] 2026-08-17 20:01:34.123 OK  kk hash=de73... cached=hit  latency=312ms text="сәлем"
        ts = time.strftime("%Y-%m-%d %H:%M:%S", time.gmtime()) + f".{int((time.time() % 1) * 1000):03d}"
        text_esc = text.replace("\\", "\\\\").replace('"', '\\"')
        if len(text_esc) > 40:
            text_esc = text_esc[:37] + "…"
        line = (
            f"[tts-service] {ts} {status} "
            f"{lang} hash={h} cached={'hit' if cached else 'miss'} "
            f"latency={latency_ms}ms text=\"{text_esc}\""
        )
        if detail:
            line += f" detail=\"{detail}\""
        print(line, flush=True)


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--audio-root", default="/audio",
                   help="Bind-mounted audio root; per-language subdirs are appended.")
    p.add_argument("--host", default="0.0.0.0",
                   help="HTTP bind address.")
    p.add_argument("--port", type=int, default=8000,
                   help="HTTP bind port.")
    args = p.parse_args()

    audio_root = Path(args.audio_root)

    voices: dict[str, PiperVoice] = {}
    audio_dirs: dict[str, Path] = {}
    for lang, spec in LANGUAGES.items():
        model_path = Path(spec["model"])
        config_path = model_path.with_suffix(".onnx.json")
        audio_dir = audio_root / spec["subdir"]
        audio_dir.mkdir(parents=True, exist_ok=True)

        if not model_path.exists():
            print(f"ERROR: model not found at {model_path}", file=sys.stderr)
            return 1
        if not config_path.exists():
            print(f"ERROR: config not found at {config_path}", file=sys.stderr)
            return 1

        print(f"[tts-service] loading model {model_path.name} "
              f"({model_path.stat().st_size // 1024 // 1024} MB)", flush=True)
        t0 = time.time()
        voices[lang] = PiperVoice.load(str(model_path), str(config_path))
        audio_dirs[lang] = audio_dir
        print(f"[tts-service] {lang} loaded in {time.time() - t0:.1f}s, "
              f"sample rate = {voices[lang].config.sample_rate} Hz", flush=True)

    print(f"[tts-service] audio root = {audio_root}", flush=True)
    print(f"[tts-service] listening on {args.host}:{args.port}", flush=True)

    TTSHandler.voices = voices
    TTSHandler.audio_dirs = audio_dirs

    # ThreadingHTTPServer so concurrent requests don't serialize.
    # Piper synthesis is CPU-bound; on a single core the GIL lets
    # Python still make progress, but real parallelism would need
    # a process pool. For our workload (one user, one card at a
    # time) threading is fine.
    server = ThreadingHTTPServer((args.host, args.port), TTSHandler)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("[tts-service] shutting down", flush=True)
    finally:
        server.server_close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
