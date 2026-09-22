#!/bin/sh
# TTS service entrypoint — fetch Piper voice models on first
# start, then hand off to the HTTP server.
#
# Idempotent: download_tts_models.py skips files that already
# exist at /app/models/. On a restart the models are already
# there (bind-mounted as a Docker volume in production), so the
# download step is a near-no-op.
set -eu

MODELS_DIR="${TTS_MODELS_DIR:-/app/models}"
echo "[tts-entrypoint] preparing voice models in ${MODELS_DIR}…"
# `|| true` so a download outage doesn't kill the service —
# /synthesize will return 503 instead.
python /app/download_tts_models.py \
    --target "${MODELS_DIR}" \
    --lang all \
    || echo "[tts-entrypoint] WARNING: model download failed; service will start but /synthesize will 503 until models are present"

echo "[tts-entrypoint] starting TTS HTTP server on :8000"
exec python server.py
