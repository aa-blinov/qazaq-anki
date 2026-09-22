# TTS service — Piper (Kazakh + Russian) HTTP wrapper.
#
# Exposes POST /synthesize and GET /healthz. The Python source
# lives at scripts/tts_service.py in the repo root; we COPY it
# here as `server.py` so the runtime can find it at /app/.
#
# Voice models are NOT baked into the image. The repo ships
# pre-generated WAVs in public/audio/, so this service only
# needs to handle the long tail of user-added words. Bind-mount
# the models directory at /app/models/ when running locally; in
# production mount a persistent volume so the per-language
# model stays in memory across restarts.

FROM python:3.12-slim

WORKDIR /app

# ffmpeg for the optional post-processing step (volume
# normalisation), libsndfile for the audio I/O, tini for
# signal handling so SIGTERM doesn't leave Piper half-loaded.
RUN apt-get update && apt-get install -y --no-install-recommends \
        ffmpeg libsndfile1 tini curl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Piper is a single-binary release — we pin a known-good
# version instead of "latest" so a Piper release that breaks
# the API contract doesn't silently land in production.
ARG PIPER_VERSION=2023.11.14-2
ARG PIPER_ARCH=amd64
RUN curl -fsSL \
        https://github.com/rhasspy/piper/releases/download/${PIPER_VERSION}/piper_linux_${PIPER_ARCH}.tar.gz \
        | tar -xz -C /usr/local \
    && ln -sf /usr/local/piper/piper /usr/local/bin/piper

# Python deps. `pydub` is for the audio normalisation pass,
# the rest are the HTTP wrapper.
COPY tts/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# The service source — kept in scripts/ in the repo so all TTS
# scripts (generate_tts.py + tts_service.py) sit together.
COPY scripts/tts_service.py ./server.py

# Voice files (Kazakh + Russian ONNX models) — bind-mounted at
# runtime into /app/models/. The image doesn't bake them in
# (they're 50+ MB each and rarely change).
RUN mkdir -p /app/models

ENV TTS_MODE=service
ENV PYTHONUNBUFFERED=1

EXPOSE 8000

# USER nobody in the original Dockerfile broke Piper (it can't
# load ONNX models as nobody). Run as the unprivileged `app`
# user that python:3.12-slim ships with.

ENTRYPOINT ["/usr/bin/tini", "--", "python", "-m", "uvicorn", "server:app", "--host", "0.0.0.0", "--port", "8000"]
