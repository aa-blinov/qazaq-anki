# TTS service — Piper (Kazakh + Russian) HTTP wrapper.
#
# Exposes POST /synthesize and GET /healthz. The Python source
# lives at scripts/tts_service.py in the repo root; we COPY it
# here as `server.py` so the runtime can find it at /app/.
#
# Voice models are NOT baked into the image. The repo ships
# pre-generated WAVs in public/audio/, so this service only
# needs to handle the long tail of user-added words. On first
# start we run scripts/download_tts_models.py to fetch the two
# Piper ONNX models into /app/models/ (mounted as a persistent
# volume in production so subsequent restarts skip the
# download).
#
# Why lazy-download instead of baking models at build time:
#   - Image stays ~400 MB vs ~520 MB with models.
#   - Faster `docker compose build` (~30s vs ~3min).
#   - Voice updates land without rebuilding the image.

FROM python:3.12-slim

WORKDIR /app

# ffmpeg for the optional post-processing step (volume
# normalisation), libsndfile for the audio I/O, tini for
# signal handling so SIGTERM doesn't leave Piper half-loaded.
RUN apt-get update && apt-get install -y --no-install-recommends \
        ffmpeg libsndfile1 tini curl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Python deps. `pydub` is for the audio normalisation pass,
# the rest are the HTTP wrapper.
COPY tts/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# The service source — kept in scripts/ in the repo so all TTS
# scripts (generate_tts.py + tts_service.py + download_tts_models.py)
# sit together.
COPY scripts/tts_service.py ./server.py
COPY scripts/download_tts_models.py ./download_tts_models.py

# Voice files (Kazakh + Russian ONNX models) — bind-mounted at
# runtime into /app/models/, or populated on first start by
# the entrypoint.
RUN mkdir -p /app/models

ENV TTS_MODE=service
ENV PYTHONUNBUFFERED=1
# Bind-mount /app/models/ on the host (docker-compose volume) so
# the download survives restarts.

# Two-step entrypoint:
#   1. download_tts_models.py — idempotent, fetches missing files
#      from HuggingFace on first start. Subsequent restarts see
#      the files already there and skip the download.
#   2. uvicorn server:app — the actual HTTP service.
#
# Step 1 is wrapped in `|| true` so a download failure (HF outage,
# bad URL) doesn't prevent the service from starting — healthz
# will still come up and /synthesize will return 503 with a
# "model unavailable" error. Better to limp than to crash.
COPY tts/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 8000

ENTRYPOINT ["/usr/bin/tini", "--", "/entrypoint.sh"]
