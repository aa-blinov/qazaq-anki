# TTS service — Piper (Kazakh + Russian) HTTP wrapper. Same
# image shape as the API: a single Python process exposing
# /synthesize and /voices. The audio chunks are written to a
# shared volume (/audio) that nginx also mounts read-only,
# so the API can stream the WAVs without proxying through
# TTS.

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
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Voice files (Kazakh + Russian ONNX models). The repo
# vendors these in tts/voices/ so the build is reproducible
# without hitting the HuggingFace mirror at build time.
COPY voices/ ./voices/

COPY server.py ./

ENV TTS_MODE=service
ENV PYTHONUNBUFFERED=1

EXPOSE 8000

USER nobody

ENTRYPOINT ["/usr/bin/tini", "--", "python", "-m", "uvicorn", "server:app", "--host", "0.0.0.0", "--port", "8000"]
